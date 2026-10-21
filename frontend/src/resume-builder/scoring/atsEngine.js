/**
 * XBuddy Resume Studio - Deterministic Client-Side ATS Scoring Engine
 * 
 * Provides:
 * 1. calculateAtsReadiness(resume) - Evaluates formatting, structure, action verbs, evidence, and template compatibility (0-100)
 * 2. calculateJobMatch(resume, jobDescription) - Evaluates alignment against a target job description (0-100)
 * 3. getTemplateProfile(templateId) - Returns qualitative, provisional template ATS compatibility metadata
 * 4. performPdfPreflight(resume, templateId) - Evaluates PDF export readiness and document hygiene
 * 
 * Invariants:
 * - 100% deterministic, reproducible, client-side execution.
 * - Zero external API calls, zero secret keys, zero telemetry.
 * - Never fabricates qualifications or alters resume state.
 * - Beginner-friendly for students and freshers.
 */

// Common English and Job Description filler/boilerplate stop words
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in',
  'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
  'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t',
  'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s',
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t',
  'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves', 'will', 'shall',
  // Common JD Boilerplate & Non-Technical Filler Words
  'job', 'work', 'working', 'candidate', 'apply', 'role', 'team', 'responsibilities', 'requirements',
  'required', 'preferred', 'must', 'plus', 'years', 'experience', 'opportunity', 'company', 'looking',
  'description', 'join', 'ideal', 'skills', 'ability', 'abilities', 'seeking', 'build', 'building',
  'user', 'users', 'degree', 'bachelor', 'bachelors', 'master', 'masters', 'hands-on', 'strong',
  'modern', 'proficiency', 'proficient', 'collaborate', 'collaborating', 'effectively', 'agile',
  'development', 'related', 'discipline', 'disciplines', 'familiarity', 'knowledge', 'understanding',
  'demonstrated', 'excellent', 'verbal', 'written', 'communication', 'fast-paced', 'environment',
  'daily', 'position', 'applicant', 'level', 'high', 'good', 'great', 'equal', 'hire', 'hiring',
  'standard', 'practices', 'ensure', 'ensuring', 'deliver', 'delivering', 'help', 'across', 'well'
])

// Curated dictionary of high-impact action verbs (fresher and engineering friendly)
export const ACTION_VERBS = new Set([
  'accelerated', 'achieved', 'administered', 'analyzed', 'architected', 'automated',
  'built', 'calculated', 'centralized', 'championed', 'collaborated', 'compiled', 'completed',
  'composed', 'computed', 'conceptualized', 'conducted', 'configured', 'constructed', 'converted',
  'coordinated', 'created', 'customized', 'debugged', 'decreased', 'delivered', 'deployed',
  'designed', 'developed', 'devised', 'diagnosed', 'discovered', 'documented', 'doubled',
  'drafted', 'eliminated', 'engineered', 'enhanced', 'established', 'evaluated', 'executed',
  'expanded', 'expedited', 'fabricated', 'facilitated', 'finalized', 'formulated', 'generated',
  'guided', 'identified', 'implemented', 'improved', 'increased', 'initiated', 'inspected',
  'installed', 'instituted', 'integrated', 'invented', 'investigated', 'launched', 'led',
  'maintained', 'managed', 'mapped', 'maximized', 'mentored', 'migrated', 'minimized',
  'modernized', 'monitored', 'negotiated', 'obtained', 'operated', 'optimized', 'orchestrated',
  'organized', 'originated', 'overhauled', 'performed', 'piloted', 'pioneered', 'planned',
  'prepared', 'presented', 'produced', 'programmed', 'projected', 'promoted', 'published',
  'quantified', 'redesigned', 'reduced', 'refined', 'refactored', 'remodeled', 'reorganized',
  'replaced', 'researched', 'resolved', 'restructured', 'revamped', 'reviewed', 'revitalized',
  'saved', 'scheduled', 'secured', 'simplified', 'simulated', 'solved', 'standardized',
  'streamlined', 'strengthened', 'structured', 'supervised', 'synthesized', 'systematized',
  'tested', 'tracked', 'trained', 'transformed', 'transitioned', 'troubleshot', 'unified',
  'upgraded', 'validated', 'visualized'
])

