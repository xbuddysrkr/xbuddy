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

  // 2. Must have a valid expiry timestamp
  if (!order.pdfExpiresAt) {
    return { eligible: false, reason: 'No retention expiry timestamp recorded' }
  }

  const serverTime = new Date(serverTimeIso).getTime()
  const expiryTime = new Date(order.pdfExpiresAt).getTime()

  // 3. Expiry check (authoritative server clock)
  if (expiryTime <= serverTime) {
    return {
      eligible: false,
      expired: true,
      reason: 'Reprint window expired; document permanently deleted.',
    }
  }

  // 4. Document deletion check
  if (order.pdfDeletedAt) {
    return {
      eligible: false,
      deleted: true,
      reason: 'Document has been permanently deleted.',
    }
  }

  // 5. PDF availability check
  if (order.hasPdf === false && !order.hasGridFsPdf && !order.driveUrl && !order.pdfBase64) {
    return {
      eligible: false,
      reason: 'Original PDF is no longer available in durable storage.',
    }
  }

  // 6. Payment eligibility check
  const normPay = String(order.paymentStatus || 'pending').trim().toLowerCase()
  if (['failed', 'rejected', 'cancelled'].includes(normPay)) {
    return {
      eligible: false,
      paymentBlocked: true,
      reason: `Reprint blocked: payment status is "${order.paymentStatus}".`,
    }
  }

  const requirePay = process.env.REQUIRE_PAYMENT_VERIFICATION === 'true'
  if (requirePay && !['paid', 'completed'].includes(normPay)) {
    return {
      eligible: false,
      paymentBlocked: true,
      reason: `Payment authorization required: payment status is "${order.paymentStatus}".`,
    }
  }

  return { eligible: true, remainingMs: Math.max(0, expiryTime - serverTime) }
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

  // Find all orders that have expired and whose PDF has not yet been marked deleted
  const query = {
    pdfExpiresAt: { $exists: true, $lte: nowIso },
    pdfDeletedAt: { $exists: false },
    $or: [
      { hasPdf: true },
      { hasGridFsPdf: true },
      { pdfStorage: { $ne: 'none' } },
      { pdfBase64: { $exists: true, $ne: '' } },
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
            updatedAt: nowIso,
          },
          $push: {
            auditLog: {
              action: 'pdf_retention_deleted',
              deletedAt: nowIso,
              reason: '30_minute_retention_expired',
              pdfExpiresAt: order.pdfExpiresAt,
            },
          },
        }
      )

      if (updateResult.modifiedCount > 0) {
        cleanedOrderIds.push(orderId)
        logger.log(`[RETENTION_CLEANUP_SUCCESS] Purged PDF for ${orderId} (expiredAt: ${order.pdfExpiresAt})`)
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
    cleanedOrderIds,
    errors,
  }
}
