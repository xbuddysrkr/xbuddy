import { PDFDocument } from 'pdf-lib'

const API_URL    = import.meta.env?.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbxUpE5_E3KmhcD0yIuodtGQyOqxpSnps6Ra6_64rdMTYTPughmzyMKm7P3n_JjM2KqF/exec'
const LOCAL_API  = import.meta.env?.VITE_PRINT_AGENT_URL || 'http://127.0.0.1:3001'
const GITHUB_RAW = import.meta.env?.VITE_GITHUB_TUNNEL_URL || 'https://raw.githubusercontent.com/xbuddysrkr/xbuddy/main/public/tunnel-url.txt'
const API_KEY    = import.meta.env?.VITE_API_KEY || 'e7a2b91c045f8e3291dc8f7514a60b9380fa0715cb38d97e41ac824b01e3264b'
const BACKEND_URL = (import.meta.env?.VITE_BACKEND_URL || import.meta.env?.VITE_API_URL || 'https://xbuddy.onrender.com').replace(/\/$/, '')
const ORDERS_ENDPOINT = `${BACKEND_URL}/api/orders`

let _tunnelUrl = null
let _tunnelFetchedAt = 0
const TUNNEL_TTL = 3 * 60 * 1000

async function isTunnelAlive(url) {
  if (!url || !url.startsWith('https://')) return false
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const data = await res.json()
      return !!data?.success
    }
  } catch {}
  return false
}

async function getTunnelUrl() {
  const now = Date.now()
  if (_tunnelUrl && (now - _tunnelFetchedAt) < TUNNEL_TTL) return _tunnelUrl

  // 1. First, check Google Apps Script tunnel registry (most up-to-date in real-time)
  try {
    const res = await fetch(`${API_URL}?action=getTunnelUrl&key=${API_KEY}`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data = await res.json()
      if (data?.url?.startsWith('https://') && await isTunnelAlive(data.url)) {
        _tunnelUrl = data.url
        _tunnelFetchedAt = now
        return _tunnelUrl
      }
    }
  } catch {}

  // 2. Check local print agent directly if on localhost
  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocalHost) {
    try {
      const res = await fetch(`${LOCAL_API}/tunnel-url`, { signal: AbortSignal.timeout(500) })
      if (res.ok) {
        const data = await res.json()
        if (data?.url?.startsWith('https://') && await isTunnelAlive(data.url)) {
          _tunnelUrl = data.url
          _tunnelFetchedAt = now
          return _tunnelUrl
        }
      }
    } catch {}
  }

  // 3. Fallback to GitHub raw URLs with liveness verification
  const githubUrls = [
    GITHUB_RAW,
    'https://raw.githubusercontent.com/xbuddysrkr/xbuddy/main/public/tunnel-url.txt',
    'https://raw.githubusercontent.com/xbuddysrkr/xbuddy/main/frontend/public/tunnel-url.txt',
  ].filter(Boolean)

  for (const url of githubUrls) {
    try {
      const res = await fetch(`${url}?t=${now}`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const text = (await res.text()).trim()
        if (text.startsWith('https://') && await isTunnelAlive(text)) {
          _tunnelUrl = text
          _tunnelFetchedAt = now
          return _tunnelUrl
        }
      }
    } catch {}
  }

  _tunnelUrl = null
  return null
}

async function gasGet(params) {
  try {
    const searchParams = new URLSearchParams({ key: API_KEY, ...params })
    const res = await fetch(`${API_URL}?${searchParams.toString()}`)
    return await res.json()
  } catch { return null }
}