// Known technical keywords, frameworks, and developer tools
export const KNOWN_TECH_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'golang', 'go', 'rust',
  'php', 'ruby', 'swift', 'kotlin', 'dart', 'scala', 'r', 'matlab', 'sql', 'nosql', 'html',
  'html5', 'css', 'css3', 'sass', 'tailwind', 'tailwindcss', 'bootstrap', 'react', 'react.js', 'next.js',
  'vue', 'vue.js', 'angular', 'svelte', 'node', 'node.js', 'express', 'express.js', 'django',
  'flask', 'fastapi', 'spring', 'spring boot', 'asp.net', '.net', 'laravel', 'graphql', 'rest',
  'restful', 'api', 'apis', 'mongodb', 'postgresql', 'postgres', 'mysql', 'sqlite', 'oracle',
  'redis', 'elasticsearch', 'firebase', 'supabase', 'aws', 'amazon web services', 'azure',
  'gcp', 'google cloud', 'docker', 'kubernetes', 'git', 'github', 'gitlab', 'ci/cd', 'jenkins',
  'linux', 'unix', 'bash', 'powershell', 'vite', 'webpack', 'figma', 'canva', 'postman',
  'selenium', 'jest', 'cypress', 'automation', 'testing', 'pandas', 'numpy', 'scikit-learn',
  'tensorflow', 'pytorch', 'machine learning', 'artificial intelligence', 'data structures',
  'algorithms', 'oop', 'object-oriented programming', 'dsa', 'dbms', 'operating systems',
  'computer networks', 'fullstack', 'full-stack', 'frontend', 'backend', 'web', 'ui', 'ux',
  'interfaces', 'responsive', 'performance', 'microservices'
])

// Provisional template profiles (Qualitative ratings until empirical PDF validation)
export const TEMPLATE_PROFILES = {
  'minimal': {
    id: 'minimal',
    name: 'Minimal ATS',
    rating: 'provisional_high',
    label: 'Provisional High ATS',
    baseScore: 25,
    badge: 'High ATS',
    badgeVariant: 'emerald',
    description: 'Clean single-column monochrome text hierarchy. Ideal for legacy and modern ATS parsers with no multi-column flow.',
    advisories: []
  },
  'ats-elegant': {
    id: 'ats-elegant',
    name: 'ATS-Safe Elegant',
    rating: 'provisional_high',
    label: 'Provisional High ATS',
    baseScore: 25,
    badge: 'High ATS',
    badgeVariant: 'emerald',
    description: 'Refined single-column layout with high contrast and standard section headings.',
    advisories: []
  },
  'modern': {
    id: 'modern',
    name: 'Modern Professional',
    rating: 'provisional_moderate',
    label: 'Provisional Moderate ATS',
    baseScore: 21,
    badge: 'Moderate ATS',
    badgeVariant: 'blue',
    description: 'Single-column structure featuring badge/pill skill blocks and structured sub-grids.',
    advisories: ['Skill badges may concatenate without delimiters in older optical character readers.']
  },
  'executive': {
    id: 'executive',
    name: 'Executive Corporate',
    rating: 'provisional_moderate',
    label: 'Provisional Moderate ATS',
    baseScore: 21,
    badge: 'Moderate ATS',
    badgeVariant: 'blue',
    description: 'Formal single-column navy styling with centered header and horizontal section dividers.',
    advisories: ['Ensure section divider borders do not disrupt automated text segmenters.']
  },
  'creative': {
    id: 'creative',
    name: 'Creative Modern',
    rating: 'provisional_caution',
    label: 'Provisional Caution',
    baseScore: 16,
    badge: 'Needs Caution',
    badgeVariant: 'amber',
    description: 'Two-column sidebar layout with purple gradient accent. Recommended for direct human review and portfolio submissions.',
    advisories: ['Older ATS parsers without columnar awareness may read horizontally across columns, intermixing skills with experience.']
  },
  'two-column-tech': {
    id: 'two-column-tech',
    name: 'Two-Column Tech',
    rating: 'provisional_caution',
    label: 'Provisional Caution',
    baseScore: 16,
    badge: 'Needs Caution',
    badgeVariant: 'amber',
    description: 'Two-column technical layout separating skills/education from main experience.',
    advisories: ['Multi-column layouts require OCR parsers that respect bounding boxes; use single-column for government or legacy enterprise portals.']
  }
}

export function getTemplateProfile(templateId) {
  return TEMPLATE_PROFILES[templateId] || {
    id: templateId || 'unknown',
    name: 'Standard Template',
    rating: 'unverified',
    label: 'Unverified Profile',
    baseScore: 18,
    badge: 'Unverified',
    badgeVariant: 'slate',
    description: 'Custom or unclassified template profile.',
    advisories: ['Template layout has not yet been audited for ATS parsing compatibility.']
  }
}

/**
 * Tokenize text into lower-case clean alphanumeric words
 */
export function tokenizeText(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(w => w.length > 1)
}

/**
 * Extract distinct skill tokens from comma/slash/newline separated strings or arrays
 */
export function extractSkillsList(skillsInput) {
  if (!skillsInput) return []
  if (Array.isArray(skillsInput)) {
    return Array.from(new Set(
      skillsInput
        .map(s => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    ))
  }
  if (typeof skillsInput === 'object') {
    const combined = [
      skillsInput.languages,
      skillsInput.frameworks,
      skillsInput.tools,
      skillsInput.soft
    ]
      .filter(Boolean)
      .join(', ')
    return extractSkillsList(combined)
  }
  if (typeof skillsInput === 'string') {
    return Array.from(new Set(
      skillsInput
        .split(/[,;\n/•|]+/)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0)
    ))
  }
  return []
}

/**
 * Combine all resume text for searching/matching
 */
