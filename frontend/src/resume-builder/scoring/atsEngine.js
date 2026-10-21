/**
 * XBuddy Resume Studio - Deterministic Evidence-Based ATS Scoring Engine (v2.0.0)
 * 
 * Provides:
 * 1. calculateAtsReadiness(resume) - Evaluates completeness, substance, skills, accomplishments, hygiene, and structure (0-100)
 * 2. calculateJobMatch(resume, jobDescription) - Evaluates alignment against a target job description (0-100)
 * 3. getTemplateProfile(templateId) - Returns qualitative, provisional template ATS compatibility metadata
 * 4. performPdfPreflight(resume, templateId) - Evaluates PDF export readiness and document hygiene
 * 5. generateScoreSuggestions(resume, atsResult, jobMatchResult) - Generates targeted, deduplicated recommendations
 * 
 * Invariants:
 * - 100% deterministic, pure client-side execution.
 * - Zero external API calls, zero secrets, zero telemetry.
 * - Maximum points per category always sum to exactly 100.
 * - Skills normalized via canonical aliases; no substring false positives (e.g., 'Java' != 'JavaScript').
 * - Repeated keywords / duplicate skills never inflate scores.
 * - Meaningful student/fresher projects substitute fairly for corporate experience.
 * - Template switching does not penalize resume content quality.
 */

// Common English filler and job description boilerplate stop words
export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't",
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing',
  "don't", 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', "hadn't", 'has', "hasn't",
  'have', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers',
  'herself', 'him', 'himself', 'his', 'how', "how's", 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in',
  'into', 'is', "isn't", 'it', "it's", 'its', 'itself', "let's", 'me', 'more', 'most', "mustn't", 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', "shan't", 'she', "she'd", "she'll", "she's", 'should',
  "shouldn't", 'so', 'some', 'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', "there's", 'these', 'they', "they'd", "they'll", "they're",
  "they've", 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', "wasn't",
  'we', "we'd", "we'll", "we're", "we've", 'were', "weren't", 'what', "what's", 'when', "when's",
  'where', "where's", 'which', 'while', 'who', "who's", 'whom', 'why', "why's", 'with', "won't",
  'would', "wouldn't", 'you', "you'd", "you'll", "you're", "you've", 'your', 'yours', 'yourself',
  'yourselves', 'will', 'shall',
  // Non-technical JD filler boilerplate
  'job', 'work', 'working', 'candidate', 'apply', 'role', 'team', 'responsibilities', 'opportunity',
  'company', 'looking', 'description', 'join', 'ideal', 'skills', 'ability', 'abilities', 'seeking',
  'user', 'users', 'hands-on', 'strong', 'modern', 'proficiency', 'proficient', 'collaborate',
  'collaborating', 'effectively', 'agile', 'related', 'discipline', 'disciplines', 'familiarity',
  'knowledge', 'understanding', 'demonstrated', 'excellent', 'verbal', 'written', 'communication',
  'fast-paced', 'environment', 'daily', 'position', 'applicant', 'level', 'high', 'good', 'great',
  'equal', 'hire', 'hiring', 'standard', 'practices', 'ensure', 'ensuring', 'deliver', 'delivering',
  'help', 'across', 'well', 'etc', 'etc.'
])

// Canonical Technical Skills & Normalized Aliases Dictionary
export const CANONICAL_ALIASES = {
  // Programming Languages
  'js': 'javascript',
  'javascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
  'py': 'python',
  'python': 'python',
  'java': 'java',
  'c++': 'c++',
  'cpp': 'c++',
  'c#': 'c#',
  'csharp': 'c#',
  'c': 'c',
  'golang': 'go',
  'go': 'go',
  'rust': 'rust',
  'php': 'php',
  'ruby': 'ruby',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'dart': 'dart',
  'scala': 'scala',
  'r': 'r',
  'matlab': 'matlab',
  'sql': 'sql',
  'nosql': 'nosql',
  'html': 'html',
  'html5': 'html',
  'css': 'css',
  'css3': 'css',
  'sass': 'sass',
  'scss': 'sass',

  // Frameworks & Libraries
  'react': 'react',
  'reactjs': 'react',
  'react.js': 'react',
  'react native': 'react native',
  'reactnative': 'react native',
  'next': 'next.js',
  'nextjs': 'next.js',
  'next.js': 'next.js',
  'vue': 'vue',
  'vuejs': 'vue',
  'vue.js': 'vue',
  'angular': 'angular',
  'angularjs': 'angular',
  'svelte': 'svelte',
  'node': 'node.js',
  'nodejs': 'node.js',
  'node.js': 'node.js',
  'express': 'express.js',
  'expressjs': 'express.js',
  'express.js': 'express.js',
  'django': 'django',
  'flask': 'flask',
  'fastapi': 'fastapi',
  'spring': 'spring boot',
  'spring boot': 'spring boot',
  'springboot': 'spring boot',
  '.net': '.net',
  'dotnet': '.net',
  'asp.net': 'asp.net',
  'laravel': 'laravel',
  'tailwind': 'tailwind css',
  'tailwindcss': 'tailwind css',
  'bootstrap': 'bootstrap',

  // Databases & Storage
  'mongodb': 'mongodb',
  'mongo': 'mongodb',
  'postgres': 'postgresql',
  'postgresql': 'postgresql',
  'mysql': 'mysql',
  'sqlite': 'sqlite',
  'redis': 'redis',
  'oracle': 'oracle',
  'elasticsearch': 'elasticsearch',
  'firebase': 'firebase',
  'supabase': 'supabase',

  // Cloud & DevOps & Developer Tools
  'aws': 'aws',
  'amazon web services': 'aws',
  'azure': 'azure',
  'gcp': 'google cloud',
  'google cloud': 'google cloud',
  'docker': 'docker',
  'kubernetes': 'kubernetes',
  'k8s': 'kubernetes',
  'git': 'git',
  'github': 'github',
  'gitlab': 'gitlab',
  'ci/cd': 'ci/cd',
  'cicd': 'ci/cd',
  'jenkins': 'jenkins',
  'linux': 'linux',
  'unix': 'unix',
  'bash': 'bash',
  'shell': 'bash',
  'powershell': 'powershell',
  'postman': 'postman',
  'figma': 'figma',
  'canva': 'canva',
  'vite': 'vite',
  'webpack': 'webpack',
  'selenium': 'selenium',
  'jest': 'jest',
  'cypress': 'cypress',

  // Architecture & APIs
  'graphql': 'graphql',
  'rest': 'rest api',
  'rest api': 'rest api',
  'restful': 'rest api',
  'api': 'api',
  'apis': 'api',
  'microservices': 'microservices',

  // Data / AI / Core CS
  'dsa': 'data structures & algorithms',
  'data structures': 'data structures & algorithms',
  'algorithms': 'data structures & algorithms',
  'machine learning': 'machine learning',
  'ml': 'machine learning',
  'deep learning': 'deep learning',
  'artificial intelligence': 'artificial intelligence',
  'ai': 'artificial intelligence',
  'nlp': 'natural language processing',
  'computer vision': 'computer vision',
  'opencv': 'opencv',
  'pandas': 'pandas',
  'numpy': 'numpy',
  'scikit-learn': 'scikit-learn',
  'tensorflow': 'tensorflow',
  'pytorch': 'pytorch',
  'oop': 'object-oriented programming',
  'object-oriented programming': 'object-oriented programming',
  'dbms': 'dbms',
  'operating systems': 'operating systems',
  'computer networks': 'computer networks',

  // Degrees
  'b.tech': 'bachelor of technology',
  'btech': 'bachelor of technology',
  'b.e': 'bachelor of engineering',
  'be': 'bachelor of engineering',
  'b.sc': 'bachelor of science',
  'bsc': 'bachelor of science',
  'bca': 'bachelor of computer applications',
  'mca': 'master of computer applications',
  'm.tech': 'master of technology',
  'mtech': 'master of technology',
  'bachelor': 'bachelor',
  'bachelors': 'bachelor',
  'master': 'master',
  'masters': 'master'
}

export const DEGREE_TERMS = new Set([
  'bachelor of technology', 'bachelor of engineering', 'bachelor of science',
  'bachelor of computer applications', 'master of computer applications',
  'master of technology', 'bachelor', 'master'
])

