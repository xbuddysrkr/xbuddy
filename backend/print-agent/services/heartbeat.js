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
    printerName: printerInfo.name || 'None',
    printerAvailable: Boolean(printerInfo.available),
    agentVersion: config.version || '2.1.0',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    systemInfo: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
  }

  const cloudUrls = [
    config.cloudApiUrl,
    'https://xbuddysrkr.vercel.app',
    'https://xbuddy.onrender.com',
  ].filter(Boolean)

  let sent = false
  for (const baseUrl of cloudUrls) {
    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/agent/heartbeat`
      const res = await axios.post(endpoint, payload, {
        headers: {
          'x-agent-key': config.agentSecretKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      })

      if (res.data?.success) {
        lastHeartbeatResult = { success: true, timestamp: new Date().toISOString(), serverTime: res.data.serverTime }
        lastHeartbeatTime = Date.now()
        sent = true
        break
      }
    } catch (err) {
      // Try fallback URL
      continue
    }
  }

  if (!sent) {
    lastHeartbeatResult = { success: false, error: 'Could not connect to cloud endpoint' }
  }

  return lastHeartbeatResult
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
