import fs from 'fs'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'

const BACKEND_URL = 'https://xbuddy.onrender.com'
const API_URL = 'https://script.google.com/macros/s/AKfycbxUpE5_E3KmhcD0yIuodtGQyOqxpSnps6Ra6_64rdMTYTPughmzyMKm7P3n_JjM2KqF/exec'
const API_KEY = 'e7a2b91c045f8e3291dc8f7514a60b9380fa0715cb38d97e41ac824b01e3264b'
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
    // Append dummy PDF comment bytes to reach target size without corrupting PDF
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

async function benchmarkCase(name, pageCount, targetBytes) {
  console.log(`\n======================================================`)
  console.log(`BENCHMARK CASE: ${name} (${pageCount} pages, target ~${(targetBytes / 1024).toFixed(1)} KB)`)
  console.log(`======================================================`)

  const pdfBuffer = await createSamplePdf(pageCount, targetBytes)
  const actualPdfBytes = pdfBuffer.length
  console.log(`Actual PDF File Size: ${(actualPdfBytes / 1024).toFixed(1)} KB (${actualPdfBytes} bytes)`)

  // Stage 0: Encode to Base64
  const tB64Start = performance.now()
  const pdfBase64 = pdfBuffer.toString('base64')
  const b64Ms = Math.round(performance.now() - tB64Start)
  const b64Bytes = Buffer.byteLength(pdfBase64, 'utf8')
  console.log(`[Stage 0: File -> Base64] ${b64Ms} ms | Size: ${(b64Bytes / 1024).toFixed(1)} KB (inflation: +${Math.round((b64Bytes / actualPdfBytes - 1) * 100)}%)`)

  const testOrderId = `XB${Math.floor(1000 + Math.random() * 8999)}`

  // Stage 1: saveOrder to MongoDB Atlas (/api/orders)
  console.log(`[Stage 1: saveOrder -> MongoDB Atlas] Sending order payload...`)
  const orderPayload = {
    action: 'saveOrder',
    orderId: testOrderId,
    name: 'Benchmark Student',
    fileName: `${name.replace(/\\s+/g, '_')}.pdf`,
    totalPages: pageCount,
    copies: 1,
    colorMode: 'bw',
    printType: 'B&W',
    printSide: 'Single',
    duplex: false,
    pageSize: 'A4',
    paperSize: 'A4',
    orientation: 'portrait',
    amount: 5,
    printingCost: 3,
    serviceFee: 2,
    digitalProcessingFee: 2,
    transactionId: `TXN_${Date.now()}`,
    pageRange: 'all',
    pageRangeMode: 'all',
    customPages: '',
    printableCount: pageCount,
    selectedPages: [],
    selectedPageCount: pageCount,
    printStatus: 'waiting_for_shopkeeper',
    paymentStatus: 'pending',
    pdfBase64,
  }
  const payloadString = JSON.stringify(orderPayload)
  const payloadBytes = Buffer.byteLength(payloadString, 'utf8')
  console.log(`  Payload JSON Size: ${(payloadBytes / 1024).toFixed(1)} KB`)

  const stage1 = await measureStage('saveOrder', async () => {
    const res = await fetch(`${BACKEND_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadString,
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json()
    return { status: res.status, data }
  })
  console.log(`  Result: ${stage1.ok ? 'SUCCESS' : 'FAILED'} in ${stage1.ms} ms (status: ${stage1.result?.status})`)

  // Stage 2: Attempting to send to kiosk / tunnel (simulating mobile client)
  console.log(`[Stage 2: Kiosk / Tunnel Transfer] Simulating client-side postToAgent & staging...`)
  
  // 2a. Mobile localhost check (fails on mobile device)
  const stage2Local = await measureStage('mobile localhost attempt', async () => {
    const fakeMobileUrl = 'http://10.255.255.1:3001' // Unreachable mobile localhost/network
    const res = await fetch(`${fakeMobileUrl}/save-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: testOrderId, pdfBase64 }),
      signal: AbortSignal.timeout(3000), // simulate fast-fail or timeout
    })
    return res.status
  })
  console.log(`  Mobile Localhost Attempt: ${stage2Local.ms} ms (result: ${stage2Local.ok ? 'reached' : stage2Local.error})`)

  // 2b. Google Apps Script chunked upload (if fallback occurs)
  const chunkSize = 50 * 1024
  const numChunks = Math.ceil(pdfBase64.length / chunkSize)
  console.log(`  GAS Chunking Analysis: ${numChunks} chunks of 50KB needed for this document!`)
  if (numChunks > 1) {
    console.log(`  Estimated GAS chunk upload time: ~${(numChunks * 1.5).toFixed(1)} seconds (${numChunks} sequential round trips)!`)
  }

  // Stage 3: Measure Kiosk Print Retrieval (Download PDF from cloud at print time)
  console.log(`[Stage 3: Shop Kiosk Retrieval at Release Time] Fetching /api/orders?action=getOrderPdf...`)
  const stage3 = await measureStage('getOrderPdf download', async () => {
    const res = await fetch(`${BACKEND_URL}/api/orders?action=getOrderPdf&orderId=${testOrderId}`, {
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    return buf.byteLength
  })
  console.log(`  Result: ${stage3.ok ? 'SUCCESS' : 'FAILED'} in ${stage3.ms} ms | Downloaded ${(stage3.result / 1024).toFixed(1)} KB`)

  return {
    name,
    pageCount,
    actualPdfBytes,
    b64Ms,
    b64Bytes,
    saveOrderMs: stage1.ms,
    saveOrderBytes: payloadBytes,
    gasChunks: numChunks,
    kioskRetrievalMs: stage3.ms,
  }
}

async function run() {
  const results = []
  results.push(await benchmarkCase('Small Document', 1, 15 * 1024))
  results.push(await benchmarkCase('Medium Document', 5, 250 * 1024))
  results.push(await benchmarkCase('Large Document', 15, 2000 * 1024))
  results.push(await benchmarkCase('Multi-page Scan', 30, 4500 * 1024))

  console.log('\n======================================================')
  console.log('SUMMARY OF CURRENT PIPELINE MEASUREMENTS:')
  console.log('======================================================')
  console.table(results.map(r => ({
    Case: r.name,
    Pages: r.pageCount,
    'PDF Size (KB)': Math.round(r.actualPdfBytes / 1024),
    'B64 Encode (ms)': r.b64Ms,
    'JSON Size (KB)': Math.round(r.saveOrderBytes / 1024),
    'saveOrder (ms)': r.saveOrderMs,
    'GAS Chunks': r.gasChunks,
    'Cloud Download (ms)': r.kioskRetrievalMs,
  })))
}

run()
