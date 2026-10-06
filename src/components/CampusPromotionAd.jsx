import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  getActiveCampusAd,
  resolveMediaUrl,
  isValidAdUrl,
  recordAdImpression,
  recordAdClick,
} from '../utils/campusAds'
import { fetchCampusAds } from '../utils/api'

/**
 * CampusPromotionAd
 * 
 * Elegant, native campus promotion card rendered on the final order waiting / status screen.
 * Displays approved student club promotions, hackathons, and campus updates.
 * 
 * Features:
 * - Fetches approved active promotions from Google Apps Script / Google Sheets backend
 * - Strictly validates approval status (status === "approved") and active date range
 * - Respects priority ordering (priority 1 appears before priority 2)
 * - Supports responsive Image (JPG, PNG, WEBP) and Video (MP4, WebM) media
 * - Isolated from order status polling & payment flow (errors will NEVER break printing)
 * - Safe external link navigation (target="_blank" rel="noopener noreferrer")
 * - Completely hides (returns null) when no approved active advertisement exists
 */
export default function CampusPromotionAd({ placement = 'order-status', customAd = null }) {
  const [ad, setAd] = useState(() => {
    if (customAd) return customAd
    // Initial sync load from verified catalog
    return getActiveCampusAd(placement)
  })

  // Synchronize when customAd changes (live preview form updates)
  useEffect(() => {
    if (customAd) {
      setAd(customAd)
    }
  }, [customAd])

  // Fetch live ads from Google Apps Script / Google Sheets backend
  useEffect(() => {
    let isMounted = true

    async function loadLiveAds() {
      if (customAd) return
      try {
        const liveAds = await fetchCampusAds(placement)
        if (!isMounted) return

        if (Array.isArray(liveAds) && liveAds.length > 0) {
          const topActiveAd = getActiveCampusAd(placement, liveAds)
          if (topActiveAd) {
            setAd(topActiveAd)
          }
        }
      } catch (err) {
        // Non-blocking: retain existing verified ad or fall back cleanly
        if (import.meta.env.DEV) {
          console.warn('[Campus Ads] Backend fetch notice:', err?.message || err)
        }
      }
    }

    loadLiveAds()

    return () => {
      isMounted = false
    }
  }, [placement, customAd])

  const activeAd = customAd || ad

  // Record impression once when ad is rendered
  useEffect(() => {
    if (!customAd && activeAd?.adId) {
      recordAdImpression(activeAd.adId, placement)
    }
  }, [customAd, activeAd?.adId, placement])

  // If no active approved ad is available, render nothing (no empty card or broken layout)
  if (!activeAd) return null

  const resolvedMedia = resolveMediaUrl(activeAd)
  const hasValidLink = isValidAdUrl(activeAd.clickUrl)

  const handleActionClick = (e) => {
    if (!hasValidLink) {
      e.preventDefault()
      return
    }
    recordAdClick(ad.adId, placement)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="my-5 p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-[#FFFDF9] via-white to-[#FFF9F3] border border-orange-200/90 shadow-xs relative overflow-hidden"
    >
      {/* Decorative Top Brand Accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 via-[#F78C25] to-amber-400" />

      {/* Top Bar: Badge & Club Name */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/80 border border-orange-200 text-orange-900 text-[10px] sm:text-[11px] font-black tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F78C25] animate-pulse" />
          <span>{activeAd.badgeText || 'CAMPUS PROMOTION'}</span>
        </div>

        {activeAd.clubName && (
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate max-w-[180px] sm:max-w-xs text-right">
            {activeAd.clubName}
          </span>
        )}
      </div>

      {/* Media: Image or Video */}
      {resolvedMedia && (
        <div className="mb-3.5 rounded-2xl overflow-hidden bg-slate-900/5 border border-orange-100/80 flex items-center justify-center relative">
          {activeAd.mediaType === 'video' ? (
            <video
              src={resolvedMedia}
              poster={activeAd.posterUrl || undefined}
              muted
              playsInline
              controls
              preload="metadata"
              className="w-full max-h-56 sm:max-h-64 object-contain rounded-2xl bg-black"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <img
              src={resolvedMedia}
              alt={activeAd.title || 'Campus Promotion'}
              loading="lazy"
              className="w-full max-h-52 sm:max-h-60 object-cover sm:object-contain rounded-2xl transition-transform hover:scale-[1.01] duration-300"
              onError={(e) => {
                // If media fails to load, gracefully hide the media container
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
        </div>
      )}

      {/* Title & Description (rendered strictly as plain text for security) */}
      <div className="space-y-1 mb-3.5">
        <h4 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
          {activeAd.title}
        </h4>
        {activeAd.description && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
            {activeAd.description}
          </p>
        )}
      </div>

      {/* Action CTA Button */}
      {hasValidLink && (
        <div className="flex items-center justify-end pt-1">
          <a
            href={activeAd.clickUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleActionClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white text-xs font-bold shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <span>{activeAd.buttonText || 'View Details'}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-3.5 h-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      )}
    </motion.div>
  )
}
