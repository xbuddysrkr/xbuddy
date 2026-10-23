/**
 * PaymentQrInstructionsModal.jsx
 * 
 * Playful, compact, mobile-first payment popup guiding students to pay via their
 * favourite UPI app using their automatically downloaded XBuddy payment QR image.
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Sparkles,
  QrCode,
  Image as ImageIcon,
  Check,
} from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * Animated Phone Mockup showing the 3 core UPI actions:
 * 1. Open UPI App
 * 2. Scan QR → Gallery
 * 3. Select XBuddy QR → Pre-filled & Ready
 */
function AnimatedPhoneVisual({ step, onSelectStep, amount, payeeName, shouldReduceMotion }) {
  const formattedAmount = Number(amount || 0).toFixed(2)

  return (
    <div className="flex flex-col items-center">
      {/* Smartphone Frame */}
      <div
        className="w-48 h-48 sm:w-52 sm:h-52 rounded-3xl bg-slate-900 border-[3px] border-slate-700/80 shadow-lg shadow-purple-950/20 p-2 relative overflow-hidden select-none flex flex-col justify-between"
        aria-label="Interactive guide showing how to select your downloaded QR in your UPI app"
      >
        {/* Phone Speaker Notch & Camera Dot */}
        <div className="w-14 h-1.5 bg-slate-800 rounded-full mx-auto mb-1 shrink-0 flex items-center justify-end px-1.5">
          <div className="w-1 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Dynamic Screen Content */}
        <div className="flex-1 w-full bg-slate-950 rounded-2xl overflow-hidden relative flex flex-col justify-center items-center">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step-app"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.28 }}
                className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-2.5 flex flex-col items-center justify-between text-white"
              >
                {/* Simulated Home Screen Status Bar */}
                <div className="w-full flex justify-between items-center text-[9px] text-slate-400 px-1 font-mono">
                  <span>9:41</span>
                  <span>UPI 5G</span>
                </div>

                {/* Center UPI App Icon with Pulsing Tap */}
                <div className="relative my-auto flex flex-col items-center">
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? {}
                        : {
                            scale: [1, 1.06, 0.96, 1],
                            boxShadow: [
                              '0 0 0px rgba(247,140,37,0)',
                              '0 0 16px rgba(147,51,234,0.6)',
                              '0 0 0px rgba(247,140,37,0)',
                            ],
                          }
                    }
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#5f259f] via-indigo-600 to-[#F78C25] p-0.5 shadow-md flex items-center justify-center cursor-pointer"
                  >
                    <div className="w-full h-full bg-slate-900/40 rounded-[14px] flex flex-col items-center justify-center backdrop-blur-xs">
                      <span className="text-lg font-black tracking-tight text-white">₹</span>
                      <span className="text-[8px] font-black tracking-widest text-orange-300 uppercase">UPI</span>
                    </div>
                  </motion.div>

                  {/* Playful Tap Finger / Ripple */}
                  {!shouldReduceMotion && (
                    <motion.div
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.6, 1.4, 1.8],
                        y: [6, -2, -6],
                      }}
                      transition={{ repeat: Infinity, duration: 2.2, delay: 0.4 }}
                      className="absolute -bottom-2 -right-2 pointer-events-none"
                    >
                      <span className="text-base select-none">👆</span>
                    </motion.div>
                  )}

                  <p className="text-[10px] font-bold text-slate-200 mt-1.5 text-center leading-tight">
                    Any UPI App
                  </p>
                </div>

                <div className="text-[9px] text-purple-300 font-semibold bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
                  PhonePe • GPay • Paytm
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-scan"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.28 }}
                className="w-full h-full bg-slate-950 p-2 flex flex-col justify-between items-center text-white relative"
              >
                {/* Viewfinder Header */}
                <div className="text-[9px] font-bold text-slate-300 flex items-center gap-1">
                  <QrCode className="w-3 h-3 text-orange-400" />
                  <span>Scan QR Code</span>
                </div>

                {/* Camera Viewfinder Reticle */}
                <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-slate-700/80 flex items-center justify-center my-auto">
                  {/* Corner Target Accents */}
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-orange-400 -mt-0.5 -ml-0.5 rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-orange-400 -mt-0.5 -mr-0.5 rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-orange-400 -mb-0.5 -ml-0.5 rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-orange-400 -mb-0.5 -mr-0.5 rounded-br-sm" />

                  {/* Sweeping Laser Line */}
                  {!shouldReduceMotion && (
                    <motion.div
                      animate={{ y: [-24, 24, -24] }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                      className="w-16 h-0.5 bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_8px_rgba(247,140,37,0.8)]"
                    />
                  )}
                  <QrCode className="w-8 h-8 text-slate-800" />
                </div>

                {/* Gallery Button with Tap Action */}
                <div className="relative w-full">
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? {}
                        : {
                            scale: [1, 1.05, 0.95, 1],
                            borderColor: ['rgba(147,51,234,0.4)', 'rgba(247,140,37,0.8)', 'rgba(147,51,234,0.4)'],
                          }
                    }
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    className="w-full py-1 px-2 rounded-xl bg-gradient-to-r from-purple-900/80 to-indigo-900/80 border border-purple-400/60 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                    <span className="text-[10px] font-black text-white tracking-wide">
                      Gallery / Upload QR
                    </span>
                  </motion.div>

                  {!shouldReduceMotion && (
                    <motion.div
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.7, 1.3, 1.6],
                        y: [4, -2, -4],
                      }}
                      transition={{ repeat: Infinity, duration: 2.2, delay: 0.5 }}
                      className="absolute -top-3 right-4 pointer-events-none"
                    >
                      <span className="text-base select-none">👆</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-select"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.28 }}
                className="w-full h-full bg-slate-900 p-2 flex flex-col justify-between items-center text-white"
              >
                {/* Gallery Title */}
                <div className="w-full flex items-center justify-between text-[9px] text-slate-300 px-0.5">
                  <span className="font-bold flex items-center gap-1">
                    <ImageIcon className="w-3 h-3 text-purple-400" /> Recent Downloads
                  </span>
                  <span className="text-emerald-400 text-[8px] font-bold">1 Selected</span>
                </div>

                {/* Gallery Thumbnail Grid with XBuddy QR Highlighted */}
                <div className="w-full grid grid-cols-3 gap-1 my-1">
                  {/* Highlighted XBuddy QR */}
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? {}
                        : {
                            scale: [1, 1.04, 1],
                            borderColor: ['#F78C25', '#10B981', '#F78C25'],
                          }
                    }
                    transition={{ repeat: Infinity, duration: 2.2 }}
                    className="relative aspect-square rounded-lg bg-white border-2 border-emerald-400 p-1 flex flex-col items-center justify-center shadow-md cursor-pointer"
                  >
                    <QrCode className="w-6 h-6 text-slate-900" />
                    <span className="absolute bottom-0.5 inset-x-0.5 bg-orange-600 text-white text-[6px] font-black text-center rounded-[2px] leading-tight uppercase">
                      XBuddy
                    </span>
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-bold shadow-xs">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  </motion.div>

                  {/* Generic Gallery Dummy Tiles */}
                  <div className="aspect-square rounded-lg bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-600 text-[9px]">
                    🖼️
                  </div>
                  <div className="aspect-square rounded-lg bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-600 text-[9px]">
                    📄
                  </div>
                </div>

                {/* Success Preview Card */}
                <motion.div
                  initial={shouldReduceMotion ? {} : { scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="w-full bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 rounded-xl p-1.5 border border-emerald-500/40 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="truncate">
                      <p className="text-[9px] font-black text-emerald-300 leading-none truncate">
                        ₹{formattedAmount} Pre-filled
                      </p>
                      <p className="text-[7px] text-slate-400 truncate mt-0.5">
                        {payeeName || 'XBuddy Partner'}
                      </p>
                    </div>
                  </div>
                  <Sparkles className="w-3 h-3 text-amber-300 animate-spin shrink-0" style={{ animationDuration: '4s' }} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Home Navigation Indicator Bar */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mt-1 shrink-0" />
      </div>

      {/* Playful Interactive Step Pills (1 • 2 • 3) */}
      <div className="flex items-center justify-center gap-2 mt-2.5" role="tablist" aria-label="Step Navigation">
        {[0, 1, 2].map((idx) => {
          const isActive = step === idx
          return (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectStep(idx)}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer select-none ${
                isActive
                  ? 'bg-gradient-to-r from-[#F78C25] to-amber-500 text-white shadow-xs scale-105'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>{idx + 1}</span>
              {isActive && (
                <span className="text-[9px] font-extrabold uppercase tracking-wider ml-0.5">
                  {idx === 0 ? 'App' : idx === 1 ? 'Gallery' : 'Pay'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PaymentQrInstructionsModal({
  isOpen,
  onClose,
  amount,
  orderId,
  payeeName,
  remainingSeconds = 300,
  onDownloadAgain,
  isDownloaded = true,
  downloadError = false,
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [activeStep, setActiveStep] = useState(0)

  // 3-step automatic smooth cycling animation (every 2.6s)
  useEffect(() => {
    if (!isOpen || shouldReduceMotion) return
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3)
    }, 2600)
    return () => clearInterval(timer)
  }, [isOpen, shouldReduceMotion])

  if (!isOpen) return null

  const formattedAmount = Number(amount || 0).toFixed(2)
  const isExpired = remainingSeconds <= 0
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          key="qr-instructions-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Dialog Card */}
        <motion.div
          key="qr-instructions-card"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative bg-white rounded-3xl p-4 sm:p-5 w-full max-w-sm sm:max-w-md border border-orange-200/90 shadow-2xl z-10 text-slate-800 my-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle Top Decorative Brand Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-purple-600" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close instructions"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Row: Title, Amount & Order Reference */}
          <div className="pr-8 mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                {t('payment.almostThere', 'Almost there! 🎉')}
              </h3>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl sm:text-2xl font-black text-[#F78C25] tracking-tight">
                ₹{formattedAmount}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                {orderId || 'XB_ORDER'}
              </span>
              <span className="text-slate-300">•</span>
              {/* 5-Minute Countdown Chip */}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                  isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                }`}
                title="5-minute payment session"
              >
                <Clock className="w-3 h-3" />
                <span>{isExpired ? 'Expired' : formattedCountdown}</span>
              </div>
            </div>
          </div>

          {/* Animated Phone Visual Guide */}
          <div className="my-2 p-2.5 rounded-2xl bg-gradient-to-b from-slate-50 to-orange-50/40 border border-orange-100/80">
            <AnimatedPhoneVisual
              step={activeStep}
              onSelectStep={setActiveStep}
              amount={amount}
              payeeName={payeeName}
              shouldReduceMotion={shouldReduceMotion}
            />

            {/* Current Step Label Text */}
            <p className="text-center text-xs font-bold text-slate-700 mt-2 min-h-[1.5rem] flex items-center justify-center">
              {activeStep === 0 &&
                t('payment.step1Desc', 'Open PhonePe, Google Pay or your favourite UPI app.')}
              {activeStep === 1 &&
                t('payment.step2Desc', 'Tap Scan QR, then select Gallery / Upload QR.')}
              {activeStep === 2 &&
                t('payment.step3Desc', 'Select your saved XBuddy QR to review and pay.')}
            </p>
          </div>

          {/* Prominent Concise Instruction */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl p-3 shadow-xs text-center my-2.5">
            <p className="text-xs sm:text-sm font-extrabold tracking-tight leading-snug">
              {t(
                'payment.upiFlowPrompt',
                'Open your UPI app → Scan QR → Gallery → Select your saved XBuddy QR.'
              )}
            </p>
          </div>

          {/* Pre-filled Notice & Shopkeeper Verification */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 text-xs text-slate-600 text-center leading-relaxed mb-3">
            <p>
              {t(
                'payment.upiAmountPreFilled',
                'Your ₹{amount} should be pre-filled. Verify the shop name and amount, then confirm payment.',
                { amount: formattedAmount }
              )}
            </p>
          </div>

          {/* Fallback Download Action (Only Rendered if Automatic Download Failed) */}
          {downloadError && onDownloadAgain && (
            <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
              <p className="text-[11px] text-amber-800 font-semibold mb-1.5 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {t('payment.downloadFailed', 'Automatic download didn’t start? Tap below:')}
              </p>
              <button
                type="button"
                onClick={onDownloadAgain}
                className="w-full py-1.5 px-3 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {t('payment.downloadFallback', 'Download QR Image')}
              </button>
            </div>
          )}

          {/* Primary Action Button: Got It / Review & Pay */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F78C25] to-orange-500 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <span>{t('payment.gotItPay', 'Got it, Review & Pay')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
