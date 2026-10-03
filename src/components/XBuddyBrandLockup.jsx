import React from 'react'

/**
 * XBuddyBrandLockup
 * 
 * High-fidelity vector rendition of the official XBuddy brand lockup:
 * - Running X mascot with yellow/golden front bar, dark navy back bar
 * - Big sparkling eyes, cute smile, rosy cheeks
 * - Running dark navy limbs, running shoes, speed trails
 * - Carried stack of campus print documents
 * - Bold 3D gradient orange "X"
 * - Heavy rounded dark navy "Buddy" typography
 * - 3 vibrant golden energy rays bursting over the "y"
 * - "Upload • Pay • Print" tagline
 */
export default function XBuddyBrandLockup({ className = 'h-10 sm:h-11' }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none shrink-0 ${className}`}>
      <svg
        viewBox="0 0 350 96"
        className="h-full w-auto overflow-visible filter drop-shadow-xs"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Mascot Golden Front Bar */}
          <linearGradient id="xbLockupMascotGold" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="30%" stopColor="#FFC107" />
            <stop offset="85%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#F57C00" />
          </linearGradient>

          {/* Mascot Navy Back Bar */}
          <linearGradient id="xbLockupMascotNavy" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#25355B" />
            <stop offset="50%" stopColor="#18233C" />
            <stop offset="100%" stopColor="#10182A" />
          </linearGradient>

          {/* Mascot Gold 3D Top Highlight */}
          <linearGradient id="xbLockupGloss" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Capital X Gradient */}
          <linearGradient id="xbLockupOrangeX" x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#FFA726" />
            <stop offset="40%" stopColor="#FF7043" />
            <stop offset="80%" stopColor="#F4511E" />
            <stop offset="100%" stopColor="#E64A19" />
          </linearGradient>

          {/* Paper Shadow */}
          <filter id="xbLockupPaperDrop" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#18233C" floodOpacity="0.18" />
          </filter>

          {/* Ground Shadow */}
          <radialGradient id="xbLockupShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#18233C" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#18233C" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ==============================================================
            SECTION 1: RUNNING MASCOT CHARACTER
            ============================================================== */}
        <g id="mascot-character" transform="translate(0, 0)">
          {/* 1.1 Ground Contact Shadow */}
          <ellipse cx="64" cy="85" rx="38" ry="4" fill="url(#xbLockupShadow)" />

          {/* 1.2 Speed Dash Trails (3 horizontal rounded bars) */}
          <rect x="6" y="47" width="18" height="4.5" rx="2.25" fill="#FFC107" opacity="0.85" />
          <rect x="1" y="55" width="26" height="5" rx="2.5" fill="#FFA000" opacity="0.9" />
          <rect x="7" y="63" width="16" height="4.5" rx="2.25" fill="#FF8F00" opacity="0.8" />

          {/* 1.3 Back Running Leg & Shoe (navy) */}
          <path
            d="M 50 63 Q 41 74 33 80"
            stroke="#18233C"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <ellipse cx="30" cy="81" rx="8" ry="4.5" fill="#18233C" transform="rotate(-10 30 81)" />

          {/* 1.4 Front Running Leg & Shoe (navy) */}
          <path
            d="M 68 62 Q 77 71 85 79"
            stroke="#18233C"
            strokeWidth="8.5"
            strokeLinecap="round"
          />
          <ellipse cx="88" cy="81" rx="9" ry="5" fill="#18233C" transform="rotate(18 88 81)" />

          {/* 1.5 Back Pill Bar (-40deg navy) */}
          <g transform="translate(62, 45) rotate(-38)">
            <rect
              x="-10"
              y="-34"
              width="20"
              height="68"
              rx="10"
              fill="url(#xbLockupMascotNavy)"
            />
            {/* Gloss rim */}
            <rect
              x="-8"
              y="-32"
              width="3.5"
              height="35"
              rx="1.75"
              fill="url(#xbLockupGloss)"
              opacity="0.35"
            />
          </g>

          {/* 1.6 Front Pill Bar (+45deg golden yellow) */}
          <g transform="translate(60, 46) rotate(46)">
            <rect
              x="-11"
              y="-36"
              width="22"
              height="72"
              rx="11"
              fill="url(#xbLockupMascotGold)"
            />
            {/* Gloss rim highlight */}
            <rect
              x="-9"
              y="-33"
              width="4.5"
              height="38"
              rx="2.25"
              fill="url(#xbLockupGloss)"
              opacity="0.75"
            />
          </g>

          {/* 1.7 Left Arm (swinging backward) */}
          <path
            d="M 45 49 Q 35 52 38 60"
            stroke="#18233C"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="38" cy="61" r="5" fill="#18233C" />

          {/* 1.8 Carried Stack of Printed Papers (tucked under right arm) */}
          <g id="carried-papers" filter="url(#xbLockupPaperDrop)">
            {/* Back Paper Sheet */}
            <g transform="translate(85, 41) rotate(22)">
              <rect x="-10" y="-13" width="20" height="27" rx="2.5" fill="#E2E8F0" />
            </g>
            {/* Front Paper Sheet */}
            <g transform="translate(82, 39) rotate(15)">
              <rect x="-10" y="-13" width="20" height="27" rx="2.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="0.8" />
              {/* Document text lines */}
              <line x1="-7" y1="-8" x2="6" y2="-8" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="-7" y1="-4" x2="4" y2="-4" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="-7" y1="0" x2="6" y2="0" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="-7" y1="4" x2="2" y2="4" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="-7" y1="8" x2="5" y2="8" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>

          {/* 1.9 Right Arm (holding the paper bundle) */}
          <path
            d="M 68 50 Q 82 54 84 62"
            stroke="#18233C"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          <circle cx="85" cy="63" r="5.2" fill="#18233C" />

          {/* 1.10 Mascot Face (Positioned on the yellow bar) */}
          <g id="mascot-face">
            {/* Rosy Cheeks */}
            <circle cx="56" cy="46" r="3" fill="#FF5722" opacity="0.5" />
            <circle cx="75" cy="42" r="3" fill="#FF5722" opacity="0.5" />

            {/* Left Eye */}
            <ellipse cx="60" cy="41" rx="3.5" ry="4.8" fill="#101828" />
            <circle cx="61.5" cy="39" r="1.6" fill="#FFFFFF" />
            <circle cx="59.2" cy="42.5" r="0.8" fill="#FFFFFF" opacity="0.8" />

            {/* Right Eye */}
            <ellipse cx="71" cy="38" rx="3.5" ry="4.8" fill="#101828" />
            <circle cx="72.5" cy="36" r="1.6" fill="#FFFFFF" />
            <circle cx="70.2" cy="39.5" r="0.8" fill="#FFFFFF" opacity="0.8" />

            {/* Cute Open Smiling Mouth with Tongue */}
            <path
              d="M 63.5 43.5 Q 67 51 71.5 42 Z"
              fill="#101828"
            />
            <path
              d="M 64.8 46.5 Q 67 50.5 70.2 45 Z"
              fill="#FF4081"
            />
          </g>
        </g>

        {/* ==============================================================
            SECTION 2: BOLD 3D ORANGE "X"
            ============================================================== */}
        <g id="orange-x" transform="translate(112, 17)">
          {/* Backslash Stroke (-45deg) */}
          <line
            x1="8"
            y1="8"
            x2="48"
            y2="48"
            stroke="url(#xbLockupOrangeX)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Slash Stroke (+45deg) */}
          <line
            x1="8"
            y1="48"
            x2="48"
            y2="8"
            stroke="url(#xbLockupOrangeX)"
            strokeWidth="14"
            strokeLinecap="round"
          />
        </g>

        {/* ==============================================================
            SECTION 3: NAVY "Buddy" WORDMARK
            Thick, friendly, rounded typography
            ============================================================== */}
        <g id="buddy-text" fill="#141E36" transform="translate(170, 0)">
          {/* Letter B */}
          <path
            d="M 2 20 C 2 17 4 15 7 15 L 20 15 C 27 15 31 18 31 23 C 31 26 29 28 26 29.5 C 30 31 33 34 33 39 C 33 46 27 50 19 50 L 7 50 C 4 50 2 48 2 45 Z M 12 23 L 12 29 L 19 29 C 22 29 24 27.5 24 25.5 C 24 23.5 22 23 19 23 Z M 12 36 L 12 43 L 20 43 C 23.5 43 25.5 41.5 25.5 39.5 C 25.5 37.5 23.5 36 20 36 Z"
          />

          {/* Letter u */}
          <path
            d="M 39 28 C 39 26 40.5 25 42.5 25 C 44.5 25 46 26 46 28 L 46 39 C 46 44 49 46 53 46 C 57 46 60 44 60 39 L 60 28 C 60 26 61.5 25 63.5 25 C 65.5 25 67 26 67 28 L 67 47 C 67 49 65.5 50 63.5 50 C 61.5 50 60 49 60 47.5 L 60 45 C 57.5 48.5 53.5 50.5 48.5 50.5 C 42 50.5 39 46.5 39 40 Z"
          />

          {/* Letter d (first) */}
          <path
            d="M 74 38 C 74 31 79 26 86 26 C 90 26 93 27.5 95 30 L 95 18 C 95 16 96.5 15 98.5 15 C 100.5 15 102 16 102 18 L 102 47 C 102 49 100.5 50 98.5 50 C 96.5 50 95 49 95 47.5 L 95 45 C 93 48.5 89.5 50.5 85.5 50.5 C 78.5 50.5 74 45.5 74 38 Z M 81 38.5 C 81 43 84 45.5 88 45.5 C 92 45.5 95 42.5 95 38.5 C 95 34 92 31 88 31 C 84 31 81 34 81 38.5 Z"
          />

          {/* Letter d (second) */}
          <path
            d="M 109 38 C 109 31 114 26 121 26 C 125 26 128 27.5 130 30 L 130 18 C 130 16 131.5 15 133.5 15 C 135.5 15 137 16 137 18 L 137 47 C 137 49 135.5 50 133.5 50 C 131.5 50 130 49 130 47.5 L 130 45 C 128 48.5 124.5 50.5 120.5 50.5 C 113.5 50.5 109 45.5 109 38 Z M 116 38.5 C 116 43 119 45.5 123 45.5 C 127 45.5 130 42.5 130 38.5 C 130 34 127 31 123 31 C 119 31 116 34 116 38.5 Z"
          />

          {/* Letter y */}
          <path
            d="M 144 28 C 144 26 145.5 25 147.5 25 C 149.5 25 150.5 26 151.5 28 L 157 41.5 L 162.5 28 C 163.5 26 164.5 25 166.5 25 C 168.5 25 170 26 170 28 L 162 47.5 L 160 52 C 157.5 57 154 60 148 60 C 146 60 144.5 59 144.5 57.5 C 144.5 56 145.5 55 147 55 C 150 55 152 53.5 153.5 50 L 154.5 47.5 Z"
          />

          {/* 3 Golden Sunburst Energy Rays radiating above the "y" */}
          <g id="sunburst-rays">
            {/* Left Ray */}
            <rect
              x="172"
              y="11"
              width="3.6"
              height="10"
              rx="1.8"
              fill="#FFB300"
              transform="rotate(-28 174 16)"
            />
            {/* Center Ray */}
            <rect
              x="183"
              y="6"
              width="3.6"
              height="10"
              rx="1.8"
              fill="#FFA000"
              transform="rotate(6 185 11)"
            />
            {/* Right Ray */}
            <rect
              x="193"
              y="12"
              width="3.6"
              height="10"
              rx="1.8"
              fill="#FF8F00"
              transform="rotate(38 195 17)"
            />
          </g>
        </g>

        {/* ==============================================================
            SECTION 4: TAGLINE "Upload  •  Pay  •  Print"
            ============================================================== */}
        <g id="tagline" transform="translate(130, 72)">
          <text
            x="76"
            y="0"
            fill="#5A6679"
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="2.8"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          >
            Upload
          </text>
          {/* Orange Dot 1 */}
          <circle cx="106" cy="-3.5" r="2.4" fill="#FF7043" />
          <text
            x="133"
            y="0"
            fill="#5A6679"
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="2.8"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          >
            Pay
          </text>
          {/* Orange Dot 2 */}
          <circle cx="157" cy="-3.5" r="2.4" fill="#FF7043" />
          <text
            x="184"
            y="0"
            fill="#5A6679"
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="2.8"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          >
            Print
          </text>
        </g>
      </svg>
    </div>
  )
}
