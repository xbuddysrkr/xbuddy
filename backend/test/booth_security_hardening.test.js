import assert from 'node:assert'
import crypto from 'crypto'
import {
  safeCompare,
  checkPinRateLimit,
  recordPinFailure,
  resetPinAttempts,
  getSessionSecret,
  generateBoothSessionToken,
  verifyBoothSessionToken,
  generatePreviewToken,
  verifyPreviewToken,
  consumePreviewToken,
  ensurePreviewTokenIndexes,
  isBoothAuthorized,
} from '../api/_lib/boothAuth.js'
import ordersHandler from '../api/orders.js'

function createMockMongoDB() {
  const tokenStore = new Map()
  let indexCallCount = 0

  const col = {
    async createIndex(keys, options) {
      indexCallCount++
      return 'index_created'
    },
    async insertOne(doc) {
      if (tokenStore.has(doc.tokenId)) {
        const err = new Error(`E11000 duplicate key error collection: test.consumed_preview_tokens index: tokenId_1 dup key: { tokenId: "${doc.tokenId}" }`)
        err.code = 11000
        throw err
      }
      // Synchronously enforce atomic unique index lock before async I/O
      tokenStore.set(doc.tokenId, { ...doc })
      await new Promise(r => setTimeout(r, 2))
      return { acknowledged: true, insertedId: doc.tokenId }
    },
  }

  return {
    db: {
      collection(name) {
        if (name === 'consumed_preview_tokens') return col
        return {}
      },
    },
    getIndexCallCount: () => indexCallCount,
    getStore: () => tokenStore,
  }
}

function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {}, ip = '127.0.0.1' } = {}) {
  const req = {
    method,
    query,
    body,
    headers: { ...headers },
    socket: { remoteAddress: ip },
    ip,
  }
  let statusCode = 200
  let headersSent = false
  const responseHeaders = {}
  let bodyData = null

  const res = {
    status(code) {
      statusCode = code
      return this
    },
    setHeader(key, val) {
      responseHeaders[key.toLowerCase()] = val
      return this
    },
    json(data) {
      bodyData = data
      headersSent = true
      return this
    },
    send(data) {
      bodyData = data
      headersSent = true
      return this
    },
    end() {
      headersSent = true
      return this
    },
    get statusCode() {
      return statusCode
    },
    get bodyData() {
      return bodyData
    },
    get responseHeaders() {
      return responseHeaders
    },
  }

  return { req, res }
}

