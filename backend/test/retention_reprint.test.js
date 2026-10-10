import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'
import dotenv from 'dotenv'
import { GridFSBucket } from 'mongodb'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import {
  savePdfToGridFS,
  getPdfStreamFromGridFS,
  deletePdfFromGridFS,
  hasPdfInGridFS,
  getGridFSBucket,
} from '../api/_lib/gridfs.js'
import {
  RETENTION_MINUTES,
  RETENTION_WINDOW_MS,
  calculateExpiryTimestamp,
  isOrderReprintEligible,
  cleanupExpiredPdfs,
} from '../api/_lib/retention.js'
import ordersHandler from '../api/orders.js'
import agentOrdersHandler from '../api/agent/orders.js'

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(process.cwd(), '..', 'backend', '.env'),
  path.resolve(process.cwd(), '..', '.env'),
]
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    if (process.env.MONGODB_URI) break
  }
}

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {} }) {
  const req = {
    method,
    query,
    body,
    headers: { ...headers },
    url: '/api/orders',
  }
  class MockResponse extends Writable {
    constructor() {
      super()
      this.statusCode = 200
      this.headers = {}
      this.bodyData = null
      this._chunks = []
      this.headersSent = false
    }
    status(code) {
      this.statusCode = code
      return this
    }
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val
      return this
    }
    json(data) {
      this.bodyData = data
      this.headersSent = true
      this.emit('finish')
      return this
    }
    send(buf) {
      this.bodyData = buf
      this.headersSent = true
      this.emit('finish')
      return this
    }
    _write(chunk, encoding, callback) {
      this._chunks.push(chunk)
      callback()
    }
    _final(callback) {
      if (this._chunks.length > 0) {
        this.bodyData = Buffer.concat(this._chunks)
      }
      this.headersSent = true
      this.emit('finish')
      callback()
    }
  }
  const res = new MockResponse()
  return { req, res }
}

const SAMPLE_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')
const SAMPLE_BASE64 = SAMPLE_PDF.toString('base64')

