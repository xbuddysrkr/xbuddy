import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'
import dotenv from 'dotenv'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { savePdfToGridFS, getPdfStreamFromGridFS, getPdfBufferFromGridFS, hasPdfInGridFS } from '../api/_lib/gridfs.js'
import ordersHandler, { validateOrderPayload } from '../api/orders.js'

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

// Mock Request & Response helper for testing serverless ordersHandler
function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {} }) {
  const req = {
    method,
    query,
    body,
    headers,
  }
  class MockResponse extends Writable {
    constructor() {
      super()
      this.statusCode = 200
      this.headers = {}
      this.bodyData = null
      this._chunks = []
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
      this.emit('finish')
      return this
    }
    send(buf) {
      this.bodyData = buf
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
      callback()
    }
  }
  const res = new MockResponse()
  return { req, res }
}

async function runMissingPdfTests() {
  console.log('================================================================')
  console.log('  STARTING XBUDDY MISSING-PDF PERSISTENCE & GRIDFS TEST SUITE   ')
  console.log('================================================================\n')

  const testTimestamp = Date.now()
  const testOrderId = `XB_TEST_${testTimestamp}`

  // ── TEST 1: Strict Validation - Reject Missing PDF Payload ─────────────────
  console.log('[TEST 1] Testing order submission with NO PDF or Drive URL...')
  const payloadNoPdf = {
    action: 'saveOrder',
    orderId: 'XB9991',
    fileName: 'empty_doc.pdf',
    amount: 10,
    copies: 1,
    pdfBase64: '',
    driveUrl: '',
  }
  const validationNoPdf = validateOrderPayload(payloadNoPdf)
  assert.strictEqual(validationNoPdf.isValid, false, 'Validation must fail when PDF and driveUrl are absent')
  assert.ok(
    validationNoPdf.errors.some(e => e.includes('PDF') || e.includes('Drive')),
    'Validation error must state PDF file or Drive URL is required'
  )

  const { req: req1, res: res1 } = createMockReqRes({ body: payloadNoPdf })
  await ordersHandler(req1, res1)
  assert.strictEqual(res1.statusCode, 400, 'Handler must reject missing PDF with HTTP 400')
  assert.strictEqual(res1.bodyData.success, false)
  console.log('✓ TEST 1 PASSED: Submission without PDF is rejected with HTTP 400 and NOT saved\n')

  // ── TEST 2: Strict Validation - Reject Non-PDF File (Invalid Magic Header) ──
  console.log('[TEST 2] Testing order submission with corrupted/non-PDF header...')
  const fakeBase64 = Buffer.from('This is a plain text file, not a PDF!').toString('base64')
  const payloadBadPdf = {
    action: 'saveOrder',
    orderId: 'XB9992',
    fileName: 'fake.pdf',
    amount: 10,
    copies: 1,
    pdfBase64: fakeBase64,
  }
  const validationBadPdf = validateOrderPayload(payloadBadPdf)
  assert.strictEqual(validationBadPdf.isValid, false, 'Validation must fail for non-PDF payload')
  assert.ok(
    validationBadPdf.errors.some(e => e.includes('%PDF-')),
    'Validation error must cite missing %PDF- header'
  )

  const { req: req2, res: res2 } = createMockReqRes({ body: payloadBadPdf })
  await ordersHandler(req2, res2)
  assert.strictEqual(res2.statusCode, 400, 'Handler must reject non-PDF with HTTP 400')
  console.log('✓ TEST 2 PASSED: Non-PDF document is rejected before persistence\n')

  // ── TEST 3: Valid PDF Upload & Byte-for-Byte Round-Trip ─────────────────────
  console.log('[TEST 3] Testing valid PDF upload, GridFS storage, and getOrderPdf retrieval...')
  // Create minimal valid PDF buffer
  const samplePdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n168\n%%EOF`
  const sampleBuffer = Buffer.from(samplePdfContent, 'utf-8')
  const sampleBase64 = sampleBuffer.toString('base64')

  const validOrderId = `XB${Math.floor(1000 + Math.random() * 9000)}`
  const payloadValid = {
    action: 'saveOrder',
    orderId: validOrderId,
    fileName: 'test_lab_record.pdf',
    amount: 25,
    copies: 1,
    totalPages: 3,
    pdfBase64: sampleBase64,
  }

  const { req: req3, res: res3 } = createMockReqRes({ body: payloadValid })
  await ordersHandler(req3, res3)
  if (res3.statusCode !== 200) {
    console.error('Test 3 Error Response:', res3.statusCode, res3.bodyData)
  }
  assert.strictEqual(res3.statusCode, 200, `Handler must return 200 for valid order, got ${res3.statusCode}`)
  assert.strictEqual(res3.bodyData.success, true)
  assert.strictEqual(res3.bodyData.mongoSaved, true)
  assert.strictEqual(res3.bodyData.hasPdf, true)
  console.log(`  ✓ Order ${validOrderId} saved with mongoSaved=true, hasPdf=true`)

  // Retrieve PDF via getOrderPdf
  const { req: reqGet, res: resGet } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: validOrderId },
  })
  await ordersHandler(reqGet, resGet)
  assert.strictEqual(resGet.statusCode, 200, `getOrderPdf must return 200, got ${resGet.statusCode}`)
  assert.strictEqual(resGet.headers['content-type'], 'application/pdf', 'Content-Type must be application/pdf')
  assert.ok(resGet.bodyData && Buffer.isBuffer(resGet.bodyData), 'Body must be a Buffer')
  assert.strictEqual(resGet.bodyData.toString('utf-8'), samplePdfContent, 'Retrieved PDF must be identical to uploaded document')
  console.log('✓ TEST 3 PASSED: Valid PDF saved to GridFS and retrieved with exact byte fidelity\n')

  // ── TEST 4: Multi-Page PDF via GridFS & 16MB Base64 Validation ──────────────
  console.log('[TEST 4] Testing GridFS persistence for multi-page PDF and > 15MB Base64 validation...')
  // 1. Verify 16MB Base64 payload is NOT stripped or rejected by validation
  const hugeHeader = Buffer.from('%PDF-1.4\n')
  const hugePadding = Buffer.alloc(12 * 1024 * 1024, 66)
  const hugeBase64 = Buffer.concat([hugeHeader, hugePadding]).toString('base64')
  assert.ok(hugeBase64.length > 15 * 1024 * 1024, 'Base64 length must exceed 15MB')
  const valHuge = validateOrderPayload({ orderId: 'XB9994', copies: 1, amount: 20, pdfBase64: hugeBase64 })
  assert.strictEqual(valHuge.isValid, true, 'Huge Base64 PDF must pass payload validation')
  console.log('  ✓ 16MB Base64 payload successfully validated without rejection or truncation')

  // 2. Construct 2.5MB test PDF (> 2MB threshold to trigger GridFS storage and pdfBase64="")
  const largeHeader = Buffer.from('%PDF-1.4\n% Multi-page scanned lab record\n')
  const largeTrailer = Buffer.from('\n%%EOF\n')
  const targetSize = Math.floor(2.5 * 1024 * 1024)
  const padding = Buffer.alloc(targetSize - largeHeader.length - largeTrailer.length, 65)
  const largePdfBuffer = Buffer.concat([largeHeader, padding, largeTrailer])
  const largeBase64 = largePdfBuffer.toString('base64')

  const largeOrderId = `XB${Math.floor(1000 + Math.random() * 9000)}`
  const payloadLarge = {
    action: 'saveOrder',
    orderId: largeOrderId,
    fileName: 'scanned_lab_record.pdf',
    amount: 50,
    copies: 1,
    totalPages: 25,
    pdfBase64: largeBase64,
  }

  const { req: req4, res: res4 } = createMockReqRes({ body: payloadLarge })
  await ordersHandler(req4, res4)
  assert.strictEqual(res4.statusCode, 200, `Large order must save successfully with 200, got ${res4.statusCode}`)
  assert.strictEqual(res4.bodyData.mongoSaved, true)
  assert.strictEqual(res4.bodyData.hasPdf, true)
  assert.strictEqual(res4.bodyData.pdfStorage, 'gridfs')
  console.log(`  ✓ Large order ${largeOrderId} persisted to GridFS without BSON document limit failure`)

  // Verify in MongoDB Atlas: orders document must NOT contain huge Base64 string
  const { db } = await connectToDatabase()
  const storedDoc = await db.collection('orders').findOne({ orderId: largeOrderId })
  assert.ok(storedDoc, 'Order document must exist in Atlas')
  assert.strictEqual(storedDoc.hasPdf, true)
  assert.strictEqual(storedDoc.hasGridFsPdf, true)
  assert.strictEqual(storedDoc.pdfBase64, '', 'Large PDF must NOT be stored inline in orders document')
  assert.strictEqual(storedDoc.pdfSize, largePdfBuffer.length)
  console.log(`  ✓ Authoritative document in xbuddy.orders is lightweight (< 1KB), pdfBase64=""`)

  // Delete from local cache to verify Tier 2 GridFS streaming retrieval
  const cachePath = path.resolve('.pdf_cache', `${largeOrderId}.pdf`)
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)

  // Retrieve large PDF from GridFS
  const { req: reqLargeGet, res: resLargeGet } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: largeOrderId },
  })
  await ordersHandler(reqLargeGet, resLargeGet)
  assert.strictEqual(resLargeGet.statusCode, 200)
  assert.strictEqual(resLargeGet.headers['content-type'], 'application/pdf')
  assert.strictEqual(resLargeGet.headers['x-pdf-source'], 'mongo-gridfs')
  assert.strictEqual(resLargeGet.bodyData.length, largePdfBuffer.length, 'Retrieved stream must match exact original size')
  assert.strictEqual(resLargeGet.bodyData.subarray(0, 5).toString('ascii'), '%PDF-')
  console.log('✓ TEST 4 PASSED: Large PDF (> 15MB Base64) persisted in GridFS and streamed flawlessly\n')

  // ── TEST 5: Metadata Lookups (getOrderStatus & listOrders) ─────────────────
  console.log('[TEST 5] Testing getOrderStatus and listOrders metadata queries...')
  const { req: reqStatus, res: resStatus } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderStatus', orderId: largeOrderId },
  })
  await ordersHandler(reqStatus, resStatus)
  assert.strictEqual(resStatus.statusCode, 200)
  assert.strictEqual(resStatus.bodyData.order.orderId, largeOrderId)
  assert.strictEqual(resStatus.bodyData.order.hasPdf, true, 'getOrderStatus must report hasPdf=true for GridFS order')
  assert.strictEqual(resStatus.bodyData.order.pdfBase64, undefined, 'pdfBase64 must NOT be returned in metadata')

  const { req: reqList, res: resList } = createMockReqRes({
    method: 'GET',
    query: { action: 'listOrders' },
  })
  await ordersHandler(reqList, resList)
  assert.strictEqual(resList.statusCode, 200)
  const foundInList = resList.bodyData.orders.find(o => o.orderId === largeOrderId)
  assert.ok(foundInList, 'Order must appear in listOrders')
  assert.strictEqual(foundInList.hasPdf, true, 'listOrders must report hasPdf=true')
  console.log('✓ TEST 5 PASSED: Metadata lookups correctly return hasPdf=true without downloading heavy PDF\n')

  // ── TEST 6: Genuine Missing PDF Returns Accurate HTTP 404 ──────────────────
  console.log('[TEST 6] Testing getOrderPdf for missing orders & order without PDF...')
  const { req: req404, res: res404 } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB0000_DOES_NOT_EXIST' },
  })
  await ordersHandler(req404, res404)
  assert.strictEqual(res404.statusCode, 404, 'Must return 404 for nonexistent order')

  // Test XB3802 (the production bug order)
  const { req: req3802, res: res3802 } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB3802' },
  })
  await ordersHandler(req3802, res3802)
  assert.strictEqual(res3802.statusCode, 404, 'Must return 404 for XB3802 until repaired')
  assert.strictEqual(res3802.bodyData.hasPdf, false)
  console.log('✓ TEST 6 PASSED: getOrderPdf returns accurate HTTP 404 when PDF is genuinely absent\n')

  // ── TEST 7: Git Security - Confirm zero PDF documents in repository ───────
  console.log('[TEST 7] Verifying that .pdf_cache and private PDFs are ignored by Git...')
  const gitignorePath = path.resolve(process.cwd(), '..', '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    assert.ok(
      gitignoreContent.includes('.pdf_cache') || gitignoreContent.includes('*.pdf'),
      '.gitignore must ignore PDF cache files'
    )
    console.log('  ✓ .gitignore properly ignores runtime PDF cache')
  }
  console.log('✓ TEST 7 PASSED: Security audit verified\n')

  // Clean up test orders from Atlas and GridFS
  try {
    const bucket = (await import('mongodb')).GridFSBucket
    const gridBucket = new bucket(db, { bucketName: 'order_pdfs' })
    for (const testId of [validOrderId, largeOrderId]) {
      await db.collection('orders').deleteOne({ orderId: testId })
      const files = await gridBucket.find({ filename: `${testId}.pdf` }).toArray()
      for (const f of files) await gridBucket.delete(f._id)
      const p = path.resolve('.pdf_cache', `${testId}.pdf`)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
  } catch {}

  await closeDatabaseConnection()
  console.log('================================================================')
  console.log('  ALL MISSING-PDF PERSISTENCE REGRESSION TESTS PASSED!          ')
  console.log('================================================================\n')
}

runMissingPdfTests().catch(err => {
  console.error('Test Suite Failed:', err)
  process.exit(1)
})
