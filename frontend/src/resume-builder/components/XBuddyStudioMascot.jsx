import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Briefcase, Smile } from 'lucide-react'

/**
 * XBuddyStudioMascot
 * 
 * Subtle, premium mascot micro-interaction for the XBuddy Resume Studio.
 * Features an idle floating bob, occasional eye-blink, and subtle state reaction
 * to resume completeness.
 */
export default function XBuddyStudioMascot({ completeness = 0, size = 38, showBubble = false }) {
  const isHighComplete = completeness >= 80
  const isMidComplete = completeness >= 40 && completeness < 80

  const statusText = isHighComplete
    ? 'Resume ready for print!'
    : isMidComplete
    ? 'Looking sharp! Keep going.'
    : "Let's build a standout resume!"

  return (
    <div className="flex items-center gap-2 select-none">
      <motion.div
        animate={{
          y: [0, -2.5, 0],
          rotate: isHighComplete ? [0, 2, -2, 0] : 0,
        }}
        transition={{
          y: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' },
          rotate: { repeat: Infinity, duration: 4, ease: 'easeInOut' },
        }}
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible drop-shadow-xs"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="xbStudioSlashGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="45%" stopColor="#F7931E" />
              <stop offset="100%" stopColor="#FFA439" />
            </linearGradient>

            <linearGradient id="xbStudioBackslashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFBA3B" />
              <stop offset="55%" stopColor="#F7931E" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>

            <linearGradient id="xbStudioGlossGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* BACKSLASH PILL */}
          <g transform="rotate(-45 50 50)">
            <rect x="39" y="12" width="22" height="76" rx="11" fill="url(#xbStudioBackslashGrad)" />
            <rect x="41" y="14" width="3.2" height="38" rx="1.6" fill="url(#xbStudioGlossGrad)" opacity="0.7" />
          </g>

          {/* SLASH PILL */}
          <g transform="rotate(45 50 50)">
            <rect x="39" y="12" width="22" height="76" rx="11" fill="url(#xbStudioSlashGrad)" />
            <rect x="41" y="14" width="3.2" height="38" rx="1.6" fill="url(#xbStudioGlossGrad)" opacity="0.7" />
          </g>

          {/* EYES with micro-blink */}
          <g className="animate-blink">
            <ellipse cx="44" cy="46" rx="3.2" ry="4.2" fill="#0F172A" />
            <circle cx="43" cy="44.5" r="1.3" fill="#FFFFFF" />

            <ellipse cx="56" cy="46" rx="3.2" ry="4.2" fill="#0F172A" />
            <circle cx="55" cy="44.5" r="1.3" fill="#FFFFFF" />
          </g>

          {/* CHEEKS */}
          <circle cx="40" cy="51" r="2.2" fill="#FF4757" opacity="0.45" />
          <circle cx="60" cy="51" r="2.2" fill="#FF4757" opacity="0.45" />

          {/* CUTE SMILE */}
          <path
            d={isHighComplete ? "M45 51 Q50 56 55 51" : "M46 51 Q50 54 54 51"}
            stroke="#0F172A"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />

          {/* A4 PRINT SHEET IN HAND */}
          <g transform="translate(62, 48) rotate(12)">
            <rect x="0" y="0" width="13" height="17" rx="1.5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.2" />
            <line x1="2.5" y1="4" x2="10.5" y2="4" stroke="#F7931E" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="2.5" y1="7" x2="10.5" y2="7" stroke="#CBD5E1" strokeWidth="1" strokeLinecap="round" />
            <line x1="2.5" y1="10" x2="8.5" y2="10" stroke="#CBD5E1" strokeWidth="1" strokeLinecap="round" />
          </g>

          {/* CELEBRATION SPARKLE WHEN HIGH */}
          {isHighComplete && (
            <motion.g
              initial={{ scale: 0.8, opacity: 0.7 }}
              animate={{ scale: [0.8, 1.15, 0.8], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
            >
              <polygon points="28,24 30,29 35,31 30,33 28,38 26,33 21,31 26,29" fill="#FBBF24" />
            </motion.g>
          )}
        </svg>
      </motion.div>

      {showBubble && (
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-orange-50/80 border border-orange-200/70 rounded-full px-2.5 py-0.5">
          {isHighComplete ? (
            <Sparkles className="w-3 h-3 text-amber-500" />
          ) : isMidComplete ? (
            <Briefcase className="w-3 h-3 text-orange-500" />
          ) : (
            <Smile className="w-3 h-3 text-orange-500" />
          )}
          <span>{statusText}</span>
        </div>
      )}
    </div>
  )
}
