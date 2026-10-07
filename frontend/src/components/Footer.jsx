import React from 'react'
import { motion } from 'framer-motion'
import XBuddyLogo from './XBuddyLogo'

/**
 * Footer
 * 
 * Professional, premium startup-grade footer for XBuddy.
 * Reflects XBuddy's campus mission, creators, and NextGen Labs origin.
 */
export default function Footer({
  onStartPrinting,
  onMyOrders,
  onResumeBuilder,
  onShopStaff,
  onCampusAds,
}) {
  return (
    <footer className="border-t border-orange-100/80 bg-[#FFFDF9] text-slate-800 pt-16 pb-10 px-4 sm:px-6 relative overflow-hidden">
      {/* Soft Ambient Background Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-100/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-amber-100/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Main 4-Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-12">
          
          {/* ── SECTION 1: BRAND & ORIGIN (Spans 2 cols on lg) ── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.08, rotate: [0, -3, 3, 0] }}
                transition={{ duration: 0.3 }}
                className="cursor-pointer"
              >
                <XBuddyLogo className="w-10 h-10" />
              </motion.div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                  XBuddy
                </p>
                <p className="text-xs font-bold text-[#F7931E] mt-0.5">
                  Smart Digital Printing for Campus
                </p>
              </div>
            </div>

            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-sm">
              Digital printing and campus document tools designed to make student workflows faster, simpler, and more convenient.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50/80 border border-orange-200/70 text-slate-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#F7931E] shrink-0" />
              <span>Built for students at <strong>SRKR Engineering College</strong></span>
            </div>
          </div>

          {/* ── SECTION 2: PLATFORM ── */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              Platform
            </h4>
            <ul className="space-y-2.5 text-xs font-semibold text-slate-600">
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm inline-block"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#why-x-buddy"
                  className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm inline-block"
                >
                  Why X Buddy
                </a>
              </li>
              <li>
                <a
                  href="#perfect-for"
                  className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm inline-block"
                >
                  Who Is It For
                </a>
              </li>
              {onStartPrinting && (
                <li>
                  <button
                    type="button"
                    onClick={onStartPrinting}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    Start Printing
                  </button>
                </li>
              )}
              {onMyOrders && (
                <li>
                  <button
                    type="button"
                    onClick={onMyOrders}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    Track My Orders
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* ── SECTION 3: STUDENT TOOLS ── */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              Student Tools
            </h4>
            <ul className="space-y-2.5 text-xs font-semibold text-slate-600">
              <li>
                <a
                  href="#academic-toolkit"
                  className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm inline-block"
                >
                  Academic Toolkit
                </a>
              </li>
              {onResumeBuilder && (
                <li>
                  <button
                    type="button"
                    onClick={onResumeBuilder}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    Resume Builder
                  </button>
                </li>
              )}
              {onMyOrders && (
                <li>
                  <button
                    type="button"
                    onClick={onMyOrders}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    My Orders
                  </button>
                </li>
              )}
              {onStartPrinting && (
                <li>
                  <button
                    type="button"
                    onClick={onStartPrinting}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    Start Printing
                  </button>
                </li>
              )}
              {onShopStaff && (
                <li>
                  <button
                    type="button"
                    onClick={onShopStaff}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    Shop Staff Login
                  </button>
                </li>
              )}
              {onCampusAds && (
                <li>
                  <button
                    type="button"
                    onClick={onCampusAds}
                    className="hover:text-[#F7931E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm text-left cursor-pointer"
                  >
                    📢 Campus Ads Manager
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* ── SECTION 4: PROJECT & NEXTGEN LABS ── */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              Project
            </h4>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                A project by <strong className="text-slate-900 font-bold">NextGen Labs</strong>
              </p>

              <a
                href="https://nextgenfounders.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 hover:from-[#F7931E] hover:to-[#FF6B00] text-[#F7931E] hover:text-white border border-orange-200 hover:border-transparent font-bold text-xs transition-all duration-200 shadow-2xs hover:shadow-md hover:shadow-orange-500/20 group cursor-pointer"
                aria-label="Visit NextGen Labs (opens in a new tab)"
              >
                <span>Visit NextGen Labs</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            </div>
          </div>
        </div>

        {/* ── DEDICATED CREATOR & INNOVATION CREDIT AREA ── */}
        <div className="pt-8 pb-6 border-t border-orange-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-orange-50/30 rounded-2xl p-6 sm:p-7 border border-orange-100/80">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#F7931E] mb-1">
              Designed &amp; Developed by
            </p>
            <p className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Lokesh Thanala <span className="text-slate-400 font-semibold">&amp;</span> Jagadeesh Illa
            </p>
            <p className="text-xs font-medium text-slate-600 mt-1 max-w-xl">
              Built as a campus-focused digital printing project at SRKR Engineering College.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <div className="text-left md:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Innovation Partner</p>
              <p className="text-xs font-extrabold text-slate-800">NextGen Labs</p>
            </div>
            <a
              href="https://nextgenfounders.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-white hover:bg-orange-50 border border-orange-200 text-[#F7931E] shadow-2xs hover:shadow-sm transition-all"
              title="Visit NextGen Labs"
              aria-label="Visit NextGen Labs"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </div>

        {/* ── BOTTOM COPYRIGHT BAR ── */}
        <div className="mt-8 pt-6 border-t border-orange-100/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 text-center sm:text-left">
          <p>© {new Date().getFullYear()} XBuddy · SRKR Engineering College. All Rights Reserved.</p>
          <p className="font-semibold text-slate-600">
            Made for students. Built at SRKR.
          </p>
        </div>
      </div>
    </footer>
  )
}
