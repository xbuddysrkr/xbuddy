import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'
import crypto from 'crypto'

async function createPdf(sizeBytes) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('Sprint 2 Optimization Test PDF', { x: 50, y: 800, size: 14, font, color: rgb(0.1, 0.1, 0.1) })
  const baseBytes = await doc.save()
  if (baseBytes.length < sizeBytes) {
    const padding = Buffer.alloc(sizeBytes - baseBytes.length, '% PADDING FOR SPRINT 2 TEST\n')
    return Buffer.concat([Buffer.from(baseBytes), padding])
  }
  return Buffer.from(baseBytes)
}

async function testSubmission(sizeLabel, sizeBytes, useMultipart = true) {
  console.log(`\n======================================================`)
  console.log(`Testing ${sizeLabel} (${sizeBytes} bytes) - Mode: ${useMultipart ? 'BINARY MULTIPART' : 'JSON BASE64'}`)
  const pdfBuf = await createPdf(sizeBytes)
  const originalHash = crypto.createHash('sha256').update(pdfBuf).digest('hex')
  const orderId = `XB${Math.floor(1000 + Math.random() * 8999)}`

  let reqOptions = {}
  const tStart = performance.now()

  if (useMultipart) {
    const formData = new FormData()
    formData.append('action', 'saveOrder')
    formData.append('orderId', orderId)
    formData.append('name', '9876543210')
    formData.append('fileName', `${orderId}_test.pdf`)
    formData.append('copies', '1')
    formData.append('amount', '10')
    formData.append('colorMode', 'bw')
    formData.append('printType', 'B&W')
    formData.append('printSide', 'Single')
    formData.append('duplex', 'false')
    formData.append('pageSize', 'A4')
    formData.append('paperSize', 'A4')
    formData.append('totalPages', '1')
    formData.append('printableCount', '1')
    formData.append('selectedPageCount', '1')
    formData.append('transactionId', `TXN_${Date.now()}`)
    const blob = new Blob([pdfBuf], { type: 'application/pdf' })
    formData.append('file', blob, `${orderId}_test.pdf`)

    reqOptions = {
      method: 'POST',
      body: formData,
    }
  } else {
    const b64 = pdfBuf.toString('base64')
    reqOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveOrder',
        orderId,
        name: '9876543210',
        fileName: `${orderId}_test.pdf`,
        copies: 1,
        amount: 10,
        colorMode: 'bw',
        printType: 'B&W',
        printSide: 'Single',
        duplex: false,
        pageSize: 'A4',
        paperSize: 'A4',
        totalPages: 1,
        printableCount: 1,
        selectedPageCount: 1,
        transactionId: `TXN_${Date.now()}`,
        pdfBase64: b64,
      }),
    }
  }

  const res = await fetch('http://127.0.0.1:3000/api/orders', reqOptions)
  const rttMs = Math.round(performance.now() - tStart)
  const data = await res.json()

  console.log(`HTTP Status: ${res.status} | Success: ${data.success}`)
  console.log(`Total RTT: ${rttMs} ms`)
  if (data.timings) {
    console.log(`Server Timings: Val=${data.timings.validationMs}ms, Dec=${data.timings.decodeMs}ms, GridFS=${data.timings.gridFsMs}ms, Cache=${data.timings.diskCacheMs}ms, MongoInsert=${data.timings.mongoInsertMs}ms, ServerTotal=${data.timings.serverTotalMs}ms`)
  }

  // Verify Download & Byte Fidelity
  const tDownStart = performance.now()
  const downRes = await fetch(`http://127.0.0.1:3000/api/orders?action=getOrderPdf&orderId=${orderId}`)
  const downBuf = Buffer.from(await downRes.arrayBuffer())
  const downMs = Math.round(performance.now() - tDownStart)
  const downHash = crypto.createHash('sha256').update(downBuf).digest('hex')
  const fidelity = (downBuf.length === pdfBuf.length && downHash === originalHash)

  console.log(`Download: ${downMs} ms | Bytes: ${downBuf.length} | SHA-256 Match: ${fidelity ? '✓ PASS' : '✗ FAIL'}`)
  if (!fidelity) {
    throw new Error(`Integrity mismatch on order ${orderId}! Expected ${originalHash}, got ${downHash}`)
  }
}

async function run() {
  // Test 1: 1 MB via binary multipart
  await testSubmission('1 MB', 1024 * 1024, true)
  // Test 2: 1 MB via JSON Base64 (verify our MongoInsert fix works here too)
  await testSubmission('1 MB', 1024 * 1024, false)
  // Test 3: 3 MB via binary multipart
  await testSubmission('3 MB', 3 * 1024 * 1024, true)
  // Test 4: 4 MB via binary multipart
  await testSubmission('4 MB', 4 * 1024 * 1024, true)
  console.log('\nALL LOCAL SPRINT 2 TESTS PASSED PERFECTLY!')
}

run().catch(console.error)
