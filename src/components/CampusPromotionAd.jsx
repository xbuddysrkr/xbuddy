import { useEffect, useState, useRef } from 'react'
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
 * - Autoplays video muted, loops continuously, plays inline on mobile with no native controls
 * - Provides a clean custom Mute / Unmute toggle button
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

  const videoRef = useRef(null)
  const [isMuted, setIsMuted] = useState(true)

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

  const resolvedMedia = resolveMediaUrl(activeAd)
  const hasValidLink = isValidAdUrl(activeAd?.clickUrl)

  // Programmatic Autoplay Enforcement with Safe Retry
  useEffect(() => {
    const video = videoRef.current
    if (!video || activeAd?.mediaType !== 'video') return

    video.muted = true
    video.loop = true
    video.playsInline = true
    video.controls = false

    const tryPlay = () => {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay may be temporarily blocked by browser policy.
          // Keep the ad UI stable without breaking the page.
        })
      }
    }

    if (video.readyState >= 2) {
      tryPlay()
    } else {
      video.addEventListener('canplay', tryPlay, { once: true })
      video.addEventListener('loadeddata', tryPlay, { once: true })
    }

    const handleVisibility = () => {
      if (!document.hidden && video.paused) {
        tryPlay()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      video.removeEventListener('canplay', tryPlay)
      video.removeEventListener('loadeddata', tryPlay)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [resolvedMedia, activeAd?.mediaType])

  const toggleMute = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    const nextMuted = !isMuted
    video.muted = nextMuted
    setIsMuted(nextMuted)
    if (video.paused) {
      video.play().catch(() => {})
    }
  }

  // If no active approved ad is available, render nothing (no empty card or broken layout)
  if (!activeAd) return null

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
            <>
              <video
                ref={videoRef}
                src={resolvedMedia}
                poster={activeAd.posterUrl || undefined}
                autoPlay
                muted={isMuted}
                loop
                playsInline
                controls={false}
                preload="auto"
                className="w-full max-h-56 sm:max-h-64 object-contain rounded-2xl bg-black"
              >
                Your browser does not support the video tag.
              </video>

              {/* Only Mute and Unmute Option - Floating Corner Toggle */}
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                title={isMuted ? 'Unmute video' : 'Mute video'}
                className="absolute bottom-2.5 right-2.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/65 hover:bg-black/85 text-white text-[11px] font-semibold backdrop-blur-md shadow-md border border-white/20 transition-all active:scale-95 cursor-pointer select-none"
              >
                {isMuted ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                    <span>Unmute</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                    <span>Mute</span>
                  </>
                )}
              </button>
            </>
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
