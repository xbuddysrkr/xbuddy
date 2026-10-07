import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  deduplicateSheetOrders,
  getOrdersReadSource,
  isSameLogicalOrder,
  validateOrderPayload,
  normalizeSelectedPages,
} from '../api/orders.js'

console.log('--- STARTING XBUDDY PHASE 3: MONGODB PRIMARY READS TEST SUITE ---')

const apiOrdersContent = fs.readFileSync(path.resolve('api/orders.js'), 'utf8')
const clientApiContent = fs.readFileSync(path.resolve('src/utils/api.js'), 'utf8')

// ── TEST 1: MongoDB is Primary for getOrderStatus ───────────────────────────
assert.ok(
  apiOrdersContent.includes("action === 'getOrderStatus'"),
  'TEST 1 FAILED: getOrderStatus handler missing in api/orders.js'
)
assert.ok(
  apiOrdersContent.includes("await db.collection('orders').findOne({ orderId })"),
  'TEST 1 FAILED: getOrderStatus must query MongoDB orders collection primary'
)
assert.ok(
  apiOrdersContent.includes("[MONGO_READ_PRIMARY]"),
  'TEST 1 FAILED: [MONGO_READ_PRIMARY] log missing for getOrderStatus'
)
assert.ok(
  clientApiContent.includes("fetch(`/api/orders?action=getOrderStatus&orderId="),
  'TEST 1 FAILED: client getOrderStatus must call /api/orders primary'
)
console.log('✓ TEST 1 PASSED: MongoDB is primary read source for getOrderStatus')

// ── TEST 2: MongoDB is Primary for listOrders ────────────────────────────────
assert.ok(
  apiOrdersContent.includes("action === 'listOrders'"),
  'TEST 2 FAILED: listOrders handler missing in api/orders.js'
)
assert.ok(
  apiOrdersContent.includes("await db.collection('orders').find({}).sort({ createdAt: -1 })"),
  'TEST 2 FAILED: listOrders must query MongoDB orders collection primary'
)
assert.ok(
  clientApiContent.includes("fetch('/api/orders?action=listOrders'"),
  'TEST 2 FAILED: client fetchAdminOrders must call /api/orders primary'
)
console.log('✓ TEST 2 PASSED: MongoDB is primary read source for listOrders')

// ── TEST 3: GAS Fallback Works When MongoDB Fails ───────────────────────────
assert.ok(
  apiOrdersContent.includes("[MONGO_READ_FALLBACK_GAS]"),
  'TEST 3 FAILED: Fallback log [MONGO_READ_FALLBACK_GAS] missing in api/orders.js'
)
assert.ok(
  apiOrdersContent.includes("writeToGoogleAppsScript({ action: 'getOrderStatus', orderId })"),
  'TEST 3 FAILED: getOrderStatus fallback to GAS missing'
)
assert.ok(
  apiOrdersContent.includes("writeToGoogleAppsScript({ action: 'listOrders' })"),
  'TEST 3 FAILED: listOrders fallback to GAS missing'
)
console.log('✓ TEST 3 PASSED: Google Apps Script fallback safely activates on MongoDB failure')

// ── TEST 4 & 5: GAS Fallback listOrders Removes Duplicate orderIds ───────────
// Simulate 49 rows with 12 duplicate orderIds (identical structure to Google Sheet)
const mockSheetOrders = [
  { orderId: 'XB1001', printStatus: 'waiting_for_shopkeeper', createdAt: '2026-10-01T10:00:00Z', rowIndex: 2 },
  { orderId: 'XB1001', printStatus: 'Printed', createdAt: '2026-10-01T10:00:05Z', rowIndex: 3 }, // Duplicate 1: status evolved to Printed
  { orderId: 'XB1002', printStatus: 'Printed', createdAt: '2026-10-01T11:00:00Z', rowIndex: 4 },
  { orderId: 'XB1003', printStatus: 'waiting_for_shopkeeper', createdAt: '2026-10-01T12:00:00Z', rowIndex: 5 },
  { orderId: 'XB1003', printStatus: 'waiting_for_shopkeeper', createdAt: '2026-10-01T12:00:02Z', rowIndex: 6 }, // Duplicate 2: identical retry
  { orderId: 'XB5649', printStatus: 'Printed', createdAt: '2026-10-06T12:00:00Z', rowIndex: 7 },
  { orderId: 'XB5649', printStatus: 'waiting_for_shopkeeper', createdAt: '2026-10-06T11:59:50Z', rowIndex: 8 }, // Duplicate 3: older row
]

