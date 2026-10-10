import fs from 'fs'
import path from 'path'
import { connectToDatabase } from './_lib/mongodb.js'
import {
  savePdfToGridFS,
  getPdfStreamFromGridFS,
  deletePdfFromGridFS,
  hasPdfInGridFS,
  getGridFSBucket,
} from './_lib/gridfs.js'
import {
  calculateExpiryTimestamp,
  calculateOrderPrice,
  isOrderReprintEligible,
  cleanupExpiredPdfs,
} from './_lib/retention.js'

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

export function savePdfToDiskCache(orderId, pdfInput) {
  if (!orderId || !pdfInput) return false
  try {
    if (!fs.existsSync(PDF_CACHE_DIR)) {
      fs.mkdirSync(PDF_CACHE_DIR, { recursive: true })
    }
    const cleanId = String(orderId).trim().toUpperCase()
    const filePath = path.join(PDF_CACHE_DIR, `${cleanId}.pdf`)
    let pdfBuffer = null
    if (Buffer.isBuffer(pdfInput)) {
      pdfBuffer = pdfInput
    } else if (typeof pdfInput === 'string' && pdfInput.length > 0) {
      pdfBuffer = Buffer.from(pdfInput, 'base64')
    }
    if (pdfBuffer && pdfBuffer.length > 0) {
      fs.writeFileSync(filePath, pdfBuffer)
      console.log(`[PDF_CACHE] Cached ${cleanId}.pdf (${pdfBuffer.length} bytes) to disk`)
      return true
    }
  } catch (err) {
    console.warn(`[PDF_CACHE_WARN] Failed to write disk cache for ${orderId}: ${err.message}`)
  }
  return false
}

const GAS_API_URL = process.env.GAS_ORDERS_URL || process.env.GAS_URL || process.env.GAS_API_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || process.env.API_KEY || 'XB_API_SECRET_KEY_2026'

/**
 * Feature flag for Orders read source: 'mongo' (default for Phase 4) or 'gas' (rollback).
 * Does NOT affect Campus Ads.
 */
export const getOrdersReadSource = () => (process.env.ORDERS_READ_SOURCE || 'mongo').trim().toLowerCase()

/**
 * Feature flag for Orders Sheet write mode: 'mongo' (default for Phase 4) or 'dual' (rollback).
 * In 'mongo' mode, Google Sheet writes are disabled and the Sheet acts as a frozen historical archive.
 * In 'dual' mode, orders and statuses dual-write to both MongoDB Atlas and Google Sheets.
 * Does NOT affect Campus Ads.
 */
export const getOrdersSheetWriteMode = () => (process.env.ORDERS_SHEET_WRITE_MODE || 'mongo').trim().toLowerCase()

const STATUS_PRIORITY = {
  printed: 3,
  printing: 2,
  waiting_for_shopkeeper: 1,
}

/**
 * Deduplicates raw Google Sheet orders by canonical orderId when falling back to GAS.
 * Collapses duplicate historical rows using deterministic Phase 2.5 canonical selection:
 * 1. Highest printStatus priority (e.g. 'Printed' > 'waiting_for_shopkeeper')
 * 2. Earliest valid createdAt timestamp
 */
export function deduplicateSheetOrders(sheetOrders = []) {
  const map = new Map()
  for (const row of sheetOrders) {
    const id = String(row.orderId || row.id || '').trim().toUpperCase()
    if (!id) continue
    if (!map.has(id)) {
      map.set(id, row)
    } else {
      const bestRow = map.get(id)
      const bestPrio = STATUS_PRIORITY[String(bestRow.printStatus || '').toLowerCase()] || 0
      const candPrio = STATUS_PRIORITY[String(row.printStatus || '').toLowerCase()] || 0
      if (candPrio > bestPrio) {
        map.set(id, row)
      } else if (candPrio === bestPrio) {
        const bestTime = new Date(bestRow.createdAt || 0).getTime()
        const candTime = new Date(row.createdAt || 0).getTime()
        if (candTime > 0 && (bestTime === 0 || candTime < bestTime)) {
          map.set(id, row)
        }
      }
    }
  }
  return Array.from(map.values())
}

/**
 * Normalizes selectedPages array safely.
 * Preserves actual selected page numbers (e.g. [1, 3, 5]).
 * Never converts Custom Range into all pages.
 */
export function normalizeSelectedPages(input) {
  if (Array.isArray(input)) {
    return input.map(p => Number(p)).filter(p => !isNaN(p) && p > 0)
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) {
        return parsed.map(p => Number(p)).filter(p => !isNaN(p) && p > 0)
      }
    } catch {}
    const commaSeparated = input.split(',').map(s => Number(s.trim())).filter(p => !isNaN(p) && p > 0)
    if (commaSeparated.length > 0) return commaSeparated
  }
  return []
}

/**
 * Validates order payload before database operations.
 */
