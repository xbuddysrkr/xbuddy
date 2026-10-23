/**
 * PaymentQrInstructionsModal.jsx
 * 
 * Mobile-friendly popup notification explaining how to open PhonePe or other
 * UPI apps and pay using the automatically downloaded XBuddy payment QR image.
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Smartphone,
  ExternalLink,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  FileImage,
  ArrowRight,
} from 'lucide-react'

export default function PaymentQrInstructionsModal({
  isOpen,
  onClose,
  amount,
  orderId,
  payeeName,
  remainingSeconds = 300,
  onDownloadAgain,
  onOpenPhonePe,
  isDownloaded = true,
  downloadError = false,
}) {
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
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative bg-white rounded-3xl p-5 sm:p-6 w-full max-w-sm sm:max-w-md border border-orange-200/80 shadow-2xl z-10 text-slate-800 my-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle decorative background gradient */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close instructions"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Icon Header */}
          <div className="flex items-center gap-3.5 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-100/80 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0 shadow-xs">
              <FileImage className="w-6 h-6" />
            </div>
            <div className="pr-6">
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight leading-snug">
                Your Payment QR Is Ready!
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Order <span className="font-mono font-bold text-slate-700">{orderId || 'PENDING'}</span>
              </p>
            </div>
          </div>

          {/* Status Banner */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-3.5 border border-orange-200/70 mb-3.5">
            <div className="flex items-start gap-2.5">
              {downloadError ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-semibold text-slate-800">
                  Your <strong className="text-orange-600 font-bold">₹{formattedAmount}</strong> payment QR is being downloaded to your device.
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Check your browser Downloads folder if not visible immediately.
                </p>
              </div>
            </div>

            {/* Fallback re-download button if needed */}
            {onDownloadAgain && (
              <button
                type="button"
                onClick={onDownloadAgain}
                className="mt-2.5 w-full py-1.5 px-3 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Tap to Download QR Again
              </button>
            )}
          </div>

          {/* Next Steps Instruction Block */}
          <div className="space-y-2 mb-3.5">
            <h4 className="text-xs font-bold text-slate-900 tracking-wider uppercase flex items-center gap-1.5">
              <span>Next steps:</span>
            </h4>
            <ol className="text-xs text-slate-700 space-y-2 bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/80 font-normal leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Open <strong>PhonePe</strong>, Google Pay, Paytm, or another supported UPI app.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Open the app&apos;s <strong>Scan QR</strong> option.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>If available, choose the <strong>Gallery</strong> or <strong>Upload QR</strong> option.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                <span>Select the downloaded <strong>XBuddy payment QR</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">5</span>
                <span>
                  Verify the shopkeeper&apos;s name (<strong className="text-slate-900">{payeeName || 'THANALA VS NSP SAILOKESH'}</strong>) and the <strong className="text-orange-600">₹{formattedAmount}</strong> amount.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">6</span>
                <span>Confirm the payment in your UPI app.</span>
              </li>
            </ol>
          </div>

          {/* 5-Minute Checkout Session Expiry Notice */}
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-900 mb-4 leading-normal flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span>
                Your order QR is intended for a 5-minute checkout session. If it expires, return to XBuddy to check the order status before creating a new payment attempt.
              </span>
              <div className="mt-1 font-bold text-amber-800 flex items-center gap-1.5 text-xs">
                <span>Session timer:</span>
                <span className={`font-mono px-1.5 py-0.5 rounded ${isExpired ? 'bg-red-100 text-red-700' : 'bg-white border border-amber-200 text-amber-900'}`}>
                  {isExpired ? 'Expired' : formattedCountdown}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="space-y-2">
            {onOpenPhonePe && (
              <button
                type="button"
                onClick={onOpenPhonePe}
                className="w-full py-2.5 px-4 bg-[#5f259f] hover:bg-[#4b1d7d] text-white font-bold text-xs rounded-xl shadow-md shadow-purple-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" /> Open PhonePe App
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>View QR Code on Screen</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
