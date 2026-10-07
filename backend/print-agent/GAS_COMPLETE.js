const SPREADSHEET_ID  = "16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw";
const SHEET_NAME      = "Sheet1";
const DRIVE_FOLDER_ID = "13aksBYQ3sRnMh_oFKTAXagUr4h7xMD9E";
const PDF_FOLDER_ID   = "1QRJ-c9wDYJJoDpflTdhkZ91rcjVBgswF";

function doGet(e) {
  try {
    const requiredKey = PropertiesService.getScriptProperties().getProperty('API_KEY') || 'XB_API_SECRET_KEY_2026'
    const providedKey = (e && e.parameter) ? e.parameter.key : ''
    const action      = (e && e.parameter) ? e.parameter.action : ''

    // Enforce shared-secret key authentication for all API actions
    if (action && providedKey !== requiredKey) {
      console.warn("Unauthorized request attempt. Action: " + action + ", Provided Key: " + providedKey)
      return jsonResponse({ success: false, error: 'Unauthorized: Invalid or missing API key' })
    }

    if (action === 'saveOrder')          return saveOrder(e.parameter)
    if (action === 'saveChunk')          return saveChunk(e.parameter)
    if (action === 'assembleFile')       return assembleFile(e.parameter)
    if (action === 'assemblePdf')        return assembleFile(e.parameter)
    if (action === 'getOrderStatus')     return getOrderStatus(e.parameter)
    if (action === 'getOrderForRelease') return getOrderForRelease(e.parameter)
    if (action === 'updateOrderStatus')  return updateOrderStatus(e.parameter)
    if (action === 'listOrders')         return listOrders()

    // ── Tunnel URL storage (for mobile print agent connection) ──
    if (action === 'setTunnelUrl') {
      PropertiesService.getScriptProperties().setProperty('TUNNEL_URL', e.parameter.url || '')
      return jsonResponse({ success: true })
    }
    if (action === 'getTunnelUrl') {
      const url = PropertiesService.getScriptProperties().getProperty('TUNNEL_URL') || ''
      return jsonResponse({ success: true, url })
    }

    return jsonResponse({ success: true, message: 'X Buddy API is live!' })
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() })
  }
}


function doPost(e) {
  try {
    const p = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : ((e && e.parameter) ? e.parameter : {})
    if (p.action === 'updateOrderStatus') return updateOrderStatus(p)
    return jsonResponse({ success: true, message: 'Use GET or JSON POST' })
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() })
  }
}

function calcDigitalProcessingFee(totalPrintedPages) {
  const pages = Number(totalPrintedPages) || 0
  if (pages <= 0) return { fee: 0, overLimit: false }
  if (pages >= 1 && pages <= 5) return { fee: 1, overLimit: false }
  if (pages >= 6 && pages <= 10) return { fee: 2, overLimit: false }
  if (pages >= 11 && pages <= 20) return { fee: 3, overLimit: false }
  if (pages >= 21 && pages <= 30) return { fee: 4, overLimit: false }
  if (pages >= 31 && pages <= 50) return { fee: 5, overLimit: false }
  if (pages >= 51 && pages <= 80) return { fee: 7, overLimit: false }
  if (pages >= 81 && pages <= 100) return { fee: 10, overLimit: false }
  return { fee: 0, overLimit: true }
}

