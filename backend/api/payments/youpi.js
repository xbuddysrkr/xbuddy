import { connectToDatabase } from '../_lib/mongodb.js'
import {
  calculateOrderPrice,
  calculateUnprintedExpiryTimestamp,
  getEffectiveExpiryTimestamp,
} from '../_lib/retention.js'
import {
  savePdfToGridFS,
} from '../_lib/gridfs.js'
import {
  savePdfToDiskCache,
  writeToGoogleAppsScript,
  getOrdersSheetWriteMode,
  normalizeSelectedPages,
} from '../orders.js'
import {
  isYouPiEnabled,
  getYouPiConfig,
  toPaise,
  toRupeesString,
  createYouPiPaymentSession,
  verifyYouPiWebhook,
} from '../_lib/youpi.js'

/**
 * Handles all /api/payments/youpi/* endpoints:
 * 1. GET  /api/payments/youpi/config
 * 2. POST /api/payments/youpi/create-session
 * 3. POST /api/payments/youpi/webhook
 * 4. GET  /api/payments/youpi/status/:orderId
 */
export async function youpiPaymentHandler(req, res) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'X-Gateway-Signature',
    'X-Gateway-Event',
    'X-Gateway-Delivery-Id',
    'X-Gateway-Timestamp',
    'X-Merchant-Id',
    'X-Merchant-Key',
    'Idempotency-Key',
  ].join(', '))

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Parse path
  let path = ''
  try {
    const parsedUrl = new URL(req.url, 'http://localhost')
    path = parsedUrl.pathname.replace(/^\/api\/payments\/youpi\/?/, '')
  } catch {
    path = (req.url || '').replace(/^\/api\/payments\/youpi\/?/, '')
  }

  // Handle route queries e.g. /api/payments/youpi?action=...
  const action = req.query?.action || path.split('/')[0] || ''

  // ── 1. GET CONFIG (PUBLIC SAFE METADATA) ──────────────────────────────────
  if (action === 'config' || (req.method === 'GET' && path === 'config')) {
    const cfg = getYouPiConfig()
    return res.status(200).json({
      success: true,
      enabled: cfg.enabled,
      publicKey: cfg.publicKey,
      portalUrl: cfg.portalUrl,
      currency: 'INR',
      stage: 'staging_experimental',
      notice: 'YouPI-PG integration is experimental and intended for controlled development and staging testing only.',
    })
  }

  // ── 2. CREATE PAYMENT SESSION ─────────────────────────────────────────────
  if (action === 'create-session' || (req.method === 'POST' && path === 'create-session')) {
    if (!isYouPiEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'YouPI-PG payment gateway integration is currently disabled by server configuration.',
        fallbackAvailable: true,
      })
    }

    const payload = req.body || {}
    let rawOrderId = payload.orderId || payload.order_id
    if (!rawOrderId) {
      // Deterministic XBuddy client/server prefix
      rawOrderId = 'XB' + String(Math.floor(1000 + Math.random() * 9000))
    }
    const cleanId = String(rawOrderId).trim().toUpperCase()

    // 2.1 Calculate authoritative server-side price using XBuddy pricing engine
    const priceCalculation = calculateOrderPrice({
      totalPages: payload.totalPages || 1,
      copies: payload.copies || 1,
      colorMode: payload.colorMode || (payload.printType === 'Color' ? 'color' : 'bw'),
      printType: payload.printType,
      printSide: payload.printSide,
      duplex: payload.duplex === true || payload.duplex === 'true' || payload.printSide === 'Double',
      printableCount: payload.printableCount,
      selectedPages: payload.selectedPages,
      selectedPageCount: payload.selectedPageCount,
      pageRange: payload.pageRange,
    })

    const expectedTotalRupees = priceCalculation.totalAmount
    const expectedPaise = toPaise(expectedTotalRupees)

    // Audit: Detect client-side price tampering attempt if client sent an amount
    if (payload.amount !== undefined && payload.amount !== null) {
      const clientPaise = toPaise(payload.amount)
      if (clientPaise !== expectedPaise) {
        console.warn(`[YOUPI_PRICE_GUARD] Client amount (₹${payload.amount}) differs from authoritative price (₹${expectedTotalRupees}) for order ${cleanId}. Enforcing authoritative server price.`)
      }
    }

    const nowIso = new Date().toISOString()
    const isDuplex = payload.duplex === true || payload.duplex === 'true' || payload.printSide === 'Double'
    const normalizedColor = (payload.colorMode === 'color' || payload.printType === 'Color') ? 'color' : 'bw'
    const normalizedPages = normalizeSelectedPages(payload.selectedPages)

    // 2.2 Persist order to MongoDB Atlas BEFORE opening payment session
    let db = null
    try {
      const conn = await connectToDatabase()
      db = conn.db
    } catch (connErr) {
      return res.status(503).json({
        success: false,
        error: `Database unavailable for payment session creation: ${connErr.message}`,
      })
    }

    const ordersCol = db.collection('orders')
    const existingOrder = await ordersCol.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })

    // Decode and persist PDF if supplied in create-session payload
    let pdfBuffer = payload.pdfBuffer || null
    if (!pdfBuffer && payload.pdfBase64 && typeof payload.pdfBase64 === 'string' && payload.pdfBase64.length >= 50) {
      try {
        pdfBuffer = Buffer.from(payload.pdfBase64.trim(), 'base64')
      } catch {}
    }

    if (!existingOrder) {
      const orderDoc = {
        orderId: cleanId,
        name: String(payload.name || payload.phone || '').trim(),
        fileName: String(payload.fileName || `${cleanId}.pdf`).trim(),
        totalPages: Number(payload.totalPages) || 1,
        copies: Number(payload.copies) || 1,
        colorMode: normalizedColor,
        printType: normalizedColor === 'color' ? 'Color' : 'B&W',
        printSide: isDuplex ? 'Double' : 'Single',
        duplex: isDuplex,
        pageSize: String(payload.pageSize || payload.paperSize || 'A4').trim().toUpperCase(),
        paperSize: String(payload.pageSize || payload.paperSize || 'A4').trim().toUpperCase(),
        orientation: String(payload.orientation || 'portrait').trim().toLowerCase(),
        amount: expectedTotalRupees,
        amountPaise: expectedPaise,
        printingCost: priceCalculation.printingCost,
        serviceFee: priceCalculation.serviceFee,
        digitalProcessingFee: priceCalculation.digitalProcessingFee,
        transactionId: '',
        pageRange: String(payload.pageRange || 'all').trim(),
        pageRangeMode: String(payload.pageRangeMode || (payload.pageRange === 'all' ? 'all' : 'custom')).trim(),
        customPages: String(payload.customPages || '').trim(),
        printableCount: priceCalculation.printablePages,
        selectedPages: normalizedPages,
        selectedPageCount: normalizedPages.length > 0 ? normalizedPages.length : 1,
        driveUrl: String(payload.driveUrl || '').trim(),
        hasPdf: false,
        hasGridFsPdf: false,
        pdfStorage: 'none',
        pdfSize: pdfBuffer ? pdfBuffer.length : 0,
        pdfUploadedAt: nowIso,
        pdfExpiresAt: calculateUnprintedExpiryTimestamp(nowIso),
        pdfBase64: '',
        paymentGateway: 'youpi',
        paymentStatus: 'pending',
        printStatus: 'waiting_for_shopkeeper',
        createdAt: nowIso,
        updatedAt: nowIso,
        syncStatus: 'pending',
        mongoSaved: true,
        sheetsSaved: false,
      }

      if (pdfBuffer && pdfBuffer.length >= 5) {
        try {
          await savePdfToGridFS(db, cleanId, pdfBuffer, { fileName: orderDoc.fileName })
          savePdfToDiskCache(cleanId, pdfBuffer)
          orderDoc.hasPdf = true
          orderDoc.hasGridFsPdf = true
          orderDoc.pdfStorage = 'gridfs'
        } catch (pdfSaveErr) {
          console.warn(`[YOUPI_PDF_WARN] GridFS storage failed for ${cleanId}: ${pdfSaveErr.message}`)
        }
      }

      await ordersCol.insertOne(orderDoc)
    } else {
      // Existing order: update gateway and amount if still pending
      if (existingOrder.paymentStatus !== 'paid' && existingOrder.paymentStatus !== 'completed') {
        await ordersCol.updateOne(
          { orderId: cleanId },
          {
            $set: {
              paymentGateway: 'youpi',
              amount: expectedTotalRupees,
              amountPaise: expectedPaise,
              updatedAt: nowIso,
            },
          }
        )
      }
    }

    // 2.3 Call YouPI-PG Gateway createPayment
    try {
      const session = await createYouPiPaymentSession({
        orderId: cleanId,
        amount: expectedTotalRupees,
        currency: 'INR',
        returnUrl: payload.returnUrl,
        customer: {
          phoneNumber: String(payload.phone || payload.name || '').trim(),
        },
        metadata: {
          fileName: payload.fileName || `${cleanId}.pdf`,
          copies: payload.copies || 1,
          billablePages: priceCalculation.totalBillablePages,
        },
      })

      // Link paymentId with MongoDB document
      await ordersCol.updateOne(
        { orderId: cleanId },
        {
          $set: {
            gatewayPaymentId: session.paymentId,
            gatewayCheckoutUrl: session.checkoutUrl,
            updatedAt: new Date().toISOString(),
          },
        }
      )

      return res.status(200).json({
        success: true,
        orderId: cleanId,
        paymentId: session.paymentId,
        checkoutUrl: session.checkoutUrl,
        amount: session.amount || toRupeesString(expectedPaise),
        amountPaise: session.amountPaise || String(expectedPaise),
        currency: session.currency || 'INR',
        portalUrl: getYouPiConfig().portalUrl,
      })
    } catch (sessionErr) {
      console.error(`[YOUPI_SESSION_ERROR] Failed to create gateway session for ${cleanId}:`, sessionErr.message)
      return res.status(502).json({
        success: false,
        error: `Failed to initiate payment session with YouPI gateway: ${sessionErr.message}`,
        fallbackAvailable: true,
      })
    }
  }

  // ── 3. AUTHORITATIVE WEBHOOK VERIFICATION ─────────────────────────────────
  if (action === 'webhook' || (req.method === 'POST' && path === 'webhook')) {
    const signatureHeader = req.headers['x-gateway-signature']
    const signatureV2Header = req.headers['x-gateway-signature-v2']
    const timestampHeader = req.headers['x-gateway-timestamp']
    const deliveryIdHeader = req.headers['x-gateway-delivery-id']
    const eventHeader = req.headers['x-gateway-event']

    // Must have raw request body
    const rawBody = req.rawBody || req.body
    if (!rawBody) {
      return res.status(400).send('Missing webhook raw request body')
    }

    // 3.1 Verify HMAC signature against raw body bytes (supports V1 and V2 signatures)
    let verifiedEvent = null
    try {
      verifiedEvent = verifyYouPiWebhook({
        rawBody,
        signatureHeader,
        signatureV2Header,
        timestampHeader,
        deliveryIdHeader,
      })
    } catch (sigErr) {
      console.warn(`[YOUPI_WEBHOOK_REJECTED] Signature verification failed: ${sigErr.message}`)
      return res.status(400).send(`Invalid signature: ${sigErr.message}`)
    }

    // Normalized event details
    const eventName = String(verifiedEvent.event || eventHeader || '').toUpperCase()
    const orderId = String(verifiedEvent.orderId || verifiedEvent.order_id || '').trim().toUpperCase()
    const paymentId = String(verifiedEvent.paymentId || verifiedEvent.payment_id || '').trim()
    const deliveryId = String(deliveryIdHeader || verifiedEvent.deliveryId || '').trim()
    const eventCurrency = String(verifiedEvent.currency || 'INR').toUpperCase()

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Webhook event is missing orderId' })
    }

    if (eventCurrency !== 'INR') {
      console.warn(`[YOUPI_WEBHOOK_REJECTED] Unsupported currency: ${eventCurrency}`)
      return res.status(400).json({ success: false, error: `Unsupported currency: ${eventCurrency}` })
    }

    // 3.2 Fetch existing order from MongoDB Atlas
    let db = null
    try {
      const conn = await connectToDatabase()
      db = conn.db
    } catch (dbErr) {
      console.error('[YOUPI_WEBHOOK_DB_ERR]:', dbErr.message)
      return res.status(503).json({ success: false, error: 'Database service unavailable' })
    }

    const ordersCol = db.collection('orders')
    const existingOrder = await ordersCol.findOne({ orderId }, { projection: { pdfBase64: 0 } })

    if (!existingOrder) {
      console.warn(`[YOUPI_WEBHOOK_404] Order ${orderId} not found in database. Rejecting event.`)
      return res.status(404).json({ success: false, error: `Order ${orderId} not found` })
    }

    // 3.3 Strict Amount Verification in Integer Paise
    const expectedPaise = toPaise(existingOrder.amount)
    let eventPaise = null
    if (verifiedEvent.amountPaise !== undefined && verifiedEvent.amountPaise !== null) {
      eventPaise = Number(verifiedEvent.amountPaise)
    } else if (verifiedEvent.amount !== undefined && verifiedEvent.amount !== null) {
      eventPaise = toPaise(verifiedEvent.amount)
    }

    if (eventPaise === null || eventPaise !== expectedPaise) {
      console.error(`[YOUPI_WEBHOOK_AMOUNT_MISMATCH] Order ${orderId}: expected ${expectedPaise} paise (₹${existingOrder.amount}), but webhook reported ${eventPaise} paise. Fraud prevention reject.`)
      return res.status(400).json({
        success: false,
        error: `Amount mismatch: expected ${expectedPaise} paise, received ${eventPaise} paise.`,
      })
    }

    // 3.4 Idempotency & Terminal State Guard (Duplicate Deliveries and Reordered Events)
    const isAlreadyPaid = existingOrder.paymentStatus === 'paid' || existingOrder.paymentStatus === 'completed'
    if (isAlreadyPaid) {
      console.log(`[YOUPI_WEBHOOK_TERMINAL_GUARD] Order ${orderId} already marked PAID. Acknowledging ${eventName} event (deliveryId: ${deliveryId || 'none'}) idempotently without state regression or duplicate print side effects.`)
      return res.status(200).json({
        received: true,
        orderId,
        idempotent: true,
        status: 'PAID',
      })
    }

    const nowIso = new Date().toISOString()

    // 3.5 State Transitions
    if (eventName === 'SUCCESS') {
      const updateDoc = {
        paymentStatus: 'paid',
        paymentGateway: 'youpi',
        paymentMethod: 'youpi_upi',
        verifiedAt: nowIso,
        updatedAt: nowIso,
      }

      if (paymentId) updateDoc.gatewayPaymentId = paymentId
      if (deliveryId) updateDoc.gatewayDeliveryId = deliveryId

      // Authorize printing: ensure printStatus is waiting_for_shopkeeper if not already printing/printed
      if (!['printing', 'printed'].includes(String(existingOrder.printStatus || '').toLowerCase())) {
        updateDoc.printStatus = 'waiting_for_shopkeeper'
      }

      // If this order is a reprint attempt, authorize reprint
      if (existingOrder.reprintPending && existingOrder.activeReprintAttemptId) {
        await ordersCol.updateOne(
          { orderId, 'reprintAttempts.attemptId': existingOrder.activeReprintAttemptId },
          {
            $set: {
              'reprintAttempts.$.paymentStatus': 'paid',
              'reprintAttempts.$.printAuthorized': true,
              'reprintAttempts.$.verifiedAt': nowIso,
            },
          }
        )
      }

      await ordersCol.updateOne(
        { orderId },
        {
          $set: updateDoc,
          $push: {
            webhookDeliveries: deliveryId || `del_${Date.now()}`,
            paymentHistory: {
              action: 'youpi_payment_success',
              paymentId,
              deliveryId,
              amountPaise: expectedPaise,
              timestamp: nowIso,
            },
          },
        }
      )

      // Dual-write update to Google Sheets if mode is active
      const sheetWriteMode = getOrdersSheetWriteMode()
      if (sheetWriteMode === 'dual') {
        try {
          await writeToGoogleAppsScript({
            action: 'updateOrderStatus',
            orderId,
            paymentStatus: 'Paid',
            printStatus: existingOrder.printStatus || 'waiting_for_shopkeeper',
          })
        } catch (sheetErr) {
          console.warn(`[YOUPI_SHEET_DUAL_WRITE_WARN] Google Sheets sync error for ${orderId}: ${sheetErr.message}`)
        }
      }

      console.log(`[YOUPI_PAYMENT_VERIFIED] Order ${orderId} successfully marked PAID via authoritative webhook (paymentId: ${paymentId})`)
      return res.status(200).json({ received: true, orderId, status: 'PAID' })
    }

    if (eventName === 'FAILED' || eventName === 'CANCELLED' || eventName === 'EXPIRED') {
      const newStatus = eventName.toLowerCase()
      await ordersCol.updateOne(
        { orderId },
        {
          $set: {
            paymentStatus: newStatus,
            updatedAt: nowIso,
          },
          $push: {
            webhookDeliveries: deliveryId || `del_${Date.now()}`,
            paymentHistory: {
              action: `youpi_payment_${newStatus}`,
              paymentId,
              deliveryId,
              timestamp: nowIso,
            },
          },
        }
      )

      console.log(`[YOUPI_PAYMENT_STATE] Order ${orderId} transitioned to ${newStatus}`)
      return res.status(200).json({ received: true, orderId, status: eventName })
    }

    return res.status(400).json({ success: false, error: `Unrecognized gateway event: ${eventName}` })
  }

  // ── 4. GET PAYMENT STATUS (STUDENT READ-ONLY POLLING) ──────────────────────
  if (action === 'status' || path.startsWith('status/')) {
    const rawId = path.startsWith('status/') ? path.slice('status/'.length) : (req.query?.orderId || '')
    const cleanId = String(rawId).trim().toUpperCase()

    if (!cleanId) {
      return res.status(400).json({ success: false, error: 'orderId is required' })
    }

    try {
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' })
      }

      return res.status(200).json({
        success: true,
        orderId: cleanId,
        paymentStatus: order.paymentStatus || 'pending',
        printStatus: order.printStatus || 'waiting_for_shopkeeper',
        verifiedAt: order.verifiedAt || null,
        reprintPending: Boolean(order.reprintPending),
      })
    } catch (dbErr) {
      return res.status(503).json({ success: false, error: dbErr.message })
    }
  }

  return res.status(404).json({ success: false, error: `Endpoint not found: ${path}` })
}

export default youpiPaymentHandler
