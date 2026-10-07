// Pricing constants
export const RATES = {
  bw: 2,     // ₹2 per page for Black & White
  color: 5,  // ₹5 per page for Color
}

/**
 * Digital Processing Fee Slabs (based on total billable printed pages in order):
 * 1–5 pages   → ₹1
 * 6–10 pages  → ₹2
 * 11–20 pages → ₹3
 * 21–30 pages → ₹4
 * 31–50 pages → ₹5
 * 51–80 pages → ₹7
 * 81–100 pages → ₹10
 * > 100 pages → Contact shop
 */
export function calcDigitalProcessingFee(totalPrintedPages) {
  const pages = Number(totalPrintedPages) || 0
  if (pages <= 0) return { fee: 0, overLimit: false, message: '' }
  if (pages >= 1 && pages <= 5) return { fee: 1, overLimit: false, message: '' }
  if (pages >= 6 && pages <= 10) return { fee: 2, overLimit: false, message: '' }
  if (pages >= 11 && pages <= 20) return { fee: 3, overLimit: false, message: '' }
  if (pages >= 21 && pages <= 30) return { fee: 4, overLimit: false, message: '' }
  if (pages >= 31 && pages <= 50) return { fee: 5, overLimit: false, message: '' }
  if (pages >= 51 && pages <= 80) return { fee: 7, overLimit: false, message: '' }
  if (pages >= 81 && pages <= 100) return { fee: 10, overLimit: false, message: '' }
  
  return {
    fee: 0,
    overLimit: true,
    message: 'For orders above 100 pages, please contact the Xerox shop.',
  }
}

// Backward-compatible helper
export function calcServiceFee(printingCost, totalPrintedPages) {
  if (totalPrintedPages !== undefined) {
    return calcDigitalProcessingFee(totalPrintedPages).fee
  }
  return 0
}

/**
 * Calculate effective pages based on double-side setting.
 */
export function calcEffectivePages(totalPages, isDoubleSide) {
  if (isDoubleSide) return Math.ceil(totalPages / 2)
  return totalPages
}

export function calcPriceBreakdown({ totalPages, colorMode, isDoubleSide, copies = 1, pageRange, selectedPages }) {
  const numCopies = Math.max(1, Number(copies) || 1)
  const isCustom = pageRange === 'custom' || (pageRange && pageRange !== 'all')
  const printablePages = isCustom
    ? (Array.isArray(selectedPages) ? selectedPages.length : (Number(selectedPages) || 0))
    : (Number(totalPages) || 0)

  const ratePerPage = colorMode === 'color' ? RATES.color : RATES.bw

  if (isCustom && printablePages <= 0) {
    return {
      printablePages: 0,
      effectivePages: 0,
      totalBillablePages: 0,
      ratePerPage,
      copies: numCopies,
      printingCost: 0,
      digitalProcessingFee: 0,
      serviceFee: 0,
      totalAmount: 0,
      overLimit: false,
      overLimitMessage: '',
      invalidSelection: true,
    }
  }

  const effectivePages = calcEffectivePages(printablePages, isDoubleSide)
  const totalBillablePages = effectivePages * numCopies
  const printingCost = totalBillablePages * ratePerPage

  const { fee: digitalProcessingFee, overLimit, message: overLimitMessage } = calcDigitalProcessingFee(totalBillablePages)
  const totalAmount = overLimit ? 0 : (printingCost + digitalProcessingFee)

  return {
    printablePages,
    effectivePages,
    totalBillablePages,
    ratePerPage,
    copies: numCopies,
    printingCost,
    digitalProcessingFee,
    serviceFee: digitalProcessingFee, // alias for backwards compatibility
    totalAmount,
    overLimit,
    overLimitMessage,
    invalidSelection: false,
  }
}

export function calcTotal(params) {
  const { totalAmount } = calcPriceBreakdown(params)
  return totalAmount
}

// Estimate print time: ~8 seconds per page (single side), ~12s double side
export function estimatePrintTime(totalPages, isDoubleSide, copies = 1) {
  const secsPerPage = isDoubleSide ? 6 : 8
  const totalSecs = (Number(totalPages) || 1) * (Number(copies) || 1) * secsPerPage
  if (totalSecs < 60) return `~${totalSecs} seconds`
  return `~${Math.ceil(totalSecs / 60)} minute${Math.ceil(totalSecs / 60) > 1 ? 's' : ''}`
}


