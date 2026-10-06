const axios = require('axios')
const fs    = require('fs')
const path  = require('path')
const logger = require('../utils/logger')

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads')

// Ensure downloads folder exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
}

/**
 * Convert a Google Drive share URL to a direct download URL
 * Share URL:   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * Download URL: https://drive.google.com/uc?export=download&id=FILE_ID
 */
function getDriveDownloadUrl(driveUrl) {
  // Extract file ID from various Drive URL formats
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,   // /file/d/FILE_ID/
    /id=([a-zA-Z0-9_-]+)/,            // ?id=FILE_ID
    /\/d\/([a-zA-Z0-9_-]+)/,          // /d/FILE_ID
  ]

  for (const pattern of patterns) {
    const match = driveUrl.match(pattern)
    if (match) {
      return `https://drive.google.com/uc?export=download&confirm=t&id=${match[1]}`
    }
  }

  // If no pattern matched, return as-is
  return driveUrl
}

/**
 * Download a PDF from Google Drive to the downloads folder
 * @param {string} orderId  - Used as filename
 * @param {string} driveUrl - Google Drive share URL
 * @returns {string} Local file path of downloaded PDF
 */
async function downloadPdf(orderId, driveUrl) {
  const downloadUrl = getDriveDownloadUrl(driveUrl)
  const filePath    = path.join(DOWNLOADS_DIR, `${orderId}.pdf`)

  logger.info(`Downloading PDF for order ${orderId}...`)

  const response = await axios.get(downloadUrl, {
    responseType: 'stream',
    timeout: 30000, // 30 second timeout
    headers: {
      'User-Agent': 'Mozilla/5.0', // Required for Drive download
    },
    maxRedirects: 5,
  })

  // Write stream to file
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
  })

  const stats   = fs.statSync(filePath)
  const sizeKB  = (stats.size / 1024).toFixed(1)
  logger.success(`Downloaded: ${orderId}.pdf (${sizeKB} KB)`)

  return filePath
}

/**
 * Delete a downloaded PDF after printing
 */
function deletePdf(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      logger.dim(`Deleted temp file: ${path.basename(filePath)}`)
    }
  } catch (err) {
    logger.warn(`Could not delete file: ${err.message}`)
  }
}

module.exports = { downloadPdf, deletePdf }
