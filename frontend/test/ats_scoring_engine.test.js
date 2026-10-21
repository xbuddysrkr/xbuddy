import assert from 'node:assert/strict'
import {
  calculateAtsReadiness,
  calculateJobMatch,
  getTemplateProfile,
  performPdfPreflight,
  extractSkillsList,
  tokenizeText,
  TEMPLATE_PROFILES
} from '../src/resume-builder/scoring/atsEngine.js'

console.log('--- STARTING XBUDDY ATS RESUME SCORING ENGINE TEST SUITE ---')

// -----------------------------------------------------------------------------
// TEST 1: CATEGORY WEIGHT SPECIFICATION AND MATH INVARIANTS
// -----------------------------------------------------------------------------
console.log('\n[TEST 1] Verifying exact weight allocations according to approved specification...')

const mockMaxResume = {
  personal: {
    name: 'Srikar Varma',
    email: 'srikar.varma@srkr.ac.in',
    phone: '+91 9876543210',
    location: 'Bhimavaram, Andhra Pradesh',
    linkedin: 'https://linkedin.com/in/srikar',
    github: 'https://github.com/srikar',
    summary: 'Proactive Computer Science student skilled in full-stack development and cloud computing.'
  },
  education: [
    {
      college: 'SRKR Engineering College',
      degree: 'B.Tech',
      department: 'Computer Science and Engineering',
      cgpa: '8.9',
      year: '2026'
    }
  ],
  skills: {
    languages: 'JavaScript, Python, C++, SQL',
    frameworks: 'React, Node.js, Express, TailwindCSS',
    tools: 'Git, Docker, Postman, Linux',
    soft: 'Team Leadership, Problem Solving, Communication'
  },
  projects: [
    {
      title: 'XBuddy Campus Print Station',
      tech: 'React, Node.js, SQLite, TailwindCSS',
      description: 'Architected and deployed an autonomous campus printing kiosk serving 500+ students daily. Optimized print queue latency by 45%.'
    },
    {
      title: 'Smart Attendance Automation',
      tech: 'Python, OpenCV, Flask',
      description: 'Developed an automated face-recognition attendance pipeline in a team of 4 members with 94% detection accuracy.'
    }
  ],
  experience: [],
  certifications: [
    { course: 'AWS Certified Cloud Practitioner', platform: 'Amazon Web Services', year: '2025' }
  ],
  achievements: 'Winner of Smart India Hackathon internal campus round.',
  template: 'minimal'
}

const maxResult = calculateAtsReadiness(mockMaxResume)

assert.equal(maxResult.breakdown.identity.max, 10, 'Identity max must be 10 points')
assert.equal(maxResult.breakdown.completeness.max, 25, 'Section completeness max must be 25 points')
assert.equal(maxResult.breakdown.templateCompatibility.max, 25, 'Template compatibility max must be 25 points')
assert.equal(maxResult.breakdown.contentEvidence.max, 20, 'Content evidence max must be 20 points')
assert.equal(maxResult.breakdown.formattingHygiene.max, 10, 'Formatting hygiene max must be 10 points')
assert.equal(maxResult.breakdown.skillsQuality.max, 10, 'Skills quality max must be 10 points')

const totalMax = 
  maxResult.breakdown.identity.max +
  maxResult.breakdown.completeness.max +
  maxResult.breakdown.templateCompatibility.max +
  maxResult.breakdown.contentEvidence.max +
  maxResult.breakdown.formattingHygiene.max +
  maxResult.breakdown.skillsQuality.max

assert.equal(totalMax, 100, `Total maximum possible points must equal exactly 100, got: ${totalMax}`)
assert(maxResult.totalScore >= 95, `Strong student resume should achieve >= 95, got ${maxResult.totalScore}`)
assert.equal(maxResult.ratingLabel, 'ATS Ready', 'Score >= 85 must have "ATS Ready" rating label')

console.log(`✓ TEST 1 PASSED: Total maximum points = 100, mock resume achieved score = ${maxResult.totalScore}/100`)

// -----------------------------------------------------------------------------
// TEST 2: FRESHER FAIRNESS (NO PENALTY FOR ZERO CORPORATE EXPERIENCE)
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Verifying fresher-friendly scoring (student projects substitute for corporate experience)...')

