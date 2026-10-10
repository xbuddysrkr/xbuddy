/**
 * XBuddy Single Source of Truth for Print Settings
 * Normalizes, validates, and serializes print settings across the entire pipeline:
 * UI -> Order Payload -> GAS Backend -> Print Agent -> Windows Driver / Physical Printer
 */

import { parsePageRange, resolveAllPages } from './pageRangeParser.js'

/**
 * Normalizes color mode string to strictly 'bw' | 'color'.
 * Accepts legacy representations ('B&W', 'Black & White', 'monochrome', 'mono', etc.)
 * Returns normalized 'bw' or 'color'.
 */
export function normalizeColorMode(val) {
  if (!val) return 'bw'
  const str = String(val).trim().toLowerCase()
  if (str === 'color' || str === 'colour') return 'color'
  if (['bw', 'b&w', 'black & white', 'grayscale', 'greyscale', 'mono', 'monochrome'].includes(str)) {
    return 'bw'
  }
  // Unknown value: return null
  return null
}

/**
 * Normalizes orientation string to 'portrait' | 'landscape'
 */
export function normalizeOrientation(val) {
  if (!val) return 'portrait'
  const str = String(val).trim().toLowerCase()
  if (str === 'landscape') return 'landscape'
  if (str === 'portrait') return 'portrait'
  return null
}

/**
 * Normalizes paper size string (e.g. 'A4', 'Letter')
 */
export function normalizePaperSize(val) {
  if (!val) return 'A4'
  const str = String(val).trim().toUpperCase()
  if (['A4', 'LETTER', 'LEGAL', 'A3', 'A5'].includes(str)) return str
  return null
}

/**
 * Create a strictly normalized Print Settings object.
 * 
 * @param {object} raw
 * @param {number} totalPages Total pages in PDF document
 * @returns {object} Normalized Print Settings object
 */
export function createNormalizedPrintSettings(raw = {}, totalPages = 1) {
  const colorMode = normalizeColorMode(raw.colorMode || raw.printType) || 'bw'
  const orientation = normalizeOrientation(raw.orientation) || 'portrait'
  const paperSize = normalizePaperSize(raw.paperSize || raw.pageSize) || 'A4'
  const copies = Math.max(1, parseInt(raw.copies, 10) || 1)
  
  // Duplex / sideMode
  const sideMode = (raw.sideMode === 'double' || raw.printSide === 'Double' || raw.duplex === true) ? 'double' : 'single'
  const duplex = sideMode === 'double'

  // Page range resolution
  const pageRangeMode = raw.pageRangeMode || (raw.pageRange && raw.pageRange !== 'all' ? 'custom' : 'all')
  const customPagesInput = String(raw.customPages || (raw.pageRange !== 'all' ? raw.pageRange : '') || '').trim()

  let selectedPages = []
  let pageRange = 'all'
  let isRangeValid = true
  let rangeError = null

  if (pageRangeMode === 'custom') {
    const parsed = parsePageRange(customPagesInput, totalPages)
    if (parsed.valid) {
      selectedPages = parsed.selectedPages
      pageRange = parsed.pageRangeString
    } else {
      isRangeValid = false
      rangeError = parsed.error || 'Invalid page range'
      selectedPages = []
      pageRange = customPagesInput
    }
  } else {
    selectedPages = resolveAllPages(totalPages)
    pageRange = 'all'
  }

  const selectedPageCount = selectedPages.length

  return {
    colorMode,                   // 'bw' | 'color'
    printType: colorMode === 'color' ? 'Color' : 'B&W', // legacy compatibility
    pageRangeMode,               // 'all' | 'custom'
    pageRange,                   // 'all' or e.g. "1-3,5"
    customPages: pageRangeMode === 'custom' ? customPagesInput : '',
    selectedPages,               // [1, 2, 3]
    selectedPageCount,           // 3
    copies,                      // integer >= 1
    paperSize,                   // 'A4'
    pageSize: paperSize,         // legacy compatibility
    orientation,                 // 'portrait' | 'landscape'
    duplex,                      // boolean: false | true
    sideMode,                    // 'single' | 'double'
    printSide: duplex ? 'Double' : 'Single', // legacy compatibility
    isRangeValid,
    rangeError,
  }
}

/**
 * Defensive validation before printing / order submission.
 * Throws an Error with human-readable reason if any setting is invalid or unsupported.
 */
export function validatePrintSettings(settings, { totalPages, maxCopies = 100 } = {}) {
  if (!settings) throw new Error('Print settings object is missing')

  // Color Mode
  if (!['bw', 'color'].includes(settings.colorMode)) {
    throw new Error(`Invalid Color Mode: "${settings.colorMode}". Supported modes: Black & White (bw), Color (color).`)
  }

  // Copies
  if (!Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > maxCopies) {
    throw new Error(`Invalid copies count: ${settings.copies}. Must be between 1 and ${maxCopies}.`)
  }

  // Orientation
  if (!['portrait', 'landscape'].includes(settings.orientation)) {
    throw new Error(`Invalid orientation: "${settings.orientation}". Must be "portrait" or "landscape".`)
  }

  // Paper Size
  if (!['A4', 'LETTER', 'LEGAL', 'A3', 'A5'].includes(settings.paperSize)) {
    throw new Error(`Unsupported paper size: "${settings.paperSize}". Supported: A4, Letter, Legal, A3, A5.`)
  }

  // Page range validation
  if (settings.pageRangeMode === 'custom') {
    if (!settings.isRangeValid) {
      throw new Error(`Invalid custom page range: ${settings.rangeError || settings.customPages}`)
    }
    if (!settings.selectedPages || settings.selectedPages.length === 0) {
      throw new Error('Custom page range resulted in 0 selected pages.')
    }
    if (totalPages) {
      const outOfBounds = settings.selectedPages.filter(p => p < 1 || p > totalPages)
      if (outOfBounds.length > 0) {
        throw new Error(`Selected pages (${outOfBounds.join(', ')}) exceed total document pages (${totalPages}).`)
      }
    }
  }

  return true
}