async function localGet(path) {
  try {
    const res = await fetch(`${LOCAL_API}${path}`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function uploadPdfViaGas(orderId, fileName, pdfBase64) {
  // Use 50KB chunks to stay safely under Google Apps Script CacheService 100KB limit
  const CHUNK_SIZE = 50 * 1024
  const total = Math.ceil(pdfBase64.length / CHUNK_SIZE)
  for (let i = 0; i < total; i++) {
    const chunk = pdfBase64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveChunk',
        key: API_KEY,
        fileId: orderId,
        fileType: 'pdf',
        index: String(i),
        total: String(total),
        chunk,
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`Chunk ${i} failed`)
    const data = await res.json()
    if (!data?.success) throw new Error(`Chunk ${i} rejected: ${data?.error || ''}`)
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'assemblePdf',
      key: API_KEY,
      fileId: orderId,
      fileName,
      mimeType: 'application/pdf',
    }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json()
  if (!data?.success || !data?.fileUrl) throw new Error(`Assembly failed: ${data?.error || ''}`)
  return data.fileUrl
}

// Send full order payload to agent endpoint
async function postToAgent(baseUrl, orderId, orderData, printSettings) {
  const res = await fetch(`${baseUrl}/save-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      fileName:         orderData.fileName,
      pdfBase64:        orderData.pdfBase64 || '',
      screenshotBase64: orderData.screenshotBase64 || '',
      ...printSettings,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return false
  const data = await res.json()
  return !!data?.success
}

export function isHtmlResponse(text, contentType = '') {
  if (!text || typeof text !== 'string') return false
  const lowerCt = String(contentType || '').toLowerCase()
  if (lowerCt.includes('text/html') || lowerCt.includes('application/xhtml+xml')) return true
  const lowerText = text.slice(0, 500).toLowerCase().trim()
  return (
    lowerText.startsWith('<!doctype') ||
    lowerText.startsWith('<html') ||
    lowerText.includes('<head') ||
    lowerText.includes('<body') ||
    lowerText.includes('/assets/main-') ||
    lowerText.includes('/assets/booth-') ||
    lowerText.includes('__next') ||
    lowerText.includes('vite')
  )
}

function getCandidateOrdersEndpoints() {
  const endpoints = [
    'https://xbuddy.onrender.com/api/orders',
    ORDERS_ENDPOINT,
  ]
  return [...new Set(endpoints.filter(Boolean))]
}

export async function getOrderStatus(orderId) {
  if (!orderId) return null
  const cleanId = String(orderId).trim().toUpperCase()

  // 1. PRIMARY & AUTHORITATIVE READ: Canonical Serverless Orders API (MongoDB Atlas)
  const endpoints = getCandidateOrdersEndpoints()
  let hasTimeoutOrNetworkError = false
  let lastErrorMessage = ''

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?action=getOrderStatus&orderId=${cleanId}`, {
        signal: AbortSignal.timeout(15000),
      })

      const contentType = res.headers.get('content-type') || ''
      const text = await res.text()

      // Skip HTML responses (e.g. Vercel SPA rewrite fallback or proxy misconfiguration)
      if (isHtmlResponse(text, contentType)) {
        hasTimeoutOrNetworkError = true
        lastErrorMessage = `Received HTML response from ${endpoint} instead of JSON`
        continue
      }

      let data = null
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        hasTimeoutOrNetworkError = true
        lastErrorMessage = `Malformed JSON from ${endpoint}: ${parseErr.message}`
        continue
      }

      // Outcome 1 (HTTP 200): Order returned and verified from authoritative MongoDB
      if (res.status === 200 && data?.success && (data?.order || data?.fileName)) {
        const ord = data.order || data
        return {
          ...data,
          ...ord,
          orderId: ord.orderId || cleanId,
          printStatus: ord.printStatus || data.printStatus || 'waiting_for_shopkeeper',
          paymentStatus: ord.paymentStatus || data.paymentStatus || 'pending',
          verifiedInMongo: true,
          verified: true,
          notFound: false,
          unavailable: false,
          source: 'mongo',
        }
      }

      // Outcome 2 (HTTP 404): Authoritative database definitively confirms order does not exist
      if (res.status === 404 || data?.notFound || data?.error === 'Order not found') {
        return {
          success: false,
          error: `Order ${cleanId} not found in authoritative database. Check the Order ID.`,
          notFound: true,
          unavailable: false,
          verifiedInMongo: false,
        }
      }

      // Outcome 3 (HTTP 503 / 5xx): Database / service temporarily unavailable
      if (res.status >= 500 || data?.unavailable) {
        hasTimeoutOrNetworkError = true
        lastErrorMessage = data?.error || 'Database service temporarily unavailable'
      }
    } catch (err) {
      console.warn(`[getOrderStatus] Notice on ${endpoint}:`, err.message)
      hasTimeoutOrNetworkError = true
      lastErrorMessage = err.message
    }
  }

  // CRITICAL ARCHITECTURAL CONTRACT: NEVER convert timeouts, network failures, or 5xx into "not found"
  return {
    success: false,
    error: 'Unable to verify order right now. Please retry.',
    unavailable: true,
    notFound: false,
    verifiedInMongo: false,
    details: lastErrorMessage || 'Network verification timeout',
  }
}

