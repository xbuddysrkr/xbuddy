import { useState, useMemo } from 'react'
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
  Layers,
  FileCheck2,
  FileText
} from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { calculateAtsReadiness } from '../scoring/atsEngine'

export default function AtsReadinessCard({ resume }) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  // Recalculate deterministic ATS readiness whenever resume or template changes
  const readiness = useMemo(() => {
    return calculateAtsReadiness(resume)
  }, [resume])

  const { totalScore, ratingLabel, breakdown, suggestions } = readiness

  // Color scheme based on score
  const getScoreTheme = (score) => {
    if (score >= 85) {
      return {
        bg: 'bg-emerald-50/80',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        bar: 'from-emerald-500 to-teal-500'
      }
    }
    if (score >= 70) {
      return {
        bg: 'bg-blue-50/80',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        bar: 'from-blue-500 to-indigo-500'
      }
    }
    if (score >= 50) {
      return {
        bg: 'bg-amber-50/80',
        border: 'border-amber-200',
        text: 'text-amber-700',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        bar: 'from-amber-500 to-orange-500'
      }
    }
    return {
      bg: 'bg-rose-50/80',
      border: 'border-rose-200',
      text: 'text-rose-700',
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      bar: 'from-rose-500 to-red-500'
    }
  }

  const theme = getScoreTheme(totalScore)
  const topSuggestions = suggestions.slice(0, 3)
  const remainingSuggestions = suggestions.slice(3)

  // Template profile metadata
  const tplComp = breakdown.templateCompatibility
  const getTplBadgeStyle = (rating) => {
    if (rating === 'provisional_high') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (rating === 'provisional_moderate') return 'bg-blue-100 text-blue-800 border-blue-200'
    if (rating === 'provisional_caution') return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  return (
    <div className={`p-3.5 rounded-2xl ${theme.bg} border ${theme.border} transition-all duration-300 shadow-2xs space-y-3`}>
      {/* 1. Header with Score Ring & Label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/90 shadow-2xs flex items-center justify-center shrink-0 border border-slate-100">
            <ShieldCheck className={`w-4 h-4 ${theme.text}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
              <span>{t('resume.atsReadinessScore')}</span>
              <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md border ${theme.badge}`}>
                {ratingLabel}
              </span>
            </h3>
            <p className="text-[10px] text-slate-500 truncate">
              {t('resume.atsReadinessDesc')}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline gap-0.5 justify-end">
            <span className={`text-base font-black ${theme.text}`}>
              {totalScore}
            </span>
            <span className="text-[10px] font-bold text-slate-400">/100</span>
          </div>
        </div>
      </div>

      {/* 2. Visual Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-black/5 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all duration-500 ease-out`}
          style={{ width: `${Math.max(4, totalScore)}%` }}
        />
      </div>

      {/* 3. Category Overview Quick Pills */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="p-1.5 rounded-lg bg-white/80 border border-slate-200/60">
          <div className="text-[9px] text-slate-500 truncate">{t('resume.categoryIdentity')}</div>
          <div className="text-xs font-bold text-slate-700">{breakdown.identity.score}/10</div>
        </div>
        <div className="p-1.5 rounded-lg bg-white/80 border border-slate-200/60">
          <div className="text-[9px] text-slate-500 truncate">{t('resume.categoryCompleteness')}</div>
          <div className="text-xs font-bold text-slate-700">{breakdown.completeness.score}/20</div>
        </div>
        <div className="p-1.5 rounded-lg bg-white/80 border border-slate-200/60">
          <div className="text-[9px] text-slate-500 truncate">{t('resume.categoryEvidence')}</div>
          <div className="text-xs font-bold text-slate-700">{breakdown.contentEvidence.score}/25</div>
        </div>
      </div>

      {/* 4. Top 3 Actionable Suggestions */}
      {topSuggestions.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>{t('resume.topSuggestions')}</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              {suggestions.length} findings
            </span>
          </div>

          <div className="space-y-1">
            {topSuggestions.map((sug, idx) => (
              <div
                key={idx}
                className="p-2 rounded-xl bg-white/90 border border-slate-200/70 text-[11px] text-slate-700 flex items-start gap-1.5 leading-snug"
              >
                <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                  sug.impact === 'high' ? 'text-amber-500' : 'text-blue-500'
                }`} />
                <span className="flex-1">{sug.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-2 rounded-xl bg-white/90 border border-emerald-200/70 text-[11px] text-emerald-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{t('resume.noSuggestions')}</span>
        </div>
      )}

      {/* 5. Expand / Collapse Full Findings */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full py-1.5 px-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
      >
        <span>
          {expanded ? t('resume.hideFindings') : t('resume.viewAllFindings').replace('{count}', suggestions.length)}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* 6. Expanded Category Details & Transparent Advisories */}
      {expanded && (
        <div className="pt-2 border-t border-slate-200/60 space-y-3">
          {/* Detailed 6-Category Breakdown Table */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              6-Category Mathematical Breakdown (100 Max)
            </span>

            <div className="space-y-1">
              {/* Category 1: Identity & Contact */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{t('resume.categoryIdentity')}</span>
                <span className="font-bold text-slate-800">{breakdown.identity.score} / {breakdown.identity.max}</span>
              </div>

              {/* Category 2: Section Completeness & Substance */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{t('resume.categoryCompleteness')}</span>
                <span className="font-bold text-slate-800">{breakdown.completeness.score} / {breakdown.completeness.max}</span>
              </div>

              {/* Category 3: Skills & Technical Relevance */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{t('resume.categorySkillsRelevance')}</span>
                <span className="font-bold text-slate-800">{(breakdown.skillsRelevance || breakdown.skillsQuality).score} / {(breakdown.skillsRelevance || breakdown.skillsQuality).max}</span>
              </div>

              {/* Category 4: Accomplishments & Supporting Evidence */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{t('resume.categoryEvidence')}</span>
                  <span className="font-bold text-slate-800">{breakdown.contentEvidence.score} / {breakdown.contentEvidence.max}</span>
                </div>
                {breakdown.contentEvidence.actionVerbsFound?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {breakdown.contentEvidence.actionVerbsFound.slice(0, 6).map((verb, idx) => (
                      <span key={idx} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                        {verb}
                      </span>
                    ))}
                    {breakdown.contentEvidence.actionVerbsFound.length > 6 && (
                      <span className="text-[9px] text-slate-400">+{breakdown.contentEvidence.actionVerbsFound.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* Category 5: Consistency & Formatting Hygiene */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{t('resume.categoryHygiene')}</span>
                <span className="font-bold text-slate-800">{breakdown.formattingHygiene.score} / {breakdown.formattingHygiene.max}</span>
              </div>

              {/* Category 6: Clarity & Standard Resume Structure */}
              <div className="p-2 rounded-xl bg-white/95 border border-slate-100 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{t('resume.categoryStructure')}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${getTplBadgeStyle(tplComp.rating)}`}>
                      {tplComp.profileBadge}
                    </span>
                    <span className="font-bold text-slate-800">{(breakdown.structureLayout || breakdown.templateCompatibility).score} / {(breakdown.structureLayout || breakdown.templateCompatibility).max}</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Selected template: <span className="font-medium text-slate-700 capitalize">{tplComp.templateId}</span>. Single-column layouts preserve natural linear text flow for automated parsers.
                </p>
              </div>
            </div>
          </div>

          {/* Remaining suggestions if any */}
          {remainingSuggestions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Additional Recommendations
              </span>
              {remainingSuggestions.map((sug, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-xl bg-white/90 border border-slate-200/70 text-[11px] text-slate-700 flex items-start gap-1.5"
                >
                  <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{sug.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Technical Export Pipeline Reality Warning */}
          <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-[10px] text-amber-900 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950 mb-0.5">Export Technical Notice</p>
              <p>{t('resume.pdfRasterNotice')}</p>
            </div>
          </div>

          {/* Educational Disclaimer */}
          <div className="text-[9px] text-slate-500 text-center leading-normal px-2">
            {t('resume.atsDisclaimer')}
          </div>
        </div>
      )}
    </div>
  )
}
