/**
 * upiLauncher.js
 * 
 * Simplified, reliable UPI intent and deep-link launcher for X Buddy.
 * 
 * Key Principles:
 * 1. PhonePe Button: Pure app launch ONLY (zero payment data, no pa, pn, am, cu, tn, tr).
 * 2. Generic UPI buttons: Synchronous launch on direct user gesture with exact formatted amount.
 * 3. Exact merchant UPI ID and payee name preserved from existing configuration.
 * 4. Desktop: instant QR / copy UPI ID fallback.
 */

/**
 * Opens PhonePe application without ANY payment parameters or UPI queries.
 * Pure app launch only — no merchant, no amount, no recipient, no prefilled screen.
 * 
 * Android: Official Chrome Intent syntax targeting com.phonepe.app package
 * iOS: Registered PhonePe URL scheme phonepe:// (no intent:// on iOS)
 * Desktop: Returns false so UI can show desktop QR
 */
export function openPhonePeAppOnly() {
  const platform = detectPlatform()

  if (platform === 'desktop' || typeof window === 'undefined') {
    return { platform, success: false, url: null }
  }

  // Pure app launch - strictly NO pa, pn, am, cu, tn, tr or upi query
  const targetUrl = platform === 'android'
    ? 'intent://#Intent;package=com.phonepe.app;end'
    : 'phonepe://'

  if (import.meta.env.DEV) {
    console.group('[X Buddy PhonePe App Launcher] Pure App Launch (No Payment Data)')
    console.log('Platform:', platform)
    console.log('Target URL:', targetUrl)
    console.groupEnd()
  }

  // Synchronous direct top-level navigation from user tap gesture
  window.location.href = targetUrl

  return {
    platform,
    success: true,
    url: targetUrl,
  }
}

/**
 * Platform detection for Android, iOS/iPadOS, and Desktop.
 */
export function detectPlatform() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop'
  }

  const ua = navigator.userAgent || ''

  // iOS detection (iPhone, iPod, and iPad including iPadOS where platform is MacIntel with multi-touch)
  const isIOS = /iPad|iPhone|iPod/.test(ua) || 
    (navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'

  // Android detection
  const isAndroid = /Android/i.test(ua)
  if (isAndroid) return 'android'

  return 'desktop'
}

/**
 * Builds standard UPI query string using existing XBuddy payment data.
 * The amount is strictly formatted to 2 decimal places (e.g., "15.00").
 * Query parameters are individually encoded via encodeURIComponent to avoid illegal characters or plus-signs for spaces.
 */
export function buildUpiQuery({ upiId, payeeName, amount, note, refId }) {
  const formattedAmount = Number(amount || 0).toFixed(2)
  const parts = [
    `pa=${encodeURIComponent(upiId || '')}`,
    `pn=${encodeURIComponent(payeeName || '')}`,
    `am=${encodeURIComponent(formattedAmount)}`,
    `cu=INR`,
  ]

  if (note) {
    parts.push(`tn=${encodeURIComponent(note)}`)
  }

  if (refId) {
    parts.push(`tr=${encodeURIComponent(String(refId))}`)
  }

  return parts.join('&')
}

/**
 * Returns the primary launch URL and generic UPI fallback URL for a given app and platform.
 */
export function getUpiUrls({ appId, platform, upiQuery }) {
  const genericUpiUri = `upi://pay?${upiQuery}`

  if (platform === 'android') {
    switch (appId) {
      case 'phonepe':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=com.phonepe.app;end`,
          genericFallback: genericUpiUri,
        }
      case 'gpay':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`,
          genericFallback: genericUpiUri,
        }
      case 'paytm':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=net.one97.paytm;end`,
          genericFallback: genericUpiUri,
        }
      case 'bhim':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=in.org.npci.upiapp;end`,
          genericFallback: genericUpiUri,
        }
      case 'any':
      default:
        return {
          primary: genericUpiUri,
          genericFallback: genericUpiUri,
        }
    }
  }

  if (platform === 'ios') {
    switch (appId) {
      case 'phonepe':
        return {
          primary: `phonepe://pay?${upiQuery}`,
          genericFallback: genericUpiUri,
        }
      case 'gpay':
        return {
          primary: `gpay://upi/pay?${upiQuery}`,
          genericFallback: genericUpiUri,
        }
      case 'paytm':
        return {
          primary: `paytmmp://pay?${upiQuery}`,
          genericFallback: genericUpiUri,
        }
      case 'bhim':
        return {
          primary: `bhim://pay?${upiQuery}`,
          genericFallback: genericUpiUri,
        }
      case 'any':
      default:
        return {
          primary: genericUpiUri,
          genericFallback: genericUpiUri,
        }
    }
  }

  // Desktop
  return {
    primary: genericUpiUri,
    genericFallback: genericUpiUri,
  }
}

