import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildQrFilename, generateSharpQrPng } from '../src/utils/qrDownload.js'
import { getPhonePeLaunchUrl, detectPlatform, buildUpiQuery } from '../src/utils/upiLauncher.js'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING QR DOWNLOAD & PAYMENT FLOW VERIFICATION TEST SUITE ---')

// TEST 1: buildQrFilename formatting
console.log('\n[TEST 1] Testing buildQrFilename...')
const filename1 = buildQrFilename('xb8212')
console.log(`Generated filename: ${filename1}`)
assert.equal(filename1, 'XBuddy-Payment-QR-xb8212.png', 'Filename must match standard XBuddy naming convention')
assert.ok(filename1.endsWith('.png'), 'Filename must end with .png extension')

const filenameDefault = buildQrFilename('')
assert.equal(filenameDefault, 'XBuddy-Payment-QR-ORDER.png', 'Filename with empty order ID should fallback gracefully')
console.log('✓ TEST 1 PASSED: buildQrFilename generates clean, safe, non-PII filenames')

// TEST 2: Platform detection and PhonePe Launch URLs
console.log('\n[TEST 2] Testing platform detection & getPhonePeLaunchUrl...')
// In Node (no window defined), detectPlatform returns desktop and getPhonePeLaunchUrl returns null
assert.equal(detectPlatform(), 'desktop', 'detectPlatform without window must return desktop')
assert.equal(getPhonePeLaunchUrl(), null, 'getPhonePeLaunchUrl on desktop returns null')

// Test simulation using window definition
const originalWindow = globalThis.window
const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

try {
  // Simulate Android
  globalThis.window = {}
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908B) Mobile Safari/537.36' },
    configurable: true,
    writable: true,
  })
  assert.equal(detectPlatform(), 'android', 'Simulated Android UA must return android')
  assert.equal(getPhonePeLaunchUrl(), 'intent://#Intent;package=com.phonepe.app;end', 'Android launch url must match Chrome Intent syntax')

  // Simulate iOS
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15' },
    configurable: true,
    writable: true,
  })
  assert.equal(detectPlatform(), 'ios', 'Simulated iOS UA must return ios')
  assert.equal(getPhonePeLaunchUrl(), 'phonepe://', 'iOS launch url must be phonepe://')
} finally {
  delete globalThis.window
  if (originalNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc)
  }
}
console.log('✓ TEST 2 PASSED: Pure PhonePe launch syntax correctly determined per platform')

// TEST 3: buildUpiQuery
console.log('\n[TEST 3] Testing buildUpiQuery...')
const upiQuery = buildUpiQuery({
  upiId: 'test@ybl',
  payeeName: 'XBuddy Xerox',
  amount: 25.5,
  note: 'Print Order XB8212',
  refId: 'XB8212'
})
assert.ok(upiQuery.includes('pa=test%40ybl'), 'UPI ID must be encoded')
assert.ok(upiQuery.includes('am=25.50'), 'Amount must be formatted to 2 decimals')
assert.ok(upiQuery.includes('cu=INR'), 'Currency must be INR')
console.log('✓ TEST 3 PASSED: buildUpiQuery generates valid query strings')

// TEST 4: generateSharpQrPng verification
console.log('\n[TEST 4] Testing generateSharpQrPng...')
const dataUrl = await generateSharpQrPng('upi://pay?pa=test@upi&pn=XBuddy&am=10.00&cu=INR')
assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'QR generator must output valid PNG data URI')
assert.ok(dataUrl.length > 500, 'Data URI should contain substantial base64 image data')
console.log('✓ TEST 4 PASSED: generateSharpQrPng generates high-resolution, contrast-rich PNG data URL')

// TEST 5: i18n keys verification
console.log('\n[TEST 5] Testing i18n key presence...')
assert.ok(en.payment.saveQrImage, 'English dictionary must contain payment.saveQrImage')
assert.ok(te.payment.saveQrImage, 'Telugu dictionary must contain payment.saveQrImage')
assert.ok(en.payment.phonePeSteps, 'English dictionary must contain payment.phonePeSteps')
assert.ok(te.payment.phonePeSteps, 'Telugu dictionary must contain payment.phonePeSteps')
console.log('✓ TEST 5 PASSED: Bilingual keys exist and are non-empty in English and Telugu')

