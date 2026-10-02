import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * XBuddyIntro
 * 
 * Cinematic 6-7s website intro animation.
 * 
 * CORE STORYLINE:
 * 1. Scene 1 (0.0 - 1.2s): Character A ("/") enters from LEFT carrying printed papers.
 * 2. Scene 2 (1.2 - 2.4s): Character B ("\") enters from RIGHT carrying print package.
 * 3. Step 1 Approach (2.4 - 3.2s): Both characters run toward the exact center (-48px & +48px).
 * 4. Step 2 Center Alignment / Anticipation (3.2 - 3.45s): Pause forward movement for ~0.2s!
 * 5. Step 3 & 4 Cross & Lock (3.45 - 4.0s):
 *    - Left "/" character rotates clockwise & moves diagonally DOWN-RIGHT through the center -> becomes "\" diagonal.
 *    - Right "\" character rotates counterclockwise & moves diagonally DOWN-LEFT through the center -> becomes "/" diagonal.
 *    - Centers intersect at the EXACT SAME LOCATION (0, 0) with a 90° angle.
 *    - Step 5 Snap: Snap together, tiny squash, impact bounce, orange flash, soft contact shadow.
 * 6. Settled X (4.0 - 4.6s): Hold the completed perfect X!
 * 7. X Shift (4.6 - 5.3s): X shifts smoothly leftward.
 * 8. Buddy Reveal (5.3 - 6.2s): "Buddy" springs in beside the X -> XBuddy lockup.
 * 9. Tagline Reveal (6.2 - 7.1s): "Upload • Pay • Print" floats up underneath.
 * 10. Exit (7.1 - 7.6s): 500ms smooth fade-out into the homepage.
 */
export default function XBuddyIntro({ onComplete }) {
  const [phase, setPhase] = useState('scene1')
  const [isVisible, setIsVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const timerRefs = useRef([])

  const clearAllTimers = () => {
    timerRefs.current.forEach((t) => clearTimeout(t))
    timerRefs.current = []
  }

  const handleTransitionOut = () => {
    if (!isVisible) return
    setIsVisible(false)
    clearAllTimers()

    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('xbuddy_intro_seen', 'true')
      }
    } catch {}

    setTimeout(() => {
      onComplete?.()
    }, 550)
  }

  useEffect(() => {
    // 1. Accessibility: prefers-reduced-motion
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (mediaQuery.matches) {
        setReducedMotion(true)
        const t = setTimeout(() => {
          handleTransitionOut()
        }, 1400)
        timerRefs.current.push(t)
        return
      }
    }

    // 2. Exact Hero Timing Sequence
    const schedule = [
      { p: 'scene2', t: 1200 },       // 1.2s: Character B enters from right
      { p: 'approach', t: 2400 },     // 2.4s: Step 1: Both approach center
      { p: 'anticipation', t: 3200 }, // 3.2s: Step 2: 0.25s pause & anticipation
      { p: 'cross', t: 3450 },        // 3.45s: Step 3 & 4: Physical Crossing & Lock into X
      { p: 'settled', t: 4000 },      // 4.0s: Step 5: Hold the completed perfect X
      { p: 'shift', t: 4600 },        // 4.6s: X shifts left to make room for Buddy
      { p: 'buddy', t: 5300 },        // 5.3s: "Buddy" appears beside X
      { p: 'tagline', t: 6200 },      // 6.2s: "Upload • Pay • Print" tagline appears
      { p: 'exit', t: 7150 },         // 7.15s: Smooth overlay fade-out
    ]

    schedule.forEach(({ p, t }) => {
      const timeout = setTimeout(() => {
        setPhase(p)
        if (p === 'exit') {
          handleTransitionOut()
        }
      }, t)
      timerRefs.current.push(timeout)
    })

    return () => {
      clearAllTimers()
    }
  }, [])

  // State flags for clean styling logic
  const isRunning = phase === 'scene1' || phase === 'scene2' || phase === 'approach'
  const isAnticipation = phase === 'anticipation'
  const isCrossing = phase === 'cross'
  const isLockedIntoX = phase === 'cross' || phase === 'settled' || phase === 'shift' || phase === 'buddy' || phase === 'tagline' || phase === 'exit'
  const isShifted = phase === 'shift' || phase === 'buddy' || phase === 'tagline' || phase === 'exit'
  const isBuddyVisible = phase === 'buddy' || phase === 'tagline' || phase === 'exit'
  const isTaglineVisible = phase === 'tagline' || phase === 'exit'

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="xbuddy-intro-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#FAF8F5] select-none overflow-hidden"
          style={{ willChange: 'opacity' }}
        >
          {/* Warm Cream Ambient Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#FFFDF9] via-[#FAF6F0] to-[#F5EFE6] pointer-events-none" />
          
          {/* Soft Warm Radial Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-orange-200/40 via-amber-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          {/* Subtle Dot Grid Pattern */}
          <div
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#F7931E 0.75px, transparent 0.75px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Minimal Unobtrusive "Skip" Control */}
          <button
            type="button"
            onClick={handleTransitionOut}
            className="absolute top-5 right-5 sm:top-7 sm:right-7 z-50 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900/5 hover:bg-slate-900/10 active:scale-95 text-slate-600 hover:text-slate-900 text-xs font-semibold tracking-wide backdrop-blur-md border border-slate-300/50 transition-all shadow-xs cursor-pointer"
            aria-label="Skip Intro Animation"
          >
            <span>Skip</span>
            <span className="text-[10px] text-slate-400">✕</span>
          </button>

          {/* REDUCED MOTION FALLBACK */}
          {reducedMotion ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="relative z-10 flex flex-col items-center justify-center text-center p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#F7931E] to-[#FFB703] flex items-center justify-center shadow-xl shadow-orange-500/25">
                  <span className="text-white font-extrabold text-3xl tracking-wider">X</span>
                </div>
                <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
                  Buddy
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold tracking-widest text-slate-500 uppercase">
                Upload <span className="text-[#F7931E]">•</span> Pay <span className="text-[#F7931E]">•</span> Print
              </p>
            </motion.div>
          ) : (
            /* FULL NATIVE FRAMER MOTION & SVG HERO INTRO */
            <div className="relative z-10 w-full max-w-2xl px-4 flex flex-col items-center justify-center">
              
              {/* Main Stage Area */}
              <div className="relative w-full h-[320px] sm:h-[360px] flex items-center justify-center">
                
                {/* 1. Ground Shadows */}
                <div className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 w-full max-w-md h-6 pointer-events-none flex items-center justify-center">
                  
                  {/* Left Character Shadow (Phases before crossing) */}
                  {!isLockedIntoX && (
                    <motion.div
                      animate={{
                        x:
                          phase === 'scene1'
                            ? [-240, -110]
                            : phase === 'scene2'
                            ? -110
                            : phase === 'approach'
                            ? -48
                            : -42, // anticipation
                        scaleX: isAnticipation ? 1.25 : [1, 1.25, 0.9, 1.15, 1],
                        opacity: isAnticipation ? 0.4 : [0.15, 0.35, 0.25, 0.35],
                      }}
                      transition={{
                        x: { duration: phase === 'scene1' ? 1.1 : 0.75, ease: 'easeOut' },
                        scaleX: { duration: 0.35, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' },
                        opacity: { duration: 0.35, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' },
                      }}
                      className="w-20 h-4 bg-slate-900/20 rounded-full blur-xs"
                    />
                  )}

                  {/* Right Character Shadow (Phases before crossing) */}
                  {!isLockedIntoX && phase !== 'scene1' && (
                    <motion.div
                      initial={{ x: 240, opacity: 0 }}
                      animate={{
                        x:
                          phase === 'scene2'
                            ? [240, 110]
                            : phase === 'approach'
                            ? 48
                            : 42, // anticipation
                        scaleX: isAnticipation ? 1.25 : [1, 1.2, 0.95, 1.15, 1],
                        opacity: isAnticipation ? 0.4 : [0.15, 0.35, 0.25, 0.35],
                      }}
                      transition={{
                        x: { duration: phase === 'scene2' ? 1.1 : 0.75, ease: 'easeOut' },
                        scaleX: { duration: 0.35, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' },
                        opacity: { duration: 0.35, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' },
                      }}
                      className="w-20 h-4 bg-slate-900/20 rounded-full blur-xs"
                    />
                  )}

                  {/* Unified Contact Shadow for the Formed X */}
                  {isLockedIntoX && (
                    <motion.div
                      initial={{ scale: 0.2, opacity: 0 }}
                      animate={{
                        scale: isCrossing ? [0.4, 1.35, 1] : 1,
                        x: isShifted ? -75 : 0,
                        opacity: 0.35,
                      }}
                      transition={{
                        scale: { duration: 0.45, ease: 'backOut' },
                        x: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                      }}
                      className="w-28 h-5 bg-orange-950/25 rounded-full blur-xs"
                    />
                  )}
                </div>

                {/* 2. Hero Stage & Characters */}
                <div className="relative flex items-center justify-center">

                  {/* Step 5: Subtle Orange Impact Flash Ring on Center Lock */}
                  {isCrossing && (
                    <motion.div
                      initial={{ scale: 0.2, opacity: 1 }}
                      animate={{ scale: [0.25, 2.5], opacity: [1, 0] }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                      className="absolute w-24 h-24 rounded-full border-4 border-[#F7931E]/80 bg-gradient-to-tr from-[#F7931E]/30 to-amber-300/20 pointer-events-none z-0"
                    />
                  )}

                  {/* Subtle Crossing Motion Speed Streaks */}
                  {isCrossing && (
                    <div className="absolute pointer-events-none z-20">
                      <motion.div
                        initial={{ opacity: 1, scaleX: 0 }}
                        animate={{ opacity: [1, 0], scaleX: [0, 2.5] }}
                        transition={{ duration: 0.4 }}
                        className="w-32 h-0.5 bg-gradient-to-r from-transparent via-[#F7931E] to-transparent rotate-45"
                      />
                      <motion.div
                        initial={{ opacity: 1, scaleX: 0 }}
                        animate={{ opacity: [1, 0], scaleX: [0, 2.5] }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                        className="w-32 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent -rotate-45"
                      />
                    </div>
                  )}

                  {/* Micro Sparkles on Lock */}
                  {isCrossing && (
                    <div className="absolute pointer-events-none z-20">
                      {[0, 60, 120, 180, 240, 300].map((deg, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                          animate={{
                            x: Math.cos((deg * Math.PI) / 180) * 60,
                            y: Math.sin((deg * Math.PI) / 180) * 60,
                            scale: [0, 1.2, 0],
                            opacity: [1, 0.8, 0],
                          }}
                          transition={{ duration: 0.5, delay: idx * 0.02, ease: 'easeOut' }}
                          className="absolute w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-[#F7931E] to-amber-300 shadow-xs"
                        />
                      ))}
                    </div>
                  )}

                  {/* ==============================================================
                      MAIN BRAND LOCKUP (Holds Hero X + "Buddy" Text)
                      ============================================================== */}
                  <div className="relative flex items-center justify-center">

                    {/* HERO X CONTAINER
                        Holds Character A & Character B on the EXACT same coordinate origin (55px 80px)
                        Shifts leftward smoothly when phase reaches 'shift'
                    */}
                    <motion.div
                      animate={{
                        x: isShifted ? -75 : 0,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="relative w-[110px] h-[160px] flex items-center justify-center pointer-events-none"
                    >

                      {/* ==========================================================
                          CHARACTER A (LEFT "/" CHARACTER)
                          - Starts as "/" tilted at 24°
                          - Carries printed papers
                          - Runs to center (-48px)
                          - Pauses at -42px for anticipation
                          - Crosses: Rotates clockwise (+111°), moves diagonally DOWN-RIGHT through center
                          - Locks onto the TOP-LEFT ↘ BOTTOM-RIGHT diagonal of the X (135° = "\")
                          ========================================================== */}
                      <motion.div
                        initial={{ x: -280, y: 0, opacity: 0, rotate: 24 }}
                        animate={{
                          x:
                            phase === 'scene1'
                              ? -110
                              : phase === 'scene2'
                              ? -110
                              : phase === 'approach'
                              ? -48
                              : phase === 'anticipation'
                              ? -42
                              : isCrossing
                              ? [-42, 5, 0] // Down-right diagonal pass through center into 0
                              : 0,
                          y:
                            phase === 'scene1'
                              ? [0, -7, 0, -7, 0]
                              : phase === 'scene2'
                              ? [0, -5, 0, -5, 0]
                              : phase === 'approach'
                              ? [0, -5, 0]
                              : phase === 'anticipation'
                              ? 3
                              : isCrossing
                              ? [3, 4, 0]
                              : 0,
                          rotate:
                            phase === 'scene1' || phase === 'scene2' || phase === 'approach'
                              ? 24 // Natural "/" running slant
                              : phase === 'anticipation'
                              ? 20 // Crouch angle
                              : isCrossing
                              ? [20, 75, 135] // Clockwise rotation -> locks at 135° (\ stroke)
                              : 135,
                          scale:
                            isCrossing
                              ? [1.0, 1.15, 0.94, 1.03, 1.0] // Tiny squash and impact bounce
                              : isAnticipation
                              ? 0.97
                              : 1.0,
                          opacity: 1,
                        }}
                        transition={{
                          x: {
                            duration:
                              phase === 'scene1'
                                ? 1.05
                                : phase === 'approach'
                                ? 0.75
                                : phase === 'anticipation'
                                ? 0.2
                                : 0.45,
                            ease: isCrossing ? [0.34, 1.56, 0.64, 1] : [0.16, 1, 0.3, 1],
                          },
                          y: {
                            duration: isRunning ? 0.36 : 0.25,
                            repeat: isRunning ? Infinity : 0,
                            ease: 'easeInOut',
                          },
                          rotate: {
                            duration: isCrossing ? 0.45 : 0.25,
                            ease: isCrossing ? [0.34, 1.56, 0.64, 1] : 'easeOut',
                          },
                          scale: { duration: 0.45, ease: 'easeOut' },
                          opacity: { duration: 0.3 },
                        }}
                        className="absolute inset-0 flex items-center justify-center cursor-default"
                        style={{ transformOrigin: '55px 80px' }}
                      >
                        <svg
                          width="110"
                          height="160"
                          viewBox="0 0 110 160"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="overflow-visible"
                        >
                          <defs>
                            {/* Rich 3D Gradient for Character A */}
                            <linearGradient id="charAGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#FFA439" />
                              <stop offset="50%" stopColor="#F7931E" />
                              <stop offset="100%" stopColor="#EA580C" />
                            </linearGradient>

                            {/* Top Gloss Highlight */}
                            <linearGradient id="glossGradA" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                            </linearGradient>

                            {/* Paper Drop Shadow */}
                            <filter id="paperShadow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.18" />
                            </filter>
                          </defs>

                          {/* Motion Wind Trail Lines (Running Phases) */}
                          {isRunning && (
                            <g className="opacity-70">
                              <motion.line
                                x1="-24"
                                y1="50"
                                x2="-8"
                                y2="50"
                                stroke="#F7931E"
                                strokeWidth="3"
                                strokeLinecap="round"
                                animate={{ x1: [-26, -14, -26], opacity: [0.4, 0.9, 0.4] }}
                                transition={{ duration: 0.35, repeat: Infinity }}
                              />
                              <motion.line
                                x1="-30"
                                y1="75"
                                x2="-10"
                                y2="75"
                                stroke="#FBBF24"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                animate={{ x1: [-32, -18, -32], opacity: [0.3, 0.8, 0.3] }}
                                transition={{ duration: 0.3, repeat: Infinity, delay: 0.1 }}
                              />
                            </g>
                          )}

                          {/* RUNNING LEGS (Visible during run & anticipation; folds cleanly on lock) */}
                          {!isLockedIntoX && (
                            <motion.g
                              id="legs-a"
                              animate={{ opacity: isAnticipation ? 0.7 : 1 }}
                              exit={{ opacity: 0 }}
                            >
                              {/* Left Leg */}
                              <motion.g
                                animate={{
                                  rotate: isAnticipation ? -10 : [-24, 28, -24],
                                  y: isAnticipation ? 0 : [0, -3, 0],
                                }}
                                transition={{
                                  duration: 0.32,
                                  repeat: isAnticipation ? 0 : Infinity,
                                  ease: 'easeInOut',
                                }}
                                style={{ transformOrigin: '46px 130px' }}
                              >
                                <line x1="46" y1="130" x2="42" y2="148" stroke="#1E293B" strokeWidth="5" strokeLinecap="round" />
                                <ellipse cx="40" cy="150" rx="7" ry="4" fill="#0F172A" />
                                <ellipse cx="38" cy="151" rx="4" ry="2" fill="#F7931E" />
                              </motion.g>

                              {/* Right Leg */}
                              <motion.g
                                animate={{
                                  rotate: isAnticipation ? 10 : [28, -24, 28],
                                  y: isAnticipation ? 0 : [-3, 0, -3],
                                }}
                                transition={{
                                  duration: 0.32,
                                  repeat: isAnticipation ? 0 : Infinity,
                                  ease: 'easeInOut',
                                }}
                                style={{ transformOrigin: '64px 130px' }}
                              >
                                <line x1="64" y1="130" x2="68" y2="148" stroke="#1E293B" strokeWidth="5" strokeLinecap="round" />
                                <ellipse cx="70" cy="150" rx="7" ry="4" fill="#0F172A" />
                                <ellipse cx="72" cy="151" rx="4" ry="2" fill="#F7931E" />
                              </motion.g>
                            </motion.g>
                          )}

                          {/* MAIN DIAGONAL CAPSULE BODY (Centered precisely at 55px, 80px) */}
                          <g id="body-capsule-a">
                            <rect
                              x="40"
                              y="17"
                              width="30"
                              height="126"
                              rx="15"
                              fill="url(#charAGradient)"
                              className="shadow-md"
                            />
                            {/* 3D Gloss Highlight Stripe */}
                            <rect
                              x="43"
                              y="20"
                              width="9"
                              height="120"
                              rx="4.5"
                              fill="url(#glossGradA)"
                            />
                          </g>

                          {/* FRIENDLY FACE WHILE RUNNING */}
                          {!isLockedIntoX && (
                            <g id="face-a">
                              <motion.g
                                animate={{
                                  scaleY: [1, 1, 0.1, 1],
                                }}
                                transition={{
                                  duration: 2.2,
                                  repeat: Infinity,
                                  times: [0, 0.85, 0.9, 1],
                                }}
                                style={{ transformOrigin: '55px 50px' }}
                              >
                                <circle cx="50" cy="50" r="3.6" fill="#0F172A" />
                                <circle cx="51.2" cy="48.8" r="1.3" fill="#FFFFFF" />
                                <circle cx="61" cy="50" r="3.6" fill="#0F172A" />
                                <circle cx="62.2" cy="48.8" r="1.3" fill="#FFFFFF" />
                              </motion.g>
                              <path
                                d="M 50 58 Q 55.5 64 61 58"
                                stroke="#0F172A"
                                strokeWidth="2"
                                strokeLinecap="round"
                                fill="none"
                              />
                              <circle cx="46" cy="56" r="2.2" fill="#EA580C" opacity="0.4" />
                              <circle cx="65" cy="56" r="2.2" fill="#EA580C" opacity="0.4" />
                            </g>
                          )}

                          {/* ARMS & CARRIED PRINTED PAPERS */}
                          {!isLockedIntoX && (
                            <g id="arm-and-papers">
                              <motion.path
                                d="M 40 70 Q 28 80 32 94"
                                stroke="#EA580C"
                                strokeWidth="5"
                                strokeLinecap="round"
                                animate={{
                                  d: isAnticipation
                                    ? 'M 40 70 Q 32 75 35 88'
                                    : ['M 40 70 Q 28 80 32 94', 'M 40 70 Q 26 65 30 55', 'M 40 70 Q 28 80 32 94'],
                                }}
                                transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                              />

                              <motion.g
                                animate={{
                                  y: isAnticipation ? 0 : [-1, 2, -1],
                                  rotate: isAnticipation ? 0 : [-2, 3, -2],
                                }}
                                transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                                style={{ transformOrigin: '68px 74px' }}
                              >
                                <path d="M 68 74 Q 82 78 88 86" stroke="#EA580C" strokeWidth="5" strokeLinecap="round" />
                                <circle cx="88" cy="86" r="3.5" fill="#FFA439" />

                                {/* Stack of Fluttering Printed Papers */}
                                <g filter="url(#paperShadow)" transform="translate(82, 70)">
                                  <rect x="3" y="-2" width="22" height="28" rx="2" fill="#E2E8F0" transform="rotate(-6)" />
                                  <rect x="1" y="0" width="22" height="28" rx="2" fill="#F1F5F9" transform="rotate(3)" />
                                  <rect x="0" y="2" width="22" height="28" rx="2" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="0.8" />
                                  <rect x="3" y="5" width="10" height="2.5" rx="1" fill="#F7931E" />
                                  <line x1="3" y1="11" x2="19" y2="11" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
                                  <line x1="3" y1="15" x2="17" y2="15" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
                                  <line x1="3" y1="19" x2="14" y2="19" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
                                  <line x1="3" y1="23" x2="18" y2="23" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
                                </g>
                              </motion.g>
                            </g>
                          )}
                        </svg>
                      </motion.div>


                      {/* ==========================================================
                          CHARACTER B (RIGHT "\" CHARACTER)
                          - Enters starting at Scene 2
                          - Starts as "\" tilted at -24°
                          - Carries courier print folder/package
                          - Runs to center (+48px)
                          - Pauses at +42px for anticipation
                          - Crosses: Rotates counterclockwise (-111°), moves diagonally DOWN-LEFT through center
                          - Locks onto the BOTTOM-LEFT ↗ TOP-RIGHT diagonal of the X (-135° = "/")
                          ========================================================== */}
                      {phase !== 'scene1' && (
                        <motion.div
                          initial={{ x: 280, y: 0, opacity: 0, rotate: -24 }}
                          animate={{
                            x:
                              phase === 'scene2'
                                ? 110
                                : phase === 'approach'
                                ? 48
                                : phase === 'anticipation'
                                ? 42
                                : isCrossing
                                ? [42, -5, 0] // Down-left diagonal pass through center into 0
                                : 0,
                            y:
                              phase === 'scene2'
                                ? [0, -5, 0, -5, 0]
                                : phase === 'approach'
                                ? [0, -5, 0]
                                : phase === 'anticipation'
                                ? 3
                                : isCrossing
                                ? [3, 4, 0]
                                : 0,
                            rotate:
                              phase === 'scene2' || phase === 'approach'
                                ? -24 // Natural "\" running slant
                                : phase === 'anticipation'
                                ? -20 // Crouch angle
                                : isCrossing
                                ? [-20, -75, -135] // Counterclockwise rotation -> locks at -135° (/ stroke)
                                : -135,
                            scale:
                              isCrossing
                                ? [1.0, 1.15, 0.94, 1.03, 1.0] // Tiny squash and impact bounce
                                : isAnticipation
                                ? 0.97
                                : 1.0,
                            opacity: 1,
                          }}
                          transition={{
                            x: {
                              duration:
                                phase === 'scene2'
                                  ? 1.05
                                  : phase === 'approach'
                                  ? 0.75
                                  : phase === 'anticipation'
                                  ? 0.2
                                  : 0.45,
                              ease: isCrossing ? [0.34, 1.56, 0.64, 1] : [0.16, 1, 0.3, 1],
                            },
                            y: {
                              duration: isRunning ? 0.36 : 0.25,
                              repeat: isRunning ? Infinity : 0,
                              ease: 'easeInOut',
                            },
                            rotate: {
                              duration: isCrossing ? 0.45 : 0.25,
                              ease: isCrossing ? [0.34, 1.56, 0.64, 1] : 'easeOut',
                            },
                            scale: { duration: 0.45, ease: 'easeOut' },
                            opacity: { duration: 0.3 },
                          }}
                          className="absolute inset-0 flex items-center justify-center cursor-default"
                          style={{ transformOrigin: '55px 80px' }}
                        >
                          <svg
                            width="110"
                            height="160"
                            viewBox="0 0 110 160"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="overflow-visible"
                          >
                            <defs>
                              {/* Rich 3D Gradient for Character B */}
                              <linearGradient id="charBGradient" x1="100%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#FFBA3B" />
                                <stop offset="50%" stopColor="#F7931E" />
                                <stop offset="100%" stopColor="#D97706" />
                              </linearGradient>

                              {/* Top Gloss Highlight */}
                              <linearGradient id="glossGradB" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
                                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                              </linearGradient>

                              {/* Folder Drop Shadow */}
                              <filter id="folderShadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="-1" dy="2" stdDeviation="2" floodOpacity="0.18" />
                              </filter>
                            </defs>

                            {/* Motion Wind Trail Lines */}
                            {isRunning && (
                              <g className="opacity-70">
                                <motion.line
                                  x1="120"
                                  y1="50"
                                  x2="136"
                                  y2="50"
                                  stroke="#F7931E"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  animate={{ x2: [136, 124, 136], opacity: [0.4, 0.9, 0.4] }}
                                  transition={{ duration: 0.35, repeat: Infinity }}
                                />
                                <motion.line
                                  x1="118"
                                  y1="75"
                                  x2="138"
                                  y2="75"
                                  stroke="#FBBF24"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  animate={{ x2: [138, 126, 138], opacity: [0.3, 0.8, 0.3] }}
                                  transition={{ duration: 0.3, repeat: Infinity, delay: 0.1 }}
                                />
                              </g>
                            )}

                            {/* RUNNING LEGS */}
                            {!isLockedIntoX && (
                              <motion.g
                                id="legs-b"
                                animate={{ opacity: isAnticipation ? 0.7 : 1 }}
                                exit={{ opacity: 0 }}
                              >
                                <motion.g
                                  animate={{
                                    rotate: isAnticipation ? 10 : [28, -24, 28],
                                    y: isAnticipation ? 0 : [-3, 0, -3],
                                  }}
                                  transition={{
                                    duration: 0.32,
                                    repeat: isAnticipation ? 0 : Infinity,
                                    ease: 'easeInOut',
                                  }}
                                  style={{ transformOrigin: '46px 130px' }}
                                >
                                  <line x1="46" y1="130" x2="42" y2="148" stroke="#1E293B" strokeWidth="5" strokeLinecap="round" />
                                  <ellipse cx="40" cy="150" rx="7" ry="4" fill="#0F172A" />
                                  <ellipse cx="38" cy="151" rx="4" ry="2" fill="#FBBF24" />
                                </motion.g>

                                <motion.g
                                  animate={{
                                    rotate: isAnticipation ? -10 : [-24, 28, -24],
                                    y: isAnticipation ? 0 : [0, -3, 0],
                                  }}
                                  transition={{
                                    duration: 0.32,
                                    repeat: isAnticipation ? 0 : Infinity,
                                    ease: 'easeInOut',
                                  }}
                                  style={{ transformOrigin: '64px 130px' }}
                                >
                                  <line x1="64" y1="130" x2="68" y2="148" stroke="#1E293B" strokeWidth="5" strokeLinecap="round" />
                                  <ellipse cx="70" cy="150" rx="7" ry="4" fill="#0F172A" />
                                  <ellipse cx="72" cy="151" rx="4" ry="2" fill="#FBBF24" />
                                </motion.g>
                              </motion.g>
                            )}

                            {/* MAIN DIAGONAL CAPSULE BODY (Centered precisely at 55px, 80px) */}
                            <g id="body-capsule-b">
                              <rect
                                x="40"
                                y="17"
                                width="30"
                                height="126"
                                rx="15"
                                fill="url(#charBGradient)"
                                className="shadow-md"
                              />
                              {/* 3D Gloss Highlight Stripe */}
                              <rect
                                x="57"
                                y="20"
                                width="9"
                                height="120"
                                rx="4.5"
                                fill="url(#glossGradB)"
                              />
                            </g>

                            {/* FRIENDLY FACE WHILE RUNNING */}
                            {!isLockedIntoX && (
                              <g id="face-b">
                                <motion.g
                                  animate={{
                                    scaleY: [1, 1, 0.1, 1],
                                  }}
                                  transition={{
                                    duration: 2.4,
                                    repeat: Infinity,
                                    times: [0, 0.82, 0.88, 1],
                                  }}
                                  style={{ transformOrigin: '55px 50px' }}
                                >
                                  <circle cx="49" cy="50" r="3.6" fill="#0F172A" />
                                  <circle cx="48" cy="48.8" r="1.3" fill="#FFFFFF" />
                                  <circle cx="60" cy="50" r="3.6" fill="#0F172A" />
                                  <circle cx="59" cy="48.8" r="1.3" fill="#FFFFFF" />
                                </motion.g>
                                <path
                                  d="M 49 58 Q 54.5 64 60 58"
                                  stroke="#0F172A"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  fill="none"
                                />
                                <circle cx="45" cy="56" r="2.2" fill="#D97706" opacity="0.4" />
                                <circle cx="64" cy="56" r="2.2" fill="#D97706" opacity="0.4" />
                              </g>
                            )}

                            {/* ARMS & PRINT ORDER PACKAGE */}
                            {!isLockedIntoX && (
                              <g id="arm-and-package">
                                <motion.path
                                  d="M 70 70 Q 82 80 78 94"
                                  stroke="#D97706"
                                  strokeWidth="5"
                                  strokeLinecap="round"
                                  animate={{
                                    d: isAnticipation
                                      ? 'M 70 70 Q 78 75 75 88'
                                      : ['M 70 70 Q 82 80 78 94', 'M 70 70 Q 84 65 80 55', 'M 70 70 Q 82 80 78 94'],
                                  }}
                                  transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                                />

                                <motion.g
                                  animate={{
                                    y: isAnticipation ? 0 : [-1, 2, -1],
                                    rotate: isAnticipation ? 0 : [2, -3, 2],
                                  }}
                                  transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                                  style={{ transformOrigin: '42px 74px' }}
                                >
                                  <path d="M 42 74 Q 28 78 22 86" stroke="#D97706" strokeWidth="5" strokeLinecap="round" />
                                  <circle cx="22" cy="86" r="3.5" fill="#FFBA3B" />

                                  {/* Print Package / Folder */}
                                  <g filter="url(#folderShadow)" transform="translate(2, 70)">
                                    <rect x="0" y="0" width="24" height="28" rx="3" fill="#F59E0B" stroke="#D97706" strokeWidth="1" />
                                    <polygon points="0,0 12,10 24,0" fill="#D97706" />
                                    <circle cx="12" cy="16" r="4.5" fill="#FFFFFF" />
                                    <path d="M 10 16 L 14 16 M 12 14 L 12 18" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" />
                                  </g>
                                </motion.g>
                              </g>
                            )}
                          </svg>
                        </motion.div>
                      )}

                      {/* ==========================================================
                          UPRIGHT FRIENDLY MASCOT FACE AT THE CENTER OF THE X
                          - Appears seamlessly on contact
                          - Always stays perfectly upright (not rotated)
                          - Blinks playfully at the viewer
                          ========================================================== */}
                      {isLockedIntoX && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{
                            scale: [0, 1.25, 1],
                            opacity: 1,
                          }}
                          transition={{ duration: 0.35, delay: 0.12, ease: 'backOut' }}
                          className="absolute z-30 pointer-events-none flex items-center justify-center"
                          style={{ top: '64px', left: '38px', width: '34px', height: '32px' }}
                        >
                          <svg width="34" height="32" viewBox="0 0 34 32" fill="none">
                            {/* Blinking Eyes */}
                            <motion.g
                              animate={{ scaleY: [1, 1, 0.1, 1] }}
                              transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.85, 0.9, 1] }}
                              style={{ transformOrigin: '17px 11px' }}
                            >
                              <circle cx="10" cy="11" r="3.5" fill="#0F172A" />
                              <circle cx="11.2" cy="9.8" r="1.3" fill="#FFFFFF" />

                              <circle cx="24" cy="11" r="3.5" fill="#0F172A" />
                              <circle cx="25.2" cy="9.8" r="1.3" fill="#FFFFFF" />
                            </motion.g>

                            {/* Happy Smile Arc */}
                            <path
                              d="M 10 19 Q 17 25 24 19"
                              stroke="#0F172A"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              fill="none"
                            />

                            {/* Rosy Cheeks */}
                            <circle cx="6" cy="17" r="2.2" fill="#EA580C" opacity="0.4" />
                            <circle cx="28" cy="17" r="2.2" fill="#EA580C" opacity="0.4" />
                          </svg>
                        </motion.div>
                      )}
                    </motion.div>


                    {/* ==============================================================
                        SCENE 6: "Buddy" REVEAL BESIDE THE HERO X
                        - ONLY revealed after the X is completely formed and settled!
                        ============================================================== */}
                    {isBuddyVisible && (
                      <motion.div
                        initial={{ opacity: 0, x: 45, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          x: 18,
                          scale: 1,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 280,
                          damping: 18,
                          mass: 0.8,
                        }}
                        className="flex items-center select-none"
                      >
                        <span className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-900 leading-none">
                          Buddy
                        </span>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* ==============================================================
                  SCENE 7: "Upload • Pay • Print" TAGLINE
                  - ONLY revealed after the complete XBuddy logo is assembled!
                  ============================================================== */}
              {isTaglineVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.55,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="flex items-center gap-2.5 sm:gap-3 text-sm sm:text-base md:text-lg font-bold text-slate-600 tracking-wide mt-2"
                >
                  <span className="hover:text-slate-900 transition-colors">Upload</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F7931E] shadow-xs" />
                  <span className="hover:text-slate-900 transition-colors">Pay</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F7931E] shadow-xs" />
                  <span className="hover:text-slate-900 transition-colors">Print</span>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
