import assert from 'node:assert/strict'
import {
  SUPPORTED_OPEN_ONLY_APPS,
  getAppOnlyLaunchUrl,
  launchAppOnly,
  detectPlatform,
} from '../src/utils/upiLauncher.js'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

console.log('--- STARTING UPI APP LAUNCHER (OPEN ONLY) TEST SUITE ---')

// =========================================================================
// TEST 1: Registry of Supported Open-Only Apps
// =========================================================================
console.log('\n[TEST 1] Verifying SUPPORTED_OPEN_ONLY_APPS registry...')

assert.ok(Array.isArray(SUPPORTED_OPEN_ONLY_APPS), 'SUPPORTED_OPEN_ONLY_APPS must be an array')
assert.ok(SUPPORTED_OPEN_ONLY_APPS.length >= 4, 'Should support at least 4 major UPI apps')

const expectedApps = [
  { id: 'phonepe', pkg: 'com.phonepe.app', scheme: 'phonepe://' },
  { id: 'gpay', pkg: 'com.google.android.apps.nbu.paisa.user', scheme: 'gpay://' },
  { id: 'paytm', pkg: 'net.one97.paytm', scheme: 'paytmmp://' },
  { id: 'bhim', pkg: 'in.org.npci.upiapp', scheme: 'bhim://' },
  { id: 'cred', pkg: 'com.dreamplug.androidapp', scheme: 'cred://' },
  { id: 'amazon', pkg: 'in.amazon.mShop.android.shopping', scheme: 'amazon://' },
]

for (const expected of expectedApps) {
  const app = SUPPORTED_OPEN_ONLY_APPS.find((a) => a.id === expected.id)
  assert.ok(app, `Registry must include app with id '${expected.id}'`)
  assert.equal(app.packageName, expected.pkg, `Package name for ${expected.id} must be ${expected.pkg}`)
  assert.equal(app.iosScheme, expected.scheme, `iOS scheme for ${expected.id} must be ${expected.scheme}`)
  assert.ok(app.playStoreUrl.startsWith('https://play.google.com/store/apps/details?id='), `${expected.id} must have valid Google Play Store URL`)
  assert.ok(app.name && app.name.trim().length > 0, `${expected.id} must have a display name`)
}

console.log('✓ TEST 1 PASSED: App registry contains verified package names, iOS schemes, and official Play Store URLs')

// =========================================================================
// TEST 2: App Launch URL (OPEN ONLY - ZERO PAYMENT PARAMS)
// =========================================================================
console.log('\n[TEST 2] Verifying pure app launch URLs contain ZERO payment data...')

const FORBIDDEN_PAYMENT_PATTERNS = [
  'pa=',
  'pn=',
  'am=',
  'cu=',
  'tn=',
  'tr=',
  'mc=',
  'upi://pay',
  'scheme=upi',
]

const originalWindow = globalThis.window
const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

try {
  // Simulate Android environment
  globalThis.window = {}
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' },
    configurable: true,
    writable: true,
  })

  assert.equal(detectPlatform(), 'android', 'Simulated Android UA must detect as android')

  for (const app of SUPPORTED_OPEN_ONLY_APPS) {
    const url = getAppOnlyLaunchUrl(app.id)
    assert.ok(url, `getAppOnlyLaunchUrl must return URL for ${app.id} on Android`)
    
    // Must strictly match Android Chrome Intent syntax for package opening
    const expectedIntent = `intent://#Intent;package=${app.packageName};end`
    assert.equal(url, expectedIntent, `Android intent for ${app.id} must be exact package intent`)

    // Strict validation: ZERO payment parameters
    for (const forbidden of FORBIDDEN_PAYMENT_PATTERNS) {
      assert.ok(
        !url.includes(forbidden),
        `SECURITY VIOLATION: URL for ${app.id} must NEVER contain '${forbidden}'! Found: ${url}`
      )
    }
  }

  // Simulate iOS environment
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    configurable: true,
    writable: true,
  })

  assert.equal(detectPlatform(), 'ios', 'Simulated iOS UA must detect as ios')

  for (const app of SUPPORTED_OPEN_ONLY_APPS) {
    const url = getAppOnlyLaunchUrl(app)
    assert.equal(url, app.iosScheme, `iOS URL for ${app.id} must be simple scheme`)
    for (const forbidden of FORBIDDEN_PAYMENT_PATTERNS) {
      assert.ok(
        !url.includes(forbidden),
        `SECURITY VIOLATION: iOS URL for ${app.id} must NEVER contain '${forbidden}'! Found: ${url}`
      )
    }
  }

  // Simulate Desktop environment
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0' },
    configurable: true,
    writable: true,
  })

  assert.equal(detectPlatform(), 'desktop', 'Desktop UA must detect as desktop')
  for (const app of SUPPORTED_OPEN_ONLY_APPS) {
    const url = getAppOnlyLaunchUrl(app.id)
    assert.equal(url, null, `Desktop launch URL for ${app.id} must be null`)
  }

} finally {
  delete globalThis.window
  if (originalNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc)
  }
}

