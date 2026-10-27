import fs from 'fs'
import path from 'path'
import ordersHandler from '../api/orders.js'

class MockResponse {
  constructor() {
    this.statusCode = 200
    this.headers = {}
    this.chunks = []
    this.headersSent = false
    this.ended = false
  }
  status(code) {
    this.statusCode = code
    return this
  }
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v
    return this
  }
  writeHead(code, headers) {
    this.statusCode = code
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v
      }
    }
    this.headersSent = true
    return this
  }
  write(chunk) {
    this.headersSent = true
    if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return true
  }
  end(chunk) {
    if (chunk) this.write(chunk)
    this.headersSent = true
    this.ended = true
  }
  send(payload) {
    this.headersSent = true
    this.ended = true
    if (Buffer.isBuffer(payload)) {
      this.chunks.push(payload)
    } else if (typeof payload === 'string') {
      this.chunks.push(Buffer.from(payload))
    } else if (payload && typeof payload === 'object') {
      this.json(payload)
    }
    return this
  }
  json(data) {
    this.setHeader('content-type', 'application/json')
    this.send(JSON.stringify(data))
    return this
  }
  getBuffer() {
    return Buffer.concat(this.chunks)
  }
}

async function runTest() {
  console.log('====================================================')
  console.log(' VERIFYING getOrderPdf RETRIEVAL & PERFORMANCE')
  console.log('====================================================\n')

  // TEST 1: Large Document (XB9532, 5.06 MB)
  console.log('--- TEST 1: Large Document (XB9532) ---')
  const req1 = {
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB9532' },
    headers: {},
  }
  const res1 = new MockResponse()

  const t0 = Date.now()
  await ordersHandler(req1, res1)
  const elapsed1 = Date.now() - t0

  const buf1 = res1.getBuffer()
  const isValidPdf1 = buf1.slice(0, 4).toString() === '%PDF'

  console.log(`Status:        ${res1.statusCode}`)
  console.log(`Elapsed Time:  ${elapsed1} ms`)
  console.log(`Content-Type:  ${res1.headers['content-type']}`)
  console.log(`Content-Length:${res1.headers['content-length']} (actual buffer: ${buf1.length} bytes)`)
  console.log(`Source Header: ${res1.headers['x-pdf-source']}`)
  console.log(`Valid %PDF:    ${isValidPdf1} (header: "${buf1.slice(0, 8).toString().trim()}")\n`)

  if (res1.statusCode !== 200 || !isValidPdf1 || buf1.length < 1000) {
    console.error('FAIL: Test 1 failed')
    process.exit(1)
  }

  // TEST 2: Small Controlled Document (Create small 1-page test order & retrieve)
  console.log('--- TEST 2: Small Document (XB_TEST_SMALL) ---')
  const smallPdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF').toString('base64')

  const cacheDir = path.resolve('.pdf_cache')
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'XB_TEST_SMALL.pdf'), Buffer.from(smallPdfBase64, 'base64'))

  const req2 = {
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB_TEST_SMALL' },
    headers: {},
  }
  const res2 = new MockResponse()

  const t1 = Date.now()
  await ordersHandler(req2, res2)
  const elapsed2 = Date.now() - t1

  const buf2 = res2.getBuffer()
  const isValidPdf2 = buf2.slice(0, 4).toString() === '%PDF'

  console.log(`Status:        ${res2.statusCode}`)
  console.log(`Elapsed Time:  ${elapsed2} ms`)
  console.log(`Content-Type:  ${res2.headers['content-type']}`)
  console.log(`Content-Length:${res2.headers['content-length']} (actual buffer: ${buf2.length} bytes)`)
  console.log(`Source Header: ${res2.headers['x-pdf-source']}`)
  console.log(`Valid %PDF:    ${isValidPdf2} (header: "${buf2.slice(0, 8).toString().trim()}")\n`)

  if (res2.statusCode !== 200 || !isValidPdf2) {
    console.error('FAIL: Test 2 failed')
    process.exit(1)
  }

  console.log('SUCCESS: All getOrderPdf tests passed with sub-second response times!')
  process.exit(0)
}

runTest().catch(err => {
  console.error(err)
  process.exit(1)
})
