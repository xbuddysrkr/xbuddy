const API_URL    = import.meta.env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const LOCAL_API  = import.meta.env.VITE_PRINT_AGENT_URL || 'http://localhost:3001'
const GITHUB_RAW = import.meta.env.VITE_GITHUB_TUNNEL_URL || 'https://raw.githubusercontent.com/xbuddysrkr/xbuddy/main/public/tunnel-url.txt'
const API_KEY    = import.meta.env.VITE_API_KEY || 'XB_API_SECRET_KEY_2026'
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const ORDERS_ENDPOINT = `${BACKEND_URL}/api/orders`

let _tunnelUrl = null
let _tunnelFetchedAt = 0
const TUNNEL_TTL = 5 * 60 * 1000

async function getTunnelUrl() {
  const now = Date.now()
  if (_tunnelUrl && (now - _tunnelFetchedAt) < TUNNEL_TTL) return _tunnelUrl

  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  // 1. Only test localhost port 3001 if the browser is actually running on localhost
  if (isLocalHost) {
    try {
      const res = await fetch(`${LOCAL_API}/tunnel-url`, { signal: AbortSignal.timeout(500) })
      if (res.ok) {
        const data = await res.json()
        if (data?.url?.startsWith('https://')) { _tunnelUrl = data.url; _tunnelFetchedAt = now; return _tunnelUrl }
      }
    } catch {}
  }

  // 2. Try GitHub raw URLs (checking both root public and frontend/public locations)
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
        if (text.startsWith('https://')) { _tunnelUrl = text; _tunnelFetchedAt = now; return _tunnelUrl }
      }
    } catch {}
  }

  // 3. Try Google Apps Script tunnel registry
  try {
    const res = await fetch(`${API_URL}?action=getTunnelUrl&key=${API_KEY}`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data = await res.json()
      if (data?.url?.startsWith('https://')) { _tunnelUrl = data.url; _tunnelFetchedAt = now; return _tunnelUrl }
    }
  } catch {}

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
  const CHUNK_SIZE = 200 * 1024
  const total = Math.ceil(pdfBase64.length / CHUNK_SIZE)
  for (let i = 0; i < total; i++) {
    const chunk = pdfBase64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const params = new URLSearchParams({
      action: 'saveChunk', key: API_KEY, fileId: orderId, fileType: 'pdf',
      index: String(i), total: String(total), chunk,
    })
    const res = await fetch(`${API_URL}?${params.toString()}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`Chunk ${i} failed`)
    const data = await res.json()
    if (!data?.success) throw new Error(`Chunk ${i} rejected`)
  }
  const res = await fetch(`${API_URL}?${new URLSearchParams({
    action: 'assemblePdf', key: API_KEY, fileId: orderId, fileName, mimeType: 'application/pdf',
  }).toString()}`, { signal: AbortSignal.timeout(60000) })
  const data = await res.json()
  if (!data?.success || !data?.fileUrl) throw new Error('Assembly failed')
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

export async function getOrderStatus(orderId) {
  if (!orderId) return null
  const cleanId = String(orderId).trim().toUpperCase()

  // 1. PRIMARY & AUTHORITATIVE READ: Serverless Orders API (MongoDB Atlas)
  try {
    const res = await fetch(`${ORDERS_ENDPOINT}?action=getOrderStatus&orderId=${cleanId}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.success && data?.order) {
        return {
          ...data,
          ...data.order,
          orderId: data.order.orderId || cleanId,
          printStatus: data.order.printStatus || data.printStatus || 'waiting_for_shopkeeper',
          paymentStatus: data.order.paymentStatus || data.paymentStatus || 'pending',
        }
      }
      if (data?.error === 'Order not found') {
        return { success: false, error: 'Order not found' }
      }
    }
  } catch (err) {
    console.warn('[getOrderStatus] Primary API notice:', err.message)
  }

  return null
}

export async function fetchAdminOrders() {
  const orderMap = new Map()

  // 1. PRIMARY & AUTHORITATIVE READ: Serverless Orders API (MongoDB Atlas)
  let ordersList = null
  try {
    const res = await fetch(`${ORDERS_ENDPOINT}?action=listOrders`, { signal: AbortSignal.timeout(15000) })
    if (res.ok) {
      const data = await res.json()
      if (data?.success && Array.isArray(data.orders)) {
        ordersList = data.orders
      }
    }
  } catch (err) {
    console.warn('[fetchAdminOrders] Primary /api/orders list notice:', err.message)
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

  // 2. Try Tunnel and Local Agent
  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const tunnelUrl = await getTunnelUrl()
  const endpoints = [tunnelUrl, isLocalHost ? LOCAL_API : null].filter(Boolean)
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/booth-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }), signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return await res.json()
    } catch { continue }
  }
  return { success: false, error: 'Could not connect to booth service. Check internet or print agent.' }
}

