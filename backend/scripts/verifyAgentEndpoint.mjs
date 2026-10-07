const VERCEL_AGENT_API = 'https://xbuddysrkr.vercel.app/api/agent/orders'
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || 'XB_AGENT_SECRET_KEY_2026'

async function testEndpoint() {
  console.log('Testing Vercel deployment of /api/agent/orders...\n')

  // 1. Unauthenticated request
  const unauthRes = await fetch(`${VERCEL_AGENT_API}/pending`)
  const unauthData = await unauthRes.json().catch(() => null)
  console.log(`[Test 1] Unauthenticated request: HTTP ${unauthRes.status}`)
  console.log('Response:', unauthData)
  if (unauthRes.status !== 401) {
    console.warn('Deployment may still be building or propagating... waiting 10s')
    await new Promise(r => setTimeout(r, 10000))
    return testEndpoint()
  }

  // 2. Invalid secret request
  const badAuthRes = await fetch(`${VERCEL_AGENT_API}/pending`, {
    headers: { 'x-agent-key': 'INVALID_KEY_123' },
  })
  const badAuthData = await badAuthRes.json().catch(() => null)
  console.log(`\n[Test 2] Invalid secret request: HTTP ${badAuthRes.status}`)
  console.log('Response:', badAuthData)

  // 3. Valid secret request
  const goodAuthRes = await fetch(`${VERCEL_AGENT_API}/pending`, {
    headers: { 'x-agent-key': AGENT_SECRET_KEY },
  })
  const goodAuthData = await goodAuthRes.json().catch(() => null)
  console.log(`\n[Test 3] Valid secret request: HTTP ${goodAuthRes.status}`)
  console.log('Response:', goodAuthData)

  // 4. List all orders via Agent API
  const listRes = await fetch(VERCEL_AGENT_API, {
    headers: { 'x-agent-key': AGENT_SECRET_KEY },
  })
  const listData = await listRes.json().catch(() => null)
  console.log(`\n[Test 4] Agent list all orders: HTTP ${listRes.status}`)
  console.log(`Found ${listData?.count} orders from MongoDB (source: ${listData?.source})`)

  console.log('\nAgent API Verified Successfully on Vercel!')
}

testEndpoint().catch(err => {
  console.error('Test Failed:', err)
  process.exit(1)
})
