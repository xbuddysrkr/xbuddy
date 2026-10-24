import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SUPPORTED_OPEN_ONLY_APPS,
  getAppOnlyLaunchUrl,
  launchAppOnly,
  detectPlatform,
} from '../src/utils/upiLauncher.js'
import {
  UPI_APP_REGISTRY,
  POPULAR_UPI_APPS,
  TPAP_UPI_APPS,
  BANK_UPI_APPS,
  searchUpiApps,
  getUpiAppById,
} from '../src/utils/upiRegistry.js'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING COMPREHENSIVE INDIAN UPI APP REGISTRY & LAUNCHER TEST SUITE ---')

// =========================================================================
// TEST 1: Registry Completeness & Structure (18 Verified Apps)
// =========================================================================
console.log('\n[TEST 1] Verifying UPI_APP_REGISTRY completeness and data schema...')

assert.ok(Array.isArray(UPI_APP_REGISTRY), 'UPI_APP_REGISTRY must be an array')
assert.equal(UPI_APP_REGISTRY.length, 18, 'Must contain exactly 18 verified Indian UPI applications')

// Verify no duplicates
const idSet = new Set()
const pkgSet = new Set()

for (const app of UPI_APP_REGISTRY) {
  // Required string attributes
  assert.ok(app.id && app.id.trim(), `App must have valid non-empty id`)
  assert.ok(app.name && app.name.trim(), `App ${app.id} must have non-empty name`)
  assert.ok(app.packageName && app.packageName.trim(), `App ${app.id} must have valid Android packageName`)
  assert.ok(app.iosScheme && app.iosScheme.endsWith('://'), `App ${app.id} must have valid iOS scheme ending with '://'`)
  assert.ok(app.logoUrl && app.logoUrl.startsWith('/assets/upi/'), `App ${app.id} logoUrl must point to /assets/upi/`)
  assert.ok(app.website && app.website.startsWith('http'), `App ${app.id} must have valid official website`)
  assert.ok(app.playStoreUrl && app.playStoreUrl.includes('play.google.com/store/apps/details?id='), `App ${app.id} must have valid Google Play Store URL`)
  assert.ok(app.providerType, `App ${app.id} must define providerType (e.g. TPAP or Bank)`)
  assert.ok(Array.isArray(app.pspPartners) && app.pspPartners.length > 0, `App ${app.id} must define PSP sponsor banks or switch`)
  assert.ok(app.verificationDate === '2026-10-24', `App ${app.id} must have audit date 2026-10-24`)

  // Duplicate checks
  assert.ok(!idSet.has(app.id), `Duplicate app ID found in registry: '${app.id}'`)
  idSet.add(app.id)

  assert.ok(!pkgSet.has(app.packageName), `Duplicate Android packageName found in registry: '${app.packageName}'`)
  pkgSet.add(app.packageName)
}

console.log(`✓ TEST 1 PASSED: 18 unique, verified applications present with zero duplicate IDs or package names`)

// =========================================================================
// TEST 2: Local Physical Asset Presence and Validity
// =========================================================================
console.log('\n[TEST 2] Verifying that all 18 authentic logo files exist on disk...')

for (const app of UPI_APP_REGISTRY) {
  const filename = path.basename(app.logoUrl)
  const physicalPath = path.resolve(__dirname, `../public/assets/upi/${filename}`)
  
  assert.ok(fs.existsSync(physicalPath), `Physical logo file missing for ${app.name}: ${physicalPath}`)
  const stat = fs.statSync(physicalPath)
  assert.ok(stat.size > 500, `Logo file for ${app.name} (${filename}) is too small or corrupt: ${stat.size} bytes`)
}

console.log(`✓ TEST 2 PASSED: All 18 authentic logo assets exist locally with verified non-empty binary sizes`)

// =========================================================================
// TEST 3: Registry Filtering & Search Logic
// =========================================================================
console.log('\n[TEST 3] Testing search and categorization helpers...')

// Category counts
assert.equal(POPULAR_UPI_APPS.length, 6, 'Should have 6 popular apps')
assert.equal(TPAP_UPI_APPS.length, 12, 'Should have 12 TPAP apps')
assert.equal(BANK_UPI_APPS.length, 6, 'Should have 6 bank apps')

// Search by app name
const sbiSearch = searchUpiApps('SBI')
assert.ok(sbiSearch.some((a) => a.id === 'yono_sbi'), 'Searching "SBI" should find YONO SBI')

