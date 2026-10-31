import dotenv from 'dotenv'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

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
import { Writable } from 'node:stream'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import {
  savePdfToGridFS,
  hasPdfInGridFS,
  deletePdfFromGridFS,
  getGridFSBucket,
} from '../api/_lib/gridfs.js'
import {
  generateOrderDeletionSecret,
  hashOrderDeletionSecret,
  verifyOrderDeletionAuth,
  generateBoothSessionToken,
  generatePreviewToken,
} from '../api/_lib/boothAuth.js'
import { cleanupExpiredPdfs } from '../api/_lib/retention.js'
import ordersHandler from '../api/orders.js'
import agentOrdersHandler from '../api/agent/orders.js'

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {}, url = '/api/orders' }) {
  const req = {
    method,
    query,
    body,
    headers: { ...headers },
    url,
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

async function runSecureDeletionTestSuite() {
  console.log('=================================================================')
  console.log('  STARTING XBUDDY SECURE USER-CONTROLLED DOCUMENT DELETION TEST  ')
  console.log('=================================================================\n')

  const { db } = await connectToDatabase()
  const ordersCol = db.collection('orders')
  const testIdsToCleanup = []

  try {
    // ── TEST 1: Creation of order returns deletionToken to the client ───────
    console.log('[TEST 1] Verifying deletionToken is generated and returned on order creation...')
    const orderId1 = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderId1)

    const { req: req1Save, res: res1Save } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderId1,
        fileName: 'project_report.pdf',
        copies: 2,
        totalPages: 5,
        amount: 23,
        printingCost: 20,
        digitalProcessingFee: 3,
        paymentStatus: 'paid',
        transactionId: 'TXN_TEST_12345',
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(req1Save, res1Save)
    assert.strictEqual(res1Save.statusCode, 200, `Order creation should return 200, got ${res1Save.statusCode}`)
    assert.ok(res1Save.bodyData?.deletionToken, 'Order creation must return deletionToken to client')
    const token1 = res1Save.bodyData.deletionToken

    // Verify deletionSecretHash is stored in MongoDB Atlas, but NOT raw deletionSecret
    const savedDoc1 = await ordersCol.findOne({ orderId: orderId1 })
    assert.ok(savedDoc1.deletionSecretHash, 'MongoDB document must store deletionSecretHash')
    assert.strictEqual(savedDoc1.deletionToken, undefined, 'MongoDB document must NEVER store raw deletionToken')
    assert.strictEqual(savedDoc1.deletionSecret, undefined, 'MongoDB document must NEVER store raw deletionSecret')
    console.log('✓ TEST 1 PASSED: Order created, deletionToken returned to student, SHA-256 hash stored in DB\n')

    // ── TEST 2: Unauthorized delete request without token fails (HTTP 401) ──
    console.log('[TEST 2] Testing deleteOrderDocument without any authorization token...')
    const { req: req2Unauth, res: res2Unauth } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1 },
    })
    await ordersHandler(req2Unauth, res2Unauth)
    assert.strictEqual(res2Unauth.statusCode, 401, `Missing token must return 401, got ${res2Unauth.statusCode}`)
    assert.strictEqual(res2Unauth.bodyData?.success, false)
    console.log('✓ TEST 2 PASSED: Anonymous deletion strictly rejected with HTTP 401\n')

    // ── TEST 3: Guessable orderId alone cannot authorize deletion (HTTP 401) ──
    console.log('[TEST 3] Testing deletion with only guessable orderId in query/body...')
    const { req: req3Guess, res: res3Guess } = createMockReqRes({
      query: { action: 'deleteOrderDocument', orderId: orderId1 },
      body: {},
    })
    await ordersHandler(req3Guess, res3Guess)
    assert.strictEqual(res3Guess.statusCode, 401, `Guessable order ID must return 401, got ${res3Guess.statusCode}`)
    console.log('✓ TEST 3 PASSED: Guessable Order ID alone cannot authorize deletion\n')

    // ── TEST 4: Student with invalid/mismatched token cannot delete (HTTP 403) ──
    console.log('[TEST 4] Testing deletion with invalid token or token belonging to another order...')
    const fakeToken = 'wrong_secret_hash_value_1234567890abcdef'
    const { req: req4Wrong, res: res4Wrong } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: fakeToken },
    })
    await ordersHandler(req4Wrong, res4Wrong)
    assert.strictEqual(res4Wrong.statusCode, 403, `Mismatched token must return 403, got ${res4Wrong.statusCode}`)
    assert.strictEqual(res4Wrong.bodyData?.success, false)
    console.log('✓ TEST 4 PASSED: Cross-order / forged deletion tokens rejected with HTTP 403\n')

    // ── Create unrelated second order to test isolation ─────────────────────
    const orderId2 = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderId2)
    const { req: req2Save, res: res2Save } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderId2,
        fileName: 'unrelated_document.pdf',
        copies: 1,
        totalPages: 2,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(req2Save, res2Save)
    assert.strictEqual(res2Save.statusCode, 200)

    // Ensure both files exist in GridFS prior to deletion
    const exists1Before = await hasPdfInGridFS(db, orderId1)
    const exists2Before = await hasPdfInGridFS(db, orderId2)
    assert.ok(exists1Before, 'Order 1 file must exist in GridFS before deletion')
    assert.ok(exists2Before, 'Order 2 file must exist in GridFS before deletion')

    // ── TEST 5: Authorized student deletes their own document ────────────────
    console.log('[TEST 5] Testing successful deletion by authorized student...')
    const { req: req5Del, res: res5Del } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: token1 },
    })
    await ordersHandler(req5Del, res5Del)
    assert.strictEqual(res5Del.statusCode, 200, `Authorized deletion must return 200, got ${res5Del.statusCode}: ${JSON.stringify(res5Del.bodyData)}`)
    assert.strictEqual(res5Del.bodyData?.success, true)
    assert.strictEqual(res5Del.bodyData?.documentDeleted, true)
    assert.strictEqual(res5Del.bodyData?.documentStorageStatus, 'deleted')
    console.log('✓ TEST 5 PASSED: Authorized deletion completed successfully with HTTP 200\n')

    // ── TEST 6: Real GridFS file and chunks are deleted ─────────────────────
    console.log('[TEST 6] Verifying physical GridFS file deletion for deleted order...')
    const exists1After = await hasPdfInGridFS(db, orderId1)
    assert.strictEqual(exists1After, false, 'GridFS file for order 1 must be permanently removed')
    console.log('✓ TEST 6 PASSED: Order 1 document permanently removed from MongoDB GridFS\n')

    // ── TEST 7: Unrelated order document remains completely untouched ──────
    console.log('[TEST 7] Verifying unrelated order document is preserved in GridFS...')
    const exists2After = await hasPdfInGridFS(db, orderId2)
    assert.strictEqual(exists2After, true, 'Unrelated order 2 document must remain intact in GridFS')
    console.log('✓ TEST 7 PASSED: Unrelated orders are strictly isolated and preserved\n')

    // ── TEST 8: Order metadata and payment history preserved ────────────────
    console.log('[TEST 8] Verifying order history, financial fields, and storage flags...')
    const order1PostDel = await ordersCol.findOne({ orderId: orderId1 })
    assert.strictEqual(order1PostDel.orderId, orderId1)
    assert.strictEqual(order1PostDel.amount, 23, 'Order amount must be preserved')
    assert.strictEqual(order1PostDel.printingCost, 20, 'Printing cost must be preserved')
    assert.strictEqual(order1PostDel.digitalProcessingFee, 3, 'Digital processing fee must be preserved')
    assert.strictEqual(order1PostDel.paymentStatus, 'paid', 'Payment status must be preserved')
    assert.strictEqual(order1PostDel.transactionId, 'TXN_TEST_12345', 'Transaction reference must be preserved')
    assert.strictEqual(order1PostDel.copies, 2, 'Copies must be preserved')
    assert.strictEqual(order1PostDel.totalPages, 5, 'Total pages must be preserved')
    assert.strictEqual(order1PostDel.hasPdf, false, 'hasPdf must be set to false')
    assert.strictEqual(order1PostDel.pdfStorage, 'none', 'pdfStorage must be set to none')
    assert.strictEqual(order1PostDel.documentDeleted, true, 'documentDeleted must be set to true')
    assert.strictEqual(order1PostDel.documentStorageStatus, 'deleted', 'documentStorageStatus must be deleted')
    assert.strictEqual(order1PostDel.pdfUrl, null, 'pdfUrl must be cleared')
    assert.strictEqual(order1PostDel.fileUrl, null, 'fileUrl must be cleared')
    assert.strictEqual(order1PostDel.gridFsFileId, null, 'gridFsFileId must be cleared')
    assert.ok(order1PostDel.documentDeletedAt, 'documentDeletedAt must be an ISO timestamp')
    assert.strictEqual(order1PostDel.printStatus, 'document_deleted', 'Unprinted order status should transition to document_deleted')

    // Verify audit log
    assert.ok(Array.isArray(order1PostDel.auditLog), 'Order must have audit log')
    const deleteAudit = order1PostDel.auditLog.find(e => e.action === 'document_deleted_by_student')
    assert.ok(deleteAudit, 'Audit log must contain document_deleted_by_student event')
    console.log('✓ TEST 8 PASSED: All financial and order fields preserved; storage references cleared; audit logged\n')

    // ── TEST 9: Duplicate deletion request is safely idempotent ─────────────
    console.log('[TEST 9] Testing duplicate deletion request idempotency...')
    const { req: req9Dup, res: res9Dup } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: token1 },
    })
    await ordersHandler(req9Dup, res9Dup)
    assert.strictEqual(res9Dup.statusCode, 200, `Duplicate delete should return 200, got ${res9Dup.statusCode}`)
    assert.strictEqual(res9Dup.bodyData?.success, true)
    assert.strictEqual(res9Dup.bodyData?.idempotent, true)
    console.log('✓ TEST 9 PASSED: Duplicate deletion requests are safely idempotent\n')

    // ── TEST 10: getOrderPdf returns HTTP 410 Gone for deleted document ─────
    console.log('[TEST 10] Testing getOrderPdf on deleted document...')
    const previewToken = generatePreviewToken(orderId1)
    const { req: req10Pdf, res: res10Pdf } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderPdf', orderId: orderId1, token: previewToken },
    })
    await ordersHandler(req10Pdf, res10Pdf)
    assert.strictEqual(res10Pdf.statusCode, 410, `Deleted PDF download must return 410, got ${res10Pdf.statusCode}`)
    assert.strictEqual(res10Pdf.bodyData?.success, false)
    assert.strictEqual(res10Pdf.bodyData?.deleted, true)
    console.log('✓ TEST 10 PASSED: Download attempt on deleted document returns HTTP 410 Gone\n')

    // ── TEST 11: Active printing blocks deletion (HTTP 409 Conflict) ────────
    console.log('[TEST 11] Testing deletion while order is actively printing...')
    const orderIdPrint = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdPrint)
    const { req: reqPrintSave, res: resPrintSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdPrint,
        fileName: 'active_print.pdf',
        copies: 1,
        amount: 15,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqPrintSave, resPrintSave)
    assert.strictEqual(resPrintSave.statusCode, 200, `Save orderPrint must return 200: ${JSON.stringify(resPrintSave.bodyData)}`)
    const printToken = resPrintSave.bodyData.deletionToken

    // Set order status to 'Printing' in DB
    await ordersCol.updateOne({ orderId: orderIdPrint }, { $set: { printStatus: 'Printing' } })

    const { req: reqPrintDel, res: resPrintDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdPrint, deletionToken: printToken },
    })
    await ordersHandler(reqPrintDel, resPrintDel)
    assert.strictEqual(resPrintDel.statusCode, 409, `Deleting while printing must return 409, got ${resPrintDel.statusCode}`)
    assert.strictEqual(resPrintDel.bodyData?.conflict, true)
    console.log('✓ TEST 11 PASSED: Actively printing orders safely block deletion with HTTP 409 Conflict\n')

    // ── TEST 12: Print Agent claim on deleted order fails (HTTP 410 Gone) ───
    console.log('[TEST 12] Testing Print Agent claim on deleted order...')
    const agentKey = process.env.AGENT_SECRET_KEY || 'XB_AGENT_PROD_SECRET_KEY_SUPER_SECURE_2026'
    const { req: reqClaim, res: resClaim } = createMockReqRes({
      method: 'POST',
      url: `/api/agent/orders/${orderId1}/claim`,
      query: { route: `${orderId1}/claim` },
      headers: { 'x-agent-key': agentKey },
    })
    await agentOrdersHandler(reqClaim, resClaim)
    assert.strictEqual(resClaim.statusCode, 410, `Claim on deleted order must return 410, got ${resClaim.statusCode}`)
    assert.strictEqual(resClaim.bodyData?.documentDeleted, true)
    console.log('✓ TEST 12 PASSED: Print Agent claim on deleted order rejected with HTTP 410 Gone\n')

    // ── TEST 13: Already-printed order retains 'Printed' status on deletion ──
    console.log('[TEST 13] Testing deletion of already printed document...')
    const orderIdPrinted = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdPrinted)
    const { req: reqPrintedSave, res: resPrintedSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdPrinted,
        fileName: 'history_print.pdf',
        copies: 1,
        amount: 20,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqPrintedSave, resPrintedSave)
    assert.strictEqual(resPrintedSave.statusCode, 200, `Save orderPrinted must return 200: ${JSON.stringify(resPrintedSave.bodyData)}`)
    const printedToken = resPrintedSave.bodyData.deletionToken

    // Mark as Printed with printedAt timestamp
    await ordersCol.updateOne({ orderId: orderIdPrinted }, {
      $set: { printStatus: 'Printed', printedAt: new Date().toISOString() }
    })

    const { req: reqDelPrinted, res: resDelPrinted } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdPrinted, deletionToken: printedToken },
    })
    await ordersHandler(reqDelPrinted, resDelPrinted)
    assert.strictEqual(resDelPrinted.statusCode, 200)

    const postDelPrinted = await ordersCol.findOne({ orderId: orderIdPrinted })
    assert.strictEqual(postDelPrinted.printStatus, 'Printed', 'Printed status must be preserved for order history')
    assert.strictEqual(postDelPrinted.documentDeleted, true)
    console.log('✓ TEST 13 PASSED: Printed order preserves "Printed" printStatus while document is deleted\n')

    // ── TEST 14: Booth / station admin session override can delete ───────────
    console.log('[TEST 14] Testing station booth authorization override for deletion...')
    const boothToken = generateBoothSessionToken()
    const { req: reqBoothDel, res: resBoothDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId2 },
      headers: { 'x-booth-session': boothToken },
    })
    await ordersHandler(reqBoothDel, resBoothDel)
    assert.strictEqual(resBoothDel.statusCode, 200, `Booth session should authorize deletion, got ${resBoothDel.statusCode}`)
    console.log('✓ TEST 14 PASSED: Station operator session override successfully authorized deletion\n')

    // ── TEST 15: Public getOrderStatus sanitization ─────────────────────────
    console.log('[TEST 15] Verifying getOrderStatus sanitizes private document references...')
    const { req: reqStatus, res: resStatus } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: orderId1 },
    })
    await ordersHandler(reqStatus, resStatus)
    assert.strictEqual(resStatus.statusCode, 200)
    assert.strictEqual(resStatus.bodyData?.order?.documentDeleted, true)
    assert.strictEqual(resStatus.bodyData?.order?.hasPdf, false)
    assert.strictEqual(resStatus.bodyData?.order?.pdfUrl, undefined)
    assert.strictEqual(resStatus.bodyData?.order?.fileUrl, undefined)
    assert.strictEqual(resStatus.bodyData?.order?.gridFsFileId, undefined)
    console.log('✓ TEST 15 PASSED: getOrderStatus response is sanitized and confirms deletion\n')

    // ── TEST 16: Bilingual translation keys check (English & Telugu) ─────────
    console.log('[TEST 16] Verifying i18n locale keys in en.js and te.js...')
    const enModule = await import('../../frontend/src/i18n/locales/en.js')
    const teModule = await import('../../frontend/src/i18n/locales/te.js')
    const en = enModule.en || enModule.default
    const te = teModule.te || teModule.default

    const enOrders = en.orders || {}
    const teOrders = te.orders || {}

    const requiredKeys = [
      'deleteDocument',
      'deletePermanently',
      'deleteModalTitle',
      'deleteModalDesc',
      'deleteModalWarning',
      'deleteCancel',
      'deleting',
      'deleteSuccessTitle',
      'deleteSuccessDesc',
      'deletedByUser',
      'deletedByUserCaption',
      'autoDeleted',
      'autoDeletedCaption',
      'deletionUnavailablePrinting',
      'deleteFailed',
    ]

    for (const key of requiredKeys) {
      assert.ok(enOrders[key], `en.js missing key: myOrders.${key}`)
      assert.ok(teOrders[key], `te.js missing key: myOrders.${key}`)
    }
    console.log('✓ TEST 16 PASSED: All 15 i18n keys present in both English and Telugu\n')

    console.log('=================================================================')
    console.log('  ALL SECURE DOCUMENT DELETION REGRESSION TESTS PASSED (16/16)   ')
    console.log('=================================================================\n')
  } finally {
    // Cleanup synthetic test records from DB & GridFS
    try {
      for (const id of testIdsToCleanup) {
        await ordersCol.deleteOne({ orderId: id })
        await deletePdfFromGridFS(db, id).catch(() => {})
      }
      await closeDatabaseConnection()
    } catch {}
  }
}

runSecureDeletionTestSuite().catch(err => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})