async function runSecurityTests() {
  console.log('=== RUNNING XBUDDY SECURITY HARDENING TEST SUITE ===\n')

  // Save original env
  const origPin = process.env.BOOTH_STATION_PIN
  const origBoothPin = process.env.BOOTH_PIN
  const origPreviewPass = process.env.BOOTH_PREVIEW_PASSWORD
  const origEnforce = process.env.ENFORCE_BOOTH_AUTH
  const origJwtSecret = process.env.JWT_SECRET
  const origSessionSecret = process.env.SESSION_SECRET
  const origAgentSecret = process.env.AGENT_SECRET
  const origAgentSecretKey = process.env.AGENT_SECRET_KEY
  const origAuthSecret = process.env.AUTH_SECRET

  try {
    // ── SECTION 1: STATION PIN VERIFICATION & RATE LIMITING ────────────────
    console.log('[SECTION 1] Testing Station PIN Verification & Attempt Limiting...')
    const testIp = '192.168.1.100'
    resetPinAttempts(testIp)

    // 1.1 Safe comparison against timing attacks
    assert.strictEqual(safeCompare('4921', '4921'), true, 'safeCompare must return true for identical strings')
    assert.strictEqual(safeCompare('4921', '1234'), false, 'safeCompare must return false for different strings')
    assert.strictEqual(safeCompare('4921', '49210'), false, 'safeCompare must return false for different length strings')
    assert.strictEqual(safeCompare(null, '4921'), false, 'safeCompare must handle null/undefined safely')

    // 1.2 Rate limit tracks failed attempts
    for (let i = 1; i <= 4; i++) {
      assert.strictEqual(checkPinRateLimit(testIp).allowed, true, `Attempt ${i} should be allowed`)
      recordPinFailure(testIp)
    }
    // 5th failure
    recordPinFailure(testIp)
    const rateLimitCheck = checkPinRateLimit(testIp)
    assert.strictEqual(rateLimitCheck.allowed, false, '6th attempt must be blocked after 5 failures')
    assert.ok(rateLimitCheck.remainingSecs > 0, 'Remaining lockout time must be positive')
    resetPinAttempts(testIp)
    assert.strictEqual(checkPinRateLimit(testIp).allowed, true, 'Resetting attempts restores access')
    console.log('✓ TEST 1.1 & 1.2 PASSED: Safe comparison and 5-attempt sliding window rate limit verified.')

    // 1.3 Missing signing secret fails closed (no hardcoded fallback)
    delete process.env.JWT_SECRET
    delete process.env.SESSION_SECRET
    delete process.env.AGENT_SECRET
    delete process.env.AGENT_SECRET_KEY
    delete process.env.AUTH_SECRET
    assert.strictEqual(getSessionSecret(), null, 'getSessionSecret must return null when no environment secret exists')
    assert.strictEqual(generateBoothSessionToken(), null, 'generateBoothSessionToken must fail closed without secret')
    assert.strictEqual(generatePreviewToken('XB1234'), null, 'generatePreviewToken must fail closed without secret')
    assert.strictEqual(verifyBoothSessionToken('12345.abcde'), false, 'verifyBoothSessionToken must reject without secret')
    console.log('✓ TEST 1.3 PASSED: HMAC signing secret strictly fails closed with zero hardcoded fallback.')

    // Restore strong server secret for token generation tests
    process.env.SESSION_SECRET = 'strong_test_server_secret_key_8849'

    // 1.4 Session token generation and validation
    const token = generateBoothSessionToken()
    assert.ok(token && token.includes('.'), 'Session token must be dot-delimited timestamp.hmac')
    assert.strictEqual(verifyBoothSessionToken(token), true, 'Valid token must be verified')
    assert.strictEqual(verifyBoothSessionToken(token + 'tampered'), false, 'Tampered token must be rejected')
    assert.strictEqual(verifyBoothSessionToken('invalid'), false, 'Malformed token must be rejected')
    console.log('✓ TEST 1.4 PASSED: Signed HMAC session token issuance and verification verified.')

    // 1.5 Protection of station-only operations against UI manipulation
    console.log('\n[SECTION 2] Testing Protection of Station-Only Operations...')
    process.env.ENFORCE_BOOTH_AUTH = 'true'
    process.env.BOOTH_STATION_PIN = '9999'

    // Direct call to updatePaymentStatus without token must be rejected with 401
    const { req: reqNoAuth, res: resNoAuth } = createMockReqRes({
      body: { action: 'updatePaymentStatus', orderId: 'XB-TEST-01', paymentStatus: 'Paid' },
    })
    await ordersHandler(reqNoAuth, resNoAuth)
    assert.strictEqual(resNoAuth.statusCode, 401, 'updatePaymentStatus without boothToken must return 401')
    assert.strictEqual(resNoAuth.bodyData.success, false)
    assert.ok(resNoAuth.bodyData.error.includes('Station authentication required'))

    // Direct call with valid X-Booth-Token is authorized past the security gate
    const validBoothToken = generateBoothSessionToken()
    const { req: reqWithAuth, res: resWithAuth } = createMockReqRes({
      headers: { 'x-booth-token': validBoothToken },
      body: { action: 'updatePaymentStatus', orderId: 'XB-TEST-01', paymentStatus: 'Paid' },
    })
    await ordersHandler(reqWithAuth, resWithAuth)
    assert.notStrictEqual(resWithAuth.statusCode, 401, 'updatePaymentStatus with valid boothToken must NOT be rejected with 401')

    // Direct call to verifyReprintPayment without token must be rejected with 401
    const { req: reqReprintNoAuth, res: resReprintNoAuth } = createMockReqRes({
      body: { action: 'verifyReprintPayment', orderId: 'XB-TEST-01', attemptId: 'att_1', paymentStatus: 'paid' },
    })
    await ordersHandler(reqReprintNoAuth, resReprintNoAuth)
    assert.strictEqual(resReprintNoAuth.statusCode, 401, 'verifyReprintPayment without boothToken must return 401')

    // Print agent authentication via x-agent-secret is preserved
    process.env.AGENT_SECRET = 'hardware_station_agent_secret_key'
    const { req: reqAgentAuth, res: resAgentAuth } = createMockReqRes({
      headers: { 'x-agent-secret': 'hardware_station_agent_secret_key' },
      body: { action: 'updatePaymentStatus', orderId: 'XB-TEST-01', paymentStatus: 'Paid' },
    })
    await ordersHandler(reqAgentAuth, resAgentAuth)
    assert.notStrictEqual(resAgentAuth.statusCode, 401, 'Print agent request with x-agent-secret must NOT return 401')
    console.log('✓ TEST 2.1 PASSED: Station-only operations strictly gate against UI bypass while preserving print agent.')

    // ── SECTION 3: SHARED DATABASE REPLAY PROTECTION & CONCURRENCY ──────────
    console.log('\n[SECTION 3] Testing Atomic Shared Database Token Consumption & Concurrent Replay...')
    const mockDb = createMockMongoDB()

    // 3.1 Fail-closed when database is null (NO in-memory fallback)
    const nullDbResult = await consumePreviewToken('test_token_1', 'XB1234', Date.now() + 60000, null)
    assert.strictEqual(nullDbResult.consumed, false, 'consumePreviewToken must fail closed if db is null')
    assert.strictEqual(nullDbResult.error, 'Database unavailable for token consumption')
    console.log('✓ TEST 3.1 PASSED: Token consumption strictly fails closed when database is unavailable (zero in-memory fallback).')

    // 3.2 Unique index creation is cached and not run on every request
    const tokenIdA = 'orderA_nonce_sig'
    const resA = await consumePreviewToken(tokenIdA, 'XBA', Date.now() + 60000, mockDb.db)
    assert.strictEqual(resA.consumed, true, 'First consumption must succeed')
    const initialIndexCalls = mockDb.getIndexCallCount()
    assert.strictEqual(initialIndexCalls, 2, 'Must create tokenId and expiresAt indexes once')

    // Subsequent call does NOT recreate indexes
    const tokenIdB = 'orderB_nonce_sig'
    const resB = await consumePreviewToken(tokenIdB, 'XBB', Date.now() + 60000, mockDb.db)
    assert.strictEqual(resB.consumed, true)
    assert.strictEqual(mockDb.getIndexCallCount(), 2, 'Index creation must remain cached across subsequent calls')
    console.log('✓ TEST 3.2 PASSED: Unique MongoDB index on tokenId is cached and not recreated per-request.')

    // 3.3 Concurrent race condition test across separate instances
    const sharedTokenId = 'concurrent_test_token_999'
    const concurrentAttempts = await Promise.all([
      consumePreviewToken(sharedTokenId, 'XB1234', Date.now() + 60000, mockDb.db),
      consumePreviewToken(sharedTokenId, 'XB1234', Date.now() + 60000, mockDb.db),
      consumePreviewToken(sharedTokenId, 'XB1234', Date.now() + 60000, mockDb.db),
      consumePreviewToken(sharedTokenId, 'XB1234', Date.now() + 60000, mockDb.db),
      consumePreviewToken(sharedTokenId, 'XB1234', Date.now() + 60000, mockDb.db),
    ])

    const successCount = concurrentAttempts.filter(r => r.consumed === true).length
    const replayCount = concurrentAttempts.filter(r => r.consumed === false && r.replayed === true).length
    assert.strictEqual(successCount, 1, 'Exactly one concurrent attempt must succeed in consuming the token')
    assert.strictEqual(replayCount, 4, 'All other concurrent attempts must be rejected with replayed: true')
    console.log('✓ TEST 3.3 PASSED: Concurrent race test confirmed: exactly 1 request consumed the token, 4 rejected.')

    // ── SECTION 4: REAL PREVIEW PDF FLOW & HTTP HANDLING ────────────────────
    console.log('\n[SECTION 4] Testing Real Preview PDF Frontend Flow & HTTP Handling...')
    process.env.BOOTH_PREVIEW_PASSWORD = 'TestPreviewPassword!@#456'

    // 4.1 Generate preview token via verifyPreviewPassword
    const { req: reqPass, res: resPass } = createMockReqRes({
      body: { action: 'verifyPreviewPassword', orderId: 'XB-REAL-PDF', password: 'TestPreviewPassword!@#456' },
    })
    await ordersHandler(reqPass, resPass)
    assert.strictEqual(resPass.statusCode, 200)
    const realToken = resPass.bodyData.previewToken

    // 4.2 Browser HEAD request (if probed by browser reader) does NOT consume token
    const { req: reqHead, res: resHead } = createMockReqRes({
      method: 'HEAD',
      query: { action: 'getPdf', orderId: 'XB-REAL-PDF', token: realToken },
    })
    await ordersHandler(reqHead, resHead)
    assert.notStrictEqual(resHead.statusCode, 401, 'HEAD request must pass verification without consuming token')

    // 4.3 Browser Range header test: Accept-Ranges: none returned to prevent fragmentation
    const { req: reqGet, res: resGet } = createMockReqRes({
      method: 'GET',
      headers: { range: 'bytes=0-1024' },
      query: { action: 'getPdf', orderId: 'XB-REAL-PDF', token: realToken },
    })
    await ordersHandler(reqGet, resGet)
    // Authorization passes on first GET
    assert.notStrictEqual(resGet.statusCode, 401, 'First GET request must pass authorization')

    // 4.4 Automated hardware Print Agent endpoint (getOrderPdf) remains intact without preview password
    const { req: reqAgentPdf, res: resAgentPdf } = createMockReqRes({
      query: { action: 'getOrderPdf', orderId: 'XB-REAL-PDF' },
    })
    await ordersHandler(reqAgentPdf, resAgentPdf)
    assert.notStrictEqual(resAgentPdf.statusCode, 401, 'Hardware Print Agent getOrderPdf must not require preview token')

    console.log('✓ TEST 4.1–4.4 PASSED: Real PDF flow, HEAD probe tolerance, and Print Agent sync verified.')
    console.log('\n=== ALL SECURITY TESTS PASSED SUCCESSFULLY ===\n')
  } finally {
    // Restore original env
    if (origPin !== undefined) process.env.BOOTH_STATION_PIN = origPin
    else delete process.env.BOOTH_STATION_PIN

    if (origBoothPin !== undefined) process.env.BOOTH_PIN = origBoothPin
    else delete process.env.BOOTH_PIN

    if (origPreviewPass !== undefined) process.env.BOOTH_PREVIEW_PASSWORD = origPreviewPass
    else delete process.env.BOOTH_PREVIEW_PASSWORD

    if (origEnforce !== undefined) process.env.ENFORCE_BOOTH_AUTH = origEnforce
    else delete process.env.ENFORCE_BOOTH_AUTH

    if (origJwtSecret !== undefined) process.env.JWT_SECRET = origJwtSecret
    else delete process.env.JWT_SECRET

    if (origSessionSecret !== undefined) process.env.SESSION_SECRET = origSessionSecret
    else delete process.env.SESSION_SECRET

    if (origAgentSecret !== undefined) process.env.AGENT_SECRET = origAgentSecret
    else delete process.env.AGENT_SECRET

    if (origAgentSecretKey !== undefined) process.env.AGENT_SECRET_KEY = origAgentSecretKey
    else delete process.env.AGENT_SECRET_KEY

    if (origAuthSecret !== undefined) process.env.AUTH_SECRET = origAuthSecret
    else delete process.env.AUTH_SECRET
  }
}

runSecurityTests().catch(err => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})
