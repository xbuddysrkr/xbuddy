import { ACADEMIC_TOOLKIT_ENABLED } from './academicToolkitConfig.js'
export { ACADEMIC_TOOLKIT_ENABLED }

export const DOC_TYPES = [
  { id: 'leave',       label: 'Leave Letter',          desc: 'Request leave from college'         },
  { id: 'bonafide',    label: 'Bonafide Request',       desc: 'Certificate for official purposes'  },
  { id: 'internship',  label: 'Internship Request',     desc: 'Permission to attend internship'    },
  { id: 'permission',  label: 'Permission Letter',      desc: 'Request permission for an event'    },
  { id: 'apology',     label: 'Apology Letter',         desc: 'Formal apology to authority'        },
  { id: 'scholarship', label: 'Scholarship Application',desc: 'Apply for scholarship'              },
  { id: 'resume',      label: 'Resume',                 desc: 'Fresher resume template'            },
  { id: 'assignment',  label: 'Assignment Cover',       desc: 'Cover page for assignments'         },
  { id: 'lab',         label: 'Lab Record Cover',       desc: 'Lab record front page'              },
]

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

export function generateDocument({ type, name, receiver, reason, days, weeks, extra, department, rollNo, year, college }, { bypassLock = false, simulateLock = false } = {}) {
  if ((!ACADEMIC_TOOLKIT_ENABLED || simulateLock) && !bypassLock) {
    throw new Error('Academic Toolkit is currently locked (Coming Soon).')
  }
  const date  = today()
  const to    = receiver   || 'The HOD'
  const dept  = department || '[Department]'
  const roll  = rollNo     || '______'
  const yr    = year       || '[Year]'
  const clg   = college    || '[College Name]'
  const nm    = name       || '[Your Name]'

  const yrFmt = yr.toLowerCase().includes('year') ? yr : (yr === '[Year]' ? '[Year] Year' : `${yr} Year`)

  const letterHeader = `Date: ${date}\n\nTo,\n${to},\nDepartment of ${dept},\n${clg}\n\n`
  const letterClose  = `\n\nThank you for your kind consideration.\n\nYours obediently,\n\n${nm}\nRoll No: ${roll}\n${yrFmt} — ${dept}\n${clg}`

  const docs = {
    leave: {
      title:   'Leave Application',
      subject: `Sub: Application for Leave — ${days || 'N'} Day(s)\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I am writing to respectfully request leave of absence for a period of ${days || 'N'} day(s) from [Start Date] to [End Date] on account of ${reason || '[State your reason]'}.\n\n${extra ? `${extra}\n\n` : ''}I assure you that I will complete all pending academic work upon my return. I kindly request you to consider my application favorably and grant approval.`,
    },
    bonafide: {
      title:   'Bonafide Certificate Request',
      subject: `Sub: Request for Bonafide Certificate\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I am writing to formally request the issuance of an official Bonafide Certificate from the college administration for ${reason || '[State purpose]'}.\n\n${extra ? `${extra}\n\n` : ''}I kindly request you to issue the certificate at the earliest. I shall be highly grateful for your support.`,
    },
    internship: {
      title:   'Internship Permission Request',
      subject: `Sub: Request for Permission to Attend Internship\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I have been offered a valuable internship opportunity for a duration of ${weeks || days || 'N'} week(s) regarding ${reason || '[Describe the internship]'}.\n\n${extra ? `${extra}\n\n` : ''}I humbly request your permission and necessary leave to attend this internship, which will greatly contribute to my professional development.`,
    },
    permission: {
      title:   'Permission Letter',
      subject: `Sub: Request for Permission — ${reason || '[Event/Purpose]'}\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I am writing to seek your kind permission for ${reason || '[State reason]'} scheduled to take place on [Date].\n\n${extra ? `${extra}\n\n` : ''}I assure you that this will not affect my academic coursework. I kindly request you to grant permission and oblige.`,
    },
    apology: {
      title:   'Apology Letter',
      subject: `Sub: Apology Letter — ${reason || '[Incident]'}\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I am writing this letter to sincerely apologize for ${reason || '[describe the incident]'}.\n\nI deeply regret my actions, take full responsibility, and assure you that such a lapse will never happen again under any circumstances. ${extra ? `${extra}\n\n` : ''}I humbly request you to kindly forgive the mistake and grant me an opportunity to prove my commitment.`,
    },
    scholarship: {
      title:   'Scholarship Application',
      subject: `Sub: Application for Scholarship\n\nRespected Sir/Madam,\n\n`,
      body:    `I am ${nm}, a student of ${yr} Year, Department of ${dept} (Roll No: ${roll}). I am writing to apply for institutional scholarship assistance on account of ${reason || '[State your reason and eligibility]'}.\n\n${extra ? `${extra}\n\n` : ''}I am a dedicated student and this scholarship will greatly support my academic journey. I kindly request you to consider my application favorably.`,
    },
    resume: {
      title: 'Resume',
      plain: `${nm}\n${'─'.repeat(60)}\nEmail: [your@email.com]   Phone: [+91 XXXXX XXXXX]   City, State\n\nOBJECTIVE\n${reason || 'A motivated student seeking opportunities to apply academic knowledge and develop professional skills.'}\n\nEDUCATION\nB.Tech / B.E. in ${dept}  —  ${clg}\n${yr} Year  |  CGPA: [X.X / 10]\n\nSKILLS\nTechnical:  [Skill 1], [Skill 2], [Skill 3]\nSoft Skills: Communication, Teamwork, Problem Solving\n\nPROJECTS\n[Project Name]  —  [Tech Stack]\n[Brief description of the project and your role]\n\nINTERNSHIPS\n[Company Name]  —  [Role]  |  [Duration]\n[Description of work done]\n\nACHIEVEMENTS\n- [Achievement / Certification 1]\n- [Achievement / Certification 2]\n\nDECLARATION\nI hereby declare that the above information is true to the best of my knowledge.\n\nDate: ${date}                    Signature: ___________________`,
    },
    assignment: {
      title: 'Assignment Cover Page',
      plain: `${'─'.repeat(60)}\n${clg.toUpperCase()}\nDepartment of ${dept}\n${'─'.repeat(60)}\n\n\n           A S S I G N M E N T\n\n\nSubject      : [Subject Name]\nSubject Code : [Code]\nTopic        : ${reason || '[Assignment Topic]'}\n\n\nSubmitted by:\n  Name         : ${nm}\n  Roll No      : ${roll}\n  Year & Sec   : ${yr} Year\n  Semester     : [Semester]\n\nSubmitted to:\n  Faculty Name : ${to}\n  Designation  : [Designation]\n\n\nDate of Submission: ${date}\n${'─'.repeat(60)}`,
    },
    lab: {
      title: 'Lab Record Cover',
      plain: `${'─'.repeat(60)}\n${clg.toUpperCase()}\nDepartment of ${dept}\n${'─'.repeat(60)}\n\n\n           L A B   R E C O R D\n\n\nSubject      : [Subject Name]\nSubject Code : [Code]\n\n\nName         : ${nm}\nRoll Number  : ${roll}\nYear & Branch: ${yr} Year — ${dept}\nSection      : [Section]\nSemester     : [Semester]\n\n\nFaculty In-charge  : ${to}\nAcademic Year      : [20XX – 20XX]\n\n\nLab In-charge Signature: ___________________\n${'─'.repeat(60)}`,
    },
  }

  const d = docs[type] || docs.leave
  if (d.plain) return d.plain
  return `${letterHeader}${d.subject}${d.body}${letterClose}`
}

export function getDocTitle(type) {
  return DOC_TYPES.find(d => d.id === type)?.label || 'Document'
}

export const LETTER_TYPES = DOC_TYPES
export const generateLetter = generateDocument
