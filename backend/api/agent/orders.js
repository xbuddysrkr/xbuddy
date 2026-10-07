import { connectToDatabase } from '../_lib/mongodb.js'

const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || 'XB_AGENT_SECRET_KEY_2026'

const PENDING_PRINT_STATUSES = ['waiting_for_shopkeeper', 'Waiting', 'queued', 'pending', 'Ready', 'ready']

/**
 * Normalizes an order from MongoDB to ensure all print settings are explicitly present.
 * Preserves all canonical settings: copies, colorMode, duplex, pageSize, orientation, pageRange, etc.
 */
export function normalizeAgentOrder(order = {}) {
  const cleanId = String(order.orderId || order.id || '').trim().toUpperCase()
  const copies = Number(order.copies) || 1

  const rawColor = String(order.colorMode || order.printType || '').trim().toLowerCase()
  const colorMode = (rawColor === 'color' || rawColor === 'colour') ? 'color' : 'bw'
  const printType = colorMode === 'color' ? 'Color' : 'B&W'

  const rawSide = String(order.printSide || '').trim().toLowerCase()
  const duplex = (typeof order.duplex === 'boolean')
    ? order.duplex
    : (rawSide === 'double' || rawSide === 'duplex')
  const printSide = duplex ? 'Double' : 'Single'

  const pageSize = String(order.pageSize || order.paperSize || 'A4').trim().toUpperCase()
  const orientation = String(order.orientation || 'portrait').trim().toLowerCase()

  const pageRange = String(order.pageRange || 'all').trim()
  const pageRangeMode = String(order.pageRangeMode || (pageRange === 'all' ? 'all' : 'custom')).trim()
  const customPages = String(order.customPages || '')

  let selectedPages = []
  if (Array.isArray(order.selectedPages)) {
    selectedPages = order.selectedPages.map(Number).filter(n => !isNaN(n) && n > 0)
  } else if (typeof order.selectedPages === 'string') {
    try {
      const parsed = JSON.parse(order.selectedPages)
      if (Array.isArray(parsed)) {
        selectedPages = parsed.map(Number).filter(n => !isNaN(n) && n > 0)
      }
    } catch {
      selectedPages = order.selectedPages.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)
    }
  }

  const selectedPageCount = Number(order.selectedPageCount) || (selectedPages.length > 0 ? selectedPages.length : Number(order.totalPages) || 1)

  return {
    orderId: cleanId,
    name: String(order.name || ''),
    fileName: String(order.fileName || `${cleanId}.pdf`),
    driveUrl: String(order.driveUrl || ''),
    pdfUrl: String(order.pdfUrl || order.driveUrl || ''),
    copies,
    colorMode,
    printType,
    printSide,
    duplex,
    pageSize,
    paperSize: pageSize,
    orientation,
    pageRange,
    pageRangeMode,
    customPages,
    selectedPages,
    selectedPageCount,
    totalPages: Number(order.totalPages) || selectedPageCount,
    amount: Number(order.amount) || 0,
    paymentStatus: String(order.paymentStatus || 'pending'),
    printStatus: String(order.printStatus || 'waiting_for_shopkeeper'),
    createdAt: order.createdAt || '',
    transactionId: order.transactionId || '',
    claimedAt: order.claimedAt || null,
    claimedBy: order.claimedBy || null,
    printedAt: order.printedAt || null,
    source: 'mongo',
  }
}

/**
 * Validates agent authentication header.
 * Rejects missing or invalid secrets with HTTP 401.
 */
export function validateAgentAuth(req) {
  const headerKey = req.headers?.['x-agent-key'] || req.headers?.['x-agent-secret']
  if (!headerKey || typeof headerKey !== 'string') {
    return false
  }
  return headerKey.trim() === AGENT_SECRET_KEY.trim()
}

/**
 * Extracts route path and parameters from incoming request.
 * Supports Vercel rewrite parameter (?route=...) and raw URL pathname.
 */
export function parseRoute(req) {
  let routePath = req.query?.route || ''

  if (!routePath && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost')
      const pathname = parsedUrl.pathname
      if (pathname.startsWith('/api/agent/orders')) {
        routePath = pathname.replace(/^\/api\/agent\/orders\/?/, '')
      }
    } catch {}
  }

  const parts = String(routePath).split('/').map(p => p.trim()).filter(Boolean)
  return { routePath, parts }
}

/**
 * Main Vercel serverless function handler for authenticated Print Agent orders API.
 */
