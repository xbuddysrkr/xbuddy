/**
 * direct.js
 * 
 * Direct UPI Payment API Handlers for XBuddy.
 * Handles:
 * - Public receiving config retrieval (GET /api/payments/config)
 * - Server-authoritative order creation & intent generation (POST /api/payments/create-intent-order)
 * - Vector QR SVG retrieval (GET /api/payments/qr-svg)
 * - Real-time order verification polling (GET /api/payments/order-status)
 */

import { connectToDatabase } from '../_lib/mongodb.js'
import { calculateOrderPrice } from '../_lib/retention.js'
import { isBoothAuthorized } from '../_lib/boothAuth.js'
import {
  getShopkeeperUpiConfig,
  toPaise,
  toRupeesString,
  buildDirectUpiUri,
  buildDirectUpiIntents,
  generateVectorQrSvg,
} from '../_lib/directUpi.js'

export async function directUpiPaymentHandler(req, res, actionOverride) {
  // CORS & method routing
  const rawPath = actionOverride || (req.path || req.query?.route || req.url || '').replace(/^\/api\/payments\/?/, '')
  const action = rawPath.split('?')[0].replace(/^\/+|\/+$/g, '')

  // ── 1. GET /api/payments/config ───────────────────────────────────────────
  if (action === 'config' || action === '') {
    try {
      const cfg = getShopkeeperUpiConfig()
      return res.status(200).json({
        success: true,
        upiId: cfg.upiId,
        payeeName: cfg.payeeName,
        directUpiEnabled: true,
        gateway: 'DIRECT_UPI',
      })
    } catch (cfgErr) {
      return res.status(503).json({
        success: false,
        error: cfgErr.message || 'Payment receiving configuration is unavailable.',
      })
    }
  }

  // ── 2. POST /api/payments/create-intent-order ──────────────────────────────
  if (action === 'create-intent-order') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    try {
      const cfg = getShopkeeperUpiConfig()
      const payload = req.body || {}

      // Normalize or generate unique Order ID (e.g. XP1234 or XB1234)
      const rawOrderId = payload.orderId || payload.orderMeta?.orderId || ''
      const cleanOrderId = String(rawOrderId).trim().toUpperCase() || `XP${Math.floor(1000 + Math.random() * 9000)}`

      // ── Server-Side Authoritative Price Calculation ──
      // Never trust client amount; recalculate from actual print job parameters
      const printJob = {
        totalPages: Number(payload.totalPages || payload.orderMeta?.totalPages || payload.orderMeta?.filePages || 1),
        copies: Math.max(1, Number(payload.copies || payload.orderMeta?.copies || 1)),
        colorMode: String(payload.colorMode || payload.orderMeta?.colorMode || payload.printType || 'bw').toLowerCase(),
        duplex: Boolean(payload.duplex === true || payload.isDoubleSide === true || payload.printSide === 'Double'),
        printableCount: Number(payload.printableCount || payload.orderMeta?.printableCount || payload.orderMeta?.selectedPagesCount || 0) || undefined,
      }

      const priceResult = calculateOrderPrice(printJob)
      const authoritativeRupees = priceResult.totalAmount
      const expectedPaise = toPaise(authoritativeRupees)

      // 5-minute checkout expiry for student intent session
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
      const nowIso = now.toISOString()

      // Description for UPI payment transaction note: concise e.g. "XBuddy XP1234"
      const description = `XBuddy ${cleanOrderId}`

      // Build canonical UPI URI and app-specific intents
      const upiUri = buildDirectUpiUri({
        payeeVpa: cfg.upiId,
        payeeName: cfg.payeeName,
        amountPaise: expectedPaise,
        orderId: cleanOrderId,
        description,
      })

      const upiIntents = buildDirectUpiIntents({
        payeeVpa: cfg.upiId,
        payeeName: cfg.payeeName,
        amountPaise: expectedPaise,
        orderId: cleanOrderId,
        description,
      })

      // Generate Vector QR SVG directly on server
      const qrSvg = await generateVectorQrSvg(upiUri)

      // ── Persist Order in MongoDB ──
      const { db } = await connectToDatabase()
      const ordersCol = db.collection('orders')

      const existingOrder = await ordersCol.findOne({ orderId: cleanOrderId })
      if (existingOrder) {
        // Prevent modifying already completed/verified orders
        const currentPay = String(existingOrder.paymentStatus || '').toLowerCase()
        if (['paid', 'verified'].includes(currentPay)) {
          return res.status(200).json({
            success: true,
            orderId: cleanOrderId,
            amount: existingOrder.amount,
            amountPaise: existingOrder.amountPaise || toPaise(existingOrder.amount),
            currency: 'INR',
            paymentReference: cleanOrderId,
            payeeVpa: cfg.upiId,
            payeeName: cfg.payeeName,
            upiUri,
            upiIntents,
            qrSvg,
            expiresAt: existingOrder.checkoutExpiresAt || expiresAt,
            alreadyPaid: true,
          })
        }

        // Idempotently update checkout intent parameters
        await ordersCol.updateOne(
          { orderId: cleanOrderId },
          {
            $set: {
              amount: authoritativeRupees,
              amountPaise: expectedPaise,
              currency: 'INR',
              paymentReference: cleanOrderId,
              payeeVpa: cfg.upiId,
              payeeName: cfg.payeeName,
              checkoutExpiresAt: expiresAt,
              updatedAt: nowIso,
            },
          }
        )
      } else {
        // Create new pending order record
        await ordersCol.insertOne({
          orderId: cleanOrderId,
          fileName: payload.fileName || 'Untitled.pdf',
          fileSize: payload.fileSize || 0,
          totalPages: printJob.totalPages,
          copies: printJob.copies,
          colorMode: printJob.colorMode,
          printType: printJob.colorMode === 'color' ? 'Color' : 'B&W',
          printSide: printJob.duplex ? 'Double' : 'Single',
          amount: authoritativeRupees,
          amountPaise: expectedPaise,
          currency: 'INR',
          paymentReference: cleanOrderId,
          payeeVpa: cfg.upiId,
          payeeName: cfg.payeeName,
          paymentStatus: 'pending',
          printStatus: 'waiting_for_shopkeeper',
          phoneNumber: payload.phoneNumber || '',
          source: 'direct_upi_checkout',
          checkoutExpiresAt: expiresAt,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
      }

      console.log(`[DIRECT_UPI] Created checkout intent for Order ${cleanOrderId}: ₹${authoritativeRupees} (${expectedPaise} paise INR) to ${cfg.upiId}`)

      return res.status(200).json({
        success: true,
        orderId: cleanOrderId,
        amount: authoritativeRupees,
        amountPaise: expectedPaise,
        currency: 'INR',
        paymentReference: cleanOrderId,
        payeeVpa: cfg.upiId,
        payeeName: cfg.payeeName,
        upiUri,
        upiIntents,
        qrSvg,
        expiresAt,
      })
    } catch (orderErr) {
      console.error('[DIRECT_UPI_ERROR]:', orderErr)
      return res.status(500).json({
        success: false,
        error: orderErr.message || 'Failed to create payment intent order',
      })
    }
  }

  // ── 3. GET /api/payments/order-status ──────────────────────────────────────
  if (action === 'order-status') {
    const rawId = req.query?.orderId || req.body?.orderId || ''
    const cleanId = String(rawId).trim().toUpperCase()
    if (!cleanId) {
      return res.status(400).json({ success: false, error: 'orderId parameter is required' })
    }

    try {
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' })
      }

      const paymentStatus = order.paymentStatus || 'pending'
      const isPaid = ['paid', 'verified'].includes(String(paymentStatus).toLowerCase())

      return res.status(200).json({
        success: true,
        orderId: cleanId,
        amount: order.amount,
        amountPaise: order.amountPaise || toPaise(order.amount),
        currency: order.currency || 'INR',
        paymentReference: order.paymentReference || cleanId,
        paymentStatus,
        isPaid,
        printStatus: order.printStatus || 'waiting_for_shopkeeper',
        verifiedAt: order.verifiedAt || null,
        expiresAt: order.checkoutExpiresAt || null,
      })
    } catch (dbErr) {
      return res.status(503).json({ success: false, error: dbErr.message })
    }
  }

  // ── 3.5 POST /api/payments/verify-order (SHOPKEEPER MANUAL APPROVAL) ──────
  if (action === 'verify-order' || action === 'approve-payment') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }
    if (!isBoothAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized: staff authentication required.' })
    }

    const rawId = req.body?.orderId || req.query?.orderId || ''
    const cleanId = String(rawId).trim().toUpperCase()
    if (!cleanId) {
      return res.status(400).json({ success: false, error: 'orderId is required' })
    }

    try {
      const { db } = await connectToDatabase()
      const orders = db.collection('orders')
      const existing = await orders.findOne({ orderId: cleanId }, { projection: { pdfBase64: 0 } })
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found' })
      }

      const nowIso = new Date().toISOString()
      const isAlreadyVerified = ['paid', 'verified'].includes(String(existing.paymentStatus || '').toLowerCase())

      // Idempotent state transition
      const result = await orders.findOneAndUpdate(
        { orderId: cleanId },
        {
          $set: {
            paymentStatus: 'verified',
            isPaid: true,
            verifiedAt: existing.verifiedAt || nowIso,
            verifiedBy: req.body?.verifiedBy || 'shopkeeper',
            updatedAt: nowIso,
          },
          $push: {
            auditLog: {
              action: isAlreadyVerified ? 'payment_already_verified' : 'payment_verified',
              status: 'verified',
              verifiedAt: nowIso,
              verifiedBy: req.body?.verifiedBy || 'shopkeeper',
              note: req.body?.note || 'Manually verified against merchant UPI record',
            },
          },
        },
        { returnDocument: 'after' }
      )

      console.log(`[PAYMENT_VERIFIED] Shopkeeper verified Order ${cleanId} (₹${existing.amount})`)

      return res.status(200).json({
        success: true,
        orderId: cleanId,
        paymentStatus: 'verified',
        isPaid: true,
        amount: existing.amount,
        amountPaise: existing.amountPaise || toPaise(existing.amount),
        currency: 'INR',
        paymentReference: cleanId,
        verifiedAt: result?.verifiedAt || nowIso,
        order: result,
      })
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message })
    }
  }

  // ── 4. GET /api/payments/qr-svg ───────────────────────────────────────────
  if (action === 'qr-svg') {
    try {
      const uri = req.query?.uri
      if (!uri) {
        return res.status(400).send('<svg></svg>')
      }
      const svg = await generateVectorQrSvg(uri)
      res.setHeader('Content-Type', 'image/svg+xml')
      return res.status(200).send(svg)
    } catch (svgErr) {
      return res.status(500).send('<svg></svg>')
    }
  }

  return res.status(404).json({ success: false, error: `Unknown payments endpoint: ${action}` })
}

export default directUpiPaymentHandler