console.log('✓ TEST 2 PASSED: Pure app launch URLs contain ZERO payment params and strictly match Android/iOS specifications')

// =========================================================================
// TEST 3: launchAppOnly Function Execution and Safe Fallbacks
// =========================================================================
console.log('\n[TEST 3] Testing launchAppOnly behavior and fallbacks...')

// Desktop behavior: does not redirect, returns safe desktop fallback object
const desktopResult = launchAppOnly('phonepe')
assert.equal(desktopResult.platform, 'desktop', 'Desktop platform returned')
assert.equal(desktopResult.success, false, 'Desktop cannot open mobile app directly')
assert.ok(desktopResult.playStoreUrl.includes('com.phonepe.app'), 'Provides official Play Store fallback link')

// Android simulation
let assignedLocation = null
try {
  globalThis.window = {
    location: {
      get href() {
        return assignedLocation
      },
      set href(val) {
        assignedLocation = val
      },
    },
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' },
    configurable: true,
    writable: true,
  })

  const gpayResult = launchAppOnly('gpay')
  assert.equal(gpayResult.platform, 'android')
  assert.equal(gpayResult.success, true)
  assert.equal(assignedLocation, 'intent://#Intent;package=com.google.android.apps.nbu.paisa.user;end')

  // Unknown app handling
  const unknownResult = launchAppOnly('non_existent_app_xyz')
  assert.equal(unknownResult.success, false)
  assert.equal(unknownResult.url, null)

} finally {
  delete globalThis.window
  if (originalNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc)
  }
}

console.log('✓ TEST 3 PASSED: launchAppOnly triggers clean package launch and handles missing apps or desktop safely')

// =========================================================================
// TEST 4: English & Telugu Localization Parity for App Selector
// =========================================================================
console.log('\n[TEST 4] Verifying i18n keys for UPI App Selector...')

const requiredPaymentKeys = [
  'chooseUpiApp',
  'chooseUpiAppSubtitle',
  'continueInUpiApp',
  'couldNotOpenAppManual',
  'viewOnPlayStore',
  'openInUpiApp',
  'tapQrToChooseApp',
  'tryOpeningAgain',
  'chooseAnotherApp',
  'stepGuideTitle',
  'guideStep1',
  'guideStep2',
  'guideStep3',
]

for (const key of requiredPaymentKeys) {
  assert.ok(en.payment[key], `English translation must have payment.${key}`)
  assert.ok(te.payment[key], `Telugu translation must have payment.${key}`)
  assert.ok(typeof en.payment[key] === 'string' && en.payment[key].length > 0, `English payment.${key} must not be empty`)
  assert.ok(typeof te.payment[key] === 'string' && te.payment[key].length > 0, `Telugu payment.${key} must not be empty`)
}

// Verify copy matches required specifications
assert.ok(en.payment.chooseUpiApp.includes('Choose your UPI app'), 'Title must be Choose your UPI app')
assert.ok(en.payment.chooseUpiAppSubtitle.includes('Your QR is ready'), 'Subtitle must guide user with downloaded QR')
assert.ok(en.payment.continueInUpiApp.includes('Continue in your UPI app'), 'Post-launch copy must instruct student')
assert.ok(en.payment.couldNotOpenAppManual.includes("Couldn't open this app?"), 'Fallback must show friendly manual instruction')

console.log('✓ TEST 4 PASSED: English and Telugu translations are 100% complete with correct copy')

// =========================================================================
// TEST 5: Real Android vs Mocked Test Distinction Note
// =========================================================================
console.log('\n[TEST 5] Verifying test environment distinctions...')
console.log('ℹ Note: The unit tests above run in Node.js with mocked navigator and window objects.')
console.log('ℹ Real device verification requires Android Chrome on a mobile device where intent:// URIs trigger Android Package Manager directly.')

console.log('\n======================================================')
console.log('🎉 ALL UPI APP LAUNCHER (OPEN ONLY) TESTS PASSED!')
console.log('======================================================\n')
