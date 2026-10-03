import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { jsPDF } from 'jspdf'
import { DOC_TYPES, generateDocument, getDocTitle } from '../utils/letterTemplates'

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

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

// ── PDF export via jsPDF ───────────────────────────────────────────────────────
async function exportToPdf(text, filename, opts = {}) {
  const fontSize = opts.fontSize || 11 // pt
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 14
  const maxW = pageW - margin * 2

  pdf.setFont('Times', 'Roman')
  pdf.setFontSize(fontSize)

  const lines = pdf.splitTextToSize(text, maxW)
  const lineHeightMm = (fontSize * 0.352777778) * 1.3
  let y = margin + 5

  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeightMm > pageH - margin) {
      pdf.addPage()
      y = margin + 5
    }
    pdf.text(String(lines[i]), margin, y)
    y += lineHeightMm
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

// ── Default Template Placeholders ─────────────────────────────────────────────
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

// ── Extract only what is present in the form columns from canvas text ─────────
function extractFieldsFromCanvasText(type, text) {
  const updates = {}
  if (!text) return updates

  // 1. Name
  const nameMatch = text.match(/I am ([^,\n\r]+)/i)
    || text.match(/Yours obediently,[\s\r\n]+([^\r\n]+)/i)
    || text.match(/Submitted by:[\s\r\n]+Name\s*:\s*([^\r\n]+)/i)
    || text.match(/Student Record:[\s\r\n]+Name\s*:\s*([^\r\n]+)/i)
  if (nameMatch) {
    const v = nameMatch[1].trim()
    if (v && v !== '[Your Name]') updates.name = v
  }

  // 2. Roll Number
  const rollMatch = text.match(/Roll No[.:\s]+([^\r\n\),]+)/i)
    || text.match(/Roll Number[.:\s]+([^\r\n\),]+)/i)
  if (rollMatch) {
    const v = rollMatch[1].trim()
    if (v && v !== '______') updates.rollNo = v
  }

  // 3. Department
  const deptMatch = text.match(/Department of ([^\r\n,.]+)/i)
    || text.match(/Branch:[^\r\n—]+—\s*([^\r\n]+)/i)
  if (deptMatch) {
    const v = deptMatch[1].trim()
    if (v && v !== '[Department]') updates.department = v
  }

  // 4. College Name
  const clgMatch = text.match(/Department of [^\r\n,]+,[\s\r\n]+([^\r\n]+)/i)
  if (clgMatch) {
    const v = clgMatch[1].trim()
    if (v && v !== '[College Name]' && !v.startsWith('Sub:') && !v.startsWith('Respected')) {
      updates.college = v
    }
  }

  // 5. Receiver
  const toMatch = text.match(/To,[\s\r\n]+([^\r\n,]+)/i)
    || text.match(/Faculty Name\s*:\s*([^\r\n]+)/i)
    || text.match(/Faculty In-charge\s*:\s*([^\r\n]+)/i)
  if (toMatch) {
    const v = toMatch[1].trim()
    if (v && v !== 'The HOD' && v !== 'The Principal') updates.receiver = v
  }

  // 6. Days / Weeks
  const daysMatch = text.match(/(?:Leave|leave)[^\d\r\n]*(\d+)\s*day/i)
  if (daysMatch) updates.days = daysMatch[1].trim()

  const weeksMatch = text.match(/(?:Internship|internship)[^\d\r\n]*(\d+)\s*week/i)
  if (weeksMatch) updates.weeks = weeksMatch[1].trim()

  // 7. Reason / Purpose / Topic
  const reasonMatch = text.match(/Reason:\s*([^\r\n.]+)/i)
    || text.match(/Topic\s*:\s*([^\r\n]+)/i)
    || text.match(/Subject \/ Lab\s*:\s*([^\r\n]+)/i)
  if (reasonMatch) {
    const v = reasonMatch[1].trim()
    if (v && !v.startsWith('[')) updates.reason = v
  }

  return updates
}

