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

// ── PDF export via html2canvas → jsPDF (pixel-perfect, no blank pages) ────────
// Export plain text to PDF using jsPDF (avoids html2canvas reliability issues)
async function exportToPdf(text, filename, opts = {}) {
  const fontSize = opts.fontSize || 11 // pt
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 12
  const maxW = pageW - margin * 2

  pdf.setFont('Times', 'Roman')
  pdf.setFontSize(fontSize)

  const lines = pdf.splitTextToSize(text, maxW)
  const lineHeightMm = (fontSize * 0.352777778) * 1.25
  let y = margin

  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeightMm > pageH - margin) {
      pdf.addPage()
      y = margin
    }
    pdf.text(String(lines[i]), margin, y)
    y += lineHeightMm
  }

  return pdf
}

// ── Document Modal ────────────────────────────────────────────────────────────
// Extracted form panel to top-level to avoid remounts/resetting cursor
function FormPanel({ fields, form, onChange, onGenerate }) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
      <p className="text-slate-900 text-xs sm:text-sm font-extrabold uppercase tracking-wider mb-2.5">Document Details</p>
      {fields.map(field => {
        const meta = FIELD_META[field]
        return (
          <div key={field}>
            <label className="text-slate-900 text-xs sm:text-sm font-bold mb-1.5 block">{meta.label}</label>
            {field === 'extra' ? (
              <textarea
                value={form[field]}
                onChange={e => onChange(field, e.target.value)}
                placeholder={meta.placeholder}
                rows={3}
                className="w-full bg-[#FFF8F2] border border-orange-200 rounded-xl px-3 py-2 text-slate-900 font-medium text-xs sm:text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all resize-none"
              />
            ) : (
              <input
                type="text"
                value={form[field]}
                onChange={e => onChange(field, e.target.value)}
                placeholder={meta.placeholder}
                className="w-full bg-[#FFF8F2] border border-orange-200 rounded-xl px-3 py-2 text-slate-900 font-medium text-xs sm:text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all"
              />
            )}
          </div>
        )
      })}
      <button
        onClick={onGenerate}
        className="w-full py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-extrabold text-sm rounded-xl transition-all mt-3 shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
      >
        Generate Document
      </button>
    </div>
  )
}