export async function fetchAdminOrders() {
  const orderMap = new Map()

  // 1. PRIMARY & AUTHORITATIVE READ: Serverless Orders API (MongoDB Atlas)
  let ordersList = null
  const endpoints = getCandidateOrdersEndpoints()
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?action=listOrders`, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const text = await res.text()
        if (isHtmlResponse(text, res.headers.get('content-type'))) continue
        try {
          const data = JSON.parse(text)
          if (data?.success && Array.isArray(data.orders)) {
            ordersList = data.orders
            break
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`[fetchAdminOrders] Notice for ${endpoint}:`, err.message)
    }
  }

  // Populate map with orders from MongoDB
  if (Array.isArray(ordersList)) {
    for (const o of ordersList) {
      const id = String(o.orderId || o.id || '').trim().toUpperCase()
      if (id) {
        orderMap.set(id, {
          ...o,
          id,
          orderId: id,
          timestamp: o.createdAt || o.timestamp,
          date: o.createdAt ? o.createdAt.split('T')[0] : (o.date || ''),
        })
      }
    }
  }

  // 3. Merge local print agent queue
  try {
    const local = await localGet('/admin/orders')
    if (local?.success && Array.isArray(local.orders)) {
      for (const o of local.orders) {
        const id = String(o.orderId || o.id || '').trim().toUpperCase()
        if (id) {
          const existing = orderMap.get(id) || {}
          orderMap.set(id, {
            ...existing,
            ...o,
            id,
            orderId: id,
          })
        }
      }
    }
  } catch {}

  // 4. Merge tunnel queue if available
  try {
    const tunnelUrl = await getTunnelUrl()
    if (tunnelUrl) {
      const res = await fetch(`${tunnelUrl}/admin/orders`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        if (data?.success && Array.isArray(data.orders)) {
          for (const o of data.orders) {
            const id = String(o.orderId || o.id || '').trim().toUpperCase()
            if (id) {
              const existing = orderMap.get(id) || {}
              orderMap.set(id, {
                ...existing,
                ...o,
                id,
                orderId: id,
              })
            }
          }
        }
      }
    }
  } catch {}

  const merged = Array.from(orderMap.values())
  return { success: true, orders: merged }
}

export async function fetchAdminStats() {
  const local = await localGet('/admin/stats')
  if (local?.success) return local
  return null
}

export async function fetchBoothStatus() {
  return await localGet('/admin/booths') ?? await gasGet({ action: 'getBooths' })
}

export async function fetchHealthStatus() {
  return await localGet('/admin/health') ?? await gasGet({ action: 'getHealth' })
}

export async function boothLogin(pin) {
  // 1. Try Cloud Backend first (allows unlocking from any device or phone)
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/booth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ pin }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) return data
      } else if (res.status === 401) {
        return { success: false, error: 'Wrong PIN. Try again.' }
      }
    } catch {
      // Fall through to tunnel and local agent
    }
  }

  // 2. Try Local Agent directly
  const localEndpoints = ['http://127.0.0.1:3001', 'http://localhost:3001']
  for (const base of localEndpoints) {
    try {
      const res = await fetch(`${base}/booth-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }), signal: AbortSignal.timeout(4000),
      })
      if (res.ok) return await res.json()
    } catch { continue }
  }
  return { success: false, error: 'Could not connect to booth service. Check internet or print agent.' }
}

