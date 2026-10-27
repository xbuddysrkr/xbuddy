import dotenv from 'dotenv'
dotenv.config({ path: 'backend/.env' })
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import { MongoClient } from 'mongodb'

async function runAudit() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  console.log('Connecting to MongoDB Atlas...')
  const client = new MongoClient(uri)
  const connectStart = Date.now()
  await client.connect()
  const connectLatency = Date.now() - connectStart
  console.log(`Connected to Atlas cluster in ${connectLatency} ms`)

  const db = client.db('xbuddy')
  const orders = db.collection('orders')

  // 1. PING & CLUSTER HEALTH
  const pingStart = Date.now()
  const pingResult = await db.command({ ping: 1 })
  const pingLatency = Date.now() - pingStart
  console.log(`Ping response: ${JSON.stringify(pingResult)} (${pingLatency} ms)`)

  // 2. COLLECTION STATS & DOCUMENT SIZES
  console.log('\n--- COLLECTION STATISTICS ---')
  const stats = await db.command({ collStats: 'orders' }).catch(err => ({ error: err.message }))
  const count = await orders.countDocuments()
  console.log(`Total documents: ${count}`)
  if (!stats.error) {
    console.log(`Total collection size (uncompressed): ${(stats.size / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Storage size on disk (WiredTiger compressed): ${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Average document size: ${(stats.avgObjSize / 1024).toFixed(2)} KB`)
  }

  // Server-side calculation of pdfBase64 sizes using MongoDB aggregation
  const sizeAnalysis = await orders.aggregate([
    {
      $project: {
        orderId: 1,
        b64Len: { $strLenCP: { $ifNull: ['$pdfBase64', ''] } }
      }
    },
    { $sort: { b64Len: -1 } }
  ]).toArray()

  const nonZero = sizeAnalysis.filter(d => d.b64Len > 0)
  const totalChars = nonZero.reduce((sum, d) => sum + d.b64Len, 0)
  console.log(`\nDocuments with embedded PDF Base64: ${nonZero.length} / ${count}`)
  console.log(`Total PDF Base64 uncompressed raw volume: ${(totalChars / (1024 * 1024)).toFixed(2)} MB`)
  console.log('Top 10 largest documents by PDF Base64 payload:')
  nonZero.slice(0, 10).forEach(d => {
    console.log(`  - ${d.orderId}: ${(d.b64Len / (1024 * 1024)).toFixed(2)} MB (${d.b64Len.toLocaleString()} characters)`)
  })

  // 3. QUERY LATENCY BENCHMARKS
  console.log('\n--- QUERY LATENCY BENCHMARKS ---')

  // A. findOne with pdfBase64 included (full document)
  const t0 = Date.now()
  const fullDoc = await orders.findOne({ orderId: 'XB2863' })
  const latFull = Date.now() - t0
  console.log(`Query A [findOne XB2863 WITH pdfBase64]: ${latFull} ms (doc size: ${fullDoc ? (JSON.stringify(fullDoc).length / 1024).toFixed(1) : 0} KB)`)

  // B. findOne with pdfBase64 projected out
  const t1 = Date.now()
  const projDoc = await orders.findOne({ orderId: 'XB2863' }, { projection: { pdfBase64: 0 } })
  const latProj = Date.now() - t1
  console.log(`Query B [findOne XB2863 WITHOUT pdfBase64]: ${latProj} ms (doc size: ${projDoc ? (JSON.stringify(projDoc).length / 1024).toFixed(1) : 0} KB)`)

  // C. Default Atlas Data Explorer query: find({}).limit(20) with NO projection
  const t2 = Date.now()
  const explorerSim = await orders.find({}).limit(20).toArray()
  const latExplorer = Date.now() - t2
  const explorerPayloadSize = explorerSim.reduce((acc, d) => acc + (JSON.stringify(d).length), 0)
  console.log(`Query C [Atlas Data Explorer simulation: find().limit(20) WITH pdfBase64]: ${latExplorer} ms (total wire payload: ${(explorerPayloadSize / (1024 * 1024)).toFixed(2)} MB)`)

  // D. Optimized Query: find({}).limit(20) with { pdfBase64: 0 }
  const t3 = Date.now()
  const optimizedSim = await orders.find({}, { projection: { pdfBase64: 0 } }).limit(20).toArray()
  const latOptimized = Date.now() - t3
  const optimizedPayloadSize = optimizedSim.reduce((acc, d) => acc + (JSON.stringify(d).length), 0)
  console.log(`Query D [Optimized find().limit(20) WITHOUT pdfBase64]: ${latOptimized} ms (total wire payload: ${(optimizedPayloadSize / 1024).toFixed(2)} KB)`)

  // 4. INDEX REVIEW
  console.log('\n--- INDEX REVIEW ---')
  const indexes = await orders.indexes()
  console.log('Collection Indexes:', JSON.stringify(indexes, null, 2))

  // 5. INTENDED PAYMENT CONFIGURATION
  console.log('\n--- PAYMENT VERIFICATION CONFIGURATION INTENT ---')
  const reqPay = process.env.REQUIRE_PAYMENT_VERIFICATION
  console.log(`REQUIRE_PAYMENT_VERIFICATION env var: ${reqPay !== undefined ? reqPay : '(not explicitly set in backend/.env)'}`)

  await client.close()
}

runAudit().catch(console.error)
