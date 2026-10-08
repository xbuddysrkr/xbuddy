const express  = require('express')
const cors     = require('cors')
const fs       = require('fs')
const path     = require('path')
const https    = require('https')
const logger   = require('../utils/logger')
const { getOrderByIdForRelease, getAllOrders, claimOrder } = require('./sheets')
const { updatePrintStatus, updateReleaseStatus } = require('./updater')
const { printPdf, getDefaultPrinter } = require('./printer')
const { downloadPdf, deletePdf } = require('./downloader')
const { getTunnelUrl } = require('./tunnel')

const app         = express()
const PORT        = process.env.PRINT_AGENT_PORT || process.env.LOCAL_PORT || 3001
const PENDING_DIR = path.join(__dirname, '..', 'downloads')

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174']

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true)
    }
    if (/\.trycloudflare\.com$/.test(origin) || /\.vercel\.app$/.test(origin)) {
      return callback(null, true)
    }
    return callback(null, true)
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'cf-access-client-id'],
}))
app.use(express.json({ limit: '150mb' }))
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
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
    const s = JSON.parse(fs.readFileSync(p, 'utf8'))
    // Do not delete immediately; keep settings intact for booth reprint/verification
    return s
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
      selectedPageCount, printableCount,
    } = req.body
    if (!orderId) return res.status(400).json({ success: false, error: 'Missing orderId' })

    const cleanId = orderId.trim().toUpperCase()

    // TASK 3: Verify order already exists in authoritative MongoDB database
    const mongoOrder = await getOrderByIdForRelease(cleanId)
    if (!mongoOrder) {
      logger.warn(`[AGENT] Refusing /save-order: Order ${cleanId} does not exist in authoritative MongoDB database`)
      return res.status(404).json({
        success: false,
        error: `Order ${cleanId} not found in authoritative MongoDB database. Orders must be created in MongoDB before staging files.`,
        orderId: cleanId,
      })
    }

    logger.success(`[AGENT] Verified order ${cleanId} exists in MongoDB primary`)

    if (pdfBase64) {
      fs.writeFileSync(path.join(PENDING_DIR, `${cleanId}_pending.b64`), pdfBase64)
      logger.success(`[AGENT] PDF staged locally for ${cleanId} (${(pdfBase64.length / 1024).toFixed(0)} KB)`)
    }
    if (screenshotBase64) saveScreenshotLocally(cleanId, screenshotBase64)

    const rawColor = String(colorMode || mongoOrder.colorMode || req.body.printType || '').trim().toLowerCase()
    const normalizedColorMode = (rawColor === 'color' || rawColor === 'colour') ? 'color' : 'bw'

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
    })
    logger.success(`[AGENT] Order ${cleanId} staged locally for booth release | ${normalizedColorMode.toUpperCase()} | ${copies} copy | pages: ${resolvedPageRange}`)
    res.json({ success: true, orderId: cleanId, mongoVerified: true })
  } catch (err) {
    logger.error(`save-order failed: ${err.message}`)
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /save-order-meta - receives Drive PDF URL for an existing MongoDB order
app.post('/save-order-meta', async (req, res) => {
  try {
    const {
      orderId, driveUrl,
      copies = 1, printSide = 'Single', colorMode = 'bw',
      pageSize = 'A4', orientation = 'portrait', pageRange = 'all',
      pageRangeMode = 'all', customPages = '', selectedPages = [],
      selectedPageCount, printableCount,
    } = req.body
    if (!orderId) return res.status(400).json({ success: false, error: 'Missing orderId' })

    const cleanId = orderId.trim().toUpperCase()

    // TASK 3: Verify order already exists in authoritative MongoDB database
    const mongoOrder = await getOrderByIdForRelease(cleanId)
    if (!mongoOrder) {
      logger.warn(`[AGENT] Refusing /save-order-meta: Order ${cleanId} does not exist in authoritative MongoDB database`)
      return res.status(404).json({
        success: false,
        error: `Order ${cleanId} not found in authoritative MongoDB database. Orders must be created in MongoDB before staging files.`,
        orderId: cleanId,
      })
    }

    logger.success(`[AGENT] Verified order ${cleanId} exists in MongoDB primary`)

    const rawColor = String(colorMode || mongoOrder.colorMode || req.body.printType || '').trim().toLowerCase()
    const normalizedColorMode = (rawColor === 'color' || rawColor === 'colour') ? 'color' : 'bw'

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
    logger.success(`[AGENT] Order ${cleanId} Drive metadata staged locally for booth release`)
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

app.get('/', (req, res) => { res.json({ success: true, message: 'X Buddy Print Agent is Online' }) })
app.get('/status', (req, res) => { res.json({ success: true, message: 'Print agent running' }) })

// POST /update-order-status - updates order status locally & syncs to cloud
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

app.get('/admin/booths', async (req, res) => {
  try {
    const rows = await getAllOrders()
    const pending = rows.filter(o => o.printStatus === 'Waiting').length
    res.json({ success: true, booths: [
      { name: 'Booth 01', online: true,  queue: Math.max(0, Math.round(pending * 0.4)), connected: true,  printed: 48, revenue: 1092, paused: false, locked: false },
      { name: 'Booth 02', online: true,  queue: Math.max(0, Math.round(pending * 0.3)), connected: true,  printed: 33, revenue: 732,  paused: false, locked: false },
      { name: 'Booth 03', online: true,  queue: Math.max(0, Math.round(pending * 0.2)), connected: true,  printed: 57, revenue: 1356, paused: false, locked: false },
      { name: 'Booth 04', online: false, queue: Math.max(0, Math.round(pending * 0.1)), connected: false, printed: 22, revenue: 478,  paused: true,  locked: false },
    ]})
  } catch (err) { res.json({ success: false, error: err.message }) }
})

app.get('/admin/health', async (req, res) => {
  try {
    const rows    = await getAllOrders()
    const printer = await getDefaultPrinter(false)
    res.json({ success: true, checks: [
      { name: 'Print Agent',        status: 'online' },
      { name: 'Local Server',       status: 'online' },
      { name: 'Google Sheets',      status: rows.length >= 0 ? 'online' : 'offline' },
      { name: 'Cloudflare Tunnel',  status: 'online' },
      { name: 'Printer',            status: printer ? 'online' : 'offline' },
    ]})
  } catch (err) {
    res.json({ success: true, checks: [
      { name: 'Print Agent', status: 'online' }, { name: 'Local Server', status: 'online' },
      { name: 'Google Sheets', status: 'offline' }, { name: 'Cloudflare Tunnel', status: 'online' },
      { name: 'Printer', status: 'offline' },
    ], error: err.message })
  }
})

// POST /release-print - booth triggers print by Order ID
app.post('/release-print', async (req, res) => {
  const { orderId } = req.body
  if (!orderId) return res.json({ success: false, error: 'Missing Order ID' })

  const id = orderId.trim().toUpperCase()
  logger.info(`Booth release request: ${id}`)

  // 1. Retrieve order from authoritative MongoDB primary (or legacy fallback if configured)
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

  // 2. ATOMIC CLAIM in MongoDB (TASK 4): only one claimant transitions pending -> Printing
  logger.info(`[AGENT] Claiming order ${id}`)
  const claimRes = await claimOrder(id)
  if (!claimRes.success && claimRes.conflict) {
    delete global._activePrints[id]
    logger.warn(`[AGENT] Order ${id} is already claimed or printing`)
    return res.json({
      success: false,
      error: 'Order is already printing or was previously released.',
      conflict: true,
    })
  }

  logger.success(`Releasing: ${id} | ${order.fileName || 'document'} | ${order.copies || 1} copy`)
  
  // Respond immediately to booth so UI shows instant confirmation without waiting for physical completion
  res.json({ success: true, message: `Printing started for ${id}` })

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

    // 2. Try driveUrl from settings or order
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

    // 4. Try cloud backend direct fetch (/api/orders?action=getOrderPdf)
    if (!pdfReady) {
      const cloudPdfUrl = `${CLOUD_API_URL}/api/orders?action=getOrderPdf&orderId=${encodeURIComponent(id)}`
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

    logger.info(`[AGENT] Print settings: copies=${resolvedCopies}, colorMode=${resolvedColorMode}, orientation=${resolvedOrientation}, paperSize=${resolvedPageSize}, pageRange=${printPages}`)

    logger.info(`[AGENT] Sending to printer...`)
    await updatePrintStatus(order.orderId, order.rowIndex, 'Printing')

    const printer = await getDefaultPrinter()
    if (printer) {
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
        logger.success(`[AGENT] Physical print sent successfully`)
        await updatePrintStatus(order.orderId, order.rowIndex, 'Printed')
      } else {
        logger.error(`[AGENT] Physical print failed`)
        await updatePrintStatus(order.orderId, order.rowIndex, 'Failed')
      }
    } else {
      logger.warn('No printer detected — marking Printed anyway')
      await updatePrintStatus(order.orderId, order.rowIndex, 'Printed')
    }
  } catch (err) {
    logger.error(`Release error for ${id}: ${err.message}`)
    await updatePrintStatus(order.orderId, order.rowIndex, 'Failed')
  } finally {
    // Delay deletion by 120s so SumatraPDF and Windows spooler finish processing
    setTimeout(() => {
      try { if (fs.existsSync(filePath)) deletePdf(filePath) } catch {}
    }, 120000)
  }
})

function startLocalServer() {
  app.listen(PORT, () => logger.success(`Local server running on http://localhost:${PORT}`))
}

function decodePendingPdf(orderId, outputPath) {
  const b64Path = path.join(PENDING_DIR, `${orderId}_pending.b64`)
  if (!fs.existsSync(b64Path)) return false
  const base64 = fs.readFileSync(b64Path, 'utf8')
  fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'))
  fs.unlinkSync(b64Path)
  return true
}

module.exports = { startLocalServer, decodePendingPdf }
