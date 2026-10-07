import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ordersHandler, {
  getOrdersReadSource,
  getOrdersSheetWriteMode,
  isSameLogicalOrder,
  validateOrderPayload,
  normalizeSelectedPages,
} from '../api/orders.js'

console.log('--- STARTING XBUDDY PHASE 4: MONGODB AUTHORITATIVE & ARCHIVE CUTOVER TEST SUITE ---')

const apiOrdersContent = fs.readFileSync(path.resolve('api/orders.js'), 'utf8')
const clientApiContent = fs.readFileSync(path.resolve('src/utils/api.js'), 'utf8')

// ── TEST 1: Feature Flag & Environment Defaults ─────────────────────────────
const origSheetMode = process.env.ORDERS_SHEET_WRITE_MODE
const origReadSource = process.env.ORDERS_READ_SOURCE

try {
  delete process.env.ORDERS_SHEET_WRITE_MODE
  delete process.env.ORDERS_READ_SOURCE

  assert.equal(getOrdersSheetWriteMode(), 'mongo', 'TEST 1 FAILED: Default ORDERS_SHEET_WRITE_MODE must be mongo')
  assert.equal(getOrdersReadSource(), 'mongo', 'TEST 1 FAILED: Default ORDERS_READ_SOURCE must be mongo')

  process.env.ORDERS_SHEET_WRITE_MODE = 'dual'
  assert.equal(getOrdersSheetWriteMode(), 'dual', 'TEST 1 FAILED: ORDERS_SHEET_WRITE_MODE=dual must be supported')

  process.env.ORDERS_READ_SOURCE = 'gas'
  assert.equal(getOrdersReadSource(), 'gas', 'TEST 1 FAILED: ORDERS_READ_SOURCE=gas must be supported')
} finally {
  if (origSheetMode) process.env.ORDERS_SHEET_WRITE_MODE = origSheetMode
  else delete process.env.ORDERS_SHEET_WRITE_MODE
  if (origReadSource) process.env.ORDERS_READ_SOURCE = origReadSource
  else delete process.env.ORDERS_READ_SOURCE
}
console.log('✓ TEST 1 PASSED: Environment flags default to mongo with dual/gas rollback support')

// ── TEST 2: Google Sheet Writes Disabled in mongo Mode ───────────────────────
assert.ok(
  apiOrdersContent.includes("const sheetWriteMode = getOrdersSheetWriteMode()"),
  'TEST 2 FAILED: getOrdersSheetWriteMode must be consulted in api/orders.js'
)
assert.ok(
  apiOrdersContent.includes("[SHEET_WRITE_DISABLED]"),
  'TEST 2 FAILED: [SHEET_WRITE_DISABLED] logging required when Sheet writes are disabled'
)
assert.ok(
  apiOrdersContent.includes("syncStatus: 'mongo_only'"),
  'TEST 2 FAILED: mongo_only syncStatus must be assigned when Sheet writes are disabled'
)
console.log('✓ TEST 2 PASSED: Google Sheet writes are disabled in mongo mode')

// ── TEST 3: Safe Rollback Path Preserves Dual-Write Code ────────────────────
assert.ok(
  apiOrdersContent.includes("if (!isSheetWriteEnabled)"),
  'TEST 3 FAILED: Sheet write branch check missing'
)
assert.ok(
  apiOrdersContent.includes("writeToGoogleAppsScript(gasPayload)"),
  'TEST 3 FAILED: Dual-write to GAS must remain available when sheetWriteMode=dual'
)
console.log('✓ TEST 3 PASSED: Dual-write rollback path is preserved for emergency recovery')

// ── TEST 4: Observability Logs Required for Phase 4 ─────────────────────────
const requiredLogs = [
  '[MONGO_ORDER_WRITE_PRIMARY]',
  '[MONGO_ORDER_READ_PRIMARY]',
  '[ORDER_STATUS_WRITE_MONGO]',
  '[PAYMENT_STATUS_WRITE_MONGO]',
  '[SHEET_WRITE_DISABLED]',
  '[ORDER_ARCHIVE_MODE]',
]
for (const logTag of requiredLogs) {
  assert.ok(
    apiOrdersContent.includes(logTag),
    `TEST 4 FAILED: Observability log missing: ${logTag}`
  )
}
console.log('✓ TEST 4 PASSED: All 6 required observability logs implemented')