function saveOrder(p) {
  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME)

  const orderId = p.orderId || ('XB' + String(Math.floor(1000 + Math.random() * 9000)))

  // Server-side price validation
  const totalPages  = parseInt(p.totalPages || '1') || 1
  const copies      = parseInt(p.copies || '1') || 1
  const isDouble    = (p.printSide === 'Double' || p.printSide === 'double')
  const isColor     = (p.printType === 'Color' || p.printType === 'color')
  const rate        = isColor ? 5 : 2

  let printableCount = totalPages
  if (p.pageRange === 'custom') {
    if (p.selectedPages) {
      try {
        const arr = JSON.parse(p.selectedPages)
        if (Array.isArray(arr) && arr.length > 0) printableCount = arr.length
        else if (p.printableCount) printableCount = parseInt(p.printableCount) || totalPages
      } catch (e) {
        if (p.printableCount) printableCount = parseInt(p.printableCount) || totalPages
      }
    } else if (p.printableCount) {
      printableCount = parseInt(p.printableCount) || totalPages
    }
  }

  const effectivePages      = isDouble ? Math.ceil(printableCount / 2) : printableCount
  const totalBillablePages  = effectivePages * copies
  const printingCost        = totalBillablePages * rate
  const feeResult           = calcDigitalProcessingFee(totalBillablePages)

  if (feeResult.overLimit) {
    return jsonResponse({
      success: false,
      error: 'For orders above 100 pages, please contact the Xerox shop.',
    })
  }

  const digitalProcessingFee = feeResult.fee
  const expectedTotal        = printingCost + digitalProcessingFee
  const submittedAmount      = parseFloat((p.amount || '0').toString().replace(/[^0-9.-]+/g, '')) || 0

  if (submittedAmount !== expectedTotal) {
    console.warn("Price validation failed for order " + orderId + ". Submitted: ₹" + submittedAmount + ", Expected Total: ₹" + expectedTotal)
    return jsonResponse({
      success: false,
      error: 'Price validation failed: Submitted amount ₹' + submittedAmount + ' does not match calculated price ₹' + expectedTotal,
    })
  }

  sheet.appendRow([
    orderId,
    p.name          || '',
    p.fileName      || '',
    p.totalPages    || '',
    p.copies        || '',
    p.printType     || 'B&W',
    submittedAmount || expectedTotal,
    p.transactionId || '',
    '',
    'Pending Verification',
    'Order Received',
    new Date(),
    '',
    '',
    p.printSide     || 'Single',
    p.pageSize      || 'A4',
    p.orientation   || 'portrait',
  ])

  return jsonResponse({ success: true, orderId })
}

function updateOrderStatus(p) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
  const data  = sheet.getDataRange().getValues()
  const orderId = (p.orderId || '').trim()
  const newStatus = p.printStatus || p.status || 'Order Received'

  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === orderId) {
      sheet.getRange(i + 1, 11).setValue(newStatus)
      return jsonResponse({ success: true, orderId, printStatus: newStatus })
    }
  }
  return jsonResponse({ success: false, message: 'Order not found for status update' })
}

function saveChunk(p) {
  const store = PropertiesService.getScriptProperties()
  const key   = p.fileId + '_' + p.fileType + '_' + p.index
  store.setProperty(key, p.chunk)
  store.setProperty(p.fileId + '_' + p.fileType + '_total', String(p.total))
  return jsonResponse({ success: true })
}

function assembleFile(p) {
  const store = PropertiesService.getScriptProperties()
  const total = parseInt(store.getProperty(p.fileId + '_' + p.fileType + '_total') || '0')

  if (total === 0) return jsonResponse({ success: false, error: 'No chunks found' })

  let base64 = ''
  for (let i = 0; i < total; i++) {
    const key = p.fileId + '_' + p.fileType + '_' + i
    base64 += store.getProperty(key) || ''
    store.deleteProperty(key)
  }
  store.deleteProperty(p.fileId + '_' + p.fileType + '_total')

  const folderId = p.fileType === 'pdf' ? PDF_FOLDER_ID : DRIVE_FOLDER_ID
  const fileUrl  = uploadFile(base64, p.fileName, p.mimeType, folderId)

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
  const rows  = sheet.getDataRange().getValues()
  const col   = p.fileType === 'pdf' ? 13 : 9

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === p.fileId) {
      sheet.getRange(i + 1, col).setValue(fileUrl)
      break
    }
  }

  return jsonResponse({ success: true, fileUrl })
}

function getOrderForRelease(p) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
  const data  = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === (p.orderId || '').trim()) {
      return jsonResponse({
        success:       true,
        rowIndex:      i + 1,
        orderId:       data[i][0]  || '',
        name:          data[i][1]  || '',
        fileName:      data[i][2]  || '',
        copies:        parseInt(data[i][4] || '1'),
        printType:     data[i][5]  || 'B&W',
        printStatus:   data[i][10] || '',
        releaseStatus: data[i][13] || 'Waiting For Release',
      })
    }
  }
  return jsonResponse({ success: false, message: 'Order not found' })
}

function listOrders() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
  const data  = sheet.getDataRange().getValues()
  const orders = data.slice(1).map((row, idx) => ({
    rowIndex:      idx + 2,
    orderId:       row[0]  || '',
    name:          row[1]  || '',
    fileName:      row[2]  || '',
    totalPages:    parseInt(row[3] || '1') || 1,
    copies:        parseInt(row[4] || '1') || 1,
    printType:     row[5]  || 'B&W',
    amount:        parseFloat((row[6] || '0').toString().replace(/[^0-9.-]+/g, '')) || 0,
    transactionId: row[7]  || '',
    paymentStatus: row[9]  || '',
    printStatus:   row[10] || 'Waiting',
    timestamp:     row[11] ? row[11].toString() : '',
    pdfUrl:        row[12] || '',
    releaseStatus: row[13] || 'Waiting',
  }))
  return jsonResponse({ success: true, orders })
}

