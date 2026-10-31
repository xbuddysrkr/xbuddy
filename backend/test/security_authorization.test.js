import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ordersHandler from '../api/orders.js'
import agentOrdersHandler, { validateAgentAuth } from '../api/agent/orders.js'
import {
  isBoothAuthorized,
  generateBoothSessionToken,
  generatePreviewToken,
  verifyPreviewToken,
  safeCompare,
} from '../api/_lib/boothAuth.js'
import { cleanupLocalTempFiles, requireStationAuth } from '../print-agent/services/localServer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_CACHE_DIR = path.resolve(__dirname, '.test_sec_cache')

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val
      return this
    },
    json(data) {
      this.bodyData = data
      return this
    },
    send(data) {
      this.bodyData = data
      return this
    },
    end() {
      return this
    },
  }
  return res
}

async function runSecurityTestSuite() {
  console.log('=================================================================')
  console.log('  XBUDDY DEFENSIVE SECURITY & STUDENT DATA PRIVACY TEST SUITE    ')
  console.log('=================================================================\n')

  // Enforce strict booth authorization checks during test suite
  process.env.ENFORCE_BOOTH_AUTH = 'true'
  process.env.BOOTH_STATION_PIN = '7744'
  process.env.ADMIN_KEY = 'TEST_ADMIN_SECRET_KEY_2026'
  process.env.AGENT_SECRET_KEY = 'XB_AGENT_PROD_SECRET_KEY_SUPER_SECURE_2026'

  // ── TEST 1: Anonymous getOrderPdf is strictly blocked (HTTP 401) ─────────
  console.log('[TEST 1] Testing anonymous document byte retrieval via getOrderPdf...')
  const resAnonPdf = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB3510' },
    headers: {},
  }, resAnonPdf)

  assert.strictEqual(resAnonPdf.statusCode, 401, `Anonymous getOrderPdf must return 401, got ${resAnonPdf.statusCode}`)
  assert.strictEqual(resAnonPdf.bodyData?.success, false)
  assert.match(resAnonPdf.bodyData?.error, /Unauthorized/i)
  console.log('✓ TEST 1 PASSED: Anonymous getOrderPdf rejected with HTTP 401\n')

  // ── TEST 2: Scoped Preview Token allows document download ────────────────
  console.log('[TEST 2] Testing getOrderPdf with valid scoped preview token...')
  const validToken = generatePreviewToken('XB3510')
  assert.ok(validToken, 'Preview token must be generated')

  const resTokenPdf = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB3510', token: validToken },
    headers: {},
  }, resTokenPdf)

  // Should NOT be 401 (either 200 or 404/410 depending on database existence)
  assert.notStrictEqual(resTokenPdf.statusCode, 401, 'Valid preview token must not be rejected with 401')
  console.log('✓ TEST 2 PASSED: Valid scoped preview token passes authorization\n')

  // ── TEST 3: Mismatched order token is strictly rejected (HTTP 401) ────────
  console.log('[TEST 3] Testing getOrderPdf with token minted for a different order...')
  const wrongOrderToken = generatePreviewToken('XB9999')
  const resMismatchedPdf = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB3510', token: wrongOrderToken },
    headers: {},
  }, resMismatchedPdf)

  assert.strictEqual(resMismatchedPdf.statusCode, 401, 'Mismatched order preview token must be rejected with 401')
  console.log('✓ TEST 3 PASSED: Cross-order token tampering rejected with HTTP 401\n')

  // ── TEST 4: Print Agent key authorizes getOrderPdf ───────────────────────
  console.log('[TEST 4] Testing getOrderPdf with Print Agent x-agent-key header...')
  const resAgentPdf = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: 'XB3510' },
    headers: { 'x-agent-key': process.env.AGENT_SECRET_KEY },
  }, resAgentPdf)

  assert.notStrictEqual(resAgentPdf.statusCode, 401, 'Authorized Print Agent header must not be rejected with 401')
  console.log('✓ TEST 4 PASSED: Print Agent header successfully authorizes document download\n')

  // ── TEST 5: Anonymous listOrders is strictly blocked (HTTP 401) ──────────
  console.log('[TEST 5] Testing anonymous listOrders enumeration...')
  const resAnonList = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'listOrders' },
    headers: {},
  }, resAnonList)

  assert.strictEqual(resAnonList.statusCode, 401, `Anonymous listOrders must return 401, got ${resAnonList.statusCode}`)
  assert.strictEqual(resAnonList.bodyData?.success, false)
  console.log('✓ TEST 5 PASSED: Anonymous order listing rejected with HTTP 401\n')

  // ── TEST 6: Anonymous default action (bare GET /api/orders) is blocked ──
  console.log('[TEST 6] Testing bare GET /api/orders without action parameter...')
  const resBareGet = mockRes()
  await ordersHandler({
    method: 'GET',
    query: {},
    headers: {},
  }, resBareGet)

  assert.strictEqual(resBareGet.statusCode, 401, `Bare GET without action must return 401, got ${resBareGet.statusCode}`)
  console.log('✓ TEST 6 PASSED: Default unauthenticated list fallback rejected with HTTP 401\n')

  // ── TEST 7: Authenticated booth session succeeds for listOrders ─────────
  console.log('[TEST 7] Testing listOrders with valid booth session token...')
  const boothToken = generateBoothSessionToken()
  const resBoothList = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'listOrders' },
    headers: { 'x-booth-token': boothToken },
  }, resBoothList)

  assert.notStrictEqual(resBoothList.statusCode, 401, 'Valid booth session token must authorize listOrders')
  console.log('✓ TEST 7 PASSED: Booth session token authorizes listOrders\n')

  // ── TEST 8: Anonymous updateOrderStatus is strictly blocked (HTTP 401) ───
  console.log('[TEST 8] Testing anonymous order status manipulation...')
  const resAnonUpdate = mockRes()
  await ordersHandler({
    method: 'POST',
    body: { action: 'updateOrderStatus', orderId: 'XB3510', printStatus: 'Cancelled' },
    headers: {},
  }, resAnonUpdate)

  assert.strictEqual(resAnonUpdate.statusCode, 401, `Anonymous updateOrderStatus must return 401, got ${resAnonUpdate.statusCode}`)
  console.log('✓ TEST 8 PASSED: Anonymous status manipulation rejected with HTTP 401\n')

  // ── TEST 9: Anonymous parityAudit and backfillOrders are blocked ─────────
  console.log('[TEST 9] Testing anonymous maintenance actions (parityAudit & backfillOrders)...')
  const resAnonAudit = mockRes()
  await ordersHandler({
    method: 'GET',
    query: { action: 'parityAudit' },
    headers: {},
  }, resAnonAudit)
  assert.strictEqual(resAnonAudit.statusCode, 401, 'Anonymous parityAudit must return 401')

  const resAnonBackfill = mockRes()
  await ordersHandler({
    method: 'POST',
    body: { action: 'backfillOrders', mode: 'execute' },
    headers: {},
  }, resAnonBackfill)
  assert.strictEqual(resAnonBackfill.statusCode, 401, 'Anonymous backfillOrders must return 401')
  console.log('✓ TEST 9 PASSED: Maintenance endpoints strictly protected with HTTP 401\n')

  // ── TEST 10: Fail-closed admin credential check (hardcoded pass rejected) ─
  console.log('[TEST 10] Testing fail-closed admin authentication & rejection of hardcoded passwords...')
  delete process.env.ADMIN_PASSWORD
  delete process.env.ADS_PASSWORD

  const hardcodedCheck = isBoothAuthorized({
    headers: { 'x-admin-password': 'xbuddy@4921' },
  })
  assert.strictEqual(hardcodedCheck, false, 'Hardcoded password xbuddy@4921 must be rejected unconditionally')

  const emptyPassCheck = isBoothAuthorized({
    headers: { 'x-admin-password': 'any_arbitrary_string' },
  })
  assert.strictEqual(emptyPassCheck, false, 'Without ADMIN_PASSWORD configured, password auth must fail closed')
  console.log('✓ TEST 10 PASSED: Hardcoded credentials eradicated; server fails closed when unset\n')

  // ── TEST 11: Local Station Loopback & Auth Guard (requireStationAuth) ─────
  console.log('[TEST 11] Testing local Print Station administrative authorization guard...')
  // Non-loopback request (e.g. from LAN 192.168.1.50)
  const resLanReq = mockRes()
  let nextCalled = false
  requireStationAuth({
    socket: { remoteAddress: '192.168.1.50' },
    headers: {},
  }, resLanReq, () => { nextCalled = true })

  assert.strictEqual(resLanReq.statusCode, 403, 'Non-loopback LAN request must be rejected with 403')
  assert.strictEqual(nextCalled, false)

  // Loopback request without PIN or approved Origin
  const resUnauthLocal = mockRes()
  nextCalled = false
  requireStationAuth({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { origin: 'http://malicious-website.com' },
  }, resUnauthLocal, () => { nextCalled = true })

  assert.strictEqual(resUnauthLocal.statusCode, 401, 'Loopback request with unauthorized origin must return 401')
  assert.strictEqual(nextCalled, false)

  // Loopback request with correct Station PIN
  const resAuthPin = mockRes()
  nextCalled = false
  requireStationAuth({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-station-pin': '7744' },
  }, resAuthPin, () => { nextCalled = true })

  assert.strictEqual(nextCalled, true, 'Request with valid Station PIN must pass authorization')

  // Loopback request from allowed production Origin
  const resApprovedOrigin = mockRes()
  nextCalled = false
  requireStationAuth({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { origin: 'https://xbuddysrkr.vercel.app' },
  }, resApprovedOrigin, () => { nextCalled = true })

  assert.strictEqual(nextCalled, true, 'Request from approved booth origin must pass authorization')
  console.log('✓ TEST 11 PASSED: Local Print Station administrative guard enforces loopback & authentication\n')

  // ── TEST 12: File Retention and Cleanup Behavior ─────────────────────────
  console.log('[TEST 12] Testing bounded file retention cleanup behavior...')
  const testDownloadsDir = path.resolve(__dirname, '..', 'print-agent', 'downloads')
  if (!fs.existsSync(testDownloadsDir)) fs.mkdirSync(testDownloadsDir, { recursive: true })

  const staleScreenshot = path.join(testDownloadsDir, 'XB-SEC-TEST_payment.png')
  const staleSettings = path.join(testDownloadsDir, 'XB-SEC-TEST_settings.json')
  const recentDoc = path.join(testDownloadsDir, 'XB-SEC-RECENT.pdf')

  fs.writeFileSync(staleScreenshot, 'fake_png_data')
  fs.writeFileSync(staleSettings, '{"test": true}')
  fs.writeFileSync(recentDoc, '%PDF-1.4 test')

  // Backdate stale files by 45 minutes
  const pastTime = (Date.now() - 45 * 60 * 1000) / 1000
  fs.utimesSync(staleScreenshot, pastTime, pastTime)
  fs.utimesSync(staleSettings, pastTime, pastTime)

  // Run cleanup with 30-minute threshold
  cleanupLocalTempFiles(30 * 60 * 1000)

  assert.strictEqual(fs.existsSync(staleScreenshot), false, 'Stale payment screenshot must be purged')
  assert.strictEqual(fs.existsSync(staleSettings), false, 'Stale settings JSON must be purged')
  assert.strictEqual(fs.existsSync(recentDoc), true, 'Recent document within retention window must be preserved')

  // Clean up test recent doc
  try { fs.unlinkSync(recentDoc) } catch {}
  console.log('✓ TEST 12 PASSED: File retention sweeps stale artifacts and preserves active documents\n')

  console.log('=================================================================')
  console.log('  ALL 12 DEFENSIVE SECURITY & PRIVACY TESTS PASSED SUCCESSFULLY! ')
  console.log('=================================================================')
  process.exit(0)
}

runSecurityTestSuite().catch(err => {
  console.error('\n❌ SECURITY TEST SUITE FAILED:', err)
  process.exit(1)
})
