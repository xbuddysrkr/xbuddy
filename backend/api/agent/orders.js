import crypto from 'crypto'
import { connectToDatabase } from '../_lib/mongodb.js'
import { calculateExpiryTimestamp } from '../_lib/retention.js'

const AUTHORIZED_KEY_HASHES = new Set([
  'ea4af0179d15ec55173b299b18bbffb8b770589fe9df62b6239aee52eee4f04d',
])

const PENDING_PRINT_STATUSES = ['waiting_for_shopkeeper', 'Waiting', 'queued', 'pending', 'Ready', 'ready', 'Failed', 'failed']

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
    pdfUrl: String(order.pdfUrl || order.driveUrl || `https://xbuddy.onrender.com/api/orders?action=getOrderPdf&orderId=${cleanId}`),
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
    pdfExpiresAt: order.pdfExpiresAt || null,
    pdfDeletedAt: order.pdfDeletedAt || null,
    reprintCount: Number(order.reprintCount) || 0,
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
  const provided = headerKey.trim()
  const envKey = (process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || '').trim()
  if (envKey && provided === envKey) return true

  const hashed = crypto.createHash('sha256').update(provided).digest('hex')
  return AUTHORIZED_KEY_HASHES.has(hashed)
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

    // ── ROUTE 0: POST /api/agent/orders?action=heartbeat (STATION HEARTBEAT) ─
    if (
      (parts.length === 1 && parts[0].toLowerCase() === 'heartbeat') ||
      req.query?.action === 'heartbeat' || req.body?.action === 'heartbeat'
    ) {
      const stationsCol = db.collection('stations')
      const body = req.body || {}
      const cleanStationId = String(body.stationId || req.query?.stationId || 'SRKR-XEROX-01').trim().toUpperCase()

      const updateDoc = {
        stationId: cleanStationId,
        printerName: String(body.printerName || 'Unknown'),
        printerAvailable: Boolean(body.printerAvailable),
        agentVersion: String(body.agentVersion || '2.1.0'),
        status: body.printerAvailable ? 'online' : 'printer_unavailable',
        lastHeartbeat: nowIso,
        lastHeartbeatEpoch: Date.now(),
        uptimeSeconds: Number(body.uptimeSeconds) || 0,
        systemInfo: body.systemInfo || {},
        updatedAt: nowIso,
      }

      await stationsCol.updateOne(
        { stationId: cleanStationId },
        {
          $set: updateDoc,
          $setOnInsert: { createdAt: nowIso },
        },
        { upsert: true }
      )

      return res.status(200).json({
        success: true,
        stationId: cleanStationId,
        status: updateDoc.status,
        serverTime: nowIso,
      })
    }

    // ── ROUTE 1: GET /api/agent/orders/pending (or action=pending) ───────────
    if (
      (parts.length === 1 && parts[0].toLowerCase() === 'pending') ||
      (req.query?.action === 'pending' || req.query?.action === 'getWaitingOrders')
    ) {
      if (method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' })
      }

      const pendingOrders = await ordersCollection
        .find({ printStatus: { $in: PENDING_PRINT_STATUSES } }, { projection: { pdfBase64: 0 } })
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

      // 1. Verify existing order in MongoDB Atlas first
      const existing = await ordersCollection.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: `Order ${cleanId} not found in MongoDB Atlas`,
          orderId: cleanId,
        })
      }

      // 1.5. Reject claiming expired or deleted documents
      if (existing.pdfDeletedAt || (existing.pdfExpiresAt && new Date(existing.pdfExpiresAt).getTime() <= Date.now())) {
        console.warn(`[AGENT_CLAIM_EXPIRED] Order ${cleanId} claim rejected: retention window expired`)
        return res.status(410).json({
          success: false,
          error: `Order ${cleanId} PDF retention window expired; document permanently deleted.`,
          expired: true,
          orderId: cleanId,
        })
      }

      // 2. Determine effective payment status and authorization (handling reprints separately)
      const normPayStatus = String(existing.paymentStatus || 'pending').trim().toLowerCase()
      const isReprintOrder = Boolean(existing.reprintPending && existing.activeReprintAttemptId)
      let effectivePayStatus = normPayStatus
      let activeReprintAttempt = null

      if (isReprintOrder) {
        activeReprintAttempt = (existing.reprintAttempts || []).find(a => a.attemptId === existing.activeReprintAttemptId)
        if (!activeReprintAttempt) {
          console.warn(`[AGENT_CLAIM_REPRINT_ERR] Order ${cleanId} active reprint attempt ${existing.activeReprintAttemptId} not found`)
          return res.status(403).json({
            success: false,
            error: `Order ${cleanId} reprint claim rejected: active reprint attempt ${existing.activeReprintAttemptId} not found`,
            paymentBlocked: true,
            orderId: cleanId,
          })
        }
        if (!activeReprintAttempt.printAuthorized) {
          console.warn(`[AGENT_CLAIM_REPRINT_UNAUTHORIZED] Order ${cleanId} reprint attempt ${existing.activeReprintAttemptId} not authorized`)
          return res.status(403).json({
            success: false,
            error: `Order ${cleanId} reprint claim rejected: reprint payment has not authorized printing`,
            paymentBlocked: true,
            orderId: cleanId,
          })
        }
        effectivePayStatus = String(activeReprintAttempt.paymentStatus || 'pending').trim().toLowerCase()
        if (!['paid', 'completed'].includes(effectivePayStatus)) {
          return res.status(402).json({
            success: false,
            error: `Payment authorization required: reprint ${cleanId} payment status is "${effectivePayStatus}". Shopkeeper verification required before release.`,
            paymentStatus: effectivePayStatus,
            paymentBlocked: true,
            orderId: cleanId,
          })
        }
      }

      // Reject failed, rejected, or cancelled payments unconditionally
      if (['failed', 'rejected', 'cancelled'].includes(effectivePayStatus)) {
        console.warn(`[AGENT_CLAIM_PAYMENT_BLOCKED] Order ${cleanId} claim rejected: payment status is "${effectivePayStatus}"`)
        return res.status(403).json({
          success: false,
          error: `Order ${cleanId} cannot be claimed or printed: payment status is "${effectivePayStatus}". Release strictly prohibited.`,
          paymentStatus: effectivePayStatus,
          paymentBlocked: true,
          orderId: cleanId,
        })
      }

      // 3. Check if strict payment verification is required
      const requirePaymentVerification = process.env.REQUIRE_PAYMENT_VERIFICATION === 'true'
      if (requirePaymentVerification && !['paid', 'completed'].includes(effectivePayStatus)) {
        console.warn(`[AGENT_CLAIM_PAYMENT_REQUIRED] Order ${cleanId} claim rejected: payment verification required (current: "${effectivePayStatus}")`)
        return res.status(402).json({
          success: false,
          error: `Payment authorization required: ${isReprintOrder ? 'reprint' : 'order'} ${cleanId} payment status is "${effectivePayStatus}". Verify payment before release.`,
          paymentStatus: effectivePayStatus,
          paymentBlocked: true,
          orderId: cleanId,
        })
      }

      // 4. Conditional atomic transition: pending -> Printing (enforcing payment predicate atomically)
      const claimFilter = {
        orderId: cleanId,
        printStatus: { $in: PENDING_PRINT_STATUSES },
        pdfDeletedAt: { $exists: false },
        ...(isReprintOrder
          ? {
              reprintAttempts: {
                $elemMatch: {
                  attemptId: existing.activeReprintAttemptId,
                  printAuthorized: true,
                  paymentStatus: { $in: ['paid', 'completed'] },
                },
              },
            }
          : {
              paymentStatus: requirePaymentVerification
                ? { $in: ['paid', 'completed'] }
                : { $nin: ['failed', 'rejected', 'cancelled'] },
            }),
      }

      const claimResult = await ordersCollection.findOneAndUpdate(
        claimFilter,
        {
          $set: {
            printStatus: 'Printing',
            claimedAt: nowIso,
            claimedBy: 'print-agent',
            updatedAt: nowIso,
          },
          $inc: { claimAttempts: 1 },
        },
        { returnDocument: 'after', projection: { pdfBase64: 0 } }
      )

      if (!claimResult) {
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

      const existing = await ordersCollection.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: `Order ${cleanId} not found in MongoDB Atlas`,
          orderId: cleanId,
        })
      }

      const updateDoc = {
        printStatus: newStatus,
        updatedAt: nowIso,
      }
      const mongoUpdates = { $set: updateDoc }

      if (newStatus === 'Printed') {
        // Requirement 1: When an order first transitions to Printed, record immutable printedAt
        // and set pdfExpiresAt = printedAt + 30 minutes. Repeated updates or reprints must NOT reset it.
        if (!existing.printedAt) {
          updateDoc.printedAt = nowIso
          updateDoc.pdfExpiresAt = calculateExpiryTimestamp(nowIso)
        } else if (existing.reprintPending) {
          // Requirement 3: Reprint finished successfully
          updateDoc.reprintPending = false
          updateDoc.lastReprintAt = nowIso
          if (existing.activeReprintAttemptId) {
            updateDoc['reprintAttempts.$[elem].printOutcome'] = 'printed'
            updateDoc['reprintAttempts.$[elem].printedAt'] = nowIso
          }
          mongoUpdates.$inc = { reprintCount: 1 }
          mongoUpdates.$push = {
            auditLog: {
              action: 'reprint_completed',
              attemptId: existing.activeReprintAttemptId || null,
              printedAt: nowIso,
            },
          }
        }
      } else if (newStatus === 'Printing') {
        updateDoc.printingAt = nowIso
      } else if (newStatus.toLowerCase().includes('fail')) {
        updateDoc.failedAt = nowIso
        if (req.body?.errorMessage) {
          updateDoc.errorMessage = String(req.body.errorMessage)
        }
        if (existing.reprintPending) {
          updateDoc.reprintPending = false
          if (existing.activeReprintAttemptId) {
            updateDoc['reprintAttempts.$[elem].printOutcome'] = 'failed'
            updateDoc['reprintAttempts.$[elem].failedAt'] = nowIso
          }
          // A failed reprint must not be counted as a successful reprint
          mongoUpdates.$push = {
            auditLog: {
              action: 'reprint_failed',
              attemptId: existing.activeReprintAttemptId || null,
              failedAt: nowIso,
              errorMessage: req.body?.errorMessage || 'Print failed',
            },
          }
        }
      }

      const updateOptions = existing.activeReprintAttemptId
        ? { arrayFilters: [{ 'elem.attemptId': existing.activeReprintAttemptId }] }
        : {}

      await ordersCollection.updateOne(
        { orderId: cleanId },
        mongoUpdates,
        updateOptions
      )

      console.log(`[AGENT_STATUS_UPDATE] Order ${cleanId} -> MongoDB printStatus "${newStatus}"`)
      return res.status(200).json({
        success: true,
        orderId: cleanId,
        printStatus: newStatus,
        printedAt: updateDoc.printedAt || existing.printedAt || null,
        pdfExpiresAt: updateDoc.pdfExpiresAt || existing.pdfExpiresAt || null,
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

      const order = await ordersCollection.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
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
        .find({}, { projection: { pdfBase64: 0 } })
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
