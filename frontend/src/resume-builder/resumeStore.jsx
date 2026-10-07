import { createContext, useContext, useState, useEffect } from 'react'

export const EMPTY_RESUME = {
  personal: {
    name: '', phone: '', email: '', linkedin: '',
    github: '', portfolio: '', location: '',
  },
  education: [
    { id: 1, college: '', degree: '', department: '', cgpa: '', year: '', intermediate: '', schooling: '' },
  ],
  skills: { languages: '', frameworks: '', tools: '', soft: '' },
  projects: [
    { id: 1, title: '', description: '', tech: '', link: '' },
  ],
  experience: [
    { id: 1, role: '', company: '', duration: '', description: '' },
  ],
  certifications: [
    { id: 1, course: '', platform: '', year: '' },
  ],
  achievements: '',
  template: 'modern',
}

export const SECTIONS = [
  { id: 'personal', num: '①', shortNum: '1', label: 'Personal Details', icon: '👤' },
  { id: 'education', num: '②', shortNum: '2', label: 'Education', icon: '🎓' },
  { id: 'skills', num: '③', shortNum: '3', label: 'Skills & Tech', icon: '⚡' },
  { id: 'experience', num: '④', shortNum: '4', label: 'Experience', icon: '💼' },
  { id: 'projects', num: '⑤', shortNum: '5', label: 'Projects', icon: '🚀' },
  { id: 'certifications', num: '⑥', shortNum: '6', label: 'Certifications', icon: '🏆' },
  { id: 'achievements', num: '⑦', shortNum: '7', label: 'Achievements', icon: '🥇' },
]

export function getSectionCompletion(resume, sectionId) {
  if (!resume) return { status: 'empty', label: 'Not started', percent: 0 }
  switch (sectionId) {
    case 'personal': {
      const p = resume.personal || {}
      const hasName = Boolean(p.name?.trim())
      const hasContact = Boolean(p.email?.trim() || p.phone?.trim())
      if (hasName && hasContact) return { status: 'complete', label: 'Complete', percent: 100 }
      if (hasName || hasContact || Boolean(p.location?.trim() || p.linkedin?.trim() || p.github?.trim())) {
        return { status: 'in-progress', label: 'In progress', percent: 50 }
      }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'education': {
      const list = resume.education || []
      const filled = list.filter(e => e.college?.trim() || e.degree?.trim())
      if (filled.length > 0 && filled.some(e => e.college?.trim() && e.degree?.trim())) {
        return { status: 'complete', label: 'Complete', percent: 100 }
      }
      if (filled.length > 0) return { status: 'in-progress', label: 'In progress', percent: 50 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'skills': {
      const s = resume.skills || {}
      const count = [s.languages, s.frameworks, s.tools, s.soft].filter(v => v?.trim()).length
      if (count >= 2) return { status: 'complete', label: 'Complete', percent: 100 }
      if (count === 1) return { status: 'in-progress', label: 'In progress', percent: 50 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'experience': {
      const list = resume.experience || []
      const filled = list.filter(e => e.role?.trim() || e.company?.trim())
      if (filled.length > 0 && filled.some(e => e.role?.trim() && e.company?.trim())) {
        return { status: 'complete', label: 'Complete', percent: 100 }
      }
      if (filled.length > 0) return { status: 'in-progress', label: 'In progress', percent: 50 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'projects': {
      const list = resume.projects || []
      const filled = list.filter(p => p.title?.trim() || p.description?.trim())
      if (filled.length > 0 && filled.some(p => p.title?.trim() && (p.description?.trim() || p.tech?.trim()))) {
        return { status: 'complete', label: 'Complete', percent: 100 }
      }
      if (filled.length > 0) return { status: 'in-progress', label: 'In progress', percent: 50 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'certifications': {
      const list = resume.certifications || []
      const filled = list.filter(c => c.course?.trim())
      if (filled.length > 0) return { status: 'complete', label: 'Complete', percent: 100 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    case 'achievements': {
      const text = resume.achievements?.trim() || ''
      if (text.length > 10) return { status: 'complete', label: 'Complete', percent: 100 }
      if (text.length > 0) return { status: 'in-progress', label: 'In progress', percent: 50 }
      return { status: 'empty', label: 'Not started', percent: 0 }
    }
    default:
      return { status: 'empty', label: 'Not started', percent: 0 }
  }
}

export function computeOverallCompleteness(resume) {
  if (!resume) return 0
  const weights = {
    personal: 20,
    education: 15,
    skills: 15,
    projects: 20,
    experience: 15,
    certifications: 10,
    achievements: 5,
  }
  let total = 0
  for (const [secId, weight] of Object.entries(weights)) {
    const res = getSectionCompletion(resume, secId)
    total += (res.percent / 100) * weight
  }
  return Math.min(100, Math.round(total))
}

const STORAGE_KEY = 'xbuddy_resume_draft_v1'

function getInitialResume() {
  if (typeof window === 'undefined') return EMPTY_RESUME
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        ...EMPTY_RESUME,
        ...parsed,
        personal: { ...EMPTY_RESUME.personal, ...(parsed.personal || {}) },
        skills: { ...EMPTY_RESUME.skills, ...(parsed.skills || {}) },
      }
    }
  } catch (e) {
    console.warn('Could not load saved resume from storage', e)
  }
  return EMPTY_RESUME
}

const ResumeContext = createContext(null)

export function ResumeProvider({ children }) {
  const [resume, setResume] = useState(getInitialResume)

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resume))
    } catch (e) {
      // Storage quota or private browsing
    }
  }, [resume])

  function updatePersonal(field, value) {
    setResume(r => ({ ...r, personal: { ...r.personal, [field]: value } }))
  }

  function updateSkills(field, value) {
    setResume(r => ({ ...r, skills: { ...r.skills, [field]: value } }))
  }

  function updateListItem(section, id, field, value) {
    setResume(r => ({
      ...r,
      [section]: r[section].map(item => item.id === id ? { ...item, [field]: value } : item),
    }))
  }

  function addListItem(section, template) {
    setResume(r => ({
      ...r,
      [section]: [...r[section], { ...template, id: Date.now() }],
    }))
  }

  function removeListItem(section, id) {
    setResume(r => ({
      ...r,
      [section]: r[section].filter(item => item.id !== id),
    }))
  }

  function setTemplate(t) {
    setResume(r => ({ ...r, template: t }))
  }

  function updateAchievements(value) {
    setResume(r => ({ ...r, achievements: value }))
  }

  return (
    <ResumeContext.Provider value={{
      resume, updatePersonal, updateSkills,
      updateListItem, addListItem, removeListItem,
      setTemplate, updateAchievements,
    }}>
      {children}
    </ResumeContext.Provider>
  )
}

export function useResume() {
  return useContext(ResumeContext)
}
