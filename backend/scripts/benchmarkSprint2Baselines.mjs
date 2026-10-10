import { PDFDocument, rgb, StandardFonts } from '../../frontend/node_modules/pdf-lib/cjs/index.js'
import crypto from 'crypto'
import { connectToDatabase } from '../api/_lib/mongodb.js'
import { getGridFSBucket } from '../api/_lib/gridfs.js'

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
    page.drawText(`XBuddy Sprint 2 Benchmark - Page ${i} of ${pageCount}`, {
      x: 50,
      y: 800,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    page.drawText(`Synthetic test payload for benchmarking multi-size PDF pipeline latency.`, {
      x: 50,
      y: 770,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  const baseBytes = await doc.save()
  if (baseBytes.length < targetBytes) {
    const paddingNeeded = targetBytes - baseBytes.length
    const padding = Buffer.alloc(paddingNeeded, '% XBUDDY SYNTHETIC PADDING FOR CONTROLLED SPRINT 2 BENCHMARKING\n')
    return Buffer.concat([Buffer.from(baseBytes), padding])
  }
  return Buffer.from(baseBytes)
}

async function runBaselineBenchmark() {
  console.log('================================================================')
  console.log('  XBUDDY SPRINT 2: BASELINE BENCHMARK (1MB, 3MB, 4MB, 8MB)     ')
  console.log('================================================================\n')

  const { db } = await connectToDatabase()
  const bucket = getGridFSBucket(db)
  const results = []

  for (const s of SIZES) {
    console.log(`----------------------------------------------------------------`)
    console.log(`>> Generating ${s.label} Synthetic PDF (${s.bytes} bytes)...`)
    const t0 = performance.now()
    const pdfBuf = await createSyntheticPdf(s.bytes, s.pages)
    const prepMs = Math.round(performance.now() - t0)
    const exactBytes = pdfBuf.length
    const originalHash = crypto.createHash('sha256').update(pdfBuf).digest('hex')

    // Base64 encode
    const tB64 = performance.now()
    const b64 = pdfBuf.toString('base64')
    const b64Ms = Math.round(performance.now() - tB64)
    const b64Bytes = Buffer.byteLength(b64, 'utf8')
    const inflationPct = Math.round(((b64Bytes / exactBytes) - 1) * 100)

    console.log(`   Prep: ${prepMs} ms | Base64: ${b64Ms} ms | Payload Size: ${(b64Bytes / (1024 * 1024)).toFixed(3)} MB (+${inflationPct}%)`)

    // We benchmark both Local Server and Production (Render & Vercel)
    const testTargets = [
      { name: 'Local Server (Atlas DB)', url: 'http://127.0.0.1:3000' },
      { name: 'Render Production Direct', url: 'https://xbuddy.onrender.com' },
      { name: 'Vercel Production Proxy', url: 'https://xbuddysrkr.vercel.app' },
    ]

    for (const target of testTargets) {
      console.log(`\n   [Testing on ${target.name}]`)
      const orderId = `XB${Math.floor(1000 + Math.random() * 8999)}`
      const orderPayload = {
        action: 'saveOrder',
        orderId,
        name: 'Sprint 2 Baseline Test',
        fileName: `bench_${s.label.replace(' ', '')}.pdf`,
        totalPages: s.pages,
        copies: 1,
        colorMode: 'bw',
        printType: 'B&W',
        printSide: 'Single',
        duplex: false,
        pageSize: 'A4',
        paperSize: 'A4',
        orientation: 'portrait',
        amount: s.pages * 2,
        printingCost: s.pages * 2,
        serviceFee: 2,
        digitalProcessingFee: 2,
        transactionId: `TXN_S2_${Date.now()}`,
        pageRange: 'all',
        pageRangeMode: 'all',
        customPages: '',
        printableCount: s.pages,
        selectedPages: [],
        selectedPageCount: s.pages,
        printStatus: 'waiting_for_shopkeeper',
        paymentStatus: 'pending',
        pdfBase64: b64,
      }

      const tJson = performance.now()
      const payloadString = JSON.stringify(orderPayload)
      const jsonMs = Math.round(performance.now() - tJson)
      const totalPayloadBytes = Buffer.byteLength(payloadString, 'utf8')

      // Submit Order
      const tSubmit = performance.now()
      let submitRes = null
      let submitData = null
      let httpStatus = null
      let errorMsg = null

      try {
        submitRes = await fetch(`${target.url}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadString,
          signal: AbortSignal.timeout(120000), // 2 min timeout for 8MB
        })
        httpStatus = submitRes.status
        const text = await submitRes.text()
        try {
          submitData = JSON.parse(text)
        } catch {
          submitData = { raw: text.slice(0, 300) }
        }
      } catch (err) {
        errorMsg = err.message
      }
      const totalRoundTripMs = Math.round(performance.now() - tSubmit)

      const success = submitData?.success && submitData?.mongoSaved
      console.log(`      * Status: ${httpStatus} | Success: ${success} | Total RTT: ${totalRoundTripMs} ms`)
      if (errorMsg) console.log(`      * Error: ${errorMsg}`)
      if (submitData?.error) console.log(`      * Error details: ${submitData.error}`)

      let serverTimings = submitData?.timings || null
      if (serverTimings) {
        console.log(`      * Server Breakdown: Validation=${serverTimings.validationMs}ms, GridFS=${serverTimings.gridFsMs}ms, MongoInsert=${serverTimings.mongoInsertMs}ms, TotalServer=${serverTimings.serverTotalMs}ms`)
      }

      // Verify Byte Fidelity if successful
      let fidelityOk = false
      let downloadMs = 0
      if (success) {
        const tDl = performance.now()
        const dlRes = await fetch(`${target.url}/api/orders?action=getOrderPdf&orderId=${orderId}`, {
          signal: AbortSignal.timeout(60000),
        })
        const dlBytes = await dlRes.arrayBuffer()
        downloadMs = Math.round(performance.now() - tDl)
        const dlBuf = Buffer.from(dlBytes)
        const dlHash = crypto.createHash('sha256').update(dlBuf).digest('hex')
        fidelityOk = (dlBuf.length === exactBytes && dlHash === originalHash)
        console.log(`      * Byte Fidelity: ${fidelityOk ? '✓ 100% IDENTICAL' : '✗ MISMATCH'} (Download: ${downloadMs} ms)`)
      }

      // Cleanup test order from Atlas
      const files = await bucket.find({ filename: `${orderId}.pdf` }).toArray()
      for (const f of files) {
        await bucket.delete(f._id).catch(() => {})
      }
      await db.collection('orders').deleteOne({ orderId }).catch(() => {})

      results.push({
        size: s.label,
        rawBytes: exactBytes,
        b64Bytes,
        target: target.name,
        httpStatus,
        success,
        totalRoundTripMs,
        serverTotalMs: serverTimings?.serverTotalMs || 'N/A',
        gridFsMs: serverTimings?.gridFsMs || 'N/A',
        downloadMs: success ? downloadMs : 'N/A',
        fidelityOk,
      })
    }
  }

  console.log('\n================================================================')
  console.log('              SUMMARY OF CURRENT BASELINES                     ')
  console.log('================================================================')
  console.table(results)

  process.exit(0)
}

runBaselineBenchmark().catch(err => {
  console.error('Benchmark error:', err)
  process.exit(1)
})
