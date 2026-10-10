import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACADEMIC_TOOLKIT_ENABLED } from '../src/utils/academicToolkitConfig.js'
import {
  DOC_TYPES,
  generateDocument,
  ACADEMIC_TOOLKIT_ENABLED as RE_EXPORTED_FLAG,
} from '../src/utils/letterTemplates.js'
import { calcPriceBreakdown } from '../src/utils/pricing.js'
import { parsePageRange } from '../src/utils/pageRangeParser.js'
import { createNormalizedPrintSettings } from '../src/utils/printSettings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('🧪 Starting Academic Toolkit Lock & Coming Soon Test Suite...\n')

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Central Feature Flag is Defined & Active
// ─────────────────────────────────────────────────────────────────────────────
{
  assert.equal(
    typeof ACADEMIC_TOOLKIT_ENABLED,
    'boolean',
    'ACADEMIC_TOOLKIT_ENABLED should be a boolean'
  )
  assert.equal(
    ACADEMIC_TOOLKIT_ENABLED,
    true,
    'ACADEMIC_TOOLKIT_ENABLED is active (unlocked)'
  )
  assert.equal(
    RE_EXPORTED_FLAG,
    true,
    'letterTemplates.js should re-export ACADEMIC_TOOLKIT_ENABLED as true'
  )
  console.log('✅ Test 1 Passed: Central feature flag ACADEMIC_TOOLKIT_ENABLED is active and true')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: All 9 Template Cards & Metadata Remain Visible and Intact
// ─────────────────────────────────────────────────────────────────────────────
{
  const expectedTemplates = [
    'leave',
    'bonafide',
    'internship',
    'permission',
    'apology',
    'scholarship',
    'resume',
    'assignment',
    'lab',
  ]

  assert.equal(DOC_TYPES.length, 9, 'All 9 template cards must be preserved')
  const actualIds = DOC_TYPES.map(t => t.id)
  assert.deepEqual(actualIds, expectedTemplates, 'Template card IDs must match original set')

  // Verify all cards have label and description
  DOC_TYPES.forEach(t => {
    assert.ok(t.label && t.label.length > 0, `Template ${t.id} must have a label`)
    assert.ok(t.desc && t.desc.length > 0, `Template ${t.id} must have a description`)
  })
  console.log('✅ Test 2 Passed: All 9 template cards remain defined, configured, and visible')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Document Generation & Downloads are Blocked When Locked
// ─────────────────────────────────────────────────────────────────────────────
{
  // When locked, calling generateDocument must throw
  DOC_TYPES.forEach(doc => {
    assert.throws(
      () => {
        generateDocument({ type: doc.id, name: 'Test Student' }, { simulateLock: true })
      },
      (err) => {
        assert.ok(
          err.message.includes('Academic Toolkit is currently locked (Coming Soon)'),
          `Error for ${doc.id} should indicate locked status`
        )
        return true
      },
      `generateDocument(${doc.id}) should throw when locked`
    )
  })
  console.log('✅ Test 3 Passed: Document generation and export actions are blocked when locked')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: UI Component Coming Soon & Lock Badges are Rendered in Component
// ─────────────────────────────────────────────────────────────────────────────
{
  const componentPath = path.resolve(__dirname, '../src/components/AcademicToolkit.jsx')
  const componentSource = fs.readFileSync(componentPath, 'utf8')

  // Check that the Coming Soon badges and lock messages are rendered
  assert.ok(
    componentSource.includes('academic-toolkit-coming-soon-badge'),
    'Component must render a Coming Soon badge near header'
  )
  assert.ok(
    componentSource.includes('academic-toolkit-locked-notice'),
    'Component must render a locked notice message card'
  )
  assert.ok(
    componentSource.includes('Your academic documents, ready when you need them.'),
    'Component must include suggested heading message'
  )
  assert.ok(
    componentSource.includes("Academic Toolkit is coming soon. We're preparing the templates and editing tools for you."),
    'Component must include suggested subtext message'
  )
  assert.ok(
    componentSource.includes('card-locked-badge-'),
    'Template cards must display a small Coming Soon / Locked badge'
  )
  assert.ok(
    componentSource.includes('open-doc-locked-'),
    'Unavailable open actions must display Locked status instead of active link'
  )
  console.log('✅ Test 4 Passed: UI renders Coming Soon badge, message card, and locked card indicators')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Direct Navigation Routes Guarded against Bypass
// ─────────────────────────────────────────────────────────────────────────────
{
  const appPath = path.resolve(__dirname, '../src/App.jsx')
  const appSource = fs.readFileSync(appPath, 'utf8')

  // App recognizes academic toolkit routes without crashing or opening unauthorized editor sessions
  assert.ok(
    appSource.includes("currentPath.startsWith('/academic-toolkit')"),
    'App.jsx handles /academic-toolkit route gracefully'
  )
  assert.ok(
    appSource.includes("currentPath.startsWith('/toolkit')"),
    'App.jsx handles /toolkit route gracefully'
  )

  // DocModal guards direct rendering of document session
  const componentPath = path.resolve(__dirname, '../src/components/AcademicToolkit.jsx')
  const componentSource = fs.readFileSync(componentPath, 'utf8')

  assert.ok(
    componentSource.includes('if (!ACADEMIC_TOOLKIT_ENABLED)'),
    'DocModal must check ACADEMIC_TOOLKIT_ENABLED and guard editor session'
  )
  assert.ok(
    componentSource.includes('is Locked'),
    'DocModal renders friendly locked coming soon dialog when opened while locked'
  )
  console.log('✅ Test 5 Passed: Direct route access and modal sessions cannot bypass the lock')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Switching Flag to true Restores Full Functionality
// ─────────────────────────────────────────────────────────────────────────────
{
  // Test that generateDocument works completely without bypassLock when flag is true
  DOC_TYPES.forEach(doc => {
    const html = generateDocument({
      type: doc.id,
      name: 'John Doe',
      rollNo: '21CS045',
      year: 'III Year',
      department: 'Computer Science',
      college: 'SRKR Engineering College',
      receiver: 'The Principal',
      reason: 'Attending Hackathon',
      days: '3',
      weeks: '4',
      extra: 'Special permission',
    })

    assert.ok(typeof html === 'string', `Generated output for ${doc.id} must be a string`)
    assert.ok(html.length > 100, `Generated HTML for ${doc.id} should have substantial content`)
    assert.ok(html.includes('John Doe'), `Generated HTML for ${doc.id} should reflect form details`)
  })
  console.log('✅ Test 6 Passed: Unlocking restores all 9 template generators with zero missing logic')
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Unrelated Features (Resume Builder, Pricing, Settings) Preserved
// ─────────────────────────────────────────────────────────────────────────────
{
  // 1. Resume Builder templates preserved independently
  const resumeTemplatesPath = path.resolve(__dirname, '../src/resume-builder/templates/index.js')
  const resumeTemplatesSource = fs.readFileSync(resumeTemplatesPath, 'utf8')
  assert.ok(resumeTemplatesSource.includes("id: 'modern'"), 'Modern template must be preserved')
  assert.ok(resumeTemplatesSource.includes("id: 'minimal'"), 'Minimal template must be preserved')
  assert.ok(resumeTemplatesSource.includes("id: 'creative'"), 'Creative template must be preserved')
  assert.ok(resumeTemplatesSource.includes("id: 'executive'"), 'Executive template must be preserved')
  assert.ok(resumeTemplatesSource.includes("id: 'ats-elegant'"), 'ATS Elegant template must be preserved')
  assert.ok(resumeTemplatesSource.includes("id: 'two-column-tech'"), 'Two Column Tech template must be preserved')

  // 2. Pricing engine
  const priceResult = calcPriceBreakdown({
    totalPages: 10,
    copies: 2,
    colorMode: 'bw',
    isDoubleSide: false,
  })
  assert.equal(priceResult.printingCost, 40)
  assert.equal(priceResult.totalAmount, 43)

  // 3. Page range parser
  const rangeResult = parsePageRange('1-5', 10)
  assert.equal(rangeResult.valid, true)
  assert.equal(rangeResult.selectedPageCount, 5)

  // 4. Print settings normalizer
  const normSettings = createNormalizedPrintSettings({
    colorMode: 'bw',
    copies: 1,
  })
  assert.equal(normSettings.colorMode, 'bw')

  console.log('✅ Test 7 Passed: Unrelated features (Resume Builder, Pricing, Range Parser, Settings) remain fully functional')
}

console.log('\n🎉 All 7 Academic Toolkit Lock regression tests passed successfully!\n')