function getOrderStatus(p) {
  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME)

  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.orderId) {
      return jsonResponse({
        success:       true,
        orderId:       p.orderId,
        printStatus:   data[i][10] || 'Waiting',
        paymentStatus: data[i][9]  || 'Pending',
        pdfUrl:        data[i][12] || '',
      })
    }
  }
  return jsonResponse({ success: false, message: 'Order not found' })
}

function uploadFile(base64Data, fileName, mimeType, folderId) {
  const parts  = base64Data.split(',')
  const clean  = parts.length > 1 ? parts[1] : parts[0]
  const bytes  = Utilities.base64Decode(clean)
  const blob   = Utilities.newBlob(bytes, mimeType, fileName)
  const folder = DriveApp.getFolderById(folderId)
  const file   = folder.createFile(blob)
  // Step 4: Files remain private to script owner by default.
  // Public access (ANYONE_WITH_LINK) is intentionally not set for security.
  return file.getUrl()
}

/**
 * Step 4 (Option B): Standalone manual function to revoke public link sharing on Drive files
 * for fully resolved orders (Printed or Failed).
 *
 * SAFETY FILTER: Skips any order where printStatus is 'Waiting', 'Printing', or unresolved.
 * Run this function manually from the Apps Script Editor (not exposed via doGet).
 */
function revokeResolvedFilesSharing() {
  Logger.log("=== Step 4 File Sharing Revocation Started ===");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
  const data  = sheet.getDataRange().getValues()

  let totalRowsProcessed = 0
  let totalFilesRevoked  = 0
  let totalOrdersSkipped = 0
  let totalErrors        = 0

  const skippedOrders = []

  for (let i = 1; i < data.length; i++) {
    const row           = data[i]
    const orderId       = (row[0]  || '').toString().trim()
    const screenshotUrl = (row[8]  || '').toString().trim()
    const printStatus   = (row[10] || '').toString().trim()
    const pdfUrl        = (row[12] || '').toString().trim()
    const releaseStatus = (row[13] || '').toString().trim()

    if (!orderId) continue
    totalRowsProcessed++

    // SAFETY FILTER: Only process orders that are fully resolved ('Printed' or 'Failed')
    const isResolved = (printStatus === 'Printed' || printStatus === 'Failed')

    if (!isResolved) {
      totalOrdersSkipped++
      skippedOrders.push({ orderId: orderId, printStatus: printStatus || 'Waiting', releaseStatus: releaseStatus || 'Waiting' })
      Logger.log("SKIPPED (Active/Pending Order): ID " + orderId + " | Status: '" + printStatus + "' | Release: '" + releaseStatus + "'")
      continue
    }

    // Process URLs associated with resolved order
    const urlsToRevoke = [pdfUrl, screenshotUrl].filter(Boolean)
    for (let j = 0; j < urlsToRevoke.length; j++) {
      const url = urlsToRevoke[j]
      const fileId = extractDriveFileId(url)
      if (!fileId) continue

      try {
        const file = DriveApp.getFileById(fileId)
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE)
        totalFilesRevoked++
        Logger.log("REVOKED PUBLIC ACCESS: Order " + orderId + " | File ID: " + fileId)
      } catch (err) {
        totalErrors++
        Logger.log("ERROR updating File ID " + fileId + " for Order " + orderId + ": " + err.toString())
      }
    }
  }

  Logger.log("\n================ SUMMARY LOG ================")
  Logger.log("Total Order Rows Checked: " + totalRowsProcessed)
  Logger.log("Total Files Revoked to Private: " + totalFilesRevoked)
  Logger.log("Total Active/Pending Orders Skipped: " + totalOrdersSkipped)
  Logger.log("Total Errors / Not Found / Access Denied: " + totalErrors)
  if (skippedOrders.length > 0) {
    Logger.log("\nSkipped Active Orders Detail:")
    skippedOrders.forEach(function(item) {
      Logger.log(" - Order ID: " + item.orderId + " | Print Status: " + item.printStatus + " | Release Status: " + item.releaseStatus)
    })
  } else {
    Logger.log("\nNo pending or active orders skipped. All checked orders were resolved.")
  }
  Logger.log("=============================================\n")
}

function extractDriveFileId(url) {
  if (!url) return null
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/)
  if (match && match[1]) return match[1]
  const genericMatch = url.match(/[a-zA-Z0-9_-]{25,}/)
  return genericMatch ? genericMatch[0] : null
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
