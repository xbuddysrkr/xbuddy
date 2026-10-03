import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PaymentProofForm from './PaymentProofForm'
import { Smartphone, QrCode, Copy, Check, ArrowRight, RotateCcw, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { detectPlatform, directLaunchUPI, buildUpiQuery, openPhonePeAppOnly } from '../utils/upiLauncher'

const UPI_ID = import.meta.env.VITE_UPI_ID || 'xbuddy@upi'
const PAYEE_NAME = import.meta.env.VITE_PAYEE_NAME || 'Xerox Buddy'

const PAYMENT_APPS = [
  {
    id: 'phonepe',
    name: 'PhonePe',
    description: 'Tap to open PhonePe app',
    iconBg: '#5f259f',
    textColor: '#5f259f',
    borderColor: 'border-purple-200',
    bgGradient: 'from-purple-50 to-white hover:from-purple-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#5f259f] text-white flex items-center justify-center font-bold text-base shadow-xs">
        पे
      </div>
    ),
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    description: 'Tap to open Google Pay app',
    iconBg: '#ffffff',
    textColor: '#1a73e8',
    borderColor: 'border-blue-200',
    bgGradient: 'from-blue-50 to-white hover:from-blue-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center font-extrabold text-xs shadow-xs">
        <span className="text-[#4285F4]">G</span><span className="text-[#EA4335]">P</span><span className="text-[#FBBC05]">a</span><span className="text-[#34A853]">y</span>
      </div>
    ),
  },
  {
    id: 'paytm',
    name: 'Paytm',
    description: 'Tap to open Paytm app',
    iconBg: '#002970',
    textColor: '#00b9f5',
    borderColor: 'border-sky-200',
    bgGradient: 'from-sky-50 to-white hover:from-sky-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#002970] text-[#00b9f5] flex items-center justify-center font-black text-[11px] shadow-xs">
        Paytm
      </div>
    ),
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    description: 'Tap to open BHIM app',
    iconBg: '#007849',
    textColor: '#007849',
    borderColor: 'border-emerald-200',
    bgGradient: 'from-emerald-50 to-white hover:from-emerald-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#007849] text-white flex items-center justify-center font-black text-[10px] shadow-xs">
        BHIM
      </div>
    ),
  },
  {
    id: 'any',
    name: 'Any UPI App',
    description: 'Cred, Amazon Pay, WhatsApp, etc.',
    iconBg: '#F7931E',
    textColor: '#F7931E',
    borderColor: 'border-orange-200',
    bgGradient: 'from-orange-50 to-white hover:from-orange-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#EA580C] to-[#F7931E] text-white flex items-center justify-center font-bold text-xs shadow-xs">
        UPI
      </div>
    ),
  },
]

