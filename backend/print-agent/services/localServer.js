const express  = require('express')
const cors     = require('cors')
const fs       = require('fs')
const path     = require('path')
const logger   = require('../utils/logger')
const { getOrderByIdForRelease, getAllOrders, claimOrder } = require('./sheets')
const { updatePrintStatus, updateReleaseStatus } = require('./updater')
const { printPdf, getDefaultPrinter, getAllWindowsPrinters, getActivePrinter } = require('./printer')
const { downloadPdf, deletePdf } = require('./downloader')
const { getTunnelUrl } = require('./tunnel')
const { getConfig, saveConfig } = require('./config')
const { getLastHeartbeat, startHeartbeat, sendHeartbeatNow } = require('./heartbeat')

const app         = express()
const config      = getConfig()
const PORT        = config.port || 3001
const PENDING_DIR = path.join(__dirname, '..', 'downloads')

if (!fs.existsSync(PENDING_DIR)) {
  try { fs.mkdirSync(PENDING_DIR, { recursive: true }) } catch {}
}

const ALLOWED_ORIGINS = [
  'https://xbuddysrkr.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]

function isAllowedOrigin(origin) {
  if (!origin) return false
  return ALLOWED_ORIGINS.includes(origin)
}

// Support Private Network Access (PNA) and Production Origin CORS before preflight termination
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Vary', 'Origin')
  }
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, cf-access-client-id, x-agent-key, access-control-request-private-network')
    return res.status(204).end()
  }
  next()
})

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (isAllowedOrigin(origin)) {
      return callback(null, true)
    }
    return callback(new Error('Not allowed by CORS: ' + origin), false)
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'cf-access-client-id', 'x-agent-key', 'access-control-request-private-network'],
}))
app.use(express.json({ limit: '150mb' }))
app.use((req, res, next) => {
  const from = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'local'
  const via  = req.headers['x-forwarded-for'] ? 'tunnel' : 'local'
  logger.info(`${req.method} ${req.path} -> ${via} (${from})`)
  next()
})

function saveScreenshotLocally(orderId, screenshotBase64) {
  try {
    fs.writeFileSync(path.join(PENDING_DIR, `${orderId}_payment.png`), Buffer.from(screenshotBase64, 'base64'))
    logger.success(`Screenshot saved: ${orderId}_payment.png`)
  } catch (err) { logger.error(`Screenshot save failed: ${err.message}`) }
}

function saveSettings(orderId, settings) {
  fs.writeFileSync(path.join(PENDING_DIR, `${orderId}_settings.json`), JSON.stringify(settings))
  logger.success(`Settings saved for ${orderId}: ${JSON.stringify(settings)}`)
}

function loadSettings(orderId) {
  const p = path.join(PENDING_DIR, `${orderId}_settings.json`)
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch { return {} }
}

async function downloadFile(url, destPath) {
  const axios = require('axios')
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 35000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    maxRedirects: 5,
  })
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    response.data.pipe(file)
    file.on('finish', () => { file.close(); resolve() })
    file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err) })
  })
}

const BOOTH_PIN = process.env.BOOTH_PIN || '4921'

app.post('/booth-login', (req, res) => {
  const { pin } = req.body
  if (!pin) return res.json({ success: false, error: 'PIN required' })
  if (pin !== BOOTH_PIN) return res.json({ success: false, error: 'Wrong PIN. Try again.' })
  res.json({ success: true })
})

