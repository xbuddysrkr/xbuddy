import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/**
 * PermissionCourier
 * Playful, non-intrusive in-page companion ("The Little X Buddy Courier")
 * that visually guides customers to the native browser permission prompt.
 *
 * Rules:
 * - Does NOT attempt to programmatically click or overlay the native browser popup.
 * - Sits compactly inside the order status page without obstructing Order ID.
 * - Respects prefers-reduced-motion.
 * - Auto-dismisses upon real permission success.
 */
export default function PermissionCourier({ orderId, onPermissionGranted }) {
  const shouldReduceMotion = useReducedMotion()

  // Stages: 'idle' | 'ready' | 'bonk' | 'explain' | 'waiting' | 'success' | 'denied' | 'hidden'
  const [stage, setStage] = useState('idle')
  const [tapped, setTapped] = useState(false)
  const tapTimeoutRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      // Browser does not support Notification API
      setStage('hidden')
      return
    }

    const current = Notification.permission

    if (current === 'granted') {
      // Already granted: do not show annoying prompts
      setStage('hidden')
      return
    }

    if (current === 'denied') {
      setStage('denied')
      return
    }

    // Permission is 'default' (needs user action):
    // Start courier sequence and trigger native browser prompt
    setStage('ready')

    // Transition timeline for the playful animation
    const t1 = setTimeout(() => {
      setStage((prev) => (prev === 'ready' ? 'bonk' : prev))
    }, 1200)

    const t2 = setTimeout(() => {
      setStage((prev) => (prev === 'bonk' ? 'explain' : prev))
    }, 2200)

    const t3 = setTimeout(() => {
      setStage((prev) => (prev === 'explain' ? 'waiting' : prev))
    }, 4500)

    // Trigger native browser permission request
    try {
      const promise = Notification.requestPermission()
      if (promise && typeof promise.then === 'function') {
        promise.then((res) => {
          handlePermissionResult(res)
        }).catch(() => {})
      } else {
        // Callback style for older browsers
        Notification.requestPermission((res) => {
          handlePermissionResult(res)
        })
      }
    } catch {
      // Ignore errors if blocked by browser policy
    }

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
    }
  }, [])

  function handlePermissionResult(permission) {
    if (permission === 'granted') {
      setStage('success')
      onPermissionGranted?.()
      // Fade away after celebration
      setTimeout(() => {
        setStage('hidden')
      }, 2200)
    } else if (permission === 'denied') {
      setStage('denied')
    }
  }

  // Playful tap reaction: customer clicks the parcel
  const handleParcelTap = () => {
    if (stage === 'success' || stage === 'hidden') return
    setTapped(true)
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
    tapTimeoutRef.current = setTimeout(() => setTapped(false), 2000)
  }

  if (stage === 'hidden') {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, height: 0, margin: 0, overflow: 'hidden' }}
        transition={{ duration: 0.35 }}
        className="relative my-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#FFFDF9] to-[#FFF6ED] border border-[#F78C25]/30 shadow-xs overflow-hidden"
      >
        {/* Subtle accent border on left */}
        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-[#F78C25] to-[#FFA048]" />

        {/* ── STATE: DENIED ── */}
        {stage === 'denied' ? (
          <div className="flex items-start gap-3.5 pl-2">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">
              🔒
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-gray-800">
                Looks like permission was blocked 😅
              </h4>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Allow notifications in your browser settings if you would like live chime alerts when your prints are ready at the counter.
              </p>
            </div>
          </div>
        ) : stage === 'success' ? (
          /* ── STATE: SUCCESS CELEBRATION ── */
          <div className="flex items-center gap-3.5 pl-2">
            <motion.div
              animate={shouldReduceMotion ? {} : { rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
              className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl flex-shrink-0 shadow-xs"
            >
              🚀
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-sm sm:text-base">
                <span>Yesss! We&apos;re in!</span>
                <span>✨</span>
              </div>
              <p className="text-xs text-emerald-700 font-medium mt-0.5">
                ✓ Sending your order &amp; enabling live print alerts!
              </p>
            </div>
          </div>
        ) : (
          /* ── ACTIVE STATES: READY / BONK / EXPLAIN / WAITING ── */
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pl-1 sm:pl-2">
            
            {/* The Little Courier Parcel */}
            <div className="relative flex flex-col items-center flex-shrink-0">
              <motion.div
                onClick={handleParcelTap}
                title="Tap the little X Buddy courier!"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleParcelTap() }}
                className="cursor-pointer select-none relative group"
                animate={
                  shouldReduceMotion
                    ? {}
                    : stage === 'ready'
                    ? { y: [0, -4, 0] }
                    : stage === 'bonk'
                    ? { y: [0, -24, 0], rotate: [0, -6, 6, 0] }
                    : stage === 'waiting'
                    ? { scale: [1, 1.05, 1], y: [0, -2, 0] }
                    : tapped
                    ? { rotate: [-12, 12, -8, 8, 0], scale: 1.1 }
                    : {}
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : stage === 'bonk'
                    ? { duration: 0.65, ease: 'easeOut' }
                    : stage === 'waiting'
                    ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                    : stage === 'ready'
                    ? { duration: 1, repeat: Infinity }
                    : { duration: 0.4 }
                }
              >
                {/* Parcel Visual */}
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFE7D1] to-[#FFD2A8] border border-[#F78C25]/40 flex items-center justify-center text-2xl shadow-xs transition-transform group-hover:scale-105 active:scale-95">
                  {stage === 'bonk' ? '💥' : '📦'}
                </div>

                {/* Bonk sound-bubble comic effect */}
                {!shouldReduceMotion && stage === 'bonk' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 0 }}
                    animate={{ opacity: 1, scale: 1, y: -28 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-red-500 text-white font-black text-[10px] rounded-full shadow-xs tracking-wider uppercase whitespace-nowrap pointer-events-none"
                  >
                    BONK! 😂
                  </motion.div>
                )}

                {/* Tap speech bubble */}
                {tapped && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.8 }}
                    animate={{ opacity: 1, y: -8, scale: 1 }}
                    className="absolute -top-6 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-white border border-orange-300 text-[#F78C25] font-bold text-xs rounded-xl shadow-md whitespace-nowrap z-20 pointer-events-none"
                  >
                    Almost there! 😄
                  </motion.div>
                )}
              </motion.div>

              <span className="text-[10px] text-gray-400 font-medium mt-1 select-none">
                {stage === 'waiting' ? 'waiting...' : 'tap parcel'}
              </span>
            </div>

            {/* Instruction Content */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              
              {/* Dynamic Headline Based on Stage */}
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className="text-base select-none">
                  {stage === 'ready' ? '📦' : stage === 'bonk' ? '💥' : '🔐'}
                </span>
                <h4 className="text-sm sm:text-base font-extrabold text-[#222222]">
                  {stage === 'ready' && 'Your order is ready to leave!'}
                  {stage === 'bonk' && 'Oops! Invisible boundary! 😂'}
                  {(stage === 'explain' || stage === 'waiting') && 'Oops! One tiny permission first 😅'}
                </h4>
              </div>

              {/* Body Text */}
              <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed max-w-lg">
                {stage === 'ready' && (
                  <span>Preparing document delivery to the Xerox station...</span>
                )}
                {stage === 'bonk' && (
                  <span>Your browser needs one tiny YES before the parcel can fly over!</span>
                )}
                {(stage === 'explain' || stage === 'waiting') && (
                  <span>
                    Tap <strong className="text-[#F78C25] font-bold">ALLOW</strong> in the browser popup above so I can send your order to the shop!
                  </span>
                )}
              </p>

              {/* Action / Pointer Guide */}
              <div className="mt-3 flex items-center justify-center sm:justify-start gap-2">
                
                {/* Desktop Pointer */}
                <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100/80 border border-orange-200 text-orange-900 font-bold text-xs shadow-2xs">
                  <motion.span
                    animate={shouldReduceMotion ? {} : { y: [0, -3, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-sm select-none"
                  >
                    👆
                  </motion.span>
                  <span>TAP ALLOW ABOVE</span>
                </div>

                {/* Mobile Pointer (Compact) */}
                <div className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100/80 border border-orange-200 text-orange-900 font-bold text-xs shadow-2xs">
                  <motion.span
                    animate={shouldReduceMotion ? {} : { y: [0, -2, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="text-sm select-none"
                  >
                    👆
                  </motion.span>
                  <span>Check browser popup above &amp; tap Allow</span>
                </div>

                {/* Gentle Waiting Indicator */}
                {stage === 'waiting' && (
                  <span className="text-[11px] text-gray-400 font-medium">
                    (waiting for your click...)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