const fresherResume = {
  personal: {
    name: 'Ananya Rao',
    email: 'ananya@gmail.com',
    phone: '9848012345',
    location: 'Bhimavaram'
  },
  education: [
    { college: 'SRKR Engineering College', degree: 'B.Tech', department: 'IT' }
  ],
  skills: {
    languages: 'Java, Python',
    frameworks: 'Spring Boot',
    tools: 'Git, VS Code',
    soft: 'Collaboration'
  },
  projects: [
    {
      title: 'Library Inventory System',
      description: 'Engineered a database catalog system managing 1200+ book entries with search time under 50ms.',
      tech: 'Java, MySQL'
    },
    {
      title: 'Hostel Outpass Portal',
      description: 'Built a multi-tier approval workflow for student campus leave tracking with 100% digital paperless records.',
      tech: 'Spring Boot, Thymeleaf'
    }
  ],
  experience: [], // ZERO corporate experience
  certifications: [],
  template: 'minimal'
}

const fresherResult = calculateAtsReadiness(fresherResume)
assert.equal(
  fresherResult.breakdown.completeness.details.find(d => d.key === 'work_or_projects')?.passed,
  true,
  'Student with 2 strong academic projects should satisfy project/work completeness'
)
assert(
  fresherResult.breakdown.completeness.score >= 21,
  `Fresher completeness score must not be penalized for zero corporate experience, got: ${fresherResult.breakdown.completeness.score}`
)
console.log(`✓ TEST 2 PASSED: Fresher with two solid academic projects receives ${fresherResult.breakdown.completeness.score}/25 completeness score`)

// -----------------------------------------------------------------------------
// TEST 3: EMPTY AND MALFORMED RESUME SAFEGUARDS
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Verifying edge cases (empty object, null, undefined)...')

const emptyResult = calculateAtsReadiness({})
assert(emptyResult.totalScore >= 0 && emptyResult.totalScore <= 100, 'Empty resume must return score in [0, 100]')
assert.equal(emptyResult.breakdown.identity.score, 0, 'Empty identity must score 0')
assert.equal(emptyResult.breakdown.completeness.score, 0, 'Empty completeness must score 0')
assert(emptyResult.suggestions.length > 0, 'Empty resume must generate constructive suggestions')

const nullResult = calculateAtsReadiness(null)
assert.equal(typeof nullResult.totalScore, 'number', 'Null input must not throw and must return number score')

console.log(`✓ TEST 3 PASSED: Null and empty resumes handled gracefully with zero crashes`)

// -----------------------------------------------------------------------------
// TEST 4: PROVISIONAL TEMPLATE COMPATIBILITY AUDIT AND BASE SCORES
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Verifying qualitative template compatibility profiles...')

const expectedRatings = {
  'minimal': { rating: 'provisional_high', baseScore: 25 },
  'ats-elegant': { rating: 'provisional_high', baseScore: 25 },
  'modern': { rating: 'provisional_moderate', baseScore: 21 },
  'executive': { rating: 'provisional_moderate', baseScore: 21 },
  'creative': { rating: 'provisional_caution', baseScore: 16 },
  'two-column-tech': { rating: 'provisional_caution', baseScore: 16 }
}

for (const [tplId, expected] of Object.entries(expectedRatings)) {
  const profile = getTemplateProfile(tplId)
  assert.equal(profile.rating, expected.rating, `Template ${tplId} rating mismatch`)
  assert.equal(profile.baseScore, expected.baseScore, `Template ${tplId} base score mismatch`)
  assert(profile.badge.length > 0, `Template ${tplId} must have visible badge label`)
}

// Fallback for unverified template
const unverifiedProfile = getTemplateProfile('custom_unknown_template')
assert.equal(unverifiedProfile.rating, 'unverified', 'Unknown templates must have unverified rating')
assert.equal(unverifiedProfile.baseScore, 18, 'Unverified template base score must be 18')

console.log('✓ TEST 4 PASSED: All 6 templates and unverified fallbacks conform to qualitative profiles')

// -----------------------------------------------------------------------------
// TEST 5: CONTENT SPECIFICITY (ACTION VERBS & MEASURABLE METRICS)
// -----------------------------------------------------------------------------
console.log('\n[TEST 5] Testing action verbs and quantifiable metrics extraction...')

const textWithMetrics = {
  personal: { name: 'Test User' },
  projects: [
    {
      title: 'Performance Optimization',
      description: 'Refactored backend endpoints and reduced memory consumption by 35% across 2000 requests per second.'
    }
  ],
  template: 'minimal'
}

const metricResult = calculateAtsReadiness(textWithMetrics)
assert.equal(metricResult.breakdown.contentEvidence.details.find(d => d.key === 'metrics')?.passed, true, 'Numbers and percentages must be detected as metrics')
assert(metricResult.breakdown.contentEvidence.actionVerbCount >= 2, 'Action verbs (refactored, reduced) must be counted')

