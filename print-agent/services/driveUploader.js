const { google } = require('googleapis')
const fs     = require('fs')
const path   = require('path')
const logger = require('../utils/logger')

const PDF_FOLDER_ID        = '1QRJ-c9wDYJJoDpflTdhkZ91rcjVBgswF'
const SCREENSHOT_FOLDER_ID = '13aksBYQ3sRnMh_oFKTAXagUr4h7xMD9E'

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  })
}

/**
 * Upload a local PDF file to Google Drive
 * @param {string} filePath - Local path to PDF
 * @param {string} fileName - Name to save in Drive
 * @returns {string} Public URL of uploaded file
 */
async function uploadPdfToDrive(filePath, fileName) {
  try {
    const auth  = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    // Detect mime type from file extension
    const ext      = path.extname(fileName).toLowerCase()
    const mimeType = ext === '.pdf' ? 'application/pdf' : 'image/png'
    const folderId = ext === '.pdf' ? PDF_FOLDER_ID : SCREENSHOT_FOLDER_ID

    logger.info(`Uploading to Drive: ${fileName}`)

    // Upload file
    const response = await drive.files.create({
      requestBody: {
        name:    fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    })

    const fileId = response.data.id

    // Make file publicly viewable
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`
    logger.success(`PDF uploaded to Drive: ${fileUrl}`)
    return fileUrl

  } catch (err) {
    logger.error(`Drive upload failed: ${err.message}`)
    return ''
  }
}

module.exports = { uploadPdfToDrive }
