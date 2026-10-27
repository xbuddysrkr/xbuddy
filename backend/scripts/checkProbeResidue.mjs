import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import fs from 'fs'
import path from 'path'
import dns from 'dns'

try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (_) {}

async function checkProbeResidue() {
  const { db } = await connectToDatabase()
  
  // 1. Check orders collection
  const orderDoc = await db.collection('orders').findOne({ orderId: 'XB5625' })

  // 2. Check GridFS files collection
  const gridFsFiles = await db.collection('order_pdfs.files').find({
    $or: [
      { 'metadata.orderId': 'XB5625' },
      { filename: 'XB5625.pdf' },
      { filename: 'XB5625_probe.pdf' },
    ]
  }).toArray()

  // 3. Check GridFS chunks collection
  let chunksCount = 0
  if (gridFsFiles.length > 0) {
    const fileIds = gridFsFiles.map(f => f._id)
    chunksCount = await db.collection('order_pdfs.chunks').countDocuments({ files_id: { $in: fileIds } })
  }

  // 4. Check local disk cache
  const cachePath = path.resolve('.pdf_cache', 'XB5625.pdf')
  const cacheExists = fs.existsSync(cachePath)

  console.log('================================================================')
  console.log('            PROBE XB5625 CLEANUP VERIFICATION REPORT            ')
  console.log('================================================================')
  console.log(`  - orders collection:       ${orderDoc ? 'RESIDUE DETECTED' : 'CLEAN (0 documents found)'}`)
  console.log(`  - order_pdfs.files:        ${gridFsFiles.length > 0 ? 'RESIDUE DETECTED' : 'CLEAN (0 files found)'}`)
  console.log(`  - order_pdfs.chunks:       ${chunksCount > 0 ? 'RESIDUE DETECTED' : 'CLEAN (0 chunks found)'}`)
  console.log(`  - Local disk cache:        ${cacheExists ? 'RESIDUE DETECTED' : 'CLEAN (0 cache files found)'}`)
  console.log(`\nOVERALL PROBE CLEANUP: ${(!orderDoc && gridFsFiles.length === 0 && chunksCount === 0 && !cacheExists) ? '100% COMPLETE & VERIFIED CLEAN' : 'INCOMPLETE'}`)
  console.log('================================================================')

  await closeDatabaseConnection()
}

checkProbeResidue().catch(err => {
  console.error(err)
  process.exit(1)
})
