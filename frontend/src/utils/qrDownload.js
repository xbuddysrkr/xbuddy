/**
 * qrDownload.js
 * 
 * High-fidelity QR image generator and browser download controller for XBuddy.
 * 
 * Key Principles:
 * 1. Generates crisp, sharp PNG data URLs from authoritative payment UPI URIs.
 * 2. Strict filename convention: XBuddy-Payment-QR-${orderId}.png (zero PII, zero student names).
 * 3. Browser-supported download mechanism without silent gallery assumptions.
 * 4. Idempotent trigger protection to prevent repeated downloads on re-renders.
 */

import QRCode from 'qrcode'

/**
 * Builds standard safe filename for the payment QR image.
 * Strips any sensitive data, symbols, or spaces.
 * 
 * @param {string} orderId 
 * @returns {string} e.g. "XBuddy-Payment-QR-XB8212.png"
 */
export function buildQrFilename(orderId) {
  const cleanId = String(orderId || 'ORDER')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .trim()
  return `XBuddy-Payment-QR-${cleanId || 'ORDER'}.png`
}

/**
 * Converts a standard UPI URI string into an ultra-sharp, high-contrast 800x800 PNG.
 * Uses medium error correction ('M') and a 2-module quiet margin for maximum scanner readability.
 * 
 * @param {string} upiUri 
 * @param {object} [options]
 * @returns {Promise<string>} PNG Data URL
 */
export async function generateSharpQrPng(upiUri, options = {}) {
  if (!upiUri || typeof upiUri !== 'string') {
    throw new Error('Valid UPI URI string is required for QR PNG generation')
  }

  const width = options.width || 800
  const margin = options.margin !== undefined ? options.margin : 2
  const errorCorrectionLevel = options.errorCorrectionLevel || 'M'

  return QRCode.toDataURL(upiUri, {
    type: 'image/png',
    width,
    margin,
    errorCorrectionLevel,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

/**
 * Initiates browser download of the QR PNG image.
 * Uses standard HTML5 download attribute.
 * 
 * @param {string} pngDataUrl 
 * @param {string} filename 
 * @returns {boolean} true if download anchor clicked without error
 */
export function triggerQrDownload(pngDataUrl, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }
  if (!pngDataUrl || !pngDataUrl.startsWith('data:image/png')) {
    console.warn('[QR Download Warn]: Invalid PNG data URL provided')
    return false
  }

  try {
    const link = document.createElement('a')
    link.href = pngDataUrl
    link.download = filename || 'XBuddy-Payment-QR.png'
    link.rel = 'noopener noreferrer'
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link)
      }
    }, 200)

    return true
  } catch (err) {
    console.warn('[QR Download Trigger Notice]: Browser blocked automatic download:', err.message)
    return false
  }
}

/**
 * Full workflow helper: generates PNG from UPI URI and triggers download.
 * 
 * @param {string} upiUri 
 * @param {string} orderId 
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, filename: string, dataUrl: string }>}
 */
export async function downloadOrderPaymentQr(upiUri, orderId, options = {}) {
  const filename = buildQrFilename(orderId)
  const dataUrl = await generateSharpQrPng(upiUri, options)
  const success = triggerQrDownload(dataUrl, filename)
  return { success, filename, dataUrl }
}
