import fs from 'fs'
import path from 'path'
import { deletePdfFromGridFS, getGridFSBucket } from './gridfs.js'

// ── FINAL XBuddy PDF Retention Specifications ───────────────────────────────
// 1. Printed orders: purge 30 minutes after confirmed print completion (printedAt).
// 2. Unprinted orders: purge 24 hours after upload (pdfUploadedAt / createdAt).
// 3. Claims, downloads, payment verification, print failures, and refreshes do NOT reset timer.
export const RETENTION_MINUTES_PRINTED = 30
export const RETENTION_MS_PRINTED = RETENTION_MINUTES_PRINTED * 60 * 1000 // 30 minutes

export const RETENTION_HOURS_UNPRINTED = 24
export const RETENTION_MS_UNPRINTED = RETENTION_HOURS_UNPRINTED * 60 * 60 * 1000 // 24 hours

// Backwards-compatible aliases
export const RETENTION_MINUTES = RETENTION_MINUTES_PRINTED
export const RETENTION_WINDOW_MS = RETENTION_MS_PRINTED

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

/**
 * Calculates the 30-minute retention deadline from confirmed print completion timestamp.
 */
export function calculatePrintedExpiryTimestamp(printedAtIso) {
  const baseTime = printedAtIso ? new Date(printedAtIso).getTime() : Date.now()
  return new Date(baseTime + RETENTION_MS_PRINTED).toISOString()
}

/**
 * Calculates the 24-hour retention deadline from upload timestamp.
 */
export function calculateUnprintedExpiryTimestamp(uploadTimeIso) {
  const baseTime = uploadTimeIso ? new Date(uploadTimeIso).getTime() : Date.now()
  return new Date(baseTime + RETENTION_MS_UNPRINTED).toISOString()
}

/**
 * Calculates retention expiry timestamp based on order state.
 * If isPrinted is true, returns 30 minutes after printedAt.
 * Otherwise returns 24 hours after upload.
 */
export function calculateExpiryTimestamp(baseTimeIso, isPrinted = false) {
  return isPrinted
    ? calculatePrintedExpiryTimestamp(baseTimeIso)
    : calculateUnprintedExpiryTimestamp(baseTimeIso)
}

/**
 * Evaluates the authoritative effective expiry timestamp for an order:
 * - If order was successfully printed (printedAt exists), expiration is 30 minutes after printedAt.
 * - If order was not printed, expiration is 24 hours after upload (pdfUploadedAt or createdAt).
 * - If explicit pdfExpiresAt is stored and matches the state, it is respected.
 */
export function getEffectiveExpiryTimestamp(order) {
  if (!order) return null

  // If order was successfully printed, rule is strictly 30 minutes after confirmed printedAt
  if (order.printedAt) {
    const printedExpiry = calculatePrintedExpiryTimestamp(order.printedAt)
    if (order.pdfExpiresAt) {
      return new Date(order.pdfExpiresAt).getTime() < new Date(printedExpiry).getTime()
        ? order.pdfExpiresAt
        : printedExpiry
    }
    return printedExpiry
  }

  // If order has not been successfully printed, rule is 24 hours after upload
  if (order.pdfExpiresAt) {
    return order.pdfExpiresAt
  }
  const uploadTime = order.pdfUploadedAt || order.createdAt
  if (uploadTime) {
    return calculateUnprintedExpiryTimestamp(uploadTime)
  }
  return null
}

/**
 * Calculates exact order / reprint pricing according to XBuddy pricing slabs.
 */
export function calculateOrderPrice(order) {
  const isColor = order.colorMode === 'color' || order.printType === 'Color'
  const rate = isColor ? 5 : 2
  const copies = Math.max(1, Number(order.copies) || 1)
  const isDuplex = Boolean(order.duplex === true || order.printSide === 'Double')
  const printablePages = Number(order.printableCount || order.selectedPageCount || order.totalPages || 1)
  const effectivePages = isDuplex ? Math.ceil(printablePages / 2) : printablePages
  const totalBillablePages = effectivePages * copies
  const printingCost = totalBillablePages * rate

  let serviceFee = 0
  if (totalBillablePages >= 1 && totalBillablePages <= 5) serviceFee = 1
  else if (totalBillablePages >= 6 && totalBillablePages <= 10) serviceFee = 2
  else if (totalBillablePages >= 11 && totalBillablePages <= 20) serviceFee = 3
  else if (totalBillablePages >= 21 && totalBillablePages <= 30) serviceFee = 4
  else if (totalBillablePages >= 31 && totalBillablePages <= 50) serviceFee = 5
  else if (totalBillablePages >= 51 && totalBillablePages <= 80) serviceFee = 7
  else if (totalBillablePages >= 81 && totalBillablePages <= 100) serviceFee = 10

  const totalAmount = printingCost + serviceFee
  return {
    printingCost,
    serviceFee,
    digitalProcessingFee: serviceFee,
    totalAmount,
    totalBillablePages,
    effectivePages,
    printablePages,
    ratePerPage: rate,
    copies,
  }
}

