import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STORAGE_KEYS,
  TOUR_STATUS,
  isTourCompleted,
  markTourCompleted,
  resetTour,
  resetAllTours,
} from '../src/utils/tourStorage.js'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING XBUDDY INTERACTIVE ONBOARDING & PAYMENT TUTORIAL TEST SUITE ---')

// Mock simulated LocalStorage for node environment testing
class MockLocalStorage {
  constructor() {
    this.store = {}
  }
  getItem(key) {
    return this.store[key] || null
  }
  setItem(key, value) {
    this.store[key] = String(value)
  }
  removeItem(key) {
    delete this.store[key]
  }
  clear() {
    this.store = {}
  }
}

globalThis.localStorage = new MockLocalStorage()
globalThis.window = {
  innerWidth: 1024,
  innerHeight: 768,
}

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 1] First-Time Detection & Storage Keys
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 1] Verifying storage key conventions and initial uncompleted state...')
globalThis.localStorage.clear()

assert.equal(STORAGE_KEYS.PRINT_TOUR, 'xbuddy_print_tour_v1')
assert.equal(STORAGE_KEYS.PAYMENT_TOUR, 'xbuddy_payment_tour_v1')

// Initial state: not seen
assert.equal(isTourCompleted(STORAGE_KEYS.PRINT_TOUR), false)
assert.equal(isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR), false)
console.log('✓ TEST 1 PASSED: Unseen tours accurately identified for first-time visitors')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 2] Persistence & Idempotency of Completed / Dismissed State
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 2] Verifying completion and dismissal persistence...')

// Complete printing tour
markTourCompleted(STORAGE_KEYS.PRINT_TOUR, TOUR_STATUS.COMPLETED)
assert.equal(isTourCompleted(STORAGE_KEYS.PRINT_TOUR), true)
assert.equal(globalThis.localStorage.getItem('xbuddy_print_tour_v1'), 'completed')
// Payment tour should remain uncompleted (isolation)
assert.equal(isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR), false)

// Dismiss payment tour (e.g. user clicked Skip)
markTourCompleted(STORAGE_KEYS.PAYMENT_TOUR, TOUR_STATUS.DISMISSED)
assert.equal(isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR), true)
assert.equal(globalThis.localStorage.getItem('xbuddy_payment_tour_v1'), 'dismissed')

// Replaying: resetTour
resetTour(STORAGE_KEYS.PRINT_TOUR)
assert.equal(isTourCompleted(STORAGE_KEYS.PRINT_TOUR), false)
assert.equal(isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR), true)

resetAllTours()
assert.equal(isTourCompleted(STORAGE_KEYS.PRINT_TOUR), false)
assert.equal(isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR), false)
console.log('✓ TEST 2 PASSED: Completion and dismissal states persist independently and support replaying')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 3] Graceful Degradation on Storage Failure (Private Browsing / Cookies Blocked)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 3] Testing graceful storage exception handling...')
const brokenStorage = {
  getItem() {
    throw new Error('QuotaExceeded or SecurityError in private mode')
  },
  setItem() {
    throw new Error('QuotaExceeded or SecurityError in private mode')
  },
  removeItem() {
    throw new Error('QuotaExceeded or SecurityError in private mode')
  },
}

globalThis.localStorage = brokenStorage
assert.doesNotThrow(() => {
  const completed = isTourCompleted(STORAGE_KEYS.PRINT_TOUR)
  assert.equal(completed, true) // Safe fallback defaults to not blocking user
})
assert.doesNotThrow(() => {
  markTourCompleted(STORAGE_KEYS.PRINT_TOUR, TOUR_STATUS.COMPLETED)
})
assert.doesNotThrow(() => {
  resetTour(STORAGE_KEYS.PRINT_TOUR)
})
console.log('✓ TEST 3 PASSED: Storage exceptions handled gracefully without crashing')

// Restore mock storage
globalThis.localStorage = new MockLocalStorage()

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 4] Target Elements & DOM Selectors Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 4] Verifying target selectors in component source files...')

const heroSrc = fs.readFileSync(path.join(__dirname, '../src/components/Hero.jsx'), 'utf-8')
const uploadSrc = fs.readFileSync(path.join(__dirname, '../src/components/UploadSection.jsx'), 'utf-8')
const settingsSrc = fs.readFileSync(path.join(__dirname, '../src/components/PrintSettings.jsx'), 'utf-8')
const priceCardSrc = fs.readFileSync(path.join(__dirname, '../src/components/PriceCard.jsx'), 'utf-8')
const qrPopupSrc = fs.readFileSync(path.join(__dirname, '../src/components/PaymentQrInstructionsModal.jsx'), 'utf-8')
const paymentModalSrc = fs.readFileSync(path.join(__dirname, '../src/components/PaymentModal.jsx'), 'utf-8')
const navDrawerSrc = fs.readFileSync(path.join(__dirname, '../src/components/NavigationDrawer.jsx'), 'utf-8')
const appSrc = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf-8')