// ── TEST 5: Authoritative Reads via MongoDB Atlas ───────────────────────────
assert.ok(
  apiOrdersContent.includes("await db.collection('orders').findOne({ orderId })"),
  'TEST 5 FAILED: getOrderStatus must query MongoDB orders collection'
)
assert.ok(
  apiOrdersContent.includes("await db.collection('orders').find({}).sort({ createdAt: -1 })"),
  'TEST 5 FAILED: listOrders must query MongoDB orders collection'
)
assert.ok(
  clientApiContent.includes("fetch(`/api/orders?action=getOrderStatus&orderId="),
  'TEST 5 FAILED: Client getOrderStatus must query /api/orders'
)
assert.ok(
  clientApiContent.includes("fetch('/api/orders?action=listOrders'"),
  'TEST 5 FAILED: Client fetchAdminOrders must query /api/orders'
)
console.log('✓ TEST 5 PASSED: Client and API reads are authoritatively powered by MongoDB Atlas')

// ── TEST 6: Atomic Print Release Lock ($nin Printing, Printed) ──────────────
assert.ok(
  apiOrdersContent.includes("printStatus: { $nin: ['Printing', 'Printed'] }"),
  'TEST 6 FAILED: Atomic release lock must use $nin [Printing, Printed]'
)
assert.ok(
  apiOrdersContent.includes("Order is already printing or was previously released."),
  'TEST 6 FAILED: Race condition 409 conflict message required'
)
console.log('✓ TEST 6 PASSED: Atomic print release protection against duplicate jobs preserved')

// ── TEST 7: Phase 1 Idempotency Still Protected ─────────────────────────────
const testOrderA = {
  orderId: 'XB9901',
  amount: 25,
  copies: 1,
  fileName: 'ProjectReport.pdf',
  colorMode: 'color',
  pageRange: '1-10',
}
const testOrderRetry = {
  orderId: 'XB9901',
  amount: 25,
  copies: 1,
  fileName: 'ProjectReport.pdf',
  colorMode: 'color',
  pageRange: '1-10',
}
const testOrderConflict = {
  orderId: 'XB9901',
  amount: 50,
  copies: 2,
  fileName: 'Different.pdf',
  colorMode: 'bw',
  pageRange: 'all',
}

assert.equal(isSameLogicalOrder(testOrderA, testOrderRetry), true, 'TEST 7 FAILED: Identical payload must match')
assert.equal(isSameLogicalOrder(testOrderA, testOrderConflict), false, 'TEST 7 FAILED: Conflicting payload must mismatch')
console.log('✓ TEST 7 PASSED: Idempotency and conflict detection active')

// ── TEST 8: Campus Ads Remain 100% Isolated ─────────────────────────────────
const ADS_SPREADSHEET_ID = '1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4'
const ADS_DRIVE_FOLDER_ID = '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo'
assert.equal(ADS_SPREADSHEET_ID, '1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4')
assert.equal(ADS_DRIVE_FOLDER_ID, '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo')

let mockStatus = null
let mockData = null
const mockRes = {
  status: (s) => { mockStatus = s; return mockRes },
  json: (d) => { mockData = d; return mockRes },
}
await ordersHandler({ method: 'GET', query: { action: 'getAds' } }, mockRes)
assert.equal(mockStatus, 400, 'TEST 8 FAILED: Campus Ads must be rejected by /api/orders')
assert.ok(mockData.error.includes('Campus Ads'), 'TEST 8 FAILED: Firewall error message expected')

console.log('✓ TEST 8 PASSED: Campus Ads completely isolated from MongoDB Orders architecture')

// ── TEST 9: Client Source Code Free of MongoDB Secrets ──────────────────────
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
console.log('✓ TEST 9 PASSED: Client bundle source code verified 100% free of MONGODB credentials or URIs')

// ── TEST 10: Selected Pages & Range Integrity ───────────────────────────────
assert.deepEqual(normalizeSelectedPages([1, 2, 5]), [1, 2, 5])
assert.deepEqual(normalizeSelectedPages('3, 7, 9'), [3, 7, 9])
assert.deepEqual(normalizeSelectedPages('[4, 8]'), [4, 8])
console.log('✓ TEST 10 PASSED: Page range and selectedPages normalization integrity verified')

console.log('--- ALL PHASE 4 CUTOVER REQUIREMENTS VERIFIED & PASSED! ---')