export async function getAgentStatus() {
  const endpoints = ['http://127.0.0.1:3001', 'http://localhost:3001']
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        const isHealthy =
          Boolean(data) &&
          data.agent === 'online' &&
          data.printer?.available === true &&
          data.printer?.status === 'Ready'
        return {
          available: isHealthy,
          agent: data.agent,
          printer: data.printer,
          stationId: data.stationId,
          cloud: data.cloud,
          raw: data,
          endpoint: base,
        }
      }
    } catch {
      continue
    }
  }
  return { available: false, agent: 'offline', printer: null, raw: null, endpoint: null }
}

export async function isAgentAvailable() {
  const status = await getAgentStatus()
  return status.available
}

export async function validateAndRelease(orderId, options = {}) {
  const endpoints = ['http://127.0.0.1:3001', 'http://localhost:3001']

  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/release-print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, ...options }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json().catch(() => null)
      if (data) return data
    } catch { continue }
  }
  return { success: false, error: 'Could not connect to Hardware Print Agent. Is it running on this PC?' }
}

export async function updateOrderStatus(orderId, printStatus) {
  // 1. Try local print agent first if running
  const endpoints = ['http://127.0.0.1:3001', 'http://localhost:3001']
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/update-order-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, printStatus }),
        signal: AbortSignal.timeout(2500),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.success) {
          // Also sync to serverless dual-write endpoint in background
          fetch(ORDERS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateOrderStatus', orderId, printStatus }),
          }).catch(() => {})
          return data
        }
      }
    } catch {}
  }

  // 2. Update via authoritative serverless endpoint (atomic print release lock in MongoDB)
  const candidateEndpoints = getCandidateOrdersEndpoints()
  for (const endpoint of candidateEndpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateOrderStatus', orderId, printStatus }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const text = await res.text()
        if (isHtmlResponse(text, res.headers.get('content-type'))) continue
        try {
          const data = JSON.parse(text)
          if (data?.success) return data
          return data
        } catch {}
      }
    } catch (err) {
      console.warn(`[updateOrderStatus] Notice on ${endpoint}:`, err.message)
    }
  }

  return { success: false, error: 'Failed to update order status' }
}

export async function updatePaymentStatus(orderId, paymentStatus) {
  const cleanId = String(orderId || '').trim().toUpperCase()
  if (!cleanId) return { success: false, error: 'orderId is required' }

  const endpoints = getCandidateOrdersEndpoints()
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updatePaymentStatus', orderId: cleanId, paymentStatus }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const text = await res.text()
        if (isHtmlResponse(text, res.headers.get('content-type'))) continue
        try {
          const data = JSON.parse(text)
          if (data?.success) return data
        } catch {}
      }
    } catch (err) {
      console.warn(`[updatePaymentStatus] Notice from ${endpoint}:`, err.message)
    }
  }

  return { success: false, error: 'Failed to update payment status in authoritative MongoDB' }
}

