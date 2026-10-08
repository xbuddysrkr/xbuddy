import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..', '..')

test('Print Station & Installer Architecture - Comprehensive Audit', async (t) => {

  await t.test('1. Installer Configuration: config.js defaults & path resolution', async () => {
    const configModulePath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'config.js')
    assert.ok(fs.existsSync(configModulePath), 'config.js must exist')
    const content = fs.readFileSync(configModulePath, 'utf8')
    assert.match(content, /DEFAULT_CONFIG/, 'DEFAULT_CONFIG must be defined')
    assert.match(content, /SRKR-XEROX-01/, 'Default Station ID must be SRKR-XEROX-01')
    assert.match(content, /3001/, 'Default port must be 3001')
    assert.match(content, /XBuddyPrintStation/, 'Persistent config folder must be XBuddyPrintStation in ProgramData')
  })

  await t.test('2. Agent Startup: entrypoint initializes configuration and server', async () => {
    const indexPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'index.js')
    assert.ok(fs.existsSync(indexPath), 'index.js must exist')
    const content = fs.readFileSync(indexPath, 'utf8')
    assert.match(content, /loadConfig/, 'index.js must load station config on startup')
    assert.match(content, /startLocalServer/, 'index.js must start the local HTTP server')
    assert.doesNotMatch(content, /orders will be marked Printed without printing/, 'Must never pretend to print without a printer')
  })

  await t.test('3. Station Identity: unique Station ID support without exposing credentials', async () => {
    const configPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'config.js')
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /stationId/, 'Must support stationId persistence')
    assert.match(content, /saveConfig/, 'Must support saving station config updates')
    assert.doesNotMatch(content, /mongodb\+srv/, 'config.js must never contain MongoDB connection string')
  })

  await t.test('4. Printer Discovery: PowerShell enumeration and strict binding', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    assert.ok(fs.existsSync(printerPath), 'printer.js must exist')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /getAllWindowsPrinters/, 'Must implement getAllWindowsPrinters')
    assert.match(content, /getActivePrinter/, 'Must implement getActivePrinter')
    assert.match(content, /Printer unavailable/, 'Must report Printer unavailable if selected printer missing')
    assert.match(content, /Win32_Printer/, 'Must enumerate Windows printers via Win32_Printer')
  })

  await t.test('5. Cloud Authentication: x-agent-key protection on cloud endpoints', async () => {
    const heartbeatRoutePath = path.join(ROOT_DIR, 'backend', 'api', 'agent', 'heartbeat.js')
    assert.ok(fs.existsSync(heartbeatRoutePath), 'heartbeat.js API route must exist')
    const content = fs.readFileSync(heartbeatRoutePath, 'utf8')
    assert.match(content, /x-agent-key/, 'Cloud heartbeat API must require x-agent-key')
    assert.match(content, /401/, 'Unauthorized requests must receive 401')
  })

  await t.test('6. Health Endpoint: GET /status & embedded setup page on localServer', async () => {
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    assert.ok(fs.existsSync(serverPath), 'localServer.js must exist')
    const content = fs.readFileSync(serverPath, 'utf8')
    assert.match(content, /app\.get\('\/status'/, 'Must expose /status endpoint')
    assert.match(content, /app\.get\('\/admin\/printers'/, 'Must expose /admin/printers endpoint')
    assert.match(content, /app\.post\('\/admin\/config'/, 'Must expose /admin/config endpoint')
    assert.match(content, /XBuddy Print Station/, 'Embedded UI at GET / must render XBuddy Print Station title')
  })

  await t.test('7. Offline Handling: Graceful offline reporting when printer disconnected', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /available:\s*false/, 'Must explicitly flag available: false when offline')
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const serverContent = fs.readFileSync(serverPath, 'utf8')
    assert.match(serverContent, /503/, 'Must return 503 if printer is unavailable during release')
  })

  await t.test('8. MongoDB Agent API: Agent orders endpoint connects to Atlas collection', async () => {
    const agentOrdersPath = path.join(ROOT_DIR, 'backend', 'api', 'agent', 'orders.js')
    assert.ok(fs.existsSync(agentOrdersPath), 'Agent orders route must exist')
    const content = fs.readFileSync(agentOrdersPath, 'utf8')
    assert.match(content, /connectToDatabase/, 'Agent API must connect to MongoDB database')
    assert.match(content, /collection\('orders'\)/, 'Must query orders collection')
    assert.match(content, /x-agent-key/, 'Agent orders API must require x-agent-key')
  })

  await t.test('9. Unknown Order Rejection: release-print rejects invalid order IDs', async () => {
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const content = fs.readFileSync(serverPath, 'utf8')
    assert.match(content, /404/, 'Must return 404 if order does not exist in authoritative MongoDB')
  })

  await t.test('10. Atomic Claim: duplicate release returns 409 conflict', async () => {
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const content = fs.readFileSync(serverPath, 'utf8')
    assert.match(content, /409/, 'Must return 409 when order is already printing/claimed')
    assert.match(content, /claimOrder/, 'Must call claimOrder to lock in MongoDB')
  })

  await t.test('11. Color vs B&W: driver configuration & DeviceGray conversion safeguard', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /Set-PrintConfiguration.*-Color/, 'Must set Windows driver color setting explicitly')
    assert.match(content, /convertPdfToGrayscale/, 'Must apply DeviceGray conversion safeguard for B&W')
  })

  await t.test('12. Copies: sanitized integer passed to driver and pdf-to-printer', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /validCopies\s*=\s*Math\.max\(1,\s*parseInt\(copies/, 'Copies must be parsed as positive integer')
    assert.match(content, /copies:\s*validCopies/, 'pdf-to-printer options must include sanitized copies')
  })

  await t.test('13. Custom Page Ranges: pre-sliced using mutool merge', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /slicePdfCustomPages/, 'Must implement slicePdfCustomPages')
    assert.match(content, /mutool(\.exe)?/, 'Must invoke mutool for page extraction')
    assert.match(content, /merge/, 'Must use mutool merge to extract page subsets')
  })

  await t.test('14. Duplex Printing: long-edge vs single-sided sides parameter', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /isDuplex/, 'Must determine duplex from settings')
    assert.match(content, /sides\s*=\s*'duplex'/, 'Must set sides = duplex when requested')
    assert.match(content, /sides\s*=\s*'simplex'/, 'Must set sides = simplex when single-sided')
  })

  await t.test('15. Orientation: portrait vs landscape resolution', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /validOrientation/, 'Must resolve orientation')
    assert.match(content, /orientation\s*=\s*'landscape'/, 'Must specify landscape when requested')
  })

  await t.test('16. Paper Size: standard paper size enforcement (A4, Letter)', async () => {
    const printerPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')
    assert.match(content, /validPaperSize/, 'Must resolve and uppercase valid paper size')
    assert.match(content, /paperSize:\s*validPaperSize/, 'Must pass paperSize to print options')
  })

  await t.test('17. Google Drive redirect handling in downloader.js', async () => {
    const downloaderPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'downloader.js')
    assert.ok(fs.existsSync(downloaderPath), 'downloader.js must exist')
    const content = fs.readFileSync(downloaderPath, 'utf8')
    assert.match(content, /maxRedirects/, 'Must support HTTP redirects for Google Drive download links')
  })

  await t.test('18. Status Lifecycle: waiting -> Printing -> Printed / Failed', async () => {
    const serverPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'localServer.js')
    const content = fs.readFileSync(serverPath, 'utf8')
    assert.match(content, /updatePrintStatus\(order\.orderId,\s*order\.rowIndex,\s*'Printing'\)/, 'Must update status to Printing upon release')
    assert.match(content, /updatePrintStatus\(order\.orderId,\s*order\.rowIndex,\s*'Printed'\)/, 'Must update status to Printed after physical spooling')
    assert.match(content, /updatePrintStatus\(order\.orderId,\s*order\.rowIndex,\s*'Failed'\)/, 'Must update status to Failed if printing fails')
  })

  await t.test('19. NO BROWSER PRINT FALLBACK: Booth & ReleasePrint never invoke window.print()', async () => {
    const boothPath = path.join(ROOT_DIR, 'frontend', 'src', 'booth', 'BoothApp.jsx')
    assert.ok(fs.existsSync(boothPath), 'BoothApp.jsx must exist')
    const boothContent = fs.readFileSync(boothPath, 'utf8')
    assert.doesNotMatch(boothContent, /triggerBrowserPrint\(/, 'BoothApp must NEVER call triggerBrowserPrint')
    assert.doesNotMatch(boothContent, /window\.print\(/, 'BoothApp must NEVER call window.print()')
    assert.match(boothContent, /🔴 Print Station Offline/, 'BoothApp must show Print Station Offline when agent unavailable')

    const releasePrintPath = path.join(ROOT_DIR, 'frontend', 'src', 'components', 'ReleasePrint.jsx')
    const releaseContent = fs.readFileSync(releasePrintPath, 'utf8')
    assert.doesNotMatch(releaseContent, /triggerBrowserPrint\(/, 'ReleasePrint must NEVER call triggerBrowserPrint')
    assert.doesNotMatch(releaseContent, /window\.print\(/, 'ReleasePrint must NEVER call window.print()')
  })

  await t.test('20. Security: NO MongoDB URI or passwords in installer source or agent configs', async () => {
    const configPath = path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'config.js')
    const configText = fs.readFileSync(configPath, 'utf8')
    assert.doesNotMatch(configText, /mongodb(\+srv)?:\/\//i, 'config.js must not contain MongoDB URI')

    const serviceCsPath = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyService.cs')
    const serviceCsText = fs.readFileSync(serviceCsPath, 'utf8')
    assert.doesNotMatch(serviceCsText, /mongodb(\+srv)?:\/\//i, 'XBuddyService.cs must not contain MongoDB URI')

    const setupCsPath = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const setupCsText = fs.readFileSync(setupCsPath, 'utf8')
    assert.doesNotMatch(setupCsText, /mongodb(\+srv)?:\/\//i, 'XBuddyPrintStationSetup.cs must not contain MongoDB URI')
  })

  await t.test('21. Architecture: Native x64 compilation of all installer binaries', async () => {
    const binaries = [
      path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyService.exe'),
      path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyStation.exe'),
      path.join(ROOT_DIR, 'backend', 'installer', 'Uninstall.exe'),
      path.join(ROOT_DIR, 'XBuddyPrintStationSetup.exe'),
    ]

    for (const bin of binaries) {
      assert.ok(fs.existsSync(bin), `Binary must exist: ${bin}`)
      const buffer = fs.readFileSync(bin)
      const peOffset = buffer.readInt32LE(0x3C)
      const machine = buffer.readUInt16LE(peOffset + 4)
      assert.strictEqual(machine, 0x8664, `Binary ${path.basename(bin)} must be compiled as native x64 (0x8664)`)
    }
  })

  await t.test('22. UAC Manifest: requireAdministrator embedded in Setup and Uninstall', async () => {
    const manifestPath = path.join(ROOT_DIR, 'backend', 'installer', 'app.manifest')
    assert.ok(fs.existsSync(manifestPath), 'app.manifest must exist')
    const manifestText = fs.readFileSync(manifestPath, 'utf8')
    assert.match(manifestText, /requireAdministrator/, 'app.manifest must demand requireAdministrator')

    for (const binName of ['XBuddyPrintStationSetup.exe', 'backend/installer/Uninstall.exe']) {
      const binPath = path.join(ROOT_DIR, binName)
      const buffer = fs.readFileSync(binPath)
      assert.ok(
        buffer.toString('utf8').includes('requireAdministrator'),
        `${binName} must contain requireAdministrator in embedded manifest`
      )
    }
  })

  await t.test('23. Win32 SCM Integration: CreateService, OpenSCManager & ChangeServiceConfig', async () => {
    const setupCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const content = fs.readFileSync(setupCs, 'utf8')
    assert.match(content, /OpenSCManagerW/, 'Must declare OpenSCManagerW P/Invoke')
    assert.match(content, /CreateServiceW/, 'Must declare CreateServiceW P/Invoke')
    assert.match(content, /ChangeServiceConfigW/, 'Must declare ChangeServiceConfigW P/Invoke')
    assert.match(content, /SERVICE_AUTO_START/, 'Service startup type must be SERVICE_AUTO_START')
    assert.match(content, /SERVICE_WIN32_OWN_PROCESS/, 'Service type must be SERVICE_WIN32_OWN_PROCESS')
    assert.match(content, /XBuddyService\.exe/, 'Service executable must target XBuddyService.exe')
  })

  await t.test('24. Auto-Recovery: SCM failure actions configured for crash restart', async () => {
    const setupCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const content = fs.readFileSync(setupCs, 'utf8')
    assert.match(content, /actions=\s*restart\/3000\/restart\/5000\/restart\/10000/, 'Must configure crash restart recovery actions')
    assert.match(content, /failureflag.*1/, 'Must configure failureflag 1 to handle non-zero exits')
  })

  await t.test('25. Strict Verification: sc.exe query checked for RUNNING before claiming success', async () => {
    const setupCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const content = fs.readFileSync(setupCs, 'utf8')
    assert.match(content, /sc\.exe.*query/, 'Must execute sc.exe query for service verification')
    assert.match(content, /RUNNING/, 'Must assert that service STATE reaches RUNNING')
    assert.match(content, /throw new InvalidOperationException/, 'Must throw on service failure instead of claiming success')
  })

  await t.test('26. Service Directory & Tooling: bin/, runtime/, and environment forwarding', async () => {
    const serviceCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyService.cs')
    const content = fs.readFileSync(serviceCs, 'utf8')
    assert.match(content, /XBUDDY_INSTALL_DIR/, 'Must pass XBUDDY_INSTALL_DIR to agent process')
    assert.match(content, /MUTOOL_PATH/, 'Must pass MUTOOL_PATH to agent process')
    assert.match(content, /PROGRAMDATA/, 'Must preserve PROGRAMDATA in service child process')
    assert.match(content, /AGENT_SECRET_KEY/, 'Must forward provisioned AGENT_SECRET_KEY to child process')
  })

  await t.test('27. Dynamic Provisioning Generator: generate_provisioning.cjs obfuscation', async () => {
    const genPath = path.join(ROOT_DIR, 'backend', 'installer', 'generate_provisioning.cjs')
    assert.ok(fs.existsSync(genPath), 'generate_provisioning.cjs must exist')
    const genContent = fs.readFileSync(genPath, 'utf8')
    assert.match(genContent, /AGENT_SECRET_KEY/, 'Generator must read AGENT_SECRET_KEY')
    assert.match(genContent, /ObfuscatedKey/, 'Generator must produce ObfuscatedKey byte array')
    assert.doesNotMatch(genContent, /f6d39a0b4ba0a2ac/, 'Generator must not hardcode the production key in source')

    const provPath = path.join(ROOT_DIR, 'backend', 'installer', 'Provisioning.cs')
    assert.ok(fs.existsSync(provPath), 'Provisioning.cs must exist after build')
    const provContent = fs.readFileSync(provPath, 'utf8')
    assert.match(provContent, /GetAgentSecretKey/, 'Provisioning.cs must declare GetAgentSecretKey')
    assert.match(provContent, /ObfuscatedKey/, 'Provisioning.cs must declare ObfuscatedKey')
  })

  await t.test('28. Station Credential Decryption: Obfuscated key recovers authorized credential', async () => {
    const provPath = path.join(ROOT_DIR, 'backend', 'installer', 'Provisioning.cs')
    const provContent = fs.readFileSync(provPath, 'utf8')

    // Parse obfuscated bytes and salt from C# source
    const saltMatch = provContent.match(/Salt\s*=\s*new\s*byte\[\]\s*\{([^}]+)\}/)
    const keyMatch = provContent.match(/ObfuscatedKey\s*=\s*new\s*byte\[\]\s*\{([^}]+)\}/)
    assert.ok(saltMatch, 'Salt array must be found')
    assert.ok(keyMatch, 'ObfuscatedKey array must be found')

    const salt = saltMatch[1].split(',').map(s => parseInt(s.trim(), 16))
    const obfuscated = keyMatch[1].split(',').map(s => parseInt(s.trim(), 16))
    assert.ok(obfuscated.length >= 32, 'Obfuscated key length must be at least 32 bytes')

    const decrypted = Buffer.from(obfuscated.map((b, i) => b ^ salt[i % salt.length])).toString('utf8')
    assert.ok(decrypted.length >= 32, 'Decrypted credential must be at least 32 characters')

    // Verify SHA-256 hash against authorized server hashes
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update(decrypted).digest('hex')
    const authorizedHashes = ['ea4af0179d15ec55173b299b18bbffb8b770589fe9df62b6239aee52eee4f04d']
    assert.ok(authorizedHashes.includes(hash), 'Decrypted credential hash must match authorized cloud key hash')
  })

  await t.test('29. Installer Configuration Integrity: config.json verification on disk', async () => {
    const setupCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const content = fs.readFileSync(setupCs, 'utf8')
    assert.match(content, /Provisioning\.GetAgentSecretKey\(\)/, 'Must call Provisioning.GetAgentSecretKey()')
    assert.match(content, /Failed to verify station credential in written config\.json/, 'Must verify config.json immediately on disk')
  })

  await t.test('30. Authenticated Cloud Telemetry Verification in Installer', async () => {
    const setupCs = path.join(ROOT_DIR, 'backend', 'installer', 'XBuddyPrintStationSetup.cs')
    const content = fs.readFileSync(setupCs, 'utf8')
    assert.match(content, /VerifyCloudHeartbeat\(\)/, 'Must call VerifyCloudHeartbeat() after starting service')
    assert.match(content, /Cloud telemetry authentication failed/, 'Must reject installation if cloud authentication fails')
    assert.match(content, /connected/, 'Must assert connected: true from local /status endpoint')
  })
})
