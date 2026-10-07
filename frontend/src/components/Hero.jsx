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
      {/* Soft Orange Radial Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[650px] hero-glow-center rounded-full pointer-events-none z-0" />
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] hero-glow-accent rounded-full pointer-events-none z-0" />
      
      {/* Subtle Dot Grid Background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-40 pointer-events-none z-0" />

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto w-full relative z-10 my-auto text-center flex flex-col items-center">
        
        {/* Top Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-orange-200/80 bg-gradient-to-r from-orange-50 via-white to-amber-50 shadow-sm text-slate-800 text-xs font-semibold mb-6 group cursor-default"
        >
          <span className="w-2 h-2 rounded-full bg-[#F7931E] animate-pulse" />
          <span className="text-[#F7931E] font-bold">⚡ Digital Platform</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Smart Print Ordering for Campus Xerox Shops</span>
        </motion.div>

        {/* Hero Title with Interactive Living XBuddy Mascot + BlurText */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight leading-[1.16] sm:leading-[1.18] md:leading-[1.2] mb-3 inline-flex items-center justify-center gap-3 sm:gap-4 md:gap-5 flex-wrap overflow-visible">
          <XBuddyHeroMascot
            buttonRef={startBtnRef}
            isHovered={isBtnHovered}
            isCelebrating={isCelebrating}
          />
          <BlurText
            text="Buddy"
            delay={100}
            animateBy="words"
            direction="top"
            className="gradient-text-orange overflow-visible py-1.5 px-2 -my-1.5 -mx-2"
            as="span"
          />
        </h1>

        {/* Title Subhead with BlurText */}
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight mb-5">
          <BlurText
            text="Smart Digital Printing for Campus"
            delay={80}
            animateBy="words"
            direction="top"
            as="span"
          />
        </h2>

        {/* Subtitle Copy with BlurText */}
        <BlurText
          text="Upload your documents, pay digitally, track your order, and collect your prints from your campus Xerox shop."
          delay={35}
          animateBy="words"
          direction="top"
          className="text-slate-600 text-base sm:text-lg md:text-xl font-normal leading-relaxed mb-4 max-w-2xl mx-auto"
          as="p"
        />

        {/* Powered By Tag */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 mb-8"
        >
          <span>Powered by NextGen Labs</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#F7931E]" />
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex flex-wrap items-center justify-center gap-3.5 w-full sm:w-auto mb-14"
        >
          <motion.button
            ref={startBtnRef}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            onFocus={() => setIsBtnHovered(true)}
            onBlur={() => setIsBtnHovered(false)}
            onClick={handleStartPrinting}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white font-bold text-base glow-orange-button transition-all duration-200 flex items-center justify-center gap-2 group shadow-lg shadow-orange-500/20 cursor-pointer"
          >
            <span>Start Printing</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </motion.button>

          {onMyOrders && (
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onMyOrders}
              className="px-7 py-4 rounded-2xl bg-orange-50/70 hover:bg-orange-100/70 text-[#F7931E] font-bold text-base border border-orange-200 shadow-xs transition-all duration-200 flex items-center justify-center gap-2"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Track My Orders</span>
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onResumeBuilder}
            className="px-6 py-4 rounded-2xl bg-white hover:bg-orange-50/50 text-slate-800 font-bold text-base border border-orange-200/90 shadow-xs transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>Build Resume</span>
            <Sparkles className="w-4 h-4 text-[#F7931E]" />
          </motion.button>

          <motion.a
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.98 }}
            href="#academic-toolkit"
            className="px-6 py-4 rounded-2xl bg-white hover:bg-orange-50/50 text-slate-700 font-bold text-base border border-orange-200/90 shadow-xs transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>Academic Toolkit</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </motion.a>
        </motion.div>

        {/* Trust Statistics Section */}
        <TrustStats />
      </div>
    </section>
  )
}
