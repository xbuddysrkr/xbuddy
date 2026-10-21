import assert from 'node:assert/strict'
import {
  calculateAtsReadiness,
  calculateJobMatch,
  getTemplateProfile,
  performPdfPreflight,
  generateScoreSuggestions,
  extractSkillsList,
  tokenizeText,
  textContainsSkill,
  normalizeCanonicalSkill,
  CANONICAL_ALIASES,
  TEMPLATE_PROFILES
} from '../src/resume-builder/scoring/atsEngine.js'

console.log('--- STARTING XBUDDY EVIDENCE-BASED ATS RESUME SCORING ENGINE TEST SUITE ---')

// =============================================================================
// SCENARIO 1: COMPLETELY EMPTY RESUME
// =============================================================================
console.log('\n[SCENARIO 1] Completely empty resume...')
const emptyResume = {}
const emptyResult = calculateAtsReadiness(emptyResume)

assert(emptyResult.totalScore >= 0 && emptyResult.totalScore <= 100, 'Score must be in [0, 100]')
assert.equal(emptyResult.breakdown.identity.score, 0, 'Identity score must be 0 for empty resume')
assert.equal(emptyResult.breakdown.completeness.score, 0, 'Completeness score must be 0 for empty resume')
assert.equal(emptyResult.breakdown.skillsRelevance.score, 0, 'Skills relevance must be 0 for empty resume')
assert.equal(emptyResult.breakdown.contentEvidence.score, 0, 'Evidence score must be 0 for empty resume')
assert(emptyResult.suggestions.length >= 3, 'Must provide clear actionable suggestions for missing sections')
assert.equal(emptyResult.ratingLabel, 'Needs Improvement')
console.log(`✓ Scenario 1 Passed: Empty resume scores ${emptyResult.totalScore}/100 with actionable suggestions`)

