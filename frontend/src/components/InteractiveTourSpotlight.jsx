import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowLeft, X, Sparkles, Check, Compass } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * InteractiveTourSpotlight
 * 
 * Contextual guided tour engine that highlights real UI elements with an animated
 * spotlight cutout, glowing pulsing border, dimmed backdrop, and game-like floating tooltip.
 */
export default function InteractiveTourSpotlight({
  isOpen,
  stepIndex = 0,
  totalSteps = 1,
  stepData = null,
  onNext,
  onBack,
  onSkip,
  onFinish,
  onMissingTarget,
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [targetRect, setTargetRect] = useState(null)
  const [isSearching, setIsSearching] = useState(true)
  const tooltipRef = useRef(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 180 })

  const isLastStep = stepIndex >= totalSteps - 1
  const canGoBack = stepIndex > 0

  // 1. Target element location and bounding box tracker
  const updateTargetRect = useCallback(() => {
    if (!isOpen || !stepData?.targetSelector) {
      setTargetRect(null)
      return
    }

    const el = document.querySelector(stepData.targetSelector)
    if (el) {
      const rect = el.getBoundingClientRect()
      // Only set if visible / has dimensions
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        })
        setIsSearching(false)
        return true
      }
    }
    return false
  }, [isOpen, stepData?.targetSelector])

  // 2. Poll for target if element is mounting during navigation
  useEffect(() => {
    if (!isOpen || !stepData?.targetSelector) return

    setIsSearching(true)
    let attempts = 0
    const maxAttempts = 12

    const foundImmediately = updateTargetRect()
    if (foundImmediately) {
      // Ensure target is in view smoothly
      const el = document.querySelector(stepData.targetSelector)
      if (el) {
        const rect = el.getBoundingClientRect()
        const isOutOfView = rect.top < 70 || rect.bottom > window.innerHeight - 30
        if (isOutOfView) {
          el.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'center' })
        }
      }
      return
    }

    const timer = setInterval(() => {
      attempts++
      const found = updateTargetRect()
      if (found) {
        clearInterval(timer)
        const el = document.querySelector(stepData.targetSelector)
        if (el) {
          el.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'center' })
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(timer)
        setIsSearching(false)
        // If target is missing or hidden, invoke fallback safe handler
        if (onMissingTarget) {
          onMissingTarget(stepIndex)
        }
      }
    }, 80)

    return () => clearInterval(timer)
  }, [isOpen, stepIndex, stepData?.targetSelector, updateTargetRect, shouldReduceMotion, onMissingTarget])

  // 3. Keep target coordinates responsive on scroll and resize
  useEffect(() => {
    if (!isOpen) return

    function handleUpdate() {
      updateTargetRect()
    }

    window.addEventListener('resize', handleUpdate, { passive: true })
    window.addEventListener('scroll', handleUpdate, { passive: true })

    return () => {
      window.removeEventListener('resize', handleUpdate)
      window.removeEventListener('scroll', handleUpdate)
    }
  }, [isOpen, updateTargetRect])

  // 4. Measure floating tooltip dimensions
  useEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setTooltipSize({ width: rect.width, height: rect.height })
      }
    }
  }, [stepIndex, stepData?.title, stepData?.description])

  // 5. Accessible Keyboard Navigation
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSkip?.()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        // Prevent default only if active element is not an interactive input
        const tag = document.activeElement?.tagName?.toLowerCase()
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault()
          if (isLastStep) {
            onFinish?.()
          } else {
            onNext?.()
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (canGoBack) {
          e.preventDefault()
          onBack?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLastStep, canGoBack, onNext, onBack, onSkip, onFinish])

  if (!isOpen || !stepData) return null

  // 6. Geometry calculations for spotlight padding & shape
  const pad = stepData.padding ?? 10
  const spotlightX = targetRect ? Math.max(0, targetRect.left - pad) : 0
  const spotlightY = targetRect ? Math.max(0, targetRect.top - pad) : 0
  const spotlightWidth = targetRect ? targetRect.width + pad * 2 : 0
  const spotlightHeight = targetRect ? targetRect.height + pad * 2 : 0

  let spotlightRadius = 16
  if (stepData.pulseShape === 'circle') {
    spotlightRadius = Math.max(spotlightWidth, spotlightHeight) / 2
  } else if (stepData.pulseShape === 'pill') {
    spotlightRadius = Math.min(spotlightWidth, spotlightHeight) / 2
  } else if (typeof stepData.radius === 'number') {
    spotlightRadius = stepData.radius
  }

  // 7. Tooltip placement with collision avoidance
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768

  let tooltipTop = 0
  let tooltipLeft = 16
  let placement = 'bottom'

  if (targetRect) {
    const spaceBelow = viewportHeight - (spotlightY + spotlightHeight)
    const spaceAbove = spotlightY

    if (spaceBelow >= tooltipSize.height + 24 || spaceBelow >= spaceAbove) {
      // Place below target
      placement = 'bottom'
      tooltipTop = spotlightY + spotlightHeight + 14
    } else {
      // Place above target
      placement = 'top'
      tooltipTop = Math.max(16, spotlightY - tooltipSize.height - 14)
    }

    // Horizontal centering relative to spotlight
    const targetCenterX = spotlightX + spotlightWidth / 2
    tooltipLeft = targetCenterX - tooltipSize.width / 2

    // Viewport edge clamping
    const minMargin = 16
    const maxLeft = viewportWidth - tooltipSize.width - minMargin
    tooltipLeft = Math.max(minMargin, Math.min(maxLeft, tooltipLeft))
  } else {
    // Fallback centered position if target rect is loading
    tooltipTop = viewportHeight / 2 - 100
    tooltipLeft = Math.max(16, viewportWidth / 2 - 160)
  }

  const stepIndicatorText = t('tour.stepIndicator', {
    current: stepIndex + 1,
    total: totalSteps,
  })

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] pointer-events-none select-none"
        role="dialog"
        aria-modal="true"
        aria-label={stepData.title}
      >
        {/* Full-screen SVG Dark Backdrop with Smooth Spotlight Mask Hole */}
        <svg
          className="w-full h-full absolute inset-0 pointer-events-auto"
          aria-hidden="true"
        >
          <defs>
            <mask id="xbuddy-tour-spotlight-mask">
              {/* White background: fully masks/dims screen */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {/* Black cutout: completely clears the mask hole to reveal the real element */}
              {targetRect && (
                <motion.rect
                  initial={false}
                  animate={{
                    x: spotlightX,
                    y: spotlightY,
                    width: spotlightWidth,
                    height: spotlightHeight,
                    rx: spotlightRadius,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 28,
                  }}
                  fill="black"
                />
              )}
            </mask>
          </defs>

          {/* Translucent Dimmed Canvas */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(15, 23, 42, 0.72)"
            mask="url(#xbuddy-tour-spotlight-mask)"
            className="transition-colors duration-300"
          />

          {/* Glowing Animated Ring around Highlighted Element */}
          {targetRect && (
            <motion.rect
              initial={false}
              animate={{
                x: spotlightX - 3,
                y: spotlightY - 3,
                width: spotlightWidth + 6,
                height: spotlightHeight + 6,
                rx: spotlightRadius + 3,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 28,
              }}
              fill="none"
              stroke="#F7931E"
              strokeWidth="2.5"
              strokeDasharray={shouldReduceMotion ? 'none' : '7 4'}
              className={shouldReduceMotion ? '' : 'animate-pulse'}
              style={{
                filter: 'drop-shadow(0 0 10px rgba(247, 147, 30, 0.7))',
              }}
            />
          )}
        </svg>

        {/* Floating Game-Style Tooltip Card */}
        <motion.div
          ref={tooltipRef}
          key={`tour-tooltip-${stepIndex}`}
          initial={{ opacity: 0, y: placement === 'bottom' ? 8 : -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: `${tooltipTop}px`,
            left: `${tooltipLeft}px`,
          }}
          className="w-[calc(100vw-32px)] max-w-[340px] sm:max-w-[360px] bg-white rounded-3xl p-4 sm:p-5 shadow-2xl border-2 border-orange-200/90 pointer-events-auto text-slate-900 z-50 flex flex-col justify-between"
        >
          {/* Top Row: Game Badge + Close Button */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-100 via-orange-50 to-amber-100 border border-purple-200/80 text-[#5f259f] font-black text-[10px] tracking-wider uppercase shadow-2xs">
              <Sparkles className="w-3 h-3 text-[#F7931E] shrink-0" />
              <span>{stepIndicatorText}</span>
            </div>

            <button
              type="button"
              onClick={onSkip}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-orange-50 transition-colors cursor-pointer"
              aria-label={t('tour.skip', 'Skip')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Heading & Explanatory Sentence */}
          <div className="mb-4">
            <div className="flex items-center gap-2 sm:gap-2.5">
              {stepData.mascot && (
                <motion.div
                  initial={shouldReduceMotion ? false : { scale: 0.8, y: 3, opacity: 0 }}
                  animate={
                    shouldReduceMotion
                      ? { opacity: 1, scale: 1, y: 0 }
                      : {
                          opacity: 1,
                          scale: 1,
                          y: [0, -3.5, 0],
                          rotate: [0, 1.8, -1.8, 0],
                        }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.1 }
                      : {
                          opacity: { duration: 0.22 },
                          scale: { type: 'spring', stiffness: 360, damping: 20 },
                          y: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                          rotate: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' },
                        }
                  }
                  className="shrink-0 relative select-none flex items-center justify-center pointer-events-none"
                  aria-hidden="true"
                >
                  <img
                    src={stepData.mascot}
                    alt={t('common.mascot', 'XBuddy Mascot')}
                    className="w-8 h-6 sm:w-10 sm:h-7.5 object-contain filter drop-shadow-xs"
                    draggable={false}
                  />
                </motion.div>
              )}
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug">
                {stepData.mascot ? (stepData.title || '').replace(/\s*🎉\s*$/, '').trim() : stepData.title}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mt-1.5">
              {stepData.description}
            </p>
          </div>

          {/* Bottom Action Controls: Skip / Back / Next / Finish */}
          <div className="flex items-center justify-between pt-2 border-t border-orange-100/90 gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-700 font-bold px-2 py-1.5 transition-colors cursor-pointer"
            >
              {t('tour.skip', 'Skip')}
            </button>

            <div className="flex items-center gap-2">
              {canGoBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('tour.back', 'Back')}</span>
                </button>
              )}

              {isLastStep ? (
                <button
                  type="button"
                  onClick={onFinish}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-extrabold shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <span>{t('tour.finish', 'Finish 🎉')}</span>
                  <Check className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onNext}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#e07010] hover:to-[#e05800] text-white text-xs font-extrabold shadow-md shadow-orange-500/25 transition-all flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <span>{t('tour.next', 'Next →')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