export default function PaymentModal({ total, orderMeta, onSuccess, onClose }) {
  // Step states: 'SELECT' | 'PHONEPE_MANUAL' | 'LAUNCHING' | 'DID_YOU_PAY' | 'FORM'
  const [step, setStep] = useState('SELECT')
  const [selectedApp, setSelectedApp] = useState(null)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [viewMode, setViewMode] = useState('apps') // 'apps' | 'qr'
  const [desktopNotice, setDesktopNotice] = useState('')
  const [fallbackNotice, setFallbackNotice] = useState('')
  const [genericFallbackUri, setGenericFallbackUri] = useState('')
  const launchingTimeoutRef = useRef(null)
  const isLaunchingRef = useRef(false)

  // Build standard UPI URI for QR code and generic fallback (exact matching merchant VPA, 2-decimals amount, and refId)
  const note = `XBuddy Print ${orderMeta?.fileName ? orderMeta.fileName.slice(0, 15) : 'Order'}`
  const refId = orderMeta?.orderId || orderMeta?.fileId || ''
  const upiQuery = buildUpiQuery({ upiId: UPI_ID, payeeName: PAYEE_NAME, amount: total, note, refId })
  const genericUpiUri = `upi://pay?${upiQuery}`
  const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(genericUpiUri)}&size=220x220&margin=4`

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (launchingTimeoutRef.current) {
        clearTimeout(launchingTimeoutRef.current)
      }
    }
  }, [])

  function handleSelectApp(app) {
    // Prevent double-click duplicate launches
    if (isLaunchingRef.current) return
    isLaunchingRef.current = true
    setTimeout(() => {
      isLaunchingRef.current = false
    }, 1500)

    const platform = detectPlatform()

    if (platform === 'desktop') {
      setSelectedApp(app)
      setViewMode('qr')
      setDesktopNotice('Please use your mobile device to open the payment app, or scan the QR code below.')
      setFallbackNotice('')
      return
    }

    setDesktopNotice('')
    setFallbackNotice('')
    setSelectedApp(app)

    // PHONEPE APP ONLY LAUNCH:
    // Pure app launch — absolutely no payment parameters, no amount, no recipient, no prefilled screen.
    if (app.id === 'phonepe') {
      openPhonePeAppOnly()
      setStep('PHONEPE_MANUAL')
      return
    }

    // Synchronous direct top-level navigation inside the user's tap gesture for other UPI apps
    const { genericFallbackUrl } = directLaunchUPI({
      appId: app.id,
      upiId: UPI_ID,
      payeeName: PAYEE_NAME,
      amount: total,
      note,
      refId,
    })

    setGenericFallbackUri(genericFallbackUrl)
    setStep('LAUNCHING')

    // Transition to DID_YOU_PAY confirmation after browser pause/return window
    if (launchingTimeoutRef.current) clearTimeout(launchingTimeoutRef.current)
    launchingTimeoutRef.current = setTimeout(() => {
      setStep((currentStep) => (currentStep === 'LAUNCHING' ? 'DID_YOU_PAY' : currentStep))
    }, 4500)
  }

  function copyUpiId() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(UPI_ID)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2000)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />
      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-orange-200 shadow-2xl max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-[#222222]">
                {step === 'FORM' ? 'Confirm Payment' : 'Scan & Pay'}
              </h3>
              <p className="text-gray-400 text-xs">
                {step === 'FORM' ? 'Enter transaction details' : 'Pay via UPI and confirm your order'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 flex items-center justify-center text-gray-400 transition-all cursor-pointer"
            >✕</button>
          </div>

          {/* Amount breakdown badge */}
          <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-3.5 mb-4 text-xs">
            <div className="flex justify-between text-gray-500 mb-1">
              <span>Printing Cost</span>
              <span className="font-semibold text-gray-800">₹{orderMeta?.printingCost ?? total}</span>
            </div>
            <div className="flex justify-between text-gray-500 mb-1.5">
              <span>Digital Processing Fee</span>
              <span className="font-semibold text-gray-800">+₹{orderMeta?.digitalProcessingFee ?? orderMeta?.serviceFee ?? 0}</span>
            </div>
            <div className="flex justify-between items-center border-t border-orange-200 pt-2 font-bold">
              <span className="text-slate-800 text-sm">Total Payable:</span>
              <span className="text-[#F78C25] font-extrabold text-2xl">₹{total}</span>
            </div>
          </div>

          {/* ─── STEP 1: SELECT PAYMENT METHOD ─── */}
          {step === 'SELECT' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('apps')}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'apps' ? 'bg-white text-[#F78C25] shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> 1-Tap UPI Apps
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('qr')}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'qr' ? 'bg-white text-[#F78C25] shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" /> Scan QR Code
                </button>
              </div>

              {/* View: 1-Tap UPI Apps */}
              {viewMode === 'apps' && (
                <div className="space-y-2.5 mb-4">
                  {fallbackNotice && (
                    <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center justify-between shadow-2xs">
                      <span>💡 {fallbackNotice}</span>
                      <button
                        type="button"
                        onClick={() => setFallbackNotice('')}
                        className="text-amber-700 hover:text-amber-900 text-xs font-bold ml-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                    <span>Select app to open:</span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Direct Launcher</span>
                  </p>

                  {PAYMENT_APPS.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => handleSelectApp(app)}
                      className={`w-full py-2.5 px-3 rounded-2xl border ${app.borderColor} bg-gradient-to-r ${app.bgGradient} text-slate-900 font-semibold text-xs flex items-center justify-between shadow-xs hover:shadow-md transition-all cursor-pointer group`}
                    >
                      <div className="flex items-center gap-3">
                        {app.icon}
                        <div className="text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs">{app.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">{app.description}</p>
                        </div>
                      </div>
                      <span className="font-bold text-xs flex items-center gap-1 group-hover:translate-x-0.5 transition-transform" style={{ color: app.textColor }}>
                        Open {app.name} <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* View: QR Code */}
              {viewMode === 'qr' && (
                <div className="mb-4 text-center">
                  {fallbackNotice ? (
                    <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
                      💡 {fallbackNotice}
                    </div>
                  ) : desktopNotice ? (
                    <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
                      📱 {desktopNotice}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mb-2">Scan using PhonePe, GPay, Paytm, or BHIM</p>
                  )}
                  <div className="bg-[#FFF8F2] rounded-2xl p-3.5 mb-3 mx-auto w-fit border border-orange-100 shadow-xs">
                    <img
                      src={dynamicQrUrl}
                      alt="UPI Payment QR Code"
                      className="w-48 h-48 object-contain rounded-lg"
                      onError={(e) => {
                        e.target.src = '/qr-code.png'
                      }}
                    />
                  </div>

                  {/* UPI ID copy */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                    <div className="text-left">
                      <span className="text-slate-400 text-[10px] block">UPI ID</span>
                      <span className="font-mono font-bold text-slate-700">{UPI_ID}</span>
                    </div>
                    <button
                      type="button"
                      onClick={copyUpiId}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#F78C25] text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    >
                      {copiedUpi ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Jump to Form if already paid */}
              <div className="border-t border-slate-100 pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="text-xs font-semibold text-[#F78C25] hover:text-[#e07010] hover:underline cursor-pointer transition-colors"
                >
                  Already paid? Enter Transaction ID →
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── PHONEPE MANUAL APP LAUNCH STEP ─── */}
          {step === 'PHONEPE_MANUAL' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center space-y-3.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center relative shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#5f259f] text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  पे
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-base">Opening PhonePe...</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Pay <strong className="text-slate-800">₹{Number(total || 0).toFixed(2)}</strong> manually in your PhonePe app.
                </p>
              </div>

              {/* Requirement: clear message if app couldn't be opened */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium text-left">
                💡 PhonePe couldn't be opened. Please open PhonePe manually.
              </div>

              {/* Quick Manual Payment Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Payable Amount:</span>
                  <span className="font-bold text-slate-800 text-sm">₹{Number(total || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                  <div className="text-left">
                    <span className="text-slate-400 text-[10px] block">Merchant UPI ID</span>
                    <span className="font-mono font-bold text-slate-700">{UPI_ID}</span>
                  </div>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#5f259f] text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    {copiedUpi ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => openPhonePeAppOnly()}
                  className="w-full py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry Opening PhonePe
                </button>

                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="w-full py-2.5 bg-[#F78C25] text-white font-bold text-xs rounded-xl shadow-xs hover:bg-[#e07010] transition-colors cursor-pointer"
                >
                  I Completed the Payment in PhonePe →
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    setStep('SELECT')
                  }}
                  className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Or Pay using UPI QR Code
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 2: LAUNCHING APP ─── */}
          {step === 'LAUNCHING' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-5 text-center space-y-3.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center relative shadow-sm">
                <div className="w-10 h-10 border-3 border-[#F78C25] border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Opening {selectedApp?.name || 'UPI App'}...</h4>
                <p className="text-xs text-slate-500 mt-1">Please pay ₹{Number(total || 0).toFixed(2)} in {selectedApp?.name || 'your UPI app'} and return here.</p>
              </div>

              {/* Action Hierarchy: Fallback Generic UPI -> Payment Completed -> QR Code fallback */}
              <div className="space-y-2 pt-1">
                <a
                  href={genericFallbackUri || genericUpiUri}
                  className="w-full py-2.5 px-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" /> {selectedApp?.name || 'App'} didn’t open? Pay via Any UPI App
                </a>

                <button
                  type="button"
                  onClick={() => setStep('DID_YOU_PAY')}
                  className="w-full py-2.5 bg-[#F78C25] text-white font-bold text-xs rounded-xl shadow-xs hover:bg-[#e07010] transition-colors cursor-pointer"
                >
                  I Completed the Payment →
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    setStep('SELECT')
                  }}
                  className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  App could not be opened? Use UPI QR Code
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 3: DID YOU PAY CONFIRMATION CHECK ─── */}
          {step === 'DID_YOU_PAY' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-4 space-y-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Did you complete the payment?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Payment of <strong className="text-slate-800">₹{total}</strong> via {selectedApp?.name || 'UPI'}.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Yes, I Paid ₹{total}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    setStep('SELECT')
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> No / Use UPI QR Code
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 4: TRANSACTION ID & SCREENSHOT FORM ─── */}
          {step === 'FORM' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                <span className="text-slate-500 font-medium">Payment for:</span>
                <span className="font-bold text-slate-800">₹{total}</span>
                <button
                  type="button"
                  onClick={() => setStep('SELECT')}
                  className="text-xs text-[#F78C25] font-semibold hover:underline cursor-pointer"
                >
                  Change App
                </button>
              </div>

              <PaymentProofForm orderMeta={orderMeta} onSuccess={onSuccess} onClose={onClose} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
