import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { savePdfToGridFS, deletePdfFromGridFS } from '../api/_lib/gridfs.js'

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
]
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
}

const RENDER_BASE = 'https://xbuddy.onrender.com'
const VERCEL_BASE = 'https://xbuddysrkr.vercel.app'

async function runLiveVerification() {
  console.log('=== XBUDDY LIVE PRODUCTION FLOW VERIFICATION ===\n')

  const testOrderId = `XB95${Math.floor(10000 + Math.random() * 90000)}`
  console.log(`[SETUP] Creating synthetic test order ${testOrderId} in MongoDB Atlas...`)

  const { db } = await connectToDatabase()
  const orders = db.collection('orders')

  const samplePdf = Buffer.from('%PDF-1.4 synthetic test pdf buffer for live verification only\n%%EOF')
  await savePdfToGridFS(db, testOrderId, samplePdf)

  const printTime = new Date(Date.now() - 4 * 60 * 1000).toISOString() // 4 mins ago
  const expiryTime = new Date(new Date(printTime).getTime() + 30 * 60 * 1000).toISOString()
  const origTxId = 'TXN_ORIG_LIVE_PROBE_111'

  await orders.insertOne({
    orderId: testOrderId,
    name: '9999999999',
    fileName: `${testOrderId}.pdf`,
    totalPages: 8,
    printableCount: 8,
    copies: 1,
    colorMode: 'bw',
    printType: 'B&W',
    printSide: 'Single',
    duplex: false,
    pageSize: 'A4',
    orientation: 'portrait',
    amount: 18,        // 8 pages * 2 = 16 + 2 fee = 18
    printingCost: 16,
    serviceFee: 2,
    transactionId: origTxId,
    paymentStatus: 'pending', // Starts pending
    printStatus: 'Printed',
    printedAt: printTime,
    pdfExpiresAt: expiryTime,
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
    reprintCount: 0,
    isSyntheticTest: true,
  })

  try {
    // 1. Initiate Reprint through live Render endpoint
    console.log('[STEP 1] Testing live Render API initiateReprint...')
    const initRes = await fetch(`${RENDER_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'initiateReprint', orderId: testOrderId }),
    })
    const initData = await initRes.json()
    console.log('Initiate reprint response:', initRes.status, initData)

    if (initRes.status !== 200 || !initData.attemptId) {
      throw new Error(`Initiate reprint failed: HTTP ${initRes.status} ${JSON.stringify(initData)}`)
    }
    if (initData.amount !== 18 || initData.printingCost !== 16 || initData.serviceFee !== 2) {
      throw new Error(`Pricing calculation mismatch: expected 18, got ${initData.amount}`)
    }
    console.log('✓ Step 1 Passed: initiateReprint returned unique attemptId and exact price ₹18')

    // 2. Test anti-reuse guard through live Vercel proxy
    console.log('\n[STEP 2] Testing live Vercel proxy submitReprintPayment with reused original UTR...')
    const reuseRes = await fetch(`${VERCEL_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submitReprintPayment',
        orderId: testOrderId,
        attemptId: initData.attemptId,
        transactionId: origTxId, // Reused UTR!
        phone: '9999999999',
      }),
    })
    const reuseData = await reuseRes.json()
    console.log('Reused UTR submission response:', reuseRes.status, reuseData)

    if (reuseRes.status !== 400 || !reuseData.error?.includes('Cannot reuse the original order transaction ID')) {
      throw new Error(`Reused UTR was not rejected properly: HTTP ${reuseRes.status} ${JSON.stringify(reuseData)}`)
    }
    console.log('✓ Step 2 Passed: Reusing original order transaction ID is strictly rejected (HTTP 400)')

    // 3. Test submitting payment with new transaction reference (MUST REMAIN PENDING)
    console.log('\n[STEP 3] Testing live submitReprintPayment with new unique UTR...')
    const newTxId = 'TXN_REPRINT_LIVE_999'
    const newPayRes = await fetch(`${RENDER_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submitReprintPayment',
        orderId: testOrderId,
        attemptId: initData.attemptId,
        transactionId: newTxId,
        phone: '9999999999',
        paymentStatus: 'paid', // Malicious client attempt to bypass verification
      }),
    })
    const newPayData = await newPayRes.json()
    console.log('New payment submission response:', newPayRes.status, newPayData)

    if (newPayRes.status !== 200 || newPayData.paymentStatus !== 'pending' || newPayData.printAuthorized !== false) {
      throw new Error(`New payment submission must remain pending: HTTP ${newPayRes.status} ${JSON.stringify(newPayData)}`)
    }
    console.log('✓ Step 3 Passed: Submitted reprint payment remains pending with print un-queued')

    // 4. Shopkeeper Explicit Verification via Booth/Admin route
    console.log('\n[STEP 4] Testing live verifyReprintPayment by shopkeeper...')
    const verifyRes = await fetch(`${RENDER_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verifyReprintPayment',
        orderId: testOrderId,
        attemptId: initData.attemptId,
        paymentStatus: 'paid',
      }),
    })
    const verifyData = await verifyRes.json()
    console.log('Shopkeeper verification response:', verifyRes.status, verifyData)

    if (verifyRes.status !== 200 || verifyData.paymentStatus !== 'paid' || verifyData.printStatus !== 'waiting_for_shopkeeper') {
      throw new Error(`Shopkeeper verification failed: HTTP ${verifyRes.status} ${JSON.stringify(verifyData)}`)
    }
    console.log('✓ Step 4 Passed: Explicit verification marked attempt paid and queued document for printing')

    // 5. Verify authoritative MongoDB Atlas document integrity
    console.log('\n[STEP 5] Verifying data integrity in MongoDB Atlas...')
    const doc = await orders.findOne({ orderId: testOrderId })
    if (doc.transactionId !== origTxId) {
      throw new Error(`DATA INTEGRITY VIOLATION: original transactionId was changed to ${doc.transactionId}`)
    }
    if (doc.paymentStatus !== 'pending') {
      throw new Error(`DATA INTEGRITY VIOLATION: original paymentStatus was changed to ${doc.paymentStatus}`)
    }
    if (doc.printedAt !== printTime) {
      throw new Error(`DATA INTEGRITY VIOLATION: original printedAt was reset to ${doc.printedAt}`)
    }
    if (doc.pdfExpiresAt !== expiryTime) {
      throw new Error(`DATA INTEGRITY VIOLATION: original pdfExpiresAt was reset to ${doc.pdfExpiresAt}`)
    }
    const attempt = doc.reprintAttempts?.find(a => a.attemptId === initData.attemptId)
    if (!attempt || attempt.transactionId !== newTxId || attempt.paymentStatus !== 'paid' || !attempt.printAuthorized) {
      throw new Error(`Reprint attempt not recorded properly in MongoDB document`)
    }
    console.log('✓ Step 5 Passed: Original transactionId, paymentStatus, printedAt, and pdfExpiresAt remain 100% intact!')

    // 6. Duplicate Verification / Race Protection:
    console.log('\n[STEP 6] Testing duplicate verification / race protection...')
    const dupRes = await fetch(`${RENDER_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verifyReprintPayment',
        orderId: testOrderId,
        attemptId: initData.attemptId,
        paymentStatus: 'paid',
      }),
    })
    const dupData = await dupRes.json()
    console.log('Duplicate verification response:', dupRes.status, dupData)
    if (dupRes.status !== 409) {
      throw new Error(`Expected HTTP 409 conflict on duplicate verification, got ${dupRes.status}`)
    }
    console.log('✓ Step 6 Passed: Duplicate reprint verification blocked with HTTP 409 Conflict')

    console.log('\n=== ALL LIVE VERIFICATION CHECKS PASSED PERFECTLY! ===')
  } finally {
    // Clean up test order
    console.log(`\n[CLEANUP] Safely removing synthetic test order ${testOrderId}...`)
    await orders.deleteOne({ orderId: testOrderId })
    try {
      await deletePdfFromGridFS(db, testOrderId)
    } catch {}
    await closeDatabaseConnection()
    console.log('[CLEANUP] Completed cleanly.')
  }
}

runLiveVerification().catch(err => {
  console.error('LIVE VERIFICATION ERROR:', err)
  process.exit(1)
})
