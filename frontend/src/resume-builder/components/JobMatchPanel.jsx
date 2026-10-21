import { useState, useMemo } from 'react'
import {
  Target,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  RotateCcw,
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { calculateJobMatch } from '../scoring/atsEngine'

export default function JobMatchPanel({ resume }) {
  const { t } = useLanguage()
  const [jobDescription, setJobDescription] = useState('')
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [showFullBreakdown, setShowFullBreakdown] = useState(false)

  // Automatically recalculate if user already analyzed and changes resume or edits JD
  const matchResult = useMemo(() => {
    if (!hasAnalyzed || !jobDescription.trim()) {
      return { status: 'not_calculated', score: null }
    }
    return calculateJobMatch(resume, jobDescription)
  }, [resume, jobDescription, hasAnalyzed])

  const handleAnalyze = () => {
    if (!jobDescription.trim()) return
    setHasAnalyzed(true)
  }

  const handleClear = () => {
    setJobDescription('')
    setHasAnalyzed(false)
  }

  // Color theme for Job Match score
  const getMatchTheme = (score) => {
    if (score >= 75) {
      return {
        bg: 'bg-emerald-50/80',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        bar: 'from-emerald-500 to-teal-500'
      }
    }
    if (score >= 55) {
      return {
        bg: 'bg-blue-50/80',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        bar: 'from-blue-500 to-indigo-500'
      }
    }
    if (score >= 35) {
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

  const wordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0

  return (
    <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
      {/* 1. Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-[#F78C25]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>{t('resume.jobMatchTitle')}</span>
              {matchResult.status === 'calculated' && (
                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md border ${getMatchTheme(matchResult.totalScore).badge}`}>
                  {matchResult.matchLevel}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-slate-500">
              {t('resume.jobMatchDesc')}
            </p>
          </div>
        </div>

        {matchResult.status === 'calculated' && (
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className={`text-base font-black ${getMatchTheme(matchResult.totalScore).text}`}>
                {matchResult.totalScore}
              </span>
              <span className="text-[10px] font-bold text-slate-400">/100</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Job Description Textarea */}
      <div className="space-y-1.5">
        <div className="relative">
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={t('resume.jobDescriptionPlaceholder')}
            rows={3}
            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-[#F78C25] focus:ring-1 focus:ring-[#F78C25] outline-none transition-all resize-y scrollbar-thin text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{wordCount} words {wordCount < 15 && wordCount > 0 ? '(min 15 words recommended)' : ''}</span>
          <div className="flex items-center gap-1.5">
            {jobDescription && (
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                {t('resume.clearJd')}
              </button>
            )}
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={wordCount < 5}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs ${
                wordCount >= 5
                  ? 'bg-[#F78C25] hover:bg-[#E57B18] text-white active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Search className="w-3 h-3" />
              <span>{t('resume.analyzeJobMatch')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Output States */}
      {/* State A: Not Calculated */}
      {!hasAnalyzed && (
        <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1 text-slate-500">
          <FileSearch className="w-5 h-5 mx-auto text-slate-400" />
          <p className="text-xs font-semibold text-slate-700">{t('resume.notCalculated')}</p>
          <p className="text-[10px] leading-tight text-slate-400 max-w-[280px] mx-auto">
            Paste requirements from a job posting above to discover matching skills, keywords, and practical evidence gaps.
          </p>
        </div>
      )}

      {/* State B: Insufficient Information */}
      {hasAnalyzed && matchResult.status === 'insufficient_job_description' && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Limited Job Information</span>
            <p className="text-[11px] text-amber-800 leading-normal">
              {matchResult.message || t('resume.insufficientJd')}
            </p>
          </div>
        </div>
      )}

      {/* State C: Successfully Calculated */}
      {hasAnalyzed && matchResult.status === 'calculated' && (
        <div className="space-y-3 pt-1">
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getMatchTheme(matchResult.totalScore).bar} transition-all duration-500 ease-out`}
              style={{ width: `${Math.max(4, matchResult.totalScore)}%` }}
            />
          </div>

          {/* Keywords Chips */}
          <div className="space-y-2">
            {/* Matched Keywords */}
            {matchResult.matchedKeywords?.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{t('resume.matchedKeywords')} ({matchResult.matchedKeywords.length})</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {matchResult.matchedKeywords.map((kw, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-md"
                    >
                      ✓ {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Evidenced Skills in Projects */}
            {matchResult.evidencedKeywords?.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  <Briefcase className="w-3 h-3 text-blue-600" />
                  <span>{t('resume.evidencedSkills')} ({matchResult.evidencedKeywords.length})</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {matchResult.evidencedKeywords.map((kw, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-md"
                    >
                      ✦ {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Keywords */}
            {matchResult.missingKeywords?.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-500" />
                  <span>{t('resume.missingKeywords')}</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {matchResult.missingKeywords.map((kw, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-md"
                    >
                      + {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actionable Suggestions */}
          {matchResult.suggestions?.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Targeted Tailoring Suggestions</span>
              </span>
              <div className="space-y-1">
                {matchResult.suggestions.slice(0, 3).map((sug, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700 leading-snug flex items-start gap-1.5"
                  >
                    <span className="text-[#F78C25] font-bold shrink-0">•</span>
                    <span>{sug.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggle Full Category Breakdown */}
          <button
            type="button"
            onClick={() => setShowFullBreakdown(!showFullBreakdown)}
            className="w-full py-1.5 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
          >
            <span>{showFullBreakdown ? 'Hide Breakdown' : 'View 5-Category Breakdown (100 Max)'}</span>
            {showFullBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showFullBreakdown && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-700">
                <span>{t('resume.reqSkillsCategory')}</span>
                <span className="font-bold">{matchResult.breakdown.requiredSkills.score} / {matchResult.breakdown.requiredSkills.max}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>{t('resume.otherSkillsCategory') || t('resume.skillOverlapCategory')}</span>
                <span className="font-bold">{(matchResult.breakdown.otherSkills || matchResult.breakdown.skillOverlap).score} / {(matchResult.breakdown.otherSkills || matchResult.breakdown.skillOverlap).max}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>{t('resume.projectEvidenceCategory')}</span>
                <span className="font-bold">{matchResult.breakdown.projectEvidence.score} / {matchResult.breakdown.projectEvidence.max}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>{t('resume.educationCategory')}</span>
                <span className="font-bold">{matchResult.breakdown.educationAlignment.score} / {matchResult.breakdown.educationAlignment.max}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>{t('resume.roleDomainCategory')}</span>
                <span className="font-bold">{matchResult.breakdown.roleDomainAlignment.score} / {matchResult.breakdown.roleDomainAlignment.max}</span>
              </div>
            </div>
          )}

          {/* Educational Disclaimer */}
          <p className="text-[9px] text-slate-500 text-center leading-normal px-2">
            {t('resume.atsDisclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}