/**
 * Evaluates whether an order is eligible for reprint.
 * Authoritative server-side evaluation:
 * - printStatus === 'Printed'
 * - 30-minute reprint window after confirmed print completion not expired
 * - original PDF remains available in durable storage
 * - not already deleted (no pdfDeletedAt)
 * - satisfies payment authorization rules
 */
export function isOrderReprintEligible(order, serverTimeIso = new Date().toISOString(), options = {}) {
  if (!order) return { eligible: false, reason: 'Order not found' }

  // 1. Must be in 'Printed' status
  if (order.printStatus !== 'Printed') {
    return { eligible: false, reason: `Order is not printed (current status: ${order.printStatus})` }
  }

  // 2. Must have a valid expiry timestamp derived from printedAt + 30m
  const effectiveExpiresAt = getEffectiveExpiryTimestamp(order)
  if (!effectiveExpiresAt) {
    return { eligible: false, reason: 'No retention expiry timestamp or print completion timestamp recorded' }
  }

  const serverTime = new Date(serverTimeIso).getTime()
  const expiryTime = new Date(effectiveExpiresAt).getTime()

  // 3. Expiry check (authoritative server clock)
  if (expiryTime <= serverTime) {
    return {
      eligible: false,
      expired: true,
      remainingSeconds: 0,
      effectiveExpiresAt,
      reason: 'Reprint window expired; document permanently deleted.',
    }
  }

  // 4. Document deletion check
  if (order.pdfDeletedAt) {
    return {
      eligible: false,
      deleted: true,
      remainingSeconds: 0,
      effectiveExpiresAt,
      reason: 'Document has been permanently deleted.',
    }
  }

  // 5. PDF availability check
  if (order.hasPdf === false && !order.hasGridFsPdf && !order.driveUrl && !order.pdfBase64) {
    return {
      eligible: false,
      remainingSeconds: 0,
      effectiveExpiresAt,
      reason: 'Original PDF is no longer available in durable storage.',
    }
  }

  // 6. Payment eligibility check
  const normPay = String(order.paymentStatus || 'pending').trim().toLowerCase()
  if (['failed', 'rejected', 'cancelled'].includes(normPay)) {
    return {
      eligible: false,
      paymentBlocked: true,
      remainingSeconds: Math.max(0, Math.floor((expiryTime - serverTime) / 1000)),
      effectiveExpiresAt,
      reason: `Reprint blocked: payment status is "${order.paymentStatus}".`,
    }
  }

  const requirePay = process.env.REQUIRE_PAYMENT_VERIFICATION === 'true'
  if (requirePay && !options?.allowPending && !['paid', 'completed'].includes(normPay)) {
    return {
      eligible: false,
      paymentBlocked: true,
      remainingSeconds: Math.max(0, Math.floor((expiryTime - serverTime) / 1000)),
      effectiveExpiresAt,
      reason: `Payment authorization required: payment status is "${order.paymentStatus}".`,
    }
  }

  const remainingSeconds = Math.max(0, Math.floor((expiryTime - serverTime) / 1000))
  return {
    eligible: true,
    remainingMs: Math.max(0, expiryTime - serverTime),
    remainingSeconds,
    effectiveExpiresAt,
  }
}

/**
 * Permanently deletes all XBuddy-managed copies of expired order PDFs:
 * - MongoDB Atlas GridFS files and associated chunks
 * - Inline pdfBase64 payloads in xbuddy.orders
 * - Local disk-cache copies in .pdf_cache
 * Safeguards:
 * - Never purges an order actively in printStatus: 'Printing'
 * - Successfully printed orders: expired 30 minutes after confirmed printedAt
 * - Unprinted or failed orders: expired 24 hours after upload (pdfUploadedAt / createdAt)
 * - Preserves order records and financial/accounting data
 * - Minimizes student names, phone numbers, and original filenames where no longer needed
 */
