const { google } = require('googleapis')
const axios = require('axios')
const logger = require('../utils/logger')

const { getConfig } = require('./config')

function getCandidateCloudUrls() {
  const primary = (process.env.CLOUD_API_URL || getConfig().cloudApiUrl || 'https://xbuddysrkr.vercel.app').replace(/\/$/, '')
  return [...new Set([primary, 'https://xbuddy.onrender.com'])]
}

function getAgentSecretKey() {
  return process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || getConfig().agentSecretKey || ''
}

const CLOUD_API_URL = process.env.CLOUD_API_URL || getConfig().cloudApiUrl || 'https://xbuddysrkr.vercel.app'
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || getConfig().agentSecretKey || ''

function getOrderSource() {
  return (process.env.PRINT_AGENT_ORDER_SOURCE || 'mongo').trim().toLowerCase()
}

// Legacy GAS / Sheets constants (strictly for emergency rollback)
const SPREADSHEET_ID = process.env.ORDERS_SPREADSHEET_ID || '16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw'
const SHEET_NAME     = 'Sheet1'
const GAS_URL = process.env.GAS_URL || process.env.GAS_ORDERS_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const API_KEY = process.env.GAS_API_KEY || process.env.API_KEY || 'XB_API_SECRET_KEY_2026'

function getAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json'
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

/**
 * Updates print status.
 * Primary: Authenticated MongoDB cloud endpoint (/api/agent/orders/:orderId/status).
 * Transitions: 'Printing', 'Printed', 'Failed'.
 * In Phase 4 mongo mode, Google Orders Sheet is NOT written to.
 */
async function updatePrintStatus(orderIdOrRowIndex, statusOrRow, statusParam) {
  let orderId = null
  let rowIndex = null
  let status = 'Printed'

  if (typeof orderIdOrRowIndex === 'string') {
    orderId = orderIdOrRowIndex
    if (typeof statusOrRow === 'number') rowIndex = statusOrRow
    status = statusParam || (typeof statusOrRow === 'string' ? statusOrRow : 'Printed')
  } else if (typeof orderIdOrRowIndex === 'number') {
    rowIndex = orderIdOrRowIndex
    status = statusOrRow || 'Printed'
  }

  const cleanId = (orderId || '').trim().toUpperCase()
  const source = getOrderSource()

  // ── PRIMARY AUTHORITATIVE PATH: MONGODB AGENT API ───────────────
  if (source === 'mongo') {
    if (!cleanId) {
      logger.warn('[AGENT] updatePrintStatus called without orderId in mongo mode')
      return
    }

    const urls = getCandidateCloudUrls()
    const secretKey = getAgentSecretKey()
    for (const baseUrl of urls) {
      try {
        const res = await axios.post(
          `${baseUrl}/api/agent/orders/${encodeURIComponent(cleanId)}/status`,
          { status },
          {
            headers: {
              'x-agent-key': secretKey,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        )
        if (res.data?.success) {
          logger.success(`[AGENT] MongoDB printStatus = ${status} (${baseUrl})`)
          return
        }
      } catch (err) {
        logger.warn(`[AGENT] Status update attempt on ${baseUrl} failed: ${err.message}`)
      }
    }
    logger.error(`[AGENT] Failed to update MongoDB printStatus for ${cleanId} across all candidate endpoints`)
    return
  }

  // ── EMERGENCY ROLLBACK ONLY: GAS / SHEETS MODE ──────────────────
  logger.warn(`[AGENT] WARNING: PRINT_AGENT_ORDER_SOURCE=gas active. Updating status for ${cleanId} via legacy GAS/Sheets.`)

  if (cleanId) {
    try {
      await axios.get(`${GAS_URL}?action=updateOrderStatus&key=${API_KEY}&orderId=${encodeURIComponent(cleanId)}&printStatus=${encodeURIComponent(status)}`, { timeout: 15000 })
      logger.success(`Order ${cleanId} -> Print Status: "${status}" (GAS)`)
    } catch (err) {
      logger.warn(`updateOrderStatus GAS notice for ${cleanId}: ${err.message}`)
    }
  }

  if (rowIndex && typeof rowIndex === 'number') {
    try {
      const auth   = getAuth()
      const sheets = google.sheets({ version: 'v4', auth })
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!K${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[status]] },
      })
      logger.success(`Row ${rowIndex} -> Print Status: "${status}" (Sheets)`)
    } catch (err) {
      logger.warn(`Failed to update status row ${rowIndex}: ${err.message}`)
    }
  }
}

/**
 * Updates release status.
 * In Phase 4 mongo mode, release lifecycle is handled by MongoDB printStatus.
 */
async function updateReleaseStatus(orderIdOrRowIndex, statusOrRow, statusParam) {
  const source = getOrderSource()
  if (source === 'mongo') {
    // Handled in MongoDB atomic claim and status endpoints
    return
  }

  // ── EMERGENCY ROLLBACK ONLY: GAS / SHEETS MODE ──────────────────
  let orderId = null
  let rowIndex = null
  let status = 'Released'

  if (typeof orderIdOrRowIndex === 'string') {
    orderId = orderIdOrRowIndex
    if (typeof statusOrRow === 'number') rowIndex = statusOrRow
    status = statusParam || (typeof statusOrRow === 'string' ? statusOrRow : 'Released')
  } else if (typeof orderIdOrRowIndex === 'number') {
    rowIndex = orderIdOrRowIndex
    status = statusOrRow || 'Released'
  }

  if (orderId) {
    try {
      await axios.get(`${GAS_URL}?action=updateOrderStatus&key=${API_KEY}&orderId=${encodeURIComponent(orderId)}&printStatus=Ready`, { timeout: 15000 })
    } catch {}
  }

  if (rowIndex && typeof rowIndex === 'number') {
    try {
      const auth   = getAuth()
      const sheets = google.sheets({ version: 'v4', auth })
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!N${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[status]] },
      })
      logger.success(`Row ${rowIndex} -> Release Status: "${status}"`)
    } catch (err) {
      logger.warn(`Failed to update release status row ${rowIndex}: ${err.message}`)
    }
  }
}

module.exports = { updatePrintStatus, updateReleaseStatus }
