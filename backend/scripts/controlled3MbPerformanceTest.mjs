import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'
import crypto from 'crypto'
import { connectToDatabase } from '../api/_lib/mongodb.js'
import { getGridFSBucket } from '../api/_lib/gridfs.js'

const LOCAL_SERVER_URL = 'http://127.0.0.1:3000'

async function createSynthetic3MbPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  
  for (let i = 1; i <= 10; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`XBuddy Controlled 3.0 MB Test PDF - Page ${i} of 10`, {
      x: 50,
      y: 800,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    page.drawText(`Controlled synthetic PDF document generated strictly for performance benchmarking.`, {
      x: 50,
      y: 770,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  const baseBytes = await doc.save()
  const targetBytes = 3 * 1024 * 1024 // exactly 3,145,728 bytes
  
  if (baseBytes.length < targetBytes) {
    const paddingNeeded = targetBytes - baseBytes.length
    const padding = Buffer.alloc(paddingNeeded, '% XBUDDY SYNTHETIC PADDING FOR CONTROLLED 3MB SUBMISSION BENCHMARK\n')
    return Buffer.concat([Buffer.from(baseBytes), padding])
  }
  return Buffer.from(baseBytes)
}

async function runControlledTest() {
  console.log('================================================================')
  console.log('   XBUDDY 3.0 MB CONTROLLED PERFORMANCE BENCHMARK & VERIFICATION')
  console.log('================================================================\n')

  // ── Stage 1: Document preparation ──
  const t0 = performance.now()
  const pdfBuffer = await createSynthetic3MbPdf()
  const stage1PrepMs = Math.round(performance.now() - t0)
  const actualBytes = pdfBuffer.length
  const originalHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')

  console.log(`[Stage 1: PDF Document Generation]`)
  console.log(`  - Exact Size: ${(actualBytes / (1024 * 1024)).toFixed(3)} MB (${actualBytes} bytes)`)
  console.log(`  - SHA-256 Hash: ${originalHash}`)
  console.log(`  - Duration: ${stage1PrepMs} ms\n`)

  // ── Stage 2: Base64 Encoding ──
  const tB64 = performance.now()
  const pdfBase64 = pdfBuffer.toString('base64')
  const stage2B64Ms = Math.round(performance.now() - tB64)
  const b64Bytes = Buffer.byteLength(pdfBase64, 'utf8')

  console.log(`[Stage 2: Base64 Encoding]`)
  console.log(`  - Base64 Length: ${pdfBase64.length} chars`)
  console.log(`  - Base64 Bytes: ${(b64Bytes / (1024 * 1024)).toFixed(3)} MB (${b64Bytes} bytes)`)
  console.log(`  - Inflation: +${Math.round(((b64Bytes / actualBytes) - 1) * 100)}%`)
  console.log(`  - Encoding Duration: ${stage2B64Ms} ms\n`)

  // ── Stage 3: Request Serialization ──
  const testOrderId = `XB${Math.floor(1000 + Math.random() * 8999)}`
  const tJson = performance.now()
  const orderPayload = {
    action: 'saveOrder',
    orderId: testOrderId,
    name: '9999999999',
    fileName: 'Controlled_3MB_Document.pdf',
    totalPages: 10,
    copies: 1,
    colorMode: 'bw',
    printType: 'B&W',
    printSide: 'Single',
    duplex: false,
    pageSize: 'A4',
    paperSize: 'A4',
    orientation: 'portrait',
    amount: 20,
    printingCost: 18,
    serviceFee: 2,
    digitalProcessingFee: 2,
    transactionId: `TXN_${Date.now()}`,
    pageRange: 'all',
    pageRangeMode: 'all',
    customPages: '',
    printableCount: 10,
    selectedPages: [],
    selectedPageCount: 10,
    printStatus: 'waiting_for_shopkeeper',
    paymentStatus: 'pending',
    pdfBase64,
  }
  const payloadString = JSON.stringify(orderPayload)
  const stage3JsonMs = Math.round(performance.now() - tJson)
  const totalPayloadBytes = Buffer.byteLength(payloadString, 'utf8')

  console.log(`[Stage 3: JSON Request Serialization]`)
  console.log(`  - Order ID: ${testOrderId}`)
  console.log(`  - Total HTTP POST Body Size: ${(totalPayloadBytes / (1024 * 1024)).toFixed(3)} MB (${totalPayloadBytes} bytes)`)
  console.log(`  - Serialization Duration: ${stage3JsonMs} ms\n`)

  // ── Stage 4: Order Submission to Optimized Orders API ──
  console.log(`[Stage 4: Submission to Optimized Orders API (${LOCAL_SERVER_URL}/api/orders)]`)
  const tSubmitStart = performance.now()
  const submitRes = await fetch(`${LOCAL_SERVER_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadString,
    signal: AbortSignal.timeout(90000),
  })
  const stage4TotalMs = Math.round(performance.now() - tSubmitStart)
  const submitData = await submitRes.json()

  console.log(`  - HTTP Status: ${submitRes.status}`)
  console.log(`  - Success: ${submitData.success}`)
  console.log(`  - mongoSaved: ${submitData.mongoSaved}`)
  console.log(`  - pdfStorage: ${submitData.pdfStorage}`)
  console.log(`  - Total End-to-End Duration: ${stage4TotalMs} ms`)
  if (submitData.timings) {
    console.log(`  - Server-Side Breakdown:`)
    console.log(`      * Validation: ${submitData.timings.validationMs} ms`)
    console.log(`      * Base64 Decode: ${submitData.timings.decodeMs} ms`)
    console.log(`      * GridFS Upload: ${submitData.timings.gridFsMs} ms`)
    console.log(`      * Disk Cache: ${submitData.timings.diskCacheMs} ms`)
    console.log(`      * MongoDB Insert: ${submitData.timings.mongoInsertMs} ms`)
    console.log(`      * Total Server Processing: ${submitData.timings.serverTotalMs} ms`)
  }
  console.log()

  // ── Stage 5: Byte Fidelity Verification via getOrderPdf ──
  console.log(`[Stage 5: PDF Retrieval & Byte Fidelity Check via getOrderPdf]`)
  const tGet = performance.now()
  const getPdfRes = await fetch(`${LOCAL_SERVER_URL}/api/orders?action=getOrderPdf&orderId=${testOrderId}`)
  const downloadedBytes = await getPdfRes.arrayBuffer()
  const getMs = Math.round(performance.now() - tGet)
  const downloadedBuf = Buffer.from(downloadedBytes)
  const downloadedHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex')

  const sizeMatched = actualBytes === downloadedBuf.length
  const hashMatched = originalHash === downloadedHash
  console.log(`  - Download duration: ${getMs} ms`)
  console.log(`  - Original size: ${actualBytes} bytes`)
  console.log(`  - Downloaded size: ${downloadedBuf.length} bytes`)
  console.log(`  - Size match: ${sizeMatched ? '✓ EXACT MATCH' : '✗ MISMATCH'}`)
  console.log(`  - SHA-256 match: ${hashMatched ? '✓ 100% BIT-FOR-BIT IDENTICAL' : '✗ HASH MISMATCH'}\n`)

  if (!sizeMatched || !hashMatched) {
    throw new Error('Byte fidelity check failed!')
  }

  // ── Stage 6: Idempotent Retry Test ──
  console.log(`[Stage 6: Idempotent Resubmission Safeguard Check]`)
  const tRetry = performance.now()
  const retryRes = await fetch(`${LOCAL_SERVER_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadString,
  })
  const retryMs = Math.round(performance.now() - tRetry)
  const retryData = await retryRes.json()
  console.log(`  - Retry HTTP Status: ${retryRes.status}`)
  console.log(`  - Idempotent flag: ${retryData.idempotent}`)
  console.log(`  - Success: ${retryData.success}`)
  console.log(`  - Duration: ${retryMs} ms\n`)

  // ── Stage 7: Database & GridFS Invariant Verification ──
  console.log(`[Stage 7: Database Invariant & Duplicate Verification]`)
  const { db } = await connectToDatabase()
  const orderCount = await db.collection('orders').countDocuments({ orderId: testOrderId })
  const gridCount = await db.collection('order_pdfs.files').countDocuments({ filename: `${testOrderId}.pdf` })
  console.log(`  - Orders collection count for ${testOrderId}: ${orderCount} (Expected: 1)`)
  console.log(`  - GridFS files count for ${testOrderId}.pdf: ${gridCount} (Expected: 1)`)
  const noDuplicates = orderCount === 1 && gridCount === 1
  console.log(`  - Zero Duplicates Invariant: ${noDuplicates ? '✓ VERIFIED' : '✗ FAILED'}\n`)

  // ── Stage 8: Order Status Reconciliation Check ──
  console.log(`[Stage 8: getOrderStatus Fast Verification]`)
  const tStatus = performance.now()
  const statusRes = await fetch(`${LOCAL_SERVER_URL}/api/orders?action=getOrderStatus&orderId=${testOrderId}`)
  const statusData = await statusRes.json()
  const statusMs = Math.round(performance.now() - tStatus)
  console.log(`  - getOrderStatus duration: ${statusMs} ms`)
  console.log(`  - hasPdf: ${statusData.order?.hasPdf}`)
  console.log(`  - pdfStorage: ${statusData.order?.pdfStorage}`)
  console.log(`  - printStatus: ${statusData.order?.printStatus}`)
  console.log(`  - paymentStatus: ${statusData.order?.paymentStatus}\n`)

  // ── Cleanup Test Records ──
  console.log(`[Cleaning up synthetic test records...]`)
  const bucket = getGridFSBucket(db)
  const files = await bucket.find({ filename: `${testOrderId}.pdf` }).toArray()
  for (const f of files) {
    await bucket.delete(f._id).catch(() => {})
  }
  await db.collection('orders').deleteOne({ orderId: testOrderId }).catch(() => {})
  console.log(`  - Removed synthetic order ${testOrderId} and GridFS files cleanly.\n`)

  console.log('================================================================')
  console.log('            CONTROLLED 3.0 MB VERIFICATION COMPLETE             ')
  console.log('================================================================')
}

runControlledTest().catch(err => {
  console.error('Controlled test error:', err)
  process.exit(1)
})