// Known technical terms set (for JD extraction - excludes degree names)
export const KNOWN_TECH_KEYWORDS = new Set(
  Object.values(CANONICAL_ALIASES).filter(k => !DEGREE_TERMS.has(k))
)

// Curated high-impact action verbs (engineering, academic, and leadership)
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

// Template Layout Profiles (Qualitative Advisories, not Empirical Scoring Penalties)
export const TEMPLATE_PROFILES = {
  'minimal': {
    id: 'minimal',
    name: 'Minimal ATS',
    rating: 'provisional_high',
    label: 'Provisional High ATS',
    layoutScore: 7,
    baseScore: 25, // backwards compatibility
    badge: 'High ATS',
    badgeVariant: 'emerald',
    description: 'Clean single-column monochrome text hierarchy. Ideal for legacy and modern ATS parsers.',
    advisories: []
  },
  'ats-elegant': {
    id: 'ats-elegant',
    name: 'ATS-Safe Elegant',
    rating: 'provisional_high',
    label: 'Provisional High ATS',
    layoutScore: 7,
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
    layoutScore: 7,
    baseScore: 21,
    badge: 'Moderate ATS',
    badgeVariant: 'blue',
    description: 'Single-column structure featuring clean skill badges and structured project blocks.',
    advisories: []
  },
  'executive': {
    id: 'executive',
    name: 'Executive Corporate',
    rating: 'provisional_moderate',
    label: 'Provisional Moderate ATS',
    layoutScore: 7,
    baseScore: 21,
    badge: 'Moderate ATS',
    badgeVariant: 'blue',
    description: 'Formal single-column navy styling with centered header and standard section dividers.',
    advisories: []
  },
  'creative': {
    id: 'creative',
    name: 'Creative Modern',
    rating: 'provisional_caution',
    label: 'Provisional Caution',
    layoutScore: 5,
    baseScore: 16,
    badge: 'Needs Caution',
    badgeVariant: 'amber',
    description: 'Two-column sidebar layout. Recommended for direct email, human review, and portfolio submissions.',
    advisories: ['Older ATS parsers without columnar bounding-box awareness may read horizontally across columns.']
  },
  'two-column-tech': {
    id: 'two-column-tech',
    name: 'Two-Column Tech',
    rating: 'provisional_caution',
    label: 'Provisional Caution',
    layoutScore: 5,
    baseScore: 16,
    badge: 'Needs Caution',
    badgeVariant: 'amber',
    description: 'Two-column technical layout separating skills/education from main experience.',
    advisories: ['Multi-column layouts require modern OCR parsers that respect column boundaries.']
  }
}

export function getTemplateProfile(templateId) {
  return TEMPLATE_PROFILES[templateId] || {
    id: templateId || 'unknown',
    name: 'Standard Template',
    rating: 'unverified',
    label: 'Unverified Profile',
    layoutScore: 6,
    baseScore: 18,
    badge: 'Unverified',
    badgeVariant: 'slate',
    description: 'Custom or unclassified template profile.',
    advisories: ['Template layout has not yet been audited for ATS parsing compatibility.']
  }
}

/**
 * Tokenize text into lower-case clean words
 */
export function tokenizeText(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(w => w.length > 0)
}

/**
 * Normalize skill string to its canonical term if known
 */
export function normalizeCanonicalSkill(skill) {
  if (!skill || typeof skill !== 'string') return ''
  const clean = skill.trim().toLowerCase().replace(/\s+/g, ' ')
  return CANONICAL_ALIASES[clean] || clean
}

/**
 * Safe, word-boundary check to verify if a skill exists in text
 * Prevents false positives like matching "java" in "javascript" or "c" in "react".
 */
export function textContainsSkill(text, skill) {
  if (!text || !skill || typeof text !== 'string' || typeof skill !== 'string') return false
  const normText = text.toLowerCase()
  const target = skill.toLowerCase().trim()
  if (!target) return false

  // Escape regex special chars
  const escaped = target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`(^|[^a-z0-9_+#]|[.](?!\\w))${escaped}(?=[^a-z0-9_+#]|[.](?!\\w)|$)`, 'i')
  return regex.test(normText)
}

/**
 * Helper to check for placeholder text
 */
export function hasPlaceholderText(text) {
  if (!text || typeof text !== 'string') return false
  const placeholderRegex = /\b(lorem ipsum|todo|placeholder|your name here|your name|full name|candidate name|college name|university name|school name|degree name|my degree|company name|project title|project description here|xyz|test text|example@example\.com|test@test\.com|email@domain\.com|0000000000|1234567890)\b/i
  return placeholderRegex.test(text)
}

/**
 * Extract distinct, deduplicated canonical skill terms from inputs
 */