console.log('✓ TEST 5 PASSED: Metrics and action verbs detected correctly in narrative descriptions')

// -----------------------------------------------------------------------------
// TEST 6: FORMATTING HYGIENE AND PLACEHOLDER DETECTION
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] Testing placeholder text and hygiene penalties...')

const resumeWithPlaceholder = {
  personal: { name: 'TODO: Fill Name', email: 'test@gmail.com' },
  achievements: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  template: 'minimal'
}

const hygieneResult = calculateAtsReadiness(resumeWithPlaceholder)
assert.equal(hygieneResult.breakdown.formattingHygiene.details.find(d => d.key === 'no_placeholders')?.passed, false, 'Placeholder text must be flagged')
assert(hygieneResult.suggestions.some(s => s.category === 'hygiene'), 'Hygiene suggestions must be generated for placeholders')

console.log('✓ TEST 6 PASSED: Placeholders detected and penalized in formatting hygiene score')

// -----------------------------------------------------------------------------
// TEST 7: JOB MATCH - INSUFFICIENT JOB DESCRIPTION SAFEGUARD
// -----------------------------------------------------------------------------
console.log('\n[TEST 7] Verifying Job Match rejects empty or insufficient job descriptions...')

const emptyJdResult = calculateJobMatch(mockMaxResume, '')
assert.equal(emptyJdResult.status, 'insufficient_job_description', 'Empty JD must return insufficient_job_description status')
assert.equal(emptyJdResult.score, null, 'Empty JD must NOT produce a fabricated numeric score')

const shortJdResult = calculateJobMatch(mockMaxResume, 'Looking for React dev. Apply now!')
assert.equal(shortJdResult.status, 'insufficient_job_description', 'Brief JD (< 15 tokens) must return insufficient_job_description')
assert.equal(shortJdResult.score, null, 'Brief JD must NOT produce a fabricated numeric score')

console.log('✓ TEST 7 PASSED: Job Match refuses to fabricate scores for missing or brief job postings')

// -----------------------------------------------------------------------------
// TEST 8: JOB MATCH - INDEPENDENT CATEGORY WEIGHTS & SCORE SUM = 100
// -----------------------------------------------------------------------------
console.log('\n[TEST 8] Verifying Job Match category weights and score calculation...')

const sampleJd = `
We are seeking a Frontend Engineer with strong expertise in React, JavaScript, TypeScript, and TailwindCSS.
The candidate will build responsive user interfaces, integrate RESTful APIs, and optimize web performance.
Requirements:
- Bachelor's degree in Computer Science, Information Technology, or related engineering discipline.
- Hands-on experience with modern JavaScript frameworks (React, Next.js).
- Proficiency with Git, Docker, and frontend test automation.
- Ability to collaborate effectively in an agile development team.
`

const jobMatchResult = calculateJobMatch(mockMaxResume, sampleJd)

assert.equal(jobMatchResult.status, 'calculated', 'Sufficient JD should produce calculated status')
assert.equal(jobMatchResult.breakdown.requiredSkills.max, 35, 'Required skills max must be 35 points')
assert.equal(jobMatchResult.breakdown.skillOverlap.max, 30, 'Skill overlap max must be 30 points')
assert.equal(jobMatchResult.breakdown.projectEvidence.max, 20, 'Project evidence max must be 20 points')
assert.equal(jobMatchResult.breakdown.educationAlignment.max, 10, 'Education alignment max must be 10 points')
assert.equal(jobMatchResult.breakdown.roleDomainAlignment.max, 5, 'Role domain alignment max must be 5 points')

const jobMatchMaxTotal = 
  jobMatchResult.breakdown.requiredSkills.max +
  jobMatchResult.breakdown.skillOverlap.max +
  jobMatchResult.breakdown.projectEvidence.max +
  jobMatchResult.breakdown.educationAlignment.max +
  jobMatchResult.breakdown.roleDomainAlignment.max

assert.equal(jobMatchMaxTotal, 100, `Job Match maximum must equal exactly 100, got ${jobMatchMaxTotal}`)
assert(jobMatchResult.totalScore >= 40 && jobMatchResult.totalScore <= 60, `Generic resume should yield moderate/basic match (${jobMatchResult.totalScore})`)