async function runRegressionSuite() {
  console.log('================================================================')
  console.log('  STARTING XBUDDY 30-MIN PDF RETENTION & REPRINT TEST SUITE     ')
  console.log('================================================================\n')

  const { db } = await connectToDatabase()
  const ordersCol = db.collection('orders')
  const testIdsToCleanup = []

  try {
    // ── TEST 1: Printed orders have server-generated 30-minute expiry ────────
    console.log('[TEST 1] Testing server-generated 30-minute expiry on status Printed...')
    const id1 = `XB71${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id1)

    // Save fresh order in waiting_for_shopkeeper
    const { req: req1Save, res: res1Save } = createMockReqRes({
      body: { action: 'saveOrder', orderId: id1, fileName: 'test1.pdf', copies: 1, amount: 10, pdfBase64: SAMPLE_BASE64 }
    })
    await ordersHandler(req1Save, res1Save)
    assert.strictEqual(res1Save.statusCode, 200, `Save order must return 200, got ${res1Save.statusCode}: ${JSON.stringify(res1Save.bodyData)}`)

    const doc1Initial = await ordersCol.findOne({ orderId: id1 })
    assert.strictEqual(doc1Initial.printedAt, undefined, 'printedAt must not exist before printing')
    assert.strictEqual(doc1Initial.pdfExpiresAt, undefined, 'pdfExpiresAt must not exist before printing')

    // Transition status to Printed
    const beforePrintMs = Date.now()
    const { req: req1Print, res: res1Print } = createMockReqRes({
      body: { action: 'updateOrderStatus', orderId: id1, printStatus: 'Printed' }
    })
    await ordersHandler(req1Print, res1Print)
    assert.strictEqual(res1Print.statusCode, 200)

    const doc1Printed = await ordersCol.findOne({ orderId: id1 })
    assert.ok(doc1Printed.printedAt, 'printedAt must be set upon transition to Printed')
    assert.ok(doc1Printed.pdfExpiresAt, 'pdfExpiresAt must be set upon transition to Printed')

    const printedAtMs = new Date(doc1Printed.printedAt).getTime()
    const expiresAtMs = new Date(doc1Printed.pdfExpiresAt).getTime()
    const diffMs = expiresAtMs - printedAtMs
    assert.strictEqual(diffMs, 30 * 60 * 1000, 'pdfExpiresAt must be exactly 30 minutes after printedAt')
    assert.ok(printedAtMs >= beforePrintMs, 'printedAt must be a current server timestamp')

    console.log('✓ TEST 1 PASSED: Order transition to Printed starts immutable 30-min retention timer\n')

    // ── TEST 2: Reprint succeeds within window for eligible order ───────────
    console.log('[TEST 2] Testing reprint request succeeds within 30-minute window...')
    // Mark order as paid so it is fully eligible
    await ordersCol.updateOne({ orderId: id1 }, { $set: { paymentStatus: 'paid' } })

    const { req: req2Reprint, res: res2Reprint } = createMockReqRes({
      body: { action: 'reprintOrder', orderId: id1 }
    })
    await ordersHandler(req2Reprint, res2Reprint)
    assert.strictEqual(res2Reprint.statusCode, 200, `Reprint must succeed with 200, got ${res2Reprint.statusCode}: ${JSON.stringify(res2Reprint.bodyData)}`)
    assert.strictEqual(res2Reprint.bodyData.success, true)
    assert.strictEqual(res2Reprint.bodyData.printStatus, 'waiting_for_shopkeeper')

    const doc1ReprintQueued = await ordersCol.findOne({ orderId: id1 })
    assert.strictEqual(doc1ReprintQueued.printStatus, 'waiting_for_shopkeeper', 'Order must be re-queued for print agent')
    assert.strictEqual(doc1ReprintQueued.reprintPending, true)
    assert.ok(doc1ReprintQueued.lastReprintRequestedAt, 'lastReprintRequestedAt must be recorded')

    // Simulate print agent completing the physical reprint dispatch
    const { req: req2Complete, res: res2Complete } = createMockReqRes({
      body: { action: 'updateOrderStatus', orderId: id1, printStatus: 'Printed' }
    })
    await ordersHandler(req2Complete, res2Complete)
    assert.strictEqual(res2Complete.statusCode, 200)

    const doc1ReprintDone = await ordersCol.findOne({ orderId: id1 })
    assert.strictEqual(doc1ReprintDone.reprintCount, 1, 'reprintCount must increment to 1 on completion')
    assert.strictEqual(doc1ReprintDone.reprintPending, false)
    assert.ok(doc1ReprintDone.lastReprintAt, 'lastReprintAt must be recorded')

    console.log('✓ TEST 2 PASSED: Reprint successfully queued, executed, and tracked with reprintCount\n')

    // ── TEST 3: Reprint rejected after expiry even if requested directly ─────
    console.log('[TEST 3] Testing reprint rejected after 30-minute retention deadline...')
    const id3 = `XB73${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id3)

    const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString() // expired 5 mins ago
    const pastPrintedAt = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    await ordersCol.insertOne({
      orderId: id3,
      fileName: 'test3.pdf',
      copies: 1,
      amount: 10,
      paymentStatus: 'paid',
      printStatus: 'Printed',
      printedAt: pastPrintedAt,
      pdfExpiresAt: pastExpiry,
      hasPdf: true,
      pdfStorage: 'inline',
      pdfBase64: SAMPLE_BASE64,
      createdAt: pastPrintedAt,
      updatedAt: pastPrintedAt,
    })

    const { req: req3Reprint, res: res3Reprint } = createMockReqRes({
      body: { action: 'reprintOrder', orderId: id3 }
    })
    await ordersHandler(req3Reprint, res3Reprint)
    assert.strictEqual(res3Reprint.statusCode, 410, 'Must return HTTP 410 Gone for expired reprint request')
    assert.strictEqual(res3Reprint.bodyData.success, false)
    assert.strictEqual(res3Reprint.bodyData.expired, true)
    assert.match(res3Reprint.bodyData.error, /expired/i)

    // Direct getOrderPdf call must also return 410
    const { req: req3GetPdf, res: res3GetPdf } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderPdf', orderId: id3 }
    })
    await ordersHandler(req3GetPdf, res3GetPdf)
    assert.strictEqual(res3GetPdf.statusCode, 410, 'Must return HTTP 410 for getOrderPdf on expired document')

    console.log('✓ TEST 3 PASSED: Direct API reprint and getOrderPdf requests rejected after expiry with HTTP 410\n')

    // ── TEST 4: Pending, failed, and unprinted orders are NOT deleted by timer ──
    console.log('[TEST 4] Testing pending, failed, and unprinted orders are not deleted...')
    const id4Pending = `XB741${Math.floor(1000 + Math.random() * 9000)}`
    const id4Failed = `XB742${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(id4Pending, id4Failed)

    await ordersCol.insertMany([
      {
        orderId: id4Pending,
        printStatus: 'waiting_for_shopkeeper',
        hasPdf: true,
        pdfStorage: 'inline',
        pdfBase64: SAMPLE_BASE64,
        paymentStatus: 'pending',
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        orderId: id4Failed,
        printStatus: 'Failed',
        hasPdf: true,
        pdfStorage: 'inline',
        pdfBase64: SAMPLE_BASE64,
        paymentStatus: 'paid',
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ])

    // Run cleanup job strictly scoped to these test IDs
    const cleanupT4 = await cleanupExpiredPdfs(db, { orderIds: [id4Pending, id4Failed] })
    assert.strictEqual(cleanupT4.success, true)

    // Verify neither order was deleted
    const doc4Pending = await ordersCol.findOne({ orderId: id4Pending })
    const doc4Failed = await ordersCol.findOne({ orderId: id4Failed })
    assert.strictEqual(doc4Pending.hasPdf, true, 'Pending order must retain its PDF')
    assert.strictEqual(doc4Pending.pdfDeletedAt, undefined, 'Pending order must not have pdfDeletedAt')
    assert.strictEqual(doc4Failed.hasPdf, true, 'Failed order must retain its PDF')
    assert.strictEqual(doc4Failed.pdfDeletedAt, undefined, 'Failed order must not have pdfDeletedAt')

    console.log('✓ TEST 4 PASSED: Pending, failed, and never-printed orders are safely preserved\n')

    // ── TEST 5: Repeated and concurrent reprint requests prevent duplicate jobs ─
    console.log('[TEST 5] Testing atomic lock prevents concurrent duplicate reprints...')
    const id5 = `XB75${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id5)

    const futureExpiry = new Date(Date.now() + 25 * 60 * 1000).toISOString()
    await ordersCol.insertOne({
      orderId: id5,
      printStatus: 'Printed',
      paymentStatus: 'paid',
      printedAt: new Date().toISOString(),
      pdfExpiresAt: futureExpiry,
      hasPdf: true,
      pdfStorage: 'inline',
      pdfBase64: SAMPLE_BASE64,
    })

    // Issue 2 concurrent reprint requests simultaneously
    const { req: req5A, res: res5A } = createMockReqRes({ body: { action: 'reprintOrder', orderId: id5 } })
    const { req: req5B, res: res5B } = createMockReqRes({ body: { action: 'reprintOrder', orderId: id5 } })

    await Promise.all([
      ordersHandler(req5A, res5A),
      ordersHandler(req5B, res5B),
    ])

    const codes = [res5A.statusCode, res5B.statusCode]
    assert.ok(codes.includes(200), 'Exactly one concurrent request must succeed with 200')
    assert.ok(codes.includes(409), 'The duplicate concurrent request must be rejected with 409 Conflict')

    console.log('✓ TEST 5 PASSED: Concurrent duplicate reprint requests atomically blocked\n')

    // ── TEST 6: Reprinting does not extend retention deadline ───────────────
    console.log('[TEST 6] Testing reprinting preserves original immutable retention deadline...')
    const id6 = `XB76${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id6)

    const origPrintedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString() // printed 10 mins ago
    const origExpiresAt = new Date(new Date(origPrintedAt).getTime() + 30 * 60 * 1000).toISOString()

    await ordersCol.insertOne({
      orderId: id6,
      printStatus: 'Printed',
      paymentStatus: 'paid',
      printedAt: origPrintedAt,
      pdfExpiresAt: origExpiresAt,
      hasPdf: true,
      pdfStorage: 'inline',
      pdfBase64: SAMPLE_BASE64,
    })

    // Request reprint
    const { req: req6R, res: res6R } = createMockReqRes({ body: { action: 'reprintOrder', orderId: id6 } })
    await ordersHandler(req6R, res6R)
    assert.strictEqual(res6R.statusCode, 200)

    // Complete reprint
    const { req: req6C, res: res6C } = createMockReqRes({ body: { action: 'updateOrderStatus', orderId: id6, printStatus: 'Printed' } })
    await ordersHandler(req6C, res6C)
    assert.strictEqual(res6C.statusCode, 200)

    const doc6Final = await ordersCol.findOne({ orderId: id6 })
    assert.strictEqual(doc6Final.printedAt, origPrintedAt, 'printedAt must remain strictly immutable')
    assert.strictEqual(doc6Final.pdfExpiresAt, origExpiresAt, 'pdfExpiresAt must remain strictly original deadline')

    console.log('✓ TEST 6 PASSED: Reprint dispatch does not extend retention deadline or mutate printedAt\n')

    // ── TEST 7: Cleanup permanently removes GridFS, cache, and inline PDF ─────
    console.log('[TEST 7] Testing server-side cleanup deletes GridFS, cache, and inline payload...')
    const id7 = `XB77${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id7)

    // 1. Upload to GridFS
    await savePdfToGridFS(db, id7, SAMPLE_PDF)
    assert.strictEqual(await hasPdfInGridFS(db, id7), true, 'GridFS file must exist initially')

    // 2. Write to local disk cache
    const cacheFile7 = path.join(PDF_CACHE_DIR, `${id7}.pdf`)
    if (!fs.existsSync(PDF_CACHE_DIR)) fs.mkdirSync(PDF_CACHE_DIR, { recursive: true })
    fs.writeFileSync(cacheFile7, SAMPLE_PDF)
    assert.strictEqual(fs.existsSync(cacheFile7), true, 'Disk cache file must exist initially')

    // 3. Insert expired order in MongoDB
    const expiredIso = new Date(Date.now() - 60 * 1000).toISOString()
    await ordersCol.insertOne({
      orderId: id7,
      fileName: 'secret_lab_record.pdf',
      copies: 2,
      amount: 40,
      printStatus: 'Printed',
      paymentStatus: 'paid',
      printedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      pdfExpiresAt: expiredIso,
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
      pdfBase64: SAMPLE_BASE64,
    })

    // Run cleanup strictly scoped to synthetic test order id7
    const clean7Result = await cleanupExpiredPdfs(db, { orderIds: [id7] })
    assert.strictEqual(clean7Result.success, true)
    assert.ok(clean7Result.cleanedOrderIds.includes(id7), 'Cleanup must report id7 cleaned')

    // Verify GridFS purged
    const hasGfsAfter = await hasPdfInGridFS(db, id7)
    assert.strictEqual(hasGfsAfter, false, 'GridFS file must be completely purged')

    // Verify disk cache purged
    assert.strictEqual(fs.existsSync(cacheFile7), false, 'Disk cache file must be unlinked')

    // Verify MongoDB document state
    const doc7Cleaned = await ordersCol.findOne({ orderId: id7 })
    assert.strictEqual(doc7Cleaned.hasPdf, false, 'hasPdf must be updated to false')
    assert.strictEqual(doc7Cleaned.hasGridFsPdf, false, 'hasGridFsPdf must be updated to false')
    assert.strictEqual(doc7Cleaned.pdfStorage, 'none', 'pdfStorage must be updated to "none"')
    assert.strictEqual(doc7Cleaned.pdfBase64, '', 'pdfBase64 payload must be cleared')
    assert.ok(doc7Cleaned.pdfDeletedAt, 'pdfDeletedAt timestamp must be recorded')

    // Crucial check: Order metadata must remain intact!
    assert.strictEqual(doc7Cleaned.orderId, id7)
    assert.strictEqual(doc7Cleaned.fileName, 'secret_lab_record.pdf')
    assert.strictEqual(doc7Cleaned.copies, 2)
    assert.strictEqual(doc7Cleaned.amount, 40)
    assert.strictEqual(doc7Cleaned.printStatus, 'Printed')

    console.log('✓ TEST 7 PASSED: Cleanup permanently purges all PDF copies while preserving order metadata\n')

    // ── TEST 8: Cleanup failures are retried and not falsely reported complete ─
    console.log('[TEST 8] Testing cleanup error handling and retry guarantee...')
    const id8 = `XB78${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id8)

    await ordersCol.insertOne({
      orderId: id8,
      printStatus: 'Printed',
      paymentStatus: 'paid',
      printedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      pdfExpiresAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      hasPdf: true,
      pdfStorage: 'gridfs',
    })

    // Simulate transient failure during delete
    const origFind = GridFSBucket.prototype.find
    GridFSBucket.prototype.find = function () {
      throw new Error('Simulated GridFS transient Atlas connectivity failure')
    }

    try {
      const clean8Fail = await cleanupExpiredPdfs(db, { orderIds: [id8] })
      assert.strictEqual(clean8Fail.success, false, 'Cleanup must report failure when delete throws')
      assert.ok(clean8Fail.errors.length > 0)

      const doc8Unfinished = await ordersCol.findOne({ orderId: id8 })
      assert.strictEqual(doc8Unfinished.pdfDeletedAt, undefined, 'pdfDeletedAt must NOT be set on failed deletion')
      assert.strictEqual(doc8Unfinished.hasPdf, true, 'hasPdf must remain true so it will be retried')
    } finally {
      GridFSBucket.prototype.find = origFind
    }

    // Now retry cleanup cleanly strictly scoped to id8
    const clean8Retry = await cleanupExpiredPdfs(db, { orderIds: [id8] })
    assert.strictEqual(clean8Retry.success, true)
    const doc8Retried = await ordersCol.findOne({ orderId: id8 })
    assert.ok(doc8Retried.pdfDeletedAt, 'Retry must succeed and set pdfDeletedAt')
    assert.strictEqual(doc8Retried.hasPdf, false)

    console.log('✓ TEST 8 PASSED: Failed cleanup is retried and never prematurely marked complete\n')

    // ── TEST 9: Server restart cannot restore expired PDF from stale cache ─────
    console.log('[TEST 9] Testing server startup cannot restore expired PDF into cache...')
    const id9 = `XB79${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id9)

    const staleExpiredAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await ordersCol.insertOne({
      orderId: id9,
      printStatus: 'Printed',
      printedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      pdfExpiresAt: staleExpiredAt,
      pdfDeletedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      hasPdf: false,
      pdfStorage: 'none',
    })

    // Stale disk cache file left behind on disk
    const staleCachePath = path.join(PDF_CACHE_DIR, `${id9}.pdf`)
    fs.writeFileSync(staleCachePath, SAMPLE_PDF)
    assert.strictEqual(fs.existsSync(staleCachePath), true)

    // Prewarming query from server.js must NOT select this order (isolated by orderId)
    const nowIso = new Date().toISOString()
    const prewarmCandidate = await ordersCol.findOne({
      orderId: id9,
      printStatus: { $in: ['waiting_for_shopkeeper', 'Waiting', 'queued', 'pending', 'Ready', 'ready', 'Failed', 'failed'] },
      pdfDeletedAt: { $exists: false },
      hasPdf: { $ne: false },
      $or: [
        { pdfExpiresAt: { $exists: false } },
        { pdfExpiresAt: { $gt: nowIso } }
      ],
    })
    assert.strictEqual(prewarmCandidate, null, 'Expired order must be excluded from startup prewarming query')

    // Requesting PDF through getOrderPdf must refuse to serve stale file and purge it
    const { req: req9Get, res: res9Get } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderPdf', orderId: id9 }
    })
    await ordersHandler(req9Get, res9Get)
    assert.strictEqual(res9Get.statusCode, 410, 'Must return HTTP 410 for expired order')
    assert.strictEqual(fs.existsSync(staleCachePath), false, 'Stale disk cache file must be deleted upon access attempt')

    console.log('✓ TEST 9 PASSED: Restarting service cannot restore expired PDF from stale cache\n')

    // ── TEST 10: My Orders accurately reflects availability, countdown, & expiry ─
    console.log('[TEST 10] Testing My Orders eligibility contract and countdown calculation...')
    const mockOrderActive = {
      orderId: 'XB_MOCK_ACTIVE',
      printStatus: 'Printed',
      paymentStatus: 'paid',
      hasPdf: true,
      printedAt: new Date().toISOString(),
      pdfExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    }
    const eligibleRes = isOrderReprintEligible(mockOrderActive)
    assert.strictEqual(eligibleRes.eligible, true)
    assert.ok(eligibleRes.remainingMs > 0 && eligibleRes.remainingMs <= 20 * 60 * 1000)

    const mockOrderExpired = {
      orderId: 'XB_MOCK_EXP',
      printStatus: 'Printed',
      paymentStatus: 'paid',
      hasPdf: true,
      pdfExpiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    const expiredRes = isOrderReprintEligible(mockOrderExpired)
    assert.strictEqual(expiredRes.eligible, false)
    assert.strictEqual(expiredRes.expired, true)
    assert.match(expiredRes.reason, /expired/i)

    // Test getOrderStatus metadata projection does NOT expose pdfBase64
    const { req: req10Status, res: res10Status } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: id1 }
    })
    await ordersHandler(req10Status, res10Status)
    assert.strictEqual(res10Status.statusCode, 200)
    assert.strictEqual(res10Status.bodyData.order.pdfBase64, undefined, 'pdfBase64 must NOT be exposed in metadata')
    assert.ok(res10Status.bodyData.serverTime, 'serverTime must be provided for clock synchronization')

    console.log('✓ TEST 10 PASSED: My Orders countdown and eligibility accurately evaluated without data leaks\n')

    // ── TEST 11: Payment and order-ownership safeguards continue to pass ───────
    console.log('[TEST 11] Testing payment status and order authorization safeguards...')
    const id11Unpaid = `XB81${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id11Unpaid)

    await ordersCol.insertOne({
      orderId: id11Unpaid,
      printStatus: 'Printed',
      paymentStatus: 'failed',
      printedAt: new Date().toISOString(),
      pdfExpiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      hasPdf: true,
      transactionId: 'TXN_SECRET_123',
    })

    // 1. Failed payment must reject reprint with 403 Forbidden
    const { req: req11Fail, res: res11Fail } = createMockReqRes({
      body: { action: 'reprintOrder', orderId: id11Unpaid }
    })
    await ordersHandler(req11Fail, res11Fail)
    assert.strictEqual(res11Fail.statusCode, 403, 'Failed payment must return HTTP 403 Forbidden')
    assert.strictEqual(res11Fail.bodyData.paymentBlocked, true)

    // 2. Mismatched transactionId must reject reprint with 403 Forbidden
    await ordersCol.updateOne({ orderId: id11Unpaid }, { $set: { paymentStatus: 'paid' } })
    const { req: req11AuthMismatch, res: res11AuthMismatch } = createMockReqRes({
      body: { action: 'reprintOrder', orderId: id11Unpaid, transactionId: 'WRONG_TXN' }
    })
    await ordersHandler(req11AuthMismatch, res11AuthMismatch)
    assert.strictEqual(res11AuthMismatch.statusCode, 403, 'Mismatched transactionId must return HTTP 403 Forbidden')

    console.log('✓ TEST 11 PASSED: Payment and order authorization safeguards fully enforced\n')

    console.log('================================================================')
    console.log('  ALL 11 RETENTION & REPRINT REGRESSION TESTS PASSED!           ')
    console.log('================================================================\n')
  } finally {
    // Clean up test documents
    if (testIdsToCleanup.length > 0) {
      await ordersCol.deleteMany({ orderId: { $in: testIdsToCleanup } })
      for (const id of testIdsToCleanup) {
        try { await deletePdfFromGridFS(db, id) } catch {}
        const p = path.join(PDF_CACHE_DIR, `${id}.pdf`)
        if (fs.existsSync(p)) try { fs.unlinkSync(p) } catch {}
      }
    }
    await closeDatabaseConnection()
  }
}

runRegressionSuite()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('REGRESSION TEST SUITE FAILED:', err)
    process.exit(1)
  })