export function extractSkillsList(skillsInput) {
  if (!skillsInput) return []
  const rawList = []

  if (Array.isArray(skillsInput)) {
    skillsInput.forEach(s => {
      if (typeof s === 'string' && s.trim()) rawList.push(s)
      else if (s && typeof s === 'object') {
        Object.values(s).forEach(v => { if (typeof v === 'string') rawList.push(v) })
      }
    })
  } else if (typeof skillsInput === 'object') {
    ['languages', 'frameworks', 'tools', 'soft'].forEach(k => {
      const val = skillsInput[k]
      if (typeof val === 'string' && val.trim()) {
        rawList.push(val)
      }
    })
  } else if (typeof skillsInput === 'string') {
    rawList.push(skillsInput)
  }

  const tokens = []
  rawList.forEach(chunk => {
    chunk
      .split(/[,;\n/•|]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(term => {
        if (!hasPlaceholderText(term)) {
          const canonical = normalizeCanonicalSkill(term)
          if (canonical && canonical.length > 0) {
            tokens.push(canonical)
          }
        }
      })
  })

  return Array.from(new Set(tokens))
}

/**
 * Combine all resume text for searching/matching
 */
export function compileResumeText(resume) {
  if (!resume) return { fullText: '', narrativeText: '' }
  const p = resume.personal || {}
  const edu = (Array.isArray(resume.education) ? resume.education : [])
    .map(e => `${e.college || ''} ${e.degree || ''} ${e.department || ''} ${e.cgpa || ''} ${e.year || ''}`)
    .join(' ')
  const exp = (Array.isArray(resume.experience) ? resume.experience : [])
    .map(e => `${e.role || ''} ${e.company || ''} ${e.description || ''}`)
    .join(' ')
  const proj = (Array.isArray(resume.projects) ? resume.projects : [])
    .map(pr => `${pr.title || ''} ${pr.tech || ''} ${pr.description || ''}`)
    .join(' ')
  const certs = (Array.isArray(resume.certifications) ? resume.certifications : [])
    .map(c => `${c.course || ''} ${c.platform || ''}`)
    .join(' ')
  const skillsList = extractSkillsList(resume.skills).join(' ')
  const achievements = typeof resume.achievements === 'string' ? resume.achievements : ''
  const summary = p.summary || ''

  const narrativeText = `${summary} ${exp} ${proj} ${achievements}`
  const fullText = `${p.name || p.fullName || ''} ${p.email || ''} ${p.location || ''} ${summary} ${edu} ${skillsList} ${exp} ${proj} ${certs} ${achievements}`

  return { fullText, narrativeText }
}

/**
 * -----------------------------------------------------------------------------
 * 1. ATS READINESS SCORING ENGINE (0 - 100 POINTS)
 * -----------------------------------------------------------------------------
 * Exact Categories:
 * 1. Identity and contact information (10 max)
 * 2. Core section completeness and substance (20 max)
 * 3. Skills and technical relevance (15 max)
 * 4. Accomplishments and supporting evidence (25 max)
 * 5. Consistency and formatting hygiene (15 max)
 * 6. Clarity and standard resume structure (15 max)
 * Total = 100 max
 */
export function calculateAtsReadiness(resume) {
  const safeResume = resume || {}
  const p = safeResume.personal || {}
  const eduList = Array.isArray(safeResume.education) ? safeResume.education : []
  const projList = Array.isArray(safeResume.projects) ? safeResume.projects : []
  const expList = Array.isArray(safeResume.experience) ? safeResume.experience : []
  const certList = Array.isArray(safeResume.certifications) ? safeResume.certifications : []
  const rawSkills = safeResume.skills || {}
  const skillsList = extractSkillsList(rawSkills)
  const templateId = safeResume.template || 'modern'
  const { fullText, narrativeText } = compileResumeText(safeResume)
  const narrativeTokens = tokenizeText(narrativeText)

  const isCompletelyEmpty = fullText.trim().length === 0
  const containsPlaceholders = hasPlaceholderText(fullText)

  const suggestions = []
  const rules = []

  // ---------------------------------------------------------------------------
  // Category 1: Identity and contact information (10 points max)
  // ---------------------------------------------------------------------------
  let identityScore = 0
  const identityDetails = []

  // Full Name (3 pts) - reject placeholders
  const rawName = (p.name || p.fullName || '').trim()
  const hasValidName = rawName.length >= 2 && !hasPlaceholderText(rawName)
  if (hasValidName) {
    identityScore += 3
    identityDetails.push({ key: 'name', passed: true, score: 3, label: 'Full name provided' })
    rules.push({ id: 'id_name', category: 'identity', passed: true, pointsEarned: 3, maxPoints: 3, label: 'Candidate full name' })
  } else {
    identityDetails.push({ key: 'name', passed: false, score: 0, label: 'Missing or placeholder full name' })
    rules.push({ id: 'id_name', category: 'identity', passed: false, pointsEarned: 0, maxPoints: 3, label: 'Candidate full name' })
    suggestions.push({
      id: 'sug_id_name',
      category: 'identity',
      section: 'Personal Details',
      field: 'name',
      impact: 'high',
      pointsDeducted: 3,
      message: 'Add your genuine full name in Personal Details (avoid demo names or placeholders).'
    })
  }

  // Email (3 pts) - standard email syntax, reject placeholders
  const emailVal = (p.email || '').trim()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
  const hasValidEmail = Boolean(emailVal && emailRegex.test(emailVal) && !hasPlaceholderText(emailVal))
  if (hasValidEmail) {
    identityScore += 3
    identityDetails.push({ key: 'email', passed: true, score: 3, label: 'Valid email address syntax' })
    rules.push({ id: 'id_email', category: 'identity', passed: true, pointsEarned: 3, maxPoints: 3, label: 'Contact email address' })
  } else {
    identityDetails.push({ key: 'email', passed: false, score: 0, label: 'Missing or invalid email syntax' })
    rules.push({ id: 'id_email', category: 'identity', passed: false, pointsEarned: 0, maxPoints: 3, label: 'Contact email address' })
    suggestions.push({
      id: 'sug_id_email',
      category: 'identity',
      section: 'Personal Details',
      field: 'email',
      impact: 'high',
      pointsDeducted: 3,
      message: 'Add a valid contact email address (e.g., student@college.edu or name@gmail.com).'
    })
  }

  // Phone (2 pts) - plausible phone number (10-15 digits, not dummy repetition)
  const phoneDigits = (p.phone || '').replace(/\D/g, '')
  const isDummyPhone = /^0+$|^1+$|^9+$|^1234567890$/.test(phoneDigits)
  const hasValidPhone = phoneDigits.length >= 10 && phoneDigits.length <= 15 && !isDummyPhone && !hasPlaceholderText(p.phone)
  if (hasValidPhone) {
    identityScore += 2
    identityDetails.push({ key: 'phone', passed: true, score: 2, label: 'Plausible phone number provided' })
    rules.push({ id: 'id_phone', category: 'identity', passed: true, pointsEarned: 2, maxPoints: 2, label: 'Reachable telephone number' })
  } else {
    identityDetails.push({ key: 'phone', passed: false, score: 0, label: 'Missing or implausible phone number' })
    rules.push({ id: 'id_phone', category: 'identity', passed: false, pointsEarned: 0, maxPoints: 2, label: 'Reachable telephone number' })
    suggestions.push({
      id: 'sug_id_phone',
      category: 'identity',
      section: 'Personal Details',
      field: 'phone',
      impact: 'high',
      pointsDeducted: 2,
      message: 'Provide a reachable 10-digit telephone number in Personal Details.'
    })
  }

  // Relevant links or location (2 pts) - location, LinkedIn, GitHub, or portfolio
  const hasLinksOrLocation = Boolean(
    (p.location && p.location.trim().length >= 2 && !hasPlaceholderText(p.location)) ||
    (p.linkedin && p.linkedin.trim().length >= 5) ||
    (p.github && p.github.trim().length >= 5) ||
    (p.portfolio && p.portfolio.trim().length >= 5)
  )
  if (hasLinksOrLocation && !hasPlaceholderText(p.location || '')) {
    identityScore += 2
    identityDetails.push({ key: 'links_location', passed: true, score: 2, label: 'Location or professional link present' })
    rules.push({ id: 'id_links', category: 'identity', passed: true, pointsEarned: 2, maxPoints: 2, label: 'Location or profile link' })
  } else {
    identityDetails.push({ key: 'links_location', passed: false, score: 0, label: 'No location or professional profiles' })
    rules.push({ id: 'id_links', category: 'identity', passed: false, pointsEarned: 0, maxPoints: 2, label: 'Location or profile link' })
    suggestions.push({
      id: 'sug_id_links',
      category: 'identity',
      section: 'Personal Details',
      field: 'links',
      impact: 'medium',
      pointsDeducted: 2,
      message: 'Include your location city and at least one professional link (LinkedIn, GitHub, or portfolio).'
    })
  }
  identityScore = Math.min(10, identityScore)

  // ---------------------------------------------------------------------------
  // Category 2: Core section completeness and substance (20 points max)
  // ---------------------------------------------------------------------------
  let completenessScore = 0
  const completenessDetails = []

  // 2.1 Education substance (8 pts max)
  // Inspect degree, institution, field of study, and year
  const validEdu = eduList.filter(e => {
    const coll = (e.college || '').trim()
    const deg = (e.degree || '').trim()
    const dept = (e.department || '').trim()
    const isSubstantive = coll.length >= 3 && deg.length >= 2 && 
      !hasPlaceholderText(coll) && !hasPlaceholderText(deg) && !hasPlaceholderText(dept)
    return isSubstantive
  })

  if (validEdu.length >= 1) {
    const hasDetailedEdu = validEdu.some(e => (e.department && e.department.trim().length >= 2) || e.year)
    const eduPts = hasDetailedEdu ? 8 : 6
    completenessScore += eduPts
    completenessDetails.push({ key: 'education', passed: true, score: eduPts, max: 8, label: 'Substantive college degree details' })
    rules.push({ id: 'comp_edu', category: 'completeness', passed: true, pointsEarned: eduPts, maxPoints: 8, label: 'Education credentials' })
  } else if (eduList.length > 0 && !eduList.every(e => hasPlaceholderText(e.college || '') || hasPlaceholderText(e.degree || ''))) {
    completenessScore += 3
    completenessDetails.push({ key: 'education', passed: false, score: 3, max: 8, label: 'Incomplete education entry' })
    rules.push({ id: 'comp_edu', category: 'completeness', passed: false, pointsEarned: 3, maxPoints: 8, label: 'Education credentials' })
    suggestions.push({
      id: 'sug_comp_edu',
      category: 'completeness',
      section: 'Education',
      impact: 'high',
      pointsDeducted: 5,
      message: 'Fill both your college/university institution name and degree/branch in Education.'
    })
  } else {
    completenessDetails.push({ key: 'education', passed: false, score: 0, max: 8, label: 'Education section empty or contains placeholder text' })
    rules.push({ id: 'comp_edu', category: 'completeness', passed: false, pointsEarned: 0, maxPoints: 8, label: 'Education credentials' })
    suggestions.push({
      id: 'sug_comp_edu',
      category: 'completeness',
      section: 'Education',
      impact: 'high',
      pointsDeducted: 8,
      message: 'Add your current or completed college education, degree, and graduation year.'
    })
  }

  // 2.2 Projects & Experience Substance (12 pts max) - FAIR TO STUDENTS AND FRESHERS
  // Inspect whether descriptions contain substantive information (not merely non-empty)
  const substantiveProjects = projList.filter(pr => {
    const title = (pr.title || '').trim()
    const desc = (pr.description || '').trim()
    const tech = (pr.tech || '').trim()
    const words = desc.split(/\s+/).filter(Boolean).length
    return title.length >= 3 && !hasPlaceholderText(title) && !hasPlaceholderText(desc) && 
      (words >= 10 || (tech.length >= 3 && words >= 6))
  })

  const substantiveExperience = expList.filter(ex => {
    const role = (ex.role || '').trim()
    const comp = (ex.company || '').trim()
    const desc = (ex.description || '').trim()
    const words = desc.split(/\s+/).filter(Boolean).length
    return role.length >= 2 && comp.length >= 2 && !hasPlaceholderText(role) && !hasPlaceholderText(desc) && words >= 8
  })

  const totalSubstantiveWork = substantiveProjects.length + substantiveExperience.length

  if (totalSubstantiveWork >= 2) {
    completenessScore += 12
    completenessDetails.push({
      key: 'projects_experience',
      passed: true,
      score: 12,
      max: 12,
      label: `Substantive projects & experience (${substantiveProjects.length} projects, ${substantiveExperience.length} work entries)`
    })
    rules.push({ id: 'comp_work', category: 'completeness', passed: true, pointsEarned: 12, maxPoints: 12, label: 'Substantive project or work entries' })
  } else if (totalSubstantiveWork === 1) {
    completenessScore += 7
    completenessDetails.push({
      key: 'projects_experience',
      passed: false,
      score: 7,
      max: 12,
      label: 'Single substantive project or experience entry'
    })
    rules.push({ id: 'comp_work', category: 'completeness', passed: false, pointsEarned: 7, maxPoints: 12, label: 'Substantive project or work entries' })
    suggestions.push({
      id: 'sug_comp_work',
      category: 'completeness',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 5,
      message: 'Add at least 2 substantive academic or personal projects (or work experiences) detailing your implementation and methods.'
    })
  } else if ((projList.length > 0 || expList.length > 0) && !containsPlaceholders) {
    completenessScore += 3
    completenessDetails.push({
      key: 'projects_experience',
      passed: false,
      score: 3,
      max: 12,
      label: 'Projects or experience entries lack substantive descriptions'
    })
    rules.push({ id: 'comp_work', category: 'completeness', passed: false, pointsEarned: 3, maxPoints: 12, label: 'Substantive project or work entries' })
    suggestions.push({
      id: 'sug_comp_work',
      category: 'completeness',
      section: 'Projects',
      impact: 'high',
      pointsDeducted: 9,
      message: 'Expand your project descriptions. Explain what problem you solved, technologies used, and outcomes achieved.'
    })
  } else {
    completenessDetails.push({
      key: 'projects_experience',
      passed: false,
      score: 0,
      max: 12,
      label: 'No projects or experience listed'
    })
    rules.push({ id: 'comp_work', category: 'completeness', passed: false, pointsEarned: 0, maxPoints: 12, label: 'Substantive project or work entries' })
    suggestions.push({
      id: 'sug_comp_work',
      category: 'completeness',
      section: 'Projects',
      impact: 'high',
      pointsDeducted: 12,
      message: 'Add your course projects, capstone projects, or technical internships with clear descriptions.'
    })
  }
  completenessScore = Math.min(20, completenessScore)

  // ---------------------------------------------------------------------------
  // Category 3: Skills and technical relevance (15 points max)
  // ---------------------------------------------------------------------------
  let skillsRelevanceScore = 0
  const skillsDetails = []

  // 3.1 Distinct canonical skills breadth (8 pts max)
  // Deduplicates skills after normalization; prevents keyword inflation
  const distinctSkillsCount = skillsList.length
  if (distinctSkillsCount >= 5) {
    skillsRelevanceScore += 8
    skillsDetails.push({ key: 'skills_breadth', passed: true, score: 8, max: 8, label: `Strong skills portfolio (${distinctSkillsCount} distinct canonical skills)` })
    rules.push({ id: 'sk_breadth', category: 'skills', passed: true, pointsEarned: 8, maxPoints: 8, label: 'Technical skills diversity' })
  } else if (distinctSkillsCount >= 3) {
    skillsRelevanceScore += 5
    skillsDetails.push({ key: 'skills_breadth', passed: false, score: 5, max: 8, label: `Moderate skills listed (${distinctSkillsCount} distinct skills)` })
    rules.push({ id: 'sk_breadth', category: 'skills', passed: false, pointsEarned: 5, maxPoints: 8, label: 'Technical skills diversity' })
    suggestions.push({
      id: 'sug_sk_breadth',
      category: 'skills',
      section: 'Skills & Tech',
      impact: 'medium',
      pointsDeducted: 3,
      message: 'List at least 5-6 distinct technical skills across Programming Languages, Frameworks, and Developer Tools.'
    })
  } else if (distinctSkillsCount >= 1) {
    skillsRelevanceScore += 2
    skillsDetails.push({ key: 'skills_breadth', passed: false, score: 2, max: 8, label: 'Very few skills listed' })
    rules.push({ id: 'sk_breadth', category: 'skills', passed: false, pointsEarned: 2, maxPoints: 8, label: 'Technical skills diversity' })
    suggestions.push({
      id: 'sug_sk_breadth',
      category: 'skills',
      section: 'Skills & Tech',
      impact: 'high',
      pointsDeducted: 6,
      message: 'Add more relevant technologies, frameworks, and developer tools you have learned or used.'
    })
  } else {
    skillsDetails.push({ key: 'skills_breadth', passed: false, score: 0, max: 8, label: 'No skills listed' })
    rules.push({ id: 'sk_breadth', category: 'skills', passed: false, pointsEarned: 0, maxPoints: 8, label: 'Technical skills diversity' })
    suggestions.push({
      id: 'sug_sk_breadth',
      category: 'skills',
      section: 'Skills & Tech',
      impact: 'high',
      pointsDeducted: 8,
      message: 'Add technical skills in Languages, Frameworks, and Tools in the Skills section.'
    })
  }

  // 3.2 Evidence of listed skills in narrative text (7 pts max)
  // Distinguishes skills merely declared from skills demonstrated in project/work narrative
  const evidencedSkills = skillsList.filter(sk => textContainsSkill(narrativeText, sk))
  if (evidencedSkills.length >= 3) {
    skillsRelevanceScore += 7
    skillsDetails.push({
      key: 'skills_evidence',
      passed: true,
      score: 7,
      max: 7,
      label: `Skills demonstrated in project narrative (${evidencedSkills.slice(0, 4).join(', ')})`
    })
    rules.push({ id: 'sk_evidence', category: 'skills', passed: true, pointsEarned: 7, maxPoints: 7, label: 'Applied skill demonstration' })
  } else if (evidencedSkills.length >= 1) {
    skillsRelevanceScore += 4
    skillsDetails.push({
      key: 'skills_evidence',
      passed: false,
      score: 4,
      max: 7,
      label: `Some listed skills demonstrated in projects (${evidencedSkills.join(', ')})`
    })
    rules.push({ id: 'sk_evidence', category: 'skills', passed: false, pointsEarned: 4, maxPoints: 7, label: 'Applied skill demonstration' })
    suggestions.push({
      id: 'sug_sk_evidence',
      category: 'skills',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 3,
      message: 'Demonstrate more of your listed technical skills directly inside project and experience bullet points.'
    })
  } else if (skillsList.length > 0) {
    skillsRelevanceScore += 1
    skillsDetails.push({
      key: 'skills_evidence',
      passed: false,
      score: 1,
      max: 7,
      label: 'Listed skills not demonstrated in project narrative'
    })
    rules.push({ id: 'sk_evidence', category: 'skills', passed: false, pointsEarned: 1, maxPoints: 7, label: 'Applied skill demonstration' })
    suggestions.push({
      id: 'sug_sk_evidence',
      category: 'skills',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 6,
      message: 'Mention the tools and languages you used directly in your project descriptions to demonstrate applied capability.'
    })
  }
  skillsRelevanceScore = Math.min(15, skillsRelevanceScore)

  // ---------------------------------------------------------------------------
  // Category 4: Accomplishments and supporting evidence (25 points max)
  // ---------------------------------------------------------------------------
  let evidenceScore = 0
  const evidenceDetails = []

  // 4.1 Action-oriented context statements (14 pts max)
  // Check whether bullet points combine action verbs + tools + context/deliverables
  const matchedActionVerbs = Array.from(new Set(
    narrativeTokens.filter(token => ACTION_VERBS.has(token))
  ))

  const sentences = narrativeText
    .split(/[.!?\n•]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20)

  const contextualActionSentences = sentences.filter(s => {
    const tokens = tokenizeText(s)
    const hasVerb = tokens.some(t => ACTION_VERBS.has(t))
    const words = tokens.length
    return hasVerb && words >= 8 && !hasPlaceholderText(s)
  })

  if (contextualActionSentences.length >= 2 && matchedActionVerbs.length >= 3) {
    evidenceScore += 14
    evidenceDetails.push({
      key: 'action_context',
      passed: true,
      score: 14,
      max: 14,
      label: `Strong action-oriented accomplishment statements (${matchedActionVerbs.slice(0, 4).join(', ')})`
    })
    rules.push({ id: 'ev_actions', category: 'evidence', passed: true, pointsEarned: 14, maxPoints: 14, label: 'Contextual action statements' })
  } else if (contextualActionSentences.length >= 1 || matchedActionVerbs.length >= 2) {
    evidenceScore += 8
    evidenceDetails.push({
      key: 'action_context',
      passed: false,
      score: 8,
      max: 14,
      label: 'Some action verbs detected, but descriptions need more context'
    })
    rules.push({ id: 'ev_actions', category: 'evidence', passed: false, pointsEarned: 8, maxPoints: 14, label: 'Contextual action statements' })
    suggestions.push({
      id: 'sug_ev_actions',
      category: 'evidence',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 6,
      message: 'Begin project bullet points with action verbs (e.g. Architected, Engineered, Developed) and state the method and outcome.'
    })
  } else {
    evidenceDetails.push({
      key: 'action_context',
      passed: false,
      score: 0,
      max: 14,
      label: 'No standard action verbs or structured accomplishment statements detected'
    })
    rules.push({ id: 'ev_actions', category: 'evidence', passed: false, pointsEarned: 0, maxPoints: 14, label: 'Contextual action statements' })
    suggestions.push({
      id: 'sug_ev_actions',
      category: 'evidence',
      section: 'Projects',
      impact: 'high',
      pointsDeducted: 14,
      message: 'Frame your project work with clear action verbs describing what you built, how you built it, and what was achieved.'
    })
  }

  // 4.2 Measurable & Quantifiable Evidence (11 pts max)
  const metricRegex = /\b(\d+%\s*|\d+\+\s*|\d+x\b|\b\d+\s*(users|clients|students|members|requests|ms|kb|mb|gb|fps|sec|seconds|records|stars|downloads|pages|queries)\b|\bteam of \d+\b|\b\d+%\s*accuracy\b)/gi
  const metricMatches = narrativeText.match(metricRegex) || []
  const uniqueMetrics = Array.from(new Set(metricMatches.map(m => m.trim().toLowerCase())))

  if (uniqueMetrics.length >= 2 && !containsPlaceholders) {
    evidenceScore += 11
    evidenceDetails.push({
      key: 'metrics',
      passed: true,
      score: 11,
      max: 11,
      label: `Measurable outcomes detected (${uniqueMetrics.slice(0, 3).join(', ')})`
    })
    rules.push({ id: 'ev_metrics', category: 'evidence', passed: true, pointsEarned: 11, maxPoints: 11, label: 'Quantifiable metrics' })
  } else if (uniqueMetrics.length === 1 && !containsPlaceholders) {
    evidenceScore += 7
    evidenceDetails.push({
      key: 'metrics',
      passed: false,
      score: 7,
      max: 11,
      label: `One quantifiable metric found (${uniqueMetrics[0]})`
    })
    rules.push({ id: 'ev_metrics', category: 'evidence', passed: false, pointsEarned: 7, maxPoints: 11, label: 'Quantifiable metrics' })
    suggestions.push({
      id: 'sug_ev_metrics',
      category: 'evidence',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 4,
      message: 'Add another quantifiable outcome (e.g., team size, records processed, response time, or accuracy percentage).'
    })
  } else {
    evidenceDetails.push({
      key: 'metrics',
      passed: false,
      score: 0,
      max: 11,
      label: 'No measurable metrics or numerical evidence detected'
    })
    rules.push({ id: 'ev_metrics', category: 'evidence', passed: false, pointsEarned: 0, maxPoints: 11, label: 'Quantifiable metrics' })
    suggestions.push({
      id: 'sug_ev_metrics',
      category: 'evidence',
      section: 'Projects',
      impact: 'medium',
      pointsDeducted: 11,
      message: 'Add measurable impact where available (e.g. "team of 4", "handled 500+ records", "improved query speed by 30%").'
    })
  }
  evidenceScore = Math.min(25, evidenceScore)

  // ---------------------------------------------------------------------------
  // Category 5: Consistency and formatting hygiene (15 points max)
  // ---------------------------------------------------------------------------
  let hygieneScore = 0
  const hygieneDetails = []

  if (isCompletelyEmpty) {
    hygieneScore = 0
    hygieneDetails.push({ key: 'no_placeholders', passed: false, score: 0, max: 5, label: 'Document is empty' })
  } else if (containsPlaceholders) {
    hygieneScore = 0
    hygieneDetails.push({ key: 'no_placeholders', passed: false, score: 0, max: 5, label: 'Placeholder filler text detected' })
    rules.push({ id: 'hy_placeholders', category: 'hygiene', passed: false, pointsEarned: 0, maxPoints: 5, label: 'Placeholder hygiene' })
    suggestions.push({
      id: 'sug_hy_placeholders',
      category: 'hygiene',
      section: 'Personal Details',
      impact: 'high',
      pointsDeducted: 5,
      message: 'Remove generic placeholder or template filler text (e.g., "Lorem ipsum", "TODO", "Your Name") before exporting.'
    })
  } else {
    // 5.1 Placeholder text (5 pts max)
    hygieneScore += 5
    hygieneDetails.push({ key: 'no_placeholders', passed: true, score: 5, max: 5, label: 'Clean document with zero template placeholder text' })
    rules.push({ id: 'hy_placeholders', category: 'hygiene', passed: true, pointsEarned: 5, maxPoints: 5, label: 'Placeholder hygiene' })

    // 5.2 Clean Web URLs (3 pts max)
    const rawUrls = [p.linkedin, p.github, p.portfolio, ...projList.map(pr => pr.link)].filter(Boolean)
    const invalidUrls = rawUrls.filter(u => {
      if (typeof u !== 'string' || !u.trim()) return false
      const val = u.trim()
      const isStandardUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(val) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(val)
      return !isStandardUrl
    })
    if (rawUrls.length > 0 && invalidUrls.length === 0) {
      hygieneScore += 3
      hygieneDetails.push({ key: 'url_hygiene', passed: true, score: 3, max: 3, label: 'Web URLs cleanly formatted' })
      rules.push({ id: 'hy_urls', category: 'hygiene', passed: true, pointsEarned: 3, maxPoints: 3, label: 'Web URL validity' })
    } else if (rawUrls.length === 0) {
      hygieneScore += 1
      hygieneDetails.push({ key: 'url_hygiene', passed: true, score: 1, max: 3, label: 'No web profile URLs provided' })
      rules.push({ id: 'hy_urls', category: 'hygiene', passed: true, pointsEarned: 1, maxPoints: 3, label: 'Web URL validity' })
    } else {
      hygieneScore += 0
      hygieneDetails.push({ key: 'url_hygiene', passed: false, score: 0, max: 3, label: 'Irregular or invalid URL syntax' })
      rules.push({ id: 'hy_urls', category: 'hygiene', passed: false, pointsEarned: 0, maxPoints: 3, label: 'Web URL validity' })
      suggestions.push({
        id: 'sug_hy_urls',
        category: 'hygiene',
        section: 'Personal Details',
        field: 'links',
        impact: 'low',
        pointsDeducted: 2,
        message: 'Verify that GitHub, LinkedIn, and project links follow standard URL format (e.g., https://github.com/username).'
      })
    }

    // 5.3 Date validity and chronological consistency (4 pts max)
    let dateContradiction = false
    const currentYear = new Date().getFullYear()

    const checkDatePair = (start, end) => {
      const sYear = parseInt((String(start || '').match(/\b(20\d\d|19\d\d)\b/) || [])[0], 10)
      const eYear = parseInt((String(end || '').match(/\b(20\d\d|19\d\d)\b/) || [])[0], 10)
      if (sYear && eYear && eYear < sYear) {
        dateContradiction = true
      }
      if (sYear && (sYear < 1980 || sYear > currentYear + 6)) {
        dateContradiction = true
      }
    }

    eduList.forEach(e => checkDatePair(e.startYear || e.year, e.endYear || e.year))
    expList.forEach(e => checkDatePair(e.startDate, e.endDate))

    if (!dateContradiction) {
      hygieneScore += 4
      hygieneDetails.push({ key: 'date_consistency', passed: true, score: 4, max: 4, label: 'Dates and years are chronologically consistent' })
      rules.push({ id: 'hy_dates', category: 'hygiene', passed: true, pointsEarned: 4, maxPoints: 4, label: 'Date chronology & consistency' })
    } else {
      hygieneScore += 1
      hygieneDetails.push({ key: 'date_consistency', passed: false, score: 1, max: 4, label: 'Inconsistent dates or reverse chronology detected' })
      rules.push({ id: 'hy_dates', category: 'hygiene', passed: false, pointsEarned: 1, maxPoints: 4, label: 'Date chronology & consistency' })
      suggestions.push({
        id: 'sug_hy_dates',
        category: 'hygiene',
        section: 'Education',
        impact: 'medium',
        pointsDeducted: 3,
        message: 'Check your graduation or experience dates: ensure end dates do not precede start dates.'
      })
    }

    // 5.4 Repetition and wall-of-text formatting (3 pts max)
    const longBlocks = projList.concat(expList).some(item => {
      const d = item.description || ''
      return d.length > 600 && !d.includes('\n') && !d.includes('•')
    })

    const descList = projList.concat(expList).map(i => (i.description || '').trim()).filter(Boolean)
    const hasDuplicateDesc = descList.length > 1 && new Set(descList).size < descList.length

    if (!longBlocks && !hasDuplicateDesc) {
      hygieneScore += 3
      hygieneDetails.push({ key: 'bullet_structure', passed: true, score: 3, max: 3, label: 'Concise bullet points with clean readable structure' })
      rules.push({ id: 'hy_structure', category: 'hygiene', passed: true, pointsEarned: 3, maxPoints: 3, label: 'Readable description structure' })
    } else {
      hygieneScore += 1
      hygieneDetails.push({ key: 'bullet_structure', passed: false, score: 1, max: 3, label: 'Descriptions contain long unbroken blocks or duplicated content' })
      rules.push({ id: 'hy_structure', category: 'hygiene', passed: false, pointsEarned: 1, maxPoints: 3, label: 'Readable description structure' })
      suggestions.push({
        id: 'sug_hy_bullets',
        category: 'hygiene',
        section: 'Projects',
        impact: 'low',
        pointsDeducted: 2,
        message: 'Break long paragraphs into 2-3 concise, readable bullet points and eliminate duplicate sentences.'
      })
    }
  }
  hygieneScore = Math.min(15, hygieneScore)

  // ---------------------------------------------------------------------------
  // Category 6: Clarity and standard resume structure (15 points max)
  // ---------------------------------------------------------------------------
  let structureScore = 0
  const structureDetails = []

  // 6.1 Standard Section Hierarchy (8 pts max)
  const hasContact = hasValidName && (hasValidEmail || hasValidPhone)
  const hasEdu = validEdu.length >= 1
  const hasSkills = skillsList.length >= 2
  const hasWorkOrProj = substantiveProjects.length >= 1 || substantiveExperience.length >= 1

  const coreSectionsCount = [hasContact, hasEdu, hasSkills, hasWorkOrProj].filter(Boolean).length
  if (coreSectionsCount === 4) {
    structureScore += 8
    structureDetails.push({ key: 'hierarchy', passed: true, score: 8, max: 8, label: 'Standard ATS-friendly section hierarchy present' })
    rules.push({ id: 'st_hierarchy', category: 'structure', passed: true, pointsEarned: 8, maxPoints: 8, label: 'Section hierarchy' })
  } else if (coreSectionsCount >= 3) {
    structureScore += 5
    structureDetails.push({ key: 'hierarchy', passed: false, score: 5, max: 8, label: 'One standard section missing or incomplete' })
    rules.push({ id: 'st_hierarchy', category: 'structure', passed: false, pointsEarned: 5, maxPoints: 8, label: 'Section hierarchy' })
    suggestions.push({
      id: 'sug_st_hierarchy',
      category: 'structure',
      section: 'Resume Sections',
      impact: 'medium',
      pointsDeducted: 3,
      message: 'Ensure your resume includes all standard sections: Personal Details, Education, Skills, and Projects/Experience.'
    })
  } else if (coreSectionsCount >= 2) {
    structureScore += 3
    structureDetails.push({ key: 'hierarchy', passed: false, score: 3, max: 8, label: 'Multiple core resume sections missing' })
    rules.push({ id: 'st_hierarchy', category: 'structure', passed: false, pointsEarned: 3, maxPoints: 8, label: 'Section hierarchy' })
  } else {
    structureScore += 0
    structureDetails.push({ key: 'hierarchy', passed: false, score: 0, max: 8, label: 'Core resume sections missing or placeholder' })
    rules.push({ id: 'st_hierarchy', category: 'structure', passed: false, pointsEarned: 0, maxPoints: 8, label: 'Section hierarchy' })
  }

  // 6.2 Template layout ATS friendliness (7 pts max)
  const tplProfile = getTemplateProfile(templateId)
  const layoutPts = tplProfile.layoutScore || 6
  structureScore += layoutPts
  structureDetails.push({
    key: 'template_layout',
    passed: layoutPts >= 7,
    score: layoutPts,
    max: 7,
    templateId,
    rating: tplProfile.rating,
    badge: tplProfile.badge,
    label: `${tplProfile.name} (${tplProfile.label})`
  })
  rules.push({ id: 'st_template', category: 'structure', passed: layoutPts >= 7, pointsEarned: layoutPts, maxPoints: 7, label: 'Template layout profile' })

  if (tplProfile.rating === 'provisional_caution') {
    suggestions.push({
      id: 'sug_st_template',
      category: 'structure',
      section: 'Templates',
      impact: 'low',
      pointsDeducted: 2,
      message: `The selected "${tplProfile.name}" template uses a two-column layout. For older enterprise or government portals with primitive text parsers, a single-column layout (Minimal ATS or ATS-Safe Elegant) offers optimal linear text flow.`
    })
  }
  structureScore = Math.min(15, structureScore)

  // ---------------------------------------------------------------------------
  // Total ATS Readiness Calculation (Exact 100 max)
  // ---------------------------------------------------------------------------
  const totalScore = Math.min(100, Math.max(0, Math.round(
    identityScore +
    completenessScore +
    skillsRelevanceScore +
    evidenceScore +
    hygieneScore +
    structureScore
  )))

  let ratingLabel = 'Needs Improvement'
  if (totalScore >= 85) ratingLabel = 'ATS Ready'
  else if (totalScore >= 70) ratingLabel = 'Good Foundation'
  else if (totalScore >= 50) ratingLabel = 'Developing'

  return {
    status: 'calculated',
    version: '2.0.0',
    totalScore,
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
        max: 20,
        label: 'Core Section Completeness & Substance',
        details: completenessDetails
      },
      skillsRelevance: {
        score: skillsRelevanceScore,
        max: 15,
        label: 'Skills & Technical Relevance',
        distinctSkillsCount,
        details: skillsDetails
      },
      contentEvidence: {
        score: evidenceScore,
        max: 25,
        label: 'Accomplishments & Supporting Evidence',
        actionVerbCount: matchedActionVerbs.length,
        actionVerbsFound: matchedActionVerbs,
        metricMatches: uniqueMetrics,
        details: evidenceDetails
      },
      formattingHygiene: {
        score: hygieneScore,
        max: 15,
        label: 'Consistency & Formatting Hygiene',
        details: hygieneDetails
      },
      structureLayout: {
        score: structureScore,
        max: 15,
        label: 'Clarity & Standard Resume Structure',
        templateId,
        templateRating: tplProfile.rating,
        templateBadge: tplProfile.badge,
        details: structureDetails
      },
      // Backwards compatibility aliases for UI/tests
      templateCompatibility: {
        score: layoutPts,
        max: 7,
        templateId,
        rating: tplProfile.rating,
        profileBadge: tplProfile.badge,
        label: tplProfile.name
      },
      skillsQuality: {
        score: skillsRelevanceScore,
        max: 15,
        label: 'Skills & Technical Relevance'
      }
    },
    rules,
    suggestions
  }
}

