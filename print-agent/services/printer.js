const ptp = require('pdf-to-printer')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const logger = require('../utils/logger')
const { convertPdfToGrayscale } = require('./converter')

let printerCache = null
let lastPrinterCheck = 0
const PRINTER_CACHE_TTL = 15000

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        logger.warn(`PowerShell command failed: ${stderr || err.message}`)
        return resolve(false)
      }
      resolve(true)
    })
  })
}

/**
 * Configure Windows Printer Driver explicitly before each print job.
 * Prevents settings leakage between jobs.
 */
async function configureWindowsDriver(printerName, { isColor, paperSize }) {
  try {
    let script = `Set-PrintConfiguration -PrinterName "${printerName}" -Color ${isColor ? 1 : 0}`
    if (paperSize) {
      const normSize = paperSize.toUpperCase()
      const validSizes = { A4: 'A4', LETTER: 'Letter', LEGAL: 'Legal', A3: 'A3', A5: 'A5' }
      if (validSizes[normSize]) {
        script += ` -PaperSize ${validSizes[normSize]}`
      }
    }
    await runPowerShell(script)
  } catch (err) {
    logger.warn(`Could not set Windows print configuration: ${err.message}`)
  }
}

/**
 * Get the default printer name on this Windows machine
 */
async function getDefaultPrinter(verbose = true) {
  try {
    const now = Date.now()
    if (printerCache && now - lastPrinterCheck < PRINTER_CACHE_TTL) {
      return printerCache.name
    }

    const printers = await ptp.getPrinters()
    if (printers.length === 0) {
      throw new Error('No printers found on this machine')
    }

    if (verbose) {
      logger.info(`Available printers (${printers.length}):`)
      printers.forEach((p, i) => {
        logger.dim(`  ${i + 1}. ${p.name}`)
      })
    }

    // Return the default printer - prefer real printers over virtual ones
    const realPrinter = printers.find(p => {
      const name = p.name.toLowerCase()
      return !name.includes('onenote') &&
             !name.includes('fax') &&
             !name.includes('xps') &&
             !name.includes('pdf')
    })

    const defaultPrinter = realPrinter || printers[0]
    printerCache = defaultPrinter
    lastPrinterCheck = Date.now()
    return defaultPrinter.name
  } catch (err) {
    logger.error(`Could not get printers: ${err.message}`)
    return null
  }
}

/**
 * Print a PDF file with complete end-to-end settings enforcement.
 * 
 * @param {string} filePath
 * @param {object} options
 * @param {number} options.copies
 * @param {string} options.printSide   - 'Single' | 'Double'
 * @param {string} options.colorMode   - 'bw' | 'color' | 'B&W' | 'Color'
 * @param {string} options.pageSize    - 'A4' | 'Letter' | ...
 * @param {string} options.orientation - 'portrait' | 'landscape'
 * @param {string} options.pageRange   - 'all' | '1' | '1-3' | '1-3,5' | ...
 * @param {string} options.orderId
 */
