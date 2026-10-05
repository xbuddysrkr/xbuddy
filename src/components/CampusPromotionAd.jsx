import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  getActiveCampusAd,
  isValidAdUrl,
  recordAdImpression,
  recordAdClick,
} from '../utils/campusAds'

/**
 * CampusPromotionAd
 * 
 * Elegant, native campus advertisement card rendered on the final order status screen.
 * Displays approved student club promotions, hackathons, and campus updates.
 * - Supports responsive Image and Video ads
 * - Strictly validates approval status and schedule dates
 * - Hides completely if no active approved promotion is available
 * - Safe external link handling (does not interrupt print workflow)
 */
export default function CampusPromotionAd({ placement = 'order-status', customAd = null }) {
  const [ad, setAd] = useState(() => {
    if (customAd) return customAd
    return getActiveCampusAd(placement)
  })

  // Record impression once when ad is displayed
  useEffect(() => {
    if (ad?.adId) {
      recordAdImpression(ad.adId, placement)
    }
  }, [ad?.adId, placement])

  // Fallback: If no active ad, render nothing
  if (!ad) return null

  const hasValidLink = isValidAdUrl(ad.clickUrl)

  const handleActionClick = (e) => {
    if (!hasValidLink) {
      e.preventDefault()
      return
    }
    recordAdClick(ad.adId, placement)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="my-5 p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-[#FFFDF9] via-white to-[#FFF9F3] border border-orange-200/90 shadow-sm relative overflow-hidden"
    >
      {/* Decorative Top Gradient Accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 via-[#F78C25] to-amber-400" />

      {/* Header: Label + Club Sponsor */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/80 border border-orange-200 text-orange-800 text-[10px] sm:text-[11px] font-black tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F78C25] animate-pulse" />
          <span>{ad.badgeText || 'CAMPUS PROMOTION'}</span>
        </div>

        {ad.clubName && (
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate max-w-[200px] sm:max-w-xs text-right">
            {ad.clubName}
          </span>
        )}
      </div>

      {/* Media: Image or Video */}
      {ad.mediaUrl && (
        <div className="mb-3.5 rounded-2xl overflow-hidden bg-slate-900/5 border border-orange-100/80 flex items-center justify-center relative">
          {ad.mediaType === 'video' ? (
            <video
              src={ad.mediaUrl}
              poster={ad.posterUrl || undefined}
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
              src={ad.mediaUrl}
              alt={ad.title || 'Campus Promotion'}
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
          {ad.title}
        </h4>
        {ad.description && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
            {ad.description}
          </p>
        )}
      </div>

      {/* Action CTA Button */}
      {hasValidLink && (
        <div className="flex items-center justify-end">
          <a
            href={ad.clickUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleActionClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white text-xs font-bold shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <span>{ad.buttonText || 'View Details'}</span>
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
