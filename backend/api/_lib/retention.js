import fs from 'fs'
import path from 'path'
import { deletePdfFromGridFS } from './gridfs.js'

export const RETENTION_MINUTES = 30
export const RETENTION_WINDOW_MS = RETENTION_MINUTES * 60 * 1000

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

/**
 * Calculates the immutable 30-minute retention deadline from printedAt timestamp.
 */
export function calculateExpiryTimestamp(printedAtIso) {
  const baseTime = printedAtIso ? new Date(printedAtIso).getTime() : Date.now()
  return new Date(baseTime + RETENTION_WINDOW_MS).toISOString()
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
 * - 30-minute reprint window not expired
 * - original PDF remains available in durable storage
 * - not already deleted (no pdfDeletedAt)
 * - satisfies payment authorization rules
 */
export function isOrderReprintEligible(order, serverTimeIso = new Date().toISOString()) {
  if (!order) return { eligible: false, reason: 'Order not found' }

  // 1. Must be in 'Printed' status
  if (order.printStatus !== 'Printed') {
    return { eligible: false, reason: `Order is not printed (current status: ${order.printStatus})` }
  }

  // 2. Must have a valid expiry timestamp or genuine printedAt from which 30m is derived
  const effectiveExpiresAt = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : null)
  if (!effectiveExpiresAt) {
    return { eligible: false, reason: 'No retention expiry timestamp or print timestamp recorded' }
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
  // When allowPending is true (default for reprint-to-payment flow), pending orders can begin the reprint payment flow
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
 * Updates explicit metadata: hasPdf=false, hasGridFsPdf=false, pdfStorage="none", pdfDeletedAt=ISO.
 * Preserves all canonical order metadata (orderId, amount, copies, timestamps, audit history).
 *
 * Safe to retry, observable via logs, and never reports deletion as complete if a managed copy remains.
 */
export async function cleanupExpiredPdfs(db, { logger = console, orderIds = null, additionalFilter = null } = {}) {
  if (!db) throw new Error('Database instance is required for retention cleanup')

  const nowIso = new Date().toISOString()
  const ordersCollection = db.collection('orders')

  const thirtyMinsAgoIso = new Date(Date.now() - RETENTION_WINDOW_MS).toISOString()

  // Find all orders that have expired (either by explicit pdfExpiresAt or legacy printedAt + 30m)
  // and whose PDF has not yet been marked deleted
  const query = {
    $or: [
      { pdfExpiresAt: { $exists: true, $lte: nowIso } },
      {
        pdfExpiresAt: { $exists: false },
        printedAt: { $exists: true, $ne: null, $lte: thirtyMinsAgoIso },
      },
    ],
    pdfDeletedAt: { $exists: false },
    $and: [
      {
        $or: [
          { hasPdf: true },
          { hasGridFsPdf: true },
          { pdfStorage: { $ne: 'none' } },
          { pdfBase64: { $exists: true, $ne: '' } },
        ],
      },
    ],
    ...(orderIds && Array.isArray(orderIds) && orderIds.length > 0 ? { orderId: { $in: orderIds } } : {}),
    ...(additionalFilter && typeof additionalFilter === 'object' ? additionalFilter : {}),
  }

  let expiredOrders = []
  try {
    expiredOrders = await ordersCollection.find(query).toArray()
  } catch (findErr) {
    logger.error('[RETENTION_CLEANUP_QUERY_ERR] Failed to query expired orders:', findErr.message)
    throw findErr
  }

  if (expiredOrders.length === 0) {
    return {
      success: true,
      expiredCount: 0,
      cleanedCount: 0,
      cleanedOrderIds: [],
      errors: [],
    }
  }

  logger.log(`[RETENTION_CLEANUP] Found ${expiredOrders.length} expired order(s) to purge. Processing...`)

  const cleanedOrderIds = []
  const errors = []

  for (const order of expiredOrders) {
    const orderId = order.orderId
    try {
      // 1. Delete GridFS files & chunks
      try {
        await deletePdfFromGridFS(db, orderId)
      } catch (gfsErr) {
        logger.error(`[RETENTION_GRIDFS_ERR] Failed to delete GridFS PDF for ${orderId}: ${gfsErr.message}`)
        throw gfsErr // Do not proceed to mark as deleted if GridFS failed
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

      // Derive genuine expiry from printedAt if pdfExpiresAt was not previously set
      const derivedExpiry = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : nowIso)

      // 3. Atomically update MongoDB Atlas order document
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
              reason: '30_minute_retention_expired',
              pdfExpiresAt: derivedExpiry,
            },
          },
        }
      )

      if (updateResult.modifiedCount > 0) {
        cleanedOrderIds.push(orderId)
        logger.log(`[RETENTION_CLEANUP_SUCCESS] Purged PDF for ${orderId} (expiredAt: ${derivedExpiry})`)
      }
    } catch (err) {
      logger.error(`[RETENTION_CLEANUP_FAILED] Could not purge PDF for ${orderId}: ${err.message}`)
      errors.push({ orderId, error: err.message })
      // Notice: pdfDeletedAt is intentionally NOT set on failure, allowing safe retry on next cycle
    }
  }

  logger.log(`[RETENTION_CLEANUP_COMPLETE] Cleaned ${cleanedOrderIds.length}/${expiredOrders.length} orders. Errors: ${errors.length}`)

  return {
    success: errors.length === 0,
    expiredCount: expiredOrders.length,
    cleanedCount: cleanedOrderIds.length,
    deletedCount: cleanedOrderIds.length,
    cleanedOrderIds,
    errors,
  }
}