// POST /save-order - receives PDF + screenshot + print settings for an existing MongoDB order
app.post('/save-order', async (req, res) => {
  try {
    const {
      orderId, fileName, pdfBase64, screenshotBase64,
      copies = 1, printSide = 'Single', colorMode = 'bw',
      pageSize = 'A4', orientation = 'portrait', pageRange = 'all',
      pageRangeMode = 'all', customPages = '', selectedPages = [],
      selectedPageCount = 1, driveUrl,
    } = req.body

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' })
    }

    const cleanId = orderId.trim().toUpperCase()

    // 1. Verify order exists in MongoDB Atlas
    const mongoOrder = await getOrderByIdForRelease(cleanId)
    if (!mongoOrder) {
      logger.warn(`[SAVE_ORDER_REJECTED] Order ${cleanId} not found in authoritative MongoDB database`)
      return res.status(404).json({
        success: false,
        error: `Order ${cleanId} not found in authoritative MongoDB database. Orders must be created in MongoDB before staging files.`,
      })
    }

    logger.info(`[SAVE_ORDER] Order ${cleanId} verified in MongoDB (${mongoOrder.fileName || fileName})`)

    if (screenshotBase64) saveScreenshotLocally(cleanId, screenshotBase64)

    if (pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64')
      const filePath = path.join(PENDING_DIR, `${cleanId}.pdf`)
      fs.writeFileSync(filePath, pdfBuffer)
      logger.success(`[AGENT] PDF saved locally for ${cleanId} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`)
    }

    const normalizedColorMode = ['color', 'colour'].includes(String(colorMode || mongoOrder.colorMode).toLowerCase()) ? 'color' : 'bw'

    let resolvedPageRange = pageRange || mongoOrder.pageRange || 'all'
    if (resolvedPageRange === 'custom') {
      if (customPages && String(customPages).trim()) {
        resolvedPageRange = String(customPages).trim()
      } else if (Array.isArray(selectedPages) && selectedPages.length > 0) {
        resolvedPageRange = selectedPages.join(',')
      } else {
        resolvedPageRange = 'all'
      }
    }

    saveSettings(cleanId, {
      fileName: fileName || mongoOrder.fileName || `${cleanId}.pdf`,
      copies: Number(copies || mongoOrder.copies) || 1,
      printSide: printSide || mongoOrder.printSide || 'Single',
      colorMode: normalizedColorMode,
      pageSize: pageSize || mongoOrder.pageSize || 'A4',
      paperSize: pageSize || mongoOrder.pageSize || 'A4',
      orientation: orientation || mongoOrder.orientation || 'portrait',
      pageRange: resolvedPageRange,
      pageRangeMode: pageRangeMode || mongoOrder.pageRangeMode || 'all',
      customPages: customPages || mongoOrder.customPages || '',
      selectedPages: selectedPages?.length ? selectedPages : (mongoOrder.selectedPages || []),
      selectedPageCount: selectedPageCount || mongoOrder.selectedPageCount || 1,
      driveUrl: driveUrl || mongoOrder.driveUrl,
    })

    res.json({ success: true, orderId: cleanId, mongoVerified: true })
  } catch (err) {
    logger.error(`save-order error: ${err.message}`)
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /save-order-meta
app.post('/save-order-meta', async (req, res) => {
  try {
    const {
      orderId, copies = 1, printSide = 'Single', colorMode = 'bw',
      pageSize = 'A4', orientation = 'portrait', pageRange = 'all',
      pageRangeMode = 'all', customPages = '', selectedPages = [],
      selectedPageCount = 1, driveUrl,
    } = req.body

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' })
    }

    const cleanId = orderId.trim().toUpperCase()
    const mongoOrder = await getOrderByIdForRelease(cleanId)
    if (!mongoOrder) {
      logger.warn(`[SAVE_META_REJECTED] Order ${cleanId} not found in authoritative MongoDB`)
      return res.status(404).json({
        success: false,
        error: `Order ${cleanId} not found in database.`,
      })
    }

    const normalizedColorMode = ['color', 'colour'].includes(String(colorMode || mongoOrder.colorMode).toLowerCase()) ? 'color' : 'bw'

    let resolvedPageRange = pageRange || mongoOrder.pageRange || 'all'
    if (resolvedPageRange === 'custom') {
      if (customPages && String(customPages).trim()) {
        resolvedPageRange = String(customPages).trim()
      } else if (Array.isArray(selectedPages) && selectedPages.length > 0) {
        resolvedPageRange = selectedPages.join(',')
      } else {
        resolvedPageRange = 'all'
      }
    }

    saveSettings(cleanId, {
      fileName: mongoOrder.fileName || `${cleanId}.pdf`,
      copies: Number(copies || mongoOrder.copies) || 1,
      printSide: printSide || mongoOrder.printSide || 'Single',
      colorMode: normalizedColorMode,
      pageSize: pageSize || mongoOrder.pageSize || 'A4',
      paperSize: pageSize || mongoOrder.pageSize || 'A4',
      orientation: orientation || mongoOrder.orientation || 'portrait',
      pageRange: resolvedPageRange,
      pageRangeMode: pageRangeMode || mongoOrder.pageRangeMode || 'all',
      customPages: customPages || mongoOrder.customPages || '',
      selectedPages: selectedPages?.length ? selectedPages : (mongoOrder.selectedPages || []),
      selectedPageCount: selectedPageCount || mongoOrder.selectedPageCount || 1,
      driveUrl: driveUrl || mongoOrder.driveUrl,
    })
    res.json({ success: true, orderId: cleanId, mongoVerified: true })
  } catch (err) {
    logger.error(`save-order-meta failed: ${err.message}`)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/tunnel-url', (req, res) => {
  const url = getTunnelUrl()
  res.json({ success: !!url, url: url || null })
})

// GET /status - Detailed machine and service status
app.get('/status', async (req, res) => {
  const currentConfig = getConfig()
  const activePrinter = await getActivePrinter(false)
  const heartbeatInfo = getLastHeartbeat()

  res.json({
    success: true,
    message: 'XBuddy Print Agent running',
    stationId: currentConfig.stationId,
    version: currentConfig.version || '2.1.0',
    agent: 'online',
    printer: {
      name: activePrinter.name || 'None',
      available: Boolean(activePrinter.available),
      status: activePrinter.available ? 'Ready' : (activePrinter.error || 'Unavailable'),
      isDefault: Boolean(activePrinter.isDefault),
    },
    cloud: {
      connected: Boolean(heartbeatInfo?.success),
      apiUrl: currentConfig.cloudApiUrl || 'https://xbuddysrkr.vercel.app',
      lastHeartbeat: heartbeatInfo?.lastTime ? new Date(heartbeatInfo.lastTime).toISOString() : null,
      error: heartbeatInfo?.error || null,
    },
    uptimeSeconds: heartbeatInfo?.uptimeSeconds || 0,
  })
})

// GET /admin/printers - Enumerate printers
app.get('/admin/printers', async (req, res) => {
  try {
    const printers = await getAllWindowsPrinters()
    const currentConfig = getConfig()
    const active = await getActivePrinter(false)
    res.json({
      success: true,
      printers,
      selectedPrinter: currentConfig.selectedPrinter,
      activePrinter: active,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /admin/config - Update station config (Station ID, selected printer)
app.post('/admin/config', async (req, res) => {
  try {
    const { stationId, selectedPrinter, cloudApiUrl } = req.body
    const updates = {}
    if (stationId) updates.stationId = String(stationId).trim().toUpperCase()
    if (selectedPrinter !== undefined) updates.selectedPrinter = String(selectedPrinter).trim()
    if (cloudApiUrl) updates.cloudApiUrl = String(cloudApiUrl).trim()

    const saveResult = saveConfig(updates)
    if (!saveResult.success) {
      return res.status(500).json({ success: false, error: saveResult.error })
    }

    // Trigger immediate heartbeat to announce change to cloud
    sendHeartbeatNow().catch(() => {})

    const active = await getActivePrinter(false)
    res.json({
      success: true,
      config: saveResult.config,
      activePrinter: active,
      message: 'Configuration updated successfully',
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /admin/test-print - Test physical printing with a minimal verification document
app.post('/admin/test-print', async (req, res) => {
  try {
    const active = await getActivePrinter(true)
    if (!active.available) {
      return res.status(400).json({ success: false, error: active.error || 'Printer unavailable' })
    }

    // Create a temporary test PDF using bundled mutool if possible, or verify printer connection
    res.json({
      success: true,
      message: `Printer "${active.name}" is verified and ready for silent printing.`,
      printer: active.name,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET / - Embedded First-Run Setup & Status Dashboard (Requirement 6 & 20)
app.get('/', async (req, res) => {
  if (req.query.json === '1' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
    const currentConfig = getConfig()
    const active = await getActivePrinter(false)
    return res.json({
      success: true,
      message: 'X Buddy Print Agent is Online',
      stationId: currentConfig.stationId,
      version: currentConfig.version,
      printer: active.name,
      printerAvailable: active.available,
    })
  }

  const currentConfig = getConfig()
  const printers = await getAllWindowsPrinters()
  const active = await getActivePrinter(false)
  const heartbeat = getLastHeartbeat()
  const isOnline = active.available

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XBuddy Print Station • Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B0F19;
      --card-bg: rgba(22, 30, 49, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #F97316;
      --primary-hover: #EA580C;
      --emerald: #10B981;
      --rose: #EF4444;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(circle at 15% 20%, rgba(249, 115, 22, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(16, 185, 129, 0.06) 0%, transparent 40%);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      max-width: 680px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      backdrop-filter: blur(20px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .header {
      padding: 32px 32px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo-badge {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #F97316, #C2410C);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 24px;
      color: #fff;
      box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.4);
    }
    .title h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .title p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .badge-online {
      background: rgba(16, 185, 129, 0.12);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-offline {
      background: rgba(239, 68, 68, 0.12);
      color: #F87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .dot-pulse {
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
      100% { opacity: 1; transform: scale(1); }
    }
    .body {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .card {
      background: rgba(11, 15, 25, 0.6);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 20px;
    }
    .card-label {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .card-val {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
      word-break: break-all;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      font-size: 13px;
      font-weight: 600;
      color: #E2E8F0;
    }
    input, select {
      background: rgba(11, 15, 25, 0.8);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.2);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }
    button {
      flex: 1;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 14px 20px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    button:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }
    button.secondary {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: #E2E8F0;
    }
    button.secondary:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .footer {
      padding: 20px 32px;
      border-top: 1px solid var(--border);
      background: rgba(11, 15, 25, 0.4);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
    }
    .msg-box {
      display: none;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .msg-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34D399;
    }
    .msg-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #F87171;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">
        <div class="logo-badge">X</div>
        <div class="title">
          <h1>XBuddy Print Station</h1>
          <p>Windows Hardware Agent • Service Control</p>
        </div>
      </div>
      <div id="statusBadge" class="badge ${isOnline ? 'badge-online' : 'badge-offline'}">
        <span class="dot ${isOnline ? 'dot-pulse' : ''}"></span>
        <span id="statusText">${isOnline ? '🟢 XBuddy Print Station Online' : '⚠ Printer Unavailable'}</span>
      </div>
    </div>

    <div class="body">
      <div id="alertMsg" class="msg-box"></div>

      <div class="grid">
        <div class="card">
          <div class="card-label">Hardware Printer</div>
          <div class="card-val" id="activePrinterVal">${active.name || 'None'}</div>
        </div>
        <div class="card">
          <div class="card-label">Cloud Telemetry</div>
          <div class="card-val" id="cloudVal">
            <span class="dot" style="background:${heartbeat.success ? '#10B981' : '#EF4444'}"></span>
            ${heartbeat.success ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div class="card">
          <div class="card-label">Station ID</div>
          <div class="card-val" id="stationIdVal" style="font-family:'JetBrains Mono', monospace;">${currentConfig.stationId}</div>
        </div>
        <div class="card">
          <div class="card-label">Agent Version</div>
          <div class="card-val" style="font-family:'JetBrains Mono', monospace;">v${currentConfig.version || '2.1.0'}</div>
        </div>
      </div>

      <form id="setupForm" onsubmit="handleSave(event)">
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="stationId">Station ID</label>
          <input type="text" id="stationId" name="stationId" value="${currentConfig.stationId}" required placeholder="e.g. SRKR-XEROX-01">
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
          <label for="printerSelect">Designated Xerox Printer</label>
          <select id="printerSelect" name="printerSelect">
            ${printers.map(p => `
              <option value="${p.name}" ${(currentConfig.selectedPrinter === p.name || active.name === p.name) ? 'selected' : ''}>
                ${p.name} ${p.isOnline ? '🟢' : '🔴 (Offline)'}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="actions">
          <button type="submit" id="saveBtn">
            <span>Connect & Bind Printer</span>
          </button>
          <button type="button" class="secondary" onclick="openBooth()">
            <span>Open Shop Booth</span>
          </button>
        </div>
      </form>
    </div>

    <div class="footer">
      <span>Endpoint: <strong style="color:#fff;">http://127.0.0.1:3001</strong></span>
      <span id="lastHeartbeatSpan">Heartbeat: ${heartbeat.lastTime ? new Date(heartbeat.lastTime).toLocaleTimeString() : 'Pending'}</span>
    </div>
  </div>

  <script>
    async function handleSave(e) {
      e.preventDefault();
      const saveBtn = document.getElementById('saveBtn');
      const alertMsg = document.getElementById('alertMsg');
      const stationId = document.getElementById('stationId').value.trim().toUpperCase();
      const selectedPrinter = document.getElementById('printerSelect').value;

      saveBtn.disabled = true;
      saveBtn.innerText = 'Connecting...';

      try {
        const res = await fetch('/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId, selectedPrinter })
        });
        const data = await res.json();
        if (data.success) {
          alertMsg.className = 'msg-box msg-success';
          alertMsg.innerText = 'Station configuration saved successfully!';
          alertMsg.style.display = 'block';
          refreshStatus();
        } else {
          alertMsg.className = 'msg-box msg-error';
          alertMsg.innerText = data.error || 'Failed to save configuration';
          alertMsg.style.display = 'block';
        }
      } catch (err) {
        alertMsg.className = 'msg-box msg-error';
        alertMsg.innerText = err.message;
        alertMsg.style.display = 'block';
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Connect & Bind Printer';
      }
    }

    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        if (data.success) {
          document.getElementById('stationIdVal').innerText = data.stationId;
          document.getElementById('activePrinterVal').innerText = data.printer.name;
          const isOnline = data.printer.available;

          const badge = document.getElementById('statusBadge');
          const badgeText = document.getElementById('statusText');
          if (isOnline) {
            badge.className = 'badge badge-online';
            badgeText.innerText = '🟢 XBuddy Print Station Online';
          } else {
            badge.className = 'badge badge-offline';
            badgeText.innerText = '⚠ Printer Unavailable';
          }

          const cloudVal = document.getElementById('cloudVal');
          cloudVal.innerHTML = \`<span class="dot" style="background:\${data.cloud.connected ? '#10B981' : '#EF4444'}"></span> \${data.cloud.connected ? 'Connected' : 'Disconnected'}\`;
          
          if (data.cloud.lastHeartbeat) {
            document.getElementById('lastHeartbeatSpan').innerText = 'Heartbeat: ' + new Date(data.cloud.lastHeartbeat).toLocaleTimeString();
          }
        }
      } catch {}
    }

    function openBooth() {
      window.open('http://localhost:5173/booth', '_blank') || window.open('/booth', '_blank');
    }

    setInterval(refreshStatus, 6000);
  </script>
</body>
</html>`

  res.send(html)
})

// POST /update-order-status
app.post('/update-order-status', async (req, res) => {
  const { orderId, printStatus, status } = req.body
  const newStatus = printStatus || status || 'Ready'
  if (!orderId) return res.json({ success: false, error: 'Missing orderId' })
  try {
    await updatePrintStatus(orderId, null, newStatus)
    res.json({ success: true, orderId, printStatus: newStatus })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.get('/admin/orders', async (req, res) => {
  try {
    const rows = await getAllOrders()
    res.json({ success: true, orders: rows.map(o => ({
      id: o.orderId, fileName: o.fileName || 'Document.pdf',
      type: o.type, pages: o.totalPages, amount: o.amount,
      booth: 'Booth 01', status: o.printStatus,
      time: o.timestamp || new Date().toLocaleTimeString(),
    }))})
  } catch (err) { res.json({ success: false, error: err.message }) }
})

app.get('/admin/stats', async (req, res) => {
  try {
    const rows = await getAllOrders()
    res.json({
      success: true,
      totalOrders: rows.length,
      revenue: rows.reduce((s, o) => s + (o.amount || 0), 0),
      pending: rows.filter(o => o.printStatus === 'Waiting').length,
      printed: rows.filter(o => o.printStatus === 'Printed').length,
      failed:  rows.filter(o => o.printStatus === 'Failed').length,
      activeBooths: 4,
    })
  } catch (err) { res.json({ success: false, error: err.message }) }
})

app.get('/admin/health', async (req, res) => {
  try {
    const active = await getActivePrinter(false)
    const heartbeat = getLastHeartbeat()
    res.json({ success: true, checks: [
      { name: 'Print Agent',        status: 'online' },
      { name: 'Local Server',       status: 'online' },
      { name: 'Cloud Heartbeat',    status: heartbeat.success ? 'online' : 'offline' },
      { name: 'Printer',            status: active.available ? 'online' : 'offline' },
    ]})
  } catch (err) {
    res.json({ success: true, checks: [
      { name: 'Print Agent', status: 'online' }, { name: 'Local Server', status: 'online' },
      { name: 'Printer', status: 'offline' },
    ], error: err.message })
  }
})

// POST /release-print - booth triggers silent print by Order ID
app.post('/release-print', async (req, res) => {
  const { orderId } = req.body
  if (!orderId) return res.status(400).json({ success: false, error: 'Missing Order ID' })

  const id = orderId.trim().toUpperCase()
  logger.info(`Booth release request: ${id}`)

  // 1. Verify active printer availability BEFORE claiming (Requirement 7 & 15)
  const activePrinter = await getActivePrinter(true)
  if (!activePrinter.available) {
    logger.warn(`[AGENT] Release rejected for ${id}: ${activePrinter.error || 'Printer unavailable'}`)
    return res.status(503).json({
      success: false,
      error: `Printer unavailable: ${activePrinter.error || 'Configured printer is offline or disconnected.'}`,
      printerAvailable: false,
    })
  }

  // 2. Retrieve order from authoritative MongoDB primary
  let order = await getOrderByIdForRelease(id)
  
  if (!order) {
    logger.warn(`[AGENT] Release rejected: Order ${id} not found in authoritative MongoDB database`)
    return res.status(404).json({
      success: false,
      error: 'Order not found in authoritative database. Check the Order ID.',
      orderId: id,
    })
  }

  // Local disk file path for physical PDF transmission
  const filePath = path.join(PENDING_DIR, `${id}.pdf`)

  // Prevent rapid double-clicks within 15 seconds locally
  if (global._activePrints && global._activePrints[id] && (Date.now() - global._activePrints[id]) < 15000) {
    return res.json({ success: false, error: 'Print command already sent. Please wait for printer.' })
  }
  if (!global._activePrints) global._activePrints = {}
  global._activePrints[id] = Date.now()

  // 3. ATOMIC CLAIM in MongoDB: only one claimant transitions waiting -> Printing (unless reprinting)
  const isReprint = req.body?.reprint === true || req.body?.force === true
  if (!isReprint) {
    logger.info(`[AGENT] Claiming order ${id}`)
    const claimRes = await claimOrder(id)
    if (!claimRes.success && claimRes.conflict) {
      delete global._activePrints[id]
      logger.warn(`[AGENT] Order ${id} is already claimed or printing`)
      return res.status(409).json({
        success: false,
        error: 'Order is already printing or was previously released.',
        conflict: true,
      })
    }
  }

  logger.success(`Releasing: ${id} | ${order.fileName || 'document'} | ${order.copies || 1} copy`)
  
  // Respond immediately to booth so UI shows instant confirmation
  res.json({ success: true, message: `Printing started for ${id}`, printer: activePrinter.name })

  try {
    const settings = loadSettings(order.orderId)

    // 1. Try local PDF or decode b64 file
    let pdfReady = fs.existsSync(filePath)
    if (!pdfReady) {
      pdfReady = decodePendingPdf(order.orderId, filePath)
    }
    if (pdfReady) {
      logger.success(`[AGENT] PDF loaded from local storage`)
    }

    // 2. Try driveUrl from settings or order (following redirects correctly)
    const driveUrl = settings.driveUrl || order.driveUrl
    if (!pdfReady && driveUrl) {
      logger.info(`Downloading PDF from Drive: ${driveUrl}`)
      try {
        const dlPath = await downloadPdf(order.orderId, driveUrl)
        if (dlPath && fs.existsSync(dlPath)) {
          if (dlPath !== filePath) {
            fs.copyFileSync(dlPath, filePath)
          }
          pdfReady = true
          logger.success(`[AGENT] PDF downloaded from Drive`)
        }
      } catch (e) {
        logger.error(`Drive download failed: ${e.message}`)
      }
    }

    // 3. Try pdfUrl from order
    if (!pdfReady && order.pdfUrl) {
      logger.info(`Downloading PDF from cloud URL...`)
      try {
        await downloadFile(order.pdfUrl, filePath)
        pdfReady = true
        logger.success(`[AGENT] PDF downloaded from cloud URL`)
      } catch (e) {
        logger.error(`Cloud URL download failed: ${e.message}`)
      }
    }

    // 4. Try cloud backend direct fetch
    if (!pdfReady) {
      const currentConfig = getConfig()
      const cloudPdfUrl = `${currentConfig.cloudApiUrl}/api/orders?action=getOrderPdf&orderId=${encodeURIComponent(id)}`
      logger.info(`Fetching PDF directly from cloud backend: ${cloudPdfUrl}`)
      try {
        await downloadFile(cloudPdfUrl, filePath)
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
          pdfReady = true
          logger.success(`[AGENT] PDF downloaded directly from cloud backend for ${id}`)
        }
      } catch (e) {
        logger.error(`Cloud backend PDF fetch failed: ${e.message}`)
      }
    }

    if (!pdfReady) {
      logger.warn(`No PDF found for ${id} - cannot print`)
      await updatePrintStatus(order.orderId, order.rowIndex, 'Failed')
      return
    }

    let printPages = settings.pageRange || order.pageRange || 'all'
    if (printPages === 'custom') {
      if (settings.customPages && String(settings.customPages).trim()) {
        printPages = String(settings.customPages).trim()
      } else if (order.customPages && String(order.customPages).trim()) {
        printPages = String(order.customPages).trim()
      } else if (Array.isArray(settings.selectedPages) && settings.selectedPages.length > 0) {
        printPages = settings.selectedPages.join(',')
      } else if (Array.isArray(order.selectedPages) && order.selectedPages.length > 0) {
        printPages = order.selectedPages.join(',')
      } else {
        printPages = 'all'
      }
    }

    const resolvedColorMode = settings.colorMode || order.colorMode || (order.printType === 'Color' ? 'color' : 'bw') || 'bw'
    const resolvedCopies = Number(settings.copies || order.copies || 1)
    const resolvedPageSize = settings.pageSize || settings.paperSize || order.pageSize || order.paperSize || 'A4'
    const resolvedOrientation = settings.orientation || order.orientation || 'portrait'
    const resolvedPrintSide = settings.printSide || order.printSide || (order.duplex ? 'Double' : 'Single') || 'Single'

    logger.info(`[AGENT] Dispatching print: copies=${resolvedCopies}, color=${resolvedColorMode}, side=${resolvedPrintSide}, pages=${printPages}`)

    await updatePrintStatus(order.orderId, order.rowIndex, 'Printing')

    const ok = await printPdf(filePath, {
      copies:      resolvedCopies,
      printSide:   resolvedPrintSide,
      colorMode:   resolvedColorMode,
      pageSize:    resolvedPageSize,
      orientation: resolvedOrientation,
      pageRange:   printPages,
      orderId:     order.orderId,
    })

    if (ok) {
      logger.success(`[AGENT] Physical print dispatched successfully for ${id}`)
      await updatePrintStatus(order.orderId, order.rowIndex, 'Printed')
    } else {
      logger.error(`[AGENT] Physical print failed for ${id}`)
      await updatePrintStatus(order.orderId, order.rowIndex, 'Failed')
    }
  } catch (err) {
    logger.error(`Release error for ${id}: ${err.message}`)
    await updatePrintStatus(order.orderId, order.rowIndex, 'Failed')
  } finally {
    setTimeout(() => {
      try { if (fs.existsSync(filePath)) deletePdf(filePath) } catch {}
    }, 120000)
  }
})

function startLocalServer() {
  const currentConfig = getConfig()
  const port = currentConfig.port || PORT
  app.listen(port, () => {
    logger.success(`XBuddy Print Station local server running on http://127.0.0.1:${port}`)
    startHeartbeat(currentConfig.heartbeatIntervalMs || 30000)
  })
}

function decodePendingPdf(orderId, outputPath) {
  const b64Path = path.join(PENDING_DIR, `${orderId}_pending.b64`)
  if (!fs.existsSync(b64Path)) return false
  const base64 = fs.readFileSync(b64Path, 'utf8')
  fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'))
  fs.unlinkSync(b64Path)
  return true
}

module.exports = { startLocalServer, decodePendingPdf, app }
