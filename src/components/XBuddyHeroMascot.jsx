import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * XBuddyHeroMascot
 * 
 * Living, interactive XBuddy character for the Hero section.
 * Replaces the static "X" glyph in the "X Buddy" hero title.
 * 
 * Features:
 * - Approved XBuddy mascot visual design (rounded pill diagonal X with warm brand gradient).
 * - Gentle breathing & bobbing idle animation.
 * - Periodic natural blinking.
 * - Smooth pointer proximity detection to the "Start Printing" button.
 * - Eye gaze tracking & subtle head tilt as pointer approaches the button.
 * - Micro-expression on Start Printing hover/focus (eyes focus, smile widens, eager lean).
 * - Celebratory micro-animation on click (joyful bounce, carried paper flutter, orange spark stars).
 * - Full prefers-reduced-motion support.
 * - GPU-accelerated transforms & lightweight SVG rendering.
 */
export default function XBuddyHeroMascot({
  buttonRef,
  isHovered = false,
  isCelebrating = false,
  onClickMascot,
}) {
  const shouldReduceMotion = useReducedMotion()
  const mascotRef = useRef(null)

  // Tracking states
  const [proximity, setProximity] = useState(0) // 0 to 1
  const [eyeGaze, setEyeGaze] = useState({ x: 0, y: 0 })
  const [headTilt, setHeadTilt] = useState(0) // degrees
  const [isBlinking, setIsBlinking] = useState(false)
  const [isWinking, setIsWinking] = useState(false)

  // Animation frame throttle
  const rafId = useRef(null)
  const targetGaze = useRef({ x: 0, y: 0, tilt: 0, prox: 0 })
  const currentGaze = useRef({ x: 0, y: 0, tilt: 0, prox: 0 })

  // 1. Natural Blinking Loop (subtle life)
  useEffect(() => {
    if (shouldReduceMotion) return

    let blinkTimer
    const triggerBlink = () => {
      setIsBlinking(true)
      setTimeout(() => {
        setIsBlinking(false)
        // Next blink between 2.8s and 5.2s
        const nextInterval = 2800 + Math.random() * 2400
        blinkTimer = setTimeout(triggerBlink, nextInterval)
      }, 160)
    }

    blinkTimer = setTimeout(triggerBlink, 2500)
    return () => clearTimeout(blinkTimer)
  }, [shouldReduceMotion])

  // 2. Smooth Lerp Animation Loop for Eyes and Head
  const animateGaze = useCallback(() => {
    if (shouldReduceMotion) return

    const factor = 0.18 // Smooth spring-like lerp speed
    currentGaze.current.x += (targetGaze.current.x - currentGaze.current.x) * factor
    currentGaze.current.y += (targetGaze.current.y - currentGaze.current.y) * factor
    currentGaze.current.tilt += (targetGaze.current.tilt - currentGaze.current.tilt) * factor
    currentGaze.current.prox += (targetGaze.current.prox - currentGaze.current.prox) * factor

    setEyeGaze({
      x: Math.round(currentGaze.current.x * 100) / 100,
      y: Math.round(currentGaze.current.y * 100) / 100,
    })
    setHeadTilt(Math.round(currentGaze.current.tilt * 10) / 10)
    setProximity(Math.round(currentGaze.current.prox * 100) / 100)

    rafId.current = requestAnimationFrame(animateGaze)
  }, [shouldReduceMotion])

  useEffect(() => {
    if (shouldReduceMotion) return
    rafId.current = requestAnimationFrame(animateGaze)
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [animateGaze, shouldReduceMotion])

  // 3. Pointer Tracking & Start Printing Targeting
  useEffect(() => {
    if (shouldReduceMotion) return

    const handlePointerMove = (e) => {
      // Skip on mobile touch moves to maintain instant touch response
      if (e.pointerType === 'touch') return
      if (!buttonRef?.current || !mascotRef?.current) return

      const mascotRect = mascotRef.current.getBoundingClientRect()
      const btnRect = buttonRef.current.getBoundingClientRect()

      const mascotCenterX = mascotRect.left + mascotRect.width / 2
      const mascotCenterY = mascotRect.top + mascotRect.height / 2

      const btnCenterX = btnRect.left + btnRect.width / 2
      const btnCenterY = btnRect.top + btnRect.height / 2

      // 1. General ambient pointer tracking (very small subtle range: max 1.5px)
      const pdx = e.clientX - mascotCenterX
      const pdy = e.clientY - mascotCenterY
      const pDist = Math.hypot(pdx, pdy) || 1
      const pNormX = pdx / pDist
      const pNormY = pdy / pDist
      const generalGazeX = pNormX * Math.min(1.5, pDist * 0.004)
      const generalGazeY = pNormY * Math.min(1.5, pDist * 0.004)

      // 2. Vector toward Start Printing button
      const bdx = btnCenterX - mascotCenterX
      const bdy = btnCenterY - mascotCenterY
      const bDist = Math.hypot(bdx, bdy) || 1
      const bNormX = bdx / bDist
      const bNormY = bdy / bDist

      // Distance from pointer to button center
      const distToPointerToBtn = Math.hypot(e.clientX - btnCenterX, e.clientY - btnCenterY)
      const maxRadius = 450
      const btnProximity = Math.max(0, Math.min(1, 1 - distToPointerToBtn / maxRadius))

      if (isHovered) {
        // Direct focused gaze at button
        targetGaze.current = {
          x: bNormX * 2.8,
          y: bNormY * 2.8,
          tilt: bNormX * 2.6,
          prox: 1,
        }
      } else if (btnProximity > 0) {
        // Smooth blend from general ambient gaze to button targeting as pointer nears button
        const weight = btnProximity * btnProximity
        targetGaze.current = {
          x: generalGazeX * (1 - weight) + (bNormX * 2.8) * weight,
          y: generalGazeY * (1 - weight) + (bNormY * 2.8) * weight,
          tilt: bNormX * (btnProximity * 2.2),
          prox: btnProximity,
        }
      } else {
        // Subtle ambient cursor tracking
        targetGaze.current = {
          x: generalGazeX,
          y: generalGazeY,
          tilt: 0,
          prox: 0,
        }
      }
    }

    const handlePointerLeave = () => {
      if (isHovered) return
      targetGaze.current = { x: 0, y: 0.3, tilt: 0, prox: 0 }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('mouseleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', handlePointerLeave)
    }
  }, [buttonRef, isHovered, shouldReduceMotion])

  // Sync state when hovered prop changes
  useEffect(() => {
    if (shouldReduceMotion) return
    if (isHovered && buttonRef?.current && mascotRef?.current) {
      const btnRect = buttonRef.current.getBoundingClientRect()
      const mascotRect = mascotRef.current.getBoundingClientRect()
      const dx = (btnRect.left + btnRect.width / 2) - (mascotRect.left + mascotRect.width / 2)
      const dy = (btnRect.top + btnRect.height / 2) - (mascotRect.top + mascotRect.height / 2)
      const dist = Math.hypot(dx, dy) || 1

      targetGaze.current = {
        x: (dx / dist) * 2.8,
        y: (dy / dist) * 2.8,
        tilt: (dx / dist) * 2.6,
        prox: 1,
      }
    } else if (!isHovered) {
      targetGaze.current = { x: 0, y: 0.3, tilt: 0, prox: 0 }
    }
  }, [isHovered, buttonRef, shouldReduceMotion])

  // Click mascot directly: cute wink interaction
  const handleMascotDirectClick = () => {
    if (shouldReduceMotion) return
    setIsWinking(true)
    setTimeout(() => setIsWinking(false), 380)
    onClickMascot?.()
  }

  // Active smile curve interpolation based on interaction
  const getSmilePath = () => {
    if (isCelebrating) {
      // Wide open happy smile on celebration
      return 'M 41 51 Q 50 63 59 51 Z'
    }
    if (isHovered || proximity > 0.65) {
      // Cheerful wide grin
      return 'M 40 52 Q 50 62.5 60 52'
    }
    if (proximity > 0.25) {
      // Noticing / welcoming smile
      return 'M 42 53 Q 50 61 58 53'
    }
    // Gentle contented idle smile
    return 'M 43 53.5 Q 50 59.5 57 53.5'
  }

  return (
    <motion.div
      ref={mascotRef}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      onClick={handleMascotDirectClick}
      title="Buddy"
      className="relative inline-flex items-center justify-center select-none cursor-pointer group"
      style={{
        // Prominent, adorable size that looks great on mobile and desktop
        width: 'clamp(84px, 20vw, 120px)',
        height: 'clamp(84px, 20vw, 120px)',
        verticalAlign: 'middle',
      }}
    >
      {/* 1. Subtle Ground Glow/Shadow */}
      <motion.div
        animate={
          shouldReduceMotion
            ? { opacity: 0.25 }
            : {
                scale: isCelebrating ? [1, 0.85, 1.15, 1] : isHovered ? 1.12 : [1, 1.05, 1],
                opacity: isCelebrating ? [0.2, 0.1, 0.3, 0.25] : isHovered ? 0.32 : [0.2, 0.28, 0.2],
              }
        }
        transition={{
          scale: { duration: isCelebrating ? 0.4 : isHovered ? 0.2 : 3.8, repeat: isCelebrating || isHovered ? 0 : Infinity, ease: 'easeInOut' },
          opacity: { duration: isCelebrating ? 0.4 : isHovered ? 0.2 : 3.8, repeat: isCelebrating || isHovered ? 0 : Infinity, ease: 'easeInOut' },
        }}
        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4/5 h-2.5 bg-orange-950/20 rounded-full blur-xs pointer-events-none"
      />

      {/* 2. Celebratory Orange & Golden Spark Accents */}
      {isCelebrating && !shouldReduceMotion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          {[30, 90, 150, 210, 270, 330].map((deg, idx) => (
            <motion.div
              key={idx}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{
                x: Math.cos((deg * Math.PI) / 180) * 38,
                y: Math.sin((deg * Math.PI) / 180) * 38,
                scale: [0, 1.2, 0],
                opacity: [1, 0.9, 0],
              }}
              transition={{ duration: 0.38, delay: idx * 0.015, ease: 'easeOut' }}
              className="absolute w-2 h-2 rounded-full bg-gradient-to-tr from-[#F7931E] to-amber-300 shadow-xs"
            />
          ))}
        </div>
      )}

      {/* 3. Main Mascot Body with 3.8s Idle Breathing + Hover Lean + Celebratory Hop */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : isCelebrating
            ? {
                y: [0, -10, 2, -2, 0],
                scale: [1, 1.09, 0.97, 1.02, 1],
                rotate: [headTilt, headTilt - 4, headTilt + 4, headTilt],
              }
            : isHovered
            ? {
                y: -3,
                scale: 1.04,
                rotate: headTilt * 1.1,
              }
            : {
                y: [0, -3, 0],
                scaleX: [1, 0.99, 1],
                scaleY: [1, 1.02, 1],
                rotate: headTilt,
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : isCelebrating
            ? { duration: 0.38, ease: 'easeOut' }
            : isHovered
            ? { type: 'spring', stiffness: 380, damping: 22 }
            : {
                y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
                scaleX: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
                scaleY: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
                rotate: { type: 'spring', stiffness: 240, damping: 20 },
              }
        }
        className="relative w-full h-full flex items-center justify-center filter drop-shadow-md group-hover:drop-shadow-lg transition-all"
        style={{ willChange: 'transform' }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Slash Pill Gradient (+45deg diagonal) */}
            <linearGradient id="xbuddySlashGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="45%" stopColor="#F7931E" />
              <stop offset="100%" stopColor="#FFA439" />
            </linearGradient>

            {/* Backslash Pill Gradient (-45deg diagonal) */}
            <linearGradient id="xbuddyBackslashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFBA3B" />
              <stop offset="55%" stopColor="#F7931E" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>

            {/* 3D Gloss Highlight */}
            <linearGradient id="xbuddyGlossGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            {/* Subtle paper shadow */}
            <filter id="xbuddyPaperShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#0F172A" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* ==============================================================
              LAYER 1: BACKSLASH PILL (-45deg)
              ============================================================== */}
          <g transform="rotate(-45 50 50)">
            <rect
              x="39"
              y="11"
              width="22"
              height="78"
              rx="11"
              fill="url(#xbuddyBackslashGrad)"
            />
            {/* Glossy inner edge reflection */}
            <rect
              x="41"
              y="13"
              width="3.2"
              height="40"
              rx="1.6"
              fill="url(#xbuddyGlossGrad)"
              opacity="0.7"
            />
          </g>

          {/* ==============================================================
              LAYER 2: CARRIED CAMPUS PRINT SLIP (Subtle Paper Movement)
              Tucked cheerfully behind the crossing point
              ============================================================== */}
          <motion.g
            animate={
              shouldReduceMotion
                ? {}
                : isCelebrating
                ? { rotate: [12, -4, 14, 12], y: [0, -6, 0] }
                : {
                    rotate: [11, 14, 11],
                    y: [0, -1.5, 0],
                  }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : isCelebrating
                ? { duration: 0.45, ease: 'easeOut' }
                : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
            }
            style={{ transformOrigin: '72px 48px' }}
          >
            <g transform="translate(69, 44) rotate(12)">
              {/* Paper body */}
              <rect
                x="-7"
                y="-9"
                width="14"
                height="19"
                rx="2"
                fill="#FFFFFF"
                stroke="#E2E8F0"
                strokeWidth="0.8"
                filter="url(#xbuddyPaperShadow)"
              />
              {/* Top orange print accent line */}
              <rect x="-5" y="-7" width="6" height="2" rx="0.75" fill="#F7931E" />
              {/* Document text mock lines */}
              <line x1="-5" y1="-2" x2="4.5" y2="-2" stroke="#94A3B8" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="-5" y1="1.8" x2="2.5" y2="1.8" stroke="#CBD5E1" strokeWidth="0.9" strokeLinecap="round" />
              <line x1="-5" y1="5.5" x2="4" y2="5.5" stroke="#CBD5E1" strokeWidth="0.9" strokeLinecap="round" />
            </g>
          </motion.g>

          {/* ==============================================================
              LAYER 3: SLASH PILL (+45deg)
              Locks perfectly across center forming the iconic XBuddy X
              ============================================================== */}
          <g transform="rotate(45 50 50)">
            <rect
              x="39"
              y="11"
              width="22"
              height="78"
              rx="11"
              fill="url(#xbuddySlashGrad)"
            />
            {/* Glossy inner edge reflection */}
            <rect
              x="41"
              y="13"
              width="3.2"
              height="40"
              rx="1.6"
              fill="url(#xbuddyGlossGrad)"
              opacity="0.8"
            />
          </g>

          {/* ==============================================================
              LAYER 4: ADORABLE LIVING MASCOT FACE
              Positioned in the optical center of the X lockup (50, 48)
              ============================================================== */}
          <g
            style={{
              transform: `translate(${eyeGaze.x * 0.4}px, ${eyeGaze.y * 0.4}px)`,
              transition: shouldReduceMotion ? 'none' : 'transform 0.08s ease-out',
            }}
          >
            {/* Rosy Cheeks (blush increases as user approaches or hovers) */}
            <circle
              cx="34"
              cy="52"
              r="4.2"
              fill="#EA580C"
              opacity={0.35 + proximity * 0.3}
              style={{ transition: 'opacity 0.2s ease' }}
            />
            <circle
              cx="66"
              cy="52"
              r="4.2"
              fill="#EA580C"
              opacity={0.35 + proximity * 0.3}
              style={{ transition: 'opacity 0.2s ease' }}
            />

            {/* EYES LAYER */}
            {/* Blinking Container */}
            <motion.g
              animate={{
                scaleY: isBlinking ? 0.08 : 1,
              }}
              transition={{ duration: 0.12 }}
              style={{ transformOrigin: '50px 44px' }}
            >
              {/* LEFT EYE */}
              <g>
                <ellipse cx="38" cy="44" rx="5.8" ry="6.2" fill="#0F172A" />
                {/* Gaze tracking highlights (clamped smoothly inside eye socket) */}
                <circle
                  cx={39.4 + eyeGaze.x}
                  cy={42.4 + eyeGaze.y}
                  r="2.2"
                  fill="#FFFFFF"
                />
                <circle
                  cx={36.8 + eyeGaze.x * 0.8}
                  cy={45.6 + eyeGaze.y * 0.8}
                  r="1.1"
                  fill="#FFFFFF"
                  opacity="0.9"
                />
              </g>

              {/* RIGHT EYE (supports cute wink on direct tap) */}
              {isWinking ? (
                // Wink curve 😉
                <path
                  d="M 57 44 Q 62 48 67 44"
                  stroke="#0F172A"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : (
                <g>
                  <ellipse cx="62" cy="44" rx="5.8" ry="6.2" fill="#0F172A" />
                  {/* Gaze tracking highlights */}
                  <circle
                    cx={63.4 + eyeGaze.x}
                    cy={42.4 + eyeGaze.y}
                    r="2.2"
                    fill="#FFFFFF"
                  />
                  <circle
                    cx={60.8 + eyeGaze.x * 0.8}
                    cy={45.6 + eyeGaze.y * 0.8}
                    r="1.1"
                    fill="#FFFFFF"
                    opacity="0.9"
                  />
                </g>
              )}
            </motion.g>

            {/* SMILE MOUTH */}
            {isCelebrating ? (
              // Open happy mouth with tongue
              <g>
                <path
                  d="M 42 51.5 Q 50 63.5 58 51.5 Z"
                  fill="#0F172A"
                />
                <path
                  d="M 45 56 Q 50 62.5 55 56 Z"
                  fill="#FB7185"
                />
              </g>
            ) : (
              <path
                d={getSmilePath()}
                stroke="#0F172A"
                strokeWidth={isHovered ? '2.8' : '2.4'}
                strokeLinecap="round"
                fill="none"
                style={{ transition: 'd 0.15s ease, stroke-width 0.15s ease' }}
              />
            )}
          </g>
        </svg>
      </motion.div>
    </motion.div>
  )
}