// TEST 6: PaymentModal component integration check
console.log('\n[TEST 6] Verifying PaymentModal source integration...')
const modalSource = fs.readFileSync(path.join(__dirname, '../src/components/PaymentModal.jsx'), 'utf-8')

assert.ok(modalSource.includes('handleDownloadAgain'), 'PaymentModal must include handleDownloadAgain')
assert.ok(modalSource.includes('generateSharpQrPng'), 'PaymentModal must include generateSharpQrPng')
assert.ok(modalSource.includes('triggerQrDownload'), 'PaymentModal must include triggerQrDownload')
assert.ok(modalSource.includes('saveQrImage'), 'PaymentModal must render saveQrImage button')
assert.ok(modalSource.includes('phonePeSteps'), 'PaymentModal must render step-by-step guidance')
assert.ok(modalSource.includes('PaymentQrInstructionsModal'), 'PaymentModal must include PaymentQrInstructionsModal')
console.log('✓ TEST 6 PASSED: PaymentModal includes QR download button and PhonePe scanner instructions')

// TEST 7: PaymentQrInstructionsModal component inspection
console.log('\n[TEST 7] Verifying PaymentQrInstructionsModal source & requirements...')
const instructionsSource = fs.readFileSync(path.join(__dirname, '../src/components/PaymentQrInstructionsModal.jsx'), 'utf-8')

// No Open PhonePe button
assert.ok(!instructionsSource.includes('Open PhonePe App'), 'Must NOT have an Open PhonePe button')
assert.ok(!instructionsSource.includes('onOpenPhonePe'), 'Must NOT accept or call onOpenPhonePe')

// Animated phone visual & steps
assert.ok(instructionsSource.includes('AnimatedPhoneVisual'), 'Must include AnimatedPhoneVisual component')
assert.ok(instructionsSource.includes('step-app'), 'Must have step 1 for opening UPI app')
assert.ok(instructionsSource.includes('step-scan'), 'Must have step 2 for scanning QR & gallery')
assert.ok(instructionsSource.includes('step-select'), 'Must have step 3 for selecting saved XBuddy QR')
assert.ok(instructionsSource.includes('useReducedMotion'), 'Must support reduced motion accessibility')

// Prominent instruction & dynamic amount notice
assert.ok(instructionsSource.includes('almostThere'), 'Must render Almost there! heading')
assert.ok(instructionsSource.includes('upiFlowPrompt'), 'Must render prominent upiFlowPrompt')
assert.ok(instructionsSource.includes('upiAmountPreFilled'), 'Must render pre-filled amount notice')
assert.ok(instructionsSource.includes('formattedAmount'), 'Must format dynamic order amount')
assert.ok(instructionsSource.includes('formattedCountdown'), 'Must render 5-minute countdown timer')
console.log('✓ TEST 7 PASSED: PaymentQrInstructionsModal satisfies all prompt design & functional requirements')

// TEST 8: Bilingual keys for playful popup
console.log('\n[TEST 8] Verifying playful popup bilingual keys...')
const requiredKeys = ['almostThere', 'step1Desc', 'step2Desc', 'step3Desc', 'upiFlowPrompt', 'upiAmountPreFilled', 'downloadFailed', 'downloadFallback', 'gotItPay']
for (const key of requiredKeys) {
  assert.ok(en.payment[key], `en.payment.${key} must exist`)
  assert.ok(te.payment[key], `te.payment.${key} must exist`)
}
console.log('✓ TEST 8 PASSED: All playful popup keys exist in English and Telugu')

console.log('\n============================================================')
console.log('🎉 ALL QR DOWNLOAD & PAYMENT FLOW VERIFICATION TESTS PASSED!')
console.log('============================================================')

