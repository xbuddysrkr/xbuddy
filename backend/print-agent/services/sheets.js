const { google } = require('googleapis')
const axios = require('axios')
const logger = require('../utils/logger')

const CLOUD_API_URL = process.env.CLOUD_API_URL || 'https://xbuddy.onrender.com'
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || 'd834c5055c2a2401ee3f59cd121f59258403156e86034eab956dc099351dd9e4'

/**
 * Feature flag for Print Agent order source: 'mongo' (default for Phase 4) or 'gas' (emergency rollback).
 * In 'mongo' mode, all order queries and queue retrievals route to authenticated MongoDB cloud endpoints.
 * In 'gas' mode, orders route to legacy Google Apps Script and Google Sheet.
 */
function getOrderSource() {
  return (process.env.PRINT_AGENT_ORDER_SOURCE || 'mongo').trim().toLowerCase()
}

// Legacy GAS / Sheets constants (retained strictly for emergency rollback)
const SPREADSHEET_ID = process.env.ORDERS_SPREADSHEET_ID || '16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw'
const SHEET_NAME     = 'Sheet1'
const GAS_URL = process.env.GAS_URL || process.env.GAS_ORDERS_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const API_KEY = process.env.GAS_API_KEY || process.env.API_KEY || 'XB_API_SECRET_KEY_2026'

const COL = {
  ORDER_ID:       0,
  NAME:           1,
  FILE_NAME:      2,
  TOTAL_PAGES:    3,
  COPIES:         4,
  PRINT_TYPE:     5,
  AMOUNT:         6,
  TRANSACTION_ID: 7,
  SCREENSHOT_URL: 8,
  PAYMENT_STATUS: 9,
  PRINT_STATUS:   10,
  TIMESTAMP:      11,
  PDF_URL:        12,
  RELEASE_STATUS: 13,
}

function getAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json'
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

/**
 * Retrieves pending/waiting orders for Print Agent.
 * Primary: Authenticated MongoDB cloud endpoint (/api/agent/orders/pending).
 * Rollback: Legacy GAS / Sheets (only if PRINT_AGENT_ORDER_SOURCE=gas).
 */
