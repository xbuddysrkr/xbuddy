import React from 'react'
import { Check, Lightbulb } from 'lucide-react'
import { useResume } from '../resumeStore.jsx'
import { TEMPLATES } from '../templates'

/**
 * Miniature visual silhouette representation of each resume template.
 */
function MiniVisualResume({ templateId, accent }) {
  if (templateId === 'creative') {
    // Left dark/colored sidebar (32%), right content area (68%)
    return (
      <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden flex relative shrink-0">
        <div className="w-[34%] h-full p-1 flex flex-col gap-1" style={{ backgroundColor: accent }}>
          <div className="w-2.5 h-2.5 rounded-full bg-white/70 mx-auto" />
          <div className="w-full h-0.5 bg-white/60 rounded" />
          <div className="w-3/4 h-0.5 bg-white/50 rounded" />
          <div className="mt-1 w-full h-0.5 bg-white/40 rounded" />
          <div className="w-2/3 h-0.5 bg-white/40 rounded" />
        </div>
        <div className="flex-1 p-1 flex flex-col gap-1 bg-white">
          <div className="w-3/4 h-1 rounded" style={{ backgroundColor: accent }} />
          <div className="w-1/2 h-0.5 bg-slate-300 rounded" />
          <div className="mt-1 w-full h-0.5 bg-slate-200 rounded" />
          <div className="w-full h-0.5 bg-slate-200 rounded" />
          <div className="w-4/5 h-0.5 bg-slate-200 rounded" />
          <div className="mt-1 w-3/4 h-0.5 rounded" style={{ backgroundColor: accent }} />
          <div className="w-full h-0.5 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (templateId === 'two-column-tech') {
    // Left teal sidebar for skills/edu, right for exp/projects
    return (
      <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden flex flex-col relative shrink-0">
        <div className="h-2.5 w-full px-1 py-0.5 border-b border-slate-100 flex items-center justify-between" style={{ backgroundColor: `${accent}15` }}>
          <div className="w-2/5 h-1 rounded" style={{ backgroundColor: accent }} />
          <div className="w-1/4 h-0.5 bg-slate-300 rounded" />
        </div>
        <div className="flex-1 flex">
          <div className="w-[38%] h-full p-1 border-r border-slate-100 bg-slate-50/60 flex flex-col gap-1">
            <div className="w-full h-0.5 rounded" style={{ backgroundColor: accent }} />
            <div className="w-3/4 h-0.5 bg-slate-300 rounded" />
            <div className="w-full h-0.5 bg-slate-200 rounded" />
            <div className="mt-1 w-full h-0.5 rounded" style={{ backgroundColor: accent }} />
            <div className="w-4/5 h-0.5 bg-slate-200 rounded" />
          </div>
          <div className="flex-1 p-1 flex flex-col gap-1 bg-white">
            <div className="w-3/4 h-0.5 rounded" style={{ backgroundColor: accent }} />
            <div className="w-full h-0.5 bg-slate-200 rounded" />
            <div className="w-full h-0.5 bg-slate-200 rounded" />
            <div className="mt-1 w-3/4 h-0.5 rounded" style={{ backgroundColor: accent }} />
            <div className="w-full h-0.5 bg-slate-200 rounded" />
            <div className="w-4/5 h-0.5 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (templateId === 'minimal') {
    // Monochrome single column ATS format
    return (
      <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden p-1 flex flex-col gap-1 relative shrink-0">
        <div className="w-2/3 h-1 bg-slate-900 rounded mx-auto" />
        <div className="w-4/5 h-0.5 bg-slate-400 rounded mx-auto" />
        <div className="w-full h-px bg-slate-900 my-0.5" />
        <div className="w-1/2 h-0.5 bg-slate-800 rounded font-bold" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-5/6 h-0.5 bg-slate-200 rounded" />
        <div className="w-1/2 h-0.5 bg-slate-800 rounded mt-0.5" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-4/5 h-0.5 bg-slate-200 rounded" />
      </div>
    )
  }

  if (templateId === 'executive') {
    // Formal corporate with navy accent double bar
    return (
      <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden p-1 flex flex-col gap-1 relative shrink-0">
        <div className="w-full h-0.5 bg-[#1e3a8a] rounded" />
        <div className="w-3/5 h-1 bg-[#1e3a8a] rounded mt-0.5" />
        <div className="w-4/5 h-0.5 bg-slate-400 rounded" />
        <div className="w-full h-px bg-slate-200 my-0.5" />
        <div className="w-2/5 h-0.5 bg-[#1e3a8a] rounded font-bold" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-full h-0.5 bg-slate-200 rounded" />
        <div className="w-2/5 h-0.5 bg-[#1e3a8a] rounded mt-0.5" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
      </div>
    )
  }

  if (templateId === 'ats-elegant') {
    // ATS-Safe single column text layout
    return (
      <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden p-1 flex flex-col gap-1 relative shrink-0">
        <div className="w-3/5 h-1 bg-[#334155] rounded" />
        <div className="w-4/5 h-0.5 bg-slate-400 rounded" />
        <div className="w-full h-px bg-[#334155] my-0.5" />
        <div className="w-1/3 h-0.5 bg-[#334155] rounded" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-5/6 h-0.5 bg-slate-200 rounded" />
        <div className="w-1/3 h-0.5 bg-[#334155] rounded mt-0.5" />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
      </div>
    )
  }

  // Default: modern (Purple header bar & sections)
  return (
    <div className="w-12 h-16 bg-white border border-slate-200 rounded-[3px] shadow-xs overflow-hidden flex flex-col relative shrink-0">
      <div className="h-3 w-full p-1 flex items-center justify-between" style={{ backgroundColor: accent }}>
        <div className="w-3/5 h-1 bg-white rounded" />
        <div className="w-1/5 h-0.5 bg-white/70 rounded" />
      </div>
      <div className="p-1 flex flex-col gap-1 flex-1">
        <div className="w-2/5 h-0.5 rounded" style={{ backgroundColor: accent }} />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-5/6 h-0.5 bg-slate-200 rounded" />
        <div className="mt-1 w-2/5 h-0.5 rounded" style={{ backgroundColor: accent }} />
        <div className="w-full h-0.5 bg-slate-300 rounded" />
        <div className="w-4/5 h-0.5 bg-slate-200 rounded" />
      </div>
    </div>
  )
}

/**
 * TemplatePicker
 * 
 * Supports two layout modes:
 * - 'horizontal' (mobile swipeable row)
 * - 'vertical' (desktop sidebar list)
 */
export default function TemplatePicker({ layout = 'vertical' }) {
  const { resume, setTemplate } = useResume()

  if (layout === 'horizontal') {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Choose Template ({TEMPLATES.length})
          </span>
          <span className="text-[11px] text-orange-600 font-medium">Swipe to browse →</span>
        </div>
        <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1 touch-pan-x">
          {TEMPLATES.map(tpl => {
            const isSelected = resume.template === tpl.id
            return (
              <button
                key={tpl.id}
                onClick={() => setTemplate(tpl.id)}
                type="button"
                className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all shrink-0 w-[104px] cursor-pointer select-none active:scale-95 ${
                  isSelected
                    ? 'border-[#F78C25] bg-orange-50/80 shadow-xs ring-2 ring-[#F78C25]/30'
                    : 'border-slate-200 bg-white hover:border-orange-200 shadow-xs'
                }`}
              >
                <div className="relative mb-1.5">
                  <MiniVisualResume templateId={tpl.id} accent={tpl.accent} />
                  {isSelected && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#F78C25] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-bold line-clamp-1 leading-tight ${isSelected ? 'text-[#F78C25]' : 'text-slate-700'}`}>
                  {tpl.label}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 capitalize">
                  {tpl.id.replace('-', ' ')}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Desktop Vertical Mode
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Templates & Design</p>
        <span className="text-xs text-[#F78C25] font-semibold">{TEMPLATES.length} Styles</span>
      </div>

      <div className="space-y-2">
        {TEMPLATES.map(tpl => {
          const isSelected = resume.template === tpl.id
          return (
            <button
              key={tpl.id}
              onClick={() => setTemplate(tpl.id)}
              type="button"
              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 cursor-pointer group active:scale-[0.99] ${
                isSelected
                  ? 'border-[#F78C25] bg-orange-50/70 shadow-xs ring-1 ring-[#F78C25]/40'
                  : 'border-slate-200/90 bg-white hover:border-orange-200 hover:bg-orange-50/20'
              }`}
            >
              <MiniVisualResume templateId={tpl.id} accent={tpl.accent} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-[#F78C25]' : 'text-slate-800'}`}>
                    {tpl.label}
                  </span>
                  {isSelected && (
                    <span className="shrink-0 text-[#F78C25] text-xs font-bold bg-orange-100/80 px-1.5 py-0.2 rounded-full inline-flex items-center gap-1">
                      <Check className="w-3 h-3" /> Selected
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2">
                  {tpl.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ATS Tip Banner */}
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-700">
        <p className="text-emerald-700 text-xs font-bold mb-1 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-emerald-600" /> ATS Tip
        </p>
        <p className="text-slate-600 text-[11px] leading-relaxed">
          Use <strong className="text-emerald-800">Minimal ATS</strong> or <strong className="text-emerald-800">ATS-Safe Elegant</strong> when applying to major corporations with automated scanners.
        </p>
      </div>
    </div>
  )
}