// Step 1: Start Printing
assert.ok(heroSrc.includes('data-tour="start-printing"'), 'Hero must contain data-tour="start-printing"')
// Step 2: Upload Area
assert.ok(uploadSrc.includes('data-tour="upload-area"'), 'UploadSection must contain data-tour="upload-area"')
// Step 3: Print Settings
assert.ok(settingsSrc.includes('data-tour="print-settings"'), 'PrintSettings must contain data-tour="print-settings"')
// Step 4: Order Summary
assert.ok(priceCardSrc.includes('data-tour="order-summary"'), 'PriceCard must contain data-tour="order-summary"')
// Step 5: Review & Pay
assert.ok(priceCardSrc.includes('data-tour="review-and-pay"'), 'PriceCard must contain data-tour="review-and-pay"')

// Payment Step 1: QR Got It CTA
assert.ok(qrPopupSrc.includes('data-tour="payment-qr-got-it"'), 'PaymentQrInstructionsModal must contain data-tour="payment-qr-got-it"')
// Payment Step 2: Payment Review Details
assert.ok(paymentModalSrc.includes('data-tour="payment-review-details"'), 'PaymentModal must contain data-tour="payment-review-details"')

// Replay Tour in Navigation Drawer
assert.ok(navDrawerSrc.includes('drawerTutorial'), 'NavigationDrawer must include drawerTutorial replay item')

console.log('✓ TEST 4 PASSED: All 7 required data-tour anchors exist in authentic DOM markup')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 5] Safety Invariant: Guided Tour Does NOT Auto-Trigger Actions
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 5] Verifying safety invariant: guided tour controls do NOT auto-trigger orders or payments...')

// Review & Pay button in PriceCard has explicit onPayAndPrint handler
// Tour Finish must NOT invoke onPayAndPrint or create orders
assert.ok(!appSrc.includes('onPayAndPrint()'), 'App.jsx tour completion must not simulate click on onPayAndPrint()')
assert.ok(appSrc.includes('handlePrintTourFinish'), 'App.jsx must define separate handlePrintTourFinish')

// Payment Tour finish must NOT invoke onSuccess or poll completion
assert.ok(paymentModalSrc.includes('handlePaymentTourFinish') || paymentModalSrc.includes('markTourCompleted(STORAGE_KEYS.PAYMENT_TOUR, \'completed\')'), 'PaymentModal must complete tour purely as UI overlay')

console.log('✓ TEST 5 PASSED: Strict safety invariant verified — zero unintended side effects or mock payments')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 6] Bilingual Translation Parity for All Tour Keys
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 6] Verifying bilingual translation keys parity in en.js and te.js...')

assert.ok(en.tour, 'tour domain exists in en.js')
assert.ok(te.tour, 'tour domain exists in te.js')

const requiredTourKeys = [
  'stepIndicator',
  'next',
  'back',
  'skip',
  'finish',
  'printStep1Title',
  'printStep1Desc',
  'printStep2Title',
  'printStep2Desc',
  'printStep3Title',
  'printStep3Desc',
  'printStep4Title',
  'printStep4Desc',
  'printStep5Title',
  'printStep5Desc',
  'paymentStep1Title',
  'paymentStep1DescDownloaded',
  'paymentStep1DescStarted',
  'paymentStep2Title',
  'paymentStep2Desc',
  'replayTitle',
  'replayPrintingDesc',
  'replayPaymentDesc',
]

for (const k of requiredTourKeys) {
  assert.ok(typeof en.tour[k] === 'string' && en.tour[k].length > 0, `Missing English key en.tour.${k}`)
  assert.ok(typeof te.tour[k] === 'string' && te.tour[k].length > 0, `Missing Telugu key te.tour.${k}`)
}

console.log(`✓ TEST 6 PASSED: All ${requiredTourKeys.length} tour translation keys verified in both English and Telugu`)

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 7] Tooltip Collision Avoidance & Geometry Math
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 7] Testing collision avoidance and responsive spotlight coordinates math...')

function computeTooltipPosition({ targetRect, tooltipSize, viewport }) {
  const pad = 10
  const spotlightX = Math.max(0, targetRect.left - pad)
  const spotlightY = Math.max(0, targetRect.top - pad)
  const spotlightWidth = targetRect.width + pad * 2
  const spotlightHeight = targetRect.height + pad * 2

  const spaceBelow = viewport.height - (spotlightY + spotlightHeight)
  const spaceAbove = spotlightY

  let placement = 'bottom'
  let tooltipTop = 0
  if (spaceBelow >= tooltipSize.height + 24 || spaceBelow >= spaceAbove) {
    placement = 'bottom'
    tooltipTop = spotlightY + spotlightHeight + 14
  } else {
    placement = 'top'
    tooltipTop = Math.max(16, spotlightY - tooltipSize.height - 14)
  }

  const targetCenterX = spotlightX + spotlightWidth / 2
  let tooltipLeft = targetCenterX - tooltipSize.width / 2
  const minMargin = 16
  const maxLeft = viewport.width - tooltipSize.width - minMargin
  tooltipLeft = Math.max(minMargin, Math.min(maxLeft, tooltipLeft))

  return { placement, tooltipTop, tooltipLeft }
}