// ── Free-Form Document Canvas Preview Panel ──────────────────────────────────
function PreviewPanel({
  canvasRef,
  content,
  onCanvasInput,
  onCanvasFocus,
  onCanvasBlur,
  fontSize,
  setFontSize,
  exporting,
  onDownload,
  onPrint,
  toast,
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#FFFDF9]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-100 flex-shrink-0 gap-2 flex-wrap bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-orange-50/70 border border-orange-200/80 rounded-xl px-2 py-1">
            <span className="text-slate-600 text-xs font-semibold mr-1">Font</span>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.max(8, s - 1))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-90"
              title="Decrease Font Size"
            >
              A−
            </button>
            <span className="text-slate-700 font-bold text-xs w-8 text-center">{fontSize}pt</span>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.min(18, s + 1))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-90"
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          <div className="hidden min-[480px]:flex items-center gap-1.5 ml-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 text-xs font-medium">Click anywhere on document to edit freely</span>
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
            <span>{exporting ? 'Exporting...' : 'Download PDF'}</span>
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

      {/* A4 Document Canvas — Completely free-form native editable sheet */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#FFFDF9] bg-dot-pattern">
        <div
          ref={canvasRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onCanvasInput}
          onFocus={onCanvasFocus}
          onBlur={onCanvasBlur}
          className="w-full max-w-[210mm] bg-white text-slate-900 rounded-sm shadow-xl border border-orange-100/90 px-6 py-10 sm:p-[22mm] whitespace-pre-wrap outline-none cursor-text select-text focus:ring-1 focus:ring-orange-200"
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: `${fontSize}pt`,
            lineHeight: fontSize <= 10 ? '1.6' : fontSize >= 14 ? '2.2' : '1.9',
            minHeight: '297mm',
          }}
        >
          {content}
        </div>
      </div>
    </div>
  )
}

// ── Document Modal with Full Two-Way Synchronization ───────────────────────────
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

  // ONE SINGLE CANONICAL SOURCE OF TRUTH
  const [form, setForm] = useState(EMPTY)
  const [content, setContent] = useState(() => generateDocument({ type: docType.id, ...EMPTY }))
  const [mobileTab, setMobileTab] = useState('form')
  const [fontSize, setFontSize] = useState(11) // pt
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')

  const canvasRef = useRef(null)
  const contentRef = useRef(content)
  contentRef.current = content
  const isTypingOnCanvasRef = useRef(false)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fields = FIELDS[docType.id] || FIELDS.leave

  // On docType change, initialize fresh document text
  useEffect(() => {
    const initialText = generateDocument({ type: docType.id, ...form })
    setContent(initialText)
    contentRef.current = initialText
    if (canvasRef.current) {
      canvasRef.current.innerText = initialText
    }
  }, [docType.id])

  // Form input changes -> updates document text & canvas
  function handleChange(field, value) {
    const prevVal = form[field] || FIELD_DEFAULTS[field] || ''
    const nextForm = { ...form, [field]: value }
    setForm(nextForm)

    let currentText = canvasRef.current ? canvasRef.current.innerText : contentRef.current
    if (prevVal && currentText.includes(prevVal)) {
      const escaped = prevVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const targetVal = value || FIELD_DEFAULTS[field] || ''
      currentText = currentText.replace(new RegExp(escaped, 'g'), targetVal)
    } else {
      currentText = generateDocument({ type: docType.id, ...nextForm })
    }

    contentRef.current = currentText
    setContent(currentText)
    if (canvasRef.current && !isTypingOnCanvasRef.current) {
      canvasRef.current.innerText = currentText
    }
  }

  // Canvas directly edited -> 100% free-form editing, syncs fields present in columns
  function handleCanvasInput(e) {
    isTypingOnCanvasRef.current = true
    const currentText = e.currentTarget.innerText
    contentRef.current = currentText
    setContent(currentText)

    // Sync only what is present in the form columns
    const updates = extractFieldsFromCanvasText(docType.id, currentText)
    if (Object.keys(updates).length > 0) {
      setForm(prev => {
        let changed = false
        const next = { ...prev }
        for (const [k, v] of Object.entries(updates)) {
          if (v && next[k] !== v) {
            next[k] = v
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
  }

  function handleCanvasFocus() {
    isTypingOnCanvasRef.current = true
  }

  function handleCanvasBlur(e) {
    isTypingOnCanvasRef.current = false
    if (canvasRef.current) {
      const currentText = canvasRef.current.innerText
      contentRef.current = currentText
      setContent(currentText)
    }
  }

  function handleGenerate() {
    setMobileTab('preview')
    showToast('✓ Document updated & live synchronized')
  }

  // Download PDF — exports the exact text on the canvas
  async function handleDownload() {
    setExporting(true)
    try {
      const textToExport = canvasRef.current ? canvasRef.current.innerText : contentRef.current
      const pdf = await exportToPdf(textToExport, docType.id, { fontSize })
      pdf.save(`${docType.id}.pdf`)
      showToast('PDF downloaded successfully!')
    } catch (e) {
      showToast('Export failed — try again')
    } finally {
      setExporting(false)
    }
  }

  // Print with XBuddy — sends the exact text on the canvas to print
  async function handlePrint() {
    setExporting(true)
    try {
      const textToExport = canvasRef.current ? canvasRef.current.innerText : contentRef.current
      const pdf = await exportToPdf(textToExport, docType.id, { fontSize })
      const blob = pdf.output('blob')
      const file = new File([blob], `${docType.id}.pdf`, { type: 'application/pdf' })
      onPrint(file)
      onClose()
    } catch {
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
              content={content}
              onCanvasInput={handleCanvasInput}
              onCanvasFocus={handleCanvasFocus}
              onCanvasBlur={handleCanvasBlur}
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
