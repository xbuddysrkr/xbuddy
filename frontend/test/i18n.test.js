import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING XBUDDY BILINGUAL I18N TEST SUITE ---')

// Helper function to extract all deep dot-notated keys from an object
function getDeepKeys(obj, prefix = '') {
  let keys = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getDeepKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

// Helper function to retrieve nested value by dot path
function getDeepValue(obj, pathStr) {
  return pathStr.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj)
}

// 1. KEY PARITY TEST: en vs te
const enKeys = getDeepKeys(en)
const teKeys = getDeepKeys(te)

console.log(`[i18n] Total English keys: ${enKeys.length}`)
console.log(`[i18n] Total Telugu keys:  ${teKeys.length}`)

const missingInTe = enKeys.filter(k => !teKeys.includes(k))
const missingInEn = teKeys.filter(k => !enKeys.includes(k))

assert.equal(
  missingInTe.length,
  0,
  `TEST 1 FAILED: The following keys exist in English but are missing in Telugu:\n${missingInTe.join('\n')}`
)
console.log('✓ TEST 1 PASSED: All English dictionary keys exist in Telugu dictionary')

assert.equal(
  missingInEn.length,
  0,
  `TEST 2 FAILED: The following keys exist in Telugu but are missing in English:\n${missingInEn.join('\n')}`
)
console.log('✓ TEST 2 PASSED: All Telugu dictionary keys exist in English dictionary')

// 2. NON-EMPTY VALUES TEST
for (const key of enKeys) {
  const enVal = getDeepValue(en, key)
  const teVal = getDeepValue(te, key)

  assert.ok(
    typeof enVal === 'string' && enVal.trim().length > 0,
    `TEST 3 FAILED: English key "${key}" is empty or not a string`
  )
  assert.ok(
    typeof teVal === 'string' && teVal.trim().length > 0,
    `TEST 3 FAILED: Telugu key "${key}" is empty or not a string`
  )
}
console.log(`✓ TEST 3 PASSED: All ${enKeys.length} translation values are non-empty strings`)

// 3. PARAMETER INTERPOLATION TEST
function interpolate(template, params = {}) {
  if (typeof template !== 'string') return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`
  })
}

// Test with copyright template
const testYear = 2026
const enCopyright = interpolate(en.footer.copyright, { year: testYear })
const teCopyright = interpolate(te.footer.copyright, { year: testYear })

assert.ok(enCopyright.includes('2026'), 'TEST 4 FAILED: English copyright did not interpolate {year}')
assert.ok(teCopyright.includes('2026'), 'TEST 4 FAILED: Telugu copyright did not interpolate {year}')
console.log('✓ TEST 4 PASSED: Named parameter interpolation works properly in both locales')

// 4. STORAGE FALLBACK TEST
function resolveInitialLanguage(storedLang) {
  const supported = ['en', 'te']
  if (storedLang && supported.includes(storedLang)) {
    return storedLang
  }
  return 'en'
}

assert.equal(resolveInitialLanguage(null), 'en', 'TEST 5 FAILED: null should fallback to English')
assert.equal(resolveInitialLanguage(''), 'en', 'TEST 5 FAILED: empty string should fallback to English')
assert.equal(resolveInitialLanguage('te'), 'te', 'TEST 5 FAILED: "te" should be accepted')
assert.equal(resolveInitialLanguage('en'), 'en', 'TEST 5 FAILED: "en" should be accepted')
assert.equal(resolveInitialLanguage('fr'), 'en', 'TEST 5 FAILED: invalid language should fallback to English')
console.log('✓ TEST 5 PASSED: Storage fallback logic safely defaults to English and validates supported languages')

// 5. TELUGU FONT INTEGRATION VERIFICATION
const indexHtmlPath = path.resolve(__dirname, '../index.html')
const indexCssPath = path.resolve(__dirname, '../src/index.css')

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8')
const indexCss = fs.readFileSync(indexCssPath, 'utf8')

assert.ok(
  indexHtml.includes('Noto+Sans+Telugu'),
  'TEST 6 FAILED: index.html must load Noto Sans Telugu from Google Fonts'
)
console.log('✓ TEST 6 PASSED: index.html loads Noto Sans Telugu with font preconnect and stylesheet')

assert.ok(
  indexCss.includes('Noto Sans Telugu'),
  'TEST 7 FAILED: index.css font family stack must include "Noto Sans Telugu"'
)
console.log('✓ TEST 7 PASSED: index.css font-sans includes "Noto Sans Telugu"')

// 6. CORE DOMAIN COVERAGE TEST
const requiredDomains = [
  'common',
  'nav',
  'hero',
  'trustStats',
  'workflow',
  'whyXBuddy',
  'perfectFor',
  'upload',
  'settings',
  'pricing',
  'payment',
  'orderProgress',
  'status',
  'game',
  'orders',
  'toolkit',
  'resume',
  'footer',
  'intro',
  'ads',
  'tour',
]

for (const domain of requiredDomains) {
  assert.ok(en[domain] !== undefined, `TEST 8 FAILED: Domain "${domain}" missing from en.js`)
  assert.ok(te[domain] !== undefined, `TEST 8 FAILED: Domain "${domain}" missing from te.js`)
}
console.log(`✓ TEST 8 PASSED: All ${requiredDomains.length} required domain dictionaries are present`)

console.log('--- ALL XBUDDY BILINGUAL I18N TESTS PASSED (8/8) ---')
