import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { planBackfill, executeBackfill, formatBackfillReport } from '../api/_lib/backfill.js'
import { runParityAudit, formatAuditReport } from '../api/_lib/parityAudit.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

async function fetchGoogleSheetOrders() {
  console.log('[Backfill] Fetching live Orders from Google Sheet...')
  const url = `${GAS_API_URL}?${new URLSearchParams({ action: 'listOrders', key: GAS_API_KEY }).toString()}`
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Google Apps Script HTTP ${res.status}`)
  const data = await res.json()
  return data?.orders || []
}

async function main() {
  const args = process.argv.slice(2)
  const isExecute = args.includes('--execute')
  const isDryRun = args.includes('--dry-run') || !isExecute

  // Check for custom URI passed via CLI
  const uriArg = args.find(a => a.startsWith('--uri='))
  if (uriArg) {
    process.env.MONGODB_URI = uriArg.split('=')[1]
  }

  console.log('============================================================')
  console.log('       XBUDDY PHASE 2.5 HISTORICAL ORDERS BACKFILL          ')
  console.log('============================================================')
  console.log(`Mode: ${isExecute ? 'EXECUTE (Inserting missing orders)' : 'DRY-RUN (Safe Read-Only Simulation)'}\n`)

  // Step 1: Fetch Sheet Orders
  const sheetOrders = await fetchGoogleSheetOrders()
  console.log(`[Backfill] Retrieved ${sheetOrders.length} rows from Google Sheet.\n`)

  // Step 2: Fetch MongoDB Orders
  let mongoOrders = []
  let ordersCollection = null
  let isUniqueIndexVerified = false

  if (process.env.MONGODB_URI) {
    try {
      const { db } = await connectToDatabase()
      ordersCollection = db.collection('orders')
      const indexes = await ordersCollection.indexes()
      isUniqueIndexVerified = !!indexes.find(idx => idx.key?.orderId === 1 && idx.unique === true)
      mongoOrders = await ordersCollection.find({}).toArray()
      console.log(`[Backfill] Connected to MongoDB Atlas. Found ${mongoOrders.length} existing orders.`)
    } catch (err) {
      console.error(`[Backfill] MongoDB Connection Error: ${err.message}`)
      process.exit(1)
    }
  } else {
    console.log('[Backfill] Notice: MONGODB_URI is not set in local environment.')
    console.log('[Backfill] Simulating existing MongoDB state with verified Phase 1 order (XB5649)...')
    const realOrderInSheet = sheetOrders.find(o => (o.orderId || o.id) === 'XB5649')
    if (realOrderInSheet) {
      mongoOrders = [{
        orderId: 'XB5649',
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
      }]
      isUniqueIndexVerified = true
    }
  }

  // Step 3: Plan Backfill
  const plan = planBackfill({ sheetOrders, mongoOrders })

  if (isDryRun) {
    const dryRunReport = formatBackfillReport(plan, null)
    console.log('\n' + dryRunReport)
    console.log('\nTo execute this migration against MongoDB Atlas, run:')
    console.log('node scripts/backfillOrders.mjs --execute\n')
    await closeDatabaseConnection()
    return
  }

  // Step 4: Execute Backfill (if --execute)
  if (isExecute) {
    if (!ordersCollection) {
      console.error('\n[Backfill Error] Cannot execute backfill without live MONGODB_URI.')
      console.log('Please provide MONGODB_URI via environment variable or --uri parameter.')
      process.exit(1)
    }

    console.log(`\n[Backfill Execution] Beginning insertion of ${plan.historicalOrdersToInsertCount} unique historical orders...`)
    const execResult = await executeBackfill({ ordersCollection, plan })

    for (const ins of execResult.inserted) {
      console.log(`✓ Inserted: ${ins.orderId} (from Sheet Row ${ins.sourceRow})`)
    }
    for (const skp of execResult.skipped) {
      console.log(`- Skipped:  ${skp.orderId} (${skp.reason})`)
    }
    for (const err of execResult.errors) {
      console.error(`✗ Error on ${err.orderId}: ${err.error}`)
    }

    const execReport = formatBackfillReport(plan, execResult)
    console.log('\n' + execReport)

    // Step 5: Automatically re-run parity audit
    console.log('\n[Backfill] Re-running Parity Audit after execution...\n')
    const updatedMongoOrders = await ordersCollection.find({}).toArray()
    const auditResult = runParityAudit({
      sheetOrders,
      mongoOrders: updatedMongoOrders,
      mongoUniqueIndexVerified: isUniqueIndexVerified,
    })
    const auditReport = formatAuditReport(auditResult)
    console.log(auditReport)

    await closeDatabaseConnection()
  }
}

main().catch(err => {
  console.error('[Backfill Fatal Error]:', err)
  process.exit(1)
})
