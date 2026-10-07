import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { runParityAudit, formatAuditReport } from '../api/_lib/parityAudit.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'
const VERCEL_API_URL = 'https://xbuddysrkr.vercel.app/api/orders'

async function fetchGoogleSheetOrders() {
  console.log('[Parity Audit] Fetching live Orders from Google Sheet...')
  const url = `${GAS_API_URL}?${new URLSearchParams({ action: 'listOrders', key: GAS_API_KEY }).toString()}`
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Google Apps Script HTTP ${res.status}`)
  const data = await res.json()
  return data?.orders || []
}

async function fetchMongoOrders() {
  console.log('[Parity Audit] Connecting directly to MongoDB Atlas (Cluster: XBuddyCluster, DB: xbuddy, Coll: orders)...')
  const { db } = await connectToDatabase()
  const ordersCollection = db.collection('orders')
  
  // Verify unique index on orderId
  const indexes = await ordersCollection.indexes()
  const uniqueOrderIndex = indexes.find(idx => idx.key?.orderId === 1 && idx.unique === true)
  const isUniqueIndexVerified = !!uniqueOrderIndex

  const mongoOrders = await ordersCollection.find({}).toArray()
  return { mongoOrders, isUniqueIndexVerified }
}

async function main() {
  console.log('=== XBUDDY PHASE 2 MONGODB ORDERS PARITY AUDIT ===\n')

  let sheetOrders = []
  try {
    sheetOrders = await fetchGoogleSheetOrders()
    console.log(`[Parity Audit] Retrieved ${sheetOrders.length} order records from Google Sheets.`)
  } catch (err) {
    console.error('[Parity Audit] Error fetching Google Sheet orders:', err.message)
    process.exit(1)
  }

  let mongoOrders = []
  let isUniqueIndexVerified = false

  if (process.env.MONGODB_URI) {
    try {
      const mongoRes = await fetchMongoOrders()
      mongoOrders = mongoRes.mongoOrders
      isUniqueIndexVerified = mongoRes.isUniqueIndexVerified
      console.log(`[Parity Audit] Retrieved ${mongoOrders.length} order documents directly from MongoDB Atlas.`)
    } catch (err) {
      console.warn(`[Parity Audit] MongoDB connection notice: ${err.message}`)
    } finally {
      await closeDatabaseConnection()
    }
  } else {
    console.log('[Parity Audit] Querying live MongoDB Atlas state via secure Vercel production endpoint...\n')
    try {
      const vRes = await fetch(`${VERCEL_API_URL}?action=parityAudit`, { signal: AbortSignal.timeout(30000) })
      const vData = await vRes.json()
      if (vData?.success && vData?.report) {
        console.log(vData.report)
        return
      }
    } catch (vErr) {
      console.warn(`[Parity Audit] Remote notice: ${vErr.message}`)
    }
  }

  const auditResult = runParityAudit({
    sheetOrders,
    mongoOrders,
    mongoUniqueIndexVerified: isUniqueIndexVerified,
  })

  const report = formatAuditReport(auditResult)
  console.log('\n' + report)
}

main().catch(err => {
  console.error('[Parity Audit Fatal Error]:', err)
  process.exit(1)
})
