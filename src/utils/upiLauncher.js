/**
 * upiLauncher.js
 * 
 * Production-ready UPI deep-link / intent launcher for X Buddy.
 * Supports Android (app-specific intents + generic UPI intent fallback),
 * iOS (app-specific URL schemes + generic upi:// fallback),
 * and Desktop (graceful QR/copy fallback).
 */

/**
 * Robust platform detection for Android, iOS/iPadOS, and Desktop.
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
 * All parameters are safely encoded.
 */
export function buildUpiQuery({ upiId, payeeName, amount, note, refId }) {
  const params = new URLSearchParams()
  if (upiId) params.set('pa', upiId)
  if (payeeName) params.set('pn', payeeName)
  if (amount != null) params.set('am', String(amount))
  params.set('cu', 'INR')
  if (note) params.set('tn', note)
  if (refId) params.set('tr', String(refId))
  return params.toString()
}

/**
 * Generates URLs for a specific app on the target platform.
 */
export function getAppUrls(appId, platform, upiQuery) {
  if (platform === 'android') {
    switch (appId) {
      case 'phonepe':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=com.phonepe.app;end`,
          fallback: `phonepe://pay?${upiQuery}`,
          generic: `intent://pay?${upiQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;end`,
        }
      case 'gpay':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`,
          fallback: `tez://upi/pay?${upiQuery}`,
          generic: `intent://pay?${upiQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;end`,
        }
      case 'paytm':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=net.one97.paytm;end`,
          fallback: `paytmmp://pay?${upiQuery}`,
          generic: `intent://pay?${upiQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;end`,
        }
      case 'bhim':
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;package=in.org.npci.upiapp;end`,
          fallback: `bhim://pay?${upiQuery}`,
          generic: `intent://pay?${upiQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;end`,
        }
      case 'any':
      default:
        return {
          primary: `intent://pay?${upiQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;end`,
          fallback: `upi://pay?${upiQuery}`,
          generic: `upi://pay?${upiQuery}`,
        }
    }
  }

  if (platform === 'ios') {
    switch (appId) {
      case 'phonepe':
        return {
          primary: `phonepe://pay?${upiQuery}`,
          fallback: `upi://pay?${upiQuery}`,
        }
      case 'gpay':
        return {
          primary: `gpay://upi/pay?${upiQuery}`,
          fallback: `tez://upi/pay?${upiQuery}`,
          secondaryFallback: `upi://pay?${upiQuery}`,
        }
      case 'paytm':
        return {
          primary: `paytmmp://pay?${upiQuery}`,
          fallback: `upi://pay?${upiQuery}`,
        }
      case 'bhim':
        return {
          primary: `bhim://pay?${upiQuery}`,
          fallback: `upi://pay?${upiQuery}`,
        }
      case 'any':
      default:
        return {
          primary: `upi://pay?${upiQuery}`,
          fallback: null,
        }
    }
  }

  // Desktop
  return {
    primary: `upi://pay?${upiQuery}`,
    fallback: null,
  }
}

/**
 * Dispatches a URL via anchor click.
 */
function dispatchUrl(url) {
  if (typeof document === 'undefined') return
  try {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      if (a.parentNode) {
        a.parentNode.removeChild(a)
      }
    }, 150)
  } catch {
    window.location.href = url
  }
}

// Track active launch to prevent double-clicking
let activeLaunch = false

/**
 * Attempts to launch a UPI app with graceful fallbacks.
 * 
 * @param {Object} options
 * @param {string} options.appId - 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'any'
 * @param {string} options.upiId - Merchant UPI ID
 * @param {string} options.payeeName - Merchant Name
 * @param {number|string} options.amount - Exact total amount
 * @param {string} options.note - Payment description / note
 * @param {string} [options.refId] - Optional transaction reference
 * @param {Function} options.onLaunching - Called when launch starts
 * @param {Function} options.onAppOpened - Called when browser detects app was opened
 * @param {Function} options.onFailure - Called if app could not be opened
 */
export function launchUPIPayment({
  appId,
  upiId,
  payeeName,
  amount,
  note,
  refId,
  onLaunching,
  onAppOpened,
  onFailure,
}) {
  if (activeLaunch) return
  activeLaunch = true

  const platform = detectPlatform()

  if (platform === 'desktop') {
    activeLaunch = false
    onFailure?.('desktop')
    return
  }

  onLaunching?.()

  const query = buildUpiQuery({ upiId, payeeName, amount, note, refId })
  const urls = getAppUrls(appId, platform, query)

  let appOpened = false
  let fallbackAttempted = false
  let genericAttempted = false
  let cleanupDone = false

  const cleanupListeners = () => {
    if (cleanupDone) return
    cleanupDone = true
    activeLaunch = false
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('blur', handleBlur)
  }

  function markOpened() {
    if (appOpened) return
    appOpened = true
    cleanupListeners()
    onAppOpened?.()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      markOpened()
    }
  }

  function handlePageHide() {
    markOpened()
  }

  function handleBlur() {
    markOpened()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('blur', handleBlur)

  // 1. Dispatch primary URL
  dispatchUrl(urls.primary)

  // 2. Check if app launched; if not, attempt fallback
  setTimeout(() => {
    if (appOpened) return

    // If still in foreground after 1.5s, primary launch likely didn't open the app
    if (!fallbackAttempted && urls.fallback) {
      fallbackAttempted = true
      dispatchUrl(urls.fallback)

      // Check again after 1.2s
      setTimeout(() => {
        if (appOpened) return

        if (!genericAttempted && urls.generic) {
          genericAttempted = true
          dispatchUrl(urls.generic)

          setTimeout(() => {
            if (appOpened) return
            cleanupListeners()
            onFailure?.('Couldn’t open the app. You can pay using UPI QR instead.')
          }, 1200)
        } else if (urls.secondaryFallback) {
          dispatchUrl(urls.secondaryFallback)
          setTimeout(() => {
            if (appOpened) return
            cleanupListeners()
            onFailure?.('Couldn’t open the app. You can pay using UPI QR instead.')
          }, 1200)
        } else {
          cleanupListeners()
          onFailure?.('Couldn’t open the app. You can pay using UPI QR instead.')
        }
      }, 1200)
    } else if (urls.generic && !genericAttempted) {
      genericAttempted = true
      dispatchUrl(urls.generic)

      setTimeout(() => {
        if (appOpened) return
        cleanupListeners()
        onFailure?.('Couldn’t open the app. You can pay using UPI QR instead.')
      }, 1200)
    } else {
      cleanupListeners()
      onFailure?.('Couldn’t open the app. You can pay using UPI QR instead.')
    }
  }, 1500)
}