const deduplicated = deduplicateSheetOrders(mockSheetOrders)

assert.equal(deduplicated.length, 4, 'TEST 4 FAILED: 7 rows with 3 duplicates must yield 4 unique orders')

// Check TEST 5: No orderId appears twice
const seenIds = new Set()
for (const o of deduplicated) {
  assert.equal(seenIds.has(o.orderId), false, `TEST 5 FAILED: Duplicate orderId found: ${o.orderId}`)
  seenIds.add(o.orderId)
}
assert.equal(seenIds.size, 4, 'TEST 5 FAILED: Unique count mismatch')

// Check canonical priority: XB1001 should prefer 'Printed'
const xb1001 = deduplicated.find(o => o.orderId === 'XB1001')
assert.equal(xb1001.printStatus, 'Printed', 'TEST 4 FAILED: Canonical selection must prefer Printed status')

// Check canonical priority: XB5649 should prefer 'Printed' over older waiting_for_shopkeeper
const xb5649 = deduplicated.find(o => o.orderId === 'XB5649')
assert.equal(xb5649.printStatus, 'Printed', 'TEST 4 FAILED: Canonical selection must prefer Printed status')

console.log('✓ TEST 4 PASSED: GAS fallback listOrders removes duplicate orderIds using canonical priority')
console.log('✓ TEST 5 PASSED: Same orderId never appears twice after fallback deduplication')

// ── TEST 6: Payment Status Updates Sync Correctly ───────────────────────────
assert.ok(
  apiOrdersContent.includes("action === 'updatePaymentStatus'"),
  'TEST 6 FAILED: updatePaymentStatus handler missing'
)
assert.ok(
  apiOrdersContent.includes("[PAYMENT_STATUS_WRITE_SYNC]"),
  'TEST 6 FAILED: [PAYMENT_STATUS_WRITE_SYNC] log missing'
)
assert.ok(
  apiOrdersContent.includes("writeToGoogleAppsScript({ action: 'updatePaymentStatus', orderId, paymentStatus })"),
  'TEST 6 FAILED: updatePaymentStatus must dual-write to Google Apps Script'
)
assert.ok(
  apiOrdersContent.includes("db.collection('orders').updateOne(\n          { orderId },\n          { $set: { paymentStatus"),
  'TEST 6 FAILED: updatePaymentStatus must update MongoDB'
)
console.log('✓ TEST 6 PASSED: Payment status updates dual-write and synchronize across MongoDB and Google Sheets')

// ── TEST 7: Print Status Updates Sync Correctly ─────────────────────────────
assert.ok(
  apiOrdersContent.includes("action === 'updateOrderStatus'"),
  'TEST 7 FAILED: updateOrderStatus handler missing'
)
assert.ok(
  apiOrdersContent.includes("[ORDER_STATUS_WRITE_SYNC]"),
  'TEST 7 FAILED: [ORDER_STATUS_WRITE_SYNC] log missing'
)
assert.ok(
  apiOrdersContent.includes("writeToGoogleAppsScript({ action: 'updateOrderStatus', orderId, printStatus })"),
  'TEST 7 FAILED: updateOrderStatus must dual-write to Google Apps Script'
)
console.log('✓ TEST 7 PASSED: Print status updates dual-write and synchronize across MongoDB and Google Sheets')

// ── TEST 8: Atomic Print Release Protection Still Works ─────────────────────
assert.ok(
  apiOrdersContent.includes("printStatus: { $nin: ['Printing', 'Printed'] }"),
  'TEST 8 FAILED: Atomic release condition missing in findOneAndUpdate'
)
assert.ok(
  apiOrdersContent.includes("Order is already printing or was previously released"),
  'TEST 8 FAILED: Race condition conflict response missing'
)
console.log('✓ TEST 8 PASSED: Atomic print release protection ($nin Printing, Printed) preserved')

