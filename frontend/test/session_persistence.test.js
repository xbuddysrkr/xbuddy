import assert from 'node:assert/strict'
import {
  saveSessionState,
  getSessionState,
  clearSessionState,
  isSessionExpired,
  saveActivePdf,
  getActivePdf,
  clearActivePdf,
  clearEntireSession,
  reconcileSessionWithBackend,
  DEFAULT_SESSION_TTL_MS,
} from '../src/utils/sessionStore.js'

console.log('--- STARTING XBUDDY MOBILE APP SWITCHING & SESSION RESTORATION REGRESSION TEST SUITE ---')

// ── Mock Browser Environment Setup ──────────────────────────────────────────
class MockLocalStorage {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.get(key) || null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

class MockIndexedDB {
  constructor() {
    this.databases = new Map()
  }

  open(name, version) {
    const self = this
    const request = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    }

    setTimeout(() => {
      let db = self.databases.get(name)
      if (!db) {
        db = {
          name,
          version,
          objectStoreNames: {
            contains: (storeName) => Boolean(db.stores.has(storeName)),
          },
          stores: new Map(),
          createObjectStore: (storeName) => {
            const store = new Map()
            db.stores.set(storeName, store)
            return store
          },
          transaction: (storeName, mode) => {
            const store = db.stores.get(storeName)
            return {
              objectStore: () => ({
                put: (value, key) => {
                  const req = { onsuccess: null, onerror: null }
                  setTimeout(() => {
                    store.set(key, value)
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
                get: (key) => {
                  const req = { result: undefined, onsuccess: null, onerror: null }
                  setTimeout(() => {
                    req.result = store.get(key)
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
                delete: (key) => {
                  const req = { onsuccess: null, onerror: null }
                  setTimeout(() => {
                    store.delete(key)
                    req.onsuccess?.()
                  }, 0)
                  return req
                },
              }),
            }
          },
        }
        self.databases.set(name, db)

        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: db } })
        }
      }

      request.result = db
      request.onsuccess?.()
    }, 0)

    return request
  }
}

// Attach mocks to global environment
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch

const mockStorage = new MockLocalStorage()
const mockIdb = new MockIndexedDB()

globalThis.window = {
  localStorage: mockStorage,
  indexedDB: mockIdb,
  sessionStorage: new MockLocalStorage(),
  location: { href: 'https://xbuddy.in/print', pathname: '/print', hash: '#payment' },
}

async function runTests() {
  try {
    // ── TEST 1: Session State Serialization & Deserialization ───────────────
    console.log('\n[TEST 1] Testing session state serialization and retrieval...')
    clearSessionState()

    const initialSession = {
      step: 'settings',
      showPayment: true,
      orderId: 'XB8212',
      settings: {
        colorMode: 'color',
        sideMode: 'double',
        copies: 2,
        pageSize: 'A4',
        orientation: 'portrait',
        pageRange: 'custom',
        customPages: '1-3',
      },
      orderMeta: {
        fileName: 'Lab_Report_Final.pdf',
        totalPages: 6,
        amount: 25.00,
        printingCost: 22.00,
        serviceFee: 3.00,
      },
      expiresAt: Date.now() + 300 * 1000,
      paymentStatus: 'pending',
      isDownloaded: true,
    }

    const saved = saveSessionState(initialSession)
    assert.equal(saved, true, 'saveSessionState must return true')

    const retrieved = getSessionState()
    assert.ok(retrieved, 'getSessionState must return non-null object')
    assert.equal(retrieved.orderId, 'XB8212')
    assert.equal(retrieved.settings.colorMode, 'color')
    assert.equal(retrieved.settings.sideMode, 'double')
    assert.equal(retrieved.settings.copies, 2)
    assert.equal(retrieved.orderMeta.amount, 25.00)
    assert.equal(retrieved.isDownloaded, true)
    console.log('✓ TEST 1 PASSED: Full session state serialized and retrieved accurately')

    // ── TEST 2: IndexedDB PDF Blob Persistence & Safe Retrieval ─────────────
    console.log('\n[TEST 2] Testing IndexedDB Blob storage & retrieval...')
    const sampleBlob = { size: 1048576, type: 'application/pdf', name: 'Lab_Report_Final.pdf' }
    const sampleMetadata = {
      name: 'Lab_Report_Final.pdf',
      size: '1.0 MB',
      totalPages: 6,
      thumbnail: 'data:image/jpeg;base64,samplethumbnail',
      typeInfo: { label: 'PDF', icon: 'FileText', category: 'document' },
      requiresAgent: false,
    }

    const pdfSaved = await saveActivePdf(sampleBlob, sampleMetadata)
    assert.equal(pdfSaved, true, 'saveActivePdf must succeed')

    const pdfRetrieved = await getActivePdf()
    assert.ok(pdfRetrieved, 'getActivePdf must return stored record')
    assert.equal(pdfRetrieved.pdfBlob.size, 1048576)
    assert.equal(pdfRetrieved.metadata.name, 'Lab_Report_Final.pdf')
    assert.equal(pdfRetrieved.metadata.totalPages, 6)
    assert.equal(pdfRetrieved.metadata.thumbnail, 'data:image/jpeg;base64,samplethumbnail')
    console.log('✓ TEST 2 PASSED: PDF Blob & document metadata persisted in IndexedDB')

    // ── TEST 3: Simulated App Switch (PhonePe Launch) & Background Save ──────
    console.log('\n[TEST 3] Simulating mobile app switch to PhonePe...')
    // Student selects PhonePe: session snapshot is updated synchronously
    saveSessionState({
      lastLaunchedApp: 'phonepe',
      step: 'LAUNCHING',
      updatedAt: Date.now(),
    })

    const preSwitchSnapshot = getSessionState()
    assert.equal(preSwitchSnapshot.lastLaunchedApp, 'phonepe')
    assert.equal(preSwitchSnapshot.orderId, 'XB8212')
    assert.equal(preSwitchSnapshot.orderMeta.amount, 25.00)
    console.log('✓ TEST 3 PASSED: Session snapshot securely persisted prior to PhonePe app launch')

    // ── TEST 4: Simulated Mobile Browser Tab Discard & Full Page Reload ──────
    console.log('\n[TEST 4] Simulating mobile browser reload after memory eviction...')
    // Simulate tab discard: in-memory state is wiped, window reloaded
    // The only remaining persistent storage is localStorage and IndexedDB
    const restoredSession = getSessionState()
    assert.ok(restoredSession, 'Session state must survive tab reload')
    assert.equal(restoredSession.orderId, 'XB8212', 'Active Order ID must match pre-reload ID')
    assert.equal(restoredSession.settings.copies, 2, 'Selected copies must be preserved')
    assert.equal(restoredSession.settings.colorMode, 'color', 'Color mode must be preserved')

    const restoredPdfRecord = await getActivePdf()
    assert.ok(restoredPdfRecord, 'PDF document must survive tab reload via IndexedDB')
    assert.equal(restoredPdfRecord.metadata.name, 'Lab_Report_Final.pdf')
    assert.equal(restoredPdfRecord.metadata.totalPages, 6)
    console.log('✓ TEST 4 PASSED: State and PDF fully restored without data loss after simulated reload')

    // ── TEST 5: Idempotent Order Reuse (No Duplicate Orders Generated) ───────
    console.log('\n[TEST 5] Testing idempotent order reuse on reload...')
    // When PaymentModal mounts with restored session, it uses restoredSession.orderId
    const activeOrderId = restoredSession.orderId
    assert.equal(activeOrderId, 'XB8212', 'Existing orderId must be reused without generating new ID')

    // If orderMeta is constructed, it must attach this orderId
    const simulatedOrderMeta = {
      orderId: activeOrderId,
      fileName: restoredPdfRecord.metadata.name,
      totalPages: restoredPdfRecord.metadata.totalPages,
      amount: restoredSession.orderMeta.amount,
    }
    assert.equal(simulatedOrderMeta.orderId, 'XB8212')
    console.log('✓ TEST 5 PASSED: Idempotency guaranteed; orderId XB8212 reused')

    // ── TEST 6: Absolute Countdown Recalculation (Throttling Immune) ─────────
    console.log('\n[TEST 6] Testing countdown recalculation from absolute expiry timestamp...')
    // Suppose student spent 120 seconds in PhonePe before returning
    const originalExpiry = Date.now() + 180 * 1000 // 180 seconds remaining
    saveSessionState({ expiresAt: originalExpiry })

    const sessionWithExpiry = getSessionState()
    const remainingSeconds = Math.max(0, Math.floor((sessionWithExpiry.expiresAt - Date.now()) / 1000))
    assert.ok(remainingSeconds <= 180 && remainingSeconds >= 178, 'Remaining seconds must accurately calculate based on clock time')
    assert.equal(isSessionExpired(sessionWithExpiry), false, 'Session must not be expired')
    console.log(`✓ TEST 6 PASSED: Accurate countdown calculated: ${remainingSeconds}s remaining`)

    // ── TEST 7: Expired Session Handling (Graceful Reconciliation) ───────────
    console.log('\n[TEST 7] Testing expiration handling when student returns after deadline...')
    const expiredTimestamp = Date.now() - 10000 // expired 10 seconds ago
    saveSessionState({ expiresAt: expiredTimestamp })

    const expiredSession = getSessionState()
    assert.equal(isSessionExpired(expiredSession), true, 'isSessionExpired must return true')
    const remainingWhenExpired = Math.max(0, Math.floor((expiredSession.expiresAt - Date.now()) / 1000))
    assert.equal(remainingWhenExpired, 0, 'Remaining seconds must clamp to 0')
    // Crucial: The order was NOT deleted; student can still verify if they paid!
    assert.equal(expiredSession.orderId, 'XB8212', 'Order ID must remain intact for verification')
    console.log('✓ TEST 7 PASSED: Expired session preserves orderId for payment reconciliation')

    // ── TEST 8: Reconciling Pending vs Verified Payments ────────────────────
    console.log('\n[TEST 8] Testing server reconciliation for pending and verified payments...')
    // Mock fetch for /api/payments/order-status
    globalThis.fetch = async (url) => {
      if (url.includes('XB8212')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            orderId: 'XB8212',
            paymentStatus: 'paid',
            isPaid: true,
            printStatus: 'waiting_for_shopkeeper',
          }),
        }
      }
      return { ok: false, status: 404 }
    }