export async function submitOrder(orderData, { onStep } = {}) {
  const clientOrderId = orderData.orderId || ('XB' + String(Math.floor(1000 + Math.random() * 9000)))

  const normalizedColor = (orderData.colorMode === 'color' || orderData.printType === 'Color') ? 'color' : 'bw'
  const isDuplex = orderData.duplex === true || orderData.printSide === 'Double'
  const resolvedPaperSize = orderData.paperSize || orderData.pageSize || 'A4'

  const printSettings = {
    copies:            Number(orderData.copies) || 1,
    printSide:         isDuplex ? 'Double' : 'Single',
    duplex:            isDuplex,
    colorMode:         normalizedColor,
    printType:         normalizedColor === 'color' ? 'Color' : 'B&W',
    pageSize:          resolvedPaperSize,
    paperSize:         resolvedPaperSize,
    orientation:       orderData.orientation       || 'portrait',
    pageRange:         orderData.pageRange         || 'all',
    pageRangeMode:     orderData.pageRangeMode     || (orderData.pageRange === 'all' ? 'all' : 'custom'),
    customPages:       orderData.customPages       || '',
    printableCount:    orderData.printableCount    || (orderData.selectedPages ? orderData.selectedPages.length : 1),
    selectedPages:     orderData.selectedPages     || [],
    selectedPageCount: orderData.selectedPageCount || (orderData.selectedPages ? orderData.selectedPages.length : 1),
    printingCost:      orderData.printingCost      || 0,
    serviceFee:        orderData.serviceFee        || 0,
  }

  // ── Step 1: Create authoritative order in MongoDB Atlas ──────────────────
  onStep?.('save_order')
  let orderResult = null
  let orderId = clientOrderId

  // Validate parameters before network calls
  if (!clientOrderId || !orderData.fileName || !orderData.amount) {
    throw { step: 'save_order', reason: 'Invalid order parameters' }
  }

  // Pre-flight PDF validation: order must have a valid PDF (%PDF- header) or Drive URL
  const hasDrive = Boolean(orderData.driveUrl && typeof orderData.driveUrl === 'string' && orderData.driveUrl.trim().startsWith('http'))
  const rawB64 = orderData.pdfBase64
  const hasB64 = Boolean(rawB64 && typeof rawB64 === 'string' && rawB64.length >= 50)

  if (!hasDrive && !hasB64) {
    throw { step: 'upload_file', reason: 'Order must include a valid PDF file or Drive URL' }
  }

  if (hasB64) {
    // Magic header check: %PDF- in Base64 starts with JVBERi0
    if (!rawB64.startsWith('JVBERi0') && !rawB64.slice(0, 10).includes('JVBE')) {
      throw { step: 'upload_file', reason: 'Selected file is not a valid PDF document (missing %PDF- header)' }
    }
  }

  try {
    const orderPayload = {
      action: 'saveOrder',
      orderId: clientOrderId,
      name: orderData.name,
      fileName: orderData.fileName,
      totalPages: Number(orderData.totalPages) || 1,
      copies: Number(printSettings.copies) || 1,
      colorMode: normalizedColor,
      printType: printSettings.printType,
      printSide: printSettings.printSide,
      duplex: isDuplex,
      pageSize: resolvedPaperSize,
      paperSize: resolvedPaperSize,
      orientation: printSettings.orientation,
      amount: Number(orderData.amount) || 0,
      printingCost: Number(orderData.printingCost) || 0,
      serviceFee: Number(orderData.serviceFee) || 0,
      digitalProcessingFee: Number(orderData.digitalProcessingFee || orderData.serviceFee) || 0,
      transactionId: orderData.transactionId,
      pageRange: printSettings.pageRange,
      pageRangeMode: printSettings.pageRangeMode,
      customPages: printSettings.customPages,
      printableCount: printSettings.printableCount,
      selectedPages: printSettings.selectedPages,
      selectedPageCount: printSettings.selectedPageCount,
      printStatus: 'waiting_for_shopkeeper',
      paymentStatus: 'pending',
      pdfBase64: orderData.pdfBase64 || '',
    }

    const endpoints = getCandidateOrdersEndpoints()
    let saved = false
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
          signal: AbortSignal.timeout(90000),
        })

        if (res.ok) {
          const text = await res.text()
          if (isHtmlResponse(text, res.headers.get('content-type'))) continue
          try {
            const data = JSON.parse(text)
            if (data?.success && data?.mongoSaved) {
              orderResult = data
              orderId = data.orderId || clientOrderId
              console.log(`[MONGO_ORDER_WRITE_PRIMARY] Order ${orderId} successfully saved to MongoDB Atlas (${endpoint})`)
              saved = true
              break
            } else {
              orderResult = data
            }
          } catch {}
        } else {
          const errData = await res.json().catch(() => null)
          console.warn(`[MongoDB Orders API Error on ${endpoint}]:`, errData || res.status)
          orderResult = errData
        }
      } catch (endpointErr) {
        console.warn(`[submitOrder] Attempt on ${endpoint} failed:`, endpointErr.message)
      }
    }
  } catch (apiErr) {
    console.error('[MongoDB Orders API Call Error]:', apiErr.message)
    throw { step: 'save_order', reason: `Failed to connect to Orders API: ${apiErr.message}` }
  }

  // Phase 4: MongoDB is authoritative. Strictly reject writes to Google Apps Script / Orders Sheet.
  if (!orderResult?.success || !orderResult?.mongoSaved) {
    throw {
      step: 'save_order',
      reason: orderResult?.error || 'Unable to save order to MongoDB orders service',
    }
  }

  // Order is successfully placed and secured in MongoDB Atlas.
  // The Print Agent retrieves the PDF on-demand from the cloud backend at release time.
  return { success: true, orderId, message: null }
}