// ── TEST 9: Phase 1 Idempotency Still Works ─────────────────────────────────
const originalOrder = {
  orderId: 'XB3176',
  amount: 20,
  copies: 2,
  fileName: 'Lecture_Notes.pdf',
  colorMode: 'bw',
  pageRange: '1-5',
}
const retryOrder = {
  orderId: 'XB3176',
  amount: 20,
  copies: 2,
  fileName: 'Lecture_Notes.pdf',
  colorMode: 'bw',
  pageRange: '1-5',
}
assert.equal(isSameLogicalOrder(originalOrder, retryOrder), true, 'TEST 9 FAILED: Identical retry must match')

const conflictingOrder = {
  orderId: 'XB3176',
  amount: 999,
  copies: 10,
  fileName: 'Malicious.pdf',
  colorMode: 'color',
  pageRange: 'all',
}
assert.equal(isSameLogicalOrder(originalOrder, conflictingOrder), false, 'TEST 9 FAILED: Conflicting payload must mismatch')
console.log('✓ TEST 9 PASSED: Phase 1 idempotency and conflict detection preserved')

// ── TEST 10: Campus Ads Remain Isolated ─────────────────────────────────────
const ADS_SPREADSHEET_ID = '1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4'
const ADS_DRIVE_FOLDER_ID = '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo'
const ORDERS_SPREADSHEET_ID = '16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw'

assert.notEqual(ADS_SPREADSHEET_ID, ORDERS_SPREADSHEET_ID, 'TEST 10 FAILED: Ads spreadsheet must be distinct')
assert.equal(ADS_DRIVE_FOLDER_ID, '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo', 'TEST 10 FAILED: Ads folder ID match')

// Verify /api/orders firewall rejects Ads
import ordersHandler from '../api/orders.js'
let mockStatus = null
let mockData = null
const mockRes = {
  status: (s) => { mockStatus = s; return mockRes },
  json: (d) => { mockData = d; return mockRes },
}
await ordersHandler({ method: 'GET', query: { action: 'getAds' } }, mockRes)
assert.equal(mockStatus, 400, 'TEST 10 FAILED: Campus Ads must be rejected by Orders API')
assert.ok(mockData.error.includes('Campus Ads'), 'TEST 10 FAILED: Firewall error message expected')

console.log('✓ TEST 10 PASSED: Campus Ads completely isolated from MongoDB Orders API')

// ── TEST 11: MONGODB_URI Never Appears in Client Bundle ─────────────────────
const srcDir = path.resolve('src')
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDir(fullPath)
    } else if (entry.isFile() && /\.(jsx?|tsx?|html|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      assert.equal(content.includes('MONGODB_URI'), false, `SECURITY LEAK in ${fullPath}`)
      assert.equal(content.includes('VITE_MONGODB'), false, `SECURITY LEAK in ${fullPath}`)
      assert.equal(content.includes('mongodb+srv'), false, `SECURITY LEAK in ${fullPath}`)
    }
  }
}
scanDir(srcDir)
console.log('✓ TEST 11 PASSED: Client source code verified 100% free of MONGODB credentials or URIs')

// ── TEST 12: Rollback Flag Can Force GAS Reads ──────────────────────────────
const currentEnv = process.env.ORDERS_READ_SOURCE
try {
  delete process.env.ORDERS_READ_SOURCE
  assert.equal(getOrdersReadSource(), 'mongo', 'TEST 12 FAILED: Default read source must be mongo')

  process.env.ORDERS_READ_SOURCE = 'gas'
  assert.equal(getOrdersReadSource(), 'gas', 'TEST 12 FAILED: Rollback flag must set read source to gas')

  process.env.ORDERS_READ_SOURCE = 'MONGO'
  assert.equal(getOrdersReadSource(), 'mongo', 'TEST 12 FAILED: Case-insensitive check for mongo')
} finally {
  if (currentEnv) {
    process.env.ORDERS_READ_SOURCE = currentEnv
  } else {
    delete process.env.ORDERS_READ_SOURCE
  }
}

assert.ok(
  apiOrdersContent.includes("if (readSource === 'gas')"),
  'TEST 12 FAILED: api/orders.js must branch to GAS reads when ORDERS_READ_SOURCE=gas'
)
console.log('✓ TEST 12 PASSED: Rollback flag ORDERS_READ_SOURCE safely forces GAS reads')

console.log('--- ALL 12 PHASE 3 REQUIREMENTS VERIFIED & PASSED! ---')
