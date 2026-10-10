import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'
import crypto from 'crypto'

const SIZES = [
  { label: '1 MB', bytes: 1 * 1024 * 1024, pages: 5 },
  { label: '3 MB', bytes: 3 * 1024 * 1024, pages: 10 },
  { label: '4 MB', bytes: 4 * 1024 * 1024, pages: 15 },
  { label: '8 MB', bytes: 8 * 1024 * 1024, pages: 25 },
]

async function createSyntheticPdf(targetBytes, pageCount) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Sprint 2 Performance Verification - Page ${i}`, { x: 50, y: 800, size: 14, font, color: rgb(0.1, 0.1, 0.1) })
  }
  const baseBytes = await doc.save()
  if (baseBytes.length < targetBytes) {
    const padding = Buffer.alloc(targetBytes - baseBytes.length, '% XBUDDY BENCHMARK PADDING\n')
    return Buffer.concat([Buffer.from(baseBytes), padding])
  }
  return Buffer.from(baseBytes)
}

async function runBenchmarkCase(s, mode) {
  const isMultipart = mode === 'multipart'
  const pdfBuf = await createSyntheticPdf(s.bytes, s.pages)
  const exactBytes = pdfBuf.length
  const originalHash = crypto.createHash('sha256').update(pdfBuf).digest('hex')
  const orderId = `XB${Math.floor(1000 + Math.random() * 8999)}`

  let reqOptions = {}
  let bytesTransferred = 0
  const tUploadStart = performance.now()

  if (isMultipart) {
    const formData = new FormData()
    formData.append('action', 'saveOrder')
    formData.append('orderId', orderId)
    formData.append('name', '9876543210')
    formData.append('fileName', `Test_${s.label}.pdf`)
    formData.append('copies', '1')
    formData.append('amount', '20')
    formData.append('colorMode', 'bw')
    formData.append('printType', 'B&W')
    formData.append('printSide', 'Single')
    formData.append('duplex', 'false')
    formData.append('pageSize', 'A4')
    formData.append('paperSize', 'A4')
    formData.append('totalPages', String(s.pages))
    formData.append('printableCount', String(s.pages))
    formData.append('selectedPageCount', String(s.pages))
    formData.append('transactionId', `TXN_${Date.now()}`)
    const blob = new Blob([pdfBuf], { type: 'application/pdf' })
    formData.append('file', blob, `Test_${s.label}.pdf`)
    bytesTransferred = exactBytes // binary transfer exact payload

    reqOptions = {
      method: 'POST',
      body: formData,
    }
  } else {
    const b64 = pdfBuf.toString('base64')
    const bodyStr = JSON.stringify({
      action: 'saveOrder',
      orderId,
      name: '9876543210',
      fileName: `Test_${s.label}.pdf`,
      copies: 1,
      amount: 20,
      colorMode: 'bw',
      printType: 'B&W',
      printSide: 'Single',
      duplex: false,
      pageSize: 'A4',
      paperSize: 'A4',
      totalPages: s.pages,
      printableCount: s.pages,
      selectedPageCount: s.pages,
      transactionId: `TXN_${Date.now()}`,
      pdfBase64: b64,
    })
    bytesTransferred = Buffer.byteLength(bodyStr, 'utf8')
    reqOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    }
  }

  const res = await fetch('http://127.0.0.1:3000/api/orders', reqOptions)
  const totalRTT = Math.round(performance.now() - tUploadStart)
  const data = await res.json()

  // Verify Download & Byte Fidelity
  const tDownStart = performance.now()
  const downRes = await fetch(`http://127.0.0.1:3000/api/orders?action=getOrderPdf&orderId=${orderId}`)
  const downBuf = Buffer.from(await downRes.arrayBuffer())
  const downloadMs = Math.round(performance.now() - tDownStart)
  const downHash = crypto.createHash('sha256').update(downBuf).digest('hex')
  const fidelityOk = (downBuf.length === exactBytes && downHash === originalHash)

  return {
    size: s.label,
    mode: isMultipart ? 'Binary Multipart' : 'JSON Base64',
    rawBytes: exactBytes,
    wireBytes: bytesTransferred,
    wireDiff: isMultipart ? '0% (Binary)' : `+${Math.round(((bytesTransferred / exactBytes) - 1) * 100)}%`,
    totalRTT,
    serverTotal: data?.timings?.serverTotalMs || totalRTT,
    gridFsMs: data?.timings?.gridFsMs || 0,
    mongoInsertMs: data?.timings?.mongoInsertMs || 0,
    downloadMs,
    fidelityOk,
    orderId,
  }
}

async function run() {
  console.log('================================================================')
  console.log('      XBUDDY SPRINT 2: PERFORMANCE VERIFICATION BENCHMARK       ')
  console.log('================================================================\n')

  const results = []
  for (const s of SIZES) {
    console.log(`\n>> Benchmarking ${s.label} (${s.bytes} bytes)...`)
    // Run binary multipart trial
    console.log(`   Running Binary Multipart Trial...`)
    const resMp = await runBenchmarkCase(s, 'multipart')
    console.log(`   ✓ Multipart: RTT=${resMp.totalRTT}ms, GridFS=${resMp.gridFsMs}ms, MongoInsert=${resMp.mongoInsertMs}ms, Download=${resMp.downloadMs}ms, SHA256=${resMp.fidelityOk ? 'MATCH' : 'MISMATCH'}`)
    results.push(resMp)

    // Run JSON Base64 trial for comparison
    console.log(`   Running JSON Base64 Trial...`)
    const resB64 = await runBenchmarkCase(s, 'json')
    console.log(`   ✓ JSON Base64: RTT=${resB64.totalRTT}ms, GridFS=${resB64.gridFsMs}ms, MongoInsert=${resB64.mongoInsertMs}ms, Download=${resB64.downloadMs}ms, SHA256=${resB64.fidelityOk ? 'MATCH' : 'MISMATCH'}`)
    results.push(resB64)
  }

  console.log('\n================================================================')
  console.log('            SPRINT 2 PERFORMANCE COMPARISON TABLE               ')
  console.log('================================================================')
  console.table(results.map(r => ({
    Size: r.size,
    Protocol: r.mode,
    'Wire Bytes': `${(r.wireBytes / (1024 * 1024)).toFixed(2)} MB (${r.wireDiff})`,
    'Total RTT': `${r.totalRTT} ms`,
    'Server Total': `${r.serverTotal} ms`,
    GridFS: `${r.gridFsMs} ms`,
    'Mongo Insert': `${r.mongoInsertMs} ms`,
    Download: `${r.downloadMs} ms`,
    'Byte Fidelity': r.fidelityOk ? '100% IDENTICAL' : 'FAILED',
  })))
}

run().catch(console.error)
