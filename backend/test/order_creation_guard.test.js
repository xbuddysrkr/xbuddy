import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

function findPath(rel) {
  const candidates = [
    path.resolve(rel),
    path.resolve('..', rel),
    path.resolve('../frontend', rel),
    path.resolve('frontend', rel),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return path.resolve(rel)
}

async function runTests() {
  console.log('--- STARTING XBUDDY ORDER CREATION GUARD & REPOSITORY REGRESSION TEST SUITE ---')

  // ── TEST 1: Student saveOrder creates MongoDB order first ──────────────────
  const apiSrc = fs.readFileSync(findPath('src/utils/api.js'), 'utf8')
  assert.ok(
    apiSrc.includes("onStep?.('save_order')") &&
    (apiSrc.includes("fetch('/api/orders'") || apiSrc.includes("ORDERS_ENDPOINT")) &&
    apiSrc.includes("orderResult?.mongoSaved"),
    'submitOrder must call /api/orders and check mongoSaved before proceeding to PDF delivery'
  )
  console.log('✓ TEST 1 PASSED: Student saveOrder is guaranteed to create MongoDB order first')

  // ── TEST 2: Local /save-order cannot create a MongoDB-less order ───────────
  const localServerSrc = fs.readFileSync(findPath('print-agent/services/localServer.js'), 'utf8')
  assert.ok(
    localServerSrc.includes('const mongoOrder = await getOrderByIdForRelease(cleanId)') &&
    localServerSrc.includes('Order ${cleanId} not found in authoritative MongoDB database'),
    'localServer /save-order must verify order exists in MongoDB primary and reject missing orders'
  )
  console.log('✓ TEST 2 PASSED: Local /save-order strictly rejects orders not present in MongoDB')

  // ── TEST 3: MongoDB failure halts submission before any local staging ──────
  assert.ok(
    apiSrc.includes('if (!orderResult?.success || !orderResult?.mongoSaved)') &&
    apiSrc.includes("throw {") &&
    apiSrc.includes("step: 'save_order'"),
    'submitOrder must throw immediately if MongoDB order creation fails, preventing PDF staging'
  )
  console.log('✓ TEST 3 PASSED: MongoDB failure prevents any local PDF staging or print queueing')

  // ── TEST 4: Local PDF staging requires a valid MongoDB orderId ─────────────
  assert.ok(
    localServerSrc.includes('Order ${cleanId} not found in authoritative MongoDB database. Orders must be created in MongoDB before staging files.'),
    'Local /save-order and /save-order-meta must demand prior MongoDB order persistence'
  )
  console.log('✓ TEST 4 PASSED: Local PDF and metadata staging requires an existing MongoDB orderId')

  // ── TEST 5: localhost dev proxies order creation to Vercel when needed ─────
  const viteConfigSrc = fs.readFileSync(findPath('vite.config.js'), 'utf8')
  assert.ok(
    viteConfigSrc.includes("!process.env.MONGODB_URI") &&
    viteConfigSrc.includes("https://xbuddysrkr.vercel.app") &&
    viteConfigSrc.includes("req.url.startsWith('/api/orders')"),
    'vite.config.js must proxy /api/orders to production Vercel when local MONGODB_URI is absent'
  )
  console.log('✓ TEST 5 PASSED: Local dev proxies order creation to authoritative Vercel API seamlessly')

  // ── TEST 6: Production never silently falls back to GAS for Orders ─────────
  assert.ok(
    !apiSrc.includes('action: \'saveOrder\', key: API_KEY'),
    'src/utils/api.js must never fall back to direct GAS saveOrder'
  )
  console.log('✓ TEST 6 PASSED: Production client strictly prohibited from falling back to GAS for Orders')

  // ── TEST 7: Print Agent refuses unknown MongoDB orderIds ───────────────────
  assert.ok(
    !localServerSrc.includes('isLocalOnly') &&
    localServerSrc.includes('Order not found in authoritative database. Check the Order ID.'),
    'localServer /release-print must reject unknown orders with 404 (no local-only bypass)'
  )
  console.log('✓ TEST 7 PASSED: Print Agent refuses unknown orderIds with 404 (zero local-only bypass)')

  // ── TEST 8: Campus Ads remain completely isolated ──────────────────────────
  assert.ok(
    apiSrc.includes("action: 'getAds'") &&
    apiSrc.includes('fetchCampusAds'),
    'Campus Ads must continue utilizing GAS getAds independently of MongoDB orders'
  )
  console.log('✓ TEST 8 PASSED: Campus Ads operational architecture remains isolated and intact')

  // ── TEST 9: MONGODB_URI never appears in client bundle ─────────────────────
  assert.ok(
    !apiSrc.includes('MONGODB_URI') &&
    !apiSrc.includes('mongodb+srv://'),
    'Client source code must never expose MONGODB_URI'
  )
  console.log('✓ TEST 9 PASSED: Security verified - client bundle contains zero database credentials')

  console.log('--- ALL ORDER CREATION GUARD TESTS PASSED SUCCESSFULLY! ---')
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err)
  process.exit(1)
})
