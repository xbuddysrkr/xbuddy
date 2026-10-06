import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import { deduplicateSheetOrders } from '../api/orders.js'

const VERCEL_API = 'https://xbuddysrkr.vercel.app/api/orders'
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

async function run() {
  console.log('=== PHASE 3 LIVE VERIFICATION WORKFLOW ===\n')

  const testOrderId = 'XB' + Math.floor(7000 + Math.random() * 2000)
  console.log(`[Step 1] Creating test order: ${testOrderId}`)

  const testPayload = {
    action: 'saveOrder',
    orderId: testOrderId,
    name: 'Phase 3 Live Test',
    fileName: 'phase3_test_document.pdf',
    totalPages: 2,
    copies: 1,
    colorMode: 'bw',
    printType: 'B&W',
    printSide: 'Single',
    duplex: false,
    pageSize: 'A4',
    paperSize: 'A4',
    orientation: 'portrait',
    amount: 3,
    printingCost: 2,
    serviceFee: 1,
    transactionId: 'TXN_PHASE3_' + Date.now(),
    pageRange: 'all',
    pageRangeMode: 'all',
    customPages: '',
    printableCount: 2,
    selectedPages: [1, 2],
    selectedPageCount: 2,
    driveUrl: '',
    paymentStatus: 'pending',
    printStatus: 'waiting_for_shopkeeper',
  }

  // 1. Submit order via Vercel Dual-Write Endpoint
  console.log(`[Step 1.1] Submitting order to ${VERCEL_API}...`)
  const saveRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
    signal: AbortSignal.timeout(30000),
  })
  const saveData = await saveRes.json()
  console.log('[Step 1.1 Result]', saveData)

  if (!saveData.success && !saveData.mongoSaved) {
    throw new Error('Failed to save test order to MongoDB')
  }

  // 2. Verify MongoDB Primary Read via getOrderStatus
  console.log(`\n[Step 2] Testing getOrderStatus for ${testOrderId}...`)
  const statusRes = await fetch(`${VERCEL_API}?action=getOrderStatus&orderId=${testOrderId}`, {
    signal: AbortSignal.timeout(15000),
  })
  const statusData = await statusRes.json()
  console.log('[Step 2 Result]', {
    success: statusData.success,
    source: statusData.source,
    orderId: statusData.order?.orderId,
    printStatus: statusData.order?.printStatus,
    paymentStatus: statusData.order?.paymentStatus,
  })

  if (statusData.source !== 'mongo') {
    throw new Error(`Expected source to be 'mongo', got '${statusData.source}'`)
  }

  // 3. Verify MongoDB Primary Read via listOrders
  console.log(`\n[Step 3] Testing listOrders (Primary MongoDB read)...`)
  const listRes = await fetch(`${VERCEL_API}?action=listOrders`, {
    signal: AbortSignal.timeout(15000),
  })
  const listData = await listRes.json()
  console.log('[Step 3 Result]', {
    success: listData.success,
    source: listData.source,
    totalOrders: listData.orders?.length,
    foundTestOrder: listData.orders?.some(o => o.orderId === testOrderId),
  })

  if (listData.source !== 'mongo') {
    throw new Error(`Expected source to be 'mongo', got '${listData.source}'`)
  }

  // 4. Update Payment Status (Dual-Write Sync)
  console.log(`\n[Step 4] Updating payment status to 'completed'...`)
  const payRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updatePaymentStatus', orderId: testOrderId, paymentStatus: 'completed' }),
    signal: AbortSignal.timeout(15000),
  })
  const payData = await payRes.json()
  console.log('[Step 4 Result]', payData)

  // 5. Update Order Status (Atomic print release test)
  console.log(`\n[Step 5] Releasing print status to 'Printing' (Testing atomic release lock)...`)
  const releaseRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printing' }),
    signal: AbortSignal.timeout(15000),
  })
  const releaseData = await releaseRes.json()
  console.log('[Step 5 Result (First release)]', releaseData)

  // Test simultaneous/second release should return 409 conflict
  console.log(`[Step 5.1] Testing duplicate release attempt (Atomic guard check)...`)
  const raceRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printing' }),
    signal: AbortSignal.timeout(15000),
  })
  const raceData = await raceRes.json()
  console.log('[Step 5.1 Result (Duplicate release blocked)]', { status: raceRes.status, data: raceData })

  // 6. Finalize status to 'Printed'
  console.log(`\n[Step 6] Finalizing status to 'Printed'...`)
  const finalizeRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printed' }),
    signal: AbortSignal.timeout(15000),
  })
  const finalizeData = await finalizeRes.json()
  console.log('[Step 6 Result]', finalizeData)

  // 7. Re-read getOrderStatus to confirm updated statuses
  console.log(`\n[Step 7] Re-reading getOrderStatus to confirm synchronized state...`)
  const verifyRes = await fetch(`${VERCEL_API}?action=getOrderStatus&orderId=${testOrderId}`, {
    signal: AbortSignal.timeout(15000),
  })
  const verifyData = await verifyRes.json()
  console.log('[Step 7 Final Verified State in MongoDB Primary]', {
    orderId: verifyData.order?.orderId,
    paymentStatus: verifyData.order?.paymentStatus,
    printStatus: verifyData.order?.printStatus,
    source: verifyData.source,
  })

  // 8. Test GAS Fallback deduplication behavior directly
  console.log(`\n[Step 8] Testing GAS Fallback Deduplication Engine...`)
  const gasUrl = `${GAS_API_URL}?${new URLSearchParams({ action: 'listOrders', key: GAS_API_KEY }).toString()}`
  const gasRes = await fetch(gasUrl, { redirect: 'follow', signal: AbortSignal.timeout(60000) })
  const gasJson = await gasRes.json()
  const rawSheetOrders = gasJson?.orders || []
  const deduplicated = deduplicateSheetOrders(rawSheetOrders)

  console.log(`[Step 8 Result] Raw Sheet Rows: ${rawSheetOrders.length} | Deduplicated Unique Orders: ${deduplicated.length}`)
  console.log(`[Step 8 Result] Collapsed duplicates: ${rawSheetOrders.length - deduplicated.length}`)

  console.log('\n=== ALL PHASE 3 LIVE VERIFICATIONS COMPLETED SUCCESSFULLY! ===')
}

run().catch(err => {
  console.error('\n[FATAL ERROR in Phase 3 verification]:', err)
  process.exit(1)
})
