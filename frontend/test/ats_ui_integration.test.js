import assert from 'node:assert/strict'
import {
  calculateAtsReadiness,
  calculateJobMatch,
  getTemplateProfile,
  performPdfPreflight
} from '../src/resume-builder/scoring/atsEngine.js'
import { en } from '../src/i18n/locales/en.js'
import { te } from '../src/i18n/locales/te.js'

console.log('--- STARTING ATS UI INTEGRATION & REACTIVITY REGRESSION TEST SUITE ---')

// 1. DICTIONARY & I18N PARITY FOR ALL ATS UI KEYS
console.log('\n[TEST 1] Verifying bilingual translation keys for ATS UI...')
const requiredUiKeys = [
  'atsReadinessScore',
  'atsReadinessDesc',
  'atsDisclaimer',
  'pdfRasterNotice',
  'categoryIdentity',
  'categoryCompleteness',
  'categoryTemplate',
  'categoryEvidence',
  'categoryHygiene',
  'categorySkillsQuality',
  'viewAllFindings',
  'hideFindings',
  'topSuggestions',
  'noSuggestions',
  'jobMatchTitle',
  'jobMatchDesc',
  'jobDescriptionPlaceholder',
  'analyzeJobMatch',
  'clearJd',
  'notCalculated',
  'insufficientJd',
  'matchedKeywords',
  'missingKeywords',
  'evidencedSkills',
  'reqSkillsCategory',
  'skillOverlapCategory',
  'projectEvidenceCategory',
  'educationCategory',
  'roleDomainCategory',
  'highAlignment',
  'moderateAlignment',
  'basicAlignment',
  'lowAlignment',
  'provisionalBadgeHigh',
  'provisionalBadgeModerate',
  'provisionalBadgeCaution',
  'provisionalBadgeUnverified'
]

for (const key of requiredUiKeys) {
  assert(en.resume[key], `Missing English key: en.resume.${key}`)
  assert(te.resume[key], `Missing Telugu key: te.resume.${key}`)
  assert.equal(typeof en.resume[key], 'string', `en.resume.${key} must be a string`)
  assert.equal(typeof te.resume[key], 'string', `te.resume.${key} must be a string`)
  assert(en.resume[key].trim().length > 0, `en.resume.${key} must not be empty`)
  assert(te.resume[key].trim().length > 0, `te.resume.${key} must not be empty`)
}
console.log(`✓ TEST 1 PASSED: All ${requiredUiKeys.length} UI keys verified in both English and Telugu dictionaries`)

// 2. DYNAMIC REACTIVITY TO RESUME DRAFT EDITS
console.log('\n[TEST 2] Verifying reactive score changes as student edits resume fields...')

let dynamicResume = {
  personal: { name: '', email: '', phone: '' },
  education: [],
  skills: { languages: '', frameworks: '', tools: '', soft: '' },
  projects: [],
  experience: [],
  template: 'minimal'
}

// Initial empty state
const initialScore = calculateAtsReadiness(dynamicResume)
assert(initialScore.totalScore < 35, `Initial score should be low (<35), got ${initialScore.totalScore}`)

// User fills contact information
dynamicResume = {
  ...dynamicResume,
  personal: {
    name: 'Sravani Varma',
    email: 'sravani@srkr.edu',
    phone: '9848012345',
    location: 'Bhimavaram'
  }
}
const withContactScore = calculateAtsReadiness(dynamicResume)
assert(
  withContactScore.totalScore > initialScore.totalScore,
  `Score must increase when contact info is filled: ${withContactScore.totalScore} > ${initialScore.totalScore}`
)
assert.equal(withContactScore.breakdown.identity.score, 10, 'Full contact details must yield 10/10 for identity')

// User adds technical projects with action verbs and metrics
dynamicResume = {
  ...dynamicResume,
  education: [{ college: 'SRKR Engineering College', degree: 'B.Tech', department: 'CSE' }],
  skills: { languages: 'Python, SQL', frameworks: 'Django', tools: 'Git, Docker', soft: 'Agile' },
  projects: [
    {
      title: 'Kiosk Automation',
      tech: 'Python, Django, SQLite',
      description: 'Architected and deployed campus print kiosks reducing wait times by 40% for 800+ students daily.'
    },
    {
      title: 'Lab Attendance Portal',
      tech: 'React, Django',
      description: 'Developed real-time biometric scanning with 95% accuracy in a team of 4.'
    }
  ]
}

