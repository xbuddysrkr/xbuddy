import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useResume } from '../resumeStore.jsx'
import { getTemplate } from '../templates'

const ResumePreview = forwardRef(function ResumePreview(
  { onPrint, isModal = false, onCloseModal, onExportStateChange },
  ref
) {
  const { resume } = useResume()
  const previewRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [fontScale, setFontScale] = useState(1)

  // Calculate default zoom to fit viewport nicely
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 0.75
    const w = window.innerWidth
    if (w < 480) return Math.max(0.38, Math.min(0.48, +((w - 24) / 794).toFixed(2)))
    if (w < 768) return 0.55
    if (w < 1280) return 0.68
    return 0.75
  })

  // Auto-adapt zoom on mobile mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      if (isModal || window.innerWidth < 768) {
        const w = window.innerWidth
        setZoom(Math.max(0.36, Math.min(0.5, +((w - 24) / 794).toFixed(2))))
      }
    }
    handleResize()
  }, [isModal])

  const tpl = getTemplate(resume.template)
  const TemplateComponent = tpl.component

  // Fixed A4 dimensions at 96 DPI
  const A4_PX = 1123 // 297mm
  const A4_W = 794   // 210mm

  async function captureAndExport(action) {
    if (exporting) return
    setExporting(true)
    if (onExportStateChange) onExportStateChange(true)

    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      if (!previewRef.current) {
        throw new Error('Preview element not found')
      }

      // Create off-screen clone at true A4 size with same font scaling
      const clone = document.createElement('div')
      clone.style.cssText = `position:fixed;left:-9999px;top:0;width:${A4_W}px;height:${A4_PX}px;overflow:hidden;background:#fff;z-index:-1;`
      const inner = document.createElement('div')
      inner.style.cssText = `width:${A4_W}px;transform-origin:top left;transform:scale(${1 / fontScale});font-size:${fontScale * 100}%;`
      inner.innerHTML = previewRef.current.innerHTML
      clone.appendChild(inner)
      document.body.appendChild(clone)

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: A4_W,
        height: A4_PX,
      })

      document.body.removeChild(clone)

      // Single page PDF — always true A4 portrait
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)

      const name = resume.personal?.name
        ? `${resume.personal.name.replace(/\s+/g, '_')}_Resume.pdf`
        : 'Resume.pdf'

      if (action === 'download') {
        pdf.save(name)
      } else {
        const file = new File([pdf.output('blob')], name, { type: 'application/pdf' })
        if (onPrint) onPrint(file)
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please check your details and try again.')
    } finally {
      setExporting(false)
      if (onExportStateChange) onExportStateChange(false)
    }
  }

  // Expose methods to parent components
  useImperativeHandle(ref, () => ({
    downloadPdf: () => captureAndExport('download'),
    printWithXBuddy: () => captureAndExport('print'),
    isExporting: exporting,
  }))

  return (
    <div className={`flex flex-col h-full bg-[#FFFDF9] select-none ${isModal ? 'fixed inset-0 z-50 bg-[#F8FAFC]' : ''}`}>
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-orange-100 flex-shrink-0 bg-white/95 backdrop-blur-md shadow-2xs">
        {/* Left: Modal back or editing hint */}
        <div className="flex items-center gap-2 flex-wrap">
          {isModal && (
            <button
              type="button"
              onClick={onCloseModal}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer mr-1"
            >
              <span>←</span>
              <span>Back to Editor</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 text-xs font-medium">Click on text to edit</span>
          </div>

          {/* Font Controls */}
          <div className="flex items-center gap-1 bg-orange-50/70 border border-orange-200/80 rounded-xl px-2 py-1">
            <span className="text-slate-600 text-[11px] font-semibold mr-1">Font</span>
            <button
              type="button"
              onClick={() => setFontScale(s => Math.max(0.7, +(s - 0.05).toFixed(2)))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 text-[#F78C25] font-bold text-xs flex items-center justify-center transition-all shadow-2xs cursor-pointer active:scale-90"
              title="Decrease Font Size"
            >
              A−
            </button>
            <span className="text-slate-700 font-bold text-xs w-9 text-center">
              {Math.round(fontScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setFontScale(s => Math.min(1.4, +(s + 0.05).toFixed(2)))}
              className="w-6 h-6 rounded-lg bg-white hover:bg-orange-100 text-[#F78C25] font-bold text-xs flex items-center justify-center transition-all shadow-2xs cursor-pointer active:scale-90"
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
        </div>

        {/* Right: Export Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => captureAndExport('download')}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-orange-50 text-slate-800 hover:text-[#F78C25] border border-slate-200 hover:border-orange-300 text-xs font-bold shadow-2xs transition-all disabled:opacity-50 cursor-pointer active:scale-95"
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
            onClick={() => captureAndExport('print')}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            <span>{exporting ? 'Preparing...' : 'Print with X Buddy'}</span>
          </button>
        </div>
      </div>

      {/* A4 PREVIEW CANVAS CONTAINER */}
      <div className="flex-1 overflow-auto bg-[#FFFDF9] bg-dot-pattern p-3 sm:p-6 flex justify-center border-t border-orange-100/50">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
          {/* Fixed A4 Frame */}
          <div
            style={{
              width: `${A4_W}px`,
              height: `${A4_PX}px`,
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 12px 36px -6px rgba(247, 147, 30, 0.15), 0 4px 18px -2px rgba(15, 23, 42, 0.08)',
              border: '1px solid rgba(247, 147, 30, 0.22)',
              position: 'relative',
              borderRadius: '2px',
            }}
          >
            {/* Inner Content with Font Scaling */}
            <div
              ref={previewRef}
              style={{
                width: `${A4_W}px`,
                transformOrigin: 'top left',
                transform: `scale(${1 / fontScale})`,
                fontSize: `${fontScale * 100}%`,
                outline: 'none',
              }}
            >
              <TemplateComponent data={resume} fontScale={fontScale} />
            </div>
          </div>
        </div>
      </div>

      {/* Modal Bottom Bar for Mobile View */}
      {isModal && (
        <div className="sm:hidden border-t border-orange-100 bg-white/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
          <button
            type="button"
            onClick={() => captureAndExport('download')}
            disabled={exporting}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <span>📥 Download PDF</span>
          </button>
          <button
            type="button"
            onClick={() => captureAndExport('print')}
            disabled={exporting}
            className="flex-[1.4] py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <span>🖨 Print with X Buddy</span>
          </button>
        </div>
      )}
    </div>
  )
})

export default ResumePreview
