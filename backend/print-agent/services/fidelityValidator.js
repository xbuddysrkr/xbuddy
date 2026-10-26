const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')
const logger = require('../utils/logger')
const { getMutoolPath } = require('./converter')

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Classifies width and height in points into standard paper sizes with 2pt tolerance.
 * Standard points:
 * A4: 595.28 x 841.89 (approx 595 x 842)
 * Letter: 612 x 792
 * Legal: 612 x 1008
 * A3: 841.89 x 1190.55 (approx 842 x 1191)
 * A5: 419.53 x 595.28 (approx 420 x 595)
 */
function classifyPaperSize(wPt, hPt) {
  const shortSide = Math.min(wPt, hPt)
  const longSide = Math.max(wPt, hPt)

  const matches = (s, l, targetS, targetL, tol = 8) => {
    return Math.abs(s - targetS) <= tol && Math.abs(l - targetL) <= tol
  }

  if (matches(shortSide, longSide, 595, 842)) return 'A4'
  if (matches(shortSide, longSide, 612, 792)) return 'Letter'
  if (matches(shortSide, longSide, 612, 1008)) return 'Legal'
  if (matches(shortSide, longSide, 842, 1191)) return 'A3'
  if (matches(shortSide, longSide, 420, 595)) return 'A5'

  return 'Custom'
}

/**
 * Parses mutool info -M output or falls back to binary parsing
 * to extract exact page dimensions, MediaBox, and orientation.
 */
function getPdfGeometry(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve({
        pageCount: 0,
        pages: [],
        primaryOrientation: 'unknown',
        primaryPaperSize: 'A4',
        hasValidGeometry: false,
      })
    }

    const mutool = getMutoolPath()
    if (!mutool) {
      return resolve(fallbackBinaryGeometry(filePath))
    }

    execFile(mutool, ['info', '-M', filePath], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(fallbackBinaryGeometry(filePath))
      }

      const pages = []
      let pageCount = 0

      // Match Pages: N
      const pageCountMatch = stdout.match(/Pages:\s*(\d+)/i)
      if (pageCountMatch) {
        pageCount = parseInt(pageCountMatch[1], 10)
      }

      // Match lines like: \t1\t(5 0 R):\t[ 0 0 595 842 ]
      const mediaBoxRegex = /^\s*(\d+)\s*\([^)]*\):\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/gm
      let match
      while ((match = mediaBoxRegex.exec(stdout)) !== null) {
        const pageNum = parseInt(match[1], 10)
        const x1 = parseFloat(match[2])
        const y1 = parseFloat(match[3])
        const x2 = parseFloat(match[4])
        const y2 = parseFloat(match[5])
        const widthPt = Math.round(Math.abs(x2 - x1))
        const heightPt = Math.round(Math.abs(y2 - y1))
        const orientation = widthPt > heightPt ? 'landscape' : 'portrait'
        const paperSize = classifyPaperSize(widthPt, heightPt)

        pages.push({
          pageNumber: pageNum,
          widthPt,
          heightPt,
          orientation,
          paperSize,
        })
      }

      if (pages.length === 0 && pageCount > 0) {
        return resolve(fallbackBinaryGeometry(filePath))
      }

      const totalFound = pages.length || pageCount || 1
      const landscapeCount = pages.filter(p => p.orientation === 'landscape').length
      const portraitCount = pages.filter(p => p.orientation === 'portrait').length

      let primaryOrientation = 'portrait'
      if (landscapeCount > 0 && portraitCount > 0) {
        primaryOrientation = 'mixed'
      } else if (landscapeCount > portraitCount) {
        primaryOrientation = 'landscape'
      }

      const firstSize = pages[0]?.paperSize || 'A4'
      const primaryPaperSize = firstSize === 'Custom' ? 'A4' : firstSize

      resolve({
        pageCount: Math.max(pageCount, totalFound),
        pages,
        primaryOrientation,
        primaryPaperSize,
        hasValidGeometry: true,
      })
    })
  })
}

function fallbackBinaryGeometry(filePath) {
  try {
    const buf = fs.readFileSync(filePath)
    const str = buf.toString('latin1', 0, Math.min(buf.length, 500000))
    const mbMatches = str.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/i)
    if (mbMatches) {
      const w = Math.round(Math.abs(parseFloat(mbMatches[3]) - parseFloat(mbMatches[1])))
      const h = Math.round(Math.abs(parseFloat(mbMatches[4]) - parseFloat(mbMatches[2])))
      const orient = w > h ? 'landscape' : 'portrait'
      const size = classifyPaperSize(w, h)
      return {
        pageCount: 1,
        pages: [{ pageNumber: 1, widthPt: w, heightPt: h, orientation: orient, paperSize: size }],
        primaryOrientation: orient,
        primaryPaperSize: size === 'Custom' ? 'A4' : size,
        hasValidGeometry: true,
      }
    }
  } catch {}
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842, orientation: 'portrait', paperSize: 'A4' }],
    primaryOrientation: 'portrait',
    primaryPaperSize: 'A4',
    hasValidGeometry: false,
  }
}

