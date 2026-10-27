import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import dotenv from 'dotenv'
import path from 'path'
import { MongoClient } from 'mongodb'

dotenv.config({ path: path.resolve('backend/.env') })

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI not set')
  process.exit(1)
}

async function inspectOrder(orderId) {
  console.log(`\n======================================================`)
  console.log(`INSPECTING ORDER IN MONGODB ATLAS: ${orderId}`)
  console.log(`======================================================`)

  const client = new MongoClient(uri)
  const tConn = performance.now()
  await client.connect()
  const connMs = Math.round(performance.now() - tConn)
  console.log(`[Stage 0: Connection] Connected to Atlas in ${connMs}ms`)

  const db = client.db('xbuddy')
  const orders = db.collection('orders')

  // Stage 1: Lookup excluding pdfBase64
  const tLookup = performance.now()
  const metaDoc = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
  const lookupMs = Math.round(performance.now() - tLookup)
  console.log(`[Stage 1: Metadata Lookup (excl pdfBase64)] Duration: ${lookupMs}ms`)
  if (!metaDoc) {
    console.log(`Document ${orderId} DOES NOT EXIST in MongoDB!`)
    await client.close()
    return
  }

  console.log('Document Metadata:')
  console.log(`  - orderId:       ${metaDoc.orderId}`)
  console.log(`  - fileName:      ${metaDoc.fileName}`)
  console.log(`  - printStatus:   ${metaDoc.printStatus}`)
  console.log(`  - paymentStatus: ${metaDoc.paymentStatus}`)
  console.log(`  - amount:        ${metaDoc.amount}`)
  console.log(`  - copies:        ${metaDoc.copies}`)
  console.log(`  - pageRange:     ${metaDoc.pageRange}`)
  console.log(`  - driveUrl:      ${metaDoc.driveUrl || '(none)'}`)
  console.log(`  - createdAt:     ${metaDoc.createdAt}`)
  console.log(`  - claimedAt:     ${metaDoc.claimedAt || '(none)'}`)
  console.log(`  - claimedBy:     ${metaDoc.claimedBy || '(none)'}`)

  // Stage 2: Retrieve full document INCLUDING pdfBase64
  const tFull = performance.now()
  const fullDoc = await orders.findOne({ orderId }, { projection: { pdfBase64: 1, driveUrl: 1, fileName: 1 } })
  const fullFetchMs = Math.round(performance.now() - tFull)
  console.log(`[Stage 2: Full Document Retrieval (with pdfBase64)] Duration: ${fullFetchMs}ms`)

  const hasB64 = typeof fullDoc?.pdfBase64 === 'string' && fullDoc.pdfBase64.length > 0
  const b64Length = hasB64 ? fullDoc.pdfBase64.length : 0
  console.log(`  - pdfBase64 present: ${hasB64}`)
  console.log(`  - pdfBase64 length:  ${b64Length.toLocaleString()} characters (~${(b64Length / (1024 * 1024)).toFixed(2)} MB)`)

  // Stage 3: Base64 decode to binary buffer
  let decodedBuffer = null
  let decodeMs = 0
  if (hasB64) {
    const tDecode = performance.now()
    decodedBuffer = Buffer.from(fullDoc.pdfBase64, 'base64')
    decodeMs = Math.round(performance.now() - tDecode)
    console.log(`[Stage 3: Base64 Decode] Duration: ${decodeMs}ms`)
    console.log(`  - Decoded Buffer size: ${decodedBuffer.length.toLocaleString()} bytes (~${(decodedBuffer.length / 1024).toFixed(1)} KB)`)

    // Verify PDF header and trailer
    const header = decodedBuffer.slice(0, 10).toString('utf8')
    const isPdfHeader = header.startsWith('%PDF-')
    const tail = decodedBuffer.slice(-64).toString('utf8')
    const hasEof = tail.includes('%%EOF')
    console.log(`  - PDF Header: "${header.trim()}" (valid=%PDF-: ${isPdfHeader})`)
    console.log(`  - PDF Trailer has %%EOF: ${hasEof}`)
  }

  // Stage 4: Test HTTP request to Render and Vercel for this order
  console.log('\n--- TESTING LIVE CLOUD HTTP PDF ENDPOINTS ---')
  for (const baseUrl of ['https://xbuddy.onrender.com', 'https://xbuddysrkr.vercel.app']) {
    const url = `${baseUrl}/api/orders?action=getOrderPdf&orderId=${orderId}`
    console.log(`Testing GET ${url}...`)
    const tReq = performance.now()
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(25000),
      })
      const headersMs = Math.round(performance.now() - tReq)
      console.log(`  -> Time to headers: ${headersMs}ms | Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | Content-Length: ${res.headers.get('content-length')}`)
      const bodyBuf = await res.arrayBuffer()
      const totalMs = Math.round(performance.now() - tReq)
      console.log(`  -> Full response time: ${totalMs}ms | Downloaded bytes: ${bodyBuf.byteLength}`)
      const textPreview = Buffer.from(bodyBuf.slice(0, 50)).toString('utf8')
      console.log(`  -> Body start: "${textPreview.replace(/[\r\n]+/g, ' ')}"`)
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - tReq)
      console.log(`  -> FAILED/TIMEOUT after ${elapsedMs}ms: ${err.name} - ${err.message}`)
    }
  }

  await client.close()
}

async function main() {
  await inspectOrder('XB9532')
  await inspectOrder('XB4611')
}

main().catch(err => {
  console.error('Diagnostic error:', err)
  process.exit(1)
})
