import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import ordersHandler from './api/orders.js'
import agentOrdersHandler from './api/agent/orders.js'

// Load environment variables from .env if present
dotenv.config()

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

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
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
})

export default app