/**
 * Constructs the MongoDB filter verifying that an XBuddy-managed PDF payload actually exists.
 * Valid storage values in schema: 'gridfs' or 'inline'.
 * - Checks pdfStorage in ['gridfs', 'inline']
 * - Checks explicit hasGridFsPdf: true
 * - Checks non-empty string in pdfBase64
 * - Accommodates legacy records (hasPdf: true with pdfStorage field missing)
 * - Explicitly prevents missing, null, empty, or 'none' / 'drive' pdfStorage fields from being treated as proof of payload
 */
export function buildPayloadExistsCondition() {
  return {
    $or: [
      { pdfStorage: { $in: ['gridfs', 'inline'] } },
      { hasGridFsPdf: true },
      {
        pdfBase64: {
          $exists: true,
          $type: 'string',
          $nin: ['', null],
        },
      },
      {
        hasPdf: true,
        pdfStorage: { $exists: false },
      },
    ],
  }
}

/**
 * Constructs the MongoDB query for expired printed orders eligible for PDF purging.
 * - Confirmed printed orders: 30 minutes after printedAt
 * - Requires existing PDF payload and no prior pdfDeletedAt
 */
export function buildEligiblePrintedQuery(serverTime = new Date(), options = {}) {
  const { orderIds } = options
  const now = serverTime instanceof Date ? serverTime.getTime() : new Date(serverTime).getTime()
  const nowIso = new Date(now).toISOString()
  const thirtyMinsAgoIso = new Date(now - RETENTION_MS_PRINTED).toISOString()

  return {
    pdfDeletedAt: { $exists: false },
    printedAt: { $exists: true, $ne: null },
    $and: [
      buildPayloadExistsCondition(),
      {
        $or: [
          { pdfExpiresAt: { $exists: true, $lte: nowIso } },
          {
            pdfExpiresAt: { $exists: false },
            printedAt: { $lte: thirtyMinsAgoIso },
          },
        ],
      },
    ],
    ...(orderIds && Array.isArray(orderIds) && orderIds.length > 0 ? { orderId: { $in: orderIds } } : {}),
  }
}

/**
 * Constructs the MongoDB query for expired unprinted orders eligible for PDF purging.
 * - Unprinted orders: 24 hours after upload / order creation
 * - Safeguard: In-progress 'Printing' orders are protected unless stalled > 30m and upload > 24h
 * - Requires existing PDF payload and no prior pdfDeletedAt
 */
