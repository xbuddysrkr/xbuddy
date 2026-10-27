import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import fs from 'fs'
import path from 'path'

async function runAudit() {
  console.log('================================================================')
  console.log('   XBUDDY PRE-LAUNCH DATABASE AUDIT (NON-DESTRUCTIVE READ-ONLY)  ')
  console.log('================================================================\n')

  const { client, db } = await connectToDatabase()

  // 1. Target Cluster & Database identification (sanitized)
  const uri = process.env.MONGODB_URI || ''
  let sanitizedCluster = 'Unknown Cluster'
  try {
    const match = uri.match(/@([^/?]+)/)
    if (match) {
      sanitizedCluster = match[1]
    }
  } catch {}

  console.log('[Step 1.1: Target Connection Verification]')
  console.log(`  - Target Host / Cluster: ${sanitizedCluster}`)
  console.log(`  - Target Database Name:  ${db.databaseName}`)
  console.log(`  - Read-Only Mode:        ENFORCED\n`)

  // 2. Collection Enumeration & Inventory
  console.log('[Step 1.2: Database Collection Inventory]')
  const collectionsInfo = await db.listCollections().toArray()
  const collectionNames = collectionsInfo.map(c => c.name).sort()
  console.log(`  Found ${collectionNames.length} collection(s) in "${db.databaseName}":`)

  const inventory = []

  for (const colInfo of collectionsInfo) {
    const name = colInfo.name
    const col = db.collection(name)
    const count = await col.countDocuments()
    const indexes = await col.indexes()
    
    // Sample 1 document to check schema without outputting PII
    const sample = await col.findOne({}, { projection: { _id: 1, type: 1, action: 1, orderId: 1, createdAt: 1 } })
    const sampleKeys = sample ? Object.keys(await col.findOne({}) || {}) : []

    inventory.push({
      name,
      type: colInfo.type || 'collection',
      options: colInfo.options || {},
      count,
      indexes: indexes.map(idx => ({ name: idx.name, key: idx.key, unique: Boolean(idx.unique) })),
      sampleKeys,
    })

    console.log(`  • ${name.padEnd(24)}: ${count.toString().padStart(6)} doc(s) | ${indexes.length} index(es)`)
  }
  console.log('')

  // 3. Orders Collection Deep Breakdown
  console.log('[Step 1.3: Canonical Orders Analysis]')
  const ordersCol = db.collection('orders')
  const totalOrders = await ordersCol.countDocuments()
  console.log(`  - Total Orders: ${totalOrders}`)

  // Aggregation by printStatus
  const byPrintStatus = await ordersCol.aggregate([
    { $group: { _id: '$printStatus', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()
  console.log('  - By printStatus:')
  for (const item of byPrintStatus) {
    console.log(`      * "${item._id || 'null/undefined'}": ${item.count}`)
  }

  // Aggregation by paymentStatus
  const byPaymentStatus = await ordersCol.aggregate([
    { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()
  console.log('  - By paymentStatus:')
  for (const item of byPaymentStatus) {
    console.log(`      * "${item._id || 'null/undefined'}": ${item.count}`)
  }

  // Cross-tabulation (printStatus x paymentStatus)
  const crossTab = await ordersCol.aggregate([
    { $group: { _id: { print: '$printStatus', pay: '$paymentStatus' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()
  console.log('  - Cross Breakdown (printStatus x paymentStatus):')
  for (const item of crossTab) {
    console.log(`      * printStatus="${item._id.print || 'null'}", paymentStatus="${item._id.pay || 'null'}": ${item.count}`)
  }

  // Inline Base64 and Drive URL counts
  const inlineBase64Count = await ordersCol.countDocuments({ pdfBase64: { $exists: true, $ne: '' } })
  const hasDriveUrlCount = await ordersCol.countDocuments({ driveUrl: { $exists: true, $ne: '' } })
  const hasGridFsFlagCount = await ordersCol.countDocuments({ hasGridFsPdf: true })
  console.log(`  - Orders with inline pdfBase64: ${inlineBase64Count}`)
  console.log(`  - Orders with driveUrl:        ${hasDriveUrlCount}`)
  console.log(`  - Orders with hasGridFsPdf:    ${hasGridFsFlagCount}\n`)

  // 4. GridFS Analysis (order_pdfs)
  console.log('[Step 1.4: GridFS Storage Analysis (order_pdfs)]')
  const filesCol = db.collection('order_pdfs.files')
  const chunksCol = db.collection('order_pdfs.chunks')

  const totalGridFsFiles = await filesCol.countDocuments()
  const totalGridFsChunks = await chunksCol.countDocuments()

  const bytesAgg = await filesCol.aggregate([
    { $group: { _id: null, totalBytes: { $sum: '$length' } } }
  ]).toArray()
  const totalGridFsBytes = bytesAgg[0]?.totalBytes || 0

  console.log(`  - Total GridFS Files (order_pdfs.files):   ${totalGridFsFiles}`)
  console.log(`  - Total GridFS Chunks (order_pdfs.chunks): ${totalGridFsChunks}`)
  console.log(`  - Total Stored PDF Bytes in GridFS:        ${totalGridFsBytes.toLocaleString()} bytes (${(totalGridFsBytes / (1024 * 1024)).toFixed(2)} MB)`)

  // Orphaned GridFS files check
  const allOrderDocs = await ordersCol.find({}, { projection: { orderId: 1 } }).toArray()
  const orderIdSet = new Set(allOrderDocs.map(o => o.orderId))

  const allGridFsFiles = await filesCol.find({}, { projection: { filename: 1, 'metadata.orderId': 1 } }).toArray()
  let orphanedGridFsFiles = 0
  for (const f of allGridFsFiles) {
    const oid = f.metadata?.orderId || f.filename?.replace('.pdf', '')
    if (!orderIdSet.has(oid)) {
      orphanedGridFsFiles++
    }
  }

  let ordersMissingGridFs = 0
  const gridFsOrderIdSet = new Set(allGridFsFiles.map(f => f.metadata?.orderId || f.filename?.replace('.pdf', '')))
  for (const o of allOrderDocs) {
    if (!gridFsOrderIdSet.has(o.orderId)) {
      ordersMissingGridFs++
    }
  }

  console.log(`  - Orphaned GridFS files (file without matching order): ${orphanedGridFsFiles}`)
  console.log(`  - Orders without matching GridFS file:                 ${ordersMissingGridFs}\n`)

  // 5. Local / Managed Cache Storage Analysis
  console.log('[Step 1.5: Local & Managed PDF Cache Audit]')
  const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')
  let localCacheFileCount = 0
  let localCacheTotalBytes = 0

  if (fs.existsSync(PDF_CACHE_DIR)) {
    const files = fs.readdirSync(PDF_CACHE_DIR)
    localCacheFileCount = files.length
    for (const f of files) {
      try {
        const stat = fs.statSync(path.join(PDF_CACHE_DIR, f))
        localCacheTotalBytes += stat.size
      } catch {}
    }
    console.log(`  - Local Disk Cache Path:  ${PDF_CACHE_DIR}`)
    console.log(`  - Cache Files Count:      ${localCacheFileCount}`)
    console.log(`  - Cache Total Bytes:      ${localCacheTotalBytes.toLocaleString()} bytes (${(localCacheTotalBytes / (1024 * 1024)).toFixed(2)} MB)`)
  } else {
    console.log(`  - Local Disk Cache Path:  ${PDF_CACHE_DIR} (directory does not exist on this machine)`)
  }

  console.log('\n================================================================')
  console.log('              DATABASE AUDIT COMPLETED SUCCESSFULLY             ')
  console.log('================================================================')

  await closeDatabaseConnection()
  return {
    sanitizedCluster,
    databaseName: db.databaseName,
    inventory,
    orders: {
      totalOrders,
      byPrintStatus,
      byPaymentStatus,
      crossTab,
      inlineBase64Count,
      hasDriveUrlCount,
      hasGridFsFlagCount,
    },
    gridfs: {
      totalGridFsFiles,
      totalGridFsChunks,
      totalGridFsBytes,
      orphanedGridFsFiles,
      ordersMissingGridFs,
    },
    cache: {
      path: PDF_CACHE_DIR,
      fileCount: localCacheFileCount,
      totalBytes: localCacheTotalBytes,
    }
  }
}

runAudit().then(res => {
  fs.writeFileSync('f:/xerox buddy/backend/scripts/audit_results.json', JSON.stringify(res, null, 2))
}).catch(err => {
  console.error('Audit error:', err)
  process.exit(1)
})
