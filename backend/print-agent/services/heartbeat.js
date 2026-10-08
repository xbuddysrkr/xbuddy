const axios = require('axios')
const os = require('os')
const logger = require('../utils/logger')
const { getConfig } = require('./config')
const { getActivePrinter } = require('./printer')

let heartbeatTimer = null
let lastHeartbeatResult = null
let lastHeartbeatTime = null
const startTime = Date.now()

async function sendHeartbeatNow() {
  const config = getConfig()
  const printerInfo = await getActivePrinter(true)

  const payload = {
    stationId: config.stationId || 'SRKR-XEROX-01',
    agentVersion: config.version || '2.1.0',
    printerName: printerInfo.name || 'None',
    printerAvailable: Boolean(printerInfo.available),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    systemInfo: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
  }

  // Direct outbound HTTPS to authoritative XBuddy cloud API (https://xbuddysrkr.vercel.app)
  const baseUrl = (config.cloudApiUrl || 'https://xbuddysrkr.vercel.app').replace(/\/$/, '')
  const endpoint = `${baseUrl}/api/agent/heartbeat`

  try {
    const res = await axios.post(endpoint, payload, {
      headers: {
        'x-agent-key': config.agentSecretKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    })

    if (res.data && res.data.success) {
      lastHeartbeatResult = {
        success: true,
        timestamp: new Date().toISOString(),
        serverTime: res.data.serverTime,
        stationId: res.data.stationId,
      }
      lastHeartbeatTime = Date.now()
      logger.info(`[HEARTBEAT] Cloud telemetry connected -> ${endpoint} (200 OK)`)
      return lastHeartbeatResult
    } else {
      throw new Error(res.data?.error || 'Invalid response from cloud endpoint')
    }
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message || 'Could not connect to cloud endpoint'
    lastHeartbeatResult = {
      success: false,
      error: errMsg,
      status: err.response?.status || null,
    }
    logger.warn(`[HEARTBEAT] Cloud telemetry disconnected (${endpoint}): ${errMsg}`)
    return lastHeartbeatResult
  }
}


function startHeartbeat(intervalMs = 30000) {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  sendHeartbeatNow().catch(() => {})
  heartbeatTimer = setInterval(() => {
    sendHeartbeatNow().catch(() => {})
  }, intervalMs)
  logger.info(`[HEARTBEAT] Outbound cloud telemetry started (${intervalMs / 1000}s interval)`)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function getLastHeartbeat() {
  return {
    ...lastHeartbeatResult,
    lastTime: lastHeartbeatTime,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  }
}

module.exports = {
  sendHeartbeatNow,
  startHeartbeat,
  stopHeartbeat,
  getLastHeartbeat,
}
