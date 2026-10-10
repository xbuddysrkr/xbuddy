import { connectToDatabase } from '../api/_lib/mongodb.js'
import { getGridFSBucket } from '../api/_lib/gridfs.js'
import { Readable } from 'node:stream'

async function test() {
  const { db } = await connectToDatabase()
  const bucket = getGridFSBucket(db)
  const count = await db.collection('order_pdfs.files').countDocuments()
  console.log('Total files in order_pdfs.files:', count)
  
  const indexes = await db.collection('order_pdfs.files').indexes()
  console.log('Indexes on order_pdfs.files:', JSON.stringify(indexes, null, 2))
  
  const cleanId = 'XB9999'
  const filename = cleanId + '.pdf'

  const t0 = performance.now()
  const existing = await bucket.find({ $or: [{ filename }, { 'metadata.orderId': cleanId }] }).toArray()
  console.log('Find existing with $or took:', Math.round(performance.now() - t0), 'ms. Found:', existing.length)

  const t1 = performance.now()
  const existingIndexed = await bucket.find({ filename }).toArray()
  console.log('Find existing with filename only took:', Math.round(performance.now() - t1), 'ms. Found:', existingIndexed.length)

  const samplePdf = Buffer.alloc(3 * 1024 * 1024, 'a')
  samplePdf.write('%PDF-1.4\n', 0)

  // Test streaming upload time with default chunk size (255 KB)
  const t2 = performance.now()
  const uploadStream = bucket.openUploadStream('TEST_SPEED.pdf', { contentType: 'application/pdf' })
  await new Promise((res, rej) => {
    uploadStream.on('error', rej)
    uploadStream.on('finish', res)
    Readable.from(samplePdf).pipe(uploadStream)
  })
  console.log('GridFS raw stream upload (255KB) took:', Math.round(performance.now() - t2), 'ms')
  await bucket.delete(uploadStream.id)

  process.exit(0)
}
test().catch(err => {
  console.error(err)
  process.exit(1)
})
