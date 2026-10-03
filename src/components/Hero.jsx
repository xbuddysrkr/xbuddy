import React, { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import TrustStats from './TrustStats'
import BlurText from './BlurText'
import XBuddyHeroMascot from './XBuddyHeroMascot'
import { ArrowRight, Sparkles, FileText, ClipboardList } from 'lucide-react'

export default function Hero({ onGetStarted, onResumeBuilder, onMyOrders }) {
  const startBtnRef = useRef(null)
  const [isBtnHovered, setIsBtnHovered] = useState(false)
  const [isCelebrating, setIsCelebrating] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const handleStartPrinting = () => {
    if (isCelebrating) return

    if (shouldReduceMotion) {
      onGetStarted?.()
      return
    }

    setIsCelebrating(true)
    setTimeout(() => {
      onGetStarted?.()
    }, 320)
  }

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-between pt-12 pb-16 px-4 overflow-hidden bg-white">
      {/* Soft Orange Radial Glows with very slow opacity breathing */}
      <motion.div
        animate={shouldReduceMotion ? {} : { opacity: [0.75, 1, 0.75], scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[650px] hero-glow-center rounded-full pointer-events-none z-0"
      />
      <motion.div
        animate={shouldReduceMotion ? {} : { opacity: [0.7, 0.95, 0.7], scale: [1.02, 0.98, 1.02] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/4 right-1/4 w-[500px] h-[500px] hero-glow-accent rounded-full pointer-events-none z-0"
      />
      
      {/* Subtle Dot Grid Background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-40 pointer-events-none z-0" />

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto w-full relative z-10 my-auto text-center flex flex-col items-center">
        
        {/* Top Badge */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-orange-200/80 bg-gradient-to-r from-orange-50 via-white to-amber-50 shadow-sm text-slate-800 text-xs font-semibold mb-6 group cursor-default"
        >
          <span className="w-2 h-2 rounded-full bg-[#F7931E] animate-pulse" />
          <span className="text-[#F7931E] font-bold">⚡ Digital Platform</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Smart Print Ordering for Campus Xerox Shops</span>
        </motion.div>

        {/* Hero Title: Mascot (0-450ms) + "Buddy" (200-650ms) */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight leading-[1.08] mb-3 inline-flex items-center justify-center gap-3 sm:gap-4 md:gap-5 flex-wrap">
          <XBuddyHeroMascot
            buttonRef={startBtnRef}
            isHovered={isBtnHovered}
            isCelebrating={isCelebrating}
          />
          <motion.span
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="gradient-text-orange"
          >
            Buddy
          </motion.span>
        </h1>

        {/* Title Subhead (300-750ms) */}
        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight mb-5"
        >
          Smart Digital Printing for Campus
        </motion.h2>

        {/* Subtitle Copy (450-900ms) */}
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-slate-600 text-base sm:text-lg md:text-xl font-normal leading-relaxed mb-4 max-w-2xl mx-auto"
        >
          Upload your documents, pay digitally, track your order, and collect your prints from your campus Xerox shop.
        </motion.p>

        {/* Powered By Tag (550ms) */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 mb-8"
        >
          <span>Powered by NextGen Labs</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#F7931E]" />
        </motion.div>

        {/* CTA Buttons: Staggered entrance (600-1000ms) with micro-interactions */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 w-full sm:w-auto mb-14">
          {/* 1. Start Printing CTA */}
          <motion.button
            ref={startBtnRef}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            whileHover={shouldReduceMotion ? {} : {
              y: -2.5,
              scale: 1.015,
              boxShadow: '0 12px 28px -6px rgba(247, 147, 30, 0.35)',
            }}
            whileTap={{ scale: 0.98, y: 0 }}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            onFocus={() => setIsBtnHovered(true)}
            onBlur={() => setIsBtnHovered(false)}
            onClick={handleStartPrinting}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white font-bold text-base glow-orange-button transition-all duration-200 flex items-center justify-center gap-2 group shadow-lg shadow-orange-500/20 cursor-pointer"
          >
            <span>Start Printing</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1.5" />
          </motion.button>

          {/* 2. Track My Orders CTA (Clipboard icon wiggle on hover) */}
          {onMyOrders && (
            <motion.button
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              whileHover={shouldReduceMotion ? {} : { scale: 1.015, y: -2 }}
              whileTap={{ scale: 0.98, y: 0 }}
              onClick={onMyOrders}
              className="px-7 py-4 rounded-2xl bg-orange-50/70 hover:bg-orange-100/70 text-[#F7931E] font-bold text-base border border-orange-200 shadow-xs transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
            >
              <motion.span
                variants={shouldReduceMotion ? {} : { hover: { rotate: [0, -10, 10, -5, 3, 0] } }}
                transition={{ duration: 0.45 }}
                className="inline-flex"
              >
                <ClipboardList className="w-4 h-4" />
              </motion.span>
              <span>Track My Orders</span>
            </motion.button>
          )}

          {/* 3. Build Resume CTA (Sparkle icon twinkle on hover) */}
          <motion.button
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            whileHover={shouldReduceMotion ? {} : { scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.98, y: 0 }}
            onClick={onResumeBuilder}
            className="px-6 py-4 rounded-2xl bg-white hover:bg-orange-50/50 text-slate-800 font-bold text-base border border-orange-200/90 shadow-xs transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Build Resume</span>
            <motion.span
              variants={shouldReduceMotion ? {} : { hover: { scale: [1, 1.25, 0.92, 1.15, 1], rotate: [0, 14, -14, 0] } }}
              transition={{ duration: 0.45 }}
              className="inline-flex"
            >
              <Sparkles className="w-4 h-4 text-[#F7931E]" />
            </motion.span>
          </motion.button>

          {/* 4. Academic Toolkit CTA (Document icon tilt on hover) */}
          <motion.a
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
            whileHover={shouldReduceMotion ? {} : { scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.98, y: 0 }}
            href="#academic-toolkit"
            className="px-6 py-4 rounded-2xl bg-white hover:bg-orange-50/50 text-slate-700 font-bold text-base border border-orange-200/90 shadow-xs transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Academic Toolkit</span>
            <motion.span
              variants={shouldReduceMotion ? {} : { hover: { rotate: [0, -10, 2, 0] } }}
              transition={{ duration: 0.35 }}
              className="inline-flex"
            >
              <FileText className="w-4 h-4 text-slate-400 group-hover:text-[#F7931E] transition-colors" />
            </motion.span>
          </motion.a>
        </div>

        {/* Trust Statistics Section */}
        <TrustStats />
      </div>
    </section>
  )
}
