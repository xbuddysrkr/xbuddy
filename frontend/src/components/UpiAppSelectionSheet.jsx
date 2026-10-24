import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  X,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Search,
  Building2,
  Sparkles,
} from 'lucide-react'
import { launchAppOnly, detectPlatform } from '../utils/upiLauncher'
import { UPI_APP_REGISTRY, searchUpiApps } from '../utils/upiRegistry'
import { useLanguage } from '../i18n/LanguageContext'
import { saveSessionState } from '../utils/sessionStore'

/**
 * UpiAppSelectionSheet
 * 
 * Polished, comprehensive mobile-first bottom sheet allowing students to
 * open any verified Indian UPI application (TPAP or Member Bank app) directly.
 * 
 * STRICT INVARIANT: PURE APP LAUNCH ONLY.
 * Zero payment parameters (no pa, pn, am, cu, tn, tr or upi://pay).
 * The student opens the scanner manually and selects the downloaded XBuddy QR from Gallery.
 */
export default function UpiAppSelectionSheet({
  isOpen,
  onClose,
  payeeName,
  amount,
  orderId,
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [selectedApp, setSelectedApp] = useState(null)
  const [launchAttempted, setLaunchAttempted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all') // 'all' | 'popular' | 'tpap' | 'bank'
  const [isExpanded, setIsExpanded] = useState(false)
  const platform = detectPlatform()

  // Reset state whenever sheet opens or closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedApp(null)
      setLaunchAttempted(false)
      setSearchQuery('')
      setActiveCategory('all')
      setIsExpanded(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Filtered applications based on search query and category
  const filteredApps = useMemo(() => {
    return searchUpiApps(searchQuery, activeCategory)
  }, [searchQuery, activeCategory])

  // Decide which apps to display:
  // If in 'all' category with no active search query and not expanded:
  // Show popular apps (first 6) + "Show More" toggle.
  const displayApps = useMemo(() => {
    if (!searchQuery && activeCategory === 'all' && !isExpanded) {
      return UPI_APP_REGISTRY.filter((app) => app.isPopular)
    }
    return filteredApps
  }, [searchQuery, activeCategory, isExpanded, filteredApps])

  if (!isOpen) return null

  const formattedAmount = Number(amount || 0).toFixed(2)

  const handleAppClick = (app) => {
    setSelectedApp(app)
    setLaunchAttempted(true)

    // Persist session snapshot synchronously before launching external app
    saveSessionState({
      orderId,
      showPayment: true,
      lastLaunchedApp: app.id,
      updatedAt: Date.now(),
    })

    // Execute pure app launch (strictly OPEN ONLY)
    launchAppOnly(app)
  }

  const handleRetryLaunch = () => {
    if (selectedApp) {
      saveSessionState({
        orderId,
        showPayment: true,
        lastLaunchedApp: selectedApp.id,
        updatedAt: Date.now(),
      })
      launchAppOnly(selectedApp)
    }
  }

  const handleBackToSelector = () => {
    setSelectedApp(null)
    setLaunchAttempted(false)
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upi-sheet-title"
      >
        {/* Backdrop */}
        <motion.div
          key="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs cursor-pointer"
          aria-hidden="true"
        />

        {/* Bottom Sheet / Modal Dialog */}
        <motion.div
          key="sheet-content"
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { y: '100%', opacity: 0.5 }
          }
          animate={{ y: 0, opacity: 1 }}
          exit={
            shouldReduceMotion
              ? { opacity: 0 }
              : { y: '100%', opacity: 0 }
          }
          transition={{
            type: 'spring',
            damping: 28,
            stiffness: 300,
          }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border-t sm:border border-orange-200/90 z-10 max-h-[90vh] sm:max-h-[85vh] flex flex-col justify-between overflow-y-auto"
        >
          {/* Mobile Handle indicator */}
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer z-10"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>

          {!launchAttempted ? (
            /* ───────────────────────────────────────────────────────────── */
            /* VIEW 1: Grid of Installed UPI Apps to Open                   */
            /* ───────────────────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="pr-8 mb-3.5">
                <h3
                  id="upi-sheet-title"
                  className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2"
                >
                  {t('payment.chooseUpiApp', 'Choose your UPI app 📱')}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mt-1">
                  {t(
                    'payment.chooseUpiAppSubtitle',
                    'Your QR is ready! Open your payment app and scan it from Gallery.'
                  )}
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('payment.searchApps', 'Search payment apps (e.g. PhonePe, SBI, CRED)...')}
                  className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 focus:border-[#F78C25] focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-hidden font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                    aria-label={t('payment.clearSearch', 'Clear')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none text-[11px] sm:text-xs font-bold">
                {[
                  { id: 'all', label: t('payment.allApps', 'All'), count: UPI_APP_REGISTRY.length },
                  { id: 'popular', label: t('payment.popularApps', 'Popular'), count: 6 },
                  { id: 'tpap', label: t('payment.upiAppsCategory', 'UPI Apps'), count: 12 },
                  { id: 'bank', label: t('payment.bankAppsCategory', 'Bank Apps'), count: 6 },
                ].map((cat) => {
                  const isActive = activeCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveCategory(cat.id)
                        setIsExpanded(true)
                      }}
                      className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                        isActive
                          ? 'bg-[#F78C25] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-orange-600/40 text-white' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Grid of Rounded App Cards */}
              {displayApps.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5 mb-3">
                  {displayApps.map((app) => {
                    return (
                      <motion.button
                        key={app.id}
                        type="button"
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => handleAppClick(app)}
                        className={`p-2.5 rounded-2xl border ${app.borderColor} bg-gradient-to-b ${app.bgGradient} flex flex-col items-center justify-between text-center transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-md group`}
                      >
                        {/* Authentic App Logo Container */}
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center p-2 shadow-2xs mb-1.5 transition-transform group-hover:scale-105 overflow-hidden">
                          {app.logoUrl ? (
                            <img
                              src={app.logoUrl}
                              alt={t('payment.appLogoAlt', '{name} logo', { name: app.name })}
                              className="w-full h-full object-contain"
                              draggable={false}
                            />
                          ) : (
                            <div
                              className="w-full h-full rounded-xl flex items-center justify-center font-black text-xs text-white"
                              style={{ backgroundColor: app.brandColor }}
                            >
                              {app.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* App Label */}
                        <span className="font-bold text-slate-900 text-[11px] sm:text-xs truncate w-full">
                          {app.name}
                        </span>

                        {/* Category Badge */}
                        <span
                          className="text-[9px] font-semibold mt-0.5 truncate w-full flex items-center justify-center gap-0.5"
                          style={{ color: app.textColor }}
                        >
                          {app.category === 'bank' ? 'Bank' : 'UPI'}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs sm:text-sm">
                  <p>
                    {t(
                      'payment.noAppsFound',
                      'No payment apps found matching "{query}"',
                      { query: searchQuery }
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setActiveCategory('all')
                    }}
                    className="mt-2 text-xs font-bold text-[#F78C25] hover:underline cursor-pointer"
                  >
                    {t('payment.clearSearch', 'Clear filter')}
                  </button>
                </div>
              )}

              {/* Expandable Section Toggle (shown when in 'all' category with no search and not expanded) */}
              {!searchQuery && activeCategory === 'all' && !isExpanded && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  className="w-full py-2 px-3 mb-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span>
                    {t('payment.moreApps', 'More UPI Apps ({count})', {
                      count: UPI_APP_REGISTRY.length - 6,
                    })}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Show Less button when expanded in 'all' view with no search */}
              {!searchQuery && activeCategory === 'all' && isExpanded && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="w-full py-1.5 px-3 mb-3 text-slate-500 hover:text-slate-800 text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>{t('payment.lessApps', 'Show Less')}</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Order Amount and Recipient Indicator */}
              <div className="mt-auto p-2.5 bg-orange-50/70 border border-orange-200/80 rounded-2xl flex items-center justify-between text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#F78C25] shrink-0" />
                  <span>
                    Recipient: <strong>{payeeName || 'Xerox Shop'}</strong>
                  </span>
                </div>
                <span className="font-black text-[#F78C25] text-sm">
                  ₹{formattedAmount}
                </span>
              </div>
            </div>
          ) : (
            /* ───────────────────────────────────────────────────────────── */
            /* VIEW 2: Post-Launch Guidance & Manual Fallbacks               */
            /* ───────────────────────────────────────────────────────────── */
            <div>
              {/* Back to Apps list button */}
              <button
                type="button"
                onClick={handleBackToSelector}
                className="mb-3 text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('payment.backToApps', 'Back to all apps')}</span>
              </button>

              {/* Header with App Info */}
              <div className="flex items-center gap-3 pr-8 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center p-1.5 shadow-2xs shrink-0 overflow-hidden">
                  {selectedApp.logoUrl ? (
                    <img
                      src={selectedApp.logoUrl}
                      alt={t('payment.appLogoAlt', '{name} logo', { name: selectedApp.name })}
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-xl flex items-center justify-center font-black text-sm text-white"
                      style={{ backgroundColor: selectedApp.brandColor }}
                    >
                      {selectedApp.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg sm:text-xl">
                    Opening {selectedApp.name}...
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Order Ref: <span className="font-mono text-slate-700 font-bold">{orderId || 'XB_ORDER'}</span>
                  </p>
                </div>
              </div>

              {/* Informative Guidance Banner */}
              <div className="p-3.5 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl mb-4 text-xs sm:text-sm text-slate-800 leading-relaxed">
                <p className="font-semibold">
                  {t(
                    'payment.continueInUpiApp',
                    'Continue in your UPI app. Select your saved XBuddy QR and verify the payment details.'
                  )}
                </p>
              </div>

              {/* Concise 3-Step Guide */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl mb-4 text-xs">
                <p className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{t('payment.stepGuideTitle', 'Quick Steps in {name}:', { name: selectedApp.name })}</span>
                </p>
                <ol className="space-y-1.5 pl-5 list-decimal text-slate-600 font-medium leading-normal">
                  <li>
                    {t('payment.guideStep1', 'Open {name}', { name: selectedApp.name })}
                  </li>
                  <li>
                    {t('payment.guideStep2', 'Tap Scan QR → Gallery')}
                  </li>
                  <li>
                    {t('payment.guideStep3', 'Select saved XBuddy QR & pay')}
                  </li>
                </ol>
              </div>

              {/* Manual Fallback (if browser blocked intent launch or app not installed) */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl mb-4 text-xs text-amber-900">
                <p className="font-semibold flex items-center gap-1.5 mb-1 text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {t('payment.couldNotOpenAppManual', "Couldn't open this app? Open it manually to continue.")}
                  </span>
                </p>
                {selectedApp.playStoreUrl && (
                  <a
                    href={selectedApp.playStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-950 underline hover:text-amber-800 mt-1"
                  >
                    <span>
                      {t('payment.viewOnPlayStore', 'Open {name} on Play Store ↗', { name: selectedApp.name })}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleRetryLaunch}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F78C25] to-orange-500 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('payment.tryOpeningAgain', 'Try Opening Again')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBackToSelector}
                  className="w-full py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('payment.chooseAnotherApp', 'Choose Another App')}</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
