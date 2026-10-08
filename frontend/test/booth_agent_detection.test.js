import assert from 'node:assert/strict'
import http from 'http'
import { isAgentAvailable, getAgentStatus } from '../src/utils/api.js'

console.log('--- STARTING BOOTH AGENT DETECTION INTEGRATION TESTS ---')

// TEST 1: Live Local Agent Detection (Requirement 2 & 3 & 12)
// Local agent online + printer.available === true + printer.status === 'Ready' => isAgentAvailable === true
console.log('\n[TEST 1] Testing live agent status query at http://127.0.0.1:3001/status...')
const status = await getAgentStatus()
console.log('Detected agent status:', JSON.stringify(status, null, 2))

assert.equal(status.available, true, 'TEST 1 FAILED: Live agent should be recognized as available')
assert.equal(status.agent, 'online', 'TEST 1 FAILED: Agent should be "online"')
assert.equal(status.printer?.available, true, 'TEST 1 FAILED: Printer available should be true')
assert.equal(status.printer?.status, 'Ready', 'TEST 1 FAILED: Printer status should be "Ready"')

const isAvailable = await isAgentAvailable()
assert.equal(isAvailable, true, 'TEST 1 FAILED: isAgentAvailable() must return true for healthy local agent')
console.log('✓ TEST 1 PASSED: Local agent online + Ready => Booth Print Station Connected')

// TEST 2: Private Network Access (PNA) and CORS Preflight from production origin
console.log('\n[TEST 2] Testing CORS and PNA preflight OPTIONS from https://xbuddysrkr.vercel.app...')
const pnaResult = await new Promise((resolve, reject) => {
  const req = http.request('http://127.0.0.1:3001/status', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://xbuddysrkr.vercel.app',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Private-Network': 'true'
    }
  }, (res) => {
    resolve({
      statusCode: res.statusCode,
      allowOrigin: res.headers['access-control-allow-origin'],
      allowPna: res.headers['access-control-allow-private-network']
    })
  })
  req.on('error', reject)
  req.end()
})

assert.equal(pnaResult.statusCode, 204, 'TEST 2 FAILED: OPTIONS should return 204')
assert.equal(pnaResult.allowOrigin, 'https://xbuddysrkr.vercel.app', 'TEST 2 FAILED: Access-Control-Allow-Origin must match production origin')
assert.equal(pnaResult.allowPna, 'true', 'TEST 2 FAILED: Access-Control-Allow-Private-Network must be true')
console.log('✓ TEST 2 PASSED: PNA preflight allows https://xbuddysrkr.vercel.app with Access-Control-Allow-Private-Network')

// TEST 3: Negative Test - Reject Untrusted Origins (Requirement 6)
console.log('\n[TEST 3] Testing that untrusted origins are NOT allowed...')
const untrustedResult = await new Promise((resolve, reject) => {
  const req = http.request('http://127.0.0.1:3001/status', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://malicious-site.example.com',
      'Access-Control-Request-Method': 'GET'
    }
  }, (res) => {
    resolve({
      allowOrigin: res.headers['access-control-allow-origin']
    })
  })
  req.on('error', reject)
  req.end()
})

assert.notEqual(untrustedResult.allowOrigin, 'https://malicious-site.example.com', 'TEST 3 FAILED: Untrusted origin must not be allowed')
assert.notEqual(untrustedResult.allowOrigin, '*', 'TEST 3 FAILED: Wildcard * must not be returned')
console.log('✓ TEST 3 PASSED: Local agent restricts CORS strictly to authorized origins')

// TEST 4: State Contract Verification (Offline or Degraded State Handling)
console.log('\n[TEST 4] Testing contract evaluation logic for degraded states...')
// If agent returns printer.available: false, isAgentAvailable must be false
const originalFetch = global.fetch
try {
  // Mock degraded printer status
  global.fetch = async (url) => {
    if (String(url).includes('/status')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          agent: 'online',
          printer: {
            name: 'EPSON L130 Series',
            available: false,
            status: 'Offline'
          }
        })
      }
    }
    return originalFetch(url)
  }

  const degradedStatus = await isAgentAvailable()
  assert.equal(degradedStatus, false, 'TEST 4 FAILED: Degraded printer must cause isAgentAvailable() to be false')
  console.log('✓ TEST 4 PASSED: Printer offline/unavailable results in Print Station Offline safe state')
} finally {
  global.fetch = originalFetch
}

console.log('\n=== ALL BOOTH AGENT DETECTION TESTS PASSED SUCCESSFULLY! ===\n')