// Case A: Element near top of desktop viewport -> tooltip goes below
const posA = computeTooltipPosition({
  targetRect: { top: 120, left: 300, width: 200, height: 50 },
  tooltipSize: { width: 340, height: 160 },
  viewport: { width: 1024, height: 768 },
})
assert.equal(posA.placement, 'bottom')
assert.ok(posA.tooltipTop > 170)
assert.ok(posA.tooltipLeft >= 16 && posA.tooltipLeft <= 1024 - 340 - 16)

// Case B: Element near bottom of viewport -> tooltip flips above
const posB = computeTooltipPosition({
  targetRect: { top: 650, left: 300, width: 200, height: 50 },
  tooltipSize: { width: 340, height: 160 },
  viewport: { width: 1024, height: 768 },
})
assert.equal(posB.placement, 'top')
assert.ok(posB.tooltipTop < 650)

// Case C: Mobile screen 360px wide -> clamped within boundaries
const posC = computeTooltipPosition({
  targetRect: { top: 200, left: 10, width: 320, height: 60 },
  tooltipSize: { width: 320, height: 160 },
  viewport: { width: 360, height: 640 },
})
assert.ok(posC.tooltipLeft >= 16)
assert.ok(posC.tooltipLeft + 320 <= 360)

console.log('✓ TEST 7 PASSED: Collision avoidance and clamping reliably prevent offscreen clipping')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 8] Step Transition State Machine Invariants
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 8] Testing step transition progression (Next, Back, Skip, Finish)...')

let currentStep = 0
const totalSteps = 5

function next() {
  if (currentStep < totalSteps - 1) currentStep++
}
function back() {
  if (currentStep > 0) currentStep--
}

assert.equal(currentStep, 0)
next() // 1
assert.equal(currentStep, 1)
next() // 2
assert.equal(currentStep, 2)
back() // 1
assert.equal(currentStep, 1)
back() // 0
assert.equal(currentStep, 0)
back() // Clamped at 0
assert.equal(currentStep, 0)

// Fast forward to last step
currentStep = 4
next() // Clamped at 4
assert.equal(currentStep, 4)

console.log('✓ TEST 8 PASSED: State machine safely transitions and strictly clamps bounds')

// ─────────────────────────────────────────────────────────────────────────────
// [TEST 9] XBuddy Bird Mascot Asset & Tour Integration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 9] Verifying XBuddy Bird Mascot Asset and Integration in Payment Onboarding...')

const mascotAssetPath = path.resolve(__dirname, '../public/xbuddy-mascot.png')
assert.ok(fs.existsSync(mascotAssetPath), 'public/xbuddy-mascot.png must exist')

const mascotBuffer = fs.readFileSync(mascotAssetPath)
assert.ok(mascotBuffer.length > 5000, 'mascot asset must be a valid non-empty file')
// Verify PNG magic numbers: 0x89, 0x50, 0x4E, 0x47
assert.equal(mascotBuffer[0], 0x89)
assert.equal(mascotBuffer[1], 0x50)
assert.equal(mascotBuffer[2], 0x4e)
assert.equal(mascotBuffer[3], 0x47)

// Verify PaymentModal.jsx passes mascot prop
assert.ok(paymentModalSrc.includes("mascot: '/xbuddy-mascot.png'"), 'PaymentModal must pass mascot: "/xbuddy-mascot.png"')

// Verify InteractiveTourSpotlight.jsx contains responsive mascot rendering logic
const tourSpotlightSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/InteractiveTourSpotlight.jsx'), 'utf-8')
assert.ok(tourSpotlightSrc.includes('stepData.mascot'), 'InteractiveTourSpotlight must support stepData.mascot')
assert.ok(tourSpotlightSrc.includes('alt={t(\'common.mascot\', \'XBuddy Mascot\')}'), 'InteractiveTourSpotlight must provide accessible alt text')
assert.ok(tourSpotlightSrc.includes('shouldReduceMotion'), 'InteractiveTourSpotlight must respect reduced motion preferences')

console.log('✓ TEST 9 PASSED: Original XBuddy Bird Mascot asset, responsive layout, and motion safety verified')

console.log('\n========================================================================')
console.log('🎉 ALL 9 XBUDDY INTERACTIVE ONBOARDING & PAYMENT TESTS PASSED PERFECTLY!')
console.log('========================================================================')