async function printPdf(filePath, options = {}) {
  const {
    copies      = 1,
    printSide   = 'Single',
    colorMode   = 'bw',
    pageSize    = 'A4',
    orientation = 'portrait',
    pageRange   = 'all',
    orderId     = '',
  } = options

  let convertedTempPath = null

  try {
    // Defensive check 1: File existence
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Print file not found: ${filePath}`)
    }

    // Defensive check 2: Printer existence
    const printerName = await getDefaultPrinter()
    if (!printerName) throw new Error('No printer available on this system')

    // Defensive check 3: Resolve color mode strictly
    const rawColor = String(colorMode).trim().toLowerCase()
    let isBw = true
    if (rawColor === 'color' || rawColor === 'colour') {
      isBw = false
    } else if (['bw', 'b&w', 'black & white', 'grayscale', 'mono', 'monochrome'].includes(rawColor)) {
      isBw = true
    } else {
      logger.warn(`Unrecognized colorMode: "${colorMode}", defaulting defensively to Black & White`)
      isBw = true
    }
    const isColor = !isBw

    // Defensive check 4: Copies
    const validCopies = Math.max(1, parseInt(copies, 10) || 1)

    // Defensive check 5: Orientation
    const validOrientation = String(orientation).trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait'

    // Defensive check 6: Paper size
    const validPaperSize = String(pageSize || 'A4').trim().toUpperCase()

    // Defensive check 7: Resolve target pages
    let targetPages = pageRange
    if (targetPages === 'custom') {
      if (options.customPages && String(options.customPages).trim()) {
        targetPages = String(options.customPages).trim()
      } else if (Array.isArray(options.selectedPages) && options.selectedPages.length > 0) {
        targetPages = options.selectedPages.join(',')
      } else {
        targetPages = 'all'
      }
    }
    const resolvedPages = (!targetPages || targetPages === 'all') ? 'All' : String(targetPages).trim()

    // Duplex display
    const isDuplex = printSide === 'Double' || options.duplex === true
    const duplexLabel = isDuplex ? 'Long-edge' : 'Off'

    // Log resolved print settings exactly as required by Part 1.10
    console.log('====================================')
    console.log('PRINT JOB')
    console.log(`Order ID:    ${orderId || 'Direct'}`)
    console.log(`Printer:     ${printerName}`)
    console.log(`Color Mode:  ${isColor ? 'COLOR' : 'BLACK & WHITE'}`)
    console.log(`Paper Size:  ${validPaperSize}`)
    console.log(`Orientation: ${validOrientation === 'landscape' ? 'Landscape' : 'Portrait'}`)
    console.log(`Duplex:      ${duplexLabel}`)
    console.log(`Copies:      ${validCopies}`)
    console.log(`Pages:       ${resolvedPages}`)
    console.log('====================================')

    // Apply explicit driver configuration before printing to eliminate driver-default leakage
    await configureWindowsDriver(printerName, {
      isColor,
      paperSize: validPaperSize,
    })

    // Grayscale enforcement via native DeviceGray rasterizer
    let printTargetFile = filePath
    if (isBw) {
      convertedTempPath = path.join(path.dirname(filePath), `mono_${Date.now()}_${path.basename(filePath)}`)
      logger.info(`Converting document to pure DeviceGray grayscale...`)
      try {
        await convertPdfToGrayscale(filePath, convertedTempPath)
        printTargetFile = convertedTempPath
        logger.success(`DeviceGray conversion complete: ${path.basename(convertedTempPath)}`)
      } catch (convErr) {
        logger.warn(`Grayscale conversion fallback to driver-only: ${convErr.message}`)
        printTargetFile = filePath
      }
    }

    // Build pdf-to-printer options
    const printOptions = {
      printer:    printerName,
      copies:     validCopies,
      silent:     true,
      paperSize:  validPaperSize,
      scale:      'fit',
      monochrome: isBw,
    }

    if (validOrientation === 'landscape') {
      printOptions.orientation = 'landscape'
    } else {
      printOptions.orientation = 'portrait'
    }

    if (isDuplex) {
      printOptions.side = 'duplexlong'
    }

    if (resolvedPages !== 'All') {
      printOptions.pages = resolvedPages
    }

    await ptp.print(printTargetFile, printOptions)

    logger.success(`Print job successfully sent to ${printerName} for order ${orderId}`)
    return true
  } catch (err) {
    logger.error(`Print failed for order ${orderId}: ${err.message}`)
    return false
  } finally {
    // Delay temporary file cleanup by 60 seconds to ensure SumatraPDF has finished reading
    if (convertedTempPath) {
      setTimeout(() => {
        try {
          if (fs.existsSync(convertedTempPath)) fs.unlinkSync(convertedTempPath)
        } catch {}
      }, 60000)
    }
  }
}

module.exports = { printPdf, getDefaultPrinter, configureWindowsDriver }