// Search by fintech entity
const flipkartSearch = searchUpiApps('Flipkart')
assert.ok(flipkartSearch.some((a) => a.id === 'supermoney'), 'Searching "Flipkart" should find super.money')

// Search with category filter
const bankOnly = searchUpiApps('', 'bank')
assert.equal(bankOnly.length, 6, 'Category "bank" must return 6 apps')
assert.ok(bankOnly.every((a) => a.category === 'bank'), 'All returned apps must be bank category')

// Empty query returns all for category
const allApps = searchUpiApps('', 'all')
assert.equal(allApps.length, 18, 'Empty query with "all" returns all 18 apps')

console.log('✓ TEST 3 PASSED: Category filtering and search query helpers operate accurately')

// =========================================================================
// TEST 4: App Launch URL (OPEN ONLY - ZERO PAYMENT PARAMS)
// =========================================================================
console.log('\n[TEST 4] Verifying pure app launch URLs contain ZERO payment data across all 18 apps...')

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

  for (const app of UPI_APP_REGISTRY) {
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

  for (const app of UPI_APP_REGISTRY) {
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
  for (const app of UPI_APP_REGISTRY) {
    const url = getAppOnlyLaunchUrl(app.id)
    assert.equal(url, null, `Desktop launch URL for ${app.id} must be null`)
  }

} finally {
  delete globalThis.window
  if (originalNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc)
  }
}

console.log('✓ TEST 4 PASSED: All 18 launch URLs strictly preserve the OPEN-ONLY requirement with zero payment parameters')

// =========================================================================
// TEST 5: launchAppOnly Function Execution and Safe Fallbacks
// =========================================================================
console.log('\n[TEST 5] Testing launchAppOnly behavior and fallbacks...')

// Desktop behavior: does not redirect, returns safe desktop fallback object with Play Store link
const desktopResult = launchAppOnly('yono_sbi')
assert.equal(desktopResult.platform, 'desktop', 'Desktop platform returned')
assert.equal(desktopResult.success, false, 'Desktop cannot open mobile app directly')
assert.ok(desktopResult.playStoreUrl.includes('com.sbi.lotusintouch'), 'Provides official Play Store fallback link for YONO SBI')

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

  const supermoneyResult = launchAppOnly('supermoney')
  assert.equal(supermoneyResult.platform, 'android')
  assert.equal(supermoneyResult.success, true)
  assert.equal(assignedLocation, 'intent://#Intent;package=money.super.payments;end')

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

console.log('✓ TEST 5 PASSED: launchAppOnly executes clean package launch and handles missing apps/desktop safely')

// =========================================================================
// TEST 6: English & Telugu Localization Parity for App Selector & Search
// =========================================================================
console.log('\n[TEST 6] Verifying i18n keys for UPI App Selector, Search & Categories...')

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
  'appLogoAlt',
  'searchApps',
  'allApps',
  'popularApps',
  'upiAppsCategory',
  'bankAppsCategory',
  'moreApps',
  'lessApps',
  'noAppsFound',
  'clearSearch',
  'verifiedBadge',
  'backToApps',
]

for (const key of requiredPaymentKeys) {
  assert.ok(en.payment[key], `English translation must have payment.${key}`)
  assert.ok(te.payment[key], `Telugu translation must have payment.${key}`)
  assert.ok(typeof en.payment[key] === 'string' && en.payment[key].length > 0, `English payment.${key} must not be empty`)
  assert.ok(typeof te.payment[key] === 'string' && te.payment[key].length > 0, `Telugu payment.${key} must not be empty`)
}

console.log('✓ TEST 6 PASSED: All 25 app selector, search, category, and step keys verified in both English and Telugu')

// =========================================================================
// TEST 7: Real Android vs Mocked Test Distinction Note
// =========================================================================
console.log('\n[TEST 7] Verifying test environment distinctions...')
console.log('ℹ Note: The unit tests above run in Node.js with mocked navigator and window objects.')
console.log('ℹ Real device verification requires Android Chrome on a mobile device where intent:// URIs trigger Android Package Manager directly.')

console.log('\n========================================================================')
console.log('🎉 ALL 7 COMPREHENSIVE UPI APP REGISTRY & LAUNCHER TESTS PASSED!')
console.log('========================================================================\n')