async function getWaitingOrders() {
  const source = getOrderSource()

  if (source === 'mongo') {
    try {
      const res = await axios.get(`${CLOUD_API_URL}/api/agent/orders/pending`, {
        headers: { 'x-agent-key': AGENT_SECRET_KEY },
        timeout: 15000,
      })
      if (res.data?.success && Array.isArray(res.data.orders)) {
        return res.data.orders
      }
    } catch (err) {
      logger.error(`[AGENT] Failed to fetch pending orders from MongoDB primary: ${err.message}`)
      return []
    }
  }

  // Legacy fallback (only when explicitly configured)
  logger.warn('[AGENT] WARNING: PRINT_AGENT_ORDER_SOURCE=gas active. Fetching waiting orders from legacy GAS.')
  try {
    const res = await axios.get(`${GAS_URL}?action=listOrders&key=${API_KEY}`, { timeout: 15000 })
    if (res.data?.success && Array.isArray(res.data.orders)) {
      return res.data.orders.filter(o => (o.printStatus || '').toLowerCase().includes('wait'))
    }
  } catch (err) {
    logger.warn(`getWaitingOrders GAS notice: ${err.message}`)
  }

  try {
    const auth   = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:M`,
    })
    const rows = response.data.values || []
    const waitingOrders = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const printStatus = row[COL.PRINT_STATUS] || ''
      if (printStatus === 'Waiting') {
        waitingOrders.push({
          rowIndex:  i + 1,
          orderId:   row[COL.ORDER_ID]    || '',
          name:      row[COL.NAME]        || '',
          fileName:  row[COL.FILE_NAME]   || '',
          totalPages:row[COL.TOTAL_PAGES] || '1',
          copies:    parseInt(row[COL.COPIES] || '1'),
          printType: row[COL.PRINT_TYPE]  || 'B&W',
          amount:    row[COL.AMOUNT]      || '0',
          pdfUrl:    row[COL.PDF_URL]     || '',
        })
      }
    }
    return waitingOrders
  } catch (err) {
    logger.error(`Failed to read Sheets: ${err.message}`)
    return []
  }
}

/**
 * Retrieves a single order for booth release.
 * Primary: Authenticated MongoDB cloud endpoint (/api/agent/orders/:orderId).
 * Preserves all print settings without loss.
 */
async function getOrderByIdForRelease(orderId) {
  const cleanId = (orderId || '').trim().toUpperCase()
  if (!cleanId) return null

  const source = getOrderSource()

  if (source === 'mongo') {
    try {
      const res = await axios.get(`${CLOUD_API_URL}/api/agent/orders/${encodeURIComponent(cleanId)}`, {
        headers: { 'x-agent-key': AGENT_SECRET_KEY },
        timeout: 15000,
      })

      if (res.data?.success && res.data?.order) {
        const o = res.data.order
        logger.success(`[AGENT] Got order ${cleanId} from MongoDB primary`)
        return {
          orderId:           o.orderId || cleanId,
          name:              o.name || '',
          fileName:          o.fileName || `${cleanId}.pdf`,
          copies:            parseInt(o.copies || '1') || 1,
          colorMode:         (o.colorMode === 'color' || o.printType === 'Color') ? 'color' : 'bw',
          printType:         (o.colorMode === 'color' || o.printType === 'Color') ? 'Color' : 'B&W',
          printSide:         o.printSide || (o.duplex ? 'Double' : 'Single'),
          duplex:            typeof o.duplex === 'boolean' ? o.duplex : (o.printSide === 'Double'),
          pageSize:          o.pageSize || o.paperSize || 'A4',
          paperSize:         o.paperSize || o.pageSize || 'A4',
          orientation:       o.orientation || 'portrait',
          pageRange:         o.pageRange || 'all',
          pageRangeMode:     o.pageRangeMode || 'all',
          customPages:       o.customPages || '',
          selectedPages:     Array.isArray(o.selectedPages) ? o.selectedPages : [],
          selectedPageCount: o.selectedPageCount || 1,
          totalPages:        o.totalPages || 1,
          amount:            o.amount || 0,
          paymentStatus:     o.paymentStatus || 'pending',
          printStatus:       o.printStatus || 'waiting_for_shopkeeper',
          driveUrl:          o.driveUrl || '',
          pdfUrl:            o.pdfUrl || o.driveUrl || `${CLOUD_API_URL}/api/orders?action=getOrderPdf&orderId=${encodeURIComponent(cleanId)}`,
          source:            'mongo',
        }
      }
    } catch (mongoErr) {
      if (mongoErr.response?.status === 404) {
        logger.warn(`[AGENT] Order ${cleanId} not found in MongoDB primary`)
      } else {
        logger.error(`[AGENT] Error fetching ${cleanId} from MongoDB primary: ${mongoErr.message}`)
      }
      return null
    }
    return null
  }

  // ── EMERGENCY ROLLBACK ONLY: GAS MODE ────────────────────────────
  logger.warn(`[AGENT] WARNING: PRINT_AGENT_ORDER_SOURCE=gas active. Fetching ${cleanId} from legacy GAS ground truth.`)

  try {
    const res = await axios.get(`${GAS_URL}?action=getOrderStatus&key=${API_KEY}&orderId=${encodeURIComponent(cleanId)}`, { timeout: 15000 })
    if (res.data?.success && res.data?.order) {
      const o = res.data.order
      logger.success(`Got order ${cleanId} from active GAS ground truth`)
      return {
        rowIndex:      o.rowIndex || null,
        orderId:       o.orderId || cleanId,
        name:          o.name || '',
        fileName:      o.fileName || '',
        copies:        parseInt(o.copies || '1'),
        printType:     (o.colorMode === 'color' || o.printType === 'Color') ? 'Color' : 'B&W',
        printStatus:   o.printStatus || 'Waiting',
        releaseStatus: o.releaseStatus || 'Waiting',
        pdfUrl:        o.pdfUrl || o.driveUrl || '',
      }
    }
  } catch (gasErr) {
    logger.warn(`GAS getOrderStatus notice for ${cleanId}: ${gasErr.message}`)
  }

  try {
    const auth   = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:N`,
    })
    const rows = response.data.values || []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if ((row[COL.ORDER_ID] || '').trim().toUpperCase() === cleanId) {
        return {
          rowIndex:      i + 1,
          orderId:       row[COL.ORDER_ID]    || '',
          name:          row[COL.NAME]        || '',
          fileName:      row[COL.FILE_NAME]   || '',
          copies:        parseInt(row[COL.COPIES] || '1'),
          printType:     row[COL.PRINT_TYPE]  || 'B&W',
          printStatus:   row[COL.PRINT_STATUS]  || '',
          releaseStatus: row[COL.RELEASE_STATUS] || 'Waiting',
          pdfUrl:        row[COL.PDF_URL]     || '',
        }
      }
    }
  } catch (err) {
    logger.warn(`Direct Sheets lookup error: ${err.message}`)
  }

  return null
}