/**
 * -----------------------------------------------------------------------------
 * 2. INDEPENDENT JOB MATCH SCORING ENGINE (0 - 100 POINTS)
 * -----------------------------------------------------------------------------
 * Exact Categories:
 * 1. Explicit required skills and qualifications: 35 max
 * 2. Other relevant skills and tools: 25 max
 * 3. Evidence in projects and experience: 25 max
 * 4. Education and certifications: 10 max
 * 5. Job title and domain alignment: 5 max
 * Total = 100 max
 */
export function calculateJobMatch(resume, jobDescription) {
  if (!jobDescription || typeof jobDescription !== 'string') {
    return {
      status: 'not_calculated',
      score: null,
      version: '2.0.0',
      message: 'Not calculated — add a job description to evaluate the match.',
      suggestions: []
    }
  }

  const trimmedJd = jobDescription.trim()
  if (trimmedJd.length === 0) {
    return {
      status: 'not_calculated',
      score: null,
      version: '2.0.0',
      message: 'Not calculated — add a job description to evaluate the match.',
      suggestions: []
    }
  }

  const allJdTokens = tokenizeText(trimmedJd)
  const meaningfulTokens = allJdTokens.filter(w => !STOP_WORDS.has(w))

  // Threshold: at least 15 meaningful words and 100 characters
  if (trimmedJd.length < 100 || meaningfulTokens.length < 15) {
    return {
      status: 'insufficient_job_description',
      score: null,
      version: '2.0.0',
      message: 'Job description provides insufficient information to calculate a reliable match score. Please paste a more detailed job posting with requirements and skills.',
      tokenCount: meaningfulTokens.length,
      suggestions: []
    }
  }

  const safeResume = resume || {}
  const resumeSkills = extractSkillsList(safeResume.skills)
  const resumeSkillsSet = new Set(resumeSkills)
  const { fullText, narrativeText } = compileResumeText(safeResume)
  const narrativeLower = narrativeText.toLowerCase()
  const fullTextLower = fullText.toLowerCase()

  // 1. Requirement Extraction & Mandatory vs Preferred Parsing
  const jdSections = trimmedJd.split(/[\n\r]+/)
  const mandatoryTokensList = []
  const preferredTokensList = []
  let inMandatorySection = false
  let inPreferredSection = false

  const mandatoryHeadingRegex = /\b(required|requirements|must have|mandatory|minimum qualifications|basic qualifications)\b/i
  const preferredHeadingRegex = /\b(preferred|nice to have|plus|bonus|desired|preferred qualifications)\b/i

  jdSections.forEach(section => {
    if (mandatoryHeadingRegex.test(section)) {
      inMandatorySection = true
      inPreferredSection = false
    } else if (preferredHeadingRegex.test(section)) {
      inPreferredSection = true
      inMandatorySection = false
    }

    // Extract canonical technical skills from this section
    for (const [alias, canonical] of Object.entries(CANONICAL_ALIASES)) {
      if (KNOWN_TECH_KEYWORDS.has(canonical) && textContainsSkill(section, alias)) {
        if (inMandatorySection) mandatoryTokensList.push(canonical)
        else if (inPreferredSection) preferredTokensList.push(canonical)
      }
    }
  })

  // Extract all distinct canonical technical skills present in the overall JD
  const allJdCanonicalSkills = Array.from(new Set(
    Object.entries(CANONICAL_ALIASES)
      .filter(([alias, canonical]) => KNOWN_TECH_KEYWORDS.has(canonical) && textContainsSkill(trimmedJd, alias))
      .map(([, canonical]) => canonical)
  ))

  if (allJdCanonicalSkills.length === 0) {
    return {
      status: 'insufficient_job_description',
      score: null,
      version: '2.0.0',
      message: 'Unable to detect recognizable technical skills or qualifications in the text. Please provide specific technical requirements.',
      suggestions: []
    }
  }

  // Deduplicated mandatory vs preferred sets
  let explicitRequired = Array.from(new Set(mandatoryTokensList))
  let explicitPreferred = Array.from(new Set(preferredTokensList)).filter(k => !explicitRequired.includes(k))

  // If no explicit section headers were found, divide technical skills reasonably
  if (explicitRequired.length === 0) {
    const splitIndex = Math.min(Math.ceil(allJdCanonicalSkills.length * 0.6), 6)
    explicitRequired = allJdCanonicalSkills.slice(0, splitIndex)
    explicitPreferred = allJdCanonicalSkills.slice(splitIndex)
  }

  const suggestions = []

  // ---------------------------------------------------------------------------
  // Category 1: Explicit required skills and qualifications (35 points max)
  // ---------------------------------------------------------------------------
  const matchedRequired = explicitRequired.filter(skill => {
    return resumeSkillsSet.has(skill) || textContainsSkill(fullTextLower, skill)
  })
  const missingRequired = explicitRequired.filter(skill => !matchedRequired.includes(skill))

  const requiredRatio = explicitRequired.length > 0 ? (matchedRequired.length / explicitRequired.length) : 0
  const requiredSkillsScore = Math.min(35, Math.round(requiredRatio * 35))

  if (missingRequired.length > 0) {
    suggestions.push({
      category: 'missing_required_skills',
      section: 'Skills & Tech',
      impact: 'high',
      message: `The job description emphasizes required skills not currently demonstrated in your resume: ${missingRequired.slice(0, 4).join(', ')}. Add relevant evidence only if you genuinely possess these skills.`,
      keywords: missingRequired.slice(0, 4)
    })
  }

  // ---------------------------------------------------------------------------
  // Category 2: Other relevant skills and tools (25 points max)
  // ---------------------------------------------------------------------------
  let otherSkillsScore = 0
  const matchedOther = []
  const missingOther = []

  if (explicitPreferred.length > 0) {
    explicitPreferred.forEach(skill => {
      if (resumeSkillsSet.has(skill) || textContainsSkill(fullTextLower, skill)) {
        matchedOther.push(skill)
      } else {
        missingOther.push(skill)
      }
    })
    const otherRatio = matchedOther.length / explicitPreferred.length
    otherSkillsScore = Math.min(25, Math.round(otherRatio * 25))
  } else {
    // If JD has other technical skills mentioned outside the mandatory section, match against them
    const otherJdSkills = allJdCanonicalSkills.filter(sk => !explicitRequired.includes(sk))
    if (otherJdSkills.length > 0) {
      otherJdSkills.forEach(skill => {
        if (resumeSkillsSet.has(skill) || textContainsSkill(fullTextLower, skill)) {
          matchedOther.push(skill)
        } else {
          missingOther.push(skill)
        }
      })
      const otherRatio = matchedOther.length / otherJdSkills.length
      otherSkillsScore = Math.min(25, Math.round(otherRatio * 25))
    } else {
      // If the JD had only required skills, otherSkills aligns with the required skills ratio
      otherSkillsScore = Math.min(25, Math.round(requiredRatio * 25))
    }
  }

  // ---------------------------------------------------------------------------
  // Category 3: Evidence in projects and experience (25 points max)
  // ---------------------------------------------------------------------------
  const allMatchedSkills = Array.from(new Set([...matchedRequired, ...matchedOther]))
  const evidencedInProjects = allMatchedSkills.filter(skill => textContainsSkill(narrativeLower, skill))

  let projectEvidenceScore = 0
  if (allMatchedSkills.length > 0) {
    const evidenceRatio = evidencedInProjects.length / Math.min(allMatchedSkills.length, 5)
    projectEvidenceScore = Math.min(25, Math.round(Math.min(1, evidenceRatio) * 25))
  }

  const unevidencedMatched = allMatchedSkills.filter(skill => !evidencedInProjects.includes(skill))
  if (unevidencedMatched.length > 0) {
    suggestions.push({
      category: 'evidence_gap',
      section: 'Projects',
      impact: 'medium',
      message: `You listed "${unevidencedMatched.slice(0, 3).join(', ')}" in skills, but your project and experience descriptions have no clear evidence showing how you used them. Add bullet points detailing your practical implementation.`,
      keywords: unevidencedMatched.slice(0, 3)
    })
  }

  // ---------------------------------------------------------------------------
  // Category 4: Education and certifications alignment (10 points max)
  // ---------------------------------------------------------------------------
  let educationScore = 0
  const eduText = (safeResume.education || []).map(e => `${e.degree || ''} ${e.department || ''} ${e.college || ''}`).join(' ').toLowerCase()
  const certText = (safeResume.certifications || []).map(c => `${c.course || ''} ${c.platform || ''}`).join(' ').toLowerCase()
  const combinedCredentials = `${eduText} ${certText}`

  const eduDegreeTerms = ['bachelor', 'b.tech', 'btech', 'b.e', 'be', 'b.sc', 'mca', 'm.tech', 'computer science', 'engineering', 'information technology']
  const jdRequiresDegree = eduDegreeTerms.some(term => textContainsSkill(trimmedJd, term))

  if (eduText.length >= 3) {
    educationScore += 5
    if (jdRequiresDegree && eduDegreeTerms.some(term => textContainsSkill(combinedCredentials, term))) {
      educationScore += 5
    } else if (!jdRequiresDegree) {
      educationScore += 5
    }
  }
  educationScore = Math.min(10, educationScore)

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Category 5: Job title and domain alignment (5 points max)
  // ---------------------------------------------------------------------------
  let domainScore = 0
  const domainQualifiers = {
    'full stack': ['full stack', 'fullstack', 'full-stack'],
    'frontend': ['frontend', 'front end', 'front-end', 'web developer', 'ui developer'],
    'backend': ['backend', 'back end', 'back-end'],
    'mobile': ['mobile', 'ios', 'android', 'flutter', 'react native', 'swift'],
    'cloud': ['cloud', 'devops', 'sre', 'infrastructure'],
    'data': ['data engineer', 'data scientist', 'data science', 'machine learning', 'ai', 'data analyst'],
    'qa': ['qa', 'quality assurance', 'test engineer', 'sdet']
  }
  const genericTitles = ['developer', 'engineer', 'architect', 'consultant', 'analyst', 'intern', 'programmer']

  const rolesInResume = [
    safeResume.personal?.summary || '',
    ...(safeResume.experience || []).map(e => e.role || ''),
    ...(safeResume.projects || []).map(pr => pr.title || '')
  ].join(' ').toLowerCase()

  // Identify target domains and generic titles in the job description
  const targetDomains = Object.keys(domainQualifiers).filter(domain =>
    domainQualifiers[domain].some(alias => textContainsSkill(trimmedJd, alias))
  )
  const targetGenericTitles = genericTitles.filter(t => textContainsSkill(trimmedJd, t))

  // Identify candidate's stated domains and generic titles
  const candidateDomains = Object.keys(domainQualifiers).filter(domain =>
    domainQualifiers[domain].some(alias => textContainsSkill(rolesInResume, alias))
  )
  const candidateGenericTitles = genericTitles.filter(t => textContainsSkill(rolesInResume, t))

  if (targetDomains.length > 0) {
    const hasExactDomain = targetDomains.some(td => candidateDomains.includes(td))
    const isFullStackTarget = targetDomains.includes('full stack')
    const hasRelatedWebDomain = isFullStackTarget && (candidateDomains.includes('frontend') || candidateDomains.includes('backend'))
    const hasConflictingDomain = candidateDomains.length > 0 && !hasExactDomain && !hasRelatedWebDomain

    if (hasExactDomain) {
      domainScore = 5
    } else if (hasRelatedWebDomain) {
      domainScore = 3
    } else if (hasConflictingDomain) {
      domainScore = 1 // Conflicting domain (e.g. mobile candidate applying for full stack role)
    } else if (candidateGenericTitles.length > 0 && targetGenericTitles.some(gt => candidateGenericTitles.includes(gt))) {
      domainScore = 3 // Generic title match without conflicting domain
    } else {
      domainScore = 1 // Missing role/domain alignment
    }
  } else if (targetGenericTitles.length > 0) {
    const titleMatch = targetGenericTitles.some(gt => candidateGenericTitles.includes(gt))
    domainScore = titleMatch ? 5 : 1
  } else {
    domainScore = 3 // Generic JD without specific title or domain
  }

  if (domainScore < 5) {
    const highlightedRoles = targetDomains.length > 0 ? targetDomains : targetGenericTitles
    if (highlightedRoles.length > 0) {
      suggestions.push({
        category: 'role_alignment',
        section: 'Personal Details',
        field: 'summary',
        impact: 'low',
        message: `The posting emphasizes "${highlightedRoles.slice(0, 2).join(' / ')}". Consider aligning your professional summary or project titles with this focus area.`,
        keywords: highlightedRoles.slice(0, 2)
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Total Job Match Score (Exact 100 max)
  // ---------------------------------------------------------------------------
  const totalScore = Math.min(100, Math.max(0,
    requiredSkillsScore +
    otherSkillsScore +
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
    version: '2.0.0',
    totalScore,
    matchLevel,
    breakdown: {
      requiredSkills: {
        score: requiredSkillsScore,
        max: 35,
        label: 'Explicit Required Skills & Qualifications',
        targetCount: explicitRequired.length,
        matchedCount: matchedRequired.length,
        matched: matchedRequired,
        missing: missingRequired
      },
      otherSkills: {
        score: otherSkillsScore,
        max: 25,
        label: 'Other Relevant Skills & Tools',
        matchedCount: matchedOther.length
      },
      // Backwards compatibility alias
      skillOverlap: {
        score: otherSkillsScore,
        max: 25,
        label: 'Other Relevant Skills & Tools'
      },
      projectEvidence: {
        score: projectEvidenceScore,
        max: 25,
        label: 'Evidence in Projects & Work',
        evidencedCount: evidencedInProjects.length,
        matchedCount: allMatchedSkills.length
      },
      educationAlignment: {
        score: educationScore,
        max: 10,
        label: 'Education & Certifications'
      },
      roleDomainAlignment: {
        score: domainScore,
        max: 5,
        label: 'Job Title & Domain Alignment'
      }
    },
    matchedKeywords: allMatchedSkills,
    missingKeywords: missingRequired,
    evidencedKeywords: evidencedInProjects,
    suggestions
  }
}

/**
 * -----------------------------------------------------------------------------
 * 3. PDF PREFLIGHT & EXPORT VALIDATION
 * -----------------------------------------------------------------------------
 */
export function performPdfPreflight(resume, templateId) {
  const safeResume = resume || {}
  const tplId = templateId || safeResume.template || 'modern'
  const tplProfile = getTemplateProfile(tplId)
  const p = safeResume.personal || {}
  const issues = []
  const advisories = []

  // Check critical contact fields
  if (!p.name?.trim() || hasPlaceholderText(p.name)) {
    issues.push({ field: 'name', message: 'Full Name is missing or contains placeholder text.', level: 'error' })
  }
  if (!p.email?.trim() || hasPlaceholderText(p.email)) {
    issues.push({ field: 'email', message: 'Email address is missing or invalid.', level: 'error' })
  }
  if (!p.phone?.trim() || hasPlaceholderText(p.phone)) {
    issues.push({ field: 'phone', message: 'Phone number is missing.', level: 'warning' })
  }

  // Export pipeline reality notice
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

/**
 * -----------------------------------------------------------------------------
 * 4. SCORE SUGGESTIONS GENERATOR ARCHITECTURE
 * -----------------------------------------------------------------------------
 */
export function generateScoreSuggestions(resume, atsResult, jobMatchResult) {
  const allSuggestions = []
  const seenMessages = new Set()

  const addUnique = (sug) => {
    if (!sug || !sug.message) return
    const key = sug.message.trim().toLowerCase()
    if (!seenMessages.has(key)) {
      seenMessages.add(key)
      allSuggestions.push(sug)
    }
  }

  if (atsResult && Array.isArray(atsResult.suggestions)) {
    atsResult.suggestions.forEach(addUnique)
  }

  if (jobMatchResult && Array.isArray(jobMatchResult.suggestions)) {
    jobMatchResult.suggestions.forEach(addUnique)
  }

  const impactOrder = { high: 1, medium: 2, low: 3 }
  return allSuggestions.sort((a, b) => {
    const aVal = impactOrder[a.impact] || 4
    const bVal = impactOrder[b.impact] || 4
    return aVal - bVal
  })
}
