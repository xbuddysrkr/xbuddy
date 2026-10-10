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

    // ── TEST 12: Legacy orders lacking pdfExpiresAt derive deadline from printedAt + 30m ───
    console.log('[TEST 12] Testing legacy orders without pdfExpiresAt (XB6480 pattern)...')
    const id12ExpiredLegacy = `XB96${Math.floor(10000 + Math.random() * 90000)}`
    const id12ActiveLegacy = `XB97${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id12ExpiredLegacy, id12ActiveLegacy)

    // 12.1 Expired legacy order (printed 50 mins ago, no pdfExpiresAt, pending payment)
    const printed50MinsAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString()
    const expectedLegacyDeadlineToIso = new Date(new Date(printed50MinsAgo).getTime() + 30 * 60 * 1000).toISOString()

    await savePdfToGridFS(db, id12ExpiredLegacy, SAMPLE_PDF)
    const legacyCachePath = path.join(PDF_CACHE_DIR, `${id12ExpiredLegacy}.pdf`)
    fs.writeFileSync(legacyCachePath, SAMPLE_PDF)

    await ordersCol.insertOne({
      orderId: id12ExpiredLegacy,
      printStatus: 'Printed',
      printedAt: printed50MinsAgo,
      hasPdf: true,
      pdfStorage: 'gridfs',
      paymentStatus: 'pending',
    })

    // Evaluation check:
    const legacyDoc = await ordersCol.findOne({ orderId: id12ExpiredLegacy })
    const evalExpired = isOrderReprintEligible(legacyDoc)
    assert.strictEqual(evalExpired.eligible, false, 'Expired legacy order must NOT be eligible')
    assert.strictEqual(evalExpired.reason, 'Reprint window expired; document permanently deleted.', 'Reason must be expiration, not missing timestamp')
    assert.strictEqual(evalExpired.remainingSeconds, 0)
    assert.strictEqual(evalExpired.effectiveExpiresAt, expectedLegacyDeadlineToIso)

    // getOrderStatus check:
    const { req: req12Status, res: res12Status } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: id12ExpiredLegacy }
    })
    await ordersHandler(req12Status, res12Status)
    assert.strictEqual(res12Status.statusCode, 200)
    assert.strictEqual(res12Status.bodyData.order.printStatus, 'Printed')
    assert.strictEqual(res12Status.bodyData.order.paymentStatus, 'pending', 'Payment status must remain pending')
    assert.strictEqual(res12Status.bodyData.order.pdfExpiresAt, expectedLegacyDeadlineToIso, 'Derived deadline must be printedAt + 30m')
    assert.strictEqual(res12Status.bodyData.order.hasPdf, false, 'hasPdf must project false after expiry')
    assert.strictEqual(res12Status.bodyData.order.reprintEligible, false)
    assert.strictEqual(res12Status.bodyData.order.reprintReason, 'Reprint window expired; document permanently deleted.')

    // Direct PDF fetch must return HTTP 410 and purge cache
    const { req: req12Pdf, res: res12Pdf } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderPdf', orderId: id12ExpiredLegacy }
    })
    await ordersHandler(req12Pdf, res12Pdf)
    assert.strictEqual(res12Pdf.statusCode, 410, 'Expired legacy order must return HTTP 410 Gone')
    assert.strictEqual(fs.existsSync(legacyCachePath), false, 'Disk cache must be purged on expired access')

    // Cleanup deletion:
    const cleanLegacyRes = await cleanupExpiredPdfs(db, { orderIds: [id12ExpiredLegacy] })
    assert.strictEqual(cleanLegacyRes.success, true)
    assert.strictEqual(cleanLegacyRes.cleanedCount, 1)
    assert.strictEqual(await hasPdfInGridFS(db, id12ExpiredLegacy), false, 'GridFS file must be permanently removed')

    const cleanedLegacyDoc = await ordersCol.findOne({ orderId: id12ExpiredLegacy })
    assert.strictEqual(cleanedLegacyDoc.hasPdf, false)
    assert.strictEqual(cleanedLegacyDoc.paymentStatus, 'pending', 'Payment status must NEVER be modified during cleanup')
    assert.strictEqual(cleanedLegacyDoc.printStatus, 'Printed', 'Print status must be preserved')
    assert.strictEqual(cleanedLegacyDoc.pdfExpiresAt, expectedLegacyDeadlineToIso, 'Derived expiry must be persisted')
    assert.ok(cleanedLegacyDoc.pdfDeletedAt, 'pdfDeletedAt must be recorded')

    // Reprint rejection:
    const { req: req12Reprint, res: res12Reprint } = createMockReqRes({
      body: { action: 'reprintOrder', orderId: id12ExpiredLegacy }
    })
    await ordersHandler(req12Reprint, res12Reprint)
    assert.strictEqual(res12Reprint.statusCode, 410, 'Reprint request on expired legacy order must return HTTP 410')

    // 12.2 Active legacy order (printed 10 mins ago, no pdfExpiresAt, payment paid)
    const printed10MinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const activeExpectedDeadline = new Date(new Date(printed10MinsAgo).getTime() + 30 * 60 * 1000).toISOString()

    await ordersCol.insertOne({
      orderId: id12ActiveLegacy,
      printStatus: 'Printed',
      printedAt: printed10MinsAgo,
      hasPdf: true,
      pdfStorage: 'gridfs',
      paymentStatus: 'paid',
    })

    const activeLegacyDoc = await ordersCol.findOne({ orderId: id12ActiveLegacy })
    const evalActive = isOrderReprintEligible(activeLegacyDoc)
    assert.strictEqual(evalActive.eligible, true, 'Active legacy order with paid payment must be eligible')
    assert.strictEqual(evalActive.effectiveExpiresAt, activeExpectedDeadline)
    assert.ok(evalActive.remainingSeconds > 1100 && evalActive.remainingSeconds <= 1200, 'Remaining time must be ~20 mins, never reset to 30 mins from now')

    console.log('✓ TEST 12 PASSED: Legacy orders lacking pdfExpiresAt accurately derive deadline, purge upon expiry, and protect payment status\n')

    // ── TEST 13: XBuddy Reprint-to-Payment End-to-End Regression Suite ───────
    console.log('[TEST 13] Testing XBuddy Reprint-to-Payment flow end-to-end...')
    const id13Order = `XB98${Math.floor(10000 + Math.random() * 90000)}`
    const id13Expired = `XB99${Math.floor(10000 + Math.random() * 90000)}`
    testIdsToCleanup.push(id13Order, id13Expired)

    process.env.AGENT_SECRET_KEY = 'test-agent-secret'
    const agentHeaders = { 'x-agent-key': 'test-agent-secret' }

    // Setup an initial printed order with genuine print settings:
    // 6 pages total, B&W (₹2/page), copies: 1, duplex: false => printingCost: ₹12, serviceFee (slab 6-10): ₹2 => Total: ₹14
    const originalPrintTime = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 mins ago
    const originalDeadline = new Date(new Date(originalPrintTime).getTime() + 30 * 60 * 1000).toISOString()
    const originalTx = 'TXN_ORIG_STUDENT_111'

    await savePdfToGridFS(db, id13Order, SAMPLE_PDF)
    const diskCache13 = path.join(PDF_CACHE_DIR, `${id13Order}.pdf`)
    fs.writeFileSync(diskCache13, SAMPLE_PDF)

    await ordersCol.insertOne({
      orderId: id13Order,
      name: '9876543210',
      fileName: `${id13Order}.pdf`,
      totalPages: 6,
      printableCount: 6,
      copies: 1,
      colorMode: 'bw',
      printType: 'B&W',
      printSide: 'Single',
      duplex: false,
      pageSize: 'A4',
      orientation: 'portrait',
      amount: 14,
      printingCost: 12,
      serviceFee: 2,
      transactionId: originalTx,
      paymentStatus: 'pending', // Starts as pending to prove original remains intact!
      printStatus: 'Printed',
      printedAt: originalPrintTime,
      pdfExpiresAt: originalDeadline,
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
      reprintCount: 0,
    })

    // 13.1 Reprint click initiates payment flow and calculates exact pricing
    const { req: req13Init, res: res13Init } = createMockReqRes({
      body: { action: 'initiateReprint', orderId: id13Order }
    })
    await ordersHandler(req13Init, res13Init)
    assert.strictEqual(res13Init.statusCode, 200, 'Initiate reprint must succeed for eligible printed order')
    assert.ok(res13Init.bodyData.attemptId, 'Must return unique attemptId')
    assert.strictEqual(res13Init.bodyData.amount, 14, 'Price must be exact according to existing pricing slabs (₹14)')
    assert.strictEqual(res13Init.bodyData.printingCost, 12)
    assert.strictEqual(res13Init.bodyData.serviceFee, 2)
    const attemptId1 = res13Init.bodyData.attemptId

    // 13.2 Anti-Reuse Guard: Reusing original order UTR must be strictly blocked (HTTP 400)
    const { req: req13ReuseOrig, res: res13ReuseOrig } = createMockReqRes({
      body: {
        action: 'submitReprintPayment',
        orderId: id13Order,
        attemptId: attemptId1,
        transactionId: originalTx, // Reusing original transaction ID!
        phone: '9876543210',
      }
    })
    await ordersHandler(req13ReuseOrig, res13ReuseOrig)
    assert.strictEqual(res13ReuseOrig.statusCode, 400, 'Reusing original transaction ID must return HTTP 400 Bad Request')
    assert.ok(res13ReuseOrig.bodyData.error.includes('Cannot reuse the original order transaction ID'))

    // 13.3 Data Integrity: Original records remain completely intact
    const docAfterOrigReuse = await ordersCol.findOne({ orderId: id13Order })
    assert.strictEqual(docAfterOrigReuse.transactionId, originalTx, 'Original transactionId must NEVER be overwritten')
    assert.strictEqual(docAfterOrigReuse.paymentStatus, 'pending', 'Original paymentStatus must remain pending')
    assert.strictEqual(docAfterOrigReuse.printedAt, originalPrintTime, 'Original printedAt must NEVER change')
    assert.strictEqual(docAfterOrigReuse.pdfExpiresAt, originalDeadline, 'Original pdfExpiresAt must NEVER reset')

    // 13.4 Strict Payment Verification Policy Guard: Pending payment does NOT queue print
    process.env.REQUIRE_PAYMENT_VERIFICATION = 'true'
    const newTx1 = 'UTR_NEW_REPRINT_222'
    const { req: req13StrictSubmit, res: res13StrictSubmit } = createMockReqRes({
      body: {
        action: 'submitReprintPayment',
        orderId: id13Order,
        attemptId: attemptId1,
        transactionId: newTx1,
        phone: '9876543210',
      }
    })
    await ordersHandler(req13StrictSubmit, res13StrictSubmit)
    assert.strictEqual(res13StrictSubmit.statusCode, 200)
    assert.strictEqual(res13StrictSubmit.bodyData.paymentStatus, 'pending', 'Under strict verification, payment is initially pending')

    const docAfterStrictSubmit = await ordersCol.findOne({ orderId: id13Order })
    assert.strictEqual(docAfterStrictSubmit.printStatus, 'Printed', 'Print status must NOT change to waiting when verification is required')
    assert.strictEqual(docAfterStrictSubmit.reprintPending, undefined, 'Reprint must NOT be queued while payment is pending')

    // Print agent claim must be rejected when payment is pending
    const { req: req13AgentClaimPending, res: res13AgentClaimPending } = createMockReqRes({
      method: 'POST',
      query: { action: 'claim', orderId: id13Order },
      headers: agentHeaders,
    })
    await agentOrdersHandler(req13AgentClaimPending, res13AgentClaimPending)
    // Returns 402 Payment Required or 409 because printStatus is not waiting
    assert.ok(res13AgentClaimPending.statusCode === 402 || res13AgentClaimPending.statusCode === 409)

    // 13.5 Rejection Guard: Rejected reprint payment does NOT queue print
    const { req: req13Reject, res: res13Reject } = createMockReqRes({
      body: {
        action: 'verifyReprintPayment',
        orderId: id13Order,
        attemptId: attemptId1,
        paymentStatus: 'rejected',
      }
    })
    await ordersHandler(req13Reject, res13Reject)
    assert.strictEqual(res13Reject.statusCode, 200)
    assert.strictEqual(res13Reject.bodyData.paymentStatus, 'rejected')

    const docAfterReject = await ordersCol.findOne({ orderId: id13Order })
    assert.strictEqual(docAfterReject.printStatus, 'Printed', 'Order printStatus must remain Printed after rejection')
    const attempt1Doc = docAfterReject.reprintAttempts.find(a => a.attemptId === attemptId1)
    assert.strictEqual(attempt1Doc.paymentStatus, 'rejected')
    assert.strictEqual(attempt1Doc.printAuthorized, false)

    // 13.6 Duplicate UTR Guard: Reusing newTx1 on a second attempt is rejected
    const { req: req13Init2, res: res13Init2 } = createMockReqRes({
      body: { action: 'initiateReprint', orderId: id13Order }
    })
    await ordersHandler(req13Init2, res13Init2)
    const attemptId2 = res13Init2.bodyData.attemptId

    const { req: req13DupUtr, res: res13DupUtr } = createMockReqRes({
      body: {
        action: 'submitReprintPayment',
        orderId: id13Order,
        attemptId: attemptId2,
        transactionId: newTx1, // Same as attempt 1!
        phone: '9876543210',
      }
    })
    await ordersHandler(req13DupUtr, res13DupUtr)
    assert.strictEqual(res13DupUtr.statusCode, 400, 'Reusing a UTR from another reprint attempt must return HTTP 400')
    assert.ok(res13DupUtr.bodyData.error.includes('already been used for another reprint attempt'))

    // 13.7 Verified Payment Authorizes Exactly One Print:
    const newTx2 = 'UTR_NEW_REPRINT_333'
    const { req: req13Submit2, res: res13Submit2 } = createMockReqRes({
      body: {
        action: 'submitReprintPayment',
        orderId: id13Order,
        attemptId: attemptId2,
        transactionId: newTx2,
        phone: '9876543210',
      }
    })
    await ordersHandler(req13Submit2, res13Submit2)
    assert.strictEqual(res13Submit2.statusCode, 200)

    // Shopkeeper verifies attempt 2:
    const { req: req13Verify2, res: res13Verify2 } = createMockReqRes({
      body: {
        action: 'verifyReprintPayment',
        orderId: id13Order,
        attemptId: attemptId2,
        paymentStatus: 'paid',
      }
    })
    await ordersHandler(req13Verify2, res13Verify2)
    assert.strictEqual(res13Verify2.statusCode, 200)
    assert.strictEqual(res13Verify2.bodyData.printStatus, 'waiting_for_shopkeeper')

    const docAfterVerify = await ordersCol.findOne({ orderId: id13Order })
    assert.strictEqual(docAfterVerify.printStatus, 'waiting_for_shopkeeper', 'Order must be queued for printing')
    assert.strictEqual(docAfterVerify.reprintPending, true)
    assert.strictEqual(docAfterVerify.activeReprintAttemptId, attemptId2)

    // 13.8 Duplicate Print Authorization Guard:
    // Repeated verification or submission while reprinting must be blocked with HTTP 409
    const { req: req13DupVerify, res: res13DupVerify } = createMockReqRes({
      body: {
        action: 'verifyReprintPayment',
        orderId: id13Order,
        attemptId: attemptId2,
        paymentStatus: 'paid',
      }
    })
    await ordersHandler(req13DupVerify, res13DupVerify)
    assert.strictEqual(res13DupVerify.statusCode, 409, 'Duplicate verification while reprinting must return HTTP 409')

    // 13.9 Print Agent claims the authorized reprint order:
    delete process.env.REQUIRE_PAYMENT_VERIFICATION
    const { req: req13AgentClaim, res: res13AgentClaim } = createMockReqRes({
      method: 'POST',
      query: { action: 'claim', orderId: id13Order },
      headers: agentHeaders,
    })
    await agentOrdersHandler(req13AgentClaim, res13AgentClaim)
    assert.strictEqual(res13AgentClaim.statusCode, 200, 'Print Agent must successfully claim verified reprint')
    assert.strictEqual(res13AgentClaim.bodyData.order.printStatus, 'Printing')

    // 13.10 Print Agent finishes printing and reports status Printed:
    const { req: req13AgentPrinted, res: res13AgentPrinted } = createMockReqRes({
      method: 'POST',
      query: { action: 'updateStatus', orderId: id13Order, status: 'Printed' },
      body: { status: 'Printed' },
      headers: agentHeaders,
    })
    await agentOrdersHandler(req13AgentPrinted, res13AgentPrinted)
    assert.strictEqual(res13AgentPrinted.statusCode, 200)

    // 13.11 Expiry deadline MUST NOT reset after reprint:
    const docAfterReprint = await ordersCol.findOne({ orderId: id13Order })
    assert.strictEqual(docAfterReprint.printStatus, 'Printed')
    assert.strictEqual(docAfterReprint.reprintPending, false)
    assert.strictEqual(docAfterReprint.reprintCount, 1, 'reprintCount must be incremented by exactly 1')
    assert.strictEqual(docAfterReprint.printedAt, originalPrintTime, 'Original printedAt MUST NOT be overwritten')
    assert.strictEqual(docAfterReprint.pdfExpiresAt, originalDeadline, 'Original pdfExpiresAt MUST NOT reset')

    const attempt2Doc = docAfterReprint.reprintAttempts.find(a => a.attemptId === attemptId2)
    assert.strictEqual(attempt2Doc.printOutcome, 'printed', 'Attempt outcome must be recorded as printed')
    assert.strictEqual(attempt2Doc.paymentStatus, 'paid')

    // 13.12 Expired orders cannot be reprinted:
    const expiredPrintTime = new Date(Date.now() - 45 * 60 * 1000).toISOString() // 45 mins ago
    const expiredDeadline = new Date(new Date(expiredPrintTime).getTime() + 30 * 60 * 1000).toISOString()
    await ordersCol.insertOne({
      orderId: id13Expired,
      printStatus: 'Printed',
      printedAt: expiredPrintTime,
      pdfExpiresAt: expiredDeadline,
      hasPdf: false,
      pdfDeletedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      paymentStatus: 'paid',
    })

    const { req: req13ExpiredInit, res: res13ExpiredInit } = createMockReqRes({
      body: { action: 'initiateReprint', orderId: id13Expired }
    })
    await ordersHandler(req13ExpiredInit, res13ExpiredInit)
    assert.strictEqual(res13ExpiredInit.statusCode, 410, 'Initiate reprint on expired document must return HTTP 410')

    console.log('✓ TEST 13 PASSED: Full Reprint-to-Payment flow end-to-end verified with anti-reuse, strict authorization, single-print dispatch, and immutable expiry\n')

    console.log('================================================================')
    console.log('  ALL 13 RETENTION & REPRINT REGRESSION TESTS PASSED!           ')
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
