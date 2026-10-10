import { connectToDatabase } from '../api/_lib/mongodb.js'
import { savePdfToGridFS, getGridFSBucket } from '../api/_lib/gridfs.js'
import { savePdfToDiskCache } from '../api/orders.js'
import { Readable } from 'node:stream'
import fs from 'fs'

async function run() {
  console.log('Connecting to MongoDB Atlas...')
  const t0 = performance.now()
  const { db } = await connectToDatabase()
  console.log(`Connected to Atlas in ${Math.round(performance.now() - t0)} ms`)

  // 3.0 MB dummy PDF buffer
  const samplePdf = Buffer.alloc(3 * 1024 * 1024, 'a')
  samplePdf.write('%PDF-1.4\n', 0)

  // Test 1: Existing savePdfToGridFS (default 255KB chunks)
  const testId1 = `XB_BENCH_1_${Date.now()}`
  const t1 = performance.now()
  await savePdfToGridFS(db, testId1, samplePdf, { fileName: 'test1.pdf' })
  const gridFsMs1 = Math.round(performance.now() - t1)
  console.log(`[Default GridFS 255KB chunks]: ${gridFsMs1} ms`)

  // Test 2: Disk cache write
  const t2 = performance.now()
  savePdfToDiskCache(testId1, samplePdf)
  const diskMs = Math.round(performance.now() - t2)
  console.log(`[Disk Cache write]: ${diskMs} ms`)

  // Test 3: ordersCollection.insertOne
  const orders = db.collection('orders')
  const t3 = performance.now()
  await orders.insertOne({
    orderId: testId1,
    name: 'Bench',
    fileName: 'test.pdf',
    pdfStorage: 'gridfs',
    createdAt: new Date().toISOString(),
  })
  const insertMs = Math.round(performance.now() - t3)
  console.log(`[orders.insertOne]: ${insertMs} ms`)

  // Test 4: GridFS with 1MB chunk size (fewer roundtrips to Atlas!)
  const testId2 = `XB_BENCH_2_${Date.now()}`
  const t4 = performance.now()
  const bucket1Mb = new (await import('mongodb')).GridFSBucket(db, {
    bucketName: 'order_pdfs',
    chunkSizeBytes: 1024 * 1024, // 1 MB chunk
  })
  await new Promise((resolve, reject) => {
    const uploadStream = bucket1Mb.openUploadStream(`${testId2}.pdf`, {
      contentType: 'application/pdf',
      metadata: { orderId: testId2, size: samplePdf.length },
    })
    uploadStream.on('error', reject)
    uploadStream.on('finish', resolve)
    Readable.from(samplePdf).pipe(uploadStream)
  })
  const gridFsMs2 = Math.round(performance.now() - t4)
  console.log(`[Optimized GridFS 1MB chunks]: ${gridFsMs2} ms`)

  // Cleanup benchmark test files from Atlas
  const bucket = getGridFSBucket(db)
  const files = await bucket.find({ filename: { $in: [`${testId1}.pdf`, `${testId2}.pdf`] } }).toArray()
  for (const f of files) {
    await bucket.delete(f._id).catch(() => {})
  }
  await orders.deleteOne({ orderId: testId1 }).catch(() => {})
  console.log('Cleaned up benchmark records.')
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
