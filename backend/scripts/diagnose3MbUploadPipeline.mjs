import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'
import crypto from 'crypto'

const RENDER_URL = 'https://xbuddy.onrender.com'
const VERCEL_URL = 'https://xbuddysrkr.vercel.app'

async function createSynthetic3MbPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  
  // Create 10 pages with text
  for (let i = 1; i <= 10; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`XBuddy Controlled Performance Test PDF - Page ${i} of 10`, {
      x: 50,
      y: 800,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    page.drawText(`Synthetic test payload for diagnosing 3.0 MB upload pipeline latency.`, {
      x: 50,
      y: 770,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  const baseBytes = await doc.save()
  const targetBytes = 3 * 1024 * 1024 // exactly 3.0 MB (3,145,728 bytes)
  
  if (baseBytes.length < targetBytes) {
    const paddingNeeded = targetBytes - baseBytes.length
    // Valid PDF comment padding
    const padding = Buffer.alloc(paddingNeeded, '% XBUDDY DUMMY PADDING DATA FOR CONTROLLED BENCHMARKING\n')
    return Buffer.concat([Buffer.from(baseBytes), padding])
  }
  return Buffer.from(baseBytes)
}

async function runDiagnosis() {
  console.log('===============================================================')
  console.log('   XBUDDY 3.0 MB PDF SUBMISSION PIPELINE DIAGNOSTIC TRACE      ')
  console.log('===============================================================\n')

  // ── Stage 1: Reading and preparing PDF ──
  const t0 = performance.now()
  const pdfBuffer = await createSynthetic3MbPdf()
  const stage1PrepMs = Math.round(performance.now() - t0)
  const actualBytes = pdfBuffer.length
  const originalHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')
  console.log(`[Stage 1: PDF Preparation] Generated synthetic PDF:`)
  console.log(`  - Size: ${(actualBytes / (1024 * 1024)).toFixed(3)} MB (${actualBytes} bytes)`)
  console.log(`  - SHA-256: ${originalHash.slice(0, 16)}...`)
  console.log(`  - Preparation duration: ${stage1PrepMs} ms\n`)

  // ── Stage 2: Base64 Encoding ──
  const tB64 = performance.now()
  const pdfBase64 = pdfBuffer.toString('base64')
  const stage2B64Ms = Math.round(performance.now() - tB64)
  const b64Bytes = Buffer.byteLength(pdfBase64, 'utf8')
  console.log(`[Stage 2: Base64 Encoding]`)
  console.log(`  - Base64 String length: ${pdfBase64.length} chars`)
  console.log(`  - Base64 Byte size: ${(b64Bytes / (1024 * 1024)).toFixed(3)} MB (${b64Bytes} bytes)`)
  console.log(`  - Payload Inflation: +${Math.round(((b64Bytes / actualBytes) - 1) * 100)}%`)
  console.log(`  - Encoding duration: ${stage2B64Ms} ms\n`)

  // ── Stage 3: Request JSON Serialization ──
  const testOrderId = `XB${Math.floor(1000 + Math.random() * 8999)}`
  const tJson = performance.now()
  const orderPayload = {
    action: 'saveOrder',
    orderId: testOrderId,
    name: 'Pipeline Diagnostic Test',
    fileName: 'Diagnostic_3MB_Document.pdf',
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
    transactionId: `TXN_DIAG_${Date.now()}`,
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
  console.log(`[Stage 3: JSON Serialization]`)
  console.log(`  - Total HTTP POST body size: ${(totalPayloadBytes / (1024 * 1024)).toFixed(3)} MB (${totalPayloadBytes} bytes)`)
  console.log(`  - Serialization duration: ${stage3JsonMs} ms\n`)

  // ── Stage 4: Test Direct to Render Canonical API ──
  console.log(`[Stage 4: Direct Upload to Render Canonical API (${RENDER_URL}/api/orders)]`)
  const tRender = performance.now()
  let renderResult = null
  let renderHttpStatus = null
  try {
    const res = await fetch(`${RENDER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadString,
      signal: AbortSignal.timeout(90000),
    })
    renderHttpStatus = res.status
    renderResult = await res.json()
  } catch (err) {
    renderResult = { error: err.message }
  }
  const stage4RenderMs = Math.round(performance.now() - tRender)
  console.log(`  - HTTP Status: ${renderHttpStatus}`)
  console.log(`  - Success: ${renderResult?.success}`)
  console.log(`  - mongoSaved: ${renderResult?.mongoSaved}`)
  console.log(`  - pdfStorage: ${renderResult?.pdfStorage}`)
  console.log(`  - Duration: ${stage4RenderMs} ms (${(stage4RenderMs / 1000).toFixed(2)} s)\n`)

  // ── Stage 5: Test Upload via Vercel Production Proxy ──
  const testOrderIdVercel = `XB${Math.floor(1000 + Math.random() * 8999)}`
  orderPayload.orderId = testOrderIdVercel
  const payloadStringVercel = JSON.stringify(orderPayload)
  console.log(`[Stage 5: Upload via Vercel Production Proxy (${VERCEL_URL}/api/orders)]`)
  const tVercel = performance.now()
  let vercelResult = null
  let vercelHttpStatus = null
  try {
    const res = await fetch(`${VERCEL_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStringVercel,
      signal: AbortSignal.timeout(90000),
    })
    vercelHttpStatus = res.status
    const text = await res.text()
    try {
      vercelResult = JSON.parse(text)
    } catch {
      vercelResult = { rawText: text.slice(0, 200) }
    }
  } catch (err) {
    vercelResult = { error: err.message }
  }
  const stage5VercelMs = Math.round(performance.now() - tVercel)
  console.log(`  - HTTP Status: ${vercelHttpStatus}`)
  console.log(`  - Success: ${vercelResult?.success}`)
  console.log(`  - mongoSaved: ${vercelResult?.mongoSaved}`)
  console.log(`  - pdfStorage: ${vercelResult?.pdfStorage}`)
  console.log(`  - Duration: ${stage5VercelMs} ms (${(stage5VercelMs / 1000).toFixed(2)} s)`)
  if (!vercelResult?.success) {
    console.log(`  - Details:`, vercelResult)
  }
  console.log()

  // ── Stage 6: Verify Stored PDF Fidelity ──
  console.log(`[Stage 6: PDF Byte Fidelity Verification via getOrderPdf]`)
  const verifiedId = renderResult?.success ? testOrderId : (vercelResult?.success ? testOrderIdVercel : null)
  if (verifiedId) {
    const tGet = performance.now()
    const getRes = await fetch(`${RENDER_URL}/api/orders?action=getOrderPdf&orderId=${verifiedId}`)
    const getBytes = await getRes.arrayBuffer()
    const getMs = Math.round(performance.now() - tGet)
    const downloadedBuf = Buffer.from(getBytes)
    const downloadedHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex')
    console.log(`  - Retrieved Order: ${verifiedId}`)
    console.log(`  - Download duration: ${getMs} ms`)
    console.log(`  - Original size: ${actualBytes} bytes`)
    console.log(`  - Downloaded size: ${downloadedBuf.length} bytes`)
    console.log(`  - Size match: ${actualBytes === downloadedBuf.length}`)
    console.log(`  - Hash match: ${originalHash === downloadedHash}`)
  }

  console.log('\n===============================================================')
  console.log('                     DIAGNOSIS COMPLETE                        ')
  console.log('===============================================================')
}

runDiagnosis().catch(err => {
  console.error('Diagnostic error:', err)
  process.exit(1)
})
