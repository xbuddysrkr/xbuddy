import { connectToDatabase } from './_lib/mongodb.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

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

    // ── 2. GET ORDER STATUS (PHASE 1: GOOGLE APPS SCRIPT / ORDERS SHEET ONLY) ─
    if (action === 'getOrderStatus') {
      const orderId = String(req.query?.orderId || req.body?.orderId || '').trim().toUpperCase()
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' })
      }

      // CRITICAL PHASE 1 CONSTRAINT: Production reads come strictly from Google Apps Script / Orders Sheet
      const gasOrder = await writeToGoogleAppsScript({ action: 'getOrderStatus', orderId })
      return res.status(200).json(gasOrder)
    }

    // ── 3. LIST ORDERS (PHASE 1: GOOGLE APPS SCRIPT / ORDERS SHEET ONLY) ──────
    if (action === 'listOrders') {
      // CRITICAL PHASE 1 CONSTRAINT: Production reads come strictly from Google Apps Script / Orders Sheet
      const gasList = await writeToGoogleAppsScript({ action: 'listOrders' })
      return res.status(200).json(gasList)
    }

    // ── 4. UPDATE ORDER STATUS (WITH RACE-CONDITION SAFE PRINT RELEASE) ────
    if (action === 'updateOrderStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const printStatus = String(req.body?.printStatus || req.query?.printStatus || '').trim()
      if (!orderId || !printStatus) {
        return res.status(400).json({ success: false, error: 'orderId and printStatus required' })
      }

      const nowIso = new Date().toISOString()
      let updated = false

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
          updated = true
        } else {
          await orders.updateOne(
            { orderId },
            { $set: { printStatus, updatedAt: nowIso } }
          )
          updated = true
        }
      } catch (mErr) {
        console.warn(`[MongoDB updateOrderStatus notice]: ${mErr.message}`)
      }

      // Sync status update to Google Apps Script in background/dual-write
      try {
        await writeToGoogleAppsScript({ action: 'updateOrderStatus', orderId, printStatus })
      } catch (gErr) {
        console.warn(`[GAS updateOrderStatus notice]: ${gErr.message}`)
      }

      return res.status(200).json({ success: true, orderId, printStatus, mongoUpdated: updated })
    }

    // ── 5. UPDATE PAYMENT STATUS (ATOMIC SAFE) ──────────────────────────────
    if (action === 'updatePaymentStatus') {
      const orderId = String(req.body?.orderId || req.query?.orderId || '').trim().toUpperCase()
      const paymentStatus = String(req.body?.paymentStatus || req.query?.paymentStatus || '').trim()
      if (!orderId || !paymentStatus) {
        return res.status(400).json({ success: false, error: 'orderId and paymentStatus required' })
      }

      const nowIso = new Date().toISOString()

      try {
        const { db } = await connectToDatabase()
        await db.collection('orders').updateOne(
          { orderId },
          { $set: { paymentStatus, updatedAt: nowIso } }
        )
      } catch (mErr) {
        console.warn(`[MongoDB updatePaymentStatus notice]: ${mErr.message}`)
      }

      try {
        await writeToGoogleAppsScript({ action: 'updatePaymentStatus', orderId, paymentStatus })
      } catch (gErr) {
        console.warn(`[GAS updatePaymentStatus notice]: ${gErr.message}`)
      }

      return res.status(200).json({ success: true, orderId, paymentStatus })
    }

    return res.status(400).json({ success: false, error: `Unrecognized action: ${action}` })
  } catch (fatalErr) {
    console.error('[API Orders Fatal Error]:', fatalErr)
    return res.status(500).json({ success: false, error: fatalErr.message || 'Internal server error' })
  }
}
