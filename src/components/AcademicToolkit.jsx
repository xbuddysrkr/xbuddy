import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { jsPDF } from 'jspdf'
import { DOC_TYPES } from '../utils/letterTemplates'

// ── SVG Icons (no emojis) ─────────────────────────────────────────────────────
const ICONS = {
  leave:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  bonafide:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>,
  internship:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
  permission:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  apology:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>,
  scholarship: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>,
  resume:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
  assignment:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  lab:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>,
}

const FIELDS = {
  leave:       ['name','rollNo','year','department','college','receiver','reason','days','extra'],
  bonafide:    ['name','rollNo','year','department','college','receiver','reason','extra'],
  internship:  ['name','rollNo','year','department','college','receiver','reason','weeks','extra'],
  permission:  ['name','rollNo','year','department','college','receiver','reason','extra'],
  apology:     ['name','rollNo','year','department','college','receiver','reason','extra'],
  scholarship: ['name','rollNo','year','department','college','receiver','reason','extra'],
  resume:      ['name','department','college','year','reason','extra'],
  assignment:  ['name','rollNo','year','department','college','receiver','reason'],
  lab:         ['name','rollNo','year','department','college','receiver'],
}

const FIELD_META = {
  name:       { label: 'Full Name',           placeholder: 'e.g. Rahul Sharma'        },
  rollNo:     { label: 'Roll Number',          placeholder: 'e.g. 21CS045'             },
  year:       { label: 'Year / Semester',      placeholder: 'e.g. II Year / 3rd Sem'   },
  department: { label: 'Department',           placeholder: 'e.g. Computer Science'    },
  college:    { label: 'College Name',         placeholder: 'e.g. ABC Engineering College' },
  receiver:   { label: 'To (Receiver)',        placeholder: 'e.g. The HOD / Principal' },
  reason:     { label: 'Reason / Purpose',     placeholder: 'e.g. Medical emergency'   },
  days:       { label: 'No. of Days',          placeholder: 'e.g. 3'                   },
  weeks:      { label: 'No. of Weeks',         placeholder: 'e.g. 4'                   },
  extra:      { label: 'Additional Details',   placeholder: 'Any extra info (optional)'},
}

const FIELD_DEFAULTS = {
  name: '[Your Name]',
  rollNo: '______',
  year: '[Year]',
  department: '[Department]',
  college: '[College Name]',
  receiver: 'The HOD',
  reason: '[State your reason]',
  days: 'N',
  weeks: 'N',
  extra: '',
}

function getDefaultVal(type, field) {
  if (field === 'reason') {
    switch (type) {
      case 'bonafide': return '[State purpose]'
      case 'internship': return '[Describe the internship]'
      case 'permission': return '[Event/Purpose]'
      case 'apology': return '[describe the incident]'
      case 'scholarship': return '[State your reason and eligibility]'
      case 'resume': return 'A motivated student seeking opportunities to apply academic knowledge and develop professional skills.'
      case 'assignment': return '[Assignment Topic]'
      default: return '[State your reason]'
    }
  }
  return FIELD_DEFAULTS[field] || ''
}

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fieldSpan(field, val, defaultVal) {
  const displayVal = (val !== undefined && val !== null && val !== '') ? val : defaultVal
  return `<span data-field="${field}">${escapeHtml(displayVal)}</span>`
}

