import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { savePdfToGridFS, getPdfStreamFromGridFS } from '../api/_lib/gridfs.js'

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

function parseArgs() {
  const args = {}
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=')
      args[key] = val !== undefined ? val : true
    }
  }
  return args
}

async function main() {
  console.log('================================================================')
  console.log('  XBUDDY SECURE ORDER PDF RECOVERY PROCEDURE')
  console.log('================================================================')

  const args = parseArgs()
  const orderId = String(args.orderId || '').trim().toUpperCase()
  const pdfPath = args.pdfPath ? path.resolve(args.pdfPath) : null
  const confirmPayment = Boolean(args.confirmPayment)
  const isDryRun = Boolean(args.dryRun)

  if (!orderId || !/^XB\d{3,}$/i.test(orderId)) {
    console.error('Error: Please specify a valid order ID with --orderId=XBxxxx')
    console.log('\nUsage:')
    console.log('  node scripts/recoverOrderPdf.mjs --orderId=XB3802 --pdfPath="C:/path/to/student.pdf" [--confirmPayment] [--dryRun]')
    process.exit(1)
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error(`Error: PDF file path not provided or does not exist: "${pdfPath}"`)
    console.log('\nRecovery requires the student\'s authentic original PDF document.')
    console.log('Usage:')
    console.log('  node scripts/recoverOrderPdf.mjs --orderId=' + orderId + ' --pdfPath="C:/path/to/student.pdf"')
    process.exit(1)
  }

  // 1. Validate PDF File on disk
  const pdfBuffer = fs.readFileSync(pdfPath)
  if (pdfBuffer.length < 100) {
    console.error('Error: Provided PDF file is empty or corrupted (< 100 bytes).')
    process.exit(1)
  }

  const magic = pdfBuffer.subarray(0, 5).toString('ascii')
  if (magic !== '%PDF-') {
    console.error(`Error: File does not have a valid PDF header. Found "${magic}", expected "%PDF-".`)
    process.exit(1)
  }

  console.log(`\n[PDF Validation] Valid PDF detected:`)
  console.log(`  Source Path: ${pdfPath}`)
  console.log(`  Size:        ${(pdfBuffer.length / (1024 * 1024)).toFixed(2)} MB (${pdfBuffer.length} bytes)`)
  console.log(`  Magic Bytes: ${magic}`)

  // 2. Connect to Authoritative MongoDB Atlas
  console.log('\n[Database] Connecting to authoritative MongoDB Atlas...')
  const { db } = await connectToDatabase()
  const orders = db.collection('orders')

  const orderDoc = await orders.findOne({ orderId }, { projection: { pdfBase64: 0 } })
  if (!orderDoc) {
    console.error(`Error: Order ${orderId} was not found in MongoDB Atlas.`)
    await closeDatabaseConnection()
    process.exit(1)
  }

  console.log(`\n[Order Details] Target order located:`)
  console.log(`  Order ID:       ${orderDoc.orderId}`)
  console.log(`  File Name:      ${orderDoc.fileName}`)
  console.log(`  Pages / Copies: ${orderDoc.totalPages} page(s), ${orderDoc.copies || 1} copy`)
  console.log(`  Amount:         ₹${orderDoc.amount}`)
  console.log(`  Current Status: printStatus="${orderDoc.printStatus}", paymentStatus="${orderDoc.paymentStatus}"`)
  console.log(`  Has PDF:        ${Boolean(orderDoc.hasPdf || orderDoc.hasGridFsPdf)}`)

  // 3. Payment Verification Check
  const normPay = String(orderDoc.paymentStatus || 'pending').trim().toLowerCase()
  const isPaid = ['paid', 'completed'].includes(normPay)

  if (!isPaid && !confirmPayment) {
    console.warn('\n⚠️  PAYMENT NOT VERIFIED:')
    console.warn(`  Current payment status is "${orderDoc.paymentStatus}".`)
    console.warn('  Per XBuddy safety policies, orders must not be released to print queue without payment verification.')
    console.warn('  To confirm payment verification during recovery, pass: --confirmPayment')
    if (!isDryRun) {
      console.log('\nAborting recovery to prevent unverified printing. Run with --confirmPayment if verified.')
      await closeDatabaseConnection()
      process.exit(1)
    }
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Would execute the following actions:')
    console.log(`  1. Upload ${pdfBuffer.length} bytes to GridFS bucket "order_pdfs" as "${orderId}.pdf"`)
    console.log(`  2. Cache PDF locally in .pdf_cache/${orderId}.pdf`)
    console.log(`  3. Update order record in Atlas: hasPdf=true, hasGridFsPdf=true, pdfStorage="gridfs", pdfSize=${pdfBuffer.length}`)
    if (confirmPayment) {
      console.log(`  4. Update paymentStatus="paid"`)
      console.log(`  5. Reset printStatus="waiting_for_shopkeeper" (ready for kiosk release)`)
    }
    await closeDatabaseConnection()
    console.log('\nDry run completed. Zero changes made.')
    return
  }

  // 4. Durably upload PDF to GridFS
  console.log(`\n[GridFS Upload] Storing PDF in MongoDB Atlas GridFS bucket...`)
  const gridFsResult = await savePdfToGridFS(db, orderId, pdfBuffer, {
    fileName: orderDoc.fileName || `${orderId}.pdf`,
    recoveredAt: new Date().toISOString(),
  })
  console.log(`  ✓ Successfully stored in GridFS (fileId: ${gridFsResult.fileId})`)

  // 5. Cache locally to .pdf_cache
  const cacheDir = path.resolve(process.cwd(), '.pdf_cache')
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, `${orderId}.pdf`), pdfBuffer)
  console.log(`  ✓ Cached locally to .pdf_cache/${orderId}.pdf`)

  // 6. Update MongoDB Atlas record
  const updateFields = {
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
    pdfSize: pdfBuffer.length,
    updatedAt: new Date().toISOString(),
    recoveredAt: new Date().toISOString(),
  }

  if (confirmPayment) {
    updateFields.paymentStatus = 'paid'
    updateFields.printStatus = 'waiting_for_shopkeeper'
  } else if (isPaid && String(orderDoc.printStatus || '').toLowerCase() === 'failed') {
    updateFields.printStatus = 'waiting_for_shopkeeper'
  }

  await orders.updateOne({ orderId }, { $set: updateFields })
  console.log(`  ✓ MongoDB order record updated successfully:`, updateFields)

  // 7. Verify retrieval from GridFS
  console.log(`\n[Verification] Testing GridFS streaming retrieval for ${orderId}...`)
  const verifyStream = await getPdfStreamFromGridFS(db, orderId)
  if (verifyStream && verifyStream.file && verifyStream.file.length === pdfBuffer.length) {
    console.log(`  ✓ GridFS verification confirmed: ${verifyStream.file.length} bytes match uploaded size!`)
  } else {
    console.error('  ⚠️  Verification warning: GridFS file length mismatch.')
  }

  await closeDatabaseConnection()

  console.log('\n================================================================')
  console.log(`  SUCCESS: Order ${orderId} has been fully recovered!`)
  console.log('  NOTE: The order has NOT been sent to the physical printer.')
  console.log('  The shopkeeper can now see this order in the Booth queue and')
  console.log('  release it when ready.')
  console.log('================================================================\n')
}

main().catch((err) => {
  console.error('\nFatal Recovery Error:', err)
  process.exit(1)
})