/**
 * Validates generated UPI intent URL for development diagnostics.
 * Verifies all requirements: pa, pn, am (2 decimals), cu=INR, tr, no double-encoding, no illegal spaces, no null/undefined.
 */
function validateUpiUrlDev(url, appId) {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return

  try {
    const hasPa = /pa=[^&]+/.test(url)
    const hasPn = /pn=[^&]+/.test(url)
    const hasAm = /am=\d+\.\d{2}/.test(url)
    const hasCu = url.includes('cu=INR')
    const hasTr = /tr=[^&#]+/.test(url)
    const hasSpaces = /\s/.test(url)
    const hasNullOrUndefined = /undefined|null/i.test(url)
    const hasDoubleEncoding = /%25[0-9a-fA-F]{2}/.test(url)

    console.group(`[X Buddy UPI Dev Diagnostic] ${appId.toUpperCase()}`)
    console.log('Final Launch Intent / URL:', url)
    console.log('Validation Checks:', {
      'pa exists': hasPa ? '✓ PASS' : '✗ FAIL',
      'pn exists': hasPn ? '✓ PASS' : '✗ FAIL',
      'am is 2-decimal format': hasAm ? '✓ PASS' : '✗ FAIL',
      'cu=INR exists': hasCu ? '✓ PASS' : '✗ FAIL',
      'tr/reference': hasTr ? '✓ PRESENT' : '(not provided / optional)',
      'no double encoding': !hasDoubleEncoding ? '✓ PASS' : '✗ FAIL (contains double %25 encoding)',
      'no spaces': !hasSpaces ? '✓ PASS' : '✗ FAIL (contains literal spaces)',
      'no null/undefined': !hasNullOrUndefined ? '✓ PASS' : '✗ FAIL (contains null or undefined)',
    })
    console.groupEnd()
  } catch (e) {
    console.warn('[X Buddy UPI Dev Diagnostic Error]', e)
  }
}

// Dev-only diagnostic helper attached to window in dev mode
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__XBUDDY_PHONEPE_DIAGNOSTIC__ = function () {
    const platform = detectPlatform()
    const targetUrl = platform === 'android'
      ? 'intent://#Intent;package=com.phonepe.app;end'
      : 'phonepe://'
    console.log('[X Buddy PhonePe Diagnostic] Pure App Launch Target URL:', targetUrl)
    return { platform, targetUrl }
  }

  window.__XBUDDY_UPI_DIAGNOSTIC__ = function (testAmount = 15) {
    const upiId = import.meta.env.VITE_UPI_ID || 'xbuddy@upi'
    const payeeName = import.meta.env.VITE_PAYEE_NAME || 'Xerox Buddy'
    const note = 'XBuddy Print Test'
    const refId = 'TEST_REF_123'
    const upiQuery = buildUpiQuery({ upiId, payeeName, amount: testAmount, note, refId })
    const urls = getUpiUrls({ appId: 'phonepe', platform: 'android', upiQuery })
    validateUpiUrlDev(urls.primary, 'phonepe')
    return {
      phonepeAndroidIntent: urls.primary,
      genericUpiUri: urls.genericFallback,
    }
  }
}

/**
 * Synchronously executes the UPI app launch on direct user gesture.
 * 
 * @param {Object} options
 * @param {string} options.appId - 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'any'
 * @param {string} options.upiId - Merchant UPI ID
 * @param {string} options.payeeName - Merchant Name
 * @param {number|string} options.amount - Exact total amount
 * @param {string} options.note - Payment description / note
 * @param {string} [options.refId] - Optional transaction reference
 * @returns {{ platform: string, primaryUrl: string, genericFallbackUrl: string }}
 */
export function directLaunchUPI({
  appId,
  upiId,
  payeeName,
  amount,
  note,
  refId,
}) {
  const platform = detectPlatform()
  const upiQuery = buildUpiQuery({ upiId, payeeName, amount, note, refId })
  const { primary, genericFallback } = getUpiUrls({ appId, platform, upiQuery })

  // Dev diagnostic logging
  validateUpiUrlDev(primary, appId)

  if (platform !== 'desktop' && typeof window !== 'undefined') {
    // Synchronous direct top-level navigation from user tap
    window.location.href = primary
  }

  return {
    platform,
    primaryUrl: primary,
    genericFallbackUrl: genericFallback,
  }
}
