const axios = require('axios')
const logger = require('../utils/logger')
const { getConfig } = require('./config')
const { purgeLocalOrderFiles } = require('./localServer')

let coordinatorTimer = null
let isPolling = false

/**
 * Returns candidate base URLs for cloud API communication.
 */
function getCloudCandidateUrls() {
  const config = getConfig()
  const primaryUrl = (config.cloudApiUrl || 'https://xbuddysrkr.vercel.app').replace(/\/$/, '')
  const candidateUrls = [
    primaryUrl,
    'https://xbuddy.onrender.com',
  ]
  return [...new Set(candidateUrls)]
}

/**
 * Polls cloud API for pending deletion events, purges local cache, and acknowledges.
 */
async function processPendingDeletionEvents() {
  if (isPolling) return
  isPolling = true

  const config = getConfig()
  const candidateUrls = getCloudCandidateUrls()

  let fetchedEvents = null
  let activeBaseUrl = null

  const stationId = String(config.stationId || 'SRKR-XEROX-01').trim().toUpperCase()

  for (const baseUrl of candidateUrls) {
    const endpoint = `${baseUrl}/api/agent/orders/deletion-events`
    try {
      const res = await axios.get(endpoint, {
        params: { stationId },
        headers: {
          'x-agent-key': config.agentSecretKey,
          'x-station-id': stationId,
        },
        timeout: 8000,
      })

      if (res.data && res.data.success && Array.isArray(res.data.events)) {
        fetchedEvents = res.data.events
        activeBaseUrl = baseUrl
        break
      }
    } catch (err) {
      // Network failure or station offline - try next candidate or retry on next poll
      const errMsg = err.response?.data?.error || err.message || 'Connection failed'
      logger.debug(`[DELETION_COORDINATOR] Polling failed on ${endpoint}: ${errMsg}`)
    }
  }

  if (!fetchedEvents || fetchedEvents.length === 0) {
    isPolling = false
    return { success: true, processedCount: 0 }
  }

  logger.info(`[DELETION_COORDINATOR] Found ${fetchedEvents.length} pending deletion event(s) from cloud`)
  let processedCount = 0

  for (const event of fetchedEvents) {
    const { eventId, orderId } = event
    if (!orderId) continue

    try {
      // 1. Purge local cache/spool/temp files for orderId across DOWNLOADS_DIR and PENDING_DIR
      const purgedCount = purgeLocalOrderFiles(orderId)
      logger.info(`[DELETION_COORDINATOR] Local purge executed for order ${orderId} (removed ${purgedCount} cached file(s))`)

      // 2. Acknowledge deletion event to cloud
      const ackEndpoint = `${activeBaseUrl}/api/agent/orders/deletion-events/ack`
      const ackRes = await axios.post(
        ackEndpoint,
        {
          eventId,
          orderId,
          stationId,
        },
        {
          headers: {
            'x-agent-key': config.agentSecretKey,
            'x-station-id': stationId,
            'Content-Type': 'application/json',
          },
          timeout: 8000,
        }
      )

      if (ackRes.data && ackRes.data.success) {
        logger.info(`[DELETION_COORDINATOR] Successfully acknowledged deletion event ${eventId || orderId}`)
        processedCount++
      } else {
        logger.warn(`[DELETION_COORDINATOR] Cloud rejected ack for event ${eventId}: ${ackRes.data?.error}`)
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Error acknowledging deletion'
      logger.error(`[DELETION_COORDINATOR] Failed processing deletion for ${orderId}: ${errMsg}`)
      // Event remains pending in cloud; will retry on next poll cycle
    }
  }

  isPolling = false
  return { success: true, processedCount }
}

/**
 * Starts periodic background polling for deletion events.
 * @param {number} intervalMs - Polling interval in milliseconds (default: 15 seconds)
 */
function startDeletionCoordinator(intervalMs = 15000) {
  if (coordinatorTimer) {
    clearInterval(coordinatorTimer)
  }

  // Trigger immediate check upon startup/reconnection
  processPendingDeletionEvents().catch((err) => {
    logger.debug(`[DELETION_COORDINATOR] Initial sweep error: ${err.message}`)
  })

  coordinatorTimer = setInterval(() => {
    processPendingDeletionEvents().catch((err) => {
      logger.debug(`[DELETION_COORDINATOR] Periodic sweep error: ${err.message}`)
    })
  }, intervalMs)

  logger.info(`[DELETION_COORDINATOR] Deletion coordinator active (polling every ${Math.round(intervalMs / 1000)}s)`)
}

function stopDeletionCoordinator() {
  if (coordinatorTimer) {
    clearInterval(coordinatorTimer)
    coordinatorTimer = null
  }
}

module.exports = {
  processPendingDeletionEvents,
  startDeletionCoordinator,
  stopDeletionCoordinator,
}