export function buildEligibleUnprintedQuery(serverTime = new Date(), options = {}) {
  const { orderIds } = options
  const now = serverTime instanceof Date ? serverTime.getTime() : new Date(serverTime).getTime()
  const nowIso = new Date(now).toISOString()
  const thirtyMinsAgoIso = new Date(now - RETENTION_MS_PRINTED).toISOString()
  const twentyFourHoursAgoIso = new Date(now - RETENTION_MS_UNPRINTED).toISOString()

  return {
    pdfDeletedAt: { $exists: false },
    $and: [
      {
        $or: [
          { printedAt: { $exists: false } },
          { printedAt: null },
        ],
      },
      buildPayloadExistsCondition(),
      {
        $or: [
          { printStatus: { $ne: 'Printing' } },
          {
            printStatus: 'Printing',
            $and: [
              {
                $or: [
                  { printingAt: { $exists: true, $lte: thirtyMinsAgoIso } },
                  { printingAt: { $exists: false } },
                ],
              },
              {
                $or: [
                  { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
                  { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
                ],
              },
            ],
          },
        ],
      },
      {
        $or: [
          { pdfExpiresAt: { $exists: true, $lte: nowIso } },
          {
            pdfExpiresAt: { $exists: false },
            $or: [
              { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
              { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
            ],
          },
        ],
      },
    ],
    ...(orderIds && Array.isArray(orderIds) && orderIds.length > 0 ? { orderId: { $in: orderIds } } : {}),
  }
}

/**
 * Constructs the unified cleanup query matching any expired orders (printed or unprinted).
 * Guarantees no duplicate keys by properly nesting all conditions under $and.
 */
export function buildCleanupQuery(serverTime = new Date(), options = {}) {
  const { orderIds, additionalFilter } = options
  const now = serverTime instanceof Date ? serverTime.getTime() : new Date(serverTime).getTime()
  const nowIso = new Date(now).toISOString()
  const thirtyMinsAgoIso = new Date(now - RETENTION_MS_PRINTED).toISOString()
  const twentyFourHoursAgoIso = new Date(now - RETENTION_MS_UNPRINTED).toISOString()

  return {
    pdfDeletedAt: { $exists: false },
    $and: [
      buildPayloadExistsCondition(),
      {
        $or: [
          { printStatus: { $ne: 'Printing' } },
          {
            printStatus: 'Printing',
            $and: [
              {
                $or: [
                  { printingAt: { $exists: true, $lte: thirtyMinsAgoIso } },
                  { printingAt: { $exists: false } },
                ],
              },
              {
                $or: [
                  { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
                  { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
                ],
              },
            ],
          },
        ],
      },
      {
        $or: [
          // 1. Explicit pdfExpiresAt reached
          { pdfExpiresAt: { $exists: true, $lte: nowIso } },
          // 2. Printed orders without pdfExpiresAt: 30 minutes after printedAt
          {
            pdfExpiresAt: { $exists: false },
            printedAt: { $exists: true, $ne: null, $lte: thirtyMinsAgoIso },
          },
          // 3. Unprinted orders without pdfExpiresAt: 24 hours after upload/creation
          {
            pdfExpiresAt: { $exists: false },
            printedAt: { $exists: false },
            $or: [
              { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
              { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
            ],
          },
          {
            pdfExpiresAt: { $exists: false },
            printedAt: null,
            $or: [
              { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
              { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
            ],
          },
        ],
      },
    ],
    ...(orderIds && Array.isArray(orderIds) && orderIds.length > 0 ? { orderId: { $in: orderIds } } : {}),
    ...(additionalFilter && typeof additionalFilter === 'object' ? additionalFilter : {}),
  }
}

/**
 * Categorizes GridFS files by cross-referencing with the orders collection.
 * Distinguishes active referenced files from expired referenced files and genuinely orphaned files.
 */
export async function getGridFsInventory(db, options = {}) {
  if (!db) throw new Error('Database instance required for getGridFsInventory')
  const { serverTime = new Date(), staleMs = RETENTION_MS_UNPRINTED } = options
  const now = serverTime instanceof Date ? serverTime.getTime() : new Date(serverTime).getTime()
  const staleDate = new Date(now - staleMs)

  const filesCollection = db.collection('order_pdfs.files')
  const ordersCollection = db.collection('orders')

  const files = await filesCollection.find({}).toArray()
  const totalGridFsFiles = files.length
  let totalGridFsBytes = 0

  const fileOrderMap = new Map()
  for (const file of files) {
    totalGridFsBytes += Number(file.length || 0)
    let orderId = file.metadata?.orderId || file.metadata?.order_id
    if (!orderId && file.filename) {
      const match = file.filename.match(/^([A-Za-z0-9_-]+)\.pdf$/i)
      if (match) {
        orderId = match[1]
      }
    }
    if (orderId) {
      fileOrderMap.set(file._id.toString(), String(orderId).toUpperCase())
    }
  }

  const uniqueOrderIds = Array.from(new Set(fileOrderMap.values()))
  let orders = []
  if (uniqueOrderIds.length > 0) {
    orders = await ordersCollection.find({ orderId: { $in: uniqueOrderIds } }).toArray()
  }

  const orderMap = new Map()
  for (const ord of orders) {
    if (ord.orderId) {
      orderMap.set(ord.orderId.toUpperCase(), ord)
    }
  }

  const activeReferencedFiles = []
  const expiredReferencedFiles = []
  const genuinelyOrphanedFiles = []

  for (const file of files) {
    const fileKey = file._id.toString()
    const orderId = fileOrderMap.get(fileKey)
    const fileUploadDate = file.uploadDate ? new Date(file.uploadDate) : new Date(0)

    if (orderId && orderMap.has(orderId)) {
      const ord = orderMap.get(orderId)
      const isMarkedDeleted = Boolean(
        ord.pdfDeletedAt ||
        (ord.hasPdf === false && ord.hasGridFsPdf === false && ord.pdfStorage === 'none') ||
        (ord.pdfStorage === 'none' && !ord.hasPdf && !ord.hasGridFsPdf && (!ord.pdfBase64 || ord.pdfBase64 === '')) ||
        (ord.hasPdf === false && !ord.hasGridFsPdf && (!ord.pdfStorage || ord.pdfStorage === 'none') && (!ord.pdfBase64 || ord.pdfBase64 === ''))
      )

      if (isMarkedDeleted) {
        if (fileUploadDate <= staleDate) {
          genuinelyOrphanedFiles.push({ file, orderId, reason: 'order_pdf_already_deleted' })
        } else {
          activeReferencedFiles.push({ file, orderId, status: 'recently_marked_deleted' })
        }
      } else {
        const effectiveExpiry = getEffectiveExpiryTimestamp(ord)
        const isExpired = effectiveExpiry && new Date(effectiveExpiry).getTime() <= now
        if (isExpired) {
          expiredReferencedFiles.push({ file, orderId, effectiveExpiry, reason: 'order_expired' })
        } else {
          activeReferencedFiles.push({ file, orderId, effectiveExpiry, status: 'active_valid' })
        }
      }
    } else {
      if (fileUploadDate <= staleDate) {
        genuinelyOrphanedFiles.push({ file, orderId: orderId || null, reason: 'no_matching_order' })
      } else {
        activeReferencedFiles.push({ file, orderId: orderId || null, status: 'in_flight_recent_upload' })
      }
    }
  }

  return {
    totalGridFsFiles,
    totalGridFsBytes,
    activeReferencedFiles,
    expiredReferencedFiles,
    genuinelyOrphanedFiles,
    summary: {
      totalFiles: totalGridFsFiles,
      totalBytes: totalGridFsBytes,
      activeReferencedCount: activeReferencedFiles.length,
      expiredReferencedCount: expiredReferencedFiles.length,
      genuinelyOrphanedCount: genuinelyOrphanedFiles.length,
      genuinelyOrphanedBytes: genuinelyOrphanedFiles.reduce((sum, item) => sum + Number(item.file.length || 0), 0),
    },
  }
}

export async function cleanupExpiredPdfs(db, { logger = console, orderIds = null, additionalFilter = null, orphanStaleMs = null } = {}) {
  if (!db) throw new Error('Database instance is required for retention cleanup')

  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const ordersCollection = db.collection('orders')
  const query = buildCleanupQuery(now, { orderIds, additionalFilter })

  let expiredOrders = []
  try {
    expiredOrders = await ordersCollection.find(query).toArray()
  } catch (findErr) {
    logger.error('[RETENTION_CLEANUP_QUERY_ERR] Failed to query expired orders:', findErr.message)
    throw findErr
  }

  const cleanedOrderIds = []
  const errors = []

  if (expiredOrders.length > 0) {
    logger.log(`[RETENTION_CLEANUP] Found ${expiredOrders.length} expired order(s) to purge. Processing...`)

    for (const order of expiredOrders) {
      const orderId = order.orderId

      // Safeguard: Do not purge if order is actively in-progress printing (within 30 minutes of printingAt)
      if (order.printStatus === 'Printing') {
        const printStart = order.printingAt || order.updatedAt
        const printStartMs = printStart ? new Date(printStart).getTime() : 0
        const isActivelyPrinting = printStartMs > 0 && (now - printStartMs) < RETENTION_MS_PRINTED
        if (isActivelyPrinting) {
          logger.log(`[RETENTION_SKIP_PRINTING] Order ${orderId} is actively Printing (started ${Math.round((now - printStartMs) / 1000)}s ago); skipping cleanup`)
          continue
        }
      }

      try {
        // 1. Delete GridFS files & chunks
        try {
          await deletePdfFromGridFS(db, orderId)
        } catch (gfsErr) {
          logger.error(`[RETENTION_GRIDFS_ERR] Failed to delete GridFS PDF for ${orderId}: ${gfsErr.message}`)
          throw gfsErr // Do not proceed to mark as deleted if GridFS deletion failed
        }

        // 2. Delete local runtime disk cache if present
        const cachePath = path.join(PDF_CACHE_DIR, `${orderId}.pdf`)
        if (fs.existsSync(cachePath)) {
          try {
            fs.unlinkSync(cachePath)
            logger.log(`[RETENTION_CACHE_DEL] Purged disk cache file for ${orderId}`)
          } catch (unlinkErr) {
            logger.error(`[RETENTION_CACHE_ERR] Failed to unlink disk cache for ${orderId}: ${unlinkErr.message}`)
            throw unlinkErr
          }
        }

        // Derive authoritative expiry timestamp
        const derivedExpiry = getEffectiveExpiryTimestamp(order) || nowIso
        const reason = order.printedAt
          ? '30_minute_printed_retention_expired'
          : (order.printStatus === 'Printing' ? '24_hour_unprinted_stalled_printing_timeout' : '24_hour_unprinted_retention_expired')

        // 3. Atomically update MongoDB Atlas order document (order record and payment details PRESERVED)
        const updateResult = await ordersCollection.updateOne(
          { orderId, pdfDeletedAt: { $exists: false } },
          {
            $set: {
              hasPdf: false,
              hasGridFsPdf: false,
              pdfStorage: 'none',
              pdfBase64: '',
              pdfSize: 0,
              pdfDeletedAt: nowIso,
              pdfExpiresAt: derivedExpiry,
              updatedAt: nowIso,
            },
            $push: {
              auditLog: {
                action: 'pdf_retention_deleted',
                deletedAt: nowIso,
                reason,
                pdfExpiresAt: derivedExpiry,
              },
            },
          }
        )

        if (updateResult.modifiedCount > 0) {
          cleanedOrderIds.push(orderId)
          logger.log(`[RETENTION_CLEANUP_SUCCESS] Purged PDF for ${orderId} (reason: ${reason}, expiredAt: ${derivedExpiry})`)
        }
      } catch (err) {
        logger.error(`[RETENTION_CLEANUP_FAILED] Could not purge PDF for ${orderId}: ${err.message}`)
        errors.push({ orderId, error: err.message })
        // Notice: pdfDeletedAt is intentionally NOT set on failure, allowing safe retry on next cycle
      }
    }
  }

  // 4. Sweep orphaned or dangling GridFS files older than the retention threshold
  try {
    const filesCollection = db.collection('order_pdfs.files')
    if (filesCollection && typeof filesCollection.find === 'function') {
      const staleThresholdMs = orphanStaleMs !== null
        ? orphanStaleMs
        : (orderIds && orderIds.length > 0 ? RETENTION_MS_PRINTED : RETENTION_MS_UNPRINTED)
      const staleDate = new Date(Date.now() - staleThresholdMs)

      const orphanQuery = {
        uploadDate: { $lte: staleDate },
        ...(orderIds && Array.isArray(orderIds) && orderIds.length > 0
          ? {
              $or: [
                { filename: { $in: orderIds.map(id => `${id}.pdf`) } },
                { 'metadata.orderId': { $in: orderIds } },
              ],
            }
          : {}),
      }
      const staleFiles = await filesCollection.find(orphanQuery).toArray()
      if (staleFiles && staleFiles.length > 0) {
        const bucket = getGridFSBucket(db)
        for (const sf of staleFiles) {
          try {
            await bucket.delete(sf._id)
            logger.log(`[RETENTION_ORPHAN_CLEANUP] Purged orphaned GridFS file ${sf._id} (${sf.filename})`)
          } catch (orphanDelErr) {
            if (!orphanDelErr.message?.includes('FileNotFound')) {
              logger.warn(`[RETENTION_ORPHAN_WARN] Could not purge orphaned file ${sf._id}: ${orphanDelErr.message}`)
            }
          }
        }
      }
    }
  } catch (orphanSweepErr) {
    logger.warn(`[RETENTION_ORPHAN_SWEEP_NOTICE] ${orphanSweepErr.message}`)
  }

  if (expiredOrders.length > 0) {
    logger.log(`[RETENTION_CLEANUP_COMPLETE] Cleaned ${cleanedOrderIds.length}/${expiredOrders.length} orders. Errors: ${errors.length}`)
  }

  return {
    success: errors.length === 0,
    expiredCount: expiredOrders.length,
    cleanedCount: cleanedOrderIds.length,
    deletedCount: cleanedOrderIds.length,
    cleanedOrderIds,
    errors,
  }
}
