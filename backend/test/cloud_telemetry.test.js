import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..', '..')

test('Cloud Telemetry & Heartbeat Architecture - Comprehensive Verification', async (t) => {

  await t.test('1. Heartbeat Handler: authentication enforcement via x-agent-key', async () => {
    const heartbeatPath = path.join(ROOT_DIR, 'backend', 'api', 'agent', 'heartbeat.js')
    assert.ok(fs.existsSync(heartbeatPath), 'heartbeat.js must exist')

    const module = await import('../api/agent/heartbeat.js')
    const handler = module.default
    assert.strictEqual(typeof handler, 'function', 'Heartbeat module must export default handler function')

    // Mock response object
    function createMockRes() {
      const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        setHeader(k, v) { this.headers[k] = v; return this },
        status(code) { this.statusCode = code; return this },
        json(data) { this.jsonData = data; return this },
        end() { return this },
      }
      return res
    }

    // A) Missing auth
    const resNoAuth = createMockRes()
    await handler({ method: 'POST', headers: {}, body: {} }, resNoAuth)
    assert.strictEqual(resNoAuth.statusCode, 401, 'Must reject requests without x-agent-key with 401')
    assert.strictEqual(resNoAuth.jsonData?.success, false)

    // B) Invalid auth
    const resBadAuth = createMockRes()
    await handler({ method: 'POST', headers: { 'x-agent-key': 'completely_wrong_key' }, body: {} }, resBadAuth)
    assert.strictEqual(resBadAuth.statusCode, 401, 'Must reject requests with wrong x-agent-key with 401')

    // C) OPTIONS Preflight
    const resOptions = createMockRes()
    await handler({ method: 'OPTIONS', headers: {} }, resOptions)
    assert.strictEqual(resOptions.statusCode, 200, 'OPTIONS preflight must return 200')
    assert.strictEqual(resOptions.headers['Access-Control-Allow-Origin'], '*')
  })

  await t.test('2. Heartbeat Service: outbound payload structure and authoritative endpoint', async () => {
    const hbServicePath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'heartbeat.js')
    assert.ok(fs.existsSync(hbServicePath), 'print-agent heartbeat.js service must exist')
    const content = fs.readFileSync(hbServicePath, 'utf8')

    assert.match(content, /xbuddysrkr\.vercel\.app/, 'Must default to authoritative Vercel domain')
    assert.match(content, /\/api\/agent\/heartbeat/, 'Must target /api/agent/heartbeat endpoint')
    assert.match(content, /stationId/, 'Payload must include stationId')
    assert.match(content, /agentVersion/, 'Payload must include agentVersion')
    assert.match(content, /printerName/, 'Payload must include printerName')
    assert.match(content, /printerAvailable/, 'Payload must include printerAvailable')
    assert.match(content, /timestamp/, 'Payload must include timestamp')
    assert.match(content, /uptimeSeconds/, 'Payload must include uptimeSeconds')
    assert.match(content, /systemInfo/, 'Payload must include systemInfo')
    assert.match(content, /x-agent-key/, 'Request headers must include x-agent-key')
  })

  await t.test('3. Local Server /status: cloud telemetry object conforms to contract', async () => {
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const content = fs.readFileSync(serverPath, 'utf8')

    assert.match(content, /cloud:\s*\{/, 'GET /status must include cloud object')
    assert.match(content, /connected:\s*Boolean\(heartbeatInfo\?\.success\)/, 'cloud object must report connected status')
    assert.match(content, /apiUrl:\s*currentConfig\.cloudApiUrl/, 'cloud object must report apiUrl')
    assert.match(content, /lastHeartbeat:/, 'cloud object must report lastHeartbeat')
    assert.match(content, /error:\s*heartbeatInfo\?\.error/, 'cloud object must report error message')
  })

  await t.test('4. Legacy Cloudflare Tunnel Decoupling: heartbeat works without tunnel', async () => {
    const indexPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'index.js')
    const indexContent = fs.readFileSync(indexPath, 'utf8')

    // Local server initializes agent services
    assert.match(indexContent, /startLocalServer\(\)/, 'index.js must start the local server')
    assert.match(indexContent, /ENABLE_LEGACY_TUNNEL/, 'Legacy tunnel must be gated by optional flag')

    const localServerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const serverContent = fs.readFileSync(localServerPath, 'utf8')
    assert.match(serverContent, /startHeartbeat/, 'startLocalServer must start heartbeat service')

    const tunnelPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'tunnel.js')
    const tunnelContent = fs.readFileSync(tunnelPath, 'utf8')
    assert.doesNotMatch(tunnelContent, /Tunnel URL not found in log after timeout — mobile orders may not reach agent/, 'Misleading tunnel timeout warning must be removed')
  })

  await t.test('5. Vercel & Render Routing: api/ endpoints exist and are exposed', async () => {
    const vercelJsonPath = path.join(ROOT_DIR, 'vercel.json')
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist')
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'))

    const hasHeartbeatRewrite = vercelConfig.rewrites?.some(r => r.source === '/api/agent/heartbeat' || r.source === '/api/:match*')
    assert.ok(hasHeartbeatRewrite, 'vercel.json must have rewrite proxying api requests to backend')

    const rootHeartbeatApi = path.join(ROOT_DIR, 'api', 'agent', 'heartbeat.js')
    assert.ok(fs.existsSync(rootHeartbeatApi), 'Root api/agent/heartbeat.js adapter must exist for Vercel functions')

    const rootOrdersApi = path.join(ROOT_DIR, 'api', 'agent', 'orders.js')
    assert.ok(fs.existsSync(rootOrdersApi), 'Root api/agent/orders.js adapter must exist for Vercel functions')

    const serverPath = path.join(ROOT_DIR, 'backend', 'server.js')
    const serverContent = fs.readFileSync(serverPath, 'utf8')
    assert.match(serverContent, /agentHeartbeatHandler/, 'backend/server.js must mount agentHeartbeatHandler')
  })

  await t.test('6. Security Audit: Zero hardcoded secrets in git-tracked code', async () => {
    const filesToCheck = [
      path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'config.js'),
      path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'sheets.js'),
      path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'updater.js'),
      path.join(ROOT_DIR, 'backend', 'api', 'agent', 'heartbeat.js'),
      path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs'),
    ]

    const leakedHex = 'd834c5055c2a2401ee3f59cd121f59258403156e86034eab956dc099351dd9e4'
    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf8')
        assert.doesNotMatch(text, new RegExp(leakedHex, 'i'), `File ${path.basename(filePath)} must not contain exposed secret`)
      }
    }
  })
})
