import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Save,
  Eye,
  Star,
  PartyPopper,
  ThumbsUp,
  Zap,
  Download
} from 'lucide-react'
import { ResumeProvider, useResume, SECTIONS, getSectionCompletion, computeOverallCompleteness } from './resumeStore.jsx'
import ResumeForm from './components/ResumeForm'
import ResumePreview from './components/ResumePreview'
import TemplatePicker from './components/TemplatePicker'
import XBuddyStudioMascot from './components/XBuddyStudioMascot'

function ResumeStudioInner({ onPrint, onBack }) {
  const { resume } = useResume()
  const [activeSection, setActiveSection] = useState('personal')
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [savedToast, setSavedToast] = useState(false)

  const previewExportRef = useRef(null)
  const completeness = computeOverallCompleteness(resume)

  function handleSaveClick() {
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2200)
  }

  function handleDownloadClick() {
    if (previewExportRef.current?.downloadPdf) {
      previewExportRef.current.downloadPdf()
    } else {
      setMobilePreviewOpen(true)
    }
  }

  function handlePrintClick() {
    if (previewExportRef.current?.printWithXBuddy) {
      previewExportRef.current.printWithXBuddy()
    } else {
      setMobilePreviewOpen(true)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#FFFDF9] text-slate-800 relative overflow-hidden font-sans">
      {/* 1. TOP STUDIO HEADER */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-orange-100 flex-shrink-0 bg-white/95 backdrop-blur-md shadow-2xs z-20">
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] flex items-center justify-center transition-all border border-orange-200/80 shadow-2xs active:scale-95 cursor-pointer shrink-0"
            title="Back to Home"
            aria-label="Back to Home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <XBuddyStudioMascot completeness={completeness} size={34} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-slate-900 font-extrabold text-sm sm:text-base leading-tight tracking-tight">
                  XBuddy Resume Studio
                </h1>
                <span className="hidden min-[400px]:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100/80 text-orange-700">
                  ATS Ready
                </span>
              </div>
              <p className="text-slate-400 text-[11px] hidden sm:block">
                Professional Campus & Tech Resume Builder · Print Ready
              </p>
            </div>
          </div>
        </div>

        {/* Right Header Status & Save indicator */}
        <div className="flex items-center gap-2">
          {savedToast ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 animate-fade-in">
              <Check className="w-3 h-3" /> Saved
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSaveClick}
              className="hidden min-[480px]:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Draft Saved</span>
            </button>
          )}

          {/* Mobile Preview Trigger Button in Header */}
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] font-bold text-xs border border-orange-200 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN RESPONSIVE WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        {/* ========================================================
            MOBILE / TABLET / DESKTOP FORM ZONE
            Mobile (<768px): Single full-width scrollable column
            Tablet (768-1024px): 46% width scrollable column
            Desktop (>1024px): 360px-380px fixed width column
        ======================================================== */}
        <div className="w-full md:w-[48%] lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col border-r border-orange-100 overflow-y-auto scrollbar-thin bg-white">
          <div className="p-3.5 sm:p-5 space-y-4 pb-28 lg:pb-8">
            {/* A. Resume Completeness Progress Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-orange-50/90 via-amber-50/40 to-white border border-orange-100 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Resume Completeness
                  </span>
                  {completeness >= 80 && (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" /> Print Ready
                    </span>
                  )}
                </div>
                <span className="text-xs font-extrabold text-[#F78C25]">
                  {completeness}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#F78C25] to-[#FF6B00] transition-all duration-500 ease-out"
                  style={{ width: `${completeness}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                <span>
                  {completeness >= 80 ? (
                    <span className="inline-flex items-center gap-1">
                      <PartyPopper className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Outstanding! Perfect for campus placement.
                    </span>
                  ) : completeness >= 45 ? (
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-orange-500 shrink-0" /> Good progress. Complete remaining sections.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Fill in your details to hit 80%+.
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* B. Mobile Template Quick-Selector Strip (Visible on mobile/tablet) */}
            <div className="lg:hidden">
              <TemplatePicker layout="horizontal" />
            </div>

            {/* C. Section Navigation Cards / Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Resume Sections
                </span>
                <span className="text-[11px] text-slate-400">
                  Tap to edit section
                </span>
              </div>

              <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-2 md:grid-cols-2 gap-1.5">
                {SECTIONS.map((sec) => {
                  const isActive = activeSection === sec.id
                  const completion = getSectionCompletion(resume, sec.id)
                  const isDone = completion.status === 'complete'
                  const inProg = completion.status === 'in-progress'
                  const SecIcon = sec.icon

                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveSection(sec.id)}
                      className={`text-left p-2 rounded-xl border transition-all cursor-pointer active:scale-95 flex items-center justify-between gap-1.5 ${
                        isActive
                          ? 'border-[#F78C25] bg-orange-50 shadow-2xs ring-1 ring-[#F78C25]/40 text-[#F78C25]'
                          : 'border-slate-200/80 bg-white hover:border-orange-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {SecIcon && <SecIcon className="w-3.5 h-3.5 shrink-0" />}
                        <span className={`text-[11px] font-bold truncate ${isActive ? 'text-[#F78C25]' : 'text-slate-800'}`}>
                          {sec.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold">
                        {isDone ? (
                          <span className="text-emerald-600 bg-emerald-50 px-1 rounded inline-flex items-center">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        ) : inProg ? (
                          <span className="text-amber-500">•</span>
                        ) : (
                          <span className="text-slate-300">○</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* D. Active Section Form */}
            <div className="pt-1">
              <ResumeForm
                activeSection={activeSection}
                onSelectSection={setActiveSection}
              />
            </div>

            {/* E. Prominent Mobile Resume Preview Trigger Banner */}
            <div className="lg:hidden pt-2">
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(true)}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-orange-500 to-[#F78C25] hover:from-orange-600 hover:to-[#EB740A] text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Preview Resume (A4 Full Page)</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            DESKTOP / TABLET CENTER ZONE: LIVE RESUME PREVIEW
            Visible on md (tablet) and lg (desktop)
        ======================================================== */}
        <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-[#FFFDF9] border-r border-orange-100">
          <ResumePreview
            ref={previewExportRef}
            onPrint={onPrint}
            onExportStateChange={setIsExporting}
          />
        </div>

        {/* ========================================================
            DESKTOP RIGHT ZONE: TEMPLATES & DESIGN
            Visible on lg+ (>1024px)
        ======================================================== */}
        <div className="hidden lg:flex w-64 xl:w-72 flex-shrink-0 flex-col overflow-y-auto scrollbar-thin bg-white p-4">
          <TemplatePicker layout="vertical" />
        </div>
      </div>

      {/* 3. MOBILE STICKY BOTTOM ACTION BAR (<768px) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-orange-100 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto flex items-center gap-2">
          {/* Draft Save */}
          <button
            type="button"
            onClick={handleSaveClick}
            className="flex-1 py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
          >
            {savedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            )}
          </button>

          {/* Preview Sheet */}
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(true)}
            className="flex-1 py-2.5 px-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] font-bold text-xs border border-orange-200 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={isExporting}
            className="flex-1 py-2.5 px-2 rounded-xl bg-white hover:bg-orange-50 text-slate-800 hover:text-[#F78C25] font-bold text-xs border border-slate-200 flex items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {/* Print with XBuddy */}
          <button
            type="button"
            onClick={handlePrintClick}
            disabled={isExporting}
            className="flex-[1.5] py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white font-bold text-xs flex items-center justify-center gap-1 shadow-md shadow-orange-500/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            <span>Print with XBuddy</span>
          </button>
        </div>
      </div>

      {/* 4. FULL-SCREEN MOBILE PREVIEW MODAL */}
      <AnimatePresence>
        {mobilePreviewOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-[#FFFDF9]"
          >
            <ResumePreview
              onPrint={onPrint}
              isModal={true}
              onCloseModal={() => setMobilePreviewOpen(false)}
              onExportStateChange={setIsExporting}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ResumeBuilder({ onPrint, onBack }) {
  return (
    <ResumeProvider>
      <ResumeStudioInner onPrint={onPrint} onBack={onBack} />
    </ResumeProvider>
  )
}