/**
 * Fetches approved active campus advertisements from Google Apps Script.
 * Returns null if network fails or action is unavailable so UI falls back cleanly.
 */
export async function fetchCampusAds(placement = 'order-status') {
  try {
    const res = await gasGet({ action: 'getAds', placement })
    if (res?.success && Array.isArray(res.ads)) {
      return res.ads
    }
  } catch (err) {
    console.warn('[Campus Ads] Failed to fetch active ads from GAS:', err)
  }
  return null
}

async function gasPost(payload) {
  try {
    const action = payload?.action || ''
    const url = `${API_URL}?action=${encodeURIComponent(action)}&key=${encodeURIComponent(API_KEY)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: API_KEY, ...payload }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.warn(`[GAS POST] HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('[GAS POST Error]', err)
    return null
  }
}

/**
 * Creates a new campus promotion ad record in Google Sheets via Google Apps Script.
 * Uses gasPost with text/plain to support high payload sizes (compressed banners, rich text)
 * without URL length limits or CORS preflight failures.
 */
export async function createCampusAd(adData) {
  try {
    const payload = {
      action: 'createAdRecord',
      clubName: adData.clubName || '',
      title: adData.title || '',
      description: adData.description || '',
      mediaType: adData.mediaType || 'image',
      mediaUrl: adData.mediaUrl || '',
      clickUrl: adData.clickUrl || '',
      buttonText: adData.buttonText || 'View Details',
      placement: adData.placement || 'order-status',
      startDate: adData.startDate || new Date().toISOString().slice(0, 10),
      endDate: adData.endDate || '',
      status: adData.status || 'approved',
      priority: String(adData.priority ?? 1),
    }

    // Try POST first (handles large images & data URLs)
    let res = await gasPost(payload)

    // If POST fails, fallback to GET (if payload is small)
    if (!res) {
      res = await gasGet(payload)
    }

    if (res && res.success) {
      return { success: true, adId: res.adId }
    }
    return { success: false, error: res?.error || 'Failed to save ad to Google Sheets' }
  } catch (err) {
    return { success: false, error: err.message || 'Network error connecting to Ads API' }
  }
}

/**
 * Returns direct URL for streaming/downloading order PDF from cloud
 */
export function getOrderPdfUrl(orderId) {
  const cleanId = String(orderId || '').trim().toUpperCase()
  return `${ORDERS_ENDPOINT}?action=getPdf&orderId=${encodeURIComponent(cleanId)}`
}

/**
 * Fetches PDF binary blob directly from cloud backend for browser printing
 */
export async function fetchOrderPdfBlob(orderId) {
  const cleanId = String(orderId || '').trim().toUpperCase()
  const endpoints = getCandidateOrdersEndpoints()
  let lastErr = 'Failed to load PDF'

  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?action=getPdf&orderId=${encodeURIComponent(cleanId)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (res.ok) {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('text/html')) {
          lastErr = 'Received HTML instead of PDF'
          continue
        }
        return await res.blob()
      } else {
        const text = await res.text().catch(() => '')
        try {
          const j = JSON.parse(text)
          if (j?.error) lastErr = j.error
        } catch {}
      }
    } catch (err) {
      lastErr = err.message
    }
  }

  throw new Error(`Failed to load PDF: ${lastErr}`)
}

/**
 * Fetches active pending orders waiting for shopkeeper release
 */
