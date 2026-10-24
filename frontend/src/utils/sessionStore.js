/**
 * sessionStore.js
 * 
 * Resilient Client-Side Session & Document Persistence for XBuddy.
 * 
 * Solves mobile app switching state loss (e.g. when students switch to PhonePe,
 * Google Pay, or Paytm and the mobile OS discards or reloads the browser tab).
 * 
 * Architecture:
 * 1. IndexedDB: Durably stores the raw PDF Blob, original file Blob, and document metadata.
 * 2. Session Storage & LocalStorage: Durably stores print settings, active order ID,
 *    calculated price, absolute expiry timestamp, and checkout UI step.
 * 3. Lifecycle Listeners: Flushes state on 'visibilitychange' (hidden) and 'pagehide',
 *    and reconciles state on 'pageshow' and app remount.
 */

const DB_NAME = 'xbuddy_session_db'
const DB_VERSION = 1
const STORE_NAME = 'session_files'
const PDF_KEY = 'active_pdf'
const SESSION_STORAGE_KEY = 'xbuddy_active_print_session'

// Default session expiry (15 minutes of inactivity or order checkout window)
export const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000

// ─── 1. Native IndexedDB Helper ─────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

/**
 * Saves the active PDF file/blob and its metadata to IndexedDB.
 * Safe for large files (up to browser quota, easily handling 100MB+).
 */
export async function saveActivePdf(pdfBlob, metadata = {}, originalFileBlob = null) {
  if (!pdfBlob) return false

  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      const payload = {
        pdfBlob,
        originalFileBlob: originalFileBlob || null,
        metadata: {
          name: metadata.name || 'document.pdf',
          size: metadata.size || '',
          totalPages: Number(metadata.totalPages) || 1,
          thumbnail: metadata.thumbnail || null,
          typeInfo: metadata.typeInfo || { label: 'PDF', icon: 'FileText', category: 'document' },
          requiresAgent: Boolean(metadata.requiresAgent),
          isTourSample: Boolean(metadata.isTourSample),
          reprintOrderId: metadata.reprintOrderId || null,
          isReprint: Boolean(metadata.isReprint),
        },
        savedAt: Date.now(),
      }

      const req = store.put(payload, PDF_KEY)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[SessionStore] saveActivePdf warning:', err)
    return false
  }
}

/**
 * Retrieves the persisted PDF file/blob and metadata from IndexedDB.
 */
export async function getActivePdf() {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(PDF_KEY)

      req.onsuccess = () => {
        const result = req.result
        if (!result || !result.pdfBlob) {
          resolve(null)
          return
        }
        resolve(result)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[SessionStore] getActivePdf warning:', err)
    return null
  }
}

/**
 * Deletes the persisted PDF from IndexedDB.
 */
export async function clearActivePdf() {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(PDF_KEY)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[SessionStore] clearActivePdf warning:', err)
    return false
  }
}

// ─── 2. Session State Persistence (LocalStorage / SessionStorage) ───────────

/**
 * Persists the entire active printing session snapshot.
 * Synchronous and immediate so it can be called right before external app launching.
 */
export function saveSessionState(state) {
  if (typeof window === 'undefined') return false

  try {
    const current = getSessionState() || {}
    const snapshot = {
      ...current,
      ...state,
      updatedAt: Date.now(),
    }

    const serialized = JSON.stringify(snapshot)
    window.localStorage.setItem(SESSION_STORAGE_KEY, serialized)
    return true
  } catch (err) {
    console.warn('[SessionStore] saveSessionState warning:', err)
    return false
  }
}

/**
 * Retrieves the current persisted session snapshot.
 */
export function getSessionState() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch (err) {
    console.warn('[SessionStore] getSessionState parse error:', err)
    return null
  }
}

/**
 * Checks whether the current session is expired based on absolute timestamp.
 */
export function isSessionExpired(session) {
  if (!session) return true

  // If checkout countdown expiry exists, use it
  if (session.expiresAt) {
    return Date.now() > Number(session.expiresAt)
  }

  // Otherwise check general session TTL
  const lastActive = session.updatedAt || session.createdAt || 0
  return (Date.now() - lastActive) > DEFAULT_SESSION_TTL_MS
}

/**
 * Clears the session snapshot.
 */
export function clearSessionState() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {}
}

/**
 * Clears the entire session (both IndexedDB PDF file and session state).
 */
export async function clearEntireSession() {
  clearSessionState()
  await clearActivePdf()
}

// ─── 3. Session Reconciliation with Server ──────────────────────────────────

/**
 * Reconciles the client session with backend server order status.
 * Returns { restored: boolean, isPaid: boolean, isExpired: boolean, order: object | null }
 */
export async function reconcileSessionWithBackend(orderId) {
  if (!orderId) return { restored: false }

  try {
    const res = await fetch(`/api/payments/order-status?orderId=${encodeURIComponent(orderId)}`, {
      signal: AbortSignal.timeout(6000),
    })

    if (res.ok) {
      const data = await res.json()
      const isPaid = Boolean(data.isPaid || data.paymentStatus === 'paid' || data.paymentStatus === 'verified')
      return {
        restored: true,
        isPaid,
        paymentStatus: data.paymentStatus || 'pending',
        order: data,
      }
    }
  } catch (err) {
    console.warn('[SessionStore] Reconciliation network notice:', err.message)
  }

  return { restored: false }
}
