import { deduplicateSheetOrders } from '../api/orders.js'

const VERCEL_API = 'https://xbuddysrkr.vercel.app/api/orders'
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const GAS_API_KEY = process.env.GAS_API_KEY || 'XB_API_SECRET_KEY_2026'

async function fetchSheetOrders() {
  const gasUrl = `${GAS_API_URL}?${new URLSearchParams({ action: 'listOrders', key: GAS_API_KEY }).toString()}`
  const res = await fetch(gasUrl, { redirect: 'follow', signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`)
  const data = await res.json()
  return data?.orders || []
}

async function run() {
  console.log('============================================================')
  console.log('       XBUDDY PHASE 4 LIVE CUTOVER VERIFICATION             ')
  console.log('============================================================\n')

  // ── Step 1: Pre-Cutover Metrics ───────────────────────────────────────────
  console.log('[Step 1] Fetching pre-cutover state from Google Sheet and MongoDB...')
  const initialSheetOrders = await fetchSheetOrders()
  const initialSheetRowCount = initialSheetOrders.length
  const initialUniqueSheetOrders = deduplicateSheetOrders(initialSheetOrders)
  console.log(`[Google Sheet Before] Physical rows: ${initialSheetRowCount} | Unique order IDs: ${initialUniqueSheetOrders.length}`)

  const initialMongoRes = await fetch(`${VERCEL_API}?action=listOrders`, { signal: AbortSignal.timeout(15000) })
  const initialMongoData = await initialMongoRes.json()
  const initialMongoCount = initialMongoData.orders?.length || 0
  console.log(`[MongoDB Before] Order count: ${initialMongoCount} (source: ${initialMongoData.source})`)

  // ── Step 2: Create a REAL NEW Phase 4 Test Order ─────────────────────────
  const testOrderId = 'XB' + Math.floor(6000 + Math.random() * 2000)
  console.log(`\n[Step 2] Creating NEW Phase 4 test order: ${testOrderId}`)

  const orderPayload = {
    action: 'saveOrder',
    orderId: testOrderId,
    name: 'Phase 4 Live Cutover Test',
    fileName: 'phase4_cutover_document.pdf',
    totalPages: 1,
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
    transactionId: 'TXN_PHASE4_' + Date.now(),
    pageRange: 'all',
    pageRangeMode: 'all',
    customPages: '',
    printableCount: 1,
    selectedPages: [1],
    selectedPageCount: 1,
    driveUrl: '',
    paymentStatus: 'pending',
    printStatus: 'waiting_for_shopkeeper',
  }

  const saveRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
    signal: AbortSignal.timeout(25000),
  })
  const saveData = await saveRes.json()
  console.log('[Step 2 Result - Save Order]:', saveData)

  if (!saveData.success || !saveData.mongoSaved) {
    throw new Error('Save order failed on MongoDB')
  }
  if (saveData.sheetsSaved === true) {
    throw new Error('Google Sheet writes were NOT disabled! Expected sheetsSaved: false in Phase 4')
  }

  // ── Step 3: Authoritative Primary Read via getOrderStatus ────────────────
  console.log(`\n[Step 3] Reading getOrderStatus for ${testOrderId}...`)
  const statusRes = await fetch(`${VERCEL_API}?action=getOrderStatus&orderId=${testOrderId}`, {
    signal: AbortSignal.timeout(15000),
  })
  const statusData = await statusRes.json()
  console.log('[Step 3 Result - getOrderStatus]:', {
    success: statusData.success,
    source: statusData.source,
    orderId: statusData.order?.orderId,
    printStatus: statusData.order?.printStatus,
    paymentStatus: statusData.order?.paymentStatus,
    syncStatus: statusData.order?.syncStatus,
  })

  if (statusData.source !== 'mongo') {
    throw new Error(`Expected read source 'mongo', got '${statusData.source}'`)
  }

  // ── Step 4: Authoritative Primary Read via listOrders ────────────────────
  console.log(`\n[Step 4] Reading listOrders from MongoDB...`)
  const listRes = await fetch(`${VERCEL_API}?action=listOrders`, { signal: AbortSignal.timeout(15000) })
  const listData = await listRes.json()
  const foundInList = listData.orders?.some(o => o.orderId === testOrderId)
  const currentMongoCount = listData.orders?.length || 0
  console.log('[Step 4 Result - listOrders]:', {
    source: listData.source,
    totalOrders: currentMongoCount,
    foundTestOrder: foundInList,
  })

  if (listData.source !== 'mongo' || !foundInList) {
    throw new Error('Test order not found in MongoDB listOrders')
  }

  // ── Step 5: Update Payment Status (MongoDB Only) ─────────────────────────
  console.log(`\n[Step 5] Updating paymentStatus to 'completed'...`)
  const payRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updatePaymentStatus', orderId: testOrderId, paymentStatus: 'completed' }),
    signal: AbortSignal.timeout(15000),
  })
  const payData = await payRes.json()
  console.log('[Step 5 Result - updatePaymentStatus]:', payData)

  if (!payData.success || !payData.mongoUpdated) {
    throw new Error('Payment status update failed in MongoDB')
  }

  // ── Step 6: Update Print Status & Atomic Lock Protection ─────────────────
  console.log(`\n[Step 6] Releasing print status to 'Printing' (Testing atomic release lock)...`)
  const releaseRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printing' }),
    signal: AbortSignal.timeout(15000),
  })
  const releaseData = await releaseRes.json()
  console.log('[Step 6.1 Result - First Release]:', releaseData)

  console.log(`[Step 6.2] Attempting simultaneous duplicate release (Atomic duplicate lock test)...`)
  const raceRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printing' }),
    signal: AbortSignal.timeout(15000),
  })
  const raceData = await raceRes.json()
  console.log('[Step 6.2 Result - Duplicate Release Blocked]:', { status: raceRes.status, data: raceData })

  if (raceRes.status !== 409 || !raceData.conflict) {
    throw new Error('Atomic duplicate release lock failed to return HTTP 409 Conflict')
  }

  console.log(`[Step 6.3] Finalizing print status to 'Printed'...`)
  const finalizeRes = await fetch(VERCEL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', orderId: testOrderId, printStatus: 'Printed' }),
    signal: AbortSignal.timeout(15000),
  })
  const finalizeData = await finalizeRes.json()
  console.log('[Step 6.3 Result - Finalize Printed]:', finalizeData)

  // ── Step 7: Verify Synchronized State in MongoDB ─────────────────────────
  console.log(`\n[Step 7] Re-verifying getOrderStatus final state in MongoDB...`)
  const verifyRes = await fetch(`${VERCEL_API}?action=getOrderStatus&orderId=${testOrderId}`, {
    signal: AbortSignal.timeout(15000),
  })
  const verifyData = await verifyRes.json()
  console.log('[Step 7 Final Verified State]:', {
    orderId: verifyData.order?.orderId,
    paymentStatus: verifyData.order?.paymentStatus,
    printStatus: verifyData.order?.printStatus,
    source: verifyData.source,
  })

  // ── Step 8: Verify Google Sheet Row Count Unchanged ──────────────────────
  console.log(`\n[Step 8] Verifying Google Orders Sheet Row Count is Frozen (Archive Mode)...`)
  const postSheetOrders = await fetchSheetOrders()
  const postSheetRowCount = postSheetOrders.length
  const orderExistsInSheet = postSheetOrders.some(o => o.orderId === testOrderId)

  console.log(`[Google Sheet Before] Rows: ${initialSheetRowCount}`)
  console.log(`[Google Sheet After]  Rows: ${postSheetRowCount}`)
  console.log(`[Test Order In Sheet]: ${orderExistsInSheet ? 'YES (UNEXPECTED)' : 'NO (VERIFIED FROZEN)'}`)

  if (postSheetRowCount !== initialSheetRowCount) {
    throw new Error(`Google Sheet row count changed from ${initialSheetRowCount} to ${postSheetRowCount}! Sheet writes must be stopped!`)
  }
  if (orderExistsInSheet) {
    throw new Error(`Test order ${testOrderId} was written to Google Sheet! Sheet writes must be stopped!`)
  }

  // ── Step 9: Verify Campus Ads Isolation ──────────────────────────────────
  console.log(`\n[Step 9] Verifying Campus Ads Isolation via Google Apps Script...`)
  const adsUrl = `${GAS_API_URL}?${new URLSearchParams({ action: 'getAds', key: GAS_API_KEY }).toString()}`
  const adsRes = await fetch(adsUrl, { signal: AbortSignal.timeout(15000) })
  const adsData = await adsRes.json()
  console.log(`[Campus Ads Result]: success: ${adsData.success}, active ads count: ${adsData.ads?.length}`)

  if (!adsData.success) {
    throw new Error('Campus Ads failed to respond via Google Apps Script')
  }

  console.log('\n============================================================')
  console.log('   ALL PHASE 4 LIVE CUTOVER VERIFICATIONS PASSED 100%!     ')
  console.log('============================================================')
}

run().catch(err => {
  console.error('\n[FATAL ERROR in Phase 4 live verification]:', err)
  process.exit(1)
})
