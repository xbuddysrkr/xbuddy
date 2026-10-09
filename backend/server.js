import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import ordersHandler from './api/orders.js'
import agentOrdersHandler from './api/agent/orders.js'
import agentHeartbeatHandler from './api/agent/heartbeat.js'

// Load environment variables from .env if present
dotenv.config()

// Ensure persistent PDF cache directory exists
const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve('.pdf_cache')
if (!fs.existsSync(PDF_CACHE_DIR)) {
  fs.mkdirSync(PDF_CACHE_DIR, { recursive: true })
}

const app = express()
const PORT = process.env.PORT || 3000

// Middleware: Enable CORS for cross-origin frontend deployments (Vercel, localhost)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'X-API-Key',
    'x-agent-key',
    'X-Agent-Key',
    'x-agent-secret',
    'X-Agent-Secret',
    'x-pin',
    'X-Pin',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
}))

// Body parsers: allow large base64 PDF uploads
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Health checks for Render uptime monitoring
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'xbuddy-backend',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

app.get('/health', async (req, res) => {
  let mongoStatus = 'unknown'
  let mongoError = null
  try {
    const { connectToDatabase } = await import('./api/_lib/mongodb.js')
    const { db } = await connectToDatabase()
    await db.command({ ping: 1 })
    mongoStatus = 'connected'
  } catch (err) {
    mongoStatus = 'error'
    mongoError = err.message
  }
  res.json({
    status: 'healthy',
    mongoStatus,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    mongoError,
    timestamp: new Date().toISOString()
  })
})

// Primary Authoritative Orders API (MongoDB Atlas)
app.all('/api/orders', async (req, res) => {
  try {
    await ordersHandler(req, res)
  } catch (err) {
    console.error('[SERVER ERROR /api/orders]:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' })
    }
  }
})

// Secret-authenticated Print Agent sync API
app.all('/api/agent/orders', async (req, res) => {
  try {
    await agentOrdersHandler(req, res)
  } catch (err) {
    console.error('[SERVER ERROR /api/agent/orders]:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' })
    }
  }
})

app.all('/api/agent/orders/:route(*)', async (req, res) => {
  try {
    req.query = req.query || {}
    req.query.route = req.params.route
    await agentOrdersHandler(req, res)
  } catch (err) {
    console.error('[SERVER ERROR /api/agent/orders/:route]:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' })
    }
  }
})

// Dedicated Agent Heartbeat Telemetry API
app.all('/api/agent/heartbeat', async (req, res) => {
  try {
    await agentHeartbeatHandler(req, res)
  } catch (err) {
    console.error('[SERVER ERROR /api/agent/heartbeat]:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' })
    }
  }
})

// Booth Operator Authentication (Validates against BOOTH_PIN)
const handleBoothLogin = (req, res) => {
  const { pin } = req.body || {}
  const validPin = process.env.BOOTH_PIN || '4921'
  if (pin && String(pin).trim() === String(validPin).trim()) {
    return res.json({ success: true, message: 'Booth authenticated' })
  }
  return res.status(401).json({ success: false, error: 'Wrong PIN. Try again.' })
}
app.post('/api/booth/login', handleBoothLogin)
app.post('/booth-login', handleBoothLogin)

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`)
  console.log(`  X BUDDY BACKEND RUNNING ON PORT ${PORT}`)
  console.log(`  Health Check: http://localhost:${PORT}/health`)
  console.log(`  Orders API:   http://localhost:${PORT}/api/orders`)
  console.log(`=======================================================`)

  // Non-blocking background startup cache pre-warming from authoritative MongoDB Atlas
  setTimeout(async () => {
    try {
      const { connectToDatabase } = await import('./api/_lib/mongodb.js')
      const { db } = await connectToDatabase()
      const activeOrders = await db.collection('orders')
        .find(
          { printStatus: { $in: ['waiting_for_shopkeeper', 'Waiting', 'queued', 'pending', 'Ready', 'ready', 'Failed', 'failed'] } },
          { projection: { orderId: 1, pdfBase64: 1 } }
        )
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray()

      let count = 0
      for (const order of activeOrders) {
        if (!order.orderId || !order.pdfBase64 || typeof order.pdfBase64 !== 'string') continue
        const target = path.join(PDF_CACHE_DIR, `${order.orderId}.pdf`)
        if (!fs.existsSync(target)) {
          fs.writeFileSync(target, Buffer.from(order.pdfBase64, 'base64'))
          count++
        }
      }
      if (count > 0) {
        console.log(`[PDF_CACHE_STARTUP] Pre-warmed ${count} active order(s) into runtime disk cache`)
      }
    } catch (err) {
      console.warn(`[PDF_CACHE_STARTUP_WARN] Background cache notice: ${err.message}`)
    }
  }, 2000)
})

export default app