export async function validateAndRelease(orderId) {
  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const tunnelUrl = await getTunnelUrl()
  const endpoints = [tunnelUrl, isLocalHost ? LOCAL_API : null].filter(Boolean)
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/release-print`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }), signal: AbortSignal.timeout(10000),
      })
      if (res.ok) return await res.json()
    } catch { continue }
  }
  return { success: false, error: 'Could not connect to print agent. Is it running?' }
}

export async function updateOrderStatus(orderId, printStatus) {
  // 1. Try local print agent first if running
  try {
    const res = await fetch(`${LOCAL_API}/update-order-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, printStatus }),
      signal: AbortSignal.timeout(2000),
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

  // 2. Try tunnel URL if available
  const tunnelUrl = await getTunnelUrl()
  if (tunnelUrl) {
    try {
      const res = await fetch(`${tunnelUrl}/update-order-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, printStatus }),
        signal: AbortSignal.timeout(4000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.success) {
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

  // 3. Update via authoritative serverless endpoint (atomic print release lock in MongoDB)
  try {
    const res = await fetch(ORDERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateOrderStatus', orderId, printStatus }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.success) return data
      return data
    }
  } catch (err) {
    console.warn('[updateOrderStatus] /api/orders notice:', err.message)
  }

  return { success: false, error: 'Failed to update order status' }
}

export async function updatePaymentStatus(orderId, paymentStatus) {
  // Update via authoritative serverless endpoint (updates MongoDB)
  try {
    const res = await fetch(ORDERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updatePaymentStatus', orderId, paymentStatus }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.success) return data
      return data
    }
  } catch (err) {
    console.warn('[updatePaymentStatus] /api/orders notice:', err.message)
  }

  return { success: false, error: 'Failed to update payment status' }
}

export async function submitOrder(orderData, { onStep } = {}) {
  const clientOrderId = 'XB' + String(Math.floor(1000 + Math.random() * 9000))

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
    }

    const res = await fetch(ORDERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
      signal: AbortSignal.timeout(20000),
    })

    if (res.ok) {
      orderResult = await res.json()
      if (orderResult?.success && orderResult?.mongoSaved) {
        orderId = orderResult.orderId || clientOrderId
        console.log(`[MONGO_ORDER_WRITE_PRIMARY] Order ${orderId} successfully saved to MongoDB Atlas`)
      }
    } else {
      const errData = await res.json().catch(() => null)
      console.warn('[MongoDB Orders API Error]:', errData || res.status)
      orderResult = errData
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

  // ── Step 2: Deliver PDF to agent for local staging ────────────────────────
  onStep?.('print_agent')

  // Try local (xerox shop agent machine)
  try {
    if (await postToAgent(LOCAL_API, orderId, orderData, printSettings))
      return { success: true, orderId, message: null }
  } catch {}

  // Try tunnel with full PDF (works for PDFs under ~4MB through Cloudflare)
  const tunnelUrl = await getTunnelUrl()
  if (tunnelUrl) {
    try {
      if (await postToAgent(tunnelUrl, orderId, orderData, printSettings))
        return { success: true, orderId, message: null }
    } catch {}
  }

  // Fallback: upload PDF to Drive, send metadata to agent
  try {
    const driveUrl = await uploadPdfViaGas(orderId, orderData.fileName, orderData.pdfBase64 || '')
    // Notify agent via local or tunnel with just the driveUrl (tiny payload)
    const metaBody = JSON.stringify({ orderId, driveUrl, screenshotBase64: orderData.screenshotBase64 || '', ...printSettings })
    for (const base of [LOCAL_API, tunnelUrl].filter(Boolean)) {
      try {
        const r = await fetch(`${base}/save-order-meta`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: metaBody, signal: AbortSignal.timeout(8000),
        })
        if (r.ok) { const d = await r.json(); if (d?.success) break }
      } catch {}
    }
    return { success: true, orderId, message: null }
  } catch {
    return { success: true, orderId, message: 'Order saved! Show your Order ID at the Xerox shop to collect your documents.' }
  }
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