export function validateOrderPayload(data) {
  const errors = []
  const orderId = String(data.orderId || '').trim().toUpperCase()

  if (!orderId || !/^XB\d{3,}$/i.test(orderId)) {
    errors.push('Invalid or missing orderId format (expected XB followed by digits)')
  }

  const copies = Number(data.copies)
  if (isNaN(copies) || copies < 1 || copies > 1000) {
    errors.push('Copies must be a number between 1 and 1000')
  }

  const amount = Number(data.amount)
  if (isNaN(amount) || amount < 0) {
    errors.push('Amount must be a non-negative number')
  }

  // Strict PDF Validation: order MUST include either a valid Base64 PDF or Google Drive URL
  const hasDriveUrl = Boolean(data.driveUrl && typeof data.driveUrl === 'string' && data.driveUrl.trim().startsWith('http'))
  const rawPdfBase64 = data.pdfBase64
  const hasBase64 = Boolean(rawPdfBase64 && typeof rawPdfBase64 === 'string' && rawPdfBase64.length >= 50)

  if (!hasDriveUrl && !hasBase64) {
    errors.push('Order must include a valid PDF file (Base64) or Google Drive URL')
  } else if (hasBase64) {
    try {
      const sample = Buffer.from(rawPdfBase64.slice(0, 100), 'base64')
      if (sample.length < 5 || sample.subarray(0, 4).toString('ascii') !== '%PDF') {
        errors.push('Uploaded file is not a valid PDF document (missing %PDF- header)')
      }
    } catch {
      errors.push('Invalid Base64 encoding for PDF document')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    cleanId: orderId,
  }
}

/**
 * Determines whether two orders represent the same logical print order
 * for safe idempotency checking on student retries.
 */
export function isSameLogicalOrder(existing, incoming) {
  if (!existing || !incoming) return false
  const cleanStr = (s) => String(s || '').trim().toLowerCase()
  const toNum = (n) => Number(n) || 0

  const sameAmount = toNum(existing.amount) === toNum(incoming.amount)
  const sameCopies = toNum(existing.copies) === toNum(incoming.copies)
  const sameFile = cleanStr(existing.fileName) === cleanStr(incoming.fileName)
  const sameColor = cleanStr(existing.colorMode) === cleanStr(incoming.colorMode)
  const sameRange = cleanStr(existing.pageRange) === cleanStr(incoming.pageRange)

  return sameAmount && sameCopies && sameFile && sameColor && sameRange
}

/**
 * Forward request to existing Google Apps Script Orders backend.
 */
export async function writeToGoogleAppsScript(params) {
  const url = `${GAS_API_URL}?${new URLSearchParams({ ...params, key: GAS_API_KEY }).toString()}`
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Google Apps Script HTTP ${res.status}`)
  return await res.json()
}

/**
 * Serverless API Handler: /api/orders
 */
export default async function handler(req, res) {
  // CRITICAL FIREWALL: Disallow any Campus Ads requests through /api/orders
  const actionParam = (req.query?.action || req.body?.action || '').trim()
  if (actionParam && (actionParam.includes('Ad') || actionParam.includes('ad'))) {
    return res.status(400).json({
      success: false,
      error: 'Campus Ads must use the dedicated Google Apps Script endpoint.',
    })
  }

  const method = req.method
  const action = (req.body?.action || req.query?.action || (method === 'POST' ? 'saveOrder' : 'listOrders')).trim()

  try {
    // ── 1. SAVE ORDER (DUAL-WRITE + IDEMPOTENCY + RECOVERY) ──────────────────
    if (action === 'saveOrder') {
      const payload = req.body || req.query || {}
      const validation = validateOrderPayload(payload)
      if (!validation.isValid) {
        return res.status(400).json({ success: false, errors: validation.errors })
      }

      const cleanId = validation.cleanId
      const nowIso = new Date().toISOString()
      const rawPages = payload.selectedPages
      const normalizedPages = normalizeSelectedPages(rawPages)

      const normalizedColor = (payload.colorMode === 'color' || payload.printType === 'Color') ? 'color' : 'bw'
      const isDuplex = payload.duplex === true || payload.duplex === 'true' || payload.printSide === 'Double'
      const resolvedPaperSize = String(payload.paperSize || payload.pageSize || 'A4').trim().toUpperCase()

      const rawPdfBase64 = typeof payload.pdfBase64 === 'string' ? payload.pdfBase64.trim() : ''
      let pdfBuffer = null
      let hasValidPdf = false
      if (rawPdfBase64 && rawPdfBase64.length >= 50) {
        try {
          const buf = Buffer.from(rawPdfBase64, 'base64')
          if (buf.length >= 5 && buf.subarray(0, 4).toString('ascii') === '%PDF') {
            pdfBuffer = buf
            hasValidPdf = true
          }
        } catch {}
      }

      const hasDriveUrl = Boolean(payload.driveUrl && typeof payload.driveUrl === 'string' && payload.driveUrl.trim().startsWith('http'))

      const orderDoc = {
        orderId:              cleanId,
        name:                 String(payload.name || '').trim(),
        fileName:             String(payload.fileName || 'Document.pdf').trim(),
        totalPages:           Number(payload.totalPages) || 1,
        copies:               Number(payload.copies) || 1,
        colorMode:            normalizedColor,
        printType:            normalizedColor === 'color' ? 'Color' : 'B&W',
        printSide:            isDuplex ? 'Double' : 'Single',
        duplex:               isDuplex,
        pageSize:             resolvedPaperSize,
        paperSize:            resolvedPaperSize,
        orientation:          String(payload.orientation || 'portrait').trim().toLowerCase(),
        amount:               Number(payload.amount) || 0,
        printingCost:         Number(payload.printingCost) || 0,
        serviceFee:           Number(payload.serviceFee) || 0,
        digitalProcessingFee: Number(payload.digitalProcessingFee || payload.serviceFee) || 0,
        transactionId:        String(payload.transactionId || '').trim(),
        pageRange:            String(payload.pageRange || 'all').trim(),
        pageRangeMode:        String(payload.pageRangeMode || (payload.pageRange === 'all' ? 'all' : 'custom')).trim(),
        customPages:          String(payload.customPages || '').trim(),
        printableCount:       Number(payload.printableCount) || (normalizedPages.length > 0 ? normalizedPages.length : 1),
        selectedPages:        normalizedPages,
        selectedPageCount:    normalizedPages.length > 0 ? normalizedPages.length : (Number(payload.selectedPageCount) || 1),
        driveUrl:             hasDriveUrl ? String(payload.driveUrl).trim() : '',
        hasPdf:               false,
        hasGridFsPdf:         false,
        pdfStorage:           'none',
        pdfSize:              pdfBuffer ? pdfBuffer.length : 0,
        // Store inline Base64 only for small files (< 2MB) for legacy compatibility.
        // Large files store '' in the document to prevent BSON size limits and Atlas explorer freezing.
        pdfBase64:            (hasValidPdf && pdfBuffer.length < 2 * 1024 * 1024) ? rawPdfBase64 : '',
        paymentStatus:        String(payload.paymentStatus || 'pending').trim().toLowerCase(),
        printStatus:          'waiting_for_shopkeeper',
        createdAt:            nowIso,
        updatedAt:            nowIso,
        syncStatus:           'pending',
        mongoSaved:           false,
        sheetsSaved:          false,
      }

      const gasPayload = {
        action: 'saveOrder',
        orderId: cleanId,
        name: orderDoc.name,
        fileName: orderDoc.fileName,
        totalPages: String(orderDoc.totalPages),
        copies: String(orderDoc.copies),
        colorMode: orderDoc.colorMode,
        printType: orderDoc.printType,
        printSide: orderDoc.printSide,
        duplex: String(orderDoc.duplex),
        pageSize: orderDoc.pageSize,
        paperSize: orderDoc.paperSize,
        orientation: orderDoc.orientation,
        amount: String(orderDoc.amount),
        printingCost: String(orderDoc.printingCost),
        serviceFee: String(orderDoc.serviceFee),
        digitalProcessingFee: String(orderDoc.digitalProcessingFee),
        transactionId: orderDoc.transactionId,
        pageRange: orderDoc.pageRange,
        pageRangeMode: orderDoc.pageRangeMode,
        customPages: orderDoc.customPages,
        printableCount: String(orderDoc.printableCount),
        selectedPages: JSON.stringify(orderDoc.selectedPages),
        selectedPageCount: String(orderDoc.selectedPageCount),
        driveUrl: orderDoc.driveUrl,
      }

      // Connect to MongoDB
      let mongoDb = null
      let ordersCollection = null
      let mongoConnectError = null

      try {
        const { db } = await connectToDatabase()
        mongoDb = db
        ordersCollection = db.collection('orders')
      } catch (connErr) {
        mongoConnectError = connErr.message
      }

      // Check if orderId already exists in MongoDB
      let existingMongo = null
      if (ordersCollection) {
        try {
          existingMongo = await ordersCollection.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
        } catch (findErr) {
          console.warn(`[MongoDB find notice]: ${findErr.message}`)
        }
      }

      const sheetWriteMode = getOrdersSheetWriteMode()
      const isSheetWriteEnabled = sheetWriteMode === 'dual'

      if (!isSheetWriteEnabled) {
        console.log(`[SHEET_WRITE_DISABLED] Google Sheet writes disabled (ORDERS_SHEET_WRITE_MODE=${sheetWriteMode}). MongoDB is authoritative write target.`)
      }

      // ── CHECK 1: Existing MongoDB Document (Idempotency vs Conflict) ──────
      if (existingMongo) {
        // Conflicting duplicate orderId payload
        if (!isSameLogicalOrder(existingMongo, orderDoc)) {
          console.warn(`[Conflict 409] Order ${cleanId} exists with different payload details.`)
          return res.status(409).json({
            success: false,
            conflict: true,
            error: `Conflict: orderId ${cleanId} already exists with different order details`,
          })
        }

        // Same orderId + same logical order => IDEMPOTENT RETRY
        if (!isSheetWriteEnabled || existingMongo.sheetsSaved || existingMongo.syncStatus === 'synced') {
          console.log(`[Idempotent Retry] Order ${cleanId} already synchronized.`)
          return res.status(200).json({
            success: true,
            orderId: cleanId,
            idempotent: true,
            mongoSaved: true,
            sheetsSaved: !!existingMongo.sheetsSaved,
            syncStatus: isSheetWriteEnabled ? 'synced' : 'mongo_only',
            message: 'Order already synchronized (idempotent retry)',
          })
        }

        // Dual-write rollback mode: Case B Reconciliation (Mongo saved previously, but Sheet was pending/failed)
        try {
          const gasRes = await writeToGoogleAppsScript(gasPayload)
          if (gasRes?.success) {
            await ordersCollection.updateOne(
              { orderId: cleanId },
              {
                $set: {
                  sheetsSaved: true,
                  syncStatus: 'synced',
                  updatedAt: new Date().toISOString(),
                },
                $unset: { syncError: '' },
              }
            )
            console.log(`[Case B Recovery] Order ${cleanId} successfully synced to Google Sheets on retry`)
            return res.status(200).json({
              success: true,
              orderId: cleanId,
              idempotent: true,
              recovered: true,
              mongoSaved: true,
              sheetsSaved: true,
              syncStatus: 'synced',
              message: 'Order recovered and synchronized with Google Sheets',
            })
          } else {
            const sErr = gasRes?.error || 'GAS write rejected'
            await ordersCollection.updateOne(
              { orderId: cleanId },
              { $set: { syncError: sErr, updatedAt: new Date().toISOString() } }
            )
            return res.status(502).json({
              success: false,
              orderId: cleanId,
              idempotent: true,
              error: `Google Sheet dual-write retry failed: ${sErr}`,
              mongoSaved: true,
              sheetsSaved: false,
              syncStatus: 'sheets_pending',
            })
          }
        } catch (gasRetryErr) {
          await ordersCollection.updateOne(
            { orderId: cleanId },
            { $set: { syncError: gasRetryErr.message, updatedAt: new Date().toISOString() } }
          )
          return res.status(502).json({
            success: false,
            orderId: cleanId,
            idempotent: true,
            error: `Google Sheet dual-write retry failed: ${gasRetryErr.message}`,
            mongoSaved: true,
            sheetsSaved: false,
            syncStatus: 'sheets_pending',
          })
        }
      }

      // ── CHECK 2: MongoDB document does not exist yet. ─────────────────────
      // Phase 4 default: MongoDB Authoritative Only (Google Sheet writes disabled)
      if (!isSheetWriteEnabled) {
        if (!ordersCollection) {
          return res.status(500).json({
            success: false,
            orderId: cleanId,
            error: `MongoDB unavailable: ${mongoConnectError}`,
          })
        }

        // DURABLE PERSISTENCE: Save PDF buffer to GridFS and Disk Cache before inserting orderDoc
        let gridFsSaved = false
        let cacheSaved = false

        if (pdfBuffer && mongoDb) {
          try {
            await savePdfToGridFS(mongoDb, cleanId, pdfBuffer, { fileName: orderDoc.fileName })
            gridFsSaved = true
            console.log(`[GRIDFS] Order ${cleanId} PDF successfully stored in MongoDB Atlas GridFS (${pdfBuffer.length} bytes)`)
          } catch (gridErr) {
            console.error(`[GRIDFS_ERROR] Failed to save PDF to GridFS for ${cleanId}:`, gridErr.message)
          }
        }

        // Ephemeral local cache write for read acceleration
        if (pdfBuffer) {
          cacheSaved = savePdfToDiskCache(cleanId, pdfBuffer)
        }

        const isLargePdf = Boolean(pdfBuffer && pdfBuffer.length >= 2 * 1024 * 1024)
        const isInlineDurable = Boolean(!isLargePdf && orderDoc.pdfBase64 && orderDoc.pdfBase64.length > 50)

        // DURABLE STORAGE POLICY:
        // 1. For PDFs >= 2MB: GridFS upload MUST succeed (or valid Drive URL).
        //    Render local filesystem alone MUST NEVER qualify as durable storage.
        // 2. For PDFs < 2MB: Either GridFS upload succeeds OR inline Base64 is stored in the MongoDB Atlas order document (or valid Drive URL).
        // 3. Disk cache on Render is ephemeral acceleration ONLY and never satisfies durable storage.
        const isDurablyStored = isLargePdf
          ? Boolean(gridFsSaved || hasDriveUrl)
          : Boolean(gridFsSaved || isInlineDurable || hasDriveUrl)

        if (!isDurablyStored) {
          console.error(`[DURABILITY_GATE_FAILED] Order ${cleanId} PDF could not be persisted to durable storage. Ephemeral local cache alone does NOT qualify. Rejecting order.`)
          const cachePath = path.join(PDF_CACHE_DIR, `${cleanId}.pdf`)
          if (fs.existsSync(cachePath)) {
            try { fs.unlinkSync(cachePath) } catch {}
          }
          return res.status(500).json({
            success: false,
            orderId: cleanId,
            error: isLargePdf
              ? 'Failed to durably store large PDF in MongoDB Atlas GridFS. Local disk cache alone does not qualify as durable storage. Order was not saved.'
              : 'Failed to durably store order PDF in MongoDB Atlas (GridFS or inline document). Order was not saved.',
            hasPdf: false,
            hasGridFsPdf: false,
          })
        }

        // Set authoritative durable storage metadata on orderDoc
        orderDoc.hasGridFsPdf = Boolean(gridFsSaved)
        orderDoc.hasPdf = Boolean(gridFsSaved || isInlineDurable || hasDriveUrl)
        orderDoc.pdfStorage = gridFsSaved ? 'gridfs' : (isInlineDurable ? 'inline' : (hasDriveUrl ? 'drive' : 'none'))

        try {
          orderDoc.mongoSaved = true
          orderDoc.sheetsSaved = false
          orderDoc.syncStatus = 'mongo_only'
          await ordersCollection.insertOne(orderDoc)
          console.log(`[MONGO_ORDER_WRITE_PRIMARY] Order ${cleanId} successfully saved to MongoDB Atlas (hasPdf=${orderDoc.hasPdf}, storage=${orderDoc.pdfStorage})`)
          return res.status(200).json({
            success: true,
            orderId: cleanId,
            hasPdf: orderDoc.hasPdf,
            hasGridFsPdf: orderDoc.hasGridFsPdf,
            pdfStorage: orderDoc.pdfStorage,
            mongoSaved: true,
            sheetsSaved: false,
            syncStatus: 'mongo_only',
            message: 'Order saved in MongoDB Atlas (authoritative; Google Sheet writes disabled)',
          })
        } catch (mErr) {
          console.error(`[MongoDB Insert Failed] Order ${cleanId}: ${mErr.message}`)
          const cachePath = path.join(PDF_CACHE_DIR, `${cleanId}.pdf`)
          if (fs.existsSync(cachePath)) {
            try { fs.unlinkSync(cachePath) } catch {}
          }
          // Rollback: Clean up orphaned GridFS file if GridFS upload had succeeded
          if (gridFsSaved && mongoDb) {
            try {
              await deletePdfFromGridFS(mongoDb, cleanId)
              console.log(`[GRIDFS_ROLLBACK] Cleaned up orphaned GridFS PDF for ${cleanId} after MongoDB insert failure`)
            } catch (delErr) {
              console.warn(`[GRIDFS_ROLLBACK_WARN] Failed to delete GridFS file for ${cleanId}:`, delErr.message)
            }
          }
          return res.status(500).json({
            success: false,
            orderId: cleanId,
            error: `MongoDB write failed: ${mErr.message}`,
            hasPdf: false,
            hasGridFsPdf: false,
          })
        }
      }

      // Dual-write mode (Rollback path): check Google Sheets and dual-write
      let existingInSheets = false
      try {
        const gasCheck = await writeToGoogleAppsScript({ action: 'getOrderStatus', orderId: cleanId })
        if (gasCheck?.success && gasCheck?.order) {
          existingInSheets = true
          if (!isSameLogicalOrder(gasCheck.order, orderDoc)) {
            return res.status(409).json({
              success: false,
              conflict: true,
              error: `Conflict: orderId ${cleanId} already exists in Google Sheet with different details`,
            })
          }
        }
      } catch (gasCheckErr) {
        // Network timeout checking GAS status, proceed to standard dual-write
      }

      let mongoSaved = false
      let sheetsSaved = existingInSheets
      let mongoError = mongoConnectError
      let sheetsError = null

      // Step A: Save to MongoDB
      if (ordersCollection) {
        try {
          const isLargePdf = Boolean(pdfBuffer && pdfBuffer.length >= 2 * 1024 * 1024)
          let gridFsSaved = false

          if (pdfBuffer && mongoDb) {
            try {
              await savePdfToGridFS(mongoDb, cleanId, pdfBuffer, { fileName: orderDoc.fileName })
              gridFsSaved = true
            } catch (gErr) {
              console.error(`[GRIDFS_ERROR] ${cleanId}:`, gErr.message)
            }
          }
          if (pdfBuffer) savePdfToDiskCache(cleanId, pdfBuffer)

          const isInlineDurable = Boolean(!isLargePdf && orderDoc.pdfBase64 && orderDoc.pdfBase64.length > 50)
          const isDurablyStored = isLargePdf
            ? Boolean(gridFsSaved || hasDriveUrl)
            : Boolean(gridFsSaved || isInlineDurable || hasDriveUrl)

          if (!isDurablyStored) {
            throw new Error(isLargePdf
              ? 'Failed to durably store large PDF in MongoDB Atlas GridFS. Local disk cache alone does not qualify.'
              : 'Failed to durably store order PDF in MongoDB Atlas (GridFS or inline document).')
          }

          orderDoc.hasGridFsPdf = Boolean(gridFsSaved)
          orderDoc.hasPdf = Boolean(gridFsSaved || isInlineDurable || hasDriveUrl)
          orderDoc.pdfStorage = gridFsSaved ? 'gridfs' : (isInlineDurable ? 'inline' : (hasDriveUrl ? 'drive' : 'none'))
          orderDoc.mongoSaved = true
          orderDoc.sheetsSaved = existingInSheets
          orderDoc.syncStatus = existingInSheets ? 'synced' : 'pending'

          await ordersCollection.insertOne(orderDoc)
          mongoSaved = true
          console.log(`[MONGO_ORDER_WRITE_PRIMARY] Order ${cleanId} saved to MongoDB Atlas (dual-write mode)`)
        } catch (mErr) {
          mongoError = mErr.message
          console.error(`[MongoDB Insert Failed] Order ${cleanId}: ${mErr.message}`)
          if (mongoDb) {
            try {
              await deletePdfFromGridFS(mongoDb, cleanId)
            } catch {}
          }
        }
      }

      // Step B: Save to Google Sheets (if not already existing in sheet)
      if (!existingInSheets) {
        try {
          const gasRes = await writeToGoogleAppsScript(gasPayload)
          if (gasRes?.success) {
            sheetsSaved = true
            console.log(`[Google Sheet Write] Order ${cleanId} successfully saved to Google Sheet`)
          } else {
            sheetsError = gasRes?.error || 'GAS write returned failure'
          }
        } catch (sErr) {
          sheetsError = sErr.message
          console.error(`[Google Sheet Write Failed] Order ${cleanId}: ${sErr.message}`)
        }
      }

      // Step C: Update MongoDB sync state if both or either succeeded
      if (ordersCollection && mongoSaved) {
        try {
          await ordersCollection.updateOne(
            { orderId: cleanId },
            {
              $set: {
                sheetsSaved,
                syncStatus: sheetsSaved ? 'synced' : 'sheets_pending',
                ...(sheetsError ? { syncError: sheetsError } : {}),
                updatedAt: new Date().toISOString(),
              },
            }
          )
        } catch {}
      }

      // Case A: Both succeeded
      if (mongoSaved && sheetsSaved) {
        return res.status(200).json({
          success: true,
          orderId: cleanId,
          mongoSaved: true,
          sheetsSaved: true,
          syncStatus: 'synced',
          message: existingInSheets
            ? 'MongoDB synchronized with existing Google Sheet order (Case C recovery)'
            : 'Order saved in MongoDB Atlas and Google Sheets',
        })
      }

      // Case B: Mongo succeeded, Google Sheet failed
      if (mongoSaved && !sheetsSaved) {
        console.warn(`[Sync Mismatch] Mongo saved ${cleanId} but Sheet failed: ${sheetsError}`)
        return res.status(502).json({
          success: false,
          orderId: cleanId,
          error: `Google Sheet dual-write failed: ${sheetsError}`,
          mongoSaved: true,
          sheetsSaved: false,
          syncStatus: 'sheets_pending',
        })
      }

      // Case C: Google Sheet succeeded, Mongo failed
      if (!mongoSaved && sheetsSaved) {
        console.warn(`[Sync Mismatch] Sheet saved ${cleanId} but Mongo failed: ${mongoError}`)
        return res.status(502).json({
          success: false,
          orderId: cleanId,
          error: `MongoDB dual-write failed: ${mongoError}`,
          mongoSaved: false,
          sheetsSaved: true,
          syncStatus: 'mongo_pending',
        })
      }

      // Both failed
      return res.status(500).json({
        success: false,
        orderId: cleanId,
        error: `Both data stores failed. MongoDB: ${mongoError} | Sheets: ${sheetsError}`,
        mongoSaved: false,
        sheetsSaved: false,
        syncStatus: 'failed',
      })
    }

    // ── 2. GET ORDER STATUS (PHASE 4: MONGODB PRIMARY & AUTHORITATIVE) ──────
    if (action === 'getOrderStatus') {
      const orderId = String(req.query?.orderId || req.body?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const readSource = getOrdersReadSource()
      console.log(`[ORDER_STATUS_READ] Request for ${orderId} (source=${readSource})`)

      // Emergency Rollback check
      if (readSource === 'gas') {
        console.warn(`[ORDER_ARCHIVE_MODE] WARNING: ORDERS_READ_SOURCE=gas active. Reading ${orderId} from archived Google Sheets (may be stale).`)
        try {
          const gasOrder = await writeToGoogleAppsScript({ action: 'getOrderStatus', orderId })
          return res.status(200).json({ ...gasOrder, source: 'gas_archive' })
        } catch (gasErr) {
          return res.status(500).json({ success: false, error: gasErr.message })
        }
      }

      // PRIMARY & AUTHORITATIVE: MongoDB Atlas
      try {
        const { db } = await connectToDatabase()
        const order = await db.collection('orders').findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (order) {
          console.log(`[MONGO_ORDER_READ_PRIMARY] Order ${orderId} retrieved successfully from MongoDB Atlas`)
          const nowMs = Date.now()
          const derivedExpiry = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : null)
          const isExpired = Boolean(
            order.pdfDeletedAt ||
            (derivedExpiry && new Date(derivedExpiry).getTime() <= nowMs)
          )
          let hasPdf = !isExpired && Boolean(
            order.hasGridFsPdf === true ||
            Boolean(order.driveUrl && order.driveUrl.trim()) ||
            Boolean(order.pdfBase64 && order.pdfBase64.length > 50)
          )
          // If not confirmed by document fields, check GridFS bucket directly (durable storage)
          if (hasPdf && !order.hasGridFsPdf && !order.pdfBase64 && !order.driveUrl) {
            hasPdf = await hasPdfInGridFS(db, orderId)
          }
          if (isExpired) {
            hasPdf = false
          }
          const reprintCheck = isOrderReprintEligible(order, new Date().toISOString(), { allowPending: true })
          const cleanOrder = {
            ...order,
            pdfExpiresAt: derivedExpiry,
            hasPdf,
            pdfStorage: isExpired ? 'none' : (order.pdfStorage || (order.hasGridFsPdf ? 'gridfs' : (order.driveUrl ? 'drive' : (order.pdfBase64 ? 'inline' : (hasPdf ? 'gridfs' : 'none'))))),
            reprintEligible: reprintCheck.eligible,
            reprintReason: reprintCheck.reason,
          }
          return res.status(200).json({ success: true, order: cleanOrder, serverTime: new Date().toISOString(), source: 'mongo' })
        } else {
          console.log(`[MONGO_ORDER_READ_PRIMARY] Order ${orderId} not found in MongoDB Atlas`)
          return res.status(404).json({ success: false, error: 'Order not found', source: 'mongo' })
        }
      } catch (mongoErr) {
        console.error(`[MONGO_READ_ERROR] MongoDB getOrderStatus error for ${orderId}: ${mongoErr.message}`)
        return res.status(503).json({ success: false, error: 'Orders service temporarily unavailable', details: mongoErr.message })
      }
    }

    // ── 2.5 GET PDF BINARY STREAM (FAST DISK CACHE + GRIDFS STREAMING) ────────
    if (action === 'getPdf' || action === 'downloadPdf' || action === 'getOrderPdf') {
      const orderId = String(req.query?.orderId || req.body?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const tStart = Date.now()
      const cachePath = path.join(PDF_CACHE_DIR, `${orderId}.pdf`)

      // Authoritative existence verification:
      // An order must exist in MongoDB Atlas to be retrieved.
      // A local disk cache alone must NEVER qualify or serve nonexistent/unauthorized orders.
      try {
        const { db } = await connectToDatabase()
        const order = await db.collection('orders').findOne(
          { orderId },
          { projection: { pdfBase64: 1, driveUrl: 1, fileName: 1, hasGridFsPdf: 1, pdfExpiresAt: 1, pdfDeletedAt: 1, printedAt: 1 } }
        )
        if (!order) {
          // If order does not exist in authoritative MongoDB, purge any stale disk cache file
          if (fs.existsSync(cachePath)) {
            try { fs.unlinkSync(cachePath) } catch {}
          }
          return res.status(404).json({ success: false, error: 'Order not found in database', hasPdf: false })
        }

        // RETENTION POLICY GATE: Document permanently expired or deleted
        const effectiveExpiry = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : null)
        if (order.pdfDeletedAt || (effectiveExpiry && new Date(effectiveExpiry).getTime() <= Date.now())) {
          if (fs.existsSync(cachePath)) {
            try { fs.unlinkSync(cachePath) } catch {}
          }
          return res.status(410).json({
            success: false,
            error: 'Reprint window expired; document permanently deleted.',
            expired: true,
            hasPdf: false,
          })
        }

        const safeFileName = (order.fileName || `${orderId}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_')

        // FAST PATH 1: Serve directly from local disk cache (< 10ms response) if cached
        if (fs.existsSync(cachePath)) {
          try {
            const stat = fs.statSync(cachePath)
            if (stat.size > 100) {
              const buf = fs.readFileSync(cachePath)
              if (buf.subarray(0, 4).toString('ascii') === '%PDF') {
                console.log(`[GET_PDF_CACHE_HIT] Serving ${orderId}.pdf from disk cache (${buf.length} bytes in ${Date.now() - tStart}ms)`)
                res.setHeader('Content-Type', 'application/pdf')
                res.setHeader('Content-Length', buf.length)
                res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`)
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.setHeader('X-PDF-Source', 'disk-cache')
                return res.status(200).send(buf)
              }
            }
          } catch (cacheErr) {
            console.warn(`[GET_PDF_CACHE_READ_ERR] ${orderId}:`, cacheErr.message)
          }
        }

        // TIER 2: GridFS stream from MongoDB Atlas
        try {
          const gridResult = await getPdfStreamFromGridFS(db, orderId)
          if (gridResult) {
            const { file, stream } = gridResult
            console.log(`[GET_PDF_GRIDFS_SERVED] Serving ${orderId}.pdf from MongoDB Atlas GridFS (${file.length} bytes in ${Date.now() - tStart}ms)`)
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Length', file.length)
            res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('X-PDF-Source', 'mongo-gridfs')

            await new Promise((resolve, reject) => {
              stream.on('error', (streamErr) => {
                console.error(`[GET_PDF_GRIDFS_STREAM_ERR] ${orderId}:`, streamErr.message)
                if (!res.headersSent) {
                  res.status(500).json({ success: false, error: `GridFS download error: ${streamErr.message}` })
                }
                reject(streamErr)
              })
              try {
                if (!fs.existsSync(PDF_CACHE_DIR)) fs.mkdirSync(PDF_CACHE_DIR, { recursive: true })
                const diskWriter = fs.createWriteStream(cachePath)
                stream.pipe(diskWriter)
              } catch {}
              res.on('finish', () => resolve())
              res.on('close', () => resolve())
              stream.pipe(res)
            })
            return
          }
        } catch (gridErr) {
          console.warn(`[GridFS retrieval notice] ${orderId}:`, gridErr.message)
        }

        // TIER 3: Inline Base64 from MongoDB document
        if (order.pdfBase64 && typeof order.pdfBase64 === 'string' && order.pdfBase64.length > 50) {
          const pdfBuffer = Buffer.from(order.pdfBase64, 'base64')
          savePdfToDiskCache(orderId, pdfBuffer)
          console.log(`[GET_PDF_MONGO_SERVED] Served ${orderId} from MongoDB Atlas inline Base64 (${pdfBuffer.length} bytes in ${Date.now() - tStart}ms)`)
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Length', pdfBuffer.length)
          res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`)
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('X-PDF-Source', 'mongo-atlas')
          return res.status(200).send(pdfBuffer)
        }

        // TIER 4: Fallback to Google Drive if driveUrl is present
        if (order.driveUrl && typeof order.driveUrl === 'string') {
          let driveDownloadUrl = order.driveUrl
          const patterns = [
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /id=([a-zA-Z0-9_-]+)/,
            /\/d\/([a-zA-Z0-9_-]+)/,
          ]
          for (const pattern of patterns) {
            const match = order.driveUrl.match(pattern)
            if (match) {
              driveDownloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${match[1]}`
              break
            }
          }

          const driveRes = await fetch(driveDownloadUrl, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(35000),
          })

          if (driveRes.ok) {
            const arrayBuffer = await driveRes.arrayBuffer()
            const pdfBuffer = Buffer.from(arrayBuffer)
            savePdfToDiskCache(orderId, pdfBuffer)
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Length', pdfBuffer.length)
            res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('X-PDF-Source', 'google-drive')
            return res.status(200).send(pdfBuffer)
          } else {
            console.warn(`[DRIVE_PDF_FETCH_FAILED] HTTP ${driveRes.status} for ${orderId}`)
          }
        }

        return res.status(404).json({
          success: false,
          error: 'No PDF file found for this order. Neither MongoDB GridFS, disk cache, inline Base64, nor Google Drive document is available.',
          hasPdf: false,
        })
      } catch (pdfErr) {
        console.error(`[GET_PDF_ERROR] Order ${orderId}:`, pdfErr.message)
        return res.status(500).json({ success: false, error: `Failed to retrieve PDF: ${pdfErr.message}` })
      }
    }

    // ── 2.8 REPAIR / ATTACH PDF TO ORDER (AUTHORIZED SHOPKEEPER / ADMIN) ────
    if (action === 'repairOrderPdf') {
      const pin = String(req.body?.pin || req.headers?.['x-pin'] || '').trim()
      const apiKey = String(req.body?.apiKey || req.headers?.['x-api-key'] || '').trim()
      const boothPin = process.env.BOOTH_PIN || '4921'
      const isAuthorized = (pin && pin === boothPin) || (apiKey && apiKey === GAS_API_KEY)

      if (!isAuthorized) {
        return res.status(401).json({ success: false, error: 'Unauthorized: valid shopkeeper PIN or API key required' })
      }

      const orderId = String(req.body?.orderId || '').trim().toUpperCase()
      const rawPdfBase64 = String(req.body?.pdfBase64 || '').trim()

      if (!orderId || !rawPdfBase64 || rawPdfBase64.length < 50) {
        return res.status(400).json({ success: false, error: 'Valid orderId and pdfBase64 required' })
      }

      let pdfBuffer = null
      try {
        pdfBuffer = Buffer.from(rawPdfBase64, 'base64')
        if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 4).toString('ascii') !== '%PDF') {
          return res.status(400).json({ success: false, error: 'Invalid PDF payload (missing %PDF- header)' })
        }
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid Base64 string' })
      }

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')
        const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (!existing) {
          return res.status(404).json({ success: false, error: `Order ${orderId} not found in database` })
        }

        // Save to GridFS & disk cache
        await savePdfToGridFS(db, orderId, pdfBuffer, { fileName: existing.fileName || `${orderId}.pdf` })
        savePdfToDiskCache(orderId, pdfBuffer)

        // Update MongoDB document
        const updateFields = {
          hasPdf: true,
          hasGridFsPdf: true,
          pdfStorage: 'gridfs',
          pdfSize: pdfBuffer.length,
          updatedAt: new Date().toISOString(),
        }

        // If printStatus was 'Failed', reset to 'waiting_for_shopkeeper' so shopkeeper can release it
        if (String(existing.printStatus || '').toLowerCase() === 'failed') {
          updateFields.printStatus = 'waiting_for_shopkeeper'
        }

        await orders.updateOne({ orderId }, { $set: updateFields })

        return res.status(200).json({
          success: true,
          orderId,
          hasPdf: true,
          pdfStorage: 'gridfs',
          pdfSize: pdfBuffer.length,
          printStatus: updateFields.printStatus || existing.printStatus,
          message: `PDF successfully attached and stored in GridFS for ${orderId}`,
        })
      } catch (repairErr) {
        console.error(`[REPAIR_PDF_ERROR] Order ${orderId}:`, repairErr.message)
        return res.status(500).json({ success: false, error: `Failed to repair PDF: ${repairErr.message}` })
      }
    }

    // ── 3. LIST ORDERS (PHASE 4: MONGODB PRIMARY & AUTHORITATIVE) ───────────
    if (action === 'listOrders') {
      const readSource = getOrdersReadSource()
      console.log(`[ORDER_LIST_READ] Request for orders list (source=${readSource})`)

      // Emergency Rollback check
      if (readSource === 'gas') {
        console.warn('[ORDER_ARCHIVE_MODE] WARNING: ORDERS_READ_SOURCE=gas active. Reading list from archived Google Sheets (may be stale).')
        try {
          const gasList = await writeToGoogleAppsScript({ action: 'listOrders' })
          const deduplicated = deduplicateSheetOrders(gasList?.orders || [])
          return res.status(200).json({ success: true, orders: deduplicated, source: 'gas_archive' })
        } catch (gasErr) {
          return res.status(500).json({ success: false, error: gasErr.message })
        }
      }

      // PRIMARY & AUTHORITATIVE: MongoDB Atlas (project out heavy pdfBase64)
      try {
        const { db } = await connectToDatabase()
        const orders = await db.collection('orders').find({}, { projection: { pdfBase64: 0 } }).sort({ createdAt: -1 }).limit(100).toArray()
        if (Array.isArray(orders)) {
          const nowMs = Date.now()
          const cleanOrders = orders.map(order => {
            const derivedExpiry = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : null)
            const isExpired = Boolean(
              order.pdfDeletedAt ||
              (derivedExpiry && new Date(derivedExpiry).getTime() <= nowMs)
            )
            const hasPdf = !isExpired && Boolean(
              order.hasPdf === true ||
              order.hasGridFsPdf === true ||
              Boolean(order.driveUrl && order.driveUrl.trim()) ||
              Boolean(order.pdfBase64 && order.pdfBase64.length > 50)
            )
            const reprintCheck = isOrderReprintEligible(order)
            return {
              ...order,
              pdfExpiresAt: derivedExpiry,
              hasPdf,
              pdfStorage: isExpired ? 'none' : (order.pdfStorage || (hasPdf ? 'gridfs' : 'none')),
              reprintEligible: reprintCheck.eligible,
              reprintReason: reprintCheck.reason,
            }
          })
          console.log(`[MONGO_ORDER_READ_PRIMARY] Successfully retrieved ${cleanOrders.length} orders from MongoDB Atlas`)
          return res.status(200).json({ success: true, orders: cleanOrders, serverTime: new Date().toISOString(), source: 'mongo' })
        }
      } catch (mongoErr) {
        console.error(`[MONGO_READ_ERROR] MongoDB listOrders error: ${mongoErr.message}`)
        return res.status(503).json({ success: false, error: 'Orders service temporarily unavailable', details: mongoErr.message })
      }
    }

    // ── 4. UPDATE ORDER STATUS (MONGODB PRIMARY + ATOMIC RELEASE LOCK) ──────
    if (action === 'updateOrderStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const printStatus = String(req.body?.printStatus || req.query?.printStatus || '').trim()
      if (!orderId || !printStatus) {
        return res.status(400).json({ success: false, error: 'orderId and printStatus required' })
      }

      const sheetWriteMode = getOrdersSheetWriteMode()
      console.log(`[ORDER_STATUS_WRITE_MONGO] Updating ${orderId} to printStatus "${printStatus}" in MongoDB (sheetWriteMode=${sheetWriteMode})`)

      const nowIso = new Date().toISOString()
      let mongoUpdated = false

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        // Atomic print-release lock: prevent duplicate release when simultaneous requests arrive
        if (printStatus === 'Printing') {
          const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
          if (!existing) {
            return res.status(404).json({ success: false, error: `Order ${orderId} not found in authoritative database` })
          }

          const normPay = String(existing.paymentStatus || 'pending').trim().toLowerCase()
          if (['failed', 'rejected', 'cancelled'].includes(normPay)) {
            return res.status(403).json({
              success: false,
              error: `Order ${orderId} cannot be released: payment status is "${existing.paymentStatus}". Release strictly prohibited.`,
              paymentBlocked: true,
              paymentStatus: existing.paymentStatus,
            })
          }

          const requirePay = process.env.REQUIRE_PAYMENT_VERIFICATION === 'true'
          if (requirePay && !['paid', 'completed'].includes(normPay)) {
            return res.status(402).json({
              success: false,
              error: `Payment authorization required: order ${orderId} payment status is "${existing.paymentStatus}". Verify payment before release.`,
              paymentBlocked: true,
              paymentStatus: existing.paymentStatus,
            })
          }

          // Expiry check: cannot release an expired document
          if (existing.pdfDeletedAt || (existing.pdfExpiresAt && new Date(existing.pdfExpiresAt).getTime() <= Date.now())) {
            return res.status(410).json({
              success: false,
              error: `Order ${orderId} PDF retention window expired; document permanently deleted.`,
              expired: true,
            })
          }

          const raceSafeFilter = {
            orderId,
            printStatus: { $nin: ['Printing', 'Printed'] },
            pdfDeletedAt: { $exists: false },
            paymentStatus: requirePay
              ? { $in: ['paid', 'completed'] }
              : { $nin: ['failed', 'rejected', 'cancelled'] },
          }

          const raceSafeResult = await orders.findOneAndUpdate(
            raceSafeFilter,
            {
              $set: { printStatus: 'Printing', releasedAt: nowIso, updatedAt: nowIso },
              $inc: { releaseAttempts: 1 },
            },
            { returnDocument: 'after' }
          )

          if (!raceSafeResult) {
            console.warn(`[Race Condition Blocked] Order ${orderId} is already Printing or Released.`)
            return res.status(409).json({
              success: false,
              error: 'Order is already printing or was previously released.',
              conflict: true,
            })
          }
          mongoUpdated = true
        } else {
          const updateFields = { printStatus, updatedAt: nowIso }
          if (req.body?.driveUrl) updateFields.driveUrl = String(req.body.driveUrl).trim()
          const mongoUpdates = { $set: updateFields }

          if (printStatus === 'Printed') {
            const existing = await orders.findOne({ orderId }, { projection: { printedAt: 1, pdfExpiresAt: 1, reprintPending: 1 } })
            if (existing) {
              if (!existing.printedAt) {
                // Requirement 1: Only record immutable printedAt if not already recorded.
                // Set pdfExpiresAt = printedAt + 30 minutes.
                updateFields.printedAt = nowIso
                updateFields.pdfExpiresAt = calculateExpiryTimestamp(nowIso)
              } else if (existing.reprintPending) {
                // Requirement 3: Reprint finished successfully
                updateFields.reprintPending = false
                updateFields.lastReprintAt = nowIso
                mongoUpdates.$inc = { reprintCount: 1 }
                mongoUpdates.$push = {
                  auditLog: {
                    action: 'reprint_completed',
                    printedAt: nowIso,
                  },
                }
              }
            }
          } else if (printStatus.toLowerCase().includes('fail')) {
            updateFields.failedAt = nowIso
            if (req.body?.errorMessage) {
              updateFields.errorMessage = String(req.body.errorMessage)
            }
            const existing = await orders.findOne({ orderId }, { projection: { reprintPending: 1 } })
            if (existing?.reprintPending) {
              updateFields.reprintPending = false
              mongoUpdates.$push = {
                auditLog: {
                  action: 'reprint_failed',
                  failedAt: nowIso,
                  errorMessage: req.body?.errorMessage || 'Print failed',
                },
              }
            }
          }

          await orders.updateOne(
            { orderId },
            mongoUpdates
          )
          mongoUpdated = true
        }
      } catch (mErr) {
        console.error(`[MONGO_WRITE_ERROR] MongoDB updateOrderStatus error for ${orderId}: ${mErr.message}`)
        return res.status(500).json({ success: false, error: mErr.message })
      }

      // Check sheet write mode: only sync if dual-write is explicitly enabled
      if (sheetWriteMode === 'dual') {
        console.log(`[ORDER_STATUS_WRITE_SYNC] Dual-writing updateOrderStatus for ${orderId} to Google Sheets`)
        try {
          await writeToGoogleAppsScript({ action: 'updateOrderStatus', orderId, printStatus })
        } catch (gErr) {
          console.warn(`[GAS_WRITE_ERROR] GAS updateOrderStatus notice for ${orderId}: ${gErr.message}`)
        }
      } else {
        console.log(`[SHEET_WRITE_DISABLED] updateOrderStatus skipped for Google Sheets (ORDERS_SHEET_WRITE_MODE=${sheetWriteMode})`)
      }

      return res.status(200).json({ success: true, orderId, printStatus, mongoUpdated, sheetWriteMode })
    }

    // ── 5. UPDATE PAYMENT STATUS (MONGODB PRIMARY) ──────────────────────────
    if (action === 'updatePaymentStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const paymentStatus = String(req.body?.paymentStatus || req.query?.paymentStatus || '').trim()
      if (!orderId || !paymentStatus) {
        return res.status(400).json({ success: false, error: 'orderId and paymentStatus required' })
      }

      const sheetWriteMode = getOrdersSheetWriteMode()
      console.log(`[PAYMENT_STATUS_WRITE_MONGO] Updating ${orderId} to paymentStatus "${paymentStatus}" in MongoDB (sheetWriteMode=${sheetWriteMode})`)

      const nowIso = new Date().toISOString()
      let mongoUpdated = false

      try {
        const { db } = await connectToDatabase()
        await db.collection('orders').updateOne(
          { orderId },
          { $set: { paymentStatus, updatedAt: nowIso } }
        )
        mongoUpdated = true
      } catch (mErr) {
        console.error(`[MONGO_WRITE_ERROR] MongoDB updatePaymentStatus error for ${orderId}: ${mErr.message}`)
        return res.status(500).json({ success: false, error: mErr.message })
      }

      // Check sheet write mode: only sync if dual-write is explicitly enabled
      if (sheetWriteMode === 'dual') {
        console.log(`[PAYMENT_STATUS_WRITE_SYNC] Dual-writing updatePaymentStatus for ${orderId} to Google Sheets`)
        try {
          await writeToGoogleAppsScript({ action: 'updatePaymentStatus', orderId, paymentStatus })
        } catch (gErr) {
          console.warn(`[GAS_WRITE_ERROR] GAS updatePaymentStatus notice for ${orderId}: ${gErr.message}`)
        }
      } else {
        console.log(`[SHEET_WRITE_DISABLED] updatePaymentStatus skipped for Google Sheets (ORDERS_SHEET_WRITE_MODE=${sheetWriteMode})`)
      }

      return res.status(200).json({ success: true, orderId, paymentStatus, mongoUpdated, sheetWriteMode })
    }

    // ── 5.1 INITIATE REPRINT (CALCULATE PRICE, GENERATE ATTEMPT & VALIDATE) ──
    if (action === 'initiateReprint') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const nowIso = new Date().toISOString()
      const nowMs = Date.now()

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (!existing) {
          return res.status(404).json({ success: false, error: `Order ${orderId} not found in authoritative database` })
        }

        // Student order ownership verification (if transactionId or client identifier is provided)
        const incomingTxId = String(req.body?.transactionId || req.query?.transactionId || '').trim()
        if (incomingTxId && existing.transactionId && incomingTxId !== String(existing.transactionId).trim()) {
          return res.status(403).json({ success: false, error: 'Order authorization mismatch' })
        }

        // Check if order was successfully printed
        if (existing.printStatus !== 'Printed') {
          if (existing.reprintPending || existing.printStatus === 'Printing' || existing.printStatus === 'waiting_for_shopkeeper') {
            return res.status(409).json({
              success: false,
              conflict: true,
              error: 'Reprint request already in progress for this order.',
              printStatus: existing.printStatus,
            })
          }
          return res.status(400).json({
            success: false,
            error: `Order ${orderId} cannot be reprinted: current print status is "${existing.printStatus}". Only successfully printed orders are eligible.`,
            printStatus: existing.printStatus,
          })
        }

        // Retention Expiry Guard (Server Authoritative)
        const effectiveExpiresAt = existing.pdfExpiresAt || (existing.printedAt ? calculateExpiryTimestamp(existing.printedAt) : null)
        if (!effectiveExpiresAt) {
          return res.status(400).json({
            success: false,
            error: 'No retention window recorded for this order.',
          })
        }

        const expiryMs = new Date(effectiveExpiresAt).getTime()
        if (expiryMs <= nowMs || existing.pdfDeletedAt) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Reprint window expired; document permanently deleted.',
            pdfExpiresAt: effectiveExpiresAt,
          })
        }

        // Durable PDF availability check
        let hasDurablePdf = Boolean(existing.hasPdf !== false && !existing.pdfDeletedAt && existing.pdfStorage !== 'none')
        if (hasDurablePdf) {
          if (existing.hasGridFsPdf || existing.pdfStorage === 'gridfs') {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
          } else if (existing.pdfStorage === 'inline' || existing.driveUrl) {
            hasDurablePdf = true
          } else {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
            if (!hasDurablePdf) {
              const checkDoc = await orders.findOne({ orderId }, { projection: { pdfBase64: 1 } })
              hasDurablePdf = Boolean(checkDoc?.pdfBase64 && checkDoc.pdfBase64.length > 50)
            }
          }
        }
        if (!hasDurablePdf) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Original PDF is no longer available in durable storage.',
          })
        }

        // Calculate authoritative price using existing pricing logic and print settings
        const price = calculateOrderPrice(existing)

        // Unique reprint attempt ID
        const attemptId = `RP_${orderId}_${nowMs}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`

        const attempt = {
          attemptId,
          orderId,
          amount: price.totalAmount,
          printingCost: price.printingCost,
          serviceFee: price.serviceFee,
          ratePerPage: price.ratePerPage,
          copies: price.copies,
          effectivePages: price.effectivePages,
          paymentStatus: 'pending',
          transactionId: '',
          phone: '',
          createdAt: nowIso,
          submittedAt: null,
          verifiedAt: null,
          printAuthorized: false,
          printDispatched: false,
          printOutcome: 'pending',
        }

        await orders.updateOne(
          { orderId },
          {
            $push: { reprintAttempts: attempt },
            $set: { updatedAt: nowIso },
          }
        )

        return res.status(200).json({
          success: true,
          orderId,
          attemptId,
          amount: price.totalAmount,
          printingCost: price.printingCost,
          serviceFee: price.serviceFee,
          ratePerPage: price.ratePerPage,
          copies: price.copies,
          effectiveExpiresAt,
          remainingMs: Math.max(0, expiryMs - nowMs),
          serverTime: nowIso,
        })
      } catch (err) {
        console.error(`[INITIATE_REPRINT_ERR] Order ${orderId}:`, err.message)
        return res.status(500).json({ success: false, error: err.message })
      }
    }

    // ── 5.2 SUBMIT REPRINT PAYMENT (RECORD NEW UTR & AUTHORIZE PRINT) ────────
    if (action === 'submitReprintPayment') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const attemptId = String(req.body?.attemptId || req.query?.attemptId || '').trim()
      const rawTxId = String(req.body?.transactionId || req.query?.transactionId || '').trim()
      const phone = String(req.body?.phone || req.query?.phone || '').trim()

      if (!orderId || !attemptId || !rawTxId) {
        return res.status(400).json({
          success: false,
          error: 'orderId, attemptId, and transactionId are required for reprint payment',
        })
      }

      const cleanTxId = rawTxId.replace(/\s+/g, '')
      if (cleanTxId.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Transaction reference (UTR) must be at least 6 alphanumeric characters.',
        })
      }

      const nowIso = new Date().toISOString()
      const nowMs = Date.now()

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (!existing) {
          return res.status(404).json({ success: false, error: `Order ${orderId} not found` })
        }

        // 1. Retention Expiry Guard (Server Authoritative)
        const effectiveExpiresAt = existing.pdfExpiresAt || (existing.printedAt ? calculateExpiryTimestamp(existing.printedAt) : null)
        if (!effectiveExpiresAt) {
          return res.status(400).json({ success: false, error: 'No retention window recorded for this order.' })
        }
        const expiryMs = new Date(effectiveExpiresAt).getTime()
        if (expiryMs <= nowMs || existing.pdfDeletedAt) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Reprint window expired; document permanently deleted.',
            pdfExpiresAt: effectiveExpiresAt,
          })
        }

        // 2. Durable PDF availability guard
        let hasDurablePdf = Boolean(existing.hasPdf !== false && !existing.pdfDeletedAt && existing.pdfStorage !== 'none')
        if (hasDurablePdf) {
          if (existing.hasGridFsPdf || existing.pdfStorage === 'gridfs') {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
          } else if (existing.pdfStorage === 'inline' || existing.driveUrl) {
            hasDurablePdf = true
          } else {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
          }
        }
        if (!hasDurablePdf) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Original PDF is no longer available in durable storage.',
          })
        }

        // 3. Strict Anti-Reuse Guard: Reusing original order's transaction ID is forbidden
        const origTxId = String(existing.transactionId || '').trim()
        if (origTxId && cleanTxId.toUpperCase() === origTxId.toUpperCase()) {
          return res.status(400).json({
            success: false,
            error: 'Cannot reuse the original order transaction ID. Every reprint requires a new payment and transaction reference.',
          })
        }

        // 4. Duplicate Reference Guard: Reusing transaction reference from another reprint attempt is forbidden
        const priorAttempts = Array.isArray(existing.reprintAttempts) ? existing.reprintAttempts : []
        const duplicateAttempt = priorAttempts.find(
          a => a.transactionId &&
               a.attemptId !== attemptId &&
               String(a.transactionId).trim().toUpperCase() === cleanTxId.toUpperCase()
        )
        if (duplicateAttempt) {
          return res.status(400).json({
            success: false,
            error: 'This transaction ID has already been used for another reprint attempt.',
          })
        }

        // Global Cross-Order Duplicate Guard: Reject UTR if already used anywhere in database
        const globalDuplicate = await orders.findOne(
          {
            $or: [
              { transactionId: { $regex: new RegExp(`^${cleanTxId}$`, 'i') }, orderId: { $ne: orderId } },
              {
                reprintAttempts: {
                  $elemMatch: {
                    transactionId: { $regex: new RegExp(`^${cleanTxId}$`, 'i') },
                    attemptId: { $ne: attemptId },
                  },
                },
              },
            ],
          },
          { projection: { orderId: 1 } }
        )
        if (globalDuplicate) {
          return res.status(400).json({
            success: false,
            error: `This transaction reference has already been used for order ${globalDuplicate.orderId}. Every reprint requires a new, unique transaction reference.`,
          })
        }

        const currentAttempt = priorAttempts.find(a => a.attemptId === attemptId)
        if (!currentAttempt) {
          return res.status(404).json({
            success: false,
            error: `Reprint attempt ${attemptId} not found on order ${orderId}`,
          })
        }

        if (currentAttempt.paymentStatus === 'paid' && currentAttempt.printDispatched) {
          return res.status(409).json({
            success: false,
            conflict: true,
            error: 'This reprint attempt has already been verified and queued for printing.',
          })
        }

        // 5. Manual UPI Verification Requirement:
        // Every submitted reprint payment MUST remain pending until shopkeeper explicitly verifies it.
        // A submitted UTR alone is NOT proof that payment was received; client-supplied paymentStatus is strictly ignored.
        await orders.updateOne(
          { orderId, 'reprintAttempts.attemptId': attemptId },
          {
            $set: {
              'reprintAttempts.$.paymentStatus': 'pending',
              'reprintAttempts.$.transactionId': cleanTxId,
              'reprintAttempts.$.phone': phone,
              'reprintAttempts.$.submittedAt': nowIso,
              updatedAt: nowIso,
            },
            $push: {
              auditLog: {
                action: 'reprint_payment_submitted',
                attemptId,
                transactionId: cleanTxId,
                amount: currentAttempt.amount,
                submittedAt: nowIso,
              },
            },
          }
        )

        return res.status(200).json({
          success: true,
          orderId,
          attemptId,
          paymentStatus: 'pending',
          printStatus: existing.printStatus || 'Printed',
          reprintPending: false,
          printAuthorized: false,
          message: 'Reprint payment submitted. Awaiting shopkeeper verification before print dispatch.',
          pdfExpiresAt: effectiveExpiresAt,
          printedAt: existing.printedAt,
        })
      } catch (payErr) {
        console.error(`[REPRINT_PAYMENT_ERR] Order ${orderId}:`, payErr.message)
        return res.status(500).json({ success: false, error: payErr.message })
      }
    }

    // ── 5.3 VERIFY REPRINT PAYMENT (SHOPKEEPER VERIFICATION / REJECTION) ────
    if (action === 'verifyReprintPayment') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const attemptId = String(req.body?.attemptId || req.query?.attemptId || '').trim()
      const newPaymentStatus = String(req.body?.paymentStatus || req.query?.paymentStatus || '').trim().toLowerCase()

      if (!orderId || !attemptId || !newPaymentStatus) {
        return res.status(400).json({
          success: false,
          error: 'orderId, attemptId, and paymentStatus are required',
        })
      }

      const nowIso = new Date().toISOString()
      const nowMs = Date.now()

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (!existing) {
          return res.status(404).json({ success: false, error: `Order ${orderId} not found` })
        }

        const attempts = Array.isArray(existing.reprintAttempts) ? existing.reprintAttempts : []
        const attempt = attempts.find(a => a.attemptId === attemptId)
        if (!attempt) {
          return res.status(404).json({ success: false, error: `Attempt ${attemptId} not found` })
        }

        if (newPaymentStatus === 'paid') {
          // Retention Expiry Guard
          const effectiveExpiresAt = existing.pdfExpiresAt || (existing.printedAt ? calculateExpiryTimestamp(existing.printedAt) : null)
          if (!effectiveExpiresAt || new Date(effectiveExpiresAt).getTime() <= nowMs || existing.pdfDeletedAt) {
            await orders.updateOne(
              { orderId, 'reprintAttempts.attemptId': attemptId },
              {
                $set: {
                  'reprintAttempts.$.paymentStatus': 'paid',
                  'reprintAttempts.$.printAuthorized': false,
                  'reprintAttempts.$.printOutcome': 'expired',
                  updatedAt: nowIso,
                },
              }
            )
            return res.status(410).json({
              success: false,
              expired: true,
              error: 'Reprint window expired; document permanently deleted. Print cannot be queued.',
            })
          }

          // Durable PDF availability guard
          let hasDurablePdf = Boolean(existing.hasPdf !== false && !existing.pdfDeletedAt && existing.pdfStorage !== 'none')
          if (hasDurablePdf) {
            if (existing.hasGridFsPdf || existing.pdfStorage === 'gridfs') {
              hasDurablePdf = await hasPdfInGridFS(db, orderId)
            } else if (existing.pdfStorage === 'inline' || existing.driveUrl) {
              hasDurablePdf = true
            } else {
              hasDurablePdf = await hasPdfInGridFS(db, orderId)
            }
          }
          if (!hasDurablePdf) {
            return res.status(410).json({
              success: false,
              expired: true,
              error: 'Original PDF is no longer available in durable storage.',
            })
          }

          // Cannot verify if student hasn't submitted a valid transaction reference
          if (!attempt.transactionId || String(attempt.transactionId).trim().length < 6) {
            return res.status(400).json({
              success: false,
              error: 'Cannot verify reprint payment: student has not submitted a valid transaction reference (UTR) for this reprint attempt.',
            })
          }

          if (attempt.paymentStatus === 'paid' && attempt.printDispatched) {
            return res.status(409).json({
              success: false,
              conflict: true,
              error: 'This reprint attempt has already been verified and queued for printing.',
            })
          }

          // Atomically authorize and dispatch reprint
          const updateResult = await orders.findOneAndUpdate(
            {
              orderId,
              printStatus: 'Printed',
              pdfDeletedAt: { $exists: false },
              reprintPending: { $ne: true },
              'reprintAttempts.attemptId': attemptId,
            },
            {
              $set: {
                printStatus: 'waiting_for_shopkeeper',
                reprintPending: true,
                activeReprintAttemptId: attemptId,
                lastReprintRequestedAt: nowIso,
                'reprintAttempts.$.paymentStatus': 'paid',
                'reprintAttempts.$.verifiedAt': nowIso,
                'reprintAttempts.$.printAuthorized': true,
                'reprintAttempts.$.printDispatched': true,
                'reprintAttempts.$.printOutcome': 'dispatched',
                updatedAt: nowIso,
              },
              $push: {
                auditLog: {
                  action: 'reprint_payment_shopkeeper_verified',
                  attemptId,
                  transactionId: attempt.transactionId,
                  amount: attempt.amount,
                  at: nowIso,
                },
              },
            },
            { returnDocument: 'after', projection: { pdfBase64: 0 } }
          )

          if (!updateResult) {
            return res.status(409).json({
              success: false,
              conflict: true,
              error: 'Reprint request conflict: order is already reprinting or no longer eligible.',
            })
          }

          return res.status(200).json({
            success: true,
            orderId,
            attemptId,
            paymentStatus: 'paid',
            printStatus: 'waiting_for_shopkeeper',
            message: 'Reprint payment verified. Document queued for printing.',
          })
        }

        // Rejection / Cancellation:
        if (['rejected', 'failed', 'cancelled'].includes(newPaymentStatus)) {
          await orders.updateOne(
            { orderId, 'reprintAttempts.attemptId': attemptId },
            {
              $set: {
                'reprintAttempts.$.paymentStatus': newPaymentStatus,
                'reprintAttempts.$.printAuthorized': false,
                'reprintAttempts.$.printOutcome': newPaymentStatus,
                'reprintAttempts.$.rejectedAt': nowIso,
                updatedAt: nowIso,
              },
              $push: {
                auditLog: {
                  action: `reprint_payment_${newPaymentStatus}`,
                  attemptId,
                  at: nowIso,
                },
              },
            }
          )

          return res.status(200).json({
            success: true,
            orderId,
            attemptId,
            paymentStatus: newPaymentStatus,
            message: `Reprint payment marked as ${newPaymentStatus}. Document was not queued for printing.`,
          })
        }

        return res.status(400).json({
          success: false,
          error: `Unrecognized paymentStatus: ${newPaymentStatus}`,
        })
      } catch (vErr) {
        console.error(`[VERIFY_REPRINT_PAYMENT_ERR] Order ${orderId}:`, vErr.message)
        return res.status(500).json({ success: false, error: vErr.message })
      }
    }

    // ── 5.4 CANCEL REPRINT PAYMENT ──────────────────────────────────────────
    if (action === 'cancelReprintPayment') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const attemptId = String(req.body?.attemptId || req.query?.attemptId || '').trim()

      if (!orderId || !attemptId) {
        return res.status(400).json({ success: false, error: 'orderId and attemptId are required' })
      }

      const nowIso = new Date().toISOString()
      try {
        const { db } = await connectToDatabase()
        await db.collection('orders').updateOne(
          { orderId, 'reprintAttempts.attemptId': attemptId },
          {
            $set: {
              'reprintAttempts.$.paymentStatus': 'cancelled',
              'reprintAttempts.$.printAuthorized': false,
              'reprintAttempts.$.printOutcome': 'cancelled',
              'reprintAttempts.$.cancelledAt': nowIso,
              updatedAt: nowIso,
            },
          }
        )
        return res.status(200).json({
          success: true,
          orderId,
          attemptId,
          paymentStatus: 'cancelled',
          message: 'Reprint payment cancelled. Document was not queued for printing.',
        })
      } catch (cErr) {
        return res.status(500).json({ success: false, error: cErr.message })
      }
    }

    // ── 5.5 REPRINT ORDER (CANONICAL API + 30-MIN RETENTION ENFORCEMENT) ─────
    if (action === 'reprintOrder') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const nowIso = new Date().toISOString()
      const nowMs = Date.now()

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        const existing = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
        if (!existing) {
          return res.status(404).json({ success: false, error: `Order ${orderId} not found in authoritative database` })
        }

        // Student order ownership verification (if transactionId or client identifier is provided)
        const incomingTxId = String(req.body?.transactionId || req.query?.transactionId || '').trim()
        if (incomingTxId && existing.transactionId && incomingTxId !== String(existing.transactionId).trim()) {
          return res.status(403).json({ success: false, error: 'Order authorization mismatch' })
        }

        // Check if order was successfully printed
        if (existing.printStatus !== 'Printed') {
          if (existing.reprintPending || existing.printStatus === 'Printing' || existing.printStatus === 'waiting_for_shopkeeper') {
            return res.status(409).json({
              success: false,
              conflict: true,
              error: 'Reprint request already in progress for this order.',
              printStatus: existing.printStatus,
            })
          }
          return res.status(400).json({
            success: false,
            error: `Order ${orderId} cannot be reprinted: current print status is "${existing.printStatus}". Only successfully printed orders are eligible.`,
            printStatus: existing.printStatus,
          })
        }

        // Retention Expiry Guard (Server Authoritative)
        const effectiveExpiresAt = existing.pdfExpiresAt || (existing.printedAt ? calculateExpiryTimestamp(existing.printedAt) : null)
        if (!effectiveExpiresAt) {
          return res.status(400).json({
            success: false,
            error: 'No retention window recorded for this order.',
          })
        }

        const expiryMs = new Date(effectiveExpiresAt).getTime()
        if (expiryMs <= nowMs || existing.pdfDeletedAt) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Reprint window expired; document permanently deleted.',
            pdfExpiresAt: effectiveExpiresAt,
          })
        }

        // Payment eligibility check (Primary Security Gate)
        const normPay = String(existing.paymentStatus || 'pending').trim().toLowerCase()
        if (['failed', 'rejected', 'cancelled'].includes(normPay)) {
          return res.status(403).json({
            success: false,
            error: `Reprint blocked: payment status is "${existing.paymentStatus}". Release strictly prohibited.`,
            paymentBlocked: true,
            paymentStatus: existing.paymentStatus,
          })
        }

        const requirePay = process.env.REQUIRE_PAYMENT_VERIFICATION === 'true'
        if (requirePay && !['paid', 'completed'].includes(normPay)) {
          return res.status(402).json({
            success: false,
            error: `Payment authorization required: order ${orderId} payment status is "${existing.paymentStatus}". Verify payment before reprint.`,
            paymentBlocked: true,
            paymentStatus: existing.paymentStatus,
          })
        }

        // Durable PDF availability check
        let hasDurablePdf = Boolean(existing.hasPdf !== false && !existing.pdfDeletedAt && existing.pdfStorage !== 'none')
        if (hasDurablePdf) {
          if (existing.hasGridFsPdf || existing.pdfStorage === 'gridfs') {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
          } else if (existing.pdfStorage === 'inline' || existing.driveUrl) {
            hasDurablePdf = true
          } else {
            hasDurablePdf = await hasPdfInGridFS(db, orderId)
            if (!hasDurablePdf) {
              const checkDoc = await orders.findOne({ orderId }, { projection: { pdfBase64: 1 } })
              hasDurablePdf = Boolean(checkDoc?.pdfBase64 && checkDoc.pdfBase64.length > 50)
            }
          }
        }
        if (!hasDurablePdf) {
          return res.status(410).json({
            success: false,
            expired: true,
            error: 'Original PDF is no longer available in durable storage.',
          })
        }

        // Atomic claim / idempotency guard: prevents concurrent duplicate clicks
        const thirtyMinsAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const atomicFilter = {
          orderId,
          printStatus: 'Printed',
          pdfDeletedAt: { $exists: false },
          reprintPending: { $ne: true },
          $or: [
            { pdfExpiresAt: { $gt: nowIso } },
            {
              pdfExpiresAt: { $exists: false },
              printedAt: { $gt: thirtyMinsAgoIso },
            },
          ],
          paymentStatus: requirePay
            ? { $in: ['paid', 'completed'] }
            : { $nin: ['failed', 'rejected', 'cancelled'] },
        }

        const reprintResult = await orders.findOneAndUpdate(
          atomicFilter,
          {
            $set: {
              printStatus: 'waiting_for_shopkeeper',
              reprintPending: true,
              lastReprintRequestedAt: nowIso,
              pdfExpiresAt: effectiveExpiresAt,
              updatedAt: nowIso,
            },
            $push: {
              auditLog: {
                action: 'reprint_requested',
                requestedAt: nowIso,
                reprintCount: existing.reprintCount || 0,
                pdfExpiresAt: existing.pdfExpiresAt,
              },
            },
          },
          { returnDocument: 'after', projection: { pdfBase64: 0 } }
        )

        if (!reprintResult) {
          return res.status(409).json({
            success: false,
            conflict: true,
            error: 'Reprint request conflict: order is already reprinting or no longer eligible.',
          })
        }

        console.log(`[ORDER_REPRINT_REQUESTED] Order ${orderId} successfully queued for reprint (expiry preserved: ${reprintResult.pdfExpiresAt})`)

        return res.status(200).json({
          success: true,
          message: 'Reprint requested successfully. Document queued for printing.',
          orderId,
          printStatus: reprintResult.printStatus,
          pdfExpiresAt: reprintResult.pdfExpiresAt,
          printedAt: reprintResult.printedAt,
          reprintCount: reprintResult.reprintCount || 0,
          remainingMs: Math.max(0, expiryMs - nowMs),
          serverTime: nowIso,
        })
      } catch (reprintErr) {
        console.error(`[ORDER_REPRINT_ERROR] Order ${orderId}:`, reprintErr.message)
        return res.status(500).json({ success: false, error: reprintErr.message })
      }
    }

    // ── 5.6 RETENTION CLEANUP JOB (CANONICAL SERVER-SIDE PDF PURGE) ─────────
    if (action === 'cleanupExpiredPdfs') {
      try {
        const { db } = await connectToDatabase()
        const cleanupResult = await cleanupExpiredPdfs(db)
        return res.status(200).json(cleanupResult)
      } catch (cleanErr) {
        return res.status(500).json({ success: false, error: cleanErr.message })
      }
    }

    // ── 6. PHASE 2: READ-ONLY ORDERS PARITY AUDIT ───────────────────────────
    if (action === 'parityAudit') {
      try {
        const gasRes = await writeToGoogleAppsScript({ action: 'listOrders' })
        const sheetOrders = gasRes?.orders || []

        const { db } = await connectToDatabase()
        const ordersCollection = db.collection('orders')
        
        const indexes = await ordersCollection.indexes()
        const uniqueOrderIndex = indexes.find(idx => idx.key?.orderId === 1 && idx.unique === true)
        const isUniqueIndexVerified = !!uniqueOrderIndex

        const mongoOrders = await ordersCollection.find({}, { projection: { pdfBase64: 0 } }).toArray()

        const { runParityAudit, formatAuditReport } = await import('./_lib/parityAudit.js')
        const auditResult = runParityAudit({
          sheetOrders,
          mongoOrders,
          mongoUniqueIndexVerified: isUniqueIndexVerified,
        })
        const reportText = formatAuditReport(auditResult)

        return res.status(200).json({
          success: true,
          audit: auditResult,
          report: reportText,
        })
      } catch (auditErr) {
        return res.status(500).json({
          success: false,
          error: `Parity audit execution failed: ${auditErr.message}`,
        })
      }
    }

    // ── 7. PHASE 2.5: HISTORICAL ORDERS BACKFILL ────────────────────────────
    if (action === 'backfillOrders') {
      const mode = String(req.query?.mode || req.body?.mode || 'dry-run').toLowerCase()
      const isExecute = mode === 'execute'

      try {
        const gasRes = await writeToGoogleAppsScript({ action: 'listOrders' })
        const sheetOrders = gasRes?.orders || []

        const { db } = await connectToDatabase()
        const ordersCollection = db.collection('orders')
        const mongoOrders = await ordersCollection.find({}, { projection: { pdfBase64: 0 } }).toArray()

        const { planBackfill, executeBackfill, formatBackfillReport } = await import('./_lib/backfill.js')
        const plan = planBackfill({ sheetOrders, mongoOrders })

        let executionResult = null
        if (isExecute) {
          executionResult = await executeBackfill({ ordersCollection, plan })
        }

        const reportText = formatBackfillReport(plan, executionResult)

        let updatedAudit = null
        if (isExecute) {
          const { runParityAudit } = await import('./_lib/parityAudit.js')
          const updatedMongoOrders = await ordersCollection.find({}, { projection: { pdfBase64: 0 } }).toArray()
          const indexes = await ordersCollection.indexes()
          const isUniqueIndexVerified = !!indexes.find(idx => idx.key?.orderId === 1 && idx.unique === true)
          updatedAudit = runParityAudit({
            sheetOrders,
            mongoOrders: updatedMongoOrders,
            mongoUniqueIndexVerified: isUniqueIndexVerified,
          })
        }

        return res.status(200).json({
          success: true,
          mode: isExecute ? 'execute' : 'dry-run',
          plan,
          execution: executionResult,
          report: reportText,
          updatedAudit,
        })
      } catch (backfillErr) {
        return res.status(500).json({
          success: false,
          error: `Backfill failed: ${backfillErr.message}`,
        })
      }
    }

    return res.status(400).json({ success: false, error: `Unrecognized action: ${action}` })
  } catch (fatalErr) {
    console.error('[API Orders Fatal Error]:', fatalErr)
    return res.status(500).json({ success: false, error: fatalErr.message || 'Internal server error' })
  }
}
