const API_URL    = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const LOCAL_API  = 'http://localhost:3001'
const GITHUB_RAW = 'https://raw.githubusercontent.com/xbuddysrkr/xbuddy/main/public/tunnel-url.txt'
const API_KEY    = import.meta.env.VITE_API_KEY || 'XB_API_SECRET_KEY_2026'

let _tunnelUrl = null
let _tunnelFetchedAt = 0
const TUNNEL_TTL = 5 * 60 * 1000

async function getTunnelUrl() {
  const now = Date.now()
  if (_tunnelUrl && (now - _tunnelFetchedAt) < TUNNEL_TTL) return _tunnelUrl

  try {
    const res = await fetch(`${LOCAL_API}/tunnel-url`, { signal: AbortSignal.timeout(500) })
    if (res.ok) {
      const data = await res.json()
      if (data?.url?.startsWith('https://')) { _tunnelUrl = data.url; _tunnelFetchedAt = now; return _tunnelUrl }
    }
  } catch {}

  try {
    const res = await fetch(`${GITHUB_RAW}?t=${now}`, { signal: AbortSignal.timeout(6000) })
    if (res.ok) {
      const url = (await res.text()).trim()
      if (url.startsWith('https://')) { _tunnelUrl = url; _tunnelFetchedAt = now; return _tunnelUrl }
    }
  } catch {}

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
  const res = await gasGet({ action: 'getOrderStatus', orderId: cleanId })
  if (res?.success && res?.order) {
    return {
      ...res,
      ...res.order,
      orderId: res.order.orderId || cleanId,
      printStatus: res.order.printStatus || res.printStatus || 'waiting_for_shopkeeper',
      paymentStatus: res.order.paymentStatus || res.paymentStatus || 'pending',
    }
  }
  return res
}

export async function fetchAdminOrders() {
  const orderMap = new Map()

  // 1. Live Google Sheets Ground Truth (Always captures all student orders including mobile/remote)
  try {
    const gas = await gasGet({ action: 'listOrders' })
    if (gas?.success && Array.isArray(gas.orders)) {
      for (const o of gas.orders) {
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
  } catch (err) {
    console.warn('[fetchAdminOrders] GAS listOrders notice:', err)
  }

  // 2. Merge local print agent queue
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

  // 3. Merge tunnel queue if available
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
  const tunnelUrl = await getTunnelUrl()
  const endpoints = [LOCAL_API, tunnelUrl].filter(Boolean)
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/booth-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }), signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return await res.json()
    } catch { continue }
  }
  return { success: false, error: 'Could not connect to print agent.' }
}

export async function validateAndRelease(orderId) {
  const tunnelUrl = await getTunnelUrl()
  const endpoints = [LOCAL_API, tunnelUrl].filter(Boolean)
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
  // Try local print agent first if running
  try {
    const res = await fetch(`${LOCAL_API}/update-order-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, printStatus }),
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.success) return data
    }
  } catch {}

  // Try tunnel URL if available
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
        if (data?.success) return data
      }
    } catch {}
  }

  // Fallback to Google Apps Script
  return await gasGet({ action: 'updateOrderStatus', orderId, printStatus })
}

export async function updatePaymentStatus(orderId, paymentStatus) {
  return await gasGet({ action: 'updatePaymentStatus', orderId, paymentStatus })
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

  // ── Step 1: Save order via Dual-Write API (MongoDB Atlas + Google Sheets) ─
  onStep?.('save_order')
  let orderResult = null
  let orderId = clientOrderId

  try {
    const dualWritePayload = {
      action: 'saveOrder',
      orderId: clientOrderId,
      name: orderData.name,
      fileName: orderData.fileName,
      totalPages: orderData.totalPages,
      copies: printSettings.copies,
      colorMode: normalizedColor,
      printType: printSettings.printType,
      printSide: printSettings.printSide,
      duplex: isDuplex,
      pageSize: resolvedPaperSize,
      paperSize: resolvedPaperSize,
      orientation: printSettings.orientation,
      amount: orderData.amount,
      printingCost: orderData.printingCost || 0,
      serviceFee: orderData.serviceFee || 0,
      digitalProcessingFee: orderData.digitalProcessingFee || orderData.serviceFee || 0,
      transactionId: orderData.transactionId,
      pageRange: printSettings.pageRange,
      pageRangeMode: printSettings.pageRangeMode,
      customPages: printSettings.customPages,
      printableCount: printSettings.printableCount,
      selectedPages: printSettings.selectedPages,
      selectedPageCount: printSettings.selectedPageCount,
    }

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dualWritePayload),
      signal: AbortSignal.timeout(20000),
    })

    if (res.ok) {
      orderResult = await res.json()
      if (orderResult?.success) {
        orderId = orderResult.orderId || clientOrderId
      }
    } else {
      const errData = await res.json().catch(() => null)
      console.warn('[Dual-Write API Warning]:', errData || res.status)
    }
  } catch (apiErr) {
    console.warn('[Dual-Write Serverless Call Notice]:', apiErr.message)
  }

  // Fallback to direct Google Apps Script if serverless endpoint is not ready
  if (!orderResult?.success) {
    try {
      const res = await fetch(`${API_URL}?${new URLSearchParams({
        action: 'saveOrder', key: API_KEY, orderId: clientOrderId,
        name: orderData.name, fileName: orderData.fileName,
        totalPages: String(orderData.totalPages), copies: String(printSettings.copies),
        colorMode: normalizedColor,
        printType: printSettings.printType,
        printSide: printSettings.printSide,
        duplex: String(isDuplex),
        pageSize: resolvedPaperSize,
        paperSize: resolvedPaperSize,
        orientation: printSettings.orientation,
        amount: String(orderData.amount),
        printingCost: String(orderData.printingCost || ''),
        serviceFee: String(orderData.serviceFee || ''),
        digitalProcessingFee: String(orderData.digitalProcessingFee || orderData.serviceFee || ''),
        transactionId: orderData.transactionId,
        pageRange: printSettings.pageRange,
        pageRangeMode: printSettings.pageRangeMode,
        customPages: printSettings.customPages,
        printableCount: String(printSettings.printableCount),
        selectedPages: JSON.stringify(printSettings.selectedPages),
        selectedPageCount: String(printSettings.selectedPageCount),
      }).toString()}`, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw { step: 'save_order', reason: `HTTP ${res.status}` }
      const gasResult = await res.json()
      if (!gasResult?.success) throw { step: 'save_order', reason: gasResult?.error || 'Unable to Save Order' }
      orderId = gasResult.orderId || clientOrderId
    } catch (err) {
      if (err?.step) throw err
      throw { step: 'save_order', reason: err.name === 'TimeoutError' ? 'Request Timed Out' : (err.message || 'Network Error') }
    }
  }

  // ── Step 2: Deliver PDF to agent ──────────────────────────────────────────
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


