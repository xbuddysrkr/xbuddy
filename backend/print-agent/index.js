const path = require('path')
try {
  const envPath = path.resolve(__dirname, '..', '.env')
  require('dotenv').config({ path: envPath })
} catch {}

const { loadConfig, getConfig }            = require('./services/config')
const { getActivePrinter }                 = require('./services/printer')
const { startLocalServer }                 = require('./services/localServer')
const { watchForTunnelUrl }                = require('./services/tunnel')
const logger                               = require('./utils/logger')

async function start() {
  console.log('\n=============================================')
  console.log('   XBUDDY PRINT STATION • WINDOWS AGENT')
  console.log('=============================================\n')

  const cfg = loadConfig()
  logger.info(`Station ID: ${cfg.stationId}`)
  logger.info(`Version:    v${cfg.version || '2.1.0'}`)

  // Start local server and cloud heartbeat telemetry
  startLocalServer()

  // Background Cloudflare tunnel observer (if tunnel active)
  watchForTunnelUrl(30000)

  // Verify printer state
  const printerInfo = await getActivePrinter(false)
  if (printerInfo.available) {
    logger.success(`Primary Printer: ${printerInfo.name} (Online)`)
  } else {
    logger.warn(`Primary Printer: ${printerInfo.name || 'None'} (${printerInfo.error || 'Unavailable'})`)
  }

  logger.success(`Print Station running on http://127.0.0.1:${cfg.port || 3001}\n`)
}

// Error handling to prevent agent from crashing unexpectedly
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught error: ${err.message}`)
})
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.message || reason}`)
})

process.on('SIGINT',  () => { logger.warn('XBuddy Print Station stopped.'); process.exit(0) })
process.on('SIGTERM', () => { logger.warn('XBuddy Print Station stopped.'); process.exit(0) })

// Keep Node event loop active permanently
setInterval(() => {}, 60000)

start()
