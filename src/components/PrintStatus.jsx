import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getOrderStatus } from '../utils/api'
import PermissionCourier from './PermissionCourier'

const POLL_INTERVAL_MS = 4000

// Complete customer flow steps matching the Xerox shop workflow
const FLOW_STEPS = [
  { id: 'confirmed', label: 'Order Confirmed',        icon: '✅', desc: 'Order received successfully by Xerox shop' },
  { id: 'show_id',   label: 'Show ID to Shopkeeper',  icon: '🏷️', desc: 'Present Order ID at the Xerox counter' },
  { id: 'waiting',   label: 'Waiting for Shopkeeper', icon: '⏳', desc: 'Shopkeeper verifies order & payment' },
  { id: 'verified',  label: 'Payment Verified',       icon: '💳', desc: 'Payment approved by shopkeeper' },
  { id: 'sending',   label: 'Sending to Printer',     icon: '📡', desc: 'Document sent to Xerox print station' },
  { id: 'printing',  label: 'Printing',               icon: '🖨️', desc: 'Xerox machine printing your pages' },
  { id: 'completed', label: 'Completed',              icon: '🎉', desc: 'Collect printed documents at counter!' },
]

function statusToStep(status) {
  if (!status) return 2 // Default to 'Waiting for Shopkeeper'
  const normalized = status.trim().toLowerCase()

  if (normalized === 'failed') return -1
  if (['printed', 'ready', 'ready for collection', 'collected', 'completed', 'done'].includes(normalized)) {
    return 6 // Completed
  }
  if (['printing'].includes(normalized)) {
    return 5 // Printing
  }
  if (['sending', 'sending to printer', 'processing', 'queued'].includes(normalized)) {
    return 4 // Sending to Printer
  }
  if (['verified', 'payment verified', 'approved'].includes(normalized)) {
    return 3 // Payment Verified
  }
  // Default waiting state (waiting for shopkeeper to look up and verify)
  return 2
}