// ── Canonical Initial Document HTML with DOM-level Field Mappings ──────────────
function generateDocumentHtml(type, form) {
  const date = today()
  const nm = fieldSpan('name', form.name, '[Your Name]')
  const to = fieldSpan('receiver', form.receiver, 'The HOD')
  const dept = fieldSpan('department', form.department, '[Department]')
  const roll = fieldSpan('rollNo', form.rollNo, '______')
  const yr = fieldSpan('year', form.year, '[Year]')
  const clg = fieldSpan('college', form.college, '[College Name]')
  const days = fieldSpan('days', form.days, 'N')
  const weeks = fieldSpan('weeks', form.weeks || form.days, 'N')

  const letterHeader = `Date: ${date}\n\n\nTo,\n${to},\nDepartment of ${dept},\n${clg}.\n\n\n`
  const letterClose = `\n\n\nThank you for your kind consideration.\n\n\nYours obediently,\n\n\n\n${nm}\nRoll No: ${roll}\n${yr} Year — ${dept}\n${clg}`

  switch (type) {
    case 'leave': {
      const reason = fieldSpan('reason', form.reason, '[State your reason]')
      const extraContent = form.extra ? `\nAdditional details: ${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Application for Leave — ${days} Day(s)\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I am writing to respectfully request leave of absence for a period of ${days} day(s) from [Start Date] to [End Date].\n\nReason for Leave: ${reason}.\n${extra}\nI assure you that I will be proactive in completing all pending coursework, laboratory experiments, and academic assignments upon my return. I kindly request you to approve my leave application and oblige.${letterClose}`
    }

    case 'bonafide': {
      const reason = fieldSpan('reason', form.reason, '[State purpose]')
      const extraContent = form.extra ? `\n${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Request for Official Bonafide Certificate\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I am writing to formally request the issuance of an official Bonafide Certificate from the college administration.\n\nPurpose of Certificate: ${reason}.\n${extra}\nThis certificate is urgently required for the purpose mentioned above. I assure you that my academic records and conduct have been exemplary. I kindly request you to issue the certificate at the earliest convenience. I shall be highly grateful for your prompt support.${letterClose}`
    }

    case 'internship': {
      const reason = fieldSpan('reason', form.reason, '[Describe the internship]')
      const extraContent = form.extra ? `\n${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Request for Permission to Attend Internship — ${weeks} Week(s)\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I have been offered a valuable internship opportunity at [Company / Institution Name] for a duration of ${weeks} week(s).\n\nInternship Domain / Profile: ${reason}.\n${extra}\nThis internship will provide vital industry exposure and practical experience that directly complements my academic studies. I assure you that my regular coursework and attendance requirements will be diligently maintained. I kindly request your permission and approval for the required leave to attend this internship program.${letterClose}`
    }

    case 'permission': {
      const reason = fieldSpan('reason', form.reason, '[Event / Purpose]')
      const extraContent = form.extra ? `\n${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Request for Permission — ${reason}\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I am writing to respectfully seek your permission for ${reason} scheduled to take place on [Date / Time Window].\n\n${extra}\nI assure you that participating in this activity will not adversely impact my academic schedule or college discipline. I will ensure all missed study material is covered promptly. I humbly request you to grant the required permission and oblige.${letterClose}`
    }

    case 'apology': {
      const reason = fieldSpan('reason', form.reason, '[describe the incident]')
      const extraContent = form.extra ? `\n${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Formal Letter of Apology — ${reason}\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I am writing this letter to tender my sincere and unreserved apology regarding ${reason}.\n\n${extra}\nI deeply regret my actions and fully realize the disruption and inconvenience caused. I assure you that such a lapse in conduct will never recur under any circumstances, and I will strictly adhere to all college rules and expectations moving forward. I humbly request you to pardon my mistake and give me an opportunity to prove my sincere commitment to academic discipline.${letterClose}`
    }

    case 'scholarship': {
      const reason = fieldSpan('reason', form.reason, '[State your reason and eligibility]')
      const extraContent = form.extra ? `\n${escapeHtml(form.extra)}\n` : ''
      const extra = `<span data-field="extra">${extraContent}</span>`
      return `${letterHeader}Subject: Application for Institutional Scholarship Assistance\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} bearing Roll Number ${roll}. I am writing to respectfully submit my application for the scholarship assistance program offered by the institution.\n\nEligibility & Family Background: ${reason}.\n${extra}\nI have consistently maintained a strong academic record and an active presence in departmental coursework. Receiving this scholarship assistance will substantially alleviate my family's financial burden and enable me to focus wholeheartedly on my engineering education. I humbly request you to consider my application favorably and grant me this opportunity.${letterClose}`
    }

    case 'resume': {
      const reason = fieldSpan('reason', form.reason, 'A dedicated engineering student seeking opportunities to apply technical skills and contribute effectively to organizational success.')
      return `${nm}\n${'─'.repeat(54)}\nEmail: [your.email@example.com]   |   Phone: [+91 98765 43210]   |   Location: [City, State]\nLinkedIn: linkedin.com/in/[profile]       |   GitHub: github.com/[profile]\n\n\nCAREER OBJECTIVE\n${'─'.repeat(54)}\n${reason}\n\n\nACADEMIC BACKGROUND\n${'─'.repeat(54)}\n• B.Tech in ${dept} — ${clg}\n  Year of Study: ${yr} Year   |   CGPA: [X.XX / 10.0]\n• Intermediate / 10+2: [Junior College Name] — [XX.X%]\n• Secondary School Certificate (SSC): [School Name] — [XX.X%]\n\n\nTECHNICAL SKILLS\n${'─'.repeat(54)}\n• Programming Languages : C, Java, Python\n• Web & Frameworks      : HTML5, CSS3, JavaScript, React.js\n• Tools & Databases     : MySQL, Git, GitHub, VS Code\n• Core Concepts         : Data Structures, OOP, DBMS, Computer Networks\n\n\nPROJECT WORK\n${'─'.repeat(54)}\n1. [Project Title 1] — [Tech Stack Used]\n   - Developed a responsive web application implementing core functionalities.\n   - Improved user experience and achieved robust database integration.\n\n2. [Project Title 2] — [Tech Stack Used]\n   - Designed and deployed end-to-end module with real-time data handling.\n\n\nKEY ACHIEVEMENTS & CERTIFICATIONS\n${'─'.repeat(54)}\n• Completed Professional Certification in [Course Name] by [Platform/Issuer].\n• Participated in National Level Technical Symposium / Hackathon.\n\n\nDECLARATION\n${'─'.repeat(54)}\nI hereby affirm that the details furnished above are authentic and complete to the best of my knowledge.\n\nDate: ${date}\nPlace: [City Name]                                Signature: ___________________`
    }

    case 'assignment': {
      const clgUpper = fieldSpan('college', (form.college || '[College Name]').toUpperCase(), '[COLLEGE NAME]')
      const reason = fieldSpan('reason', form.reason, '[Assignment Topic]')
      const doubleLine = '═'.repeat(54)
      const singleLine = '─'.repeat(54)
      return `${doubleLine}\n                  ${clgUpper}\n             DEPARTMENT OF ${dept.toUpperCase()}\n${doubleLine}\n\n\n\n                  A S S I G N M E N T   R E P O R T\n\n\n\nSubject Name     : [Subject Name]\nSubject Code     : [Subject Code]\nTopic            : ${reason}\nAcademic Year    : [20XX – 20XX]\nSemester         : [Odd / Even Semester]\n\n\n\n${singleLine}\nSUBMITTED BY:\n  Student Name   : ${nm}\n  Roll Number    : ${roll}\n  Year & Branch  : ${yr} Year — ${dept}\n  Section / Batch: [Section A / B]\n${singleLine}\n\nSUBMITTED TO:\n  Faculty Name   : ${to}\n  Designation    : [Assistant / Associate Professor]\n  Department     : Department of ${dept}\n${singleLine}\n\n\nDate of Submission: ${date}               Faculty Signature: __________________\n${doubleLine}`
    }

    case 'lab': {
      const clgUpper = fieldSpan('college', (form.college || '[College Name]').toUpperCase(), '[COLLEGE NAME]')
      const doubleLine = '═'.repeat(54)
      const singleLine = '─'.repeat(54)
      return `${doubleLine}\n                  ${clgUpper}\n             DEPARTMENT OF ${dept.toUpperCase()}\n${doubleLine}\n\n\n\n             L A B O R A T O R Y   R E C O R D\n\n\n\nLaboratory Course: [Laboratory Course Name]\nCourse Code      : [Course Code]\nAcademic Year    : [20XX – 20XX]\nSemester         : [Semester Details]\n\n\n\n${singleLine}\nSTUDENT CREDENTIALS:\n  Name           : ${nm}\n  Roll Number    : ${roll}\n  Year & Branch  : ${yr} Year — ${dept}\n  Section / Batch: [Section / Batch]\n${singleLine}\n\nFACULTY IN-CHARGE:\n  Name           : ${to}\n  Designation    : [Faculty Designation]\n  Department     : Department of ${dept}\n${singleLine}\n\n\nCERTIFICATE\nThis is to certify that this is a bonafide record of practical work done by the student in the laboratory during the academic year [20XX – 20XX].\n\n\nStaff In-charge: __________________      Head of Department: __________________\n${doubleLine}`
    }

    default:
      return `${letterHeader}Subject: Application\n\nRespected Sir/Madam,\n\nI am ${nm}, a student of ${yr} Year in the Department of ${dept} (Roll No: ${roll}).\n\nI kindly request your consideration and assistance.${letterClose}`
  }
}

