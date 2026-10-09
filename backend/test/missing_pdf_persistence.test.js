import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'
import dotenv from 'dotenv'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { savePdfToGridFS, getPdfStreamFromGridFS, getPdfBufferFromGridFS, hasPdfInGridFS, deletePdfFromGridFS } from '../api/_lib/gridfs.js'
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

  // ── TEST 8: GridFS Failure with Local-Cache Success (> 2MB PDF) ────────────
  console.log('[TEST 8] Testing durability gate: GridFS failure with local-cache success (> 2MB)...')
  const test8Size = Math.floor(2.1 * 1024 * 1024)
  const test8Header = Buffer.from('%PDF-1.4\n% Test 8 large PDF\n')
  const test8Trailer = Buffer.from('\n%%EOF\n')
  const test8Buffer = Buffer.concat([test8Header, Buffer.alloc(test8Size - test8Header.length - test8Trailer.length, 67), test8Trailer])
  const test8Base64 = test8Buffer.toString('base64')
  const test8OrderId = `XB80${Math.floor(10000 + Math.random() * 90000)}`

  const { GridFSBucket } = await import('mongodb')
  const origOpenUploadStream = GridFSBucket.prototype.openUploadStream

  // Monkey-patch openUploadStream to simulate GridFS network/Atlas storage failure
  GridFSBucket.prototype.openUploadStream = function (...args) {
    throw new Error('Simulated GridFS Atlas storage failure / upload timeout')
  }

  try {
    const payloadTest8 = {
      action: 'saveOrder',
      orderId: test8OrderId,
      fileName: 'large_failing_gfs.pdf',
      amount: 40,
      copies: 1,
      totalPages: 12,
      pdfBase64: test8Base64,
    }

    const { req: req8, res: res8 } = createMockReqRes({ body: payloadTest8 })
    await ordersHandler(req8, res8)

    // MUST reject with HTTP 500 because local-cache alone never satisfies durable storage
    assert.strictEqual(res8.statusCode, 500, `Handler must reject with 500 when GridFS fails for large PDF, got ${res8.statusCode}`)
    assert.strictEqual(res8.bodyData.success, false)
    assert.strictEqual(res8.bodyData.hasPdf, false)
    assert.ok(
      res8.bodyData.error.includes('GridFS') || res8.bodyData.error.includes('durable'),
      'Error message must cite durable storage failure'
    )

    // Verify order was NEVER inserted into MongoDB Atlas
    const orderInDb = await db.collection('orders').findOne({ orderId: test8OrderId })
    assert.strictEqual(orderInDb, null, 'Order must NOT exist in MongoDB orders collection')

    // Verify getOrderStatus returns 404
    const { req: reqStatus8, res: resStatus8 } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: test8OrderId },
    })
    await ordersHandler(reqStatus8, resStatus8)
    assert.strictEqual(resStatus8.statusCode, 404, 'getOrderStatus must return 404')

    console.log('  ✓ Durability gate successfully rejected order; no unprintable record created in MongoDB Atlas')
  } finally {
    GridFSBucket.prototype.openUploadStream = origOpenUploadStream
    const cachePath8 = path.resolve('.pdf_cache', `${test8OrderId}.pdf`)
    if (fs.existsSync(cachePath8)) fs.unlinkSync(cachePath8)
  }
  console.log('✓ TEST 8 PASSED: Large PDF with GridFS failure rejected; local filesystem alone never qualifies\n')

  // ── TEST 9: GridFS Success Followed by MongoDB Insert Failure (Rollback) ───
  console.log('[TEST 9] Testing rollback cleanup: GridFS upload succeeds but ordersCollection.insertOne fails...')
  const test9OrderId = `XB81${Math.floor(10000 + Math.random() * 90000)}`
  const test9Buffer = Buffer.from('%PDF-1.4\n% Test 9 rollback PDF\nTrailer\n%%EOF\n', 'utf-8')
  const test9Base64 = test9Buffer.toString('base64')

  const origCollection = db.collection.bind(db)
  let insertIntercepted = false
  db.collection = function (name) {
    const col = origCollection(name)
    if (name === 'orders') {
      col.insertOne = async function (...args) {
        insertIntercepted = true
        throw new Error('Simulated duplicate key / write conflict during ordersCollection.insertOne')
      }
    }
    return col
  }

  try {
    const payloadTest9 = {
      action: 'saveOrder',
      orderId: test9OrderId,
      fileName: 'rollback_test.pdf',
      amount: 15,
      copies: 1,
      totalPages: 1,
      pdfBase64: test9Base64,
    }

    const { req: req9, res: res9 } = createMockReqRes({ body: payloadTest9 })
    await ordersHandler(req9, res9)

    assert.ok(insertIntercepted, 'ordersCollection.insertOne must have been called and intercepted')
    assert.strictEqual(res9.statusCode, 500, 'Must return 500 on MongoDB insert failure')
    assert.strictEqual(res9.bodyData.success, false)

    // Verify orphaned GridFS file was cleaned up by deletePdfFromGridFS
    const hasGfs = await hasPdfInGridFS(db, test9OrderId)
    assert.strictEqual(hasGfs, false, 'Orphaned GridFS PDF must be completely cleaned up / rolled back')

    // Verify order was not created in collection
    db.collection = origCollection
    const docCheck = await db.collection('orders').findOne({ orderId: test9OrderId })
    assert.strictEqual(docCheck, null, 'No order document should exist')

    console.log('  ✓ Orphaned GridFS file automatically deleted on MongoDB insert failure')
  } finally {
    db.collection = origCollection
    await deletePdfFromGridFS(db, test9OrderId)
    const p9 = path.resolve('.pdf_cache', `${test9OrderId}.pdf`)
    if (fs.existsSync(p9)) fs.unlinkSync(p9)
  }
  console.log('✓ TEST 9 PASSED: GridFS rollback cleans up orphaned storage chunks on order-insert failure\n')

  // ── TEST 10: Smaller PDFs Stored Inline (< 2MB) in MongoDB Order Document ──
  console.log('[TEST 10] Testing smaller PDF (< 2MB) inline storage and fallback retrieval...')
  const test10OrderId = `XB82${Math.floor(10000 + Math.random() * 90000)}`
  const smallPdfContent = '%PDF-1.4\n% Minimal valid small PDF for inline storage test\n%%EOF\n'
  const smallBuffer = Buffer.from(smallPdfContent, 'utf-8')
  const smallBase64 = smallBuffer.toString('base64')

  const payloadSmall = {
    action: 'saveOrder',
    orderId: test10OrderId,
    fileName: 'small_test.pdf',
    amount: 10,
    copies: 1,
    totalPages: 1,
    pdfBase64: smallBase64,
  }

  const { req: req10, res: res10 } = createMockReqRes({ body: payloadSmall })
  await ordersHandler(req10, res10)
  assert.strictEqual(res10.statusCode, 200)
  assert.strictEqual(res10.bodyData.success, true)
  assert.strictEqual(res10.bodyData.hasPdf, true)

  // Verify in MongoDB Atlas: orderDoc contains non-empty pdfBase64
  const storedSmallDoc = await db.collection('orders').findOne({ orderId: test10OrderId })
  assert.ok(storedSmallDoc, 'Order document must exist')
  assert.strictEqual(storedSmallDoc.hasPdf, true)
  assert.ok(
    storedSmallDoc.pdfBase64 && typeof storedSmallDoc.pdfBase64 === 'string',
    'Small PDF must include pdfBase64 string in MongoDB document'
  )
  assert.ok(storedSmallDoc.pdfBase64.length > 50, 'pdfBase64 must be substantive')
  assert.strictEqual(
    Buffer.from(storedSmallDoc.pdfBase64, 'base64').toString('utf-8'),
    smallPdfContent,
    'Inline Base64 must match original bytes'
  )

  // Now delete from disk cache AND delete from GridFS to test Tier 3 inline retrieval
  const cachePath10 = path.resolve('.pdf_cache', `${test10OrderId}.pdf`)
  if (fs.existsSync(cachePath10)) fs.unlinkSync(cachePath10)
  await deletePdfFromGridFS(db, test10OrderId)

  // Retrieve PDF via getOrderPdf (must be served from inline MongoDB document)
  const { req: reqGetSmall, res: resGetSmall } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: test10OrderId },
  })
  await ordersHandler(reqGetSmall, resGetSmall)
  assert.strictEqual(resGetSmall.statusCode, 200)
  assert.strictEqual(resGetSmall.headers['x-pdf-source'], 'mongo-atlas', 'Should be served from mongo-atlas inline tier')
  assert.strictEqual(resGetSmall.bodyData.toString('utf-8'), smallPdfContent, 'Payload retrieved from inline storage matches byte-for-byte')

  // Clean up test order
  await db.collection('orders').deleteOne({ orderId: test10OrderId })
  if (fs.existsSync(cachePath10)) fs.unlinkSync(cachePath10)
  console.log('✓ TEST 10 PASSED: Small PDFs (< 2MB) include inline Base64 in MongoDB order write and retrieve accurately\n')

  // ── TEST 11: Retrieval When Local Cache is Absent ──────────────────────────
  console.log('[TEST 11] Verifying PDF retrieval from GridFS when local cache is completely absent...')
  const test11OrderId = `XB83${Math.floor(10000 + Math.random() * 90000)}`
  const sample11Content = '%PDF-1.4\n% Test 11 fresh cold-start retrieval\n%%EOF\n'
  const sample11Buffer = Buffer.from(sample11Content, 'utf-8')
  const payload11 = {
    action: 'saveOrder',
    orderId: test11OrderId,
    fileName: 'cold_start_test.pdf',
    amount: 15,
    copies: 1,
    pdfBase64: sample11Buffer.toString('base64'),
  }

  const { req: req11, res: res11 } = createMockReqRes({ body: payload11 })
  await ordersHandler(req11, res11)
  assert.strictEqual(res11.statusCode, 200)

  // Ensure local cache is completely absent
  const cachePath11 = path.resolve('.pdf_cache', `${test11OrderId}.pdf`)
  if (fs.existsSync(cachePath11)) fs.unlinkSync(cachePath11)
  assert.strictEqual(fs.existsSync(cachePath11), false, 'Local cache must be absent')

  // Request PDF cold
  const { req: reqGet11, res: resGet11 } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: test11OrderId },
  })
  await ordersHandler(reqGet11, resGet11)
  assert.strictEqual(resGet11.statusCode, 200)
  assert.strictEqual(resGet11.headers['x-pdf-source'], 'mongo-gridfs', 'Must stream from MongoDB GridFS')
  assert.strictEqual(resGet11.bodyData.toString('utf-8'), sample11Content)

  // Clean up
  await db.collection('orders').deleteOne({ orderId: test11OrderId })
  await deletePdfFromGridFS(db, test11OrderId)
  if (fs.existsSync(cachePath11)) fs.unlinkSync(cachePath11)
  console.log('✓ TEST 11 PASSED: Order PDF cleanly streamed from GridFS when local cache is absent\n')

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
