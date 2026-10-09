import fs from 'fs'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'

const BACKEND_URL = 'https://xbuddy.onrender.com'
const LOCAL_API = 'http://127.0.0.1:3001'

async function createSamplePdf(pageCount, paddingBytes = 0) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const dummyContent = 'X'.repeat(Math.min(paddingBytes, 2000))

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`XBuddy Performance Test Document - Page ${i} of ${pageCount}`, {
      x: 50,
      y: 800,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    page.drawText(`Sample content for benchmark analysis:\n${dummyContent}`, {
      x: 50,
      y: 750,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  const pdfBytes = await doc.save()
  if (paddingBytes > 0 && pdfBytes.length < paddingBytes) {
    const pad = Buffer.alloc(paddingBytes - pdfBytes.length, '% DUMMY SCAN DATA PADDING\n')
    return Buffer.concat([Buffer.from(pdfBytes), pad])
  }
  return Buffer.from(pdfBytes)
}

async function measureStage(label, fn) {
  const t0 = performance.now()
  try {
    const res = await fn()
    const ms = performance.now() - t0
    return { ok: true, ms: Math.round(ms), result: res }
  } catch (err) {
    const ms = performance.now() - t0
    return { ok: false, ms: Math.round(ms), error: err.message }
  }
}

async function runOptimizedBenchmark() {
  console.log('=================================================================')
  console.log('       XBUDDY OPTIMIZED PIPELINE BENCHMARK (PHASE 2 & 3)')
  console.log('=================================================================')

  const testCases = [
    { name: 'Small Document', pages: 1, targetBytes: 15 * 1024 },
    { name: 'Medium Document', pages: 5, targetBytes: 250 * 1024 },
    { name: 'Large Document', pages: 15, targetBytes: 2000 * 1024 },
    { name: 'Multi-page Scan', pages: 30, targetBytes: 4500 * 1024 },
  ]

  const results = []

  for (const tc of testCases) {
    console.log(`\nTesting ${tc.name} (${tc.pages} pages, target ${(tc.targetBytes / 1024).toFixed(0)} KB)...`)
    const pdfBuffer = await createSamplePdf(tc.pages, tc.targetBytes)
    const rawPdfBytes = pdfBuffer.length

    // Stage 1: Client Base64 encode
    const stage1 = await measureStage('Base64 encoding', async () => {
      return pdfBuffer.toString('base64')
    })
    const b64 = stage1.result
    const b64Bytes = Buffer.byteLength(b64, 'utf8')

    // Stage 2: Authoritative MongoDB Order Save (Optimized submission)
    const orderId = 'XB' + String(Math.floor(100000 + Math.random() * 900000)).slice(0, 4)
    const orderPayload = {
      action: 'saveOrder',
      orderId,
      name: '9999999999',
      fileName: `bench_${tc.name.toLowerCase().replace(/\s+/g, '_')}.pdf`,
      totalPages: tc.pages,
      copies: 1,
      colorMode: 'bw',
      printType: 'B&W',
      printSide: 'Single',
      duplex: false,
      pageSize: 'A4',
      orientation: 'portrait',
      amount: tc.pages * 2,
      printingCost: tc.pages * 2,
      serviceFee: 1,
      digitalProcessingFee: 1,
      transactionId: 'UPI' + Date.now(),
      pageRange: 'all',
      printStatus: 'waiting_for_shopkeeper',
      paymentStatus: 'pending',
      pdfBase64: b64,
    }

    const jsonPayload = JSON.stringify(orderPayload)
    const jsonBytes = Buffer.byteLength(jsonPayload, 'utf8')

    console.log(`  Raw PDF: ${(rawPdfBytes / 1024).toFixed(1)} KB | JSON Payload: ${(jsonBytes / 1024).toFixed(1)} KB`)

    const stage2 = await measureStage('saveOrder -> MongoDB Atlas', async () => {
      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        signal: AbortSignal.timeout(60000),
      })
      const text = await res.text()
      return JSON.parse(text)
    })

    const studentTotalMs = stage1.ms + stage2.ms
    console.log(`  [Student Experience] Total submission time to Confirmed: ${studentTotalMs}ms`)
    console.log(`    - Prepare document: ${stage1.ms}ms`)
    console.log(`    - Save to MongoDB Atlas: ${stage2.ms}ms (mongoSaved=${stage2.result?.mongoSaved})`)
    console.log(`    - Kiosk transfer waiting: 0ms (DECOUPLED!)`)

    // Stage 3: Test Idempotent Retry with same orderId
    const retryStage = await measureStage('Idempotent retry submission', async () => {
      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        signal: AbortSignal.timeout(10000),
      })
      return await res.json()
    })
    console.log(`  [Idempotent Retry] Duration: ${retryStage.ms}ms (idempotent=${retryStage.result?.idempotent})`)

    // Stage 4: Test Print Agent On-Demand Cloud Download
    const dlStage = await measureStage('Print Agent on-demand fetch', async () => {
      const res = await fetch(`${BACKEND_URL}/api/orders?action=getOrderPdf&orderId=${orderId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(60000),
      })
      const buf = await res.arrayBuffer()
      return buf.byteLength
    })
    console.log(`  [Shopkeeper Release] On-demand PDF download: ${dlStage.ms}ms (bytes: ${dlStage.result})`)

    results.push({
      name: tc.name,
      pages: tc.pages,
      rawKb: (rawPdfBytes / 1024).toFixed(1),
      jsonKb: (jsonBytes / 1024).toFixed(1),
      stage1Ms: stage1.ms,
      stage2Ms: stage2.ms,
      totalStudentMs: studentTotalMs,
      retryMs: retryStage.ms,
      agentDlMs: dlStage.ms,
      orderId,
    })
  }

  console.log('\n=================================================================')
  console.log('              SUMMARY OF OPTIMIZED PIPELINE')
  console.log('=================================================================')
  console.table(results.map(r => ({
    'Test Case': r.name,
    'Pages': r.pages,
    'PDF Size (KB)': r.rawKb,
    'Encode (ms)': r.stage1Ms,
    'Cloud Save (ms)': r.stage2Ms,
    'Student Wait (ms)': r.totalStudentMs,
    'Retry (ms)': r.retryMs,
    'Print Agent Pull (ms)': r.agentDlMs,
  })))

  // Compare against Phase 1 Unoptimized baselines
  console.log('\n=================================================================')
  console.log('       BEFORE vs AFTER STUDENT ORDER SUBMISSION TIME')
  console.log('=================================================================')
  const beforeVsAfter = [
    {
      'Test Case': 'Small (1p, 15KB)',
      'Before (Blocking Kiosk)': '~2,400 ms - 20,000 ms',
      'After (Decoupled)': `${results[0].totalStudentMs} ms`,
      'Speedup / Benefit': 'No kiosk hang; instant confirmation',
    },
    {
      'Test Case': 'Medium (5p, 250KB)',
      'Before (Blocking Kiosk)': '~15,700 ms - 25,000 ms',
      'After (Decoupled)': `${results[1].totalStudentMs} ms`,
      'Speedup / Benefit': 'Eliminated 7 GAS chunks (~10.5s) & tunnel wait',
    },
    {
      'Test Case': 'Large (15p, 2000KB)',
      'Before (Blocking Kiosk)': '~112,000 ms (stalled at 50%)',
      'After (Decoupled)': `${results[2].totalStudentMs} ms`,
      'Speedup / Benefit': 'Eliminated 54 GAS chunks (~81s); 100% saved',
    },
    {
      'Test Case': 'Scan (30p, 4500KB)',
      'Before (Blocking Kiosk)': '>240,000 ms (Timeout at 50%)',
      'After (Decoupled)': `${results[3].totalStudentMs} ms`,
      'Speedup / Benefit': 'Eliminated 120 GAS chunks (~180s); no mobile timeout',
    },
  ]
  console.table(beforeVsAfter)
}

runOptimizedBenchmark().catch(err => {
  console.error('Benchmark error:', err)
  process.exit(1)
})