export function compileResumeText(resume) {
  if (!resume) return { fullText: '', narrativeText: '' }
  const p = resume.personal || {}
  const edu = (resume.education || []).map(e => `${e.college || ''} ${e.degree || ''} ${e.department || ''} ${e.cgpa || ''} ${e.year || ''}`).join(' ')
  const exp = (resume.experience || []).map(e => `${e.role || ''} ${e.company || ''} ${e.description || ''}`).join(' ')
  const proj = (resume.projects || []).map(pr => `${pr.title || ''} ${pr.tech || ''} ${pr.description || ''}`).join(' ')
  const certs = (resume.certifications || []).map(c => `${c.course || ''} ${c.platform || ''}`).join(' ')
  const skillsList = extractSkillsList(resume.skills).join(' ')
  const achievements = resume.achievements || ''
  const summary = p.summary || ''

  const narrativeText = `${summary} ${exp} ${proj} ${achievements}`
  const fullText = `${p.name || p.fullName || ''} ${p.email || ''} ${p.location || ''} ${summary} ${edu} ${skillsList} ${exp} ${proj} ${certs} ${achievements}`

  return { fullText, narrativeText }
}

/**
 * 1. ATS Readiness Scoring Engine (100 Points Total)
 * 
 * Weights:
 * - Identity and contact details: 10 points
 * - Section completeness: 25 points
 * - Template and ATS compatibility: 25 points
 * - Content specificity and evidence: 20 points
 * - Consistency and formatting hygiene: 10 points
 * - Skills and supporting-information quality: 10 points
 */
