import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  normalizeColorMode,
  normalizeOrientation,
  normalizePaperSize,
  createNormalizedPrintSettings,
  validatePrintSettings,
} from '../src/utils/printSettings.js'
import { parsePageRange, resolveAllPages } from '../src/utils/pageRangeParser.js'

console.log('--- RUNNING AUDIT & REGRESSION TEST SUITE ---')

// 1. Color Mode Normalization
console.log('Test 1: Color Mode Normalization')
assert.strictEqual(normalizeColorMode('color'), 'color')
assert.strictEqual(normalizeColorMode('COLOR'), 'color')
assert.strictEqual(normalizeColorMode('Color'), 'color')
assert.strictEqual(normalizeColorMode('bw'), 'bw')
assert.strictEqual(normalizeColorMode('B&W'), 'bw')
assert.strictEqual(normalizeColorMode('Black & White'), 'bw')
assert.strictEqual(normalizeColorMode('grayscale'), 'bw')
assert.strictEqual(normalizeColorMode('monochrome'), 'bw')
assert.strictEqual(normalizeColorMode('mono'), 'bw')
assert.strictEqual(normalizeColorMode(null), 'bw')
assert.strictEqual(normalizeColorMode('invalid_color_value'), null)
console.log('✓ Color Mode normalization passed')

// 2. Orientation Normalization
console.log('Test 2: Orientation Normalization')
assert.strictEqual(normalizeOrientation('portrait'), 'portrait')
assert.strictEqual(normalizeOrientation('PORTRAIT'), 'portrait')
assert.strictEqual(normalizeOrientation('landscape'), 'landscape')
assert.strictEqual(normalizeOrientation('LANDSCAPE'), 'landscape')
assert.strictEqual(normalizeOrientation(null), 'portrait')
assert.strictEqual(normalizeOrientation('diagonal'), null)
console.log('✓ Orientation normalization passed')

// 3. Paper Size Normalization
console.log('Test 3: Paper Size Normalization')
assert.strictEqual(normalizePaperSize('a4'), 'A4')
assert.strictEqual(normalizePaperSize('A4'), 'A4')
assert.strictEqual(normalizePaperSize('Letter'), 'LETTER')
assert.strictEqual(normalizePaperSize('legal'), 'LEGAL')
assert.strictEqual(normalizePaperSize(null), 'A4')
assert.strictEqual(normalizePaperSize('invalid_size'), null)
console.log('✓ Paper Size normalization passed')

// 4. Custom Page Range for 9-Page Document
console.log('Test 4: Page Range Parsing (9-page PDF)')
const testCases = [
  { input: '1', expectedPages: [1], expectedCount: 1, expectedRange: '1' },
  { input: '1,3', expectedPages: [1, 3], expectedCount: 2, expectedRange: '1,3' },
  { input: '1-3', expectedPages: [1, 2, 3], expectedCount: 3, expectedRange: '1-3' },
  { input: '1-3,7,9', expectedPages: [1, 2, 3, 7, 9], expectedCount: 5, expectedRange: '1-3,7,9' },
]

for (const tc of testCases) {
  const settings = createNormalizedPrintSettings({
    pageRangeMode: 'custom',
    customPages: tc.input,
  }, 9)
  assert.strictEqual(settings.isRangeValid, true)
  assert.deepStrictEqual(settings.selectedPages, tc.expectedPages)
  assert.strictEqual(settings.selectedPageCount, tc.expectedCount)
  assert.strictEqual(settings.pageRange, tc.expectedRange)
}
console.log('✓ Custom page ranges passed')

// 5. All Pages Range
console.log('Test 5: All Pages Mode (9-page PDF)')
const allSettings = createNormalizedPrintSettings({
  pageRangeMode: 'all',
}, 9)
assert.strictEqual(allSettings.pageRange, 'all')
assert.deepStrictEqual(allSettings.selectedPages, [1, 2, 3, 4, 5, 6, 7, 8, 9])
assert.strictEqual(allSettings.selectedPageCount, 9)
console.log('✓ All Pages mode passed')

// 6. Invalid Page Ranges (Defense)
console.log('Test 6: Invalid Page Range Defense')
const invalidRangeSettings = createNormalizedPrintSettings({
  pageRangeMode: 'custom',
  customPages: '10-15', // exceeds 9 pages
}, 9)
assert.strictEqual(invalidRangeSettings.isRangeValid, false)
assert.strictEqual(invalidRangeSettings.selectedPages.length, 0)
assert.throws(() => {
  validatePrintSettings(invalidRangeSettings, { totalPages: 9 })
}, /exceed total document pages|Invalid custom page range/)
console.log('✓ Invalid page ranges defensive validation passed')

// 7. Copies Validation
console.log('Test 7: Copies Normalization & Validation')
for (const count of [1, 2, 3, 10]) {
  const copySettings = createNormalizedPrintSettings({ copies: count }, 9)
  assert.strictEqual(copySettings.copies, count)
  assert.doesNotThrow(() => validatePrintSettings(copySettings))
}

const badCopySettings = createNormalizedPrintSettings({ copies: 0 }, 9)
assert.strictEqual(badCopySettings.copies, 1) // normalized to min 1
console.log('✓ Copies normalization and validation passed')

// 8. Color Mode in Normalized Print Settings
console.log('Test 8: Color Mode Single Source of Truth')
const bwSettings = createNormalizedPrintSettings({ colorMode: 'bw' }, 9)
assert.strictEqual(bwSettings.colorMode, 'bw')
assert.strictEqual(bwSettings.printType, 'B&W')

const colorSettings = createNormalizedPrintSettings({ colorMode: 'color' }, 9)
assert.strictEqual(colorSettings.colorMode, 'color')
assert.strictEqual(colorSettings.printType, 'Color')

// Legacy format input:
const legacyColor = createNormalizedPrintSettings({ printType: 'Color' }, 9)
assert.strictEqual(legacyColor.colorMode, 'color')
const legacyBw = createNormalizedPrintSettings({ printType: 'B&W' }, 9)
assert.strictEqual(legacyBw.colorMode, 'bw')
console.log('✓ Color Mode single source of truth passed')

// 9. Duplex / Orientation
console.log('Test 9: Orientation & Duplex')
const landscapeSettings = createNormalizedPrintSettings({ orientation: 'landscape', sideMode: 'double' }, 9)
assert.strictEqual(landscapeSettings.orientation, 'landscape')
assert.strictEqual(landscapeSettings.duplex, true)
assert.strictEqual(landscapeSettings.printSide, 'Double')

const portraitSettings = createNormalizedPrintSettings({ orientation: 'portrait', sideMode: 'single' }, 9)
assert.strictEqual(portraitSettings.orientation, 'portrait')
assert.strictEqual(portraitSettings.duplex, false)
assert.strictEqual(portraitSettings.printSide, 'Single')
console.log('✓ Orientation & Duplex passed')

console.log('=============================================')
console.log('ALL AUDIT & UNIT TESTS PASSED SUCCESSFULLY! ✓')
console.log('=============================================')