const withProjectsScore = calculateAtsReadiness(dynamicResume)
assert(
  withProjectsScore.totalScore >= 85,
  `Score with education, skills, and quantified projects must reach ATS Ready (>=85), got ${withProjectsScore.totalScore}`
)
assert.equal(withProjectsScore.ratingLabel, 'ATS Ready', 'Score >= 85 must have "ATS Ready" label')
console.log(`✓ TEST 2 PASSED: Score increased progressively (Initial: ${initialScore.totalScore} -> Contact: ${withContactScore.totalScore} -> Completed: ${withProjectsScore.totalScore})`)

// 3. TEMPLATE SELECTION REACTIVITY
console.log('\n[TEST 3] Verifying score changes when switching templates...')

const scoreMinimal = calculateAtsReadiness({ ...dynamicResume, template: 'minimal' })
const scoreCreative = calculateAtsReadiness({ ...dynamicResume, template: 'creative' })

// In the new model, template selection creates a slight layout advisory (7 vs 5), NOT a 9-point penalty on content!
assert.equal(scoreMinimal.breakdown.structureLayout.details.find(d => d.key === 'template_layout')?.score, 7, 'Minimal ATS layout score must be 7')
assert.equal(scoreCreative.breakdown.structureLayout.details.find(d => d.key === 'template_layout')?.score, 5, 'Two-column creative layout score must be 5')
assert.equal(scoreCreative.breakdown.structureLayout.templateRating, 'provisional_caution')
assert(
  scoreCreative.suggestions.some(s => s.category === 'structure'),
  'Switching to two-column template must generate a layout caution suggestion'
)
console.log('✓ TEST 3 PASSED: Template compatibility score reacts deterministically across templates without dominating content score')

// 4. JOB MATCH UI STATES & VALIDATION
console.log('\n[TEST 4] Verifying Job Match states (uncalculated, limited information, calculated)...')

// State A: Uncalculated / empty
const emptyJdResult = calculateJobMatch(dynamicResume, '')
assert.equal(emptyJdResult.status, 'not_calculated')
assert.equal(emptyJdResult.score, null)

// State B: Insufficient / brief JD
const shortJdResult = calculateJobMatch(dynamicResume, 'Hiring python developer. Apply soon!')
assert.equal(shortJdResult.status, 'insufficient_job_description')
assert.equal(shortJdResult.score, null)

// State C: Sufficient JD
const detailedJd = `
Looking for a Python Backend Engineer with strong expertise in Python, Django, SQL, and Docker.
Responsibilities include building robust RESTful APIs, optimizing database queries, and integrating Git workflows.
Requirements: Degree in Computer Science or related field, experience with scalable services, and agile collaboration.
`

const calculatedMatch = calculateJobMatch(dynamicResume, detailedJd)
assert.equal(calculatedMatch.status, 'calculated')
assert(calculatedMatch.totalScore >= 55, `Score against matching Python Django JD must be >= 55 (Moderate Alignment), got ${calculatedMatch.totalScore}`)
assert(calculatedMatch.matchedKeywords.includes('python'))
assert(calculatedMatch.matchedKeywords.includes('django'))
assert(calculatedMatch.evidencedKeywords.includes('python'))
assert(calculatedMatch.evidencedKeywords.includes('django'))

console.log(`✓ TEST 4 PASSED: Job Match accurately evaluates uncalculated, limited info, and calculated states (${calculatedMatch.totalScore}/100)`)

// 5. PDF PREFLIGHT METADATA & ADVISORIES
console.log('\n[TEST 5] Verifying PDF preflight output...')
const preflight = performPdfPreflight(dynamicResume, 'minimal')
assert.equal(preflight.status, 'ready')
assert.equal(preflight.isRasterCanvasPdf, true)
assert.equal(preflight.textExtractableWithoutOcr, false)
assert(preflight.advisories.some(a => a.code === 'EXPORT_RASTER_PDF'))

console.log('✓ TEST 5 PASSED: PDF preflight reports clean status with transparent raster PDF notice')

console.log('\n========================================================================')
console.log('🎉 ALL 5 ATS UI INTEGRATION & REACTIVITY REGRESSION TESTS PASSED!')
console.log('========================================================================\n')
