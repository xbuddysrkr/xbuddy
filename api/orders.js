import { connectToDatabase } from './_lib/mongodb.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

/**
 * Feature flag for Orders read source: 'mongo' (default for Phase 3) or 'gas' (rollback).
 * Does NOT affect Campus Ads.
 */
export const getOrdersReadSource = () => (process.env.ORDERS_READ_SOURCE || 'mongo').trim().toLowerCase()

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
        driveUrl:             String(payload.driveUrl || '').trim(),
        paymentStatus:        'pending',
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
          existingMongo = await ordersCollection.findOne({ orderId: cleanId })
        } catch (findErr) {
          console.warn(`[MongoDB find notice]: ${findErr.message}`)
        }
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
        if (existingMongo.sheetsSaved || existingMongo.syncStatus === 'synced') {
          console.log(`[Idempotent Retry] Order ${cleanId} already synchronized.`)
          return res.status(200).json({
            success: true,
            orderId: cleanId,
            idempotent: true,
            mongoSaved: true,
            sheetsSaved: true,
            syncStatus: 'synced',
            message: 'Order already synchronized (idempotent retry)',
          })
        }

        // Case B Reconciliation: Mongo saved previously, but Google Sheet was pending/failed.
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
      // Check if Google Sheets already has this order (Case C Recovery Scenario)
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
          orderDoc.mongoSaved = true
          orderDoc.sheetsSaved = existingInSheets
          orderDoc.syncStatus = existingInSheets ? 'synced' : 'pending'
          await ordersCollection.insertOne(orderDoc)
          mongoSaved = true
          console.log(`[MongoDB Insert] Order ${cleanId} successfully saved to MongoDB Atlas`)
        } catch (mErr) {
          mongoError = mErr.message
          console.error(`[MongoDB Insert Failed] Order ${cleanId}: ${mErr.message}`)
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

    // ── 2. GET ORDER STATUS (PHASE 3: MONGODB PRIMARY + SAFE GAS FALLBACK) ──
    if (action === 'getOrderStatus') {
      const orderId = String(req.query?.orderId || req.body?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      const readSource = getOrdersReadSource()
      console.log(`[ORDER_STATUS_READ] Request for ${orderId} (source=${readSource})`)

      // Feature flag / Rollback check
      if (readSource === 'gas') {
        console.log(`[MONGO_READ_FALLBACK_GAS] ORDERS_READ_SOURCE=gas active. Reading ${orderId} from Google Sheets.`)
        const gasOrder = await writeToGoogleAppsScript({ action: 'getOrderStatus', orderId })
        return res.status(200).json(gasOrder)
      }

      // PRIMARY: MongoDB Atlas
      try {
        const { db } = await connectToDatabase()
        const order = await db.collection('orders').findOne({ orderId })
        if (order) {
          console.log(`[MONGO_READ_PRIMARY] Order ${orderId} retrieved successfully from MongoDB Atlas`)
          return res.status(200).json({ success: true, order, source: 'mongo' })
        } else {
          // MongoDB successfully queried and record does not exist
          console.log(`[ORDER_STATUS_READ] Order ${orderId} not found in MongoDB Atlas`)
          return res.status(404).json({ success: false, error: 'Order not found', source: 'mongo' })
        }
      } catch (mongoErr) {
        console.error(`[MONGO_READ_ERROR] MongoDB getOrderStatus error for ${orderId}: ${mongoErr.message}`)
      }

      // SAFE FALLBACK: Google Apps Script / Orders Sheet (only when MongoDB service/query fails)
      try {
        console.log(`[MONGO_READ_FALLBACK_GAS] Order ${orderId} falling back to Google Apps Script due to Mongo error`)
        const gasOrder = await writeToGoogleAppsScript({ action: 'getOrderStatus', orderId })
        return res.status(200).json({ ...gasOrder, source: 'gas_fallback' })
      } catch (gasErr) {
        console.error(`[GAS_READ_ERROR] Fallback failed for ${orderId}: ${gasErr.message}`)
        return res.status(404).json({ success: false, error: 'Order not found' })
      }
    }

    // ── 3. LIST ORDERS (PHASE 3: MONGODB PRIMARY + DEDUPLICATED GAS FALLBACK) 
    if (action === 'listOrders') {
      const readSource = getOrdersReadSource()
      console.log(`[ORDER_LIST_READ] Request for orders list (source=${readSource})`)

      // Feature flag / Rollback check
      if (readSource === 'gas') {
        console.log('[MONGO_READ_FALLBACK_GAS] ORDERS_READ_SOURCE=gas active. Reading list from Google Sheets.')
        try {
          const gasList = await writeToGoogleAppsScript({ action: 'listOrders' })
          const deduplicated = deduplicateSheetOrders(gasList?.orders || [])
          return res.status(200).json({ success: true, orders: deduplicated, source: 'gas_rollback' })
        } catch (gasErr) {
          return res.status(500).json({ success: false, error: gasErr.message })
        }
      }

      // PRIMARY: MongoDB Atlas
      try {
        const { db } = await connectToDatabase()
        const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).limit(100).toArray()
        if (Array.isArray(orders)) {
          console.log(`[MONGO_READ_PRIMARY] Successfully retrieved ${orders.length} orders from MongoDB Atlas`)
          return res.status(200).json({ success: true, orders, source: 'mongo' })
        }
      } catch (mongoErr) {
        console.error(`[MONGO_READ_ERROR] MongoDB listOrders error: ${mongoErr.message}`)
      }

      // SAFE FALLBACK: Google Apps Script with canonical deduplication
      try {
        console.log('[MONGO_READ_FALLBACK_GAS] MongoDB service unavailable. Falling back to Google Sheets listOrders with deduplication.')
        const gasList = await writeToGoogleAppsScript({ action: 'listOrders' })
        const rawOrders = gasList?.orders || []
        const deduplicated = deduplicateSheetOrders(rawOrders)
        console.log(`[MONGO_READ_FALLBACK_GAS] Deduplicated ${rawOrders.length} sheet rows to ${deduplicated.length} unique orders.`)
        return res.status(200).json({ success: true, orders: deduplicated, source: 'gas_fallback' })
      } catch (gasErr) {
        console.error(`[GAS_READ_ERROR] Fallback failed for listOrders: ${gasErr.message}`)
        return res.status(500).json({ success: false, error: gasErr.message })
      }
    }

    // ── 4. UPDATE ORDER STATUS (DUAL-WRITE + ATOMIC RELEASE LOCK) ───────────
    if (action === 'updateOrderStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const printStatus = String(req.body?.printStatus || req.query?.printStatus || '').trim()
      if (!orderId || !printStatus) {
        return res.status(400).json({ success: false, error: 'orderId and printStatus required' })
      }

      console.log(`[ORDER_STATUS_WRITE_SYNC] Updating ${orderId} to printStatus "${printStatus}"`)

      const nowIso = new Date().toISOString()
      let mongoUpdated = false

      try {
        const { db } = await connectToDatabase()
        const orders = db.collection('orders')

        // Atomic print-release lock: prevent duplicate release when simultaneous requests arrive
        if (printStatus === 'Printing') {
          const raceSafeResult = await orders.findOneAndUpdate(
            {
              orderId,
              printStatus: { $nin: ['Printing', 'Printed'] },
            },
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
          await orders.updateOne(
            { orderId },
            { $set: { printStatus, updatedAt: nowIso } }
          )
          mongoUpdated = true
        }
      } catch (mErr) {
        console.warn(`[MONGO_WRITE_ERROR] MongoDB updateOrderStatus notice for ${orderId}: ${mErr.message}`)
      }

      // Sync status update to Google Apps Script in background/dual-write
      try {
        await writeToGoogleAppsScript({ action: 'updateOrderStatus', orderId, printStatus })
      } catch (gErr) {
        console.warn(`[GAS_WRITE_ERROR] GAS updateOrderStatus notice for ${orderId}: ${gErr.message}`)
      }

      return res.status(200).json({ success: true, orderId, printStatus, mongoUpdated })
    }

    // ── 5. UPDATE PAYMENT STATUS (DUAL-WRITE) ────────────────────────────────
    if (action === 'updatePaymentStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const paymentStatus = String(req.body?.paymentStatus || req.query?.paymentStatus || '').trim()
      if (!orderId || !paymentStatus) {
        return res.status(400).json({ success: false, error: 'orderId and paymentStatus required' })
      }

      console.log(`[PAYMENT_STATUS_WRITE_SYNC] Updating ${orderId} to paymentStatus "${paymentStatus}"`)

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
        console.warn(`[MONGO_WRITE_ERROR] MongoDB updatePaymentStatus notice for ${orderId}: ${mErr.message}`)
      }

      try {
        await writeToGoogleAppsScript({ action: 'updatePaymentStatus', orderId, paymentStatus })
      } catch (gErr) {
        console.warn(`[GAS_WRITE_ERROR] GAS updatePaymentStatus notice for ${orderId}: ${gErr.message}`)
      }

      return res.status(200).json({ success: true, orderId, paymentStatus, mongoUpdated })
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

        const mongoOrders = await ordersCollection.find({}).toArray()

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
        const mongoOrders = await ordersCollection.find({}).toArray()

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
          const updatedMongoOrders = await ordersCollection.find({}).toArray()
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