export default async function handler(req, res) {
  // Set security and CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-agent-key, Authorization, x-api-key, X-API-Key, x-agent-secret, X-Agent-Secret')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // 1. Authenticate Print Agent via x-agent-key
  if (!validateAgentAuth(req)) {
    console.warn(`[AGENT_AUTH] Unauthorized request rejected (method=${req.method}, url=${req.url})`)
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing x-agent-key header',
    })
  }

  const { parts } = parseRoute(req)
  const method = req.method.toUpperCase()

  try {
    const { db } = await connectToDatabase()
    const ordersCollection = db.collection('orders')
    const nowIso = new Date().toISOString()

    // ── ROUTE 1: GET /api/agent/orders/pending (or action=pending) ───────────
    if (
      (parts.length === 1 && parts[0].toLowerCase() === 'pending') ||
      (req.query?.action === 'pending' || req.query?.action === 'getWaitingOrders')
    ) {
      if (method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' })
      }

      const pendingOrders = await ordersCollection
        .find({ printStatus: { $in: PENDING_PRINT_STATUSES } })
        .sort({ createdAt: 1 })
        .toArray()

      return res.status(200).json({
        success: true,
        count: pendingOrders.length,
        orders: pendingOrders.map(normalizeAgentOrder),
        source: 'mongo',
      })
    }

    // ── ROUTE 2: POST /api/agent/orders/:orderId/claim (ATOMIC PRINT CLAIM) ───
    if (
      (parts.length === 2 && parts[1].toLowerCase() === 'claim') ||
      (req.query?.action === 'claim' && (req.query?.orderId || req.body?.orderId))
    ) {
      if (method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed for claim (expected POST)' })
      }

      const rawId = parts.length === 2 ? parts[0] : (req.query?.orderId || req.body?.orderId)
      const cleanId = String(rawId || '').trim().toUpperCase()

      if (!cleanId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      // Conditional atomic transition: pending -> Printing
      const claimResult = await ordersCollection.findOneAndUpdate(
        {
          orderId: cleanId,
          printStatus: { $in: PENDING_PRINT_STATUSES },
        },
        {
          $set: {
            printStatus: 'Printing',
            claimedAt: nowIso,
            claimedBy: 'print-agent',
            updatedAt: nowIso,
          },
          $inc: { claimAttempts: 1 },
        },
        { returnDocument: 'after' }
      )

      if (!claimResult) {
        const existing = await ordersCollection.findOne({ orderId: cleanId })
        if (!existing) {
          return res.status(404).json({
            success: false,
            error: `Order ${cleanId} not found in MongoDB Atlas`,
            orderId: cleanId,
          })
        }

        console.warn(`[AGENT_CLAIM_CONFLICT] Order ${cleanId} already claimed or processing. Current status: "${existing.printStatus}"`)
        return res.status(409).json({
          success: false,
          error: `Order ${cleanId} is already claimed or processed (current status: "${existing.printStatus}")`,
          conflict: true,
          currentStatus: existing.printStatus,
          orderId: cleanId,
        })
      }

      console.log(`[AGENT_CLAIM_SUCCESS] Order ${cleanId} atomically claimed by Print Agent (transition: pending -> Printing)`)
      return res.status(200).json({
        success: true,
        claimed: true,
        orderId: cleanId,
        order: normalizeAgentOrder(claimResult),
        source: 'mongo',
      })
    }

    // ── ROUTE 3: POST /api/agent/orders/:orderId/status (STATUS UPDATES) ─────
    if (
      (parts.length === 2 && parts[1].toLowerCase() === 'status') ||
      (req.query?.action === 'status' || req.query?.action === 'updateStatus')
    ) {
      if (method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed for status update (expected POST)' })
      }

      const rawId = parts.length === 2 ? parts[0] : (req.query?.orderId || req.body?.orderId)
      const cleanId = String(rawId || '').trim().toUpperCase()

      const newStatus = String(req.body?.status || req.body?.printStatus || req.query?.status || '').trim()

      if (!cleanId || !newStatus) {
        return res.status(400).json({ success: false, error: 'orderId and status are required' })
      }

      const updateDoc = {
        printStatus: newStatus,
        updatedAt: nowIso,
      }

      if (newStatus === 'Printed') {
        updateDoc.printedAt = nowIso
      } else if (newStatus === 'Printing') {
        updateDoc.printingAt = nowIso
      } else if (newStatus.toLowerCase().includes('fail')) {
        updateDoc.failedAt = nowIso
        if (req.body?.errorMessage) {
          updateDoc.errorMessage = String(req.body.errorMessage)
        }
      }

      const updateRes = await ordersCollection.updateOne(
        { orderId: cleanId },
        { $set: updateDoc }
      )

      if (updateRes.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: `Order ${cleanId} not found in MongoDB Atlas`,
          orderId: cleanId,
        })
      }

      console.log(`[AGENT_STATUS_UPDATE] Order ${cleanId} -> MongoDB printStatus "${newStatus}"`)
      return res.status(200).json({
        success: true,
        orderId: cleanId,
        printStatus: newStatus,
        updatedAt: nowIso,
        source: 'mongo',
      })
    }

    // ── ROUTE 4: GET /api/agent/orders/:orderId (GET SINGLE ORDER) ───────────
    if (
      (parts.length === 1 && parts[0].toLowerCase() !== 'pending') ||
      (req.query?.action === 'getOrder' && (req.query?.orderId || req.body?.orderId))
    ) {
      if (method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' })
      }

      const rawId = parts.length === 1 ? parts[0] : (req.query?.orderId || req.body?.orderId)
      const cleanId = String(rawId || '').trim().toUpperCase()

      if (!cleanId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const order = await ordersCollection.findOne({ orderId: cleanId })
      if (!order) {
        return res.status(404).json({
          success: false,
          error: `Order ${cleanId} not found in MongoDB Atlas`,
          orderId: cleanId,
          source: 'mongo',
        })
      }

      return res.status(200).json({
        success: true,
        order: normalizeAgentOrder(order),
        source: 'mongo',
      })
    }

    // ── ROUTE 5: GET /api/agent/orders (LIST ALL ORDERS FOR BOOTH/ADMIN) ────
    if (parts.length === 0) {
      if (method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' })
      }

      const orders = await ordersCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      return res.status(200).json({
        success: true,
        count: orders.length,
        orders: orders.map(normalizeAgentOrder),
        source: 'mongo',
      })
    }

    return res.status(400).json({
      success: false,
      error: `Unrecognized route: /api/agent/orders/${parts.join('/')}`,
    })
  } catch (err) {
    console.error('[API Agent Orders Error]:', err)
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    })
  }
}