// ── High-Fidelity A4 PDF Export via html2canvas & jsPDF ────────────────────────
async function exportToPdf(canvasElement, docId, opts = {}) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  if (!canvasElement) {
    throw new Error('Canvas element not found')
  }

  // Exact A4 dimensions at 96 DPI: 210mm x 297mm
  const A4_W = 794
  const A4_H = 1123

  // Create an off-screen clone with exact true A4 dimensions
  const clone = document.createElement('div')
  clone.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${A4_W}px;
    min-height: ${A4_H}px;
    background: #ffffff;
    z-index: -9999;
    box-sizing: border-box;
    padding: 24mm 24mm;
    font-family: ${canvasElement.style.fontFamily || "'Georgia', 'Times New Roman', serif"};
    font-size: ${canvasElement.style.fontSize || '12pt'};
    line-height: ${canvasElement.style.lineHeight || '1.6'};
    color: #0f172a;
    white-space: pre-wrap;
    word-break: break-word;
  `
  clone.innerHTML = canvasElement.innerHTML

  document.body.appendChild(clone)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  const totalHeight = Math.max(A4_H, clone.scrollHeight)
  const totalPages = Math.max(1, Math.ceil((totalHeight - 15) / A4_H))

  const canvas = await html2canvas(clone, {
    scale: 2, // 300 DPI high resolution
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: A4_W,
    height: totalPages * A4_H,
    windowWidth: A4_W,
  })

  document.body.removeChild(clone)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // Slice into exact A4 pages
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage()

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = Math.round(canvas.width * (297 / 210))
    const ctx = pageCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)

    const sliceH = Math.round(canvas.width * (297 / 210))
    const sourceY = page * sliceH
    const sourceH = Math.min(canvas.height - sourceY, sliceH)

    ctx.drawImage(
      canvas,
      0, sourceY, canvas.width, sourceH,
      0, 0, pageCanvas.width, sourceH
    )

    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297)
  }

  return pdf
}

// ── Left Form Panel ────────────────────────────────────────────────────────────
function FormPanel({ fields, form, onChange, onGenerate }) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
      <div className="flex items-center justify-between mb-1">
        <p className="text-slate-900 text-xs sm:text-sm font-extrabold uppercase tracking-wider">
          Document Details
        </p>
        <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
          Live Synced ⚡
        </span>
      </div>

      {fields.map(field => {
        const meta = FIELD_META[field]
        return (
          <div key={field}>
            <label className="text-slate-900 text-xs sm:text-sm font-bold mb-1.5 block">
              {meta.label}
            </label>
            {field === 'extra' || field === 'reason' ? (
              <textarea
                value={form[field] || ''}
                onChange={e => onChange(field, e.target.value)}
                placeholder={meta.placeholder}
                rows={field === 'extra' ? 3 : 2}
                className="w-full bg-[#FFF8F2] border border-orange-200 rounded-xl px-3 py-2 text-slate-900 font-medium text-xs sm:text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all resize-none shadow-2xs"
              />
            ) : (
              <input
                type="text"
                value={form[field] || ''}
                onChange={e => onChange(field, e.target.value)}
                placeholder={meta.placeholder}
                className="w-full bg-[#FFF8F2] border border-orange-200 rounded-xl px-3 py-2 text-slate-900 font-medium text-xs sm:text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all shadow-2xs"
              />
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={onGenerate}
        className="w-full py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-extrabold text-sm rounded-xl transition-all mt-3 shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
      >
        View Full Document Preview →
      </button>
    </div>
  )
}

// ── Free-Form Document Canvas Preview Panel ──────────────────────────────────
function PreviewPanel({
  canvasRef,
  onCanvasInput,
  onCanvasKeyDown,
  onCanvasPaste,
  fontSize,
  setFontSize,
  exporting,
  onDownload,
  onPrint,
  toast,
}) {
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 0.75
    const w = window.innerWidth
    if (w < 480) return Math.max(0.36, Math.min(0.48, +((w - 32) / 794).toFixed(2)))
    if (w < 768) return 0.55
    if (w < 1200) return 0.68
    return 0.78
  })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#FFFDF9]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-orange-100 flex-shrink-0 gap-2 flex-wrap bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Font Controls */}
          <div className="flex items-center gap-1 bg-orange-50/70 border border-orange-200/80 rounded-xl px-2 py-1">
            <span className="text-slate-600 text-xs font-semibold mr-1">Font</span>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.max(9, s - 1))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-90"
              title="Decrease Font Size"
            >
              A−
            </button>
            <span className="text-slate-700 font-bold text-xs w-8 text-center">{fontSize}pt</span>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.min(16, s + 1))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-90"
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-orange-50/70 border border-orange-200/80 rounded-xl px-2 py-1">
            <span className="text-slate-600 text-[11px] font-semibold mr-1">Zoom</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.35, +(z - 0.08).toFixed(2)))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 text-[#F78C25] font-bold text-xs flex items-center justify-center transition-all shadow-2xs cursor-pointer active:scale-90"
              title="Zoom Out"
            >
              −
            </button>
            <span className="text-slate-700 font-bold text-xs w-9 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(1.3, +(z + 0.08).toFixed(2)))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 text-[#F78C25] font-bold text-xs flex items-center justify-center transition-all shadow-2xs cursor-pointer active:scale-90"
              title="Zoom In"
            >
              +
            </button>
          </div>

          <div className="hidden min-[600px]:flex items-center gap-1.5 ml-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 text-xs font-medium">True A4 Sheet · Click to edit</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-slate-800 hover:text-[#F78C25] text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50 active:scale-95"
          >
            {exporting ? (
              <div className="w-3.5 h-3.5 border-2 border-[#F78C25] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            <span>{exporting ? 'Generating...' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            onClick={onPrint}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            <span>Print with XBuddy</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold text-center flex-shrink-0"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* A4 Document Canvas Container */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-[#FFFDF9] bg-dot-pattern">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
          <div
            ref={canvasRef}
            contentEditable
            suppressContentEditableWarning
            onInput={onCanvasInput}
            onKeyDown={onCanvasKeyDown}
            onPaste={onCanvasPaste}
            className="bg-white text-slate-900 rounded-xs shadow-2xl border border-orange-200/80 outline-none cursor-text select-text whitespace-pre-wrap"
            style={{
              width: '794px', // True A4 width 210mm
              minHeight: '1123px', // True A4 height 297mm
              boxSizing: 'border-box',
              padding: '24mm 24mm', // Exact professional A4 margins
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: `${fontSize}pt`,
              lineHeight: '1.6',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Document Modal with DOM-Stable Two-Way Synchronization ────────────────────
function DocModal({ docType, onClose, onPrint }) {
  const EMPTY = {
    name: '',
    rollNo: '',
    year: '',
    department: '',
    college: '',
    receiver: '',
    reason: '',
    days: '',
    weeks: '',
    extra: '',
  }

  // Canonical Form state
  const [form, setForm] = useState(EMPTY)
  const [mobileTab, setMobileTab] = useState('form')
  const [fontSize, setFontSize] = useState(12) // pt (standard formal document)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')

  // The stable canvas DOM ref
  const canvasRef = useRef(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fields = FIELDS[docType.id] || FIELDS.leave

  // On docType change (or initial mount), populate canvas DOM with template HTML
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.innerHTML = generateDocumentHtml(docType.id, form)
    }
  }, [docType.id])

  // FORM -> CANVAS: Only patch the specific mapped field spans without touching any other user edits
  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))

    if (canvasRef.current) {
      const spans = canvasRef.current.querySelectorAll(`[data-field="${field}"]`)
      if (spans.length > 0) {
        const defaultVal = getDefaultVal(docType.id, field)
        const displayVal = value || defaultVal
        spans.forEach(span => {
          if (field === 'college' && (docType.id === 'assignment' || docType.id === 'lab')) {
            span.textContent = displayVal.toUpperCase()
          } else {
            span.textContent = displayVal
          }
        })
      }
    }
  }

  // CANVAS -> FORM: Native typing in DOM. If inside a mapped field, update form and other occurrences
  function handleCanvasInput() {
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return

    const el = sel.anchorNode.nodeType === Node.ELEMENT_NODE
      ? sel.anchorNode
      : sel.anchorNode.parentElement

    const fieldSpan = el?.closest('[data-field]')
    if (fieldSpan && canvasRef.current) {
      const field = fieldSpan.getAttribute('data-field')
      const val = fieldSpan.textContent
      if (field) {
        // Sync other occurrences of this field on canvas (e.g. name in body & signature)
        const otherSpans = canvasRef.current.querySelectorAll(`[data-field="${field}"]`)
        otherSpans.forEach(span => {
          if (span !== fieldSpan && span.textContent !== val) {
            span.textContent = val
          }
        })

        // Sync to form state so the left input updates
        setForm(prev => (prev[field] === val ? prev : { ...prev, [field]: val }))
      }
    }
  }

  // Prevent Tab key from unfocusing canvas
  function handleCanvasKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertText', false, '    ')
    }
  }

  // Ensure plain text paste without unwanted external HTML/CSS
  function handleCanvasPaste(e) {
    e.preventDefault()
    const text = (e.clipboardData || window.clipboardData).getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  function handleGenerate() {
    setMobileTab('preview')
    showToast('✓ Document ready for download & print')
  }

  // Download PDF — exports the exact document layout on the canvas at true A4 scale
  async function handleDownload() {
    setExporting(true)
    try {
      const pdf = await exportToPdf(canvasRef.current, docType.id, { fontSize })
      pdf.save(`${docType.id}.pdf`)
      showToast('✓ PDF downloaded in true A4 format!')
    } catch (err) {
      console.error(err)
      showToast('Export failed — try again')
    } finally {
      setExporting(false)
    }
  }

  // Print with XBuddy — sends the exact A4 document to print
  async function handlePrint() {
    setExporting(true)
    try {
      const pdf = await exportToPdf(canvasRef.current, docType.id, { fontSize })
      const blob = pdf.output('blob')
      const file = new File([blob], `${docType.id}.pdf`, { type: 'application/pdf' })
      onPrint(file)
      onClose()
    } catch (err) {
      console.error(err)
      showToast('Export failed — try again')
      setExporting(false)
    }
  }

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-5xl h-[95vh] sm:max-h-[92vh] bg-white border border-orange-200 sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-orange-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F78C25] shrink-0">
              {ICONS[docType.id]}
            </div>
            <div>
              <p className="text-slate-900 font-extrabold text-base sm:text-lg leading-tight">{docType.label}</p>
              <p className="text-slate-600 font-semibold text-xs sm:text-sm mt-0.5">{docType.desc}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 flex items-center justify-center text-slate-500 transition-all active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex sm:hidden border-b border-orange-100 flex-shrink-0 bg-white">
          {['form', 'preview'].map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2.5 text-xs font-bold capitalize transition-all cursor-pointer ${
                mobileTab === tab
                  ? 'text-[#F78C25] border-b-2 border-[#F78C25] bg-orange-50/50'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'form' ? '📝 Fill Details' : '👁 Live Preview'}
            </button>
          ))}
        </div>

        {/* Body — desktop: side by side | mobile: tabbed */}
        <div className="flex flex-1 overflow-hidden">
          {/* Form Panel */}
          <div className={`${
            mobileTab === 'form' ? 'flex' : 'hidden'
          } sm:flex w-full sm:w-80 flex-shrink-0 sm:border-r border-orange-100 flex-col bg-[#FAFAFA]`}>
            <FormPanel
              fields={fields}
              form={form}
              onChange={handleChange}
              onGenerate={handleGenerate}
            />
          </div>

          {/* Canvas Preview Panel */}
          <div className={`${
            mobileTab === 'preview' ? 'flex' : 'hidden'
          } sm:flex flex-1 flex-col overflow-hidden`}>
            <PreviewPanel
              canvasRef={canvasRef}
              onCanvasInput={handleCanvasInput}
              onCanvasKeyDown={handleCanvasKeyDown}
              onCanvasPaste={handleCanvasPaste}
              fontSize={fontSize}
              setFontSize={setFontSize}
              exporting={exporting}
              onDownload={handleDownload}
              onPrint={handlePrint}
              toast={toast}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main Section ──────────────────────────────────────────────────────────────
export default function AcademicToolkit({ onPrint }) {
  const [active, setActive] = useState(null)

  return (
    <section id="academic-toolkit" className="max-w-6xl mx-auto px-4 py-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-14"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-orange-300 bg-orange-50 text-[#F78C25] text-xs font-bold mb-5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
          Academic Toolkit
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-tight">
              Generate any document<br />
              <span className="gradient-text">in under 30 seconds</span>
            </h2>
            <p className="text-slate-600 font-medium mt-3 max-w-lg text-sm sm:text-base">
              Fill in your details or edit directly on the live document. Everything is two-way synchronized and print-ready.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Two-way synced
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
              Inline Canvas Editing
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
              Direct Print
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {DOC_TYPES.map((doc, i) => (
          <motion.button
            key={doc.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -2 }}
            onClick={() => setActive(doc)}
            className="group text-left p-5 rounded-2xl bg-white border border-orange-100 hover:border-[#F78C25] hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F78C25] group-hover:bg-[#F78C25] group-hover:text-white transition-colors">
                {ICONS[doc.id]}
              </div>
              <div className="w-6 h-6 rounded-full bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center transition-all">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#F78C25] transition-colors">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </div>
            </div>
            <p className="text-slate-900 font-extrabold text-base mb-1">{doc.label}</p>
            <p className="text-slate-600 text-xs sm:text-sm font-semibold leading-relaxed">{doc.desc}</p>
            <div className="mt-4 pt-4 border-t border-orange-100 flex items-center justify-between">
              <span className="text-slate-400 text-xs">Two-way live preview</span>
              <span className="text-[#F78C25] text-xs font-bold opacity-75 group-hover:opacity-100 transition-opacity">Open Document →</span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {active && (
          <DocModal
            docType={active}
            onClose={() => setActive(null)}
            onPrint={onPrint}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