export async function fetchPendingOrders() {
  const endpoints = getCandidateOrdersEndpoints()
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?action=listOrders`, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const text = await res.text()
        if (isHtmlResponse(text, res.headers.get('content-type'))) continue
        try {
          const data = JSON.parse(text)
          if (data?.success && Array.isArray(data.orders)) {
            const pending = data.orders.filter(o => {
              const s = String(o.printStatus || '').toLowerCase()
              return s === 'waiting_for_shopkeeper' || s === 'queued' || s === 'pending' || s === 'waiting' || s === 'failed'
            }).map(o => ({
              ...o,
              verifiedInMongo: true,
            }))
            return pending
          }
        } catch {
          continue
        }
      }
    } catch (err) {
      console.warn(`[fetchPendingOrders] notice (${endpoint}):`, err.message)
    }
  }
  return []
}

/**
 * Prepares the PDF binary for printing by applying customer customizations:
 * - If customer selected custom page ranges (e.g. [1, 3] or "2-5"), slices the PDF
 *   so the browser print dialog will ONLY print those exact pages when "Pages: All" is selected!
 */
export async function prepareOrderPdfForPrint(pdfBlob, order) {
  if (!order || !pdfBlob) return pdfBlob

  // 1. Resolve selected pages
  let selectedPages = []
  if (Array.isArray(order.selectedPages) && order.selectedPages.length > 0) {
    selectedPages = order.selectedPages.map(Number).filter(n => !isNaN(n) && n > 0)
  } else if (order.pageRange === 'custom' && order.customPages) {
    const parts = String(order.customPages).split(',')
    const set = new Set()
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number)
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.min(start, end); p <= Math.max(start, end); p++) set.add(p)
        }
      } else {
        const n = Number(trimmed)
        if (!isNaN(n) && n > 0) set.add(n)
      }
    }
    selectedPages = Array.from(set).sort((a, b) => a - b)
  }

  // If all pages or no custom range specified, return original blob
  if (selectedPages.length === 0) return pdfBlob

  try {
    const arrayBuffer = await pdfBlob.arrayBuffer()
    const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
    const total = srcDoc.getPageCount()

    // 1-based page numbers to 0-based page indices
    const pageIndices = selectedPages
      .map(p => p - 1)
      .filter(idx => idx >= 0 && idx < total)

    if (pageIndices.length === 0 || pageIndices.length === total) {
      return pdfBlob
    }

    const slicedDoc = await PDFDocument.create()
    const copiedPages = await slicedDoc.copyPages(srcDoc, pageIndices)
    copiedPages.forEach(page => slicedDoc.addPage(page))

    const slicedBytes = await slicedDoc.save()
    return new Blob([slicedBytes], { type: 'application/pdf' })
  } catch (err) {
    console.warn('[PDF Slicing Notice]:', err.message, 'Falling back to original PDF')
    return pdfBlob
  }
}

/**
 * Silently or directly prints a PDF blob or URL in the browser using a dedicated hidden iframe.
 * If opened in Chrome with --kiosk-printing, it bypasses the print dialog completely.
 */
export async function triggerBrowserPrint(blobOrUrl) {
  return new Promise((resolve, reject) => {
    let url = blobOrUrl
    let isCreatedBlob = false

    if (blobOrUrl instanceof Blob) {
      url = URL.createObjectURL(blobOrUrl)
      isCreatedBlob = true
    }

    // Reuse or create hidden iframe
    let frame = document.getElementById('xbuddy-print-iframe')
    if (!frame) {
      frame = document.createElement('iframe')
      frame.id = 'xbuddy-print-iframe'
      frame.style.position = 'fixed'
      frame.style.right = '100%'
      frame.style.bottom = '100%'
      frame.style.width = '0px'
      frame.style.height = '0px'
      frame.style.border = '0'
      document.body.appendChild(frame)
    }

    let cleanupDone = false
    const cleanup = () => {
      if (cleanupDone) return
      cleanupDone = true
      if (isCreatedBlob) {
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    }

    frame.onload = () => {
      try {
        frame.contentWindow.focus()
        frame.contentWindow.print()
        cleanup()
        resolve({ success: true, mode: 'iframe' })
      } catch (err) {
        console.warn('[Direct Print Iframe Error]:', err.message)
        // Fallback: open print window directly
        try {
          const printWindow = window.open(url, '_blank')
          if (printWindow) {
            printWindow.focus()
            resolve({ success: true, mode: 'window' })
          } else {
            reject(new Error('Popup blocked. Please allow popups or use Preview PDF.'))
          }
        } catch (winErr) {
          reject(winErr)
        }
        cleanup()
      }
    }

    frame.onerror = (err) => {
      cleanup()
      reject(err || new Error('Failed to load PDF into print frame'))
    }

    frame.src = url
  })
}