export default function PrintStatus({ fileInfo = {}, settings = {}, orderId, onReset, onViewMyOrders }) {
  if (!orderId) return null

  const [currentStep, setCurrentStep] = useState(2) // 2 = Waiting for Shopkeeper
  const [progress, setProgress] = useState(33)
  const [serverOffline, setServerOffline] = useState(false)
  const [printFailed, setPrintFailed] = useState(false)
  const [lastChecked, setLastChecked] = useState(null)
  const [collectionChoice, setCollectionChoice] = useState('now')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)

  const handleCopyId = () => {
    if (!orderId) return
    navigator.clipboard?.writeText(orderId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!orderId) return

    async function checkStatus() {
      try {
        const data = await getOrderStatus(orderId)
        if (data && data.success) {
          const status = data.printStatus || 'Waiting'
          setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
          
          const step = statusToStep(status)
          if (step === -1) {
            setPrintFailed(true)
            clearInterval(pollRef.current)
            return
          }

          setCurrentStep(step)

          // Only flag offline if backend explicitly flags it
          if (data.serverOffline === true || status === 'Server Offline') {
            setServerOffline(true)
          } else {
            setServerOffline(false)
          }

          if (step >= 6) {
            clearInterval(pollRef.current)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('X Buddy — Print Ready! 🎉', {
                  body: `Order ${orderId}: Your document is printed! Collect at the Xerox counter.`,
                  icon: '/xbuddy-icon-192.png',
                })
              } catch {}
            }
          }
        }
      } catch {
        // Network polling error: do not display scary print server offline banners during normal polling
      }
    }

    checkStatus()
    pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [orderId])

  useEffect(() => {
    const target = Math.min(100, Math.round(((currentStep + 1) / FLOW_STEPS.length) * 100))
    const step = (target - progress) / 15
    let current = progress
    const interval = setInterval(() => {
      current += step
      if (Math.abs(current - target) < 1 || current >= target) {
        setProgress(target)
        clearInterval(interval)
      } else {
        setProgress(current)
      }
    }, 25)
    return () => clearInterval(interval)
  }, [currentStep])

  const isDone = currentStep >= 6

  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto px-4 py-6">
      
      {/* ── STEP 1: ORDER CONFIRMED BADGE ── */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-emerald-800 text-xs font-bold uppercase tracking-wider">✓ Order Confirmed</span>
        </div>
        <div className="flex justify-center my-2">
          <span className="text-orange-400 font-bold text-lg select-none">↓</span>
        </div>
      </div>

      {/* ── STEP 2 & 3: PRIMARY INSTRUCTION CARD: PROMINENT ORDER ID ── */}
      <div className="relative p-6 sm:p-8 bg-gradient-to-b from-[#FFFDFB] via-[#FFF9F3] to-[#FFF3E8] border-2 border-[#F78C25]/40 rounded-3xl text-center shadow-lg shadow-orange-500/10 mb-4 overflow-hidden">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F78C25] via-[#ffb347] to-[#F78C25]" />

        <p className="text-xs sm:text-sm font-black tracking-widest text-[#F78C25] uppercase mb-1">
          YOUR ORDER ID
        </p>

        {/* Dynamic Big Order ID with Copy Button */}
        <div className="flex items-center justify-center gap-3 my-2">
          <span className="font-mono text-4xl sm:text-6xl font-black text-[#1F2937] tracking-widest select-all">
            {orderId}
          </span>
          <button
            type="button"
            onClick={handleCopyId}
            className="p-2.5 sm:p-3 rounded-2xl bg-white border border-orange-200 text-gray-600 hover:text-[#F78C25] hover:border-[#F78C25] hover:bg-orange-50 transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Copy Order ID"
          >
            {copied ? (
              <span className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                ✓ Copied
              </span>
            ) : (
              <svg className="w-5 h-5 text-gray-500 hover:text-[#F78C25]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Flow indicator inside card */}
        <div className="text-orange-400 font-bold text-sm my-1 select-none">↓</div>

        {/* Primary Instruction */}
        <h3 className="text-lg sm:text-2xl font-black text-[#222222] leading-snug">
          Show this Order ID to the shopkeeper
          <span className="block text-[#F78C25]">at the Xerox counter.</span>
        </h3>
        <p className="text-xs sm:text-sm font-medium text-slate-600 mt-2 max-w-md mx-auto">
          The shopkeeper will use this ID to find your order and verify your payment.
        </p>
      </div>

      <div className="flex justify-center my-2">
        <span className="text-orange-400 font-bold text-lg select-none">↓</span>
      </div>

      {/* ── STEP 4: WAITING / ACTIVE STATUS BANNER ── */}
      <div className="mb-6">
        {currentStep <= 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-center shadow-xs"
          >
            <div className="inline-flex items-center justify-center gap-2 text-amber-900 font-extrabold text-base sm:text-lg mb-1.5">
              <span className="text-xl animate-pulse">⏳</span> Waiting for Shopkeeper
            </div>
            <p className="text-xs sm:text-sm text-amber-800 leading-relaxed max-w-lg mx-auto">
              Your order has been received successfully.
              <span className="block font-semibold mt-0.5">Please keep this screen open while the shopkeeper verifies your order.</span>
            </p>
          </motion.div>
        )}

        {currentStep === 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-center shadow-xs"
          >
            <div className="inline-flex items-center justify-center gap-2 text-emerald-900 font-extrabold text-base sm:text-lg mb-1.5">
              <span className="text-xl">💳</span> Payment Verified!
            </div>
            <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed max-w-lg mx-auto">
              Your payment has been verified by the shopkeeper.
              <span className="block font-semibold mt-0.5">Preparing to send document to Xerox printer station...</span>
            </p>
          </motion.div>
        )}

        {currentStep === 4 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-blue-50/90 border border-blue-200 text-center shadow-xs"
          >
            <div className="inline-flex items-center justify-center gap-2 text-blue-900 font-extrabold text-base sm:text-lg mb-1.5">
              <span className="text-xl animate-spin">📡</span> Sending to Printer...
            </div>
            <p className="text-xs sm:text-sm text-blue-800 leading-relaxed max-w-lg mx-auto">
              Transmitting your documents to the Xerox print station.
            </p>
          </motion.div>
        )}

        {currentStep === 5 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-blue-50/90 border border-blue-200 text-center shadow-xs"
          >
            <div className="inline-flex items-center justify-center gap-2 text-blue-900 font-extrabold text-base sm:text-lg mb-1.5">
              <span className="text-xl animate-pulse">🖨️</span> Printing Document...
            </div>
            <p className="text-xs sm:text-sm text-blue-800 leading-relaxed max-w-lg mx-auto">
              Your document is currently printing on the Xerox machine.
            </p>
          </motion.div>
        )}

        {isDone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-center shadow-xs"
          >
            <div className="inline-flex items-center justify-center gap-2 text-emerald-900 font-extrabold text-lg sm:text-xl mb-1.5">
              <span className="text-2xl">🎉</span> Printing Completed!
            </div>
            <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed max-w-lg mx-auto">
              Your document has been printed successfully.
              <span className="block font-bold mt-0.5">Please collect your printout from the counter!</span>
            </p>
          </motion.div>
        )}
      </div>

      {/* ── THE LITTLE X BUDDY COURIER: FUN BROWSER PERMISSION GUIDE ── */}
      <PermissionCourier orderId={orderId} />

      {/* Explicit server offline warning: ONLY shown if backend confirmed it */}
      <AnimatePresence>
        {serverOffline && !isDone && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-amber-800 font-bold text-sm">Print Station Notice</p>
              <p className="text-amber-700 text-xs mt-0.5">The print station is reconnecting. Please show Order ID <span className="font-mono font-bold text-[#F78C25]">{orderId}</span> to the shopkeeper directly.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print Failed Banner */}
      <AnimatePresence>
        {printFailed && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-red-600 font-bold text-sm">Print Issue Reported</p>
              <p className="text-gray-600 text-xs mt-0.5">There was an issue at the printer. Please inform the shopkeeper with Order ID <span className="font-mono font-bold text-[#F78C25]">{orderId}</span>.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Details & Visual Stepper Card */}
      <div className="bg-white border border-orange-100 rounded-3xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-100">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-xl flex-shrink-0">
            📄
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#222222] font-bold truncate text-sm sm:text-base">{fileInfo?.name || 'Document'}</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {fileInfo?.totalPages || 1} {fileInfo?.totalPages === 1 ? 'page' : 'pages'} · {settings?.colorMode === 'color' ? 'Color' : 'B&W'} · {settings?.sideMode === 'double' ? 'Double sided' : 'Single sided'} · {settings?.copies || 1} {settings?.copies > 1 ? 'copies' : 'copy'}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2">
            <span>Customer Order Flow</span>
            <span className="text-[#F78C25] font-bold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2.5 bg-orange-100/70 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#F78C25] to-[#ffb347]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Visual Customer Flow Stages (Connected Pipeline) */}
        <div className="space-y-1 relative">
          {FLOW_STEPS.map((step, i) => {
            const isCompleted = i < currentStep || isDone
            const isActive = i === currentStep && !isDone
            const isLast = i === FLOW_STEPS.length - 1

            return (
              <div key={step.id} className="relative">
                <motion.div
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: isActive || isCompleted ? 1 : 0.45 }}
                  className={`flex items-center gap-3.5 p-3 rounded-2xl transition-all ${
                    isActive ? 'bg-orange-50/90 border border-orange-200 shadow-xs' : 'border border-transparent'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 font-bold transition-all z-10 ${
                    isCompleted ? 'bg-emerald-500 text-white shadow-xs' :
                    isActive   ? 'bg-[#F78C25] text-white shadow-sm ring-4 ring-orange-100' :
                    'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}>
                    {isCompleted ? '✓' : step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold flex items-center gap-2 ${
                      isCompleted ? 'text-emerald-700' : isActive ? 'text-[#222222]' : 'text-gray-400'
                    }`}>
                      {step.label}
                      {step.id === 'show_id' && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold">
                          {orderId}
                        </span>
                      )}
                      {isActive && !isDone && (
                        <span className="inline-flex gap-1 items-center">
                          {[0, 1, 2].map(d => (
                            <motion.span
                              key={d}
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }}
                              className="w-1.5 h-1.5 rounded-full bg-[#F78C25] inline-block"
                            />
                          ))}
                        </span>
                      )}
                    </p>
                    <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                      {step.desc}
                    </p>
                  </div>
                </motion.div>

                {/* Vertical Connector Line */}
                {!isLast && (
                  <div className="ml-7 pl-[1px] my-0.5">
                    <div className={`w-0.5 h-3 ${isCompleted ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {lastChecked && (
          <p className="text-gray-400 text-[11px] mt-4 text-right">
            Status updated: {lastChecked}
          </p>
        )}
      </div>

      {/* Collection Preference Option */}
      <div className="p-4 bg-white border border-orange-100 rounded-2xl text-center shadow-xs mb-6">
        <p className="text-xs font-bold text-gray-700 mb-2">Need to leave or collect later?</p>
        <div className="flex gap-2 max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => setCollectionChoice('now')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              collectionChoice === 'now'
                ? 'bg-[#F78C25] text-white border-[#F78C25] shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-orange-50'
            }`}
          >
            🏃 Collecting Now
          </button>
          <button
            type="button"
            onClick={() => setCollectionChoice('later')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              collectionChoice === 'later'
                ? 'bg-[#F78C25] text-white border-[#F78C25] shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-orange-50'
            }`}
          >
            ⏱️ Collect Later
          </button>
        </div>

        {collectionChoice === 'later' && (
          <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100 text-xs text-gray-600">
            <span className="font-bold text-emerald-700">✓ Saved in My Orders!</span>
            <p className="mt-0.5 text-gray-500">You can safely close this browser window. Just give Order ID <span className="font-mono font-bold text-[#F78C25]">{orderId}</span> to the shopkeeper when you arrive.</p>
            {onViewMyOrders && (
              <button
                type="button"
                onClick={onViewMyOrders}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-[#F78C25] text-white font-bold rounded-lg text-xs hover:bg-[#e07010] transition-colors cursor-pointer"
              >
                📋 View in My Orders →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Done Action */}
      <AnimatePresence>
        {isDone && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-6">
            <button
              onClick={onReset}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold rounded-2xl transition-all shadow-md shadow-orange-500/20 active:scale-98 cursor-pointer"
            >
              Print Another Document
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

