import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * XBuddyHeroMascot
 * 
 * Living, interactive XBuddy character for the Hero section.
 * "Sphere-style" interactive living mascot that naturally notices the user,
 * tracks cursor smoothly with micro-physics, eagerly notices the Start Printing CTA,
 * and features the adorable top-edge "Don't leave me? 🥺" micro-interaction.
 * 
 * Hierarchy:
 * 1. Cursor near top edge of screen (<120px) -> "Are you leaving me? 🥺" sad/worried reaction
 * 2. Start Printing button hovered / focused -> Eager, happy smile looking right at CTA
 * 3. Cursor approaching Start Printing -> Mascot smoothly focuses attention on CTA
 * 4. Cursor moving across Hero -> Natural, clamped eye tracking (3-3.5px max) with living lag
 * 5. Idle -> Gentle breathing & occasional natural blink
 * 6. CTA Click -> Tiny anticipation squash, joyful bounce, happy celebration particles
 */
export default function XBuddyHeroMascot({
  buttonRef,
  isHovered = false,
  isCelebrating = false,
  onClickMascot,
}) {
  const shouldReduceMotion = useReducedMotion()
  const mascotRef = useRef(null)

  // Fluid tracking states (updated smoothly via RAF loop)
  const [eyeGaze, setEyeGaze] = useState({ x: 0, y: 0 })
  const [headTilt, setHeadTilt] = useState(0) // degrees (-3 to +3)
  const [proximity, setProximity] = useState(0) // 0 to 1 (near CTA)
  const [sadness, setSadness] = useState(0) // 0 to 1 (top-edge "don't leave me 🥺")
  const [isBlinking, setIsBlinking] = useState(false)
  const [isWinking, setIsWinking] = useState(false)

  // Interpolation references
  const rafId = useRef(null)
  const lastPointer = useRef(null)
  const isPointerActive = useRef(false)
  const isHoveredRef = useRef(isHovered)
  isHoveredRef.current = isHovered

  const currentValues = useRef({ x: 0, y: 0.5, tilt: 0, prox: 0, sad: 0 })
  const targetValues = useRef({ x: 0, y: 0.5, tilt: 0, prox: 0, sad: 0 })

  // 1. Natural Organic Blinking (subtle life)
  useEffect(() => {
    if (shouldReduceMotion) return

    let blinkTimer
    const triggerBlink = () => {
      setIsBlinking(true)
      setTimeout(() => {
        setIsBlinking(false)
        // Irregular interval between 2.8s and 5.5s
        const nextInterval = 2800 + Math.random() * 2700
        blinkTimer = setTimeout(triggerBlink, nextInterval)
      }, 150)
    }

    blinkTimer = setTimeout(triggerBlink, 2400)
    return () => clearTimeout(blinkTimer)
  }, [shouldReduceMotion])

  // 2. High-Performance RAF Lerp Loop
  const updateLoop = useCallback(() => {
    if (shouldReduceMotion) return

    const cur = currentValues.current
    const tgt = targetValues.current

    // Spring-like lerp factors (snappy yet soft and organic)
    const factorGaze = 0.16
    const factorTilt = 0.13
    const factorProx = 0.15
    const factorSad  = 0.14

    cur.x += (tgt.x - cur.x) * factorGaze
    cur.y += (tgt.y - cur.y) * factorGaze
    cur.tilt += (tgt.tilt - cur.tilt) * factorTilt
    cur.prox += (tgt.prox - cur.prox) * factorProx
    cur.sad += (tgt.sad - cur.sad) * factorSad

    // Round slightly to eliminate floating point thrash
    const rx = Math.round(cur.x * 100) / 100
    const ry = Math.round(cur.y * 100) / 100
    const rt = Math.round(cur.tilt * 10) / 10
    const rp = Math.round(cur.prox * 100) / 100
    const rs = Math.round(cur.sad * 100) / 100

    setEyeGaze(prev => (prev.x === rx && prev.y === ry ? prev : { x: rx, y: ry }))
    setHeadTilt(prev => (prev === rt ? prev : rt))
    setProximity(prev => (prev === rp ? prev : rp))
    setSadness(prev => (prev === rs ? prev : rs))

    rafId.current = requestAnimationFrame(updateLoop)
  }, [shouldReduceMotion])

  useEffect(() => {
    if (shouldReduceMotion) return
    rafId.current = requestAnimationFrame(updateLoop)
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [updateLoop, shouldReduceMotion])

  // 3. Pointer & Screen Interaction Logic
  useEffect(() => {
    if (shouldReduceMotion) return

    const handlePointerMove = (e) => {
      // Discard touch pointermove to avoid unnatural jumps on mobile
      if (e.pointerType === 'touch') return

      isPointerActive.current = true
      lastPointer.current = { x: e.clientX, y: e.clientY }

      if (!mascotRef.current) return
      const mascotRect = mascotRef.current.getBoundingClientRect()
      const mascotCenterX = mascotRect.left + mascotRect.width / 2
      const mascotCenterY = mascotRect.top + mascotRect.height / 2

      // ── PRIORITY 1: TOP-EDGE "DON'T LEAVE ME" INTERACTION ──────────
      // When cursor approaches the top edge (y <= 120px)
      const topThreshold = 120
      const peakThreshold = 35
      if (e.clientY <= topThreshold) {
        const topFactor = Math.max(0, Math.min(1, (topThreshold - e.clientY) / (topThreshold - peakThreshold)))
        const dx = (e.clientX - mascotCenterX) / 240
        const clampedTilt = Math.max(-2.5, Math.min(2.5, dx * 2.2))

        targetValues.current = {
          x: Math.max(-2.6, Math.min(2.6, dx * 2.4)),
          y: -3.2, // Look up toward browser tabs/close button
          tilt: clampedTilt,
          prox: 0,
          sad: topFactor,
        }
        return
      }

      // ── PRIORITY 2: BUTTON HOVERED ─────────────────────────────────
      if (isHoveredRef.current && buttonRef?.current) {
        const btnRect = buttonRef.current.getBoundingClientRect()
        const btnCenterX = btnRect.left + btnRect.width / 2
        const btnCenterY = btnRect.top + btnRect.height / 2
        const dx = btnCenterX - mascotCenterX
        const dy = btnCenterY - mascotCenterY
        const dist = Math.hypot(dx, dy) || 1

        targetValues.current = {
          x: (dx / dist) * 3.4,
          y: (dy / dist) * 3.4,
          tilt: (dx / dist) * 3.2,
          prox: 1,
          sad: 0,
        }
        return
      }

      // ── PRIORITY 3: POINTER APPROACHES START PRINTING ──────────────
      if (buttonRef?.current) {
        const btnRect = buttonRef.current.getBoundingClientRect()
        const btnCenterX = btnRect.left + btnRect.width / 2
        const btnCenterY = btnRect.top + btnRect.height / 2

        const distToPointer = Math.hypot(e.clientX - btnCenterX, e.clientY - btnCenterY)
        const ctaRadius = 380

        if (distToPointer < ctaRadius) {
          const btnWeight = Math.max(0, 1 - distToPointer / ctaRadius)

          // Vector to button
          const btnDx = btnCenterX - mascotCenterX
          const btnDy = btnCenterY - mascotCenterY
          const btnDist = Math.hypot(btnDx, btnDy) || 1
          const normBtnX = btnDx / btnDist
          const normBtnY = btnDy / btnDist

          // Vector to pointer
          const ptrDx = e.clientX - mascotCenterX
          const ptrDy = e.clientY - mascotCenterY
          const ptrDist = Math.hypot(ptrDx, ptrDy) || 1
          const normPtrX = ptrDx / ptrDist
          const normPtrY = ptrDy / ptrDist

          // Blend gaze from pointer to CTA
          const blendX = normPtrX * (1 - btnWeight * 0.75) + normBtnX * (btnWeight * 0.75)
          const blendY = normPtrY * (1 - btnWeight * 0.75) + normBtnY * (btnWeight * 0.75)
          const blendMag = Math.hypot(blendX, blendY) || 1

          const gazeMag = 2.0 + btnWeight * 1.4 // Max 3.4px
          targetValues.current = {
            x: (blendX / blendMag) * gazeMag,
            y: (blendY / blendMag) * gazeMag,
            tilt: (blendX / blendMag) * (1.6 + btnWeight * 1.6),
            prox: btnWeight,
            sad: 0,
          }
          return
        }
      }

      // ── PRIORITY 4: NORMAL SUBTLE POINTER TRACKING ACROSS HERO ─────
      const ptrDx = e.clientX - mascotCenterX
      const ptrDy = e.clientY - mascotCenterY
      const ptrDist = Math.hypot(ptrDx, ptrDy) || 1
      const normX = ptrDx / ptrDist
      const normY = ptrDy / ptrDist

      // Clamped gentle magnitude (max 2.8px)
      const gazeDistance = Math.min(ptrDist / 180, 1) * 2.8

      targetValues.current = {
        x: normX * gazeDistance,
        y: normY * gazeDistance,
        tilt: normX * 1.8,
        prox: 0,
        sad: 0,
      }
    }

    const handlePointerLeave = () => {
      isPointerActive.current = false
      if (isHoveredRef.current) return
      targetValues.current = { x: 0, y: 0.5, tilt: 0, prox: 0, sad: 0 }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('mouseleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', handlePointerLeave)
    }
  }, [buttonRef, shouldReduceMotion])

  // Sync state when isHovered prop changes (desktop or touch focus)
  useEffect(() => {
    if (shouldReduceMotion) return

    if (isHovered && buttonRef?.current && mascotRef?.current) {
      const btnRect = buttonRef.current.getBoundingClientRect()
      const mascotRect = mascotRef.current.getBoundingClientRect()
      const dx = (btnRect.left + btnRect.width / 2) - (mascotRect.left + mascotRect.width / 2)
      const dy = (btnRect.top + btnRect.height / 2) - (mascotRect.top + mascotRect.height / 2)
      const dist = Math.hypot(dx, dy) || 1

      targetValues.current = {
        x: (dx / dist) * 3.4,
        y: (dy / dist) * 3.4,
        tilt: (dx / dist) * 3.4,
        prox: 1,
        sad: 0,
      }
    } else if (!isHovered && !isPointerActive.current) {
      targetValues.current = { x: 0, y: 0.5, tilt: 0, prox: 0, sad: 0 }
    }
  }, [isHovered, buttonRef, shouldReduceMotion])

  // Click mascot directly: cute wink interaction 😉
  const handleMascotDirectClick = () => {
    if (shouldReduceMotion) return
    setIsWinking(true)
    setTimeout(() => setIsWinking(false), 400)
    onClickMascot?.()
  }

  // Expression path: smoothly interpolates between happy, eager, and cute worried frown
  const getSmilePath = () => {
    if (isCelebrating) {
      // Wide open cheerful celebration mouth
      return 'M 41 51 Q 50 63 59 51 Z'
    }

    // Top-edge "Don't leave me" emotional curve 🥺
    if (sadness > 0.08) {
      const leftY = 53.5 + sadness * 2.8
      const midY = 59.5 - sadness * 9.2 // Moves upward above endpoints to form an adorable pout
      const rightY = 53.5 + sadness * 2.8
      return `M 43 ${leftY.toFixed(1)} Q 50 ${midY.toFixed(1)} 57 ${rightY.toFixed(1)}`
    }

    if (isHovered || proximity > 0.65) {
      // Cheerful wide grin
      return 'M 40 52 Q 50 63 60 52'
    }
    if (proximity > 0.25) {
      // Welcoming noticing smile
      return 'M 42 53 Q 50 61 58 53'
    }
    // Gentle contented idle smile
    return 'M 43 53.5 Q 50 59.5 57 53.5'
  }

  return (
    <div
      ref={mascotRef}
      onClick={handleMascotDirectClick}
      title="Buddy"
      className="relative inline-flex items-center justify-center select-none cursor-pointer group"
      style={{
        width: 'clamp(84px, 20vw, 120px)',
        height: 'clamp(84px, 20vw, 120px)',
        verticalAlign: 'middle',
      }}
    >
      {/* 1. Subtle Ground Glow / Ambient Shadow */}
      <motion.div
        animate={
          shouldReduceMotion
            ? { opacity: 0.25 }
            : {
                scale: isCelebrating ? [1, 0.82, 1.25, 1] : isHovered ? 1.15 : [1, 1.06, 1],
                opacity: isCelebrating ? [0.2, 0.1, 0.35, 0.25] : isHovered ? 0.35 : [0.2, 0.3, 0.2],
              }
        }
        transition={{
          scale: { duration: isCelebrating ? 0.45 : isHovered ? 0.25 : 3.4, repeat: isCelebrating || isHovered ? 0 : Infinity, ease: 'easeInOut' },
          opacity: { duration: isCelebrating ? 0.45 : isHovered ? 0.25 : 3.4, repeat: isCelebrating || isHovered ? 0 : Infinity, ease: 'easeInOut' },
        }}
        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4/5 h-2.5 bg-orange-950/20 rounded-full blur-xs pointer-events-none"
      />

      {/* 2. Celebratory Orange & Golden Spark Particles */}
      {isCelebrating && !shouldReduceMotion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          {[0, 60, 120, 180, 240, 300].map((deg, idx) => (
            <motion.div
              key={idx}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{
                x: Math.cos((deg * Math.PI) / 180) * 46,
                y: Math.sin((deg * Math.PI) / 180) * 46,
                scale: [0, 1.35, 0],
                opacity: [1, 0.95, 0],
              }}
              transition={{ duration: 0.42, delay: idx * 0.02, ease: 'easeOut' }}
              className="absolute w-2 h-2 rounded-full bg-gradient-to-tr from-[#F7931E] to-amber-300 shadow-xs"
            />
          ))}
        </div>
      )}

      {/* 3. Main Mascot Body with Idle Breathing + CTA Hover + Top-Edge Hesitation + Celebratory Hop */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : isCelebrating
            ? {
                y: [0, 3, -13, 1, 0], // Anticipation squash -> high bounce -> settle
                scale: [1, 0.94, 1.12, 0.98, 1],
                rotate: [headTilt, headTilt - 5, headTilt + 5, headTilt],
              }
            : isHovered
            ? {
                y: -4,
                scale: 1.06,
                rotate: headTilt * 1.2,
              }
            : sadness > 0.12
            ? {
                y: 2.2 * sadness, // Subtle hesitant drop when user might leave 🥺
                scaleX: 1 - 0.02 * sadness,
                scaleY: 1 - 0.01 * sadness,
                rotate: headTilt,
              }
            : {
                y: [0, -3.2, 0],
                scaleX: [1, 0.99, 1],
                scaleY: [1, 1.025, 1],
                rotate: headTilt,
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : isCelebrating
            ? { duration: 0.42, ease: 'easeOut' }
            : isHovered
            ? { type: 'spring', stiffness: 360, damping: 22 }
            : sadness > 0.12
            ? { type: 'spring', stiffness: 220, damping: 20 }
            : {
                y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
                scaleX: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
                scaleY: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
                rotate: { type: 'spring', stiffness: 220, damping: 20 },
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
              LAYER 2: CARRIED CAMPUS PRINT SLIP
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
                ? { duration: 0.42, ease: 'easeOut' }
                : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }
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
              transform: `translate(${eyeGaze.x * 0.35}px, ${eyeGaze.y * 0.35}px)`,
              transition: shouldReduceMotion ? 'none' : 'transform 0.08s ease-out',
            }}
          >
            {/* Rosy Cheeks */}
            <circle
              cx="34"
              cy="52"
              r="4.2"
              fill="#EA580C"
              opacity={0.35 + proximity * 0.25 - sadness * 0.1}
              style={{ transition: 'opacity 0.2s ease' }}
            />
            <circle
              cx="66"
              cy="52"
              r="4.2"
              fill="#EA580C"
              opacity={0.35 + proximity * 0.25 - sadness * 0.1}
              style={{ transition: 'opacity 0.2s ease' }}
            />

            {/* Cute Pleading Eyebrows (rendered when sadness > 0.08) 🥺 */}
            {sadness > 0.08 && !isCelebrating && (
              <g opacity={Math.min(1, sadness * 1.25)}>
                {/* Left eyebrow (inner corner raises up in gentle pleading curve) */}
                <path
                  d={`M 33 37 Q 37.5 ${35.5 - sadness * 2} 42 ${36 - sadness * 3.2}`}
                  stroke="#0F172A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Right eyebrow (inner corner raises up in gentle pleading curve) */}
                <path
                  d={`M 58 ${36 - sadness * 3.2} Q 62.5 ${35.5 - sadness * 2} 67 37`}
                  stroke="#0F172A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>
            )}

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
                {/* Gaze tracking highlights (strictly clamped inside eye socket) */}
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
                {/* Cute extra moist glint when looking up sadly 🥺 */}
                {sadness > 0.25 && (
                  <circle
                    cx={37.5 + eyeGaze.x * 0.6}
                    cy={41.6 + eyeGaze.y * 0.6}
                    r={Math.min(1.0, sadness * 1.0)}
                    fill="#FFFFFF"
                    opacity={Math.min(0.85, sadness * 0.9)}
                  />
                )}
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
                  {/* Cute extra moist glint when looking up sadly 🥺 */}
                  {sadness > 0.25 && (
                    <circle
                      cx={61.5 + eyeGaze.x * 0.6}
                      cy={41.6 + eyeGaze.y * 0.6}
                      r={Math.min(1.0, sadness * 1.0)}
                      fill="#FFFFFF"
                      opacity={Math.min(0.85, sadness * 0.9)}
                    />
                  )}
                </g>
              )}
            </motion.g>

            {/* MOUTH */}
            {isCelebrating ? (
              // Open cheerful celebration mouth with pink tongue
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
                style={{ transition: 'stroke-width 0.15s ease' }}
              />
            )}
          </g>
        </svg>
      </motion.div>
    </div>
  )
}
