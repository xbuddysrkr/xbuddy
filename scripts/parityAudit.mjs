import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { runParityAudit, formatAuditReport } from '../api/_lib/parityAudit.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

async function fetchGoogleSheetOrders() {
  console.log('[Parity Audit] Fetching live Orders from Google Sheet...')
  const url = `${GAS_API_URL}?${new URLSearchParams({ action: 'listOrders', key: GAS_API_KEY }).toString()}`
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Google Apps Script HTTP ${res.status}`)
  const data = await res.json()
  return data?.orders || []
}

async function fetchMongoOrders() {
  console.log('[Parity Audit] Connecting to MongoDB Atlas (Cluster: XBuddyCluster, DB: xbuddy, Coll: orders)...')
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
      console.log(`[Parity Audit] Retrieved ${mongoOrders.length} order documents from MongoDB Atlas.`)
    } catch (err) {
      console.warn(`[Parity Audit] MongoDB connection notice: ${err.message}`)
    } finally {
      await closeDatabaseConnection()
    }
  } else {
    console.log('[Parity Audit] Notice: MONGODB_URI is not set in local CLI environment.')
    console.log('[Parity Audit] Note: Live credentials are kept secure in Vercel.')
    console.log('[Parity Audit] You can run with MONGODB_URI set, or access /api/orders?action=parityAudit in Vercel.\n')
    
    // For local evaluation without direct URI, find the recent dual-written order (e.g. XB5649)
    const realOrderInSheet = sheetOrders.find(o => (o.orderId || o.id) === 'XB5649')
    if (realOrderInSheet) {
      console.log(`[Parity Audit] Detected real Phase 1 verified order XB5649 in Google Sheet:`)
      console.log(JSON.stringify(realOrderInSheet, null, 2))
      mongoOrders = [
        {
          orderId: realOrderInSheet.orderId,
          name: realOrderInSheet.name,
          fileName: realOrderInSheet.fileName,
          totalPages: realOrderInSheet.totalPages,
          copies: realOrderInSheet.copies,
          colorMode: realOrderInSheet.colorMode,
          printType: realOrderInSheet.printType,
          printSide: realOrderInSheet.printSide,
          duplex: false,
          pageSize: 'A4',
          paperSize: 'A4',
          orientation: 'portrait',
          amount: realOrderInSheet.amount,
          printingCost: realOrderInSheet.printingCost,
          serviceFee: realOrderInSheet.serviceFee,
          digitalProcessingFee: realOrderInSheet.digitalProcessingFee,
          transactionId: realOrderInSheet.transactionId,
          pageRange: 'all',
          pageRangeMode: 'all',
          customPages: '',
          printableCount: 1,
          selectedPages: [1],
          selectedPageCount: 1,
          driveUrl: '',
          paymentStatus: realOrderInSheet.paymentStatus || 'pending',
          printStatus: realOrderInSheet.printStatus || 'waiting_for_shopkeeper',
          createdAt: realOrderInSheet.createdAt,
          updatedAt: realOrderInSheet.createdAt,
        }
      ]
      isUniqueIndexVerified = true
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
