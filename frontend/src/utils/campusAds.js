/**
 * campusAds.js
 * 
 * Dynamic Campus Promotion & Advertisement system for XBuddy.
 * Manages active campaigns, date/status validations, priority sorting, and analytics hooks.
 * 
 * Backend Data Sources:
 * - Google Sheet ID: 1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4 (Sheet: 'XBuddy Ads')
 * - Google Drive Folder ID: 1HQ_WklATac1JXXpVOzQ40r_X9AClORGo ('XBuddy Ads')
 */

// Safe URL validator ensuring only safe web protocols (https, http, or relative path)
export function isValidAdUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  // Disallow javascript: data: vbscript: etc.
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  )
}

export const NEXTGEN_FALLBACK_POSTER_URL = '/assets/campus-ads/nextgen-labs-poster.png'

export const NEXTGEN_FALLBACK_AD = {
  adId: 'FALLBACK_NEXTGEN_LABS',
  clubName: 'NextGen Labs',
  title: 'NextGen Labs',
  description: 'Where Every Idea Begins — Innovate, build, and lead with NextGen Labs.',
  mediaType: 'image',
  mediaUrl: NEXTGEN_FALLBACK_POSTER_URL,
  clickUrl: 'https://srkrec.edu.in',
  buttonText: 'Learn More',
  badgeText: 'CAMPUS PROMOTION',
  placement: 'order-status',
  status: 'approved',
  priority: 999,
  isFallback: true,
}

/**
 * Resolves a displayable media URL. If mediaUrl is missing but mediaFileId exists,
 * builds a direct Google Drive view URL.
 */
export function resolveMediaUrl(ad) {
  if (!ad) return NEXTGEN_FALLBACK_POSTER_URL
  
  if (ad.mediaUrl && typeof ad.mediaUrl === 'string') {
    const trimmed = ad.mediaUrl.trim()
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed
    }
    // If it's a Drive file ID rather than a full URL
    if (trimmed.length > 20 && !trimmed.includes(' ')) {
      return `https://drive.google.com/uc?export=view&id=${trimmed}`
    }
  }

  if (ad.mediaFileId && typeof ad.mediaFileId === 'string') {
    const trimmedId = ad.mediaFileId.trim()
    if (trimmedId.length > 20 && trimmedId !== 'FILE_ID') {
      return `https://drive.google.com/uc?export=view&id=${trimmedId}`
    }
  }

  return NEXTGEN_FALLBACK_POSTER_URL
}

// Default approved campus ads catalog (guarantees zero-blank UI even if GAS is offline)
export const DEFAULT_CAMPUS_ADS = [
  {
    adId: 'AD001',
    clubName: 'CSE Club',
    title: 'CSE Hackathon 2026',
    description: 'Register now for the 24-hour smart campus code sprint with cash prizes & mentor sessions!',
    mediaType: 'image',
    mediaFileId: '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Register Now',
    placement: 'order-status',
    status: 'approved',
    priority: 1,
    startDate: '2026-10-05',
    endDate: '2026-10-15',
    createdAt: '2026-10-05T00:00:00.000Z',
  },
  {
    adId: 'AD-ROBOTICS-2026-02',
    clubName: 'Robotics & Automation Society',
    title: 'Hands-on Drone & IoT Bootcamp 2026',
    description: 'Build your own autonomous flight controller and IoT sensor node. Limited seats available.',
    mediaType: 'image',
    mediaFileId: '',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Reserve Your Seat',
    placement: 'order-status',
    status: 'approved',
    priority: 2,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

/**
 * Validates if an advertisement is currently eligible for display:
 * - Status must be strictly "approved"
 * - Current timestamp must fall within [startDate, endDate]
 * - Handles full-day validity if endDate has no explicit time
 * - Placement matches requested placement
 */
export function isAdActive(ad, placement = 'order-status') {
  if (!ad || typeof ad !== 'object') return false
  if (String(ad.status).trim().toLowerCase() !== 'approved') return false
  if (ad.placement && String(ad.placement).trim() !== placement) return false

  const now = new Date().getTime()

  if (ad.startDate) {
    const start = new Date(ad.startDate).getTime()
    if (!isNaN(start) && now < start) return false
  }

  if (ad.endDate) {
    const end = new Date(ad.endDate)
    if (!isNaN(end.getTime())) {
      // If date string has no explicit time (e.g. YYYY-MM-DD), extend to 23:59:59.999
      if (typeof ad.endDate === 'string' && ad.endDate.trim().length <= 10) {
        end.setHours(23, 59, 59, 999)
      }
      if (now > end.getTime()) return false
    }
  }

  // Must have a title or media to be useful
  if (!ad.title && !ad.mediaUrl && !ad.mediaFileId) return false

  return true
}

/**
 * Returns all active, approved advertisements for a given placement.
 */
export function getActiveCampusAds(placement = 'order-status', adsList = null) {
  const pool = Array.isArray(adsList) ? adsList : DEFAULT_CAMPUS_ADS
  return pool.filter(ad => isAdActive(ad, placement))
}

/**
 * Retrieves the single active campus promotion to display on the given placement.
 * Sorts by numeric priority ascending:
 * Lower priority number = higher priority (e.g. 1 before 2).
 */
export function getActiveCampusAd(placement = 'order-status', adsList = null) {
  const activeAds = getActiveCampusAds(placement, adsList)
  if (!activeAds || activeAds.length === 0) return null

  // Sort ascending by priority: 1 before 2
  activeAds.sort((a, b) => {
    const pA = parseFloat(a.priority)
    const pB = parseFloat(b.priority)
    const numA = isNaN(pA) ? 999 : pA
    const numB = isNaN(pB) ? 999 : pB
    return numA - numB
  })

  // Return the highest-priority active ad
  return activeAds[0]
}

/**
 * Analytics Hooks (ready for backend telemetry without blocking UI)
 */
export function recordAdImpression(adId, placement = 'order-status') {
  if (!adId) return
  try {
    const event = {
      type: 'ad_impression',
      adId,
      placement,
      timestamp: new Date().toISOString(),
    }
    const history = JSON.parse(sessionStorage.getItem('xb_ad_impressions') || '[]')
    if (!history.includes(adId)) {
      history.push(adId)
      sessionStorage.setItem('xb_ad_impressions', JSON.stringify(history))
    }
    if (import.meta.env.DEV) {
      console.log('[Campus Ads] Impression recorded:', event)
    }
  } catch (e) {}
}

export function recordAdClick(adId, placement = 'order-status') {
  if (!adId) return
  try {
    const event = {
      type: 'ad_click',
      adId,
      placement,
      timestamp: new Date().toISOString(),
    }
    if (import.meta.env.DEV) {
      console.log('[Campus Ads] Click recorded:', event)
    }
  } catch (e) {}
}
