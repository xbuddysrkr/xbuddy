import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * XBuddyIntro
 * 
 * Cinematic website intro animation with clean, centered X geometry.
 * 
 * Exact requirements:
 * - One shared logo container with position: relative.
 * - Both bars: position: absolute; left: 50%; top: 50%; transform-origin: center center.
 * - Final transforms equivalent to:
 *     Bar 1: translate(-50%, -50%) rotate(45deg)
 *     Bar 2: translate(-50%, -50%) rotate(-45deg)
 * - Identical length, thickness, rounded ends, symmetrical geometry.
 * - Preserves small face detail on the left diagonal bar.
 * - Word "Buddy" settles beside the completed X.
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
            /* FULL NATIVE FRAMER MOTION HERO INTRO */
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
                      MAIN BRAND LOCKUP CONTAINER
                      Holds Hero X + "Buddy" Text
                      ============================================================== */}
                  <div className="relative flex items-center justify-center">

                    {/* SHARED LOGO CONTAINER (position: relative)
                        Holds Bar 1 and Bar 2 with identical center points.
                        Shifts smoothly (-75px) when phase reaches 'shift'
                    */}
                    <motion.div
                      animate={{
                        x: isShifted ? -75 : 0,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center pointer-events-none"
                    >

                      {/* ==========================================================
                          BAR 1 (Left "/" character initially, ends as +45deg stroke in X)
                          - position: absolute; left: 50%; top: 50%
                          - transform-origin: center center
                          - final transform equivalent to: translate(-50%, -50%) rotate(45deg)
                          - width: 28px, height: 116px, rounded-full
                          - carries papers while running
                          - has cute face on upper part
                          ========================================================== */}
                      <motion.div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: '28px',
                          height: '116px',
                          transformOrigin: 'center center',
                        }}
                        transformTemplate={({ x, y, rotate }) =>
                          `translate(-50%, -50%) translate(${x || '0px'}, ${y || '0px'}) rotate(${rotate || '0deg'})`
                        }
                        initial={{ x: '-260px', y: '0px', rotate: '24deg', opacity: 0 }}
                        animate={{
                          x:
                            phase === 'scene1'
                              ? '-110px'
                              : phase === 'scene2'
                              ? '-110px'
                              : phase === 'approach'
                              ? '-48px'
                              : phase === 'anticipation'
                              ? '-42px'
                              : isCrossing
                              ? ['-42px', '6px', '0px'] // Down-right diagonal pass through center
                              : '0px',                 // EXACT OVERLAPPING CENTER
                          y:
                            phase === 'scene1'
                              ? ['0px', '-7px', '0px', '-7px', '0px']
                              : phase === 'scene2'
                              ? ['0px', '-5px', '0px', '-5px', '0px']
                              : phase === 'approach'
                              ? ['0px', '-5px', '0px']
                              : phase === 'anticipation'
                              ? '3px'
                              : isCrossing
                              ? ['3px', '4px', '0px']
                              : '0px',
                          rotate:
                            phase === 'scene1' || phase === 'scene2' || phase === 'approach'
                              ? '24deg' // Natural "/" running slant
                              : phase === 'anticipation'
                              ? '20deg' // Crouch angle
                              : isCrossing
                              ? ['20deg', '35deg', '45deg'] // Smoothly rotates into +45deg
                              : '45deg',                    // EXACT +45deg
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
                        className="rounded-full bg-gradient-to-tr from-[#EA580C] via-[#F7931E] to-[#FFA439] shadow-md z-10 flex items-center justify-center cursor-default"
                      >
                        {/* 3D Gloss Highlight Stripe */}
                        <div className="absolute top-1.5 left-1.5 bottom-1.5 w-2 rounded-full bg-gradient-to-b from-white/60 to-transparent pointer-events-none" />

                        {/* PRESERVED CUTE MASCOT FACE ON THE LEFT BAR */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-6 h-5 pointer-events-none">
                          <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
                            {/* Blinking Eyes */}
                            <motion.g
                              animate={{ scaleY: [1, 1, 0.1, 1] }}
                              transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.85, 0.9, 1] }}
                              style={{ transformOrigin: '12px 6px' }}
                            >
                              <circle cx="7" cy="6" r="2.8" fill="#0F172A" />
                              <circle cx="7.9" cy="5.1" r="1.1" fill="#FFFFFF" />

                              <circle cx="17" cy="6" r="2.8" fill="#0F172A" />
                              <circle cx="17.9" cy="5.1" r="1.1" fill="#FFFFFF" />
                            </motion.g>

                            {/* Smile Mouth */}
                            <path
                              d="M 7 13 Q 12 18 17 13"
                              stroke="#0F172A"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              fill="none"
                            />

                            {/* Rosy Cheeks */}
                            <circle cx="4" cy="11" r="1.6" fill="#EA580C" opacity="0.45" />
                            <circle cx="20" cy="11" r="1.6" fill="#EA580C" opacity="0.45" />
                          </svg>
                        </div>

                        {/* Motion Wind Trail Lines (Running Phases) */}
                        {isRunning && (
                          <div className="absolute -left-7 top-6 pointer-events-none opacity-70">
                            <motion.div
                              animate={{ x: [-8, 4, -8], opacity: [0.4, 0.9, 0.4] }}
                              transition={{ duration: 0.35, repeat: Infinity }}
                              className="w-5 h-0.5 rounded-full bg-[#F7931E] mb-2"
                            />
                            <motion.div
                              animate={{ x: [-12, 2, -12], opacity: [0.3, 0.8, 0.3] }}
                              transition={{ duration: 0.3, repeat: Infinity, delay: 0.1 }}
                              className="w-6 h-0.5 rounded-full bg-[#FBBF24]"
                            />
                          </div>
                        )}

                        {/* RUNNING LEGS FOR BAR 1 (Fold away on lock) */}
                        {!isLockedIntoX && (
                          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 pointer-events-none">
                            <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
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
                                style={{ transformOrigin: '14px 4px' }}
                              >
                                <line x1="14" y1="4" x2="10" y2="20" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                                <ellipse cx="8" cy="22" rx="6.5" ry="3.5" fill="#0F172A" />
                                <ellipse cx="6" cy="23" rx="3.5" ry="1.8" fill="#F7931E" />
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
                                style={{ transformOrigin: '26px 4px' }}
                              >
                                <line x1="26" y1="4" x2="30" y2="20" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                                <ellipse cx="32" cy="22" rx="6.5" ry="3.5" fill="#0F172A" />
                                <ellipse cx="34" cy="23" rx="3.5" ry="1.8" fill="#F7931E" />
                              </motion.g>
                            </svg>
                          </div>
                        )}

                        {/* CARRIED PRINTED PAPERS FOR BAR 1 */}
                        {!isLockedIntoX && (
                          <div className="absolute -right-7 top-10 pointer-events-none">
                            <motion.div
                              animate={{
                                y: isAnticipation ? 0 : [-1, 2, -1],
                                rotate: isAnticipation ? 0 : [-2, 3, -2],
                              }}
                              transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                              className="relative w-6 h-7 rounded-xs bg-white border border-slate-300 shadow-md p-1 flex flex-col gap-1"
                            >
                              <div className="w-2.5 h-1 rounded-xs bg-[#F7931E]" />
                              <div className="w-full h-0.5 rounded-xs bg-slate-400" />
                              <div className="w-3/4 h-0.5 rounded-xs bg-slate-300" />
                              <div className="w-4/5 h-0.5 rounded-xs bg-slate-300" />
                            </motion.div>
                          </div>
                        )}
                      </motion.div>


                      {/* ==========================================================
                          BAR 2 (Right "\" character initially, ends as -45deg stroke in X)
                          - position: absolute; left: 50%; top: 50%
                          - transform-origin: center center
                          - final transform equivalent to: translate(-50%, -50%) rotate(-45deg)
                          - width: 28px, height: 116px, rounded-full (IDENTICAL dimensions to Bar 1)
                          - carries folder/package while running
                          ========================================================== */}
                      {phase !== 'scene1' && (
                        <motion.div
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: '28px',
                            height: '116px',
                            transformOrigin: 'center center',
                          }}
                          transformTemplate={({ x, y, rotate }) =>
                            `translate(-50%, -50%) translate(${x || '0px'}, ${y || '0px'}) rotate(${rotate || '0deg'})`
                          }
                          initial={{ x: '260px', y: '0px', rotate: '-24deg', opacity: 0 }}
                          animate={{
                            x:
                              phase === 'scene2'
                                ? '110px'
                                : phase === 'approach'
                                ? '48px'
                                : phase === 'anticipation'
                                ? '42px'
                                : isCrossing
                                ? ['42px', '-6px', '0px'] // Down-left diagonal pass through center
                                : '0px',                  // EXACT OVERLAPPING CENTER
                            y:
                              phase === 'scene2'
                                ? ['0px', '-5px', '0px', '-5px', '0px']
                                : phase === 'approach'
                                ? ['0px', '-5px', '0px']
                                : phase === 'anticipation'
                                ? '3px'
                                : isCrossing
                                ? ['3px', '4px', '0px']
                                : '0px',
                            rotate:
                              phase === 'scene2' || phase === 'approach'
                                ? '-24deg' // Natural "\" running slant
                                : phase === 'anticipation'
                                ? '-20deg' // Crouch angle
                                : isCrossing
                                ? ['-20deg', '-35deg', '-45deg'] // Smoothly rotates into -45deg
                                : '-45deg',                     // EXACT -45deg
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
                          className="rounded-full bg-gradient-to-tl from-[#D97706] via-[#F7931E] to-[#FFBA3B] shadow-md z-10 flex items-center justify-center cursor-default"
                        >
                          {/* 3D Gloss Highlight Stripe */}
                          <div className="absolute top-1.5 right-1.5 bottom-1.5 w-2 rounded-full bg-gradient-to-b from-white/55 to-transparent pointer-events-none" />

                          {/* Motion Wind Trail Lines */}
                          {isRunning && (
                            <div className="absolute -right-7 top-6 pointer-events-none opacity-70">
                              <motion.div
                                animate={{ x: [8, -4, 8], opacity: [0.4, 0.9, 0.4] }}
                                transition={{ duration: 0.35, repeat: Infinity }}
                                className="w-5 h-0.5 rounded-full bg-[#F7931E] mb-2 ml-auto"
                              />
                              <motion.div
                                animate={{ x: [12, -2, 12], opacity: [0.3, 0.8, 0.3] }}
                                transition={{ duration: 0.3, repeat: Infinity, delay: 0.1 }}
                                className="w-6 h-0.5 rounded-full bg-[#FBBF24] ml-auto"
                              />
                            </div>
                          )}

                          {/* RUNNING LEGS FOR BAR 2 */}
                          {!isLockedIntoX && (
                            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 pointer-events-none">
                              <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
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
                                  style={{ transformOrigin: '14px 4px' }}
                                >
                                  <line x1="14" y1="4" x2="10" y2="20" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                                  <ellipse cx="8" cy="22" rx="6.5" ry="3.5" fill="#0F172A" />
                                  <ellipse cx="6" cy="23" rx="3.5" ry="1.8" fill="#FBBF24" />
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
                                  style={{ transformOrigin: '26px 4px' }}
                                >
                                  <line x1="26" y1="4" x2="30" y2="20" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                                  <ellipse cx="32" cy="22" rx="6.5" ry="3.5" fill="#0F172A" />
                                  <ellipse cx="34" cy="23" rx="3.5" ry="1.8" fill="#FBBF24" />
                                </motion.g>
                              </svg>
                            </div>
                          )}

                          {/* CARRIED COURIER PACKAGE FOR BAR 2 */}
                          {!isLockedIntoX && (
                            <div className="absolute -left-7 top-10 pointer-events-none">
                              <motion.div
                                animate={{
                                  y: isAnticipation ? 0 : [-1, 2, -1],
                                  rotate: isAnticipation ? 0 : [2, -3, 2],
                                }}
                                transition={{ duration: 0.32, repeat: isAnticipation ? 0 : Infinity, ease: 'easeInOut' }}
                                className="w-6 h-7 rounded-xs bg-[#F59E0B] border border-[#D97706] shadow-md p-0.5 flex flex-col items-center justify-center"
                              >
                                <div className="w-4 h-2 rounded-xs border-t border-[#D97706] mb-1" />
                                <div className="w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center">
                                  <span className="text-[6px] font-bold text-[#D97706]">✓</span>
                                </div>
                              </motion.div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>


                    {/* ==============================================================
                        SCENE 6: "Buddy" REVEAL BESIDE THE HERO X
                        - Positioned to the right of the shifted X
                        - ONLY revealed after the X is completely formed and settled!
                        ============================================================== */}
                    {isBuddyVisible && (
                      <motion.div
                        initial={{ opacity: 0, x: 45, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          x: 14,
                          scale: 1,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 280,
                          damping: 18,
                          mass: 0.8,
                        }}
                        className="absolute left-1/2 flex items-center select-none"
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
