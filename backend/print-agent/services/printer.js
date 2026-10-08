const ptp = require('pdf-to-printer')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const logger = require('../utils/logger')
const { convertPdfToGrayscale } = require('./converter')
const { getConfig, saveConfig } = require('./config')

const MUTOOL_BIN = path.join(__dirname, '..', 'bin', 'mutool.exe')

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          logger.warn(`PowerShell command failed: ${stderr || err.message}`)
          return resolve({ success: false, stdout: '', stderr: stderr || err.message })
        }
        resolve({ success: true, stdout: stdout.trim(), stderr: '' })
      }
    )
  })
}

/**
 * Enumerate all installed Windows printers with status and details.
 */
async function getAllWindowsPrinters() {
  try {
    const script = `Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, WorkOffline | ConvertTo-Json -Compress`
    const { success, stdout } = await runPowerShell(script)
    if (!success || !stdout) {
      // Fallback to pdf-to-printer
      const list = await ptp.getPrinters()
      return list.map(p => ({
        name: p.name,
        isDefault: false,
        isOnline: true,
      }))
    }

    let parsed = JSON.parse(stdout)
    if (!Array.isArray(parsed)) parsed = [parsed]

    return parsed.map(p => {
      const isOnline = p.WorkOffline === false || p.WorkOffline === 0 || p.WorkOffline === null
      return {
        name: String(p.Name || '').trim(),
        isDefault: Boolean(p.Default),
        isOnline,
        status: isOnline ? 'Ready' : 'Offline',
      }
    })
  } catch (err) {
    logger.warn(`[PRINTER_DISCOVERY_ERROR] ${err.message}`)
    return []
  }
}

/**
 * Resolves the active printer according to station configuration.
 * Adheres strictly to Requirement 7:
 * If selected printer is unavailable or missing, reports 'Printer unavailable'
 * and NEVER silently switches to another printer!
 */
async function getActivePrinter(validate = true) {
  const config = getConfig()
  const allPrinters = await getAllWindowsPrinters()

  // 1. If operator has chosen a specific printer in station config
  if (config.selectedPrinter && config.selectedPrinter.trim()) {
    const targetName = config.selectedPrinter.trim()
    const found = allPrinters.find(p => p.name.toLowerCase() === targetName.toLowerCase())

    if (!found) {
      return {
        name: targetName,
        available: false,
        error: `Selected printer "${targetName}" is not installed on this system.`,
      }
    }

    if (!found.isOnline) {
      return {
        name: found.name,
        available: false,
        error: `Selected printer "${found.name}" is offline or paused in Windows.`,
      }
    }

    return {
      name: found.name,
      available: true,
      isDefault: found.isDefault,
    }
  }

  // 2. First-run auto-discovery: detect preferred hardware printer and bind it
  if (allPrinters.length > 0) {
    // Prefer real hardware printers over virtual PDF/XPS drivers
    const realPrinter = allPrinters.find(p => {
      const n = p.name.toLowerCase()
      return !n.includes('onenote') && !n.includes('fax') && !n.includes('xps') && !n.includes('pdf')
    })
    const defaultPrinter = realPrinter || allPrinters.find(p => p.isDefault) || allPrinters[0]

    // Auto-save bound printer to configuration
    saveConfig({ selectedPrinter: defaultPrinter.name })
    logger.info(`[PRINTER_SETUP] Auto-bound primary printer: ${defaultPrinter.name}`)

    return {
      name: defaultPrinter.name,
      available: defaultPrinter.isOnline,
      error: defaultPrinter.isOnline ? null : `Printer "${defaultPrinter.name}" is offline.`,
    }
  }

  return {
    name: 'None',
    available: false,
    error: 'No printers detected on this Windows PC.',
  }
}

/**
 * Backwards compatibility alias
 */
async function getDefaultPrinter(verbose = true) {
  const active = await getActivePrinter(true)
  if (!active.available) {
    logger.warn(`[PRINTER] ${active.error || 'Printer unavailable'}`)
    return null
  }
  return active.name
}

/**
 * Configure Windows Printer Driver explicitly before each print job via PowerShell.
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
 * Pre-slice PDF if custom page ranges are specified (Requirement 11).
 * Extracts exact pages (e.g. 2,4-6 -> 2,4,5,6) into an isolated PDF buffer.
 */
function slicePdfCustomPages(inputPath, pageRangeStr, outputPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(MUTOOL_BIN)) {
      logger.warn('[SLICE] mutool.exe not found, using driver pageRange fallback')
      return resolve(false)
    }

    // mutool merge -o outputPath inputPath 2,4-6
    const cleanRanges = String(pageRangeStr).replace(/\s+/g, '')
    execFile(MUTOOL_BIN, ['merge', '-o', outputPath, inputPath, cleanRanges], (err) => {
      if (err || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100) {
        logger.warn(`[SLICE] mutool page extraction failed: ${err?.message || 'Empty file'}`)
        return resolve(false)
      }
      logger.success(`[SLICE] Successfully extracted pages "${cleanRanges}" into temporary print PDF`)
      resolve(true)
    })
  })
}