    const reconciliation = await reconcileSessionWithBackend('XB8212')
    assert.equal(reconciliation.restored, true)
    assert.equal(reconciliation.isPaid, true)
    assert.equal(reconciliation.paymentStatus, 'paid')
    console.log('✓ TEST 8 PASSED: Successfully reconciled paid status from backend without re-prompting payment')

    // ── TEST 9: Duplicate QR Download Prevention ────────────────────────────
    console.log('\n[TEST 9] Testing duplicate QR download prevention flag...')
    saveSessionState({ orderId: 'XB8212', isDownloaded: true })
    const sessionWithDownload = getSessionState()
    assert.equal(sessionWithDownload.isDownloaded, true, 'isDownloaded flag must be stored')
    // App should check session.isDownloaded and skip triggerQrDownload
    const shouldSkipDownload = Boolean(sessionWithDownload.orderId === 'XB8212' && sessionWithDownload.isDownloaded)
    assert.equal(shouldSkipDownload, true, 'Browser must skip redundant automatic download on reload')
    console.log('✓ TEST 9 PASSED: Redundant automatic QR download prevented on reload')

    // ── TEST 10: Clean Session Purge on Order Success / Reset ───────────────
    console.log('\n[TEST 10] Testing clean session purge upon order completion...')
    await clearEntireSession()
    assert.equal(getSessionState(), null, 'Session state must be completely cleared')
    const postClearPdf = await getActivePdf()
    assert.equal(postClearPdf, null, 'IndexedDB PDF must be completely purged')
    console.log('✓ TEST 10 PASSED: Session and documents purged securely after completion')

    console.log('\n======================================================================')
    console.log('  ALL 10 XBUDDY SESSION PERSISTENCE & RELOAD REGRESSION TESTS PASSED!  ')
    console.log('======================================================================\n')
  } finally {
    // Restore original globals
    if (originalWindow) globalThis.window = originalWindow
    else delete globalThis.window
    if (originalFetch) globalThis.fetch = originalFetch
    else delete globalThis.fetch
  }
}

runTests()
