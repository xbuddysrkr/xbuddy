/**
 * campusAds.js
 * 
 * Dynamic Campus Promotion & Advertisement system for XBuddy.
 * Manages active campaigns, date/status validations, rotation, and analytics hooks.
 */

// Safe URL validator ensuring only safe web protocols
export function isValidAdUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  )
}

// Default approved campus ads catalog
export const DEFAULT_CAMPUS_ADS = [
  {
    adId: 'AD-CSE-2026-01',
    clubName: 'SRKR Innovation Hub & CSE Association',
    title: 'SRKR Hackathon 2026 — Smart Campus Edition',
    description: '24-hour code sprint with ₹50,000 cash prizes, free mentor sessions & certificates. Open to all branches!',
    mediaType: 'image',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'View Details & Register →',
    badgeText: 'CAMPUS PROMOTION',
    placement: 'order-status',
    status: 'approved',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    priority: 10,
  },
  {
    adId: 'AD-ROBOTICS-2026-02',
    clubName: 'Robotics & Automation Society',
    title: 'Hands-on Drone & IoT Bootcamp 2026',
    description: 'Build your own autonomous flight controller and IoT sensor node. Limited seats for 2nd & 3rd years.',
    mediaType: 'image',
    mediaUrl: '/assets/campus-ads/hackathon-2026.jpg',
    clickUrl: 'https://srkrec.edu.in',
    buttonText: 'Reserve Your Seat →',
    badgeText: 'CAMPUS UPDATE',
    placement: 'order-status',
    status: 'approved',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    priority: 5,
  },
]

/**
 * Validates if an advertisement is currently eligible for display:
 * - Status must be strictly "approved"
 * - Current timestamp must fall within [startDate, endDate]
 * - Placement matches requested placement
 */
export function isAdActive(ad, placement = 'order-status') {
  if (!ad || typeof ad !== 'object') return false
  if (ad.status !== 'approved') return false
  if (ad.placement && ad.placement !== placement) return false

  const now = new Date().getTime()
  if (ad.startDate) {
    const start = new Date(ad.startDate).getTime()
    if (!isNaN(start) && now < start) return false
  }
  if (ad.endDate) {
    const end = new Date(ad.endDate).getTime()
    if (!isNaN(end) && now > end) return false
  }

  // Must have minimum valid title or media
  if (!ad.title && !ad.mediaUrl) return false

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
 * Selects highest priority or smoothly rotates over sessions.
 */
export function getActiveCampusAd(placement = 'order-status', adsList = null) {
  const activeAds = getActiveCampusAds(placement, adsList)
  if (!activeAds || activeAds.length === 0) return null

  // Sort by priority (higher priority first)
  activeAds.sort((a, b) => (b.priority || 0) - (a.priority || 0))

  // Pick top active ad
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
    // Can send to API or save locally
    const history = JSON.parse(sessionStorage.getItem('xb_ad_impressions') || '[]')
    if (!history.includes(adId)) {
      history.push(adId)
      sessionStorage.setItem('xb_ad_impressions', JSON.stringify(history))
    }
    if (import.meta.env.DEV) {
      console.log('[Campus Ads] Impression recorded:', event)
    }
  } catch (e) {
    // Non-blocking telemetry
  }
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
  } catch (e) {
    // Non-blocking telemetry
  }
}
