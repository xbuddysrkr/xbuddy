const { google } = require('googleapis')
const axios = require('axios')
const logger = require('../utils/logger')

const SPREADSHEET_ID = '16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw'
const SHEET_NAME     = 'Sheet1'
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const API_KEY = process.env.API_KEY || 'XB_API_SECRET_KEY_2026'

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// Update Print Status
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

  // 1. Sync to active GAS (Google Sheets live ground truth)
  if (orderId) {
    try {
      await axios.get(`${GAS_URL}?action=updateOrderStatus&key=${API_KEY}&orderId=${encodeURIComponent(orderId)}&printStatus=${encodeURIComponent(status)}`, { timeout: 15000 })
      logger.success(`Order ${orderId} -> Print Status: "${status}" (GAS)`)
    } catch (err) {
      logger.warn(`updateOrderStatus GAS notice for ${orderId}: ${err.message}`)
    }
  }

  // 2. Direct Sheets API if rowIndex available
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

// Update Release Status
async function updateReleaseStatus(orderIdOrRowIndex, statusOrRow, statusParam) {
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
