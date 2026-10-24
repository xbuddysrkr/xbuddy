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
 * Registry of official UPI applications supported for direct app-launch (OPEN ONLY).
 * Strictly contains package names and store listings with ZERO payment parameters.
 */
export const SUPPORTED_OPEN_ONLY_APPS = [
  {
    id: 'phonepe',
    name: 'PhonePe',
    packageName: 'com.phonepe.app',
    iosScheme: 'phonepe://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.phonepe.app',
    logoUrl: '/assets/upi/phonepe.png',
    brandColor: '#5f259f',
    textColor: '#5f259f',
    borderColor: 'border-purple-200',
    bgGradient: 'from-purple-50 to-white',
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    packageName: 'com.google.android.apps.nbu.paisa.user',
    iosScheme: 'gpay://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user',
    logoUrl: '/assets/upi/google-pay.png',
    brandColor: '#1a73e8',
    textColor: '#1a73e8',
    borderColor: 'border-blue-200',
    bgGradient: 'from-blue-50 to-white',
  },
  {
    id: 'paytm',
    name: 'Paytm',
    packageName: 'net.one97.paytm',
    iosScheme: 'paytmmp://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=net.one97.paytm',
    logoUrl: '/assets/upi/paytm.png',
    brandColor: '#002970',
    textColor: '#00b9f5',
    borderColor: 'border-sky-200',
    bgGradient: 'from-sky-50 to-white',
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    packageName: 'in.org.npci.upiapp',
    iosScheme: 'bhim://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=in.org.npci.upiapp',
    logoUrl: '/assets/upi/bhim.png',
    brandColor: '#007849',
    textColor: '#007849',
    borderColor: 'border-emerald-200',
    bgGradient: 'from-emerald-50 to-white',
  },
]

/**
 * Additional packages recognized for launch if requested directly, but not
 * rendered in the primary UI without verified official logo assets.
 */
export const ADDITIONAL_UPI_PACKAGES = {
  cred: {
    id: 'cred',
    name: 'CRED',
    packageName: 'com.dreamplug.androidapp',
    iosScheme: 'cred://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dreamplug.androidapp',
  },
  amazon: {
    id: 'amazon',
    name: 'Amazon Pay',
    packageName: 'in.amazon.mShop.android.shopping',
    iosScheme: 'amazon://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=in.amazon.mShop.android.shopping',
  },
}

/**
 * Returns the exact URL to launch a selected app with ZERO payment data.
 * Strictly no pa, pn, am, cu, tn, tr or upi query parameters.
 * Android: intent://#Intent;package=<packageName>;end
 * iOS: <scheme>://
 * Desktop: null
 */
export function getAppOnlyLaunchUrl(appOrId) {
  const app = typeof appOrId === 'string'
    ? SUPPORTED_OPEN_ONLY_APPS.find((a) => a.id === appOrId) || ADDITIONAL_UPI_PACKAGES[appOrId]
    : appOrId

  if (!app) return null

  const platform = detectPlatform()
  if (platform === 'android') {
    return `intent://#Intent;package=${app.packageName};end`
  }
  if (platform === 'ios') {
    return app.iosScheme
  }
  return null
}

/**
 * Opens selected application without ANY payment parameters or UPI queries.
 * Pure app launch only — student scans their saved QR manually inside the app.
 */
export function launchAppOnly(appOrId) {
  const app = typeof appOrId === 'string'
    ? SUPPORTED_OPEN_ONLY_APPS.find((a) => a.id === appOrId) || ADDITIONAL_UPI_PACKAGES[appOrId]
    : appOrId

  if (!app) {
    return { platform: 'unknown', success: false, url: null, playStoreUrl: null }
  }

  const platform = detectPlatform()
  const targetUrl = getAppOnlyLaunchUrl(app)

  if (platform === 'desktop' || typeof window === 'undefined' || !targetUrl) {
    return {
      platform,
      success: false,
      url: targetUrl,
      playStoreUrl: app.playStoreUrl,
      app,
    }
  }

  try {
    window.location.href = targetUrl
  } catch (err) {
    console.warn(`[X Buddy App Launcher] Could not open ${app.name}:`, err)
  }

  return {
    platform,
    success: true,
    url: targetUrl,
    playStoreUrl: app.playStoreUrl,
    app,
  }
}

/**
 * Returns the exact URL to launch PhonePe app with ZERO payment data.
 * Backwards compatibility helper.
 */
export function getPhonePeLaunchUrl() {
  return getAppOnlyLaunchUrl('phonepe')
}

/**
 * Opens PhonePe application without ANY payment parameters or UPI queries.
 * Backwards compatibility helper.
 */
export function openPhonePeAppOnly() {
  return launchAppOnly('phonepe')
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
      'pa exists': hasPa ? 'PASS' : 'FAIL',
      'pn exists': hasPn ? 'PASS' : 'FAIL',
      'am is 2-decimal format': hasAm ? 'PASS' : 'FAIL',
      'cu=INR exists': hasCu ? 'PASS' : 'FAIL',
      'tr/reference': hasTr ? 'PRESENT' : '(not provided / optional)',
      'no double encoding': !hasDoubleEncoding ? 'PASS' : 'FAIL (contains double %25 encoding)',
      'no spaces': !hasSpaces ? 'PASS' : 'FAIL (contains literal spaces)',
      'no null/undefined': !hasNullOrUndefined ? 'PASS' : 'FAIL (contains null or undefined)',
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
    const upiId = import.meta.env.VITE_UPI_ID || '9100280705@ybl'
    const payeeName = import.meta.env.VITE_PAYEE_NAME || 'THANALA VS NSP SAILOKESH'
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