/**
 * Print a PDF file with complete end-to-end hardware settings enforcement.
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
  let slicedTempPath = null

  try {
    // 1. Verify file exists
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Print file not found: ${filePath}`)
    }

    // 2. Verify selected printer exists and is available (Requirement 7)
    const active = await getActivePrinter(true)
    if (!active.available) {
      throw new Error(active.error || 'Configured printer is unavailable or offline')
    }
    const printerName = active.name

    // 3. Resolve color mode strictly
    const rawColor = String(colorMode).trim().toLowerCase()
    let isBw = true
    if (rawColor === 'color' || rawColor === 'colour') {
      isBw = false
    } else if (['bw', 'b&w', 'black & white', 'grayscale', 'mono', 'monochrome'].includes(rawColor)) {
      isBw = true
    } else {
      isBw = true
    }
    const isColor = !isBw

    // 4. Copies & Orientation & Page size
    const validCopies = Math.max(1, parseInt(copies, 10) || 1)
    const validOrientation = String(orientation).trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait'
    const validPaperSize = String(pageSize || 'A4').trim().toUpperCase()

    // 5. Resolve custom pages (Requirement 11)
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

    // Duplex resolution
    const isDuplex = printSide === 'Double' || options.duplex === true
    const duplexLabel = isDuplex ? 'Long-edge (Duplex)' : 'Off (Single-sided)'

    logger.info('====================================')
    logger.info('XBUDDY HARDWARE PRINT JOB')
    logger.info(`Order ID:    ${orderId || 'Direct'}`)
    logger.info(`Printer:     ${printerName}`)
    logger.info(`Color Mode:  ${isColor ? 'COLOR' : 'BLACK & WHITE'}`)
    logger.info(`Paper Size:  ${validPaperSize}`)
    logger.info(`Orientation: ${validOrientation}`)
    logger.info(`Duplex:      ${duplexLabel}`)
    logger.info(`Copies:      ${validCopies}`)
    logger.info(`Pages:       ${resolvedPages}`)
    logger.info('====================================')

    // Apply explicit driver configuration before every print job to eliminate settings leakage
    await configureWindowsDriver(printerName, {
      isColor,
      paperSize: validPaperSize,
    })

    let printTargetFile = filePath

    // Pre-slice custom pages if not "All"
    if (resolvedPages !== 'All' && resolvedPages !== 'all') {
      slicedTempPath = path.join(path.dirname(filePath), `sliced_${Date.now()}_${path.basename(filePath)}`)
      const sliced = await slicePdfCustomPages(filePath, resolvedPages, slicedTempPath)
      if (sliced) {
        printTargetFile = slicedTempPath
      }
    }

    // Grayscale enforcement via native DeviceGray rasterizer (Requirement 12)
    if (isBw) {
      convertedTempPath = path.join(path.dirname(filePath), `mono_${Date.now()}_${path.basename(printTargetFile)}`)
      logger.info(`Converting document to pure DeviceGray grayscale...`)
      try {
        await convertPdfToGrayscale(printTargetFile, convertedTempPath)
        printTargetFile = convertedTempPath
        logger.success(`DeviceGray conversion complete: ${path.basename(convertedTempPath)}`)
      } catch (convErr) {
        logger.warn(`Grayscale raster fallback: ${convErr.message}`)
      }
    }

    // Build pdf-to-printer options with silent hardware execution (Requirement 13)
    const printOptions = {
      printer:    printerName,
      copies:     validCopies,
      silent:     true,
      paperSize:  validPaperSize,
      scale:      'fit',
    }

    // Duplex printing flag
    if (isDuplex) {
      printOptions.sides = 'duplex'
    } else {
      printOptions.sides = 'simplex'
    }

    // If orientation is landscape, specify in options
    if (validOrientation === 'landscape') {
      printOptions.orientation = 'landscape'
    }

    // If not sliced, pass page range string to printer driver
    if (!slicedTempPath && resolvedPages !== 'All') {
      printOptions.pageRange = resolvedPages
    }

    logger.info(`Dispatching silent print via pdf-to-printer to "${printerName}"...`)
    await ptp.print(printTargetFile, printOptions)
    logger.success(`[PRINT_SUCCESS] Physical print job queued successfully for Order ${orderId || 'Direct'}`)
    return true
  } catch (err) {
    logger.error(`[PRINT_FAILURE] ${err.message}`)
    return false
  } finally {
    // Clean up temporary files safely after slight delay
    setTimeout(() => {
      if (slicedTempPath && fs.existsSync(slicedTempPath)) {
        try { fs.unlinkSync(slicedTempPath) } catch {}
      }
      if (convertedTempPath && fs.existsSync(convertedTempPath)) {
        try { fs.unlinkSync(convertedTempPath) } catch {}
      }
    }, 120000)
  }
}

module.exports = {
  getAllWindowsPrinters,
  getActivePrinter,
  getDefaultPrinter,
  configureWindowsDriver,
  slicePdfCustomPages,
  printPdf,
}