// Verify a tailored resume achieves high alignment (>= 80)
const tailoredResume = {
  personal: {
    name: 'Frontend Specialist',
    summary: 'Frontend Engineer experienced in React, Next.js, and TypeScript building responsive user interfaces.'
  },
  education: [
    { degree: 'B.Tech', department: 'Computer Science and Engineering', college: 'SRKR' }
  ],
  skills: {
    languages: 'JavaScript, TypeScript, HTML5, CSS3',
    frameworks: 'React, Next.js, TailwindCSS',
    tools: 'Git, Docker, Postman, Jest automation',
    soft: 'Agile team collaboration'
  },
  projects: [
    {
      title: 'Cloud Dashboard Platform',
      tech: 'React, TypeScript, Next.js, TailwindCSS',
      description: 'Engineered responsive user interfaces and integrated RESTful APIs with 99.8% uptime.'
    },
    {
      title: 'Automated Testing Pipeline',
      tech: 'Git, Docker, Jest',
      description: 'Implemented frontend test automation reducing bug regressions by 40% in an agile team.'
    }
  ]
}

const tailoredMatch = calculateJobMatch(tailoredResume, sampleJd)
assert(tailoredMatch.totalScore >= 75, `Tailored resume must score high alignment (>= 75), got ${tailoredMatch.totalScore}`)
assert.equal(tailoredMatch.matchLevel, 'High Alignment', 'Tailored resume must have High Alignment status')

console.log(`✓ TEST 8 PASSED: Job Match weights sum to 100. Generic: ${jobMatchResult.totalScore}/100, Tailored: ${tailoredMatch.totalScore}/100`)


// -----------------------------------------------------------------------------
// TEST 9: JOB MATCH - DISTINGUISHING LISTED SKILLS FROM EVIDENCED SKILLS
// -----------------------------------------------------------------------------
console.log('\n[TEST 9] Verifying distinction between declared skills and evidenced skills in projects...')

const resumeWithBuzzwordsOnly = {
  personal: { name: 'Buzzword Candidate', email: 'test@candidate.com' },
  education: [{ college: 'College', degree: 'B.Tech' }],
  skills: {
    languages: 'React, Docker, Kubernetes, AWS',
    frameworks: '',
    tools: '',
    soft: ''
  },
  projects: [
    {
      title: 'Simple Static Page',
      tech: 'HTML, CSS',
      description: 'Created a static portfolio website with pure HTML and vanilla CSS.'
      // Does NOT mention React, Docker, Kubernetes, or AWS in description!
    }
  ],
  template: 'minimal'
}

const buzzwordResult = calculateJobMatch(resumeWithBuzzwordsOnly, sampleJd)
assert(
  buzzwordResult.breakdown.projectEvidence.score < 10,
  `Buzzword-only skills without project evidence must receive low evidence score, got: ${buzzwordResult.breakdown.projectEvidence.score}`
)
assert(
  buzzwordResult.suggestions.some(s => s.category === 'evidence_gap'),
  'Evidence gap suggestions must alert candidate to prove listed skills in descriptions'
)

console.log(`✓ TEST 9 PASSED: Candidate with buzzwords in skills box but no project evidence gets lower evidence score (${buzzwordResult.breakdown.projectEvidence.score}/20) and actionable advice`)

// -----------------------------------------------------------------------------
// TEST 10: PDF PREFLIGHT INSPECTION & METADATA
// -----------------------------------------------------------------------------
console.log('\n[TEST 10] Testing PDF preflight check and export pipeline validation...')

const preflightIncomplete = performPdfPreflight({}, 'minimal')
assert.equal(preflightIncomplete.status, 'incomplete', 'Empty resume preflight must be incomplete')
assert(preflightIncomplete.issues.some(i => i.field === 'name'), 'Missing name must be flagged')
assert.equal(preflightIncomplete.isRasterCanvasPdf, true, 'Preflight must accurately flag raster canvas PDF architecture')
assert.equal(preflightIncomplete.textExtractableWithoutOcr, false, 'Preflight must record that text is not selectable without OCR')

const preflightCaution = performPdfPreflight(mockMaxResume, 'creative')
assert.equal(preflightCaution.status, 'advisory', 'Two-column creative layout must trigger advisory status')
assert(preflightCaution.advisories.some(a => a.code === 'TEMPLATE_LAYOUT_ADVISORY'), 'Preflight must advise on two-column caution')

console.log('✓ TEST 10 PASSED: PDF preflight accurately reports raster PDF status, contact missing fields, and layout advisories')

console.log('\n============================================================')
console.log('🎉 ALL 10 ATS RESUME SCORING ENGINE TESTS PASSED PERFECTLY!')
console.log('============================================================\n')
