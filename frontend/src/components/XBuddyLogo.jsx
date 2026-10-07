import React from 'react'

/**
 * XBuddyLogo
 * 
 * Authentic X Buddy Mascot Logo component.
 * Displays the signature crossed-pill character with brand gradients,
 * gloss reflections, cute face, and campus print sheet.
 */
export default function XBuddyLogo({ className = 'w-9 h-9' }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full overflow-visible filter drop-shadow-sm"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Slash Pill Gradient (+45deg diagonal) */}
          <linearGradient id="xbLogoSlashGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EA580C" />
            <stop offset="45%" stopColor="#F7931E" />
            <stop offset="100%" stopColor="#FFA439" />
          </linearGradient>

          {/* Backslash Pill Gradient (-45deg diagonal) */}
          <linearGradient id="xbLogoBackslashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFBA3B" />
            <stop offset="55%" stopColor="#F7931E" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* 3D Gloss Highlight */}
          <linearGradient id="xbLogoGlossGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* LAYER 1: BACKSLASH PILL (-45deg) */}
        <g transform="rotate(-45 50 50)">
          <rect
            x="39"
            y="11"
            width="22"
            height="78"
            rx="11"
            fill="url(#xbLogoBackslashGrad)"
          />
          <rect
            x="41"
            y="13"
            width="3.2"
            height="40"
            rx="1.6"
            fill="url(#xbLogoGlossGrad)"
            opacity="0.7"
          />
        </g>

        {/* LAYER 2: CARRIED CAMPUS PRINT SLIP */}
        <g transform="translate(69, 44) rotate(12)">
          <rect
            x="-7"
            y="-9"
            width="14"
            height="19"
            rx="2"
            fill="#FFFFFF"
            stroke="#CBD5E1"
            strokeWidth="0.9"
          />
          <rect x="-5" y="-7" width="6" height="2" rx="0.75" fill="#F7931E" />
          <line x1="-5" y1="-2" x2="4.5" y2="-2" stroke="#94A3B8" strokeWidth="0.9" strokeLinecap="round" />
          <line x1="-5" y1="1.8" x2="2.5" y2="1.8" stroke="#CBD5E1" strokeWidth="0.9" strokeLinecap="round" />
          <line x1="-5" y1="5.5" x2="4" y2="5.5" stroke="#CBD5E1" strokeWidth="0.9" strokeLinecap="round" />
        </g>

        {/* LAYER 3: SLASH PILL (+45deg) */}
        <g transform="rotate(45 50 50)">
          <rect
            x="39"
            y="11"
            width="22"
            height="78"
            rx="11"
            fill="url(#xbLogoSlashGrad)"
          />
          <rect
            x="41"
            y="13"
            width="3.2"
            height="40"
            rx="1.6"
            fill="url(#xbLogoGlossGrad)"
            opacity="0.8"
          />
        </g>

        {/* LAYER 4: ADORABLE MASCOT FACE */}
        <g>
          {/* Rosy Cheeks */}
          <circle cx="34" cy="52" r="4.2" fill="#EA580C" opacity="0.45" />
          <circle cx="66" cy="52" r="4.2" fill="#EA580C" opacity="0.45" />

          {/* Left Eye */}
          <ellipse cx="38" cy="44" rx="5.8" ry="6.2" fill="#0F172A" />
          <circle cx="39.8" cy="42.5" r="2.2" fill="#FFFFFF" />
          <circle cx="37" cy="45.8" r="1.1" fill="#FFFFFF" opacity="0.9" />

          {/* Right Eye */}
          <ellipse cx="62" cy="44" rx="5.8" ry="6.2" fill="#0F172A" />
          <circle cx="63.8" cy="42.5" r="2.2" fill="#FFFFFF" />
          <circle cx="61" cy="45.8" r="1.1" fill="#FFFFFF" opacity="0.9" />

          {/* Cute Smile */}
          <path
            d="M 43 53 Q 50 60 57 53"
            stroke="#0F172A"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
    </div>
  )
}
