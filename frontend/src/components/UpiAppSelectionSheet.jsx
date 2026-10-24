import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, ArrowRight, ExternalLink, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, Smartphone } from 'lucide-react'
import { SUPPORTED_OPEN_ONLY_APPS, launchAppOnly, detectPlatform } from '../utils/upiLauncher'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * UpiAppSelectionSheet
 * 
 * Custom, mobile-first bottom sheet allowing students to open their preferred
 * installed UPI app directly (OPEN ONLY — zero payment data / parameters).
 * The student opens the scanner inside the app and selects the downloaded QR.
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
  const platform = detectPlatform()

  // Reset state whenever sheet opens or closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedApp(null)
      setLaunchAttempted(false)
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

  if (!isOpen) return null

  const formattedAmount = Number(amount || 0).toFixed(2)

  const handleAppClick = (app) => {
    setSelectedApp(app)
    setLaunchAttempted(true)

    // Execute pure app launch (strictly OPEN ONLY)
    launchAppOnly(app)
  }

  const handleRetryLaunch = () => {
    if (selectedApp) {
      launchAppOnly(selectedApp)
    }
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
          className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border-t sm:border border-orange-200/90 z-10 max-h-[90vh] flex flex-col justify-between overflow-y-auto"
        >
          {/* Mobile Handle indicator */}
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>

          {!launchAttempted ? (
            /* ───────────────────────────────────────────────────────────── */
            /* VIEW 1: Grid of Installed UPI Apps to Open                   */
            /* ───────────────────────────────────────────────────────────── */
            <div>
              {/* Header */}
              <div className="pr-8 mb-5">
                <h3
                  id="upi-sheet-title"
                  className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2"
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

              {/* Grid of Rounded App Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {SUPPORTED_OPEN_ONLY_APPS.map((app) => {
                  return (
                    <motion.button
                      key={app.id}
                      type="button"
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAppClick(app)}
                      className={`p-3.5 rounded-2xl border ${app.borderColor} bg-gradient-to-b ${app.bgGradient} flex flex-col items-center justify-between text-center transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-md group`}
                    >
                      {/* App Icon Circle */}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shadow-xs mb-2 transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: app.brandColor,
                          color: '#ffffff',
                        }}
                      >
                        {app.id === 'phonepe' && <span className="text-xl">पे</span>}
                        {app.id === 'gpay' && (
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-xs">
                            <span className="font-extrabold text-[11px] tracking-tight">
                              <span className="text-[#4285F4]">G</span>
                              <span className="text-[#EA4335]">P</span>
                              <span className="text-[#FBBC05]">a</span>
                              <span className="text-[#34A853]">y</span>
                            </span>
                          </div>
                        )}
                        {app.id === 'paytm' && <span className="text-xs font-black">Paytm</span>}
                        {app.id === 'bhim' && <span className="text-xs font-black">BHIM</span>}
                        {app.id === 'cred' && <span className="text-xs font-black">CRED</span>}
                        {app.id === 'amazon' && <span className="text-xs font-black">Amazon</span>}
                      </div>

                      {/* App Label */}
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">
                        {app.name}
                      </span>
                      <span
                        className="text-[10px] font-bold mt-1 flex items-center gap-0.5 group-hover:underline"
                        style={{ color: app.textColor }}
                      >
                        {t('payment.openApp', { name: app.name })} <ChevronRight className="w-3 h-3" />
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              {/* Order Amount and Recipient Indicator */}
              <div className="p-3 bg-orange-50/70 border border-orange-200/80 rounded-2xl flex items-center justify-between text-xs text-slate-700">
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
              {/* Header with App Info */}
              <div className="flex items-center gap-3 pr-8 mb-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs shrink-0"
                  style={{ backgroundColor: selectedApp.brandColor }}
                >
                  {selectedApp.id === 'phonepe' && <span className="text-xl">పే</span>}
                  {selectedApp.id === 'gpay' && (
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-xs">
                      <span className="font-extrabold text-[11px] tracking-tight">
                        <span className="text-[#4285F4]">G</span>
                        <span className="text-[#EA4335]">P</span>
                        <span className="text-[#FBBC05]">a</span>
                        <span className="text-[#34A853]">y</span>
                      </span>
                    </div>
                  )}
                  {selectedApp.id === 'paytm' && <span className="text-xs">Paytm</span>}
                  {selectedApp.id === 'bhim' && <span className="text-xs">BHIM</span>}
                  {selectedApp.id === 'cred' && <span className="text-xs">CRED</span>}
                  {selectedApp.id === 'amazon' && <span className="text-xs">Amazon</span>}
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
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 mb-4 space-y-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('payment.stepGuideTitle', { name: selectedApp.name }, `Quick Steps in ${selectedApp.name}:`)}
                </p>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                  <span>{t('payment.guideStep1', { name: selectedApp.name }, `Open ${selectedApp.name}`)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                  <span>{t('payment.guideStep2', 'Tap Scan QR → Gallery')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                  <span>{t('payment.guideStep3', 'Select saved XBuddy QR & pay')}</span>
                </div>
              </div>

              {/* Friendly Fallback if App Didn't Open */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl mb-4 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">
                    {t(
                      'payment.couldNotOpenAppManual',
                      "Couldn't open this app? Open it manually to continue."
                    )}
                  </p>
                  {selectedApp.playStoreUrl && (
                    <a
                      href={selectedApp.playStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-amber-800 hover:text-amber-950 underline mt-1 text-[11px]"
                    >
                      <span>{t('payment.viewOnPlayStore', { name: selectedApp.name }, `Open ${selectedApp.name} on Play Store`)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Action Buttons: Retry / Switch App / Close */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleRetryLaunch}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#F78C25] to-orange-500 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('payment.tryOpeningAgain', 'Try Opening Again')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedApp(null)
                    setLaunchAttempted(false)
                  }}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
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
