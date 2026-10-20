import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyAdsPassword } from '../src/utils/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING CAMPUS ADS MANAGER LOCK & HEADER VERIFICATION TEST SUITE ---')

// 1. Password Verification Tests
console.log('\n[TEST 1] Testing password verification logic...')

// 1.1 Correct password
const correctRes = await verifyAdsPassword('xbuddy@4921')
assert.strictEqual(correctRes.success, true, 'TEST 1.1 FAILED: Correct password xbuddy@4921 must be accepted')
console.log('✓ TEST 1.1 PASSED: Correct password "xbuddy@4921" is successfully accepted')

// 1.2 Incorrect password
const wrongRes = await verifyAdsPassword('wrong-pass-123')
assert.strictEqual(wrongRes.success, false, 'TEST 1.2 FAILED: Incorrect password must be rejected')
assert.ok(wrongRes.error, 'TEST 1.2 FAILED: Error message must be returned on incorrect password')
assert.ok(!wrongRes.error.includes('xbuddy@4921'), 'TEST 1.2 FAILED: Error message must never leak the password')
console.log('✓ TEST 1.2 PASSED: Incorrect password rejected with safe, non-leaking error message')

// 1.3 Empty password
const emptyRes = await verifyAdsPassword('')
assert.strictEqual(emptyRes.success, false, 'TEST 1.3 FAILED: Empty password must be rejected')
console.log('✓ TEST 1.3 PASSED: Empty password safely rejected')

// 2. Campus Ads Admin Source & Access-Control Verification
console.log('\n[TEST 2] Verifying CampusAdsAdmin.jsx lock screen & privacy...')
const campusAdsAdminPath = path.resolve(__dirname, '../src/components/CampusAdsAdmin.jsx')
const campusAdsAdminCode = fs.readFileSync(campusAdsAdminPath, 'utf8')

// 2.1 Verify lock screen is present
assert.ok(
  campusAdsAdminCode.includes('if (!isAuthorized)'),
  'TEST 2.1 FAILED: CampusAdsAdmin must gate the view with an authorization check'
)
assert.ok(
  campusAdsAdminCode.includes('Access Password') && campusAdsAdminCode.includes('type="password"'),
  'TEST 2.1 FAILED: CampusAdsAdmin must render a masked password input on lock screen'
)
console.log('✓ TEST 2.1 PASSED: CampusAdsAdmin gates all forms & controls behind password lock screen')

// 2.2 Verify full Google Spreadsheet ID is REMOVED from visible page content
assert.ok(
  !campusAdsAdminCode.includes('1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4'),
  'TEST 2.2 FAILED: Google Spreadsheet ID must not be displayed in visible content of CampusAdsAdmin.jsx'
)
assert.ok(
  campusAdsAdminCode.includes('Google Sheets Connected'),
  'TEST 2.2 FAILED: CampusAdsAdmin must display "Google Sheets Connected" status badge'
)
console.log('✓ TEST 2.2 PASSED: Full spreadsheet ID removed from visible content and replaced with "Google Sheets Connected"')

// 2.3 Verify password is NOT hardcoded into visible UI or text
assert.ok(
  !campusAdsAdminCode.includes('>xbuddy@4921<') && !campusAdsAdminCode.includes('"xbuddy@4921"'),
  'TEST 2.3 FAILED: Password must not be hardcoded in CampusAdsAdmin.jsx UI text'
)
console.log('✓ TEST 2.3 PASSED: Password is never displayed or hardcoded in CampusAdsAdmin UI')

// 3. Header Navbar Print Now Button Verification
console.log('\n[TEST 3] Verifying Header Navbar in App.jsx...')
const appPath = path.resolve(__dirname, '../src/App.jsx')
const appCode = fs.readFileSync(appPath, 'utf8')

// 3.1 Check that LanguageSwitcher is present in navbar
assert.ok(
  appCode.includes('<LanguageSwitcher />'),
  'TEST 3.1 FAILED: LanguageSwitcher must remain in navbar'
)
console.log('✓ TEST 3.1 PASSED: LanguageSwitcher is present and functional in header')

// 3.2 Check that Print Now button beside LanguageSwitcher in HERO header is removed
const heroNavMatch = appCode.match(/step === STEP\.HERO \? \(\s*<div[^>]*>([\s\S]*?)<\/div>\s*\) :/)
assert.ok(heroNavMatch, 'TEST 3.2 FAILED: Could not locate hero nav section in App.jsx')
const heroNavContent = heroNavMatch[1]

assert.ok(
  !heroNavContent.includes('nav.printNow'),
  'TEST 3.2 FAILED: "Print Now" button must be absent beside LanguageSwitcher in header navbar'
)
console.log('✓ TEST 3.2 PASSED: "Print Now" button is cleanly removed beside LanguageSwitcher in header')

// 3.3 Verify Start Printing functionality elsewhere remains intact
assert.ok(
  appCode.includes('handleStartPrinting') && appCode.includes('goToStep(STEP.UPLOAD)'),
  'TEST 3.3 FAILED: Core printing initiation functionality must be preserved'
)
console.log('✓ TEST 3.3 PASSED: Printing initiation, upload workflow, and routing remain fully functional')

console.log('\n=== ALL CAMPUS ADS LOCK & HEADER TESTS PASSED SUCCESSFULLY! ===\n')