// =============================================================================
// SCENARIO 2: RESUME WITH PLACEHOLDER-ONLY CONTENT
// =============================================================================
console.log('\n[SCENARIO 2] Resume with placeholder-only content...')
const placeholderResume = {
  personal: {
    name: 'Your Name',
    email: 'example@example.com',
    phone: '0000000000',
    location: 'City, Country'
  },
  education: [
    { college: 'College Name', degree: 'Degree Name', department: 'Department' }
  ],
  skills: { languages: 'Lorem ipsum', frameworks: 'TODO', tools: 'Placeholder', soft: '' },
  projects: [
    { title: 'Project Title', description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' }
  ],
  experience: [],
  template: 'minimal'
}

const placeholderResult = calculateAtsReadiness(placeholderResume)
assert.equal(placeholderResult.breakdown.identity.details.find(d => d.key === 'name')?.passed, false, 'Placeholder name must be rejected')
assert.equal(placeholderResult.breakdown.identity.details.find(d => d.key === 'email')?.passed, false, 'Placeholder email must be rejected')
assert.equal(placeholderResult.breakdown.identity.details.find(d => d.key === 'phone')?.passed, false, 'Placeholder phone must be rejected')
assert.equal(placeholderResult.breakdown.formattingHygiene.details.find(d => d.key === 'no_placeholders')?.passed, false, 'Placeholder hygiene rule must fail')
assert(placeholderResult.totalScore < 30, `Placeholder resume should score very low (<30), got ${placeholderResult.totalScore}`)
console.log(`✓ Scenario 2 Passed: Placeholders rejected across all categories (Score: ${placeholderResult.totalScore}/100)`)

// =============================================================================
// SCENARIO 3: BEGINNER / FRESHER WITH SUBSTANTIAL ACADEMIC PROJECTS & NO EXPERIENCE
// =============================================================================
console.log('\n[SCENARIO 3] Beginner/fresher with substantial academic projects but no employment history...')
const fresherAcademicResume = {
  personal: {
    name: 'Kavya Varma',
    email: 'kavya.varma@srkr.ac.in',
    phone: '9848098480',
    location: 'Bhimavaram, Andhra Pradesh',
    github: 'https://github.com/kavya-srkr'
  },
  education: [
    { college: 'SRKR Engineering College', degree: 'B.Tech', department: 'Computer Science and Engineering', year: '2026' }
  ],
  skills: {
    languages: 'Java, Python, SQL',
    frameworks: 'Spring Boot, React',
    tools: 'Git, Docker, VS Code',
    soft: 'Team Collaboration, Problem Solving'
  },
  projects: [
    {
      title: 'Autonomous Campus Print Station',
      tech: 'React, Node.js, SQLite',
      description: 'Architected and deployed an autonomous campus print kiosk serving 500+ students daily with queue latency under 50ms.'
    },
    {
      title: 'Smart Lab Attendance System',
      tech: 'Python, OpenCV, Flask',
      description: 'Developed an automated face-recognition attendance pipeline in a team of 4 members with 94% detection accuracy.'
    }
  ],
  experience: [], // ZERO corporate experience
  certifications: [],
  template: 'minimal'
}

const fresherAcademicResult = calculateAtsReadiness(fresherAcademicResume)
assert.equal(
  fresherAcademicResult.breakdown.completeness.details.find(d => d.key === 'projects_experience')?.passed,
  true,
  'Two substantive academic projects must fully satisfy projects/experience requirements'
)
assert.equal(
  fresherAcademicResult.breakdown.completeness.score,
  20,
  'Fresher with substantive projects and college education must receive full 20/20 completeness score'
)
assert(
  fresherAcademicResult.totalScore >= 85,
  `Substantive fresher resume must achieve ATS Ready rating (>=85), got ${fresherAcademicResult.totalScore}`
)
assert.equal(fresherAcademicResult.ratingLabel, 'ATS Ready')
console.log(`✓ Scenario 3 Passed: Fresher with academic projects treated 100% fairly (Score: ${fresherAcademicResult.totalScore}/100, Completeness: 20/20)`)

// =============================================================================
// SCENARIO 4: WELL-STRUCTURED FRESHER RESUME WITH MEANINGFUL PROJECTS & SKILLS
// =============================================================================
console.log('\n[SCENARIO 4] Well-structured fresher resume with meaningful projects and relevant skills...')
const wellStructuredFresher = {
  personal: {
    name: 'Sai Jagadeesh',
    email: 'jagadeesh@srkr.edu.in',
    phone: '+91 9988776655',
    location: 'Bhimavaram',
    linkedin: 'https://linkedin.com/in/sai-jagadeesh',
    github: 'https://github.com/sai-j'
  },
  education: [
    { college: 'SRKR Engineering College', degree: 'B.Tech', department: 'Information Technology', cgpa: '8.8', year: '2026' }
  ],
  skills: {
    languages: 'JavaScript, TypeScript, Python',
    frameworks: 'React, Next.js, TailwindCSS',
    tools: 'Git, Docker, Postman, Linux',
    soft: 'Agile development, Peer Code Reviews'
  },
  projects: [
    {
      title: 'NextGen Student Kiosk Portal',
      tech: 'React, TypeScript, TailwindCSS',
      description: 'Engineered a real-time reactive order dashboard handling 1200+ print jobs with 99.9% uptime in a team of 3.'
    },
    {
      title: 'Document PDF Parser Pipeline',
      tech: 'Python, FastAPI, Docker',
      description: 'Built a high-throughput binary PDF page analyzer and pricing calculator reducing document preparation time by 60%.'
    }
  ],
  experience: [],
  achievements: 'Secured 1st place in Annual College Hackathon 2025.',
  template: 'ats-elegant'
}

const structuredResult = calculateAtsReadiness(wellStructuredFresher)
assert(structuredResult.totalScore >= 90, `Well-structured fresher resume must score >= 90, got ${structuredResult.totalScore}`)
assert.equal(structuredResult.breakdown.identity.score, 10, 'Identity must score 10/10')
assert.equal(structuredResult.breakdown.completeness.score, 20, 'Completeness must score 20/20')
assert.equal(structuredResult.breakdown.skillsRelevance.score, 15, 'Skills relevance must score 15/15')
assert.equal(structuredResult.breakdown.formattingHygiene.score, 15, 'Formatting hygiene must score 15/15')
console.log(`✓ Scenario 4 Passed: Well-structured fresher resume scores ${structuredResult.totalScore}/100`)

// =============================================================================
// SCENARIO 5: EXPERIENCED CANDIDATE WITH MEANINGFUL EXPERIENCE & MEASURABLE ACCOMPLISHMENTS
// =============================================================================
console.log('\n[SCENARIO 5] Experienced candidate with corporate experience and measurable accomplishments...')
const experiencedResume = {
  personal: {
    name: 'Suresh Kumar',
    email: 'suresh.kumar@techcorp.com',
    phone: '9848011223',
    location: 'Hyderabad, India',
    linkedin: 'https://linkedin.com/in/suresh-k'
  },
  education: [
    { college: 'Andhra University', degree: 'B.Tech', department: 'Computer Science', year: '2020' }
  ],
  skills: {
    languages: 'Java, Go, SQL',
    frameworks: 'Spring Boot, Kubernetes',
    tools: 'Docker, AWS, Jenkins, Git',
    soft: 'Engineering Management, Mentorship'
  },
  experience: [
    {
      role: 'Senior Backend Engineer',
      company: 'TechCorp Solutions',
      startDate: '2022',
      endDate: '2026',
      description: 'Architected microservices processing 50000+ financial transactions per second on AWS. Reduced database latency by 45%.'
    },
    {
      role: 'Software Engineer',
      company: 'DataFlow Inc',
      startDate: '2020',
      endDate: '2022',
      description: 'Automated CI/CD deployment pipelines using Docker and Jenkins, decreasing release rollback frequency by 30%.'
    }
  ],
  projects: [],
  certifications: [
    { course: 'AWS Certified Solutions Architect', platform: 'Amazon Web Services', year: '2023' }
  ],
  template: 'executive'
}

const experiencedResult = calculateAtsReadiness(experiencedResume)
assert(experiencedResult.totalScore >= 95, `Experienced candidate should achieve >= 95, got ${experiencedResult.totalScore}`)
assert.equal(experiencedResult.breakdown.contentEvidence.score, 25, 'Measurable accomplishment statements must score 25/25')
console.log(`✓ Scenario 5 Passed: Experienced candidate scores ${experiencedResult.totalScore}/100 with full evidence credit`)

// =============================================================================
// SCENARIO 6: RESUME CONTAINING REPEATED KEYWORDS BUT LITTLE SUBSTANTIVE EVIDENCE
// =============================================================================
console.log('\n[SCENARIO 6] Resume containing repeated keywords / duplicate skills...')
const repeatedSkillsResume = {
  personal: { name: 'Keyword Spammer', email: 'spammer@gmail.com', phone: '9876543210', location: 'Hyderabad' },
  education: [{ college: 'Engineering College', degree: 'B.Tech', department: 'CSE' }],
  skills: {
    // Repeated and redundant aliases of the same skill: React, ReactJS, React.js, JS, JavaScript
    languages: 'JavaScript, JS, JavaScript, React, ReactJS, React.js',
    frameworks: 'React, ReactJS',
    tools: 'Git, Git, Git',
    soft: ''
  },
  projects: [
    {
      title: 'My Project',
      tech: 'React',
      description: 'React project made with React and JavaScript.' // 7 words, no action verb context, no metrics
    }
  ],
  experience: [],
  template: 'minimal'
}

const repeatedResult = calculateAtsReadiness(repeatedSkillsResume)
// Deduplication should ensure duplicate skills do not inflate score
assert(repeatedResult.breakdown.skillsRelevance.distinctSkillsCount <= 3, 'Aliases (React, ReactJS, React.js) must normalize to distinct canonical skills')
assert(repeatedResult.totalScore < 65, `Keyword spamming without substantive descriptions must yield lower score, got ${repeatedResult.totalScore}`)
console.log(`✓ Scenario 6 Passed: Duplicate keywords normalized and did not inflate score (Score: ${repeatedResult.totalScore}/100)`)

// =============================================================================
// SCENARIO 7: RESUME WITH COMPLETE CONTACT INFORMATION BUT POOR PROJECT DESCRIPTIONS
// =============================================================================
console.log('\n[SCENARIO 7] Complete contact info but poor project descriptions...')
const poorProjectResume = {
  personal: {
    name: 'Harish Chandra',
    email: 'harish@gmail.com',
    phone: '9848012345',
    location: 'Bhimavaram',
    linkedin: 'https://linkedin.com/in/harish',
    github: 'https://github.com/harish'
  },
  education: [{ college: 'SRKR Engineering College', degree: 'B.Tech', department: 'ECE' }],
  skills: { languages: 'C, Python', frameworks: '', tools: 'Git', soft: '' },
  projects: [
    { title: 'IoT Project', description: 'Did IoT project.' }, // Tiny, non-substantive
    { title: 'Web Page', description: 'Made a page.' }
  ],
  template: 'minimal'
}

const poorProjectResult = calculateAtsReadiness(poorProjectResume)
assert.equal(poorProjectResult.breakdown.identity.score, 10, 'Contact info is complete, scores 10/10')
assert(poorProjectResult.breakdown.completeness.score < 15, 'Trivial 3-word project descriptions must receive partial or low completeness')
assert(poorProjectResult.breakdown.contentEvidence.score <= 8, 'Zero measurable metrics or context must yield low evidence score')
assert(poorProjectResult.suggestions.some(s => s.category === 'completeness' || s.category === 'evidence'), 'Must suggest expanding descriptions')
console.log(`✓ Scenario 7 Passed: Insufficient descriptions penalized appropriately (Score: ${poorProjectResult.totalScore}/100)`)

// =============================================================================
// SCENARIO 8: RESUME WITH STRONG CONTENT BUT OPTIONAL CERTIFICATIONS MISSING
// =============================================================================
console.log('\n[SCENARIO 8] Strong content but optional certifications missing...')
const strongWithoutCerts = { ...wellStructuredFresher, certifications: [] }
const withCertsResult = calculateAtsReadiness(wellStructuredFresher)
const withoutCertsResult = calculateAtsReadiness(strongWithoutCerts)

assert.equal(
  withoutCertsResult.totalScore,
  withCertsResult.totalScore,
  'Missing optional certifications must not unfairly penalize a strong resume'
)
console.log(`✓ Scenario 8 Passed: Optional certifications do not cause arbitrary score penalty (Score: ${withoutCertsResult.totalScore}/100)`)

// =============================================================================
// SCENARIO 9: RESUME WITH MALFORMED DATES AND DUPLICATE TEXT
// =============================================================================
console.log('\n[SCENARIO 9] Malformed dates and duplicate text...')
const malformedDatesResume = {
  personal: { name: 'Ravi Teja', email: 'ravi@gmail.com', phone: '9848011223', location: 'Vijayawada' },
  education: [
    { college: 'College', degree: 'B.Tech', department: 'CSE', startYear: '2026', endYear: '2022' } // End precedes start!
  ],
  skills: { languages: 'Python', frameworks: '', tools: '', soft: '' },
  projects: [
    { title: 'Project A', description: 'Built an analytics dashboard.' },
    { title: 'Project B', description: 'Built an analytics dashboard.' } // Duplicate description!
  ],
  template: 'minimal'
}

const malformedResult = calculateAtsReadiness(malformedDatesResume)
assert.equal(malformedResult.breakdown.formattingHygiene.details.find(d => d.key === 'date_consistency')?.passed, false, 'Contradictory dates must be flagged')
assert.equal(malformedResult.breakdown.formattingHygiene.details.find(d => d.key === 'bullet_structure')?.passed, false, 'Duplicate description must be flagged')
assert(malformedResult.breakdown.formattingHygiene.score <= 8, 'Hygiene score must reflect date contradictions and duplicates')
console.log(`✓ Scenario 9 Passed: Date contradictions and duplicated descriptions penalized in hygiene (${malformedResult.breakdown.formattingHygiene.score}/15)`)

// =============================================================================
// SCENARIO 10: RESUME USING EACH OF THE SIX TEMPLATES
// =============================================================================
console.log('\n[SCENARIO 10] Testing score across all six resume templates...')
const allTemplateIds = ['minimal', 'ats-elegant', 'modern', 'executive', 'creative', 'two-column-tech']
const templateScores = {}

allTemplateIds.forEach(tplId => {
  const res = calculateAtsReadiness({ ...wellStructuredFresher, template: tplId })
  templateScores[tplId] = res.totalScore
  assert(res.totalScore >= 85, `Template ${tplId} must still retain ATS Ready score for great content, got ${res.totalScore}`)
})

// Verify that template change produces at most a mild 2-point difference (7 vs 5 in layout heuristics)
const scoreDiff = templateScores['minimal'] - templateScores['creative']
assert(scoreDiff >= 0 && scoreDiff <= 3, `Template change must not swing score by more than 3 points, got ${scoreDiff} points difference`)
console.log(`✓ Scenario 10 Passed: All 6 templates evaluated safely. Score difference is only ${scoreDiff} pts (Minimal: ${templateScores['minimal']}, Creative: ${templateScores['creative']})`)

// =============================================================================
// SCENARIO 11: JOB DESCRIPTION WITH RELEVANT REQUIRED SKILLS
// =============================================================================
console.log('\n[SCENARIO 11] Job description with relevant required skills...')
const fullStackJd = `
Senior Full Stack Developer
Requirements:
- Strong proficiency in React, Node.js, and TypeScript.
- Hands-on experience with SQL databases (PostgreSQL or SQLite) and Docker containerization.
- Knowledge of REST APIs and Git version control.
- Bachelor's degree in Computer Science or related field.
`

const matchScenario11 = calculateJobMatch(fresherAcademicResume, fullStackJd)
assert.equal(matchScenario11.status, 'calculated')
assert(matchScenario11.totalScore >= 55, `Candidate with matching React, Node.js, SQLite, Git should score well, got ${matchScenario11.totalScore}`)
assert(matchScenario11.matchedKeywords.includes('react'))
assert(matchScenario11.matchedKeywords.includes('node.js'))
console.log(`✓ Scenario 11 Passed: Technical requirements parsed and matched accurately (${matchScenario11.totalScore}/100)`)

// =============================================================================
// SCENARIO 12: JOB DESCRIPTION FILLED WITH GENERIC OR REPETITIVE TEXT
// =============================================================================
console.log('\n[SCENARIO 12] Job description filled with generic or repetitive non-technical text...')
const genericJd = `
Dynamic team player seeking a motivated self-starter to join a fast-paced environment.
We need passionate individuals who love collaborating and communicating effectively.
Great opportunity for hardworking candidates who want to work in an innovative company with high energy.
Apply today if you are enthusiastic, reliable, proactive, and ready to make an impact.
`

const genericMatch = calculateJobMatch(fresherAcademicResume, genericJd)
// Should reject or return low score with no fabricated match because there are no technical skills
assert(
  genericMatch.status === 'insufficient_job_description' || genericMatch.totalScore < 30,
  'Generic boilerplate JD must not produce high match score'
)
console.log(`✓ Scenario 12 Passed: Generic non-technical job description safely handled without false matches`)

// =============================================================================
// SCENARIO 13: JOB DESCRIPTION WITH MANDATORY REQUIREMENTS MISSING FROM RESUME
// =============================================================================
console.log('\n[SCENARIO 13] Job description with mandatory requirements missing from resume...')
const cloudArchitectJd = `
Cloud DevOps Architect
Required Qualifications:
- Mandatory 5+ years with Kubernetes, Terraform, and AWS.
- Must have deep experience in Golang and Microservices architecture.
- Hands-on CI/CD pipeline automation.
`

const missingReqMatch = calculateJobMatch(fresherAcademicResume, cloudArchitectJd)
assert(missingReqMatch.totalScore < 45, `Resume missing AWS, Kubernetes, Terraform, Golang must score low, got ${missingReqMatch.totalScore}`)
assert(missingReqMatch.missingKeywords.includes('kubernetes') || missingReqMatch.missingKeywords.includes('aws'))
assert(
  missingReqMatch.suggestions.some(s => s.category === 'missing_required_skills'),
  'Must explicitly suggest missing mandatory skills'
)
console.log(`✓ Scenario 13 Passed: Missing mandatory qualifications properly penalized and reported (Score: ${missingReqMatch.totalScore}/100)`)

// =============================================================================
// SCENARIO 14: RESUME LISTING SKILLS BUT WITH ZERO PROJECT EVIDENCE
// =============================================================================
console.log('\n[SCENARIO 14] Resume listing skills but containing zero narrative evidence in projects...')
const buzzwordsResume = {
  personal: { name: 'Buzzword Candidate', email: 'buzz@gmail.com', phone: '9848011223' },
  education: [{ college: 'SRKR', degree: 'B.Tech', department: 'IT' }],
  skills: { languages: 'React, Node.js, Docker, Kubernetes, AWS', frameworks: '', tools: '', soft: '' },
  projects: [
    {
      title: 'Simple Static Page',
      tech: 'HTML',
      description: 'Built a simple static HTML landing page without databases or backend services.'
    }
  ],
  template: 'minimal'
}

const buzzwordsMatch = calculateJobMatch(buzzwordsResume, fullStackJd)
assert(
  buzzwordsMatch.breakdown.projectEvidence.score < 10,
  `Skills declared in skills section without evidence in projects must receive low project evidence score, got ${buzzwordsMatch.breakdown.projectEvidence.score}/25`
)
assert(
  buzzwordsMatch.suggestions.some(s => s.category === 'evidence_gap'),
  'Must generate evidence gap suggestion'
)
console.log(`✓ Scenario 14 Passed: Declared skills without narrative evidence penalized in project evidence (${buzzwordsMatch.breakdown.projectEvidence.score}/25)`)

// =============================================================================
// SCENARIO 15: RESUME WITH GENUINE EVIDENCE OF RELEVANT SKILLS IN ACADEMIC PROJECTS
// =============================================================================
console.log('\n[SCENARIO 15] Resume with genuine evidence of relevant skills in academic projects...')
const evidencedStudentResume = {
  personal: { name: 'Evidence Prover', email: 'prover@srkr.edu', phone: '9848011223' },
  education: [{ college: 'SRKR', degree: 'B.Tech', department: 'CSE' }],
  skills: { languages: 'React, Node.js, TypeScript, SQL', frameworks: 'Express', tools: 'Git, Docker', soft: '' },
  projects: [
    {
      title: 'Campus Food Delivery Platform',
      tech: 'React, Node.js, TypeScript, SQL',
      description: 'Architected and deployed a multi-vendor canteen portal using React, Node.js, and SQL serving 800+ daily orders with Docker.'
    }
  ],
  template: 'minimal'
}

const evidencedMatch = calculateJobMatch(evidencedStudentResume, fullStackJd)
assert(
  evidencedMatch.breakdown.projectEvidence.score >= 18,
  `Genuine project evidence must receive high evidence credit, got ${evidencedMatch.breakdown.projectEvidence.score}/25`
)
assert(
  evidencedMatch.totalScore > buzzwordsMatch.totalScore,
  `Evidenced candidate (${evidencedMatch.totalScore}) must score higher than buzzword candidate (${buzzwordsMatch.totalScore})`
)
console.log(`✓ Scenario 15 Passed: Genuine academic project evidence scores ${evidencedMatch.breakdown.projectEvidence.score}/25`)

// =============================================================================
// INVARIANTS VERIFICATION
// =============================================================================
console.log('\n--- VERIFYING MANDATORY MATHEMATICAL & DETERMINISTIC INVARIANTS ---')

// Invariant 1: Exactly 100 Category Points for ATS Readiness
const atsMaxTotal = 
  emptyResult.breakdown.identity.max +
  emptyResult.breakdown.completeness.max +
  emptyResult.breakdown.skillsRelevance.max +
  emptyResult.breakdown.contentEvidence.max +
  emptyResult.breakdown.formattingHygiene.max +
  emptyResult.breakdown.structureLayout.max
assert.equal(atsMaxTotal, 100, `ATS Readiness category max must sum to exactly 100, got ${atsMaxTotal}`)

// Invariant 2: Exactly 100 Category Points for Job Match
assert.equal(
  matchScenario11.breakdown.requiredSkills.max +
  matchScenario11.breakdown.otherSkills.max +
  matchScenario11.breakdown.projectEvidence.max +
  matchScenario11.breakdown.educationAlignment.max +
  matchScenario11.breakdown.roleDomainAlignment.max,
  100,
  'Job Match category max must sum to exactly 100'
)

// Invariant 3: Determinism (Identical inputs produce identical scores)
const run1 = calculateAtsReadiness(fresherAcademicResume)
const run2 = calculateAtsReadiness(fresherAcademicResume)
assert.equal(run1.totalScore, run2.totalScore, 'Scoring must be 100% deterministic')
assert.deepEqual(run1.breakdown, run2.breakdown, 'Breakdowns must be identical across runs')

// Invariant 4: No Substring False Positives
assert.equal(textContainsSkill('I know JavaScript and React', 'Java'), false, 'Java must NOT match inside JavaScript')
assert.equal(textContainsSkill('I know Java and React', 'Java'), true, 'Java must match standalone Java')
assert.equal(textContainsSkill('Proficient with React and CSS', 'C'), false, 'C must NOT match inside React or CSS')
assert.equal(textContainsSkill('Proficient with C and Python', 'C'), true, 'C must match standalone C')

// Invariant 5: Deduplication & Canonical Aliases
assert.equal(normalizeCanonicalSkill('js'), 'javascript')
assert.equal(normalizeCanonicalSkill('reactjs'), 'react')
assert.equal(normalizeCanonicalSkill('btech'), 'bachelor of technology')
const extractedList = extractSkillsList(['React', 'ReactJS', 'React.js', 'JS', 'JavaScript'])
assert.equal(extractedList.length, 2, 'React aliases must deduplicate to 1, JS aliases to 1 (total 2)')

// Invariant 6: Suggestion Architecture
const generatedSuggestions = generateScoreSuggestions(emptyResume, emptyResult, matchScenario11)
assert(Array.isArray(generatedSuggestions), 'generateScoreSuggestions must return array')
assert(generatedSuggestions.length > 0, 'Suggestions must be generated')

// Invariant 7: PDF Preflight Reality
const preflight = performPdfPreflight(fresherAcademicResume, 'minimal')
assert.equal(preflight.isRasterCanvasPdf, true)
assert.equal(preflight.textExtractableWithoutOcr, false)

// Invariant 8: Adding irrelevant keywords must not improve Job Match
const irrelevantResume = {
  ...wellStructuredFresher,
  skills: {
    ...wellStructuredFresher.skills,
    languages: wellStructuredFresher.skills.languages + ', Chef, COBOL, Fortran, Pascal, UnrealEngine'
  }
}
const baseJmScore = calculateJobMatch(wellStructuredFresher, fullStackJd).totalScore
const irrelevantJmScore = calculateJobMatch(irrelevantResume, fullStackJd).totalScore
assert.equal(irrelevantJmScore, baseJmScore, 'Adding irrelevant keywords must NOT improve Job Match score')

// Invariant 9: Repeating an existing skill must not increase either score
const duplicatedSkillsResume = {
  ...wellStructuredFresher,
  skills: {
    languages: 'JavaScript, JavaScript, TypeScript, TypeScript, Python, Python',
    frameworks: 'React, React, Next.js, Next.js, TailwindCSS',
    tools: 'Git, Git, Docker, Docker',
    soft: 'Agile'
  }
}
const normalAts = calculateAtsReadiness(wellStructuredFresher).totalScore
const repeatedAts = calculateAtsReadiness(duplicatedSkillsResume).totalScore
const repeatedJm = calculateJobMatch(duplicatedSkillsResume, fullStackJd).totalScore
assert(repeatedAts <= normalAts, `Repeating skills must NOT increase ATS Readiness (${repeatedAts} <= ${normalAts})`)
assert.equal(repeatedJm, baseJmScore, `Repeating skills must NOT increase Job Match (${repeatedJm} == ${baseJmScore})`)

// Invariant 10: Removing meaningful project evidence must decrease ATS Readiness
const strippedEvidenceResume = {
  ...wellStructuredFresher,
  projects: [
    { title: 'Kiosk', tech: 'React', description: 'Did a project.' },
    { title: 'Parser', tech: 'Python', description: 'Made a parser.' }
  ]
}
const strippedAts = calculateAtsReadiness(strippedEvidenceResume).totalScore
assert(strippedAts < normalAts, `Removing meaningful project evidence must decrease ATS score (${strippedAts} < ${normalAts})`)

// Invariant 11: Valid project with technical details must score better on evidence than title-only project
const titleOnlyResume = {
  ...wellStructuredFresher,
  projects: [{ title: 'Kiosk Portal' }]
}
const titleOnlyAts = calculateAtsReadiness(titleOnlyResume)
const normalEvidenceScore = calculateAtsReadiness(wellStructuredFresher).breakdown.contentEvidence.score
assert(
  normalEvidenceScore > titleOnlyAts.breakdown.contentEvidence.score,
  `Detailed project evidence (${normalEvidenceScore}) must score higher than title-only (${titleOnlyAts.breakdown.contentEvidence.score})`
)

// Invariant 12: Adding a valid email must improve contact category without altering unrelated categories
const noEmailResume = {
  ...wellStructuredFresher,
  personal: { ...wellStructuredFresher.personal, email: '' }
}
const noEmailResult = calculateAtsReadiness(noEmailResume)
const withEmailResult = calculateAtsReadiness(wellStructuredFresher)
assert(withEmailResult.breakdown.identity.score > noEmailResult.breakdown.identity.score, 'Adding valid email must improve identity score')
assert.equal(
  withEmailResult.breakdown.completeness.score,
  noEmailResult.breakdown.completeness.score,
  'Adding email must NOT alter completeness score'
)
assert.equal(
  withEmailResult.breakdown.contentEvidence.score,
  noEmailResult.breakdown.contentEvidence.score,
  'Adding email must NOT alter content evidence score'
)

// Invariant 13: Template switching affects only layout score within documented limit (<= 2 pts)
const minTplAts = calculateAtsReadiness({ ...wellStructuredFresher, template: 'minimal' })
const creativeTplAts = calculateAtsReadiness({ ...wellStructuredFresher, template: 'creative' })
const tplDelta = minTplAts.totalScore - creativeTplAts.totalScore
assert(tplDelta >= 0 && tplDelta <= 2, `Template switch difference must be between 0 and 2 points, got ${tplDelta}`)
assert.equal(minTplAts.breakdown.identity.score, creativeTplAts.breakdown.identity.score)
assert.equal(minTplAts.breakdown.completeness.score, creativeTplAts.breakdown.completeness.score)
assert.equal(minTplAts.breakdown.contentEvidence.score, creativeTplAts.breakdown.contentEvidence.score)

// Invariant 14: ATS Readiness must remain independent of Job Match
const mobileResume = {
  personal: { name: 'Mobile Dev', email: 'mob@srkr.edu', phone: '9848011223', location: 'Hyderabad', linkedin: 'https://linkedin.com/in/mob' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2025' }],
  skills: { languages: 'Swift, Kotlin, Dart', frameworks: 'Flutter, SwiftUI', tools: 'Xcode, Android Studio, Git', soft: 'Agile' },
  projects: [
    { title: 'Banking App', tech: 'Swift, SwiftUI', description: 'Architected native iOS application handling 10000+ daily active users with 99.9% crash-free rate.' },
    { title: 'Chat App', tech: 'Flutter, Dart', description: 'Developed real-time chat application with encrypted messaging in a team of 4.' }
  ],
  template: 'minimal'
}
const mobileAts = calculateAtsReadiness(mobileResume)
const mobileJm = calculateJobMatch(mobileResume, fullStackJd)
assert(mobileAts.totalScore >= 90, `Mobile resume is high quality, ATS Readiness must be >= 90 (got ${mobileAts.totalScore})`)
assert(mobileJm.totalScore <= 20, `Mobile resume does not match Full Stack React/Node JD, Job Match must be <= 20 (got ${mobileJm.totalScore})`)

// Invariant 15: Every material deduction must correspond to an identifiable finding & actionable suggestion
const deductedResume = {
  personal: { name: 'Deducted User', phone: '9848011223' }, // missing email, links
  education: [], // missing education
  skills: { languages: 'JavaScript', frameworks: '', tools: '', soft: '' },
  projects: [] // missing projects
}
const deductedResult = calculateAtsReadiness(deductedResume)
assert(deductedResult.suggestions.some(s => s.category === 'identity' && s.field === 'email'), 'Missing email must yield targeted suggestion')
assert(deductedResult.suggestions.some(s => s.category === 'completeness' && s.section === 'Education'), 'Missing education must yield targeted suggestion')
assert(deductedResult.suggestions.some(s => s.category === 'completeness' && s.section === 'Projects'), 'Missing projects must yield targeted suggestion')

// =============================================================================
// SECTION 3: JOB MATCH EDGE CASES INSPECTION
// =============================================================================
console.log('\n--- VERIFYING JOB MATCH EDGE CASES ---')

// Edge Case 1: Java vs JavaScript
assert.equal(textContainsSkill('Proficient with JavaScript and NodeJS', 'Java'), false, 'Java must NOT match inside JavaScript')
assert.equal(textContainsSkill('Proficient with Java and Spring Boot', 'Java'), true, 'Java must match standalone Java')
assert.equal(textContainsSkill('Proficient with Java.', 'Java'), true, 'Java must match before sentence punctuation')

// Edge Case 2: C vs C++ and CSS
assert.equal(textContainsSkill('Styling done with CSS and TailwindCSS', 'C'), false, 'C must NOT match inside CSS')
assert.equal(textContainsSkill('Application built with React and Redux', 'C'), false, 'C must NOT match inside React')
assert.equal(textContainsSkill('Core algorithm implemented in C and Assembly', 'C'), true, 'C must match standalone C')
assert.equal(textContainsSkill('Core engine in C++, embedded scripts in C', 'c++'), true, 'C++ must match correctly with escaped pluses')

// Edge Case 3: React vs ReactJS and React.js
assert.equal(normalizeCanonicalSkill('React'), 'react')
assert.equal(normalizeCanonicalSkill('ReactJS'), 'react')
assert.equal(normalizeCanonicalSkill('React.js'), 'react')
const reactList = extractSkillsList(['React', 'ReactJS', 'React.js'])
assert.equal(reactList.length, 1, 'React, ReactJS, and React.js must resolve to a single canonical skill')
assert.equal(reactList[0], 'react')

// Edge Case 4: Node.js, punctuation, multiword skills, and aliases
assert.equal(textContainsSkill('Deployed microservices on Node.js runtime.', 'node.js'), true, 'Node.js must match with punctuation')
assert.equal(textContainsSkill('Experience with Spring Boot and Microservices.', 'spring boot'), true, 'Multiword skill "spring boot" must match')
assert.equal(textContainsSkill('Strong DSA and Problem Solving.', 'dsa'), true, 'DSA alias must match')
assert.equal(normalizeCanonicalSkill('dsa'), 'data structures & algorithms')
assert.equal(normalizeCanonicalSkill('next.js'), 'next.js')

// Edge Case 5: Duplicate and generic JD terms
const baseResume = wellStructuredFresher
const repetitiveJd = `
Job Title: Software Engineer - Full Stack Developer
Company: TechCorp Solutions
We are seeking an energetic team member with strong technical capabilities to join our engineering division.
Requirements:
- Python, Python, Python developer needed.
- Experience with Docker, Docker, Docker.
- Collaborative, motivated, fast-paced team player with excellent communication skills.
`
const repMatch = calculateJobMatch(baseResume, repetitiveJd)
assert.equal(repMatch.breakdown.requiredSkills.targetCount, 2, 'Repeated JD keywords (Python, Docker) must deduplicate to exactly 2 target skills')

// Edge Case 6: Mandatory skills missing from resume
const mandatoryMissingJd = `
Job Title: Cloud Infrastructure and Distributed Systems Engineer
Company: CloudScale Networks
We are looking for an experienced infrastructure engineer to design and maintain distributed services across multi-region clusters.
Requirements:
- Mandatory: Kubernetes, Rust, and GraphQL production experience.
- Experience designing scalable distributed architectures.
`
const mandMissMatch = calculateJobMatch(baseResume, mandatoryMissingJd)
assert.equal(mandMissMatch.breakdown.requiredSkills.matchedCount, 0, 'Zero matched skills must be reported')
assert.equal(mandMissMatch.breakdown.requiredSkills.score, 0, 'Required skills score must be 0')
assert(mandMissMatch.missingKeywords.includes('kubernetes'))
assert(mandMissMatch.missingKeywords.includes('rust'))
assert(mandMissMatch.missingKeywords.includes('graphql'))

// Edge Case 7: Skills present only in skills list vs skills demonstrated in projects
const listOnlyResume = {
  ...baseResume,
  skills: { languages: 'Python, SQL, Rust, Go, Scala', frameworks: 'Django', tools: 'Git, Docker' },
  projects: [{ title: 'Django Portal', tech: 'Python, Django', description: 'Engineered Django web service with authentication, database models, and unit testing.' }]
  // Rust, Go, Scala are only in the skills list, NOT in project descriptions
}
const rustGoJd = `
Job Title: Backend Systems Engineer
Company: High Throughput Systems
We are building real-time data pipelines and backend microservices requiring low latency and high concurrency.
Requirements:
- Experience with Rust, Go, and Python.
- Understanding of concurrency models, memory safety, and database optimization.
`
const listOnlyMatch = calculateJobMatch(listOnlyResume, rustGoJd)
assert(listOnlyMatch.matchedKeywords.includes('rust'))
assert(listOnlyMatch.matchedKeywords.includes('go'))
assert(listOnlyMatch.evidencedKeywords.includes('python'))
assert(!listOnlyMatch.evidencedKeywords.includes('rust'), 'Rust must NOT be counted as evidenced in projects')
assert(!listOnlyMatch.evidencedKeywords.includes('go'), 'Go must NOT be counted as evidenced in projects')
assert(listOnlyMatch.suggestions.some(s => s.category === 'evidence_gap'), 'Must alert candidate of evidence gap for Rust/Go')

// Edge Case 8: Empty, generic, or too short job descriptions
assert.equal(calculateJobMatch(baseResume, '').status, 'not_calculated')
assert.equal(calculateJobMatch(baseResume, '   ').status, 'not_calculated')
assert.equal(calculateJobMatch(baseResume, 'Hiring dev. Apply now!').status, 'insufficient_job_description')

// Edge Case 9: Requirements that genuinely do not apply (degrees not in skill count)
const degreeJd = `
Job Title: Associate Software Developer
Company: Enterprise Systems
We are seeking entry-level software developers to maintain enterprise database applications.
Requirements:
- Must have Bachelor of Technology in Computer Science or Information Technology.
- Strong proficiency with Python and SQL database management.
- Ability to write clean, maintainable code in an agile team environment.
`
const degreeJdMatch = calculateJobMatch(baseResume, degreeJd)
// Technical requirements should only count Python and SQL as technical skills (targetCount = 2)
assert.equal(degreeJdMatch.breakdown.requiredSkills.targetCount, 2, 'Degrees must not be counted as technical skill requirements')
assert.equal(degreeJdMatch.breakdown.educationAlignment.score, 10, 'Degree is properly evaluated in education alignment')

console.log('✓ All Section 2 Invariants & Section 3 Edge Cases Verified Successfully!')

// =============================================================================
// SECTION 4: ROLE & DOMAIN ALIGNMENT REGRESSION SUITE (AUDIT REQUIREMENT 2)
// =============================================================================
console.log('\n--- VERIFYING ROLE & DOMAIN ALIGNMENT REGRESSION SUITE ---')

// 1. Clearly matching Full Stack candidate
const fullStackCandidate = {
  personal: { name: 'Full Stack Engineer', email: 'fs@dev.com', phone: '9848011223', summary: 'Senior Full Stack Developer with 4+ years building cloud-native web applications' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2021' }],
  skills: { languages: 'JavaScript, TypeScript, SQL', frameworks: 'React, Node.js', tools: 'Docker, Git', soft: 'Agile' },
  experience: [{ role: 'Full Stack Developer', company: 'TechCorp', description: 'Engineered web applications with React, Node.js, and PostgreSQL.' }]
}
const fsMatch = calculateJobMatch(fullStackCandidate, fullStackJd)
assert.equal(fsMatch.breakdown.roleDomainAlignment.score, 5, 'Exact Full Stack Developer must score 5/5 on roleDomainAlignment')

// 2. Related web-development candidate
const webDevCandidate = {
  personal: { name: 'Frontend Web Dev', email: 'web@dev.com', phone: '9848011223' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'IT', year: '2022' }],
  skills: { languages: 'JavaScript, HTML, CSS, SQL', frameworks: 'React', tools: 'Git', soft: '' },
  experience: [{ role: 'Frontend Web Developer', company: 'WebAgency', description: 'Developed responsive user interfaces with React, HTML, and CSS.' }]
}
const webMatch = calculateJobMatch(webDevCandidate, fullStackJd)
assert.equal(webMatch.breakdown.roleDomainAlignment.score, 3, 'Related web-development candidate must score 3/5 on roleDomainAlignment')

// 3. Unrelated iOS/mobile candidate
const iosCandidate = {
  personal: { name: 'iOS Mobile Dev', email: 'ios@apple.com', phone: '9848011223' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'ECE', year: '2022' }],
  skills: { languages: 'Swift, Objective-C', frameworks: 'SwiftUI', tools: 'Xcode', soft: '' },
  experience: [{ role: 'iOS Mobile Developer', company: 'AppStudio', description: 'Architected native iOS mobile applications using Swift and Xcode.' }]
}
const iosMatch = calculateJobMatch(iosCandidate, fullStackJd)
assert.equal(iosMatch.breakdown.roleDomainAlignment.score, 1, 'Unrelated iOS mobile developer must NOT score 5/5 for Full Stack role (must be 1/5)')
assert(iosMatch.suggestions.some(s => s.category === 'role_alignment'), 'Must suggest role alignment for unrelated mobile candidate')

// 4. Unrelated/adjacent backend candidate
const backendCandidate = {
  personal: { name: 'Backend Specialist', email: 'backend@dev.com', phone: '9848011223' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2020' }],
  skills: { languages: 'Java, Go, SQL', frameworks: 'Spring Boot', tools: 'Docker, Kubernetes', soft: '' },
  experience: [{ role: 'Senior Backend Engineer', company: 'CloudCorp', description: 'Architected distributed Java microservices and relational database pipelines.' }]
}
const backendMatch = calculateJobMatch(backendCandidate, fullStackJd)
assert.equal(backendMatch.breakdown.roleDomainAlignment.score, 3, 'Backend candidate applying to Full Stack receives 3/5 (adjacent domain)')

// 5. Resume whose job title is missing but projects show relevant technical work
const missingTitleCandidate = {
  personal: { name: 'Student Developer', email: 'student@srkr.edu', phone: '9848011223' },
  education: [{ college: 'SRKR Engineering College', degree: 'B.Tech', department: 'CSE', year: '2025' }],
  skills: { languages: 'JavaScript, TypeScript, SQL', frameworks: 'React, Node.js', tools: 'Docker, Git', soft: '' },
  projects: [{ title: 'Campus Automated Print Kiosk Portal', tech: 'React, Node.js, SQLite', description: 'Engineered print kiosk web portal with React, Node.js, SQLite.' }],
  experience: []
}
const missingTitleMatch = calculateJobMatch(missingTitleCandidate, fullStackJd)
assert.equal(missingTitleMatch.breakdown.roleDomainAlignment.score, 1, 'Missing job title / summary must score baseline 1/5 with guidance')
assert(missingTitleMatch.suggestions.some(s => s.category === 'role_alignment'), 'Must suggest candidate specify target role or summary')
assert(missingTitleMatch.breakdown.requiredSkills.score > 0, 'Technical project work must still be credited in required skills')
assert(missingTitleMatch.breakdown.projectEvidence.score > 0, 'Technical project work must still be credited in project evidence')

console.log('✓ All 5 Role & Domain Alignment Regression Tests Passed!')

// =============================================================================
// SECTION 5: REALISTIC BORDERLINE RESUMES REGRESSION SUITE (AUDIT REQUIREMENT 3)
// =============================================================================
console.log('\n--- VERIFYING REALISTIC BORDERLINE RESUMES REGRESSION SUITE ---')

// Borderline 1: Detailed, technically credible projects without quantified metrics
const technicalNoMetricsResume = {
  personal: { name: 'Tech No Metrics', email: 'tech@srkr.edu', phone: '9848011223', location: 'Bhimavaram' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2025' }],
  skills: { languages: 'JavaScript, TypeScript, Python, SQL', frameworks: 'React, Node.js', tools: 'Git, Docker', soft: 'Agile' },
  projects: [
    {
      title: 'Automated Print Kiosk Portal',
      tech: 'React, Node.js, PostgreSQL',
      description: 'Architected and engineered a web application for campus kiosk stations using React front-end components and Node.js microservices with PostgreSQL persistence.'
    },
    {
      title: 'Distributed Log Aggregator',
      tech: 'Python, Docker',
      description: 'Developed and implemented asynchronous log processing daemons that ingest server system logs and stream structured events to central storage.'
    }
  ],
  experience: [],
  template: 'minimal'
}
const techNoMetricsResult = calculateAtsReadiness(technicalNoMetricsResume)
assert.equal(techNoMetricsResult.breakdown.contentEvidence.score, 14, 'Action verbs without metrics must earn 14/25 in evidence (14 actions + 0 metrics)')
assert(techNoMetricsResult.suggestions.some(s => s.id === 'sug_ev_metrics'), 'Must advise adding measurable outcomes')

// Borderline 2: Metrics-heavy descriptions that lack meaningful technical specifics
const metricsNoTechResume = {
  personal: { name: 'Metrics No Tech', email: 'metrics@srkr.edu', phone: '9848011223', location: 'Bhimavaram' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2025' }],
  skills: { languages: 'C, Java', frameworks: '', tools: '', soft: 'Communication' },
  projects: [
    {
      title: 'Efficiency Project',
      tech: '',
      description: 'Improved operational speed by 40% and served 500+ users across the campus network with 99% satisfaction.'
    }
  ],
  experience: [],
  template: 'minimal'
}
const metricsNoTechResult = calculateAtsReadiness(metricsNoTechResume)
assert(metricsNoTechResult.breakdown.skillsRelevance.score <= 6, 'Generic skills must score low on skills relevance')
assert(metricsNoTechResult.breakdown.completeness.score < 20, 'Missing tech and short project details must be penalized in completeness')

// Borderline 3: Relevant skills in skills list but little supporting evidence
const buzzwordBorderlineResume = {
  personal: { name: 'Buzzword Borderline', email: 'buzz@srkr.edu', phone: '9848011223' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'IT', year: '2025' }],
  skills: { languages: 'React, Node.js, TypeScript, PostgreSQL, Docker, Kubernetes', frameworks: '', tools: 'Git', soft: '' },
  projects: [
    {
      title: 'Classroom Website',
      tech: 'HTML',
      description: 'Created basic static HTML web pages for classroom announcements and event updates.'
    }
  ],
  experience: [],
  template: 'minimal'
}
const buzzMatch = calculateJobMatch(buzzwordBorderlineResume, fullStackJd)
assert.equal(buzzMatch.breakdown.projectEvidence.score, 0, 'Declared skills without project narrative evidence must receive 0/25 project evidence')
assert(buzzMatch.suggestions.some(s => s.category === 'evidence_gap'), 'Must warn candidate of evidence gap')

// Borderline 4: Good technical work with incomplete optional fields
const goodWorkNoOptionalsResume = {
  ...wellStructuredFresher,
  personal: { name: 'K. Sai Varma', email: 'sai@srkr.edu', phone: '9848012345', location: 'Bhimavaram' },
  certifications: [],
  achievements: ''
}
const goodWorkResult = calculateAtsReadiness(goodWorkNoOptionalsResume)
assert(goodWorkResult.totalScore >= 90, `Incomplete optional fields must not heavily penalize solid resume (got ${goodWorkResult.totalScore})`)
assert.equal(goodWorkResult.breakdown.completeness.score, 20, 'Completeness remains 20/20 when core sections are substantive')

// Borderline 5: Strong fresher resume with no employment history
const strongFresherResult = calculateAtsReadiness(wellStructuredFresher)
assert.equal(strongFresherResult.breakdown.completeness.score, 20, 'Fresher with 2 substantive projects receives full 20/20 completeness')
assert.equal(strongFresherResult.totalScore, 100, 'Fresher with flawless projects receives 100/100 without employment history penalty')

// Borderline 6: Polished formatting but weak generic descriptions
const polishedWeakResume = {
  personal: { name: 'Polished Weak', email: 'pw@srkr.edu', phone: '9848011223', location: 'Bhimavaram', github: 'https://github.com/pw', linkedin: 'https://linkedin.com/in/pw' },
  education: [{ college: 'SRKR College', degree: 'B.Tech', department: 'CSE', year: '2025' }],
  skills: { languages: 'C, Python', frameworks: '', tools: '', soft: 'Teamwork' },
  projects: [
    { title: 'Student Management', tech: 'Python', description: 'A student project for class records management.' },
    { title: 'Web App', tech: 'HTML', description: 'Simple web app for student practice.' }
  ],
  experience: [],
  template: 'minimal'
}
const polishedWeakResult = calculateAtsReadiness(polishedWeakResume)
assert(polishedWeakResult.totalScore <= 70, `Weak descriptions must not be masked by good contact info (got ${polishedWeakResult.totalScore})`)
assert.equal(polishedWeakResult.breakdown.contentEvidence.score, 0, 'No action verbs or metrics must yield 0/25 evidence score')

// Borderline 7: Qualified resume with one genuine consistency problem
const qualifiedDateInversionResume = {
  ...wellStructuredFresher,
  experience: [
    {
      role: 'Software Intern',
      company: 'TechCorp Solutions',
      startDate: '2026',
      endDate: '2022',
      description: 'Engineered backend microservices and REST APIs handling 500+ daily queries.'
    }
  ]
}
const qualifiedResult = calculateAtsReadiness(qualifiedDateInversionResume)
assert.equal(qualifiedResult.breakdown.formattingHygiene.score, 12, 'Date contradiction must deduct 3 points from hygiene (12/15)')
assert(qualifiedResult.suggestions.some(s => s.id === 'sug_hy_dates'), 'Must provide actionable suggestion to fix inverted dates')

console.log('✓ All 7 Realistic Borderline Resumes Verified Successfully!')

// =============================================================================
// SECTION 6: RIGOROUS EXECUTABLE INVARIANTS (AUDIT REQUIREMENT 4)
// =============================================================================
console.log('\n--- VERIFYING RIGOROUS EXECUTABLE INVARIANTS ---')

// Invariant A: Scores remain integers between 0 and 100
const testFixtures = [
  emptyResume, placeholderResume, repeatedSkillsResume, poorProjectResume,
  fresherAcademicResume, wellStructuredFresher, experiencedResume, malformedDatesResume,
  technicalNoMetricsResume, metricsNoTechResume, polishedWeakResume
]
testFixtures.forEach((fix, idx) => {
  const ats = calculateAtsReadiness(fix)
  assert(Number.isInteger(ats.totalScore), `ATS score for fixture ${idx} must be an integer, got ${ats.totalScore}`)
  assert(ats.totalScore >= 0 && ats.totalScore <= 100, `ATS score for fixture ${idx} must be in [0, 100], got ${ats.totalScore}`)
  
  const jm = calculateJobMatch(fix, fullStackJd)
  if (jm.status === 'calculated') {
    assert(Number.isInteger(jm.totalScore), `Job Match score for fixture ${idx} must be an integer, got ${jm.totalScore}`)
    assert(jm.totalScore >= 0 && jm.totalScore <= 100, `Job Match score for fixture ${idx} must be in [0, 100], got ${jm.totalScore}`)
  }
})

// Invariant B: Project evidence removal cannot improve ATS Readiness or project-evidence alignment
const normalJm = calculateJobMatch(wellStructuredFresher, fullStackJd)
const strippedJm = calculateJobMatch(strippedEvidenceResume, fullStackJd)
assert(strippedJm.breakdown.projectEvidence.score <= normalJm.breakdown.projectEvidence.score,
  `Removing project evidence must NOT improve Job Match project evidence (${strippedJm.breakdown.projectEvidence.score} <= ${normalJm.breakdown.projectEvidence.score})`)

// Invariant C: Insufficient or weak JD returns documented non-calculated state
const emptyJdResult = calculateJobMatch(wellStructuredFresher, '')
assert.equal(emptyJdResult.status, 'not_calculated')
assert.equal(emptyJdResult.score, null)

const whitespaceJdResult = calculateJobMatch(wellStructuredFresher, '    \n\t  ')
assert.equal(whitespaceJdResult.status, 'not_calculated')
assert.equal(whitespaceJdResult.score, null)

const shortJdResult = calculateJobMatch(wellStructuredFresher, 'We need a React dev. Apply now!')
assert.equal(shortJdResult.status, 'insufficient_job_description')
assert.equal(shortJdResult.score, null)
assert(shortJdResult.message.includes('insufficient information'))

// Invariant D: Every material deduction has a corresponding explanation or finding
const partialResumes = [strippedEvidenceResume, noEmailResume, qualifiedDateInversionResume, titleOnlyResume]
partialResumes.forEach((pr, i) => {
  const res = calculateAtsReadiness(pr)
  const deductions = 100 - res.totalScore
  if (deductions > 0) {
    assert(res.suggestions.length > 0, `Resume ${i} with ${deductions} point deduction must have actionable suggestions`)
  }
})

console.log('✓ All Section 4 Invariant Assertions Passed Perfectly!')

console.log('\n============================================================')
console.log('🎉 ALL SUITES: SCENARIOS, DOMAIN REGRESSIONS, BORDERLINES & INVARIANTS PASSED!')
console.log('============================================================\n')
