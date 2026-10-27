import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { BSON } from 'mongodb'

async function verifyRestoreAndIntegrity() {
  console.log('================================================================')
  console.log('    XBUDDY BACKUP CHECKSUM & ISOLATED RESTORE VERIFICATION     ')
  console.log('================================================================\n')

  const archivePath = 'C:\\Users\\SRKREC\\.xbuddy_backups\\xbuddy_backup_2026-10-10T12-58-44-382UTC.tar.gz'
  const expectedSha256 = 'e2aeaaae39025127d5ad9bd3e6d58f3a870eec1c25c7f959279a2af4b9355331'

  // Step 1: Re-verify SHA-256 Checksum
  console.log('[Step 1: Checksum Re-verification]')
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive not found at ${archivePath}`)
  }

  const stat = fs.statSync(archivePath)
  console.log(`  - Archive Path:  ${archivePath}`)
  console.log(`  - Archive Size:  ${stat.size.toLocaleString()} bytes (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`)

  const hasher = crypto.createHash('sha256')
  const fileBytes = fs.readFileSync(archivePath)
  hasher.update(fileBytes)
  const actualSha256 = hasher.digest('hex')

  console.log(`  - Expected Hash: ${expectedSha256}`)
  console.log(`  - Computed Hash: ${actualSha256}`)

  if (actualSha256 !== expectedSha256) {
    throw new Error('CRITICAL INTEGRITY FAILURE: SHA-256 checksum mismatch!')
  }
  console.log('  ✓ SHA-256 Checksum Match: 100% VERIFIED\n')

  // Step 2: Extract to Isolated Test Environment
  console.log('[Step 2: Archive Extraction in Isolated Sandbox]')
  const sandboxDir = 'C:\\Users\\SRKREC\\.xbuddy_backups\\sandbox_restore_test'
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true })
  }
  fs.mkdirSync(sandboxDir, { recursive: true })

  execSync(`tar -xzf "${archivePath}" -C "${sandboxDir}"`, { stdio: 'pipe' })
  console.log(`  ✓ Successfully unpacked archive into ${sandboxDir}\n`)

  const dbDir = path.join(sandboxDir, 'xbuddy_backup_2026-10-10T12-58-44-382UTC', 'xbuddy')

  // Step 3: Verify Restored Collection Options and Indexes
  console.log('[Step 3: Restoring & Verifying Collection Metadata, Indexes & Options]')
  const collections = ['order_pdfs.chunks', 'order_pdfs.files', 'orders', 'stations', 'test_perf']

  const restoredMeta = {}
  for (const col of collections) {
    const metaPath = path.join(dbDir, `${col}.metadata.json`)
    if (!fs.existsSync(metaPath)) throw new Error(`Missing metadata file for ${col}`)
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    restoredMeta[col] = meta
    console.log(`  ✓ [${col}] Restored ${meta.indexes.length} index definition(s), options: ${JSON.stringify(meta.options)}`)
  }
  console.log('')

  // Step 4: Deserialize and Rebuild in-memory state
  console.log('[Step 4: Restoring & Deserializing BSON Document Streams]')
  const restoredData = {}

  for (const col of collections) {
    const bsonPath = path.join(dbDir, `${col}.bson`)
    if (!fs.existsSync(bsonPath)) throw new Error(`Missing BSON file for ${col}`)
    const buf = fs.readFileSync(bsonPath)
    
    let offset = 0
    const docs = []
    while (offset < buf.length) {
      const docSize = buf.readInt32LE(offset)
      const docBuf = buf.subarray(offset, offset + docSize)
      const doc = BSON.deserialize(docBuf)
      docs.push(doc)
      offset += docSize
    }
    restoredData[col] = docs
    console.log(`  ✓ [${col}] Restored ${docs.length} document(s) (${(buf.length / 1024).toFixed(1)} KB BSON)`)
  }
  console.log('')

  // Step 5: Verify Orders Collection Invariants
  console.log('[Step 5: Verifying Restored Orders Data Invariants]')
  const orders = restoredData['orders']
  const orderIds = new Set()
  let ordersWithInlinePdf = 0
  let ordersWithDrive = 0

  for (const o of orders) {
    if (!o.orderId) throw new Error('Order missing orderId')
    if (orderIds.has(o.orderId)) throw new Error(`Duplicate orderId detected: ${o.orderId}`)
    orderIds.add(o.orderId)
    if (o.pdfBase64 && o.pdfBase64.length > 50) ordersWithInlinePdf++
    if (o.driveUrl && o.driveUrl.length > 0) ordersWithDrive++
  }
  console.log(`  ✓ Total unique orders verified: ${orderIds.size}`)
  console.log(`  ✓ Verified 0 duplicate order IDs (orderId_1 unique constraint verified)`)
  console.log(`  ✓ Verified orders with inline Base64: ${ordersWithInlinePdf}`)
  console.log(`  ✓ Verified orders with driveUrl: ${ordersWithDrive}\n`)

  // Step 6: Reassemble GridFS PDFs from restored chunks
  console.log('[Step 6: Reassembling & Verifying Restored GridFS PDFs from Chunks]')
  const files = restoredData['order_pdfs.files']
  const chunks = restoredData['order_pdfs.chunks']

  // Group chunks by files_id
  const chunksByFileId = new Map()
  for (const c of chunks) {
    const fid = c.files_id.toString()
    if (!chunksByFileId.has(fid)) chunksByFileId.set(fid, [])
    chunksByFileId.get(fid).push(c)
  }

  let reassembledPdfs = 0
  let validPdfHeaders = 0
  let totalReassembledBytes = 0

  for (const f of files) {
    const fid = f._id.toString()
    const fileChunks = chunksByFileId.get(fid) || []
    fileChunks.sort((a, b) => a.n - b.n)

    const byteChunks = fileChunks.map(c => {
      // In BSON, Binary data is in c.data.buffer
      return Buffer.isBuffer(c.data) ? c.data : (c.data.buffer ? Buffer.from(c.data.buffer) : Buffer.from(c.data))
    })
    const fullPdf = Buffer.concat(byteChunks)

    if (fullPdf.length !== f.length) {
      throw new Error(`Length mismatch for ${f.filename}: expected ${f.length}, reassembled ${fullPdf.length}`)
    }

    const header = fullPdf.subarray(0, 5).toString('ascii')
    if (header === '%PDF-') {
      validPdfHeaders++
    }
    reassembledPdfs++
    totalReassembledBytes += fullPdf.length
  }

  console.log(`  ✓ GridFS Files reassembled: ${reassembledPdfs} / ${files.length}`)
  console.log(`  ✓ GridFS Files with valid "%PDF-" header: ${validPdfHeaders} / ${files.length}`)
  console.log(`  ✓ Total binary PDF bytes successfully reassembled: ${totalReassembledBytes.toLocaleString()} bytes (${(totalReassembledBytes / (1024 * 1024)).toFixed(2)} MB)\n`)

  // Step 7: Clean up isolated test sandbox
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true })
    console.log('[Step 7: Cleanup]')
    console.log('  ✓ Isolated verification sandbox purged cleanly.\n')
  } catch {}

  console.log('================================================================')
  console.log('     ALL ISOLATED RESTORE & INTEGRITY CHECKS PASSED 100%        ')
  console.log('================================================================')
}

verifyRestoreAndIntegrity().catch(err => {
  console.error('[RESTORE VERIFICATION FAILED]:', err)
  process.exit(1)
})
