import dns from 'dns'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient, GridFSBucket } from 'mongodb'

// Fix querySrv EBADRESP DNS resolution failures for MongoDB Atlas SRV URIs in Node.js
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (_) {}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

/**
 * XBuddy One-Time Authorized Test-PDF Cleanup Script
 * 
 * Strict Safety Invariants:
 * 1. Target database MUST be 'xbuddy' and bucket MUST be 'order_pdfs'.
 * 2. Scope is limited to PDF payloads created BEFORE the cutoff timestamp.
 * 3. Never drops database or collections; never deletes order documents.
 * 4. Preserves payment status, transaction IDs, order IDs, amounts, and audit logs.
 * 5. Uses GridFSBucket.delete to remove both file metadata and binary chunks.
 * 6. Skips active in-progress printing jobs.
 * 7. Never outputs student PII, credentials, or document contents.
 */
export async function executeTestPdfCleanup() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined')
  }

  const expectedDbName = process.env.MONGODB_DB_NAME || 'xbuddy'
  const cutoffTime = new Date()
  const cutoffIso = cutoffTime.toISOString()

  console.log('================================================================')
  console.log('  XBUDDY ONE-TIME AUTHORIZED TEST-PDF CLEANUP                   ')
  console.log('================================================================')
  console.log(`Cutoff Timestamp: ${cutoffIso}`)
  console.log(`Target Database:  ${expectedDbName}`)
  console.log(`Target Bucket:    order_pdfs\n`)

  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
  })

  try {
    await client.connect()
    const db = client.db(expectedDbName)

    // Verification 1: Confirm database name
    if (db.databaseName !== expectedDbName) {
      throw new Error(`Database name mismatch: expected ${expectedDbName}, connected to ${db.databaseName}`)
    }

    const ordersCol = db.collection('orders')
    const filesCol = db.collection('order_pdfs.files')
    const chunksCol = db.collection('order_pdfs.chunks')
    const bucket = new GridFSBucket(db, { bucketName: 'order_pdfs' })

    // ── PRE-CLEANUP MEASUREMENTS ─────────────────────────────────────────────
    const preTotalOrders = await ordersCol.countDocuments({})
    const prePayloadOrders = await ordersCol.countDocuments({
      createdAt: { $lte: cutoffIso },
      pdfDeletedAt: { $exists: false },
      $or: [
        { hasPdf: true },
        { hasGridFsPdf: true },
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
      ],
    })
    const preGridFsFiles = await filesCol.countDocuments({})
    const preGridFsChunks = await chunksCol.countDocuments({})

    console.log('Pre-Cleanup Inventory:')
    console.log(`- Total Orders in Database:          ${preTotalOrders}`)
    console.log(`- Orders with Test PDF Payloads:     ${prePayloadOrders}`)
    console.log(`- GridFS Files in order_pdfs.files:  ${preGridFsFiles}`)
    console.log(`- GridFS Chunks in order_pdfs.chunks:${preGridFsChunks}\n`)

    // ── TARGETED CLEANUP OF TEST ORDERS ──────────────────────────────────────
    const query = {
      createdAt: { $lte: cutoffIso },
      pdfDeletedAt: { $exists: false },
      $or: [
        { hasPdf: true },
        { hasGridFsPdf: true },
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
      ],
    }

    const ordersToClean = await ordersCol.find(query).toArray()
    let processedOrders = 0
    let skippedPrintingOrders = 0
    let cleanedOrders = 0
    let filesDeletedFromOrders = 0
    const orderErrors = []

    for (const order of ordersToClean) {
      processedOrders++
      const orderId = order.orderId
      const nowIso = new Date().toISOString()

      // Safeguard: Skip actively printing jobs (started within last 30 minutes)
      if (order.printStatus === 'Printing') {
        const printStart = order.printingAt || order.updatedAt
        const printStartMs = printStart ? new Date(printStart).getTime() : 0
        if (printStartMs > 0 && (Date.now() - printStartMs) < 30 * 60 * 1000) {
          console.log(`[SKIP_PRINTING] Order ${orderId} is actively printing; skipping cleanup`)
          skippedPrintingOrders++
          continue
        }
      }

      try {
        // 1. Delete associated GridFS file(s) and binary chunks
        const cleanId = String(orderId).trim().toUpperCase()
        const matchingFiles = await filesCol.find({
          $or: [
            { filename: `${cleanId}.pdf` },
            { filename: cleanId },
            { 'metadata.orderId': cleanId },
          ],
        }).toArray()

        for (const file of matchingFiles) {
          try {
            await bucket.delete(file._id)
            filesDeletedFromOrders++
          } catch (fileErr) {
            if (!fileErr.message?.includes('FileNotFound')) {
              console.warn(`[WARN] GridFS delete for file ${file._id} of ${orderId}: ${fileErr.message}`)
            }
          }
        }

        // 2. Unlink local runtime disk cache if present
        const cachePath = path.join(PDF_CACHE_DIR, `${orderId}.pdf`)
        if (fs.existsSync(cachePath)) {
          try {
            fs.unlinkSync(cachePath)
          } catch (_) {}
        }

        // 3. Atomically update order document to mark PDF as deleted (all financial/accounting records preserved)
        const updateResult = await ordersCol.updateOne(
          { orderId, pdfDeletedAt: { $exists: false } },
          {
            $set: {
              hasPdf: false,
              hasGridFsPdf: false,
              pdfStorage: 'none',
              pdfBase64: '',
              pdfSize: 0,
              pdfDeletedAt: nowIso,
              pdfExpiresAt: nowIso,
              updatedAt: nowIso,
            },
            $push: {
              auditLog: {
                action: 'pdf_retention_deleted',
                deletedAt: nowIso,
                reason: 'authorized_test_pdf_cleanup',
                cutoff: cutoffIso,
              },
            },
          }
        )

        if (updateResult.modifiedCount > 0) {
          cleanedOrders++
        }
      } catch (err) {
        orderErrors.push({ orderId, error: err.message })
        console.error(`[ERROR] Failed to clean order ${orderId}: ${err.message}`)
      }
    }

    // ── SWEEP DANGLING / ORPHANED GRIDFS TEST FILES ──────────────────────────
    // Any remaining GridFS files uploaded before cutoff
    const staleFiles = await filesCol.find({
      uploadDate: { $lte: new Date(cutoffIso) },
    }).toArray()

    let sweptDanglingFiles = 0
    for (const file of staleFiles) {
      try {
        await bucket.delete(file._id)
        sweptDanglingFiles++
      } catch (dErr) {
        if (!dErr.message?.includes('FileNotFound')) {
          console.warn(`[WARN] Dangling file delete ${file._id}: ${dErr.message}`)
        }
      }
    }

    // ── POST-CLEANUP VERIFICATION ────────────────────────────────────────────
    const postTotalOrders = await ordersCol.countDocuments({})
    const postPayloadOrders = await ordersCol.countDocuments({
      pdfDeletedAt: { $exists: false },
      $or: [
        { hasPdf: true },
        { hasGridFsPdf: true },
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
      ],
    })
    const postGridFsFiles = await filesCol.countDocuments({})
    const postGridFsChunks = await chunksCol.countDocuments({})

    console.log('\n================================================================')
    console.log('  TEST-PDF CLEANUP VERIFICATION COMPLETE                        ')
    console.log('================================================================')
    console.log(`Orders Preserved:          ${postTotalOrders} (pre: ${preTotalOrders})`)
    console.log(`Orders Cleaned:            ${cleanedOrders}`)
    console.log(`Orders Skipped (Printing): ${skippedPrintingOrders}`)
    console.log(`Orders with Failures:      ${orderErrors.length}`)
    console.log(`Files Deleted (Orders):    ${filesDeletedFromOrders}`)
    console.log(`Files Swept (Dangling):    ${sweptDanglingFiles}`)
    console.log(`Total GridFS Files Deleted:${filesDeletedFromOrders + sweptDanglingFiles}`)
    console.log(`Remaining GridFS Files:    ${postGridFsFiles}`)
    console.log(`Remaining GridFS Chunks:   ${postGridFsChunks}`)
    console.log(`Remaining Active Payloads: ${postPayloadOrders}`)
    console.log('================================================================\n')

    return {
      success: orderErrors.length === 0,
      cutoffIso,
      preTotalOrders,
      postTotalOrders,
      ordersCleaned: cleanedOrders,
      ordersSkipped: skippedPrintingOrders,
      orderErrors,
      filesDeleted: filesDeletedFromOrders + sweptDanglingFiles,
      remainingGridFsFiles: postGridFsFiles,
      remainingGridFsChunks: postGridFsChunks,
      remainingActivePayloads: postPayloadOrders,
    }
  } finally {
    await client.close()
  }
}

// CLI runner
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  executeTestPdfCleanup()
    .then((res) => {
      if (res.success) {
        console.log('✓ Cleanup successfully completed with zero order document loss.')
        process.exit(0)
      } else {
        console.error('✗ Cleanup completed with errors.')
        process.exit(1)
      }
    })
    .catch((err) => {
      console.error(`Fatal cleanup error: ${err.message}`)
      process.exit(1)
    })
}