// Extracted preview panel to top-level to avoid remounts/resetting cursor
function PreviewPanel({ generated, content, fontSize, setFontSize, exporting, onDownload, onPrint, toast }) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#FAFAFA]">
      {/* toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-100 flex-shrink-0 gap-2 flex-wrap bg-white">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFontSize(s => Math.max(8, s - 1))}
            className="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center"
          >A-</button>
          <span className="text-gray-500 text-xs w-8 text-center">{fontSize}pt</span>
          <button
            onClick={() => setFontSize(s => Math.min(18, s + 1))}
            className="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F78C25] text-xs font-bold transition-all flex items-center justify-center"
          >A+</button>
        </div>
        {generated && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onDownload}
              disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 disabled:opacity-50 text-gray-500 text-xs font-medium transition-all"
            >
              {exporting
                ? <div className="w-3 h-3 border border-gray-500 border-t-gray-300 rounded-full animate-spin" />
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              }
              <span className="hidden sm:inline">{exporting ? 'Generating...' : 'Download'}</span>
            </button>
            <button
              onClick={onPrint}
              disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F78C25] hover:bg-[#e07010] disabled:opacity-50 text-white text-xs font-semibold transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
              Print
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-green-600 text-xs text-center flex-shrink-0"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
        {generated ? (
          <div
            contentEditable
            suppressContentEditableWarning
            className="w-full max-w-[210mm] bg-white text-gray-900 rounded-sm shadow-xl border border-orange-100 px-6 py-10 sm:p-[22mm] whitespace-pre-wrap outline-none focus:ring-2 focus:ring-orange-200"
            style={{
              fontFamily: 'Georgia, serif',
              fontSize:   `${fontSize}pt`,
              lineHeight: fontSize <= 10 ? '1.6' : fontSize >= 14 ? '2.2' : '1.9',
              minHeight:  '297mm',
            }}
          >
            {content}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-full min-h-[200px]">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F78C25] mb-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">Preview will appear here</p>
            <p className="text-gray-400 text-xs mt-1">Fill the form and tap Generate</p>
          </div>
        )}
      </div>
    </div>
  )
}

function DocModal({ docType, onClose, onPrint }) {
  const EMPTY = { name:'', rollNo:'', year:'', department:'', college:'', receiver:'', reason:'', days:'', weeks:'', extra:'' }
  const [form,      setForm]      = useState(EMPTY)
  const [content,   setContent]   = useState('')
  const [generated, setGenerated] = useState(false)
  const [mobileTab, setMobileTab] = useState('form')
  const [fontSize,  setFontSize]  = useState(11)       // pt
  const [exporting, setExporting] = useState(false)
  const [toast,     setToast]     = useState('')
  

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fields = FIELDS[docType.id] || FIELDS.leave

  function handleChange(field, value) {
    const updated = { ...form, [field]: value }
    setForm(updated)
    if (generated) setContent(generateDocument({ type: docType.id, ...updated }))
  }

  function handleGenerate() {
    const text = generateDocument({ type: docType.id, ...form })
    setContent(text)
    setGenerated(true)
    setMobileTab('preview') // auto-switch to preview on mobile after generate
  }

  async function handleDownload() {
    if (!generated || !content) return
    setExporting(true)
    try {
      const pdf = await exportToPdf(content, docType.id, { fontSize })
      pdf.save(`${docType.id}.pdf`)
      showToast('PDF downloaded!')
    } catch (e) {
      showToast('Export failed — try again')
    } finally {
      setExporting(false)
    }
  }

  async function handlePrint() {
    if (!generated || !content) return
    setExporting(true)
    try {
      const pdf  = await exportToPdf(content, docType.id, { fontSize })
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
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 flex items-center justify-center text-slate-500 transition-all active:scale-95 cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Mobile tab switcher */}
        <div className="flex sm:hidden border-b border-orange-100 flex-shrink-0 bg-white">
          {['form', 'preview'].map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-all ${
                mobileTab === tab
                  ? 'text-[#F78C25] border-b-2 border-[#F78C25]'
                  : 'text-gray-400'
              }`}
            >
              {tab === 'form' ? 'Fill Details' : 'Preview'}
              {tab === 'preview' && generated && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-orange-100 text-[#F78C25] text-[10px]">Ready</span>
              )}
            </button>
          ))}
        </div>

        {/* Body — desktop: side by side | mobile: tabbed */}
        <div className="flex flex-1 overflow-hidden">
          {/* Form — always visible on desktop, tab-controlled on mobile */}
          <div className={`${
            mobileTab === 'form' ? 'flex' : 'hidden'
          } sm:flex w-full sm:w-80 flex-shrink-0 sm:border-r border-orange-100 flex-col bg-[#FAFAFA]`}>
            <FormPanel fields={fields} form={form} onChange={handleChange} onGenerate={handleGenerate} />
          </div>

          <div className={`${
            mobileTab === 'preview' ? 'flex' : 'hidden'
          } sm:flex flex-1 flex-col overflow-hidden`}>
            <PreviewPanel generated={generated} content={content} fontSize={fontSize} setFontSize={setFontSize} exporting={exporting} onDownload={handleDownload} onPrint={handlePrint} toast={toast} />
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-orange-300 bg-orange-50 text-[#F78C25] text-xs font-medium mb-5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
          Academic Toolkit
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#222222] leading-tight">
              Generate any document<br />
              <span className="gradient-text">in under 30 seconds</span>
            </h2>
            <p className="text-gray-500 mt-3 max-w-lg text-sm">
              Fill in your details, get a professionally formatted document, edit it live, and send directly to print.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Live preview
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
              Inline editing
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
              Direct print
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
            className="group text-left p-5 rounded-2xl bg-white border border-orange-100 hover:border-[#F78C25] hover:shadow-md transition-all duration-200"
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
              <span className="text-gray-400 text-xs">Click to generate</span>
              <span className="text-[#F78C25] text-xs font-medium opacity-60 group-hover:opacity-100 transition-opacity">Generate →</span>
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
