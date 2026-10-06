import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { planBackfill, executeBackfill, formatBackfillReport } from '../api/_lib/backfill.js'
import { runParityAudit, formatAuditReport } from '../api/_lib/parityAudit.js'

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'
const VERCEL_API_URL = 'https://xbuddysrkr.vercel.app/api/orders'

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

  // Step 2: Determine execution mode (Direct MongoClient vs Vercel Serverless Endpoint)
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
      console.log(`[Backfill] Connected directly to MongoDB Atlas. Found ${mongoOrders.length} existing orders.`)
    } catch (err) {
      console.error(`[Backfill] MongoDB Connection Error: ${err.message}`)
      process.exit(1)
    }
  } else {
    // If running in CLI without local MONGODB_URI, query live Vercel API for existing MongoDB orders
    console.log('[Backfill] Connecting to MongoDB Atlas via secure Vercel production endpoint...')
    try {
      const vRes = await fetch(`${VERCEL_API_URL}?action=parityAudit`, { signal: AbortSignal.timeout(30000) })
      const vData = await vRes.json()
      if (vData?.success) {
        console.log(`[Backfill] Connected to MongoDB Atlas. Current collection has ${vData.audit.mongoOrderCount} orders.`)
        isUniqueIndexVerified = vData.audit.mongoUniqueIndexVerified
      }
    } catch (vErr) {
      console.warn(`[Backfill] Notice: ${vErr.message}`)
    }
  }

  // Step 3: Plan Backfill
  if (ordersCollection) {
    const plan = planBackfill({ sheetOrders, mongoOrders })

    if (isDryRun) {
      const dryRunReport = formatBackfillReport(plan, null)
      console.log('\n' + dryRunReport)
      console.log('\nTo execute this migration against MongoDB Atlas, run:')
      console.log('node scripts/backfillOrders.mjs --execute\n')
      await closeDatabaseConnection()
      return
    }

    if (isExecute) {
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

      console.log('\n[Backfill] Re-running Parity Audit after execution...\n')
      const updatedMongoOrders = await ordersCollection.find({}).toArray()
      const auditResult = runParityAudit({
        sheetOrders,
        mongoOrders: updatedMongoOrders,
        mongoUniqueIndexVerified: isUniqueIndexVerified,
      })
      console.log(formatAuditReport(auditResult))

      await closeDatabaseConnection()
    }
  } else {
    // Execute through secure Vercel backend
    const endpointMode = isExecute ? 'execute' : 'dry-run'
    console.log(`[Backfill] Invoking Vercel production serverless execution endpoint (${endpointMode})...`)
    const vRes = await fetch(`${VERCEL_API_URL}?action=backfillOrders&mode=${endpointMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
    })
    const data = await vRes.json()

    if (!data?.success) {
      console.error('[Backfill Error]:', data?.error || 'Unknown error')
      process.exit(1)
    }

    if (isExecute && data.execution) {
      console.log(`\n[Backfill Execution] Log of processed orders:`)
      for (const ins of data.execution.inserted || []) {
        console.log(`✓ Inserted: ${ins.orderId} (from Sheet Row ${ins.sourceRow})`)
      }
      for (const skp of data.execution.skipped || []) {
        console.log(`- Skipped:  ${skp.orderId} (${skp.reason})`)
      }
      for (const err of data.execution.errors || []) {
        console.error(`✗ Error on ${err.orderId}: ${err.error}`)
      }
    }

    console.log('\n' + data.report)

    if (isExecute && data.updatedAudit) {
      console.log('\n[Backfill] Re-running Parity Audit after execution...\n')
      console.log(formatAuditReport(data.updatedAudit))
    } else if (isDryRun) {
      console.log('\nTo execute this migration against MongoDB Atlas, run:')
      console.log('node scripts/backfillOrders.mjs --execute\n')
    }
  }
}

main().catch(err => {
  console.error('[Backfill Fatal Error]:', err)
  process.exit(1)
})