/**
 * Atomically claims an order in MongoDB (TASK 4).
 * Conditional state transition: pending -> Printing.
 * Prevents race condition between simultaneous polls or agents.
 */
async function claimOrder(orderId) {
  const cleanId = (orderId || '').trim().toUpperCase()
  if (!cleanId) return { success: false, error: 'orderId required' }

  const source = getOrderSource()

  if (source === 'mongo') {
    try {
      const res = await axios.post(
        `${CLOUD_API_URL}/api/agent/orders/${encodeURIComponent(cleanId)}/claim`,
        {},
        {
          headers: {
            'x-agent-key': AGENT_SECRET_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      )
      if (res.data?.success) {
        return { success: true, claimed: true, order: res.data.order }
      }
      return { success: false, conflict: res.data?.conflict, error: res.data?.error }
    } catch (err) {
      if (err.response?.status === 409) {
        return {
          success: false,
          conflict: true,
          error: err.response.data?.error || 'Order is already claimed or printing',
        }
      }
      if (err.response?.status === 404) {
        return { success: false, notFound: true, error: 'Order not found in MongoDB' }
      }
      return { success: false, error: err.message }
    }
  }

  // In legacy gas mode, return claimed
  return { success: true, claimed: true }
}

function normalizeOrderStatus(status, releaseStatus) {
  const raw = (status || releaseStatus || 'Waiting').toString().trim().toLowerCase()
  if (raw.includes('failed')) return 'Failed'
  if (raw.includes('printing')) return 'Printing'
  if (raw.includes('printed')) return 'Printed'
  if (raw.includes('released')) return 'Released'
  if (raw.includes('waiting')) return 'Waiting'
  return 'Waiting'
}

function detectDocumentType(fileName) {
  const name = (fileName || '').toLowerCase()
  if (name.includes('resume')) return 'Resume'
  if (name.includes('leave')) return 'Leave Letter'
  if (name.includes('bonafide')) return 'Bonafide'
  if (name.includes('assignment')) return 'Assignment'
  return 'Manual PDF'
}

function parseAmount(value) {
  const numeric = String(value || '').replace(/[^0-9.-]+/g, '')
  return parseFloat(numeric) || 0
}

let _cachedOrders = null
let _cachedOrdersTime = 0

/**
 * Retrieves all orders for booth/admin overview.
 * Primary: Authenticated MongoDB cloud endpoint (/api/agent/orders).
 */
async function getAllOrders() {
  const now = Date.now()
  if (_cachedOrders && (now - _cachedOrdersTime) < 5000) {
    return _cachedOrders
  }

  const source = getOrderSource()

  if (source === 'mongo') {
    try {
      const res = await axios.get(`${CLOUD_API_URL}/api/agent/orders`, {
        headers: { 'x-agent-key': AGENT_SECRET_KEY },
        timeout: 15000,
      })
      if (res.data?.success && Array.isArray(res.data.orders)) {
        _cachedOrders = res.data.orders.map((o, idx) => ({
          rowIndex:      idx + 2,
          orderId:       o.orderId || '',
          name:          o.name || '',
          fileName:      o.fileName || '',
          type:          detectDocumentType(o.fileName),
          totalPages:    parseInt(o.totalPages || '1') || 1,
          copies:        parseInt(o.copies || '1') || 1,
          printType:     (o.colorMode === 'color' || o.printType === 'Color') ? 'Color' : 'B&W',
          amount:        parseAmount(o.amount),
          transactionId: o.transactionId || '',
          screenshotUrl: '',
          paymentStatus: o.paymentStatus || '',
          printStatus:   normalizeOrderStatus(o.printStatus),
          timestamp:     o.createdAt || '',
          pdfUrl:        o.pdfUrl || o.driveUrl || '',
          releaseStatus: o.printStatus === 'Printed' ? 'Released' : 'Waiting',
        }))
        _cachedOrdersTime = now
        return _cachedOrders
      }
    } catch (err) {
      logger.error(`[AGENT] Failed to read all orders from MongoDB primary: ${err.message}`)
      return []
    }
  }

  // ── EMERGENCY ROLLBACK ONLY: GAS MODE ────────────────────────────
  logger.warn('[AGENT] WARNING: PRINT_AGENT_ORDER_SOURCE=gas active. Fetching all orders from legacy GAS.')

  try {
    const res = await axios.get(`${GAS_URL}?action=listOrders&key=${API_KEY}`, { timeout: 15000 })
    if (res.data?.success && Array.isArray(res.data.orders)) {
      _cachedOrders = res.data.orders.map((o, idx) => ({
        rowIndex:      o.rowIndex || idx + 2,
        orderId:       o.orderId || o.id || '',
        name:          o.name || '',
        fileName:      o.fileName || '',
        type:          detectDocumentType(o.fileName),
        totalPages:    parseInt(o.totalPages || '1') || 1,
        copies:        parseInt(o.copies || '1') || 1,
        printType:     (o.colorMode === 'color' || o.printType === 'Color') ? 'Color' : 'B&W',
        amount:        parseAmount(o.amount),
        transactionId: o.transactionId || '',
        screenshotUrl: o.screenshotUrl || '',
        paymentStatus: o.paymentStatus || '',
        printStatus:   normalizeOrderStatus(o.printStatus, o.releaseStatus),
        timestamp:     o.createdAt || o.timestamp || '',
        pdfUrl:        o.pdfUrl || o.driveUrl || '',
        releaseStatus: o.releaseStatus || 'Waiting',
      }))
      _cachedOrdersTime = now
      return _cachedOrders
    }
  } catch (err) {
    logger.warn(`getAllOrders GAS notice: ${err.message}`)
  }

  try {
    const auth   = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:N`,
    })
    const rows = response.data.values || []
    return rows.slice(1).map((row, index) => {
      const fileName = row[COL.FILE_NAME] || ''
      const status = normalizeOrderStatus(row[COL.PRINT_STATUS], row[COL.RELEASE_STATUS])
      return {
        rowIndex:      index + 2,
        orderId:       row[COL.ORDER_ID]      || '',
        name:          row[COL.NAME]          || '',
        fileName,
        type:          detectDocumentType(fileName),
        totalPages:    parseInt(row[COL.TOTAL_PAGES] || '1') || 1,
        copies:        parseInt(row[COL.COPIES] || '1') || 1,
        printType:     row[COL.PRINT_TYPE]    || 'B&W',
        amount:        parseAmount(row[COL.AMOUNT]),
        transactionId: row[COL.TRANSACTION_ID] || '',
        screenshotUrl: row[COL.SCREENSHOT_URL] || '',
        paymentStatus: row[COL.PAYMENT_STATUS] || '',
        printStatus:   status,
        timestamp:     row[COL.TIMESTAMP]     || '',
        pdfUrl:        row[COL.PDF_URL]       || '',
        releaseStatus: row[COL.RELEASE_STATUS] || 'Waiting',
      }
    })
  } catch (err) {
    logger.error(`Failed to read all orders from Sheets: ${err.message}`)
    return []
  }
}

async function getPdfUrlFromGas(orderId, fileName) {
  try {
    const params = new URLSearchParams({
      action:   'assemblePdf',
      key:      API_KEY,
      fileId:   orderId,
      fileName: orderId + '_' + fileName,
      mimeType: 'application/pdf',
    })
    const res  = await axios.get(`${GAS_URL}?${params.toString()}`, { timeout: 15000 })
    const data = res.data
    if (data.success && data.fileUrl) {
      logger.success(`Got PDF URL from GAS: ${data.fileUrl}`)
      return data.fileUrl
    }
  } catch (err) {
    logger.error(`Could not get PDF URL from GAS: ${err.message}`)
  }
  return null
}

module.exports = {
  getWaitingOrders,
  getOrderByIdForRelease,
  claimOrder,
  getAllOrders,
  getPdfUrlFromGas,
}
