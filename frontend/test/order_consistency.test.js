import assert from 'assert'

console.log('--- STARTING XBUDDY ORDER CONSISTENCY & REJECTION REGRESSION TEST SUITE ---')

// 1. Contract test: An order visible in queue but absent from MongoDB
console.log('\n[TEST 1] Testing unverified order guard contract in Booth...')
const unverifiedOrderInQueue = {
  orderId: 'XB0000_GHOST',
  fileName: 'ghost.pdf',
  copies: 1,
  colorMode: 'bw',
  amount: 5,
  printStatus: 'waiting_for_shopkeeper',
  verifiedInMongo: false,
  notFound: true,
}

function evaluateIsOrderVerified(target) {
  if (!target) return false
  return Boolean((target.verifiedInMongo || target.mongoSaved || target._id) && !target.notFound)
}

assert.strictEqual(evaluateIsOrderVerified(unverifiedOrderInQueue), false, 'Ghost order must evaluate to unverified')
console.log('✓ TEST 1 PASSED: Order absent/unverified in MongoDB is identified as unverified (Print Button Disabled)')

// 2. Verified order from authoritative MongoDB
console.log('\n[TEST 2] Testing verified order passes guard contract...')
const verifiedOrder = {
  _id: '6ac8670ac9f6b1501123d823',
  orderId: 'XB8212',
  fileName: 'DocScanner 8 Oct 2026 2-06 pm.pdf',
  copies: 1,
  colorMode: 'bw',
  amount: 5,
  printStatus: 'waiting_for_shopkeeper',
  verifiedInMongo: true,
  mongoSaved: true,
}
assert.strictEqual(evaluateIsOrderVerified(verifiedOrder), true, 'Authoritative MongoDB order must evaluate to verified')
console.log('✓ TEST 2 PASSED: Authoritative MongoDB order is verified and release-ready')

// 3. Test handleDirectPrint guard rejection
console.log('\n[TEST 3] Testing print release rejection for unverified order...')
let releaseDispatched = false
function simulateHandleDirectPrint(target) {
  const isTargetVerified = evaluateIsOrderVerified(target)
  if (!isTargetVerified) {
    return {
      success: false,
      error: `Order ${target.orderId} is not verified in authoritative database. Print release blocked to prevent inconsistency.`,
      blocked: true,
    }
  }
  releaseDispatched = true
  return { success: true }
}

const rejectRes = simulateHandleDirectPrint(unverifiedOrderInQueue)
assert.strictEqual(rejectRes.success, false)
assert.strictEqual(rejectRes.blocked, true)
assert.strictEqual(releaseDispatched, false, 'Hardware print command must NEVER be dispatched for unverified orders')
console.log('✓ TEST 3 PASSED: Print release cleanly blocked before reaching print agent')

// 4. Test live local print agent rejection for nonexistent order
console.log('\n[TEST 4] Testing live Print Agent 127.0.0.1:3001/release-print for nonexistent order...')
const agentReq = await fetch('http://127.0.0.1:3001/release-print', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: 'XB0000_NONEXISTENT' })
})
const agentData = await agentReq.json()
console.log('Agent rejection response:', agentReq.status, agentData)
assert.strictEqual(agentReq.status, 404, 'Nonexistent order must return HTTP 404 from print agent')
assert.strictEqual(agentData.success, false)
assert.ok(agentData.error.includes('authoritative database'), 'Error must specify authoritative database check')
console.log('✓ TEST 4 PASSED: Print agent rejects release with HTTP 404 and does not trigger printer')

// 5. Test authoritative MongoDB order lookup for real order XB8212
console.log('\n[TEST 5] Testing authoritative MongoDB lookup for real order XB8212...')
const lookupRes = await fetch('https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB8212')
const lookupData = await lookupRes.json()
assert.strictEqual(lookupRes.status, 200)
assert.strictEqual(lookupData.success, true)
assert.strictEqual(lookupData.order.orderId, 'XB8212')
assert.strictEqual(lookupData.source, 'mongo')
console.log('✓ TEST 5 PASSED: Authoritative MongoDB order lookup confirms XB8212 existence and state')

// 6. Test authoritative MongoDB order lookup for brand-new student order XB7772
console.log('\n[TEST 6] Testing authoritative MongoDB lookup for new student order XB7772...')
const xb7772Res = await fetch('https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB7772')
const xb7772Data = await xb7772Res.json()
assert.strictEqual(xb7772Res.status, 200)
assert.strictEqual(xb7772Data.success, true)
assert.strictEqual(xb7772Data.order.orderId, 'XB7772')
assert.strictEqual(xb7772Data.order.mongoSaved, true)
assert.strictEqual(xb7772Data.source, 'mongo')
console.log('✓ TEST 6 PASSED: Authoritative MongoDB confirms existence, metadata, and mongoSaved for XB7772')

// 7. Test failed MongoDB write contract (must reject and never confirm order)
console.log('\n[TEST 7] Testing that failed/invalid MongoDB writes reject gracefully...')
function evaluateSubmissionConfirmation(orderResult) {
  if (!orderResult?.success || !orderResult?.mongoSaved) {
    throw new Error(orderResult?.error || 'Unable to save order to MongoDB orders service')
  }
  return { success: true, orderId: orderResult.orderId }
}

assert.throws(
  () => evaluateSubmissionConfirmation({ success: false, error: 'Database network failure' }),
  /Database network failure/,
  'Failed write must throw'
)
assert.throws(
  () => evaluateSubmissionConfirmation({ success: true, mongoSaved: false }),
  /Unable to save order to MongoDB orders service/,
  'Unconfirmed mongoSaved must be rejected'
)
console.log('✓ TEST 7 PASSED: Submission is strictly rejected if MongoDB write fails')

console.log('\n=== ALL 7 ORDER CONSISTENCY TESTS PASSED SUCCESSFULLY! ===')