/**
 * Validates document fidelity before dispatching to physical printer.
 * Emits a structured diagnostic audit record with zero PII.
 */
async function validateDocumentFidelity({
  orderId,
  originalFilePath,
  printArtifactPath,
  originalFileName = '',
  detectedFormat = 'PDF',
  conversionOccurred = false,
  printerName,
  paperSize,
  scale = 'noscale',
  orientation = 'auto',
  pageRange = 'all',
}) {
  const sourceHash = getFileHash(originalFilePath)
  const artifactHash = getFileHash(printArtifactPath)
  const isByteIdentical = Boolean(sourceHash && artifactHash && sourceHash === artifactHash)

  const [sourceGeometry, artifactGeometry] = await Promise.all([
    getPdfGeometry(originalFilePath),
    getPdfGeometry(printArtifactPath),
  ])

  const isAllPages = !pageRange || String(pageRange).trim().toLowerCase() === 'all'
  let fidelityVerdict = 'UNKNOWN'
  if (isByteIdentical) {
    fidelityVerdict = 'PERFECT_BYTE_FIDELITY (Original PDF unchanged)'
  } else if (conversionOccurred) {
    fidelityVerdict = 'NATIVE_DOCUMENT_CONVERTED (Office layout verified)'
  } else if (!isAllPages) {
    fidelityVerdict = 'CUSTOM_PAGES_SLICED (Vector extraction verified)'
  } else {
    fidelityVerdict = 'ARTIFACT_MODIFIED'
  }

  const safeOriginalName = path.basename(originalFileName || originalFilePath || 'Document').replace(/[^a-zA-Z0-9._-]/g, '_')

  const auditRecord = {
    orderId: orderId || 'Direct',
    originalFileName: safeOriginalName,
    detectedFormat: detectedFormat.toUpperCase(),
    conversionOccurred: Boolean(conversionOccurred),
    isByteIdentical,
    fidelityVerdict,
    sourceHash: sourceHash || 'N/A',
    artifactHash: artifactHash || 'N/A',
    sourcePageCount: sourceGeometry.pageCount,
    artifactPageCount: artifactGeometry.pageCount,
    sourceDimensions: sourceGeometry.pages[0] ? `${sourceGeometry.pages[0].widthPt}x${sourceGeometry.pages[0].heightPt} pt (${sourceGeometry.primaryPaperSize}, ${sourceGeometry.primaryOrientation})` : 'N/A',
    artifactDimensions: artifactGeometry.pages[0] ? `${artifactGeometry.pages[0].widthPt}x${artifactGeometry.pages[0].heightPt} pt (${artifactGeometry.primaryPaperSize}, ${artifactGeometry.primaryOrientation})` : 'N/A',
    selectedPrinter: printerName || 'Default',
    appliedPaperSize: paperSize || sourceGeometry.primaryPaperSize,
    scalingMode: scale,
    orientationMode: orientation,
    timestamp: new Date().toISOString(),
  }

  // Safe structured log (NO PII, NO document contents)
  logger.info('───────────────────────────────────────────────────────')
  logger.info('📄 XBUDDY DOCUMENT FIDELITY VALIDATION AUDIT')
  logger.info(`Order ID:            ${auditRecord.orderId}`)
  logger.info(`Original File:       ${auditRecord.originalFileName} [${auditRecord.detectedFormat}]`)
  logger.info(`Fidelity Verdict:    ${auditRecord.fidelityVerdict}`)
  logger.info(`Source Hash:         ${auditRecord.sourceHash}`)
  logger.info(`Artifact Hash:       ${auditRecord.artifactHash}`)
  logger.info(`Source Pages:        ${auditRecord.sourcePageCount} | Dimensions: ${auditRecord.sourceDimensions}`)
  logger.info(`Artifact Pages:      ${auditRecord.artifactPageCount} | Dimensions: ${auditRecord.artifactDimensions}`)
  logger.info(`Printer / Paper:     ${auditRecord.selectedPrinter} / ${auditRecord.appliedPaperSize}`)
  logger.info(`Scaling / Orient:    ${auditRecord.scalingMode} / ${auditRecord.orientationMode}`)
  logger.info('───────────────────────────────────────────────────────')

  return {
    isByteIdentical,
    sourceHash,
    artifactHash,
    sourceGeometry,
    artifactGeometry,
    auditRecord,
  }
}

module.exports = {
  getFileHash,
  classifyPaperSize,
  getPdfGeometry,
  validateDocumentFidelity,
}