export function calculateAtsReadiness(resume) {
  const safeResume = resume || {}
  const p = safeResume.personal || {}
  const eduList = Array.isArray(safeResume.education) ? safeResume.education : []
  const projList = Array.isArray(safeResume.projects) ? safeResume.projects : []
  const expList = Array.isArray(safeResume.experience) ? safeResume.experience : []
  const certList = Array.isArray(safeResume.certifications) ? safeResume.certifications : []
  const skillsList = extractSkillsList(safeResume.skills)
  const templateId = safeResume.template || 'modern'
  const { fullText, narrativeText } = compileResumeText(safeResume)
  const narrativeTokens = tokenizeText(narrativeText)

  const suggestions = []

  // --------------------------------------------------------------------------
  // Category 1: Identity and contact details (10 points)
  // --------------------------------------------------------------------------
  let identityScore = 0
  const identityDetails = []

  const hasName = Boolean((p.name || p.fullName)?.trim())
  if (hasName) {
    identityScore += 3
    identityDetails.push({ key: 'name', passed: true, label: 'Full name provided' })
  } else {
    identityDetails.push({ key: 'name', passed: false, label: 'Missing full name' })
    suggestions.push({
      category: 'identity',
      message: 'Add your full name clearly at the top of your resume.',
      impact: 'high'
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const hasValidEmail = Boolean(p.email?.trim() && emailRegex.test(p.email.trim()))
  if (hasValidEmail) {
    identityScore += 3
    identityDetails.push({ key: 'email', passed: true, label: 'Valid email address' })
  } else {
    identityDetails.push({ key: 'email', passed: false, label: 'Missing or invalid email address' })
    suggestions.push({
      category: 'identity',
      message: 'Provide a professional email address (e.g., student@college.edu or name@gmail.com).',
      impact: 'high'
    })
  }

  const phoneDigits = (p.phone || '').replace(/\D/g, '')
  const hasValidPhone = phoneDigits.length >= 10
  if (hasValidPhone) {
    identityScore += 2
    identityDetails.push({ key: 'phone', passed: true, label: 'Valid phone number' })
  } else {
    identityDetails.push({ key: 'phone', passed: false, label: 'Missing or short phone number' })
    suggestions.push({
      category: 'identity',
      message: 'Add a reachable 10-digit phone number with optional country code.',
      impact: 'high'
    })
  }

  const hasLinksOrLocation = Boolean(p.location?.trim() || p.linkedin?.trim() || p.github?.trim() || p.portfolio?.trim())
  if (hasLinksOrLocation) {
    identityScore += 2
    identityDetails.push({ key: 'links_location', passed: true, label: 'Location or professional profile link present' })
  } else {
    identityDetails.push({ key: 'links_location', passed: false, label: 'No location or professional links' })
    suggestions.push({
      category: 'identity',
      message: 'Include your city/location and LinkedIn or GitHub profile link.',
      impact: 'medium'
    })
  }
  identityScore = Math.min(10, identityScore)

  // --------------------------------------------------------------------------
  // Category 2: Section completeness (25 points) - Fair to freshers/students
  // --------------------------------------------------------------------------
  let completenessScore = 0
  const completenessDetails = []

  // Education: College + Degree
  const validEdu = eduList.filter(e => e.college?.trim() && e.degree?.trim())
  if (validEdu.length > 0) {
    completenessScore += 8
    completenessDetails.push({ key: 'education', passed: true, label: 'College education details complete' })
  } else if (eduList.some(e => e.college?.trim() || e.degree?.trim())) {
    completenessScore += 4
    completenessDetails.push({ key: 'education', passed: false, label: 'Incomplete education entry' })
    suggestions.push({
      category: 'completeness',
      message: 'Fill both your college/institution name and your degree/branch in Education.',
      impact: 'high'
    })
  } else {
    completenessDetails.push({ key: 'education', passed: false, label: 'Education section empty' })
    suggestions.push({
      category: 'completeness',
      message: 'Add your current or completed college degree and graduation year.',
      impact: 'high'
    })
  }

  // Skills: at least 4 distinct skills
  if (skillsList.length >= 4) {
    completenessScore += 7
    completenessDetails.push({ key: 'skills', passed: true, label: `Skills populated (${skillsList.length} skills listed)` })
  } else if (skillsList.length >= 1) {
    completenessScore += 3
    completenessDetails.push({ key: 'skills', passed: false, label: 'Too few skills listed' })
    suggestions.push({
      category: 'completeness',
      message: 'Add at least 4-6 specific technical skills, tools, or languages you know.',
      impact: 'medium'
    })
  } else {
    completenessDetails.push({ key: 'skills', passed: false, label: 'Skills section empty' })
    suggestions.push({
      category: 'completeness',
      message: 'Add technical skills in programming languages, frameworks, or tools.',
      impact: 'high'
    })
  }

  // Projects OR Professional Experience (Freshers are not penalized for zero corporate experience)
  const validProjects = projList.filter(pr => pr.title?.trim() && (pr.description?.trim() || pr.tech?.trim()))
  const validExp = expList.filter(ex => ex.role?.trim() && ex.company?.trim())

  if (validProjects.length >= 2 || (validProjects.length >= 1 && validExp.length >= 1) || validExp.length >= 2) {
    completenessScore += 10
    completenessDetails.push({ key: 'work_or_projects', passed: true, label: 'Strong project or work experience entries' })
  } else if (validProjects.length === 1 || validExp.length === 1) {
    completenessScore += 6
    completenessDetails.push({ key: 'work_or_projects', passed: false, label: 'Single project or experience entry' })
    suggestions.push({
      category: 'completeness',
      message: 'Add at least 2 detailed academic/personal projects or work experiences with descriptions.',
      impact: 'medium'
    })
  } else {
    completenessDetails.push({ key: 'work_or_projects', passed: false, label: 'No projects or work experience listed' })
    suggestions.push({
      category: 'completeness',
      message: 'Add your course projects, capstone, or internships to demonstrate practical skills.',
      impact: 'high'
    })
  }
  completenessScore = Math.min(25, completenessScore)

  // --------------------------------------------------------------------------
  // Category 3: Template and ATS compatibility (25 points) - Qualitative Profile
  // --------------------------------------------------------------------------
  const tplProfile = getTemplateProfile(templateId)
  const templateScore = tplProfile.baseScore || 18
  const templateDetails = [
    {
      key: 'template_profile',
      templateId,
      rating: tplProfile.rating,
      label: tplProfile.label,
      badge: tplProfile.badge,
      score: templateScore,
      max: 25,
      description: tplProfile.description,
      advisories: tplProfile.advisories
    }
  ]
  if (tplProfile.rating === 'provisional_caution') {
    suggestions.push({
      category: 'template',
      message: `Selected template "${tplProfile.name}" uses a two-column layout. For conservative enterprise ATS portals, consider switching to "Minimal ATS" or "ATS-Safe Elegant".`,
      impact: 'medium'
    })
  }

  // --------------------------------------------------------------------------
  // Category 4: Content specificity and evidence (20 points)
  // --------------------------------------------------------------------------
  let evidenceScore = 0
  const evidenceDetails = []

  // Action verbs check
  const matchedActionVerbs = Array.from(new Set(
    narrativeTokens.filter(token => ACTION_VERBS.has(token))
  ))

  if (matchedActionVerbs.length >= 3) {
    evidenceScore += 10
    evidenceDetails.push({
      key: 'action_verbs',
      passed: true,
      count: matchedActionVerbs.length,
      label: `Strong action verbs found (${matchedActionVerbs.slice(0, 5).join(', ')})`
    })
  } else if (matchedActionVerbs.length >= 1) {
    evidenceScore += 5
    evidenceDetails.push({
      key: 'action_verbs',
      passed: false,
      count: matchedActionVerbs.length,
      label: `Few action verbs found (${matchedActionVerbs.join(', ')})`
    })
    suggestions.push({
      category: 'evidence',
      message: 'Start project and experience bullet points with strong action verbs (e.g., Developed, Architected, Designed, Implemented, Automated).',
      impact: 'medium'
    })
  } else {
    evidenceDetails.push({ key: 'action_verbs', passed: false, count: 0, label: 'No standard action verbs detected' })
    suggestions.push({
      category: 'evidence',
      message: 'Begin your project descriptions with active verbs like "Built", "Created", or "Optimized".',
      impact: 'high'
    })
  }

  // Quantifiable metrics & concrete evidence (percentages, numbers, multipliers, scale, technical metrics)
  // Fresher friendly: team size (e.g., "team of 4"), accuracy ("92%"), latency ("under 200ms"), scale ("500+ users")
  const metricRegex = /\b(\d+%\s*|\d+\+\s*|\d+x\b|\d+\s*(users|clients|students|members|requests|ms|kb|mb|gb|fps|sec|seconds|records|stars|downloads|pages))/gi
  const numbersRegex = /\b\d{2,}\b/g
  const metricMatches = narrativeText.match(metricRegex) || []
  const numberMatches = narrativeText.match(numbersRegex) || []
  const hasMetrics = metricMatches.length >= 1 || numberMatches.length >= 2

  if (metricMatches.length >= 2 || (metricMatches.length >= 1 && numberMatches.length >= 2)) {
    evidenceScore += 10
    evidenceDetails.push({ key: 'metrics', passed: true, label: 'Good measurable metrics and numerical evidence' })
  } else if (hasMetrics) {
    evidenceScore += 6
    evidenceDetails.push({ key: 'metrics', passed: false, label: 'Modest quantifiable evidence found' })
    suggestions.push({
      category: 'evidence',
      message: 'Include more quantifiable outcomes in your projects (e.g., "Improved query speed by 30%", "Handled 500+ records", or "Built in a team of 4").',
      impact: 'medium'
    })
  } else {
    evidenceDetails.push({ key: 'metrics', passed: false, label: 'No measurable metrics or numbers detected' })
    suggestions.push({
      category: 'evidence',
      message: 'Add measurable impact to your projects (e.g., performance gains, test coverage %, team size, or user volume).',
      impact: 'medium'
    })
  }
  evidenceScore = Math.min(20, evidenceScore)

  // --------------------------------------------------------------------------
  // Category 5: Consistency and formatting hygiene (10 points)
  // --------------------------------------------------------------------------
  let hygieneScore = 0
  const hygieneDetails = []

  // Check for placeholder text
  const placeholderRegex = /\b(lorem ipsum|todo|placeholder|your name here|xyz|company name|test text)\b/i
  const hasPlaceholders = placeholderRegex.test(fullText)
  if (!hasPlaceholders) {
    hygieneScore += 4
    hygieneDetails.push({ key: 'no_placeholders', passed: true, label: 'No placeholder or template filler text' })
  } else {
    hygieneDetails.push({ key: 'no_placeholders', passed: false, label: 'Placeholder text detected' })
    suggestions.push({
      category: 'hygiene',
      message: 'Remove placeholder text such as "Lorem ipsum", "TODO", or "XYZ" before exporting.',
      impact: 'high'
    })
  }

  // Narrative depth (total descriptive words)
  const descriptiveWords = narrativeTokens.length
  if (descriptiveWords >= 40) {
    hygieneScore += 3
    hygieneDetails.push({ key: 'narrative_depth', passed: true, label: 'Adequate descriptive content' })
  } else if (descriptiveWords >= 15) {
    hygieneScore += 1
    hygieneDetails.push({ key: 'narrative_depth', passed: false, label: 'Short descriptions' })
    suggestions.push({
      category: 'hygiene',
      message: 'Expand project descriptions with 2-3 concise bullet points detailing technologies and architecture.',
      impact: 'medium'
    })
  } else {
    hygieneDetails.push({ key: 'narrative_depth', passed: false, label: 'Descriptions are very brief' })
  }

  // URL formatting hygiene
  const urls = [p.linkedin, p.github, p.portfolio, ...(projList.map(pr => pr.link))].filter(Boolean)
  const invalidUrls = urls.filter(u => typeof u === 'string' && u.trim().length > 0 && !/^https?:\/\//i.test(u.trim()) && !/^(www\.)?[a-z0-9-]+\.[a-z]{2,}/i.test(u.trim()))
  if (invalidUrls.length === 0) {
    hygieneScore += 3
    hygieneDetails.push({ key: 'url_hygiene', passed: true, label: 'Web links and URLs formatted cleanly' })
  } else {
    hygieneDetails.push({ key: 'url_hygiene', passed: false, label: 'Some web links may have irregular formats' })
    suggestions.push({
      category: 'hygiene',
      message: 'Verify that portfolio, GitHub, and project links start with https:// or standard domain formatting.',
      impact: 'low'
    })
  }
  hygieneScore = Math.min(10, hygieneScore)

  // --------------------------------------------------------------------------
  // Category 6: Skills and supporting-information quality (10 points)
  // --------------------------------------------------------------------------
  let skillsQualityScore = 0
  const skillsQualityDetails = []

  const sObj = safeResume.skills || {}
  const categorizedCount = [sObj.languages, sObj.frameworks, sObj.tools].filter(v => v && String(v).trim().length > 0).length
  if (categorizedCount >= 2 && skillsList.length >= 5) {
    skillsQualityScore += 6
    skillsQualityDetails.push({ key: 'tech_skills_breadth', passed: true, label: 'Good technical skills diversity across categories' })
  } else if (skillsList.length >= 3) {
    skillsQualityScore += 3
    skillsQualityDetails.push({ key: 'tech_skills_breadth', passed: false, label: 'Moderate technical skills listed' })
    suggestions.push({
      category: 'skills',
      message: 'Group your skills into Languages, Frameworks/Libraries, and Developer Tools.',
      impact: 'medium'
    })
  } else {
    skillsQualityDetails.push({ key: 'tech_skills_breadth', passed: false, label: 'Limited technical skills' })
  }

  const hasCertifications = certList.some(c => c.course?.trim())
  const hasAchievements = Boolean(safeResume.achievements?.trim())
  const hasSoftSkills = Boolean(sObj.soft?.trim())
  if (hasCertifications || hasAchievements || hasSoftSkills) {
    skillsQualityScore += 4
    skillsQualityDetails.push({ key: 'supporting_info', passed: true, label: 'Supporting certifications, achievements, or soft skills present' })
  } else {
    skillsQualityDetails.push({ key: 'supporting_info', passed: false, label: 'No certifications or achievements' })
    suggestions.push({
      category: 'skills',
      message: 'Include relevant certifications, academic achievements, or collaborative soft skills.',
      impact: 'low'
    })
  }
  skillsQualityScore = Math.min(10, skillsQualityScore)

  // --------------------------------------------------------------------------
  // Total Score Calculation (Exact 100 max)
  // --------------------------------------------------------------------------
  const totalScore = Math.round(
    identityScore +
    completenessScore +
    templateScore +
    evidenceScore +
    hygieneScore +
    skillsQualityScore
  )

  let ratingLabel = 'Needs Improvement'
  if (totalScore >= 85) ratingLabel = 'ATS Ready'
  else if (totalScore >= 70) ratingLabel = 'Good Foundation'
  else if (totalScore >= 50) ratingLabel = 'Developing'

  return {
    totalScore: Math.min(100, Math.max(0, totalScore)),
    ratingLabel,
    breakdown: {
      identity: {
        score: identityScore,
        max: 10,
        label: 'Identity & Contact',
        details: identityDetails
      },
      completeness: {
        score: completenessScore,
        max: 25,
        label: 'Section Completeness',
        details: completenessDetails
      },
      templateCompatibility: {
        score: templateScore,
        max: 25,
        label: 'Template & Layout',
        templateId,
        rating: tplProfile.rating,
        profileBadge: tplProfile.badge,
        details: templateDetails
      },
      contentEvidence: {
        score: evidenceScore,
        max: 20,
        label: 'Evidence & Specificity',
        actionVerbCount: matchedActionVerbs.length,
        actionVerbsFound: matchedActionVerbs,
        details: evidenceDetails
      },
      formattingHygiene: {
        score: hygieneScore,
        max: 10,
        label: 'Formatting Hygiene',
        details: hygieneDetails
      },
      skillsQuality: {
        score: skillsQualityScore,
        max: 10,
        label: 'Skills & Supporting Info',
        skillsCount: skillsList.length,
        details: skillsQualityDetails
      }
    },
    suggestions
  }
}

/**
 * 2. Independent Job Match Scoring Engine (100 Points Total)
 * 
 * Categories:
 * - Required skills and qualifications: 35 points
 * - Skill and tool overlap: 30 points
 * - Evidence in projects and experience: 20 points
 * - Education and certification alignment: 10 points
 * - Job title and domain alignment: 5 points
 * 
 * Rules:
 * - Prerequisite: Requires a sufficiently informative job description (min 15 non-stop tokens / 100 characters).
 * - Deduplicates keywords to prevent artificial score inflation.
 * - Distinguishes listed skills from skills with actual project/experience evidence.
 */
export function calculateJobMatch(resume, jobDescription) {
  if (!jobDescription || typeof jobDescription !== 'string') {
    return {
      status: 'insufficient_job_description',
      score: null,
      message: 'Paste a target job description to calculate Job Match score.',
      suggestions: []
    }
  }

  const trimmedJd = jobDescription.trim()
  const allJdTokens = tokenizeText(trimmedJd)
  const meaningfulTokens = allJdTokens.filter(w => !STOP_WORDS.has(w))

  // Require at least 15 meaningful tokens and 100 characters
  if (trimmedJd.length < 100 || meaningfulTokens.length < 15) {
    return {
      status: 'insufficient_job_description',
      score: null,
      message: 'Job description is too brief. Provide a more detailed job posting (including requirements and skills) for an accurate match score.',
      tokenCount: meaningfulTokens.length,
      suggestions: []
    }
  }

  const safeResume = resume || {}
  const resumeSkills = extractSkillsList(safeResume.skills)
  const resumeSkillsTokens = new Set(resumeSkills.flatMap(s => tokenizeText(s)))
  const { fullText, narrativeText } = compileResumeText(safeResume)
  const fullTokensSet = new Set(tokenizeText(fullText))
  const narrativeTokensSet = new Set(tokenizeText(narrativeText))

  // 1. Identify distinct target technical skills from JD
  const jdTechKeywords = Array.from(new Set(
    meaningfulTokens.filter(t => KNOWN_TECH_KEYWORDS.has(t))
  ))

  // 2. Identify broader domain keywords from JD
  const jdDomainKeywords = Array.from(new Set(
    meaningfulTokens.filter(t => !KNOWN_TECH_KEYWORDS.has(t) && t.length >= 3)
  ))

  // Primary target keywords (Technical skills prioritized, supplemented by domain terms)
  const primaryTargetKeywords = jdTechKeywords.length >= 3
    ? Array.from(new Set([...jdTechKeywords, ...jdDomainKeywords.slice(0, 10)]))
    : Array.from(new Set([...jdTechKeywords, ...jdDomainKeywords.slice(0, 20)]))

  if (primaryTargetKeywords.length === 0) {
    return {
      status: 'insufficient_job_description',
      score: null,
      message: 'Unable to extract technical requirements from the provided text. Please paste standard job requirements.',
      suggestions: []
    }
  }

  const suggestions = []

  // --------------------------------------------------------------------------
  // Category 1: Required skills and qualifications (35 points)
  // --------------------------------------------------------------------------
  const matchedRequired = primaryTargetKeywords.filter(kw => fullTokensSet.has(kw) || resumeSkillsTokens.has(kw))
  const missingRequired = primaryTargetKeywords.filter(kw => !fullTokensSet.has(kw) && !resumeSkillsTokens.has(kw))

  const requiredRatio = primaryTargetKeywords.length > 0 ? (matchedRequired.length / primaryTargetKeywords.length) : 0
  const requiredSkillsScore = Math.min(35, Math.round(requiredRatio * 35))

  if (missingRequired.length > 0) {
    suggestions.push({
      category: 'missing_skills',
      message: `The job description emphasizes keywords you haven't listed: ${missingRequired.slice(0, 5).join(', ')}. If you possess these, consider adding them to your skills or projects.`,
      impact: 'high',
      keywords: missingRequired.slice(0, 5)
    })
  }

  // --------------------------------------------------------------------------
  // Category 2: Skill and tool overlap (30 points)
  // --------------------------------------------------------------------------
  let skillOverlapScore = 0
  if (resumeSkills.length > 0) {
    const jdTextLower = trimmedJd.toLowerCase()
    const matchedListedSkills = resumeSkills.filter(skill => {
      return jdTextLower.includes(skill.toLowerCase()) || jdTechKeywords.includes(skill.toLowerCase())
    })
    const overlapRatio = matchedListedSkills.length / Math.max(1, Math.min(resumeSkills.length, 10))
    skillOverlapScore = Math.min(30, Math.round(Math.min(1, overlapRatio * 1.2) * 30))
  }

  // --------------------------------------------------------------------------
  // Category 3: Evidence in projects and experience (20 points)
  // --------------------------------------------------------------------------
  const evidencedKeywords = matchedRequired.filter(kw => narrativeTokensSet.has(kw))
  const evidenceRatio = matchedRequired.length > 0 ? (evidencedKeywords.length / matchedRequired.length) : 0
  const projectEvidenceScore = Math.min(20, Math.round(evidenceRatio * 20))

  const unevidencedMatched = matchedRequired.filter(kw => !narrativeTokensSet.has(kw))
  if (unevidencedMatched.length > 0) {
    suggestions.push({
      category: 'evidence_gap',
      message: `You listed or matched "${unevidencedMatched.slice(0, 4).join(', ')}" but haven't demonstrated them in your project or experience descriptions. Add bullet points showing how you used them.`,
      impact: 'medium',
      keywords: unevidencedMatched.slice(0, 4)
    })
  }

  // --------------------------------------------------------------------------
  // Category 4: Education and certification alignment (10 points)
  // --------------------------------------------------------------------------
  let educationScore = 0
  const eduText = (safeResume.education || []).map(e => `${e.degree || ''} ${e.department || ''}`).join(' ').toLowerCase()
  const certText = (safeResume.certifications || []).map(c => `${c.course || ''} ${c.platform || ''}`).join(' ').toLowerCase()
  const combinedCredentials = `${eduText} ${certText}`

  const eduDegreeTerms = ['b.tech', 'btech', 'b.e', 'be', 'bachelor', 'bachelors', 'master', 'masters', 'degree', 'computer science', 'engineering', 'information technology', 'mca', 'bca']
  const jdHasEduRequirement = eduDegreeTerms.some(term => trimmedJd.toLowerCase().includes(term))

  if (eduText.length > 3) {
    educationScore += 5
    if (jdHasEduRequirement && eduDegreeTerms.some(term => combinedCredentials.includes(term))) {
      educationScore += 5
    } else if (!jdHasEduRequirement) {
      educationScore += 5 // Fresher friendly: JD doesn't restrict degree, candidate has degree filled
    }
  }
  educationScore = Math.min(10, educationScore)

  // --------------------------------------------------------------------------
  // Category 5: Job title and domain alignment (5 points)
  // --------------------------------------------------------------------------
  let domainScore = 0
  const roleKeywords = ['frontend', 'backend', 'full stack', 'fullstack', 'developer', 'engineer', 'analyst', 'designer', 'intern', 'data', 'cloud', 'qa', 'tester']
  const pSummary = (safeResume.personal?.summary || '').toLowerCase()
  const rolesInResume = [
    pSummary,
    ...(safeResume.experience || []).map(e => e.role || ''),
    ...(safeResume.projects || []).map(pr => pr.title || '')
  ].join(' ').toLowerCase()

  const jdMatchedRoles = roleKeywords.filter(r => trimmedJd.toLowerCase().includes(r))
  const resumeMatchesRole = jdMatchedRoles.some(r => rolesInResume.includes(r))

  if (resumeMatchesRole) {
    domainScore = 5
  } else if (jdMatchedRoles.length === 0) {
    domainScore = 3
  } else {
    suggestions.push({
      category: 'role_alignment',
      message: `Target role emphasizes "${jdMatchedRoles.slice(0, 2).join(' / ')}". Consider tailoring your project titles or summary to reflect relevant role keywords.`,
      impact: 'low'
    })
  }

  // Total Job Match Score
  const totalScore = Math.min(100, Math.max(0,
    requiredSkillsScore +
    skillOverlapScore +
    projectEvidenceScore +
    educationScore +
    domainScore
  ))

  let matchLevel = 'Low Alignment'
  if (totalScore >= 75) matchLevel = 'High Alignment'
  else if (totalScore >= 55) matchLevel = 'Moderate Alignment'
  else if (totalScore >= 35) matchLevel = 'Basic Alignment'

  return {
    status: 'calculated',
    totalScore,
    matchLevel,
    breakdown: {
      requiredSkills: {
        score: requiredSkillsScore,
        max: 35,
        label: 'Required Skills & Qualifications',
        matchedCount: matchedRequired.length,
        totalTarget: primaryTargetKeywords.length
      },
      skillOverlap: {
        score: skillOverlapScore,
        max: 30,
        label: 'Skill & Tool Overlap'
      },
      projectEvidence: {
        score: projectEvidenceScore,
        max: 20,
        label: 'Evidence in Projects & Work',
        evidencedCount: evidencedKeywords.length,
        matchedCount: matchedRequired.length
      },
      educationAlignment: {
        score: educationScore,
        max: 10,
        label: 'Education & Credentials'
      },
      roleDomainAlignment: {
        score: domainScore,
        max: 5,
        label: 'Job Title & Role Alignment'
      }
    },
    matchedKeywords: matchedRequired,
    missingKeywords: missingRequired.slice(0, 10),
    evidencedKeywords,
    suggestions
  }
}

/**
 * 3. PDF Preflight and Document Validation
 * 
 * Inspects document parameters before rendering / export.
 * Note on current pipeline: html2canvas + jsPDF generates a raster/canvas-based PDF.
 * While visual layout is accurate to A4, text extractability requires OCR.
 */
export function performPdfPreflight(resume, templateId) {
  const safeResume = resume || {}
  const tplId = templateId || safeResume.template || 'modern'
  const tplProfile = getTemplateProfile(tplId)
  const p = safeResume.personal || {}
  const issues = []
  const advisories = []

  // Check critical contact fields
  if (!p.name?.trim()) issues.push({ field: 'name', message: 'Full Name is missing.', level: 'error' })
  if (!p.email?.trim()) issues.push({ field: 'email', message: 'Email address is missing.', level: 'error' })
  if (!p.phone?.trim()) issues.push({ field: 'phone', message: 'Phone number is missing.', level: 'warning' })

  // Technical export pipeline reality note
  advisories.push({
    code: 'EXPORT_RASTER_PDF',
    level: 'info',
    message: 'Export pipeline renders through high-DPI canvas to PDF. While visually pristine, single-column templates (Minimal ATS, ATS-Safe Elegant) ensure optimal OCR recognition across legacy scanning engines.'
  })

  // Template-specific layout advisories
  if (tplProfile.advisories && tplProfile.advisories.length > 0) {
    tplProfile.advisories.forEach(adv => {
      advisories.push({
        code: 'TEMPLATE_LAYOUT_ADVISORY',
        level: 'advisory',
        message: adv
      })
    })
  }

  const hasErrors = issues.some(i => i.level === 'error')
  const status = hasErrors ? 'incomplete' : advisories.some(a => a.level === 'advisory') ? 'advisory' : 'ready'

  return {
    status,
    templateId: tplId,
    templateProfile: tplProfile,
    isRasterCanvasPdf: true,
    textExtractableWithoutOcr: false,
    issues,
    advisories
  }
}
