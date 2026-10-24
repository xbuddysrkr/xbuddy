/**
 * tourStorage.js
 * 
 * Safe local storage manager for first-time printing and payment tutorials in XBuddy.
 * Guarantees graceful fallback if storage is restricted (e.g. private browsing).
 */

export const STORAGE_KEYS = {
  PRINT_TOUR: 'xbuddy_print_tour_v1',
  PAYMENT_TOUR: 'xbuddy_payment_tour_v1',
}

export const TOUR_STATUS = {
  COMPLETED: 'completed',
  DISMISSED: 'dismissed',
}

/**
 * Check whether a tour has already been seen (completed or skipped).
 */
export function isTourCompleted(key) {
  if (typeof window === 'undefined') return true
  try {
    const val = localStorage.getItem(key)
    return val === TOUR_STATUS.COMPLETED || val === TOUR_STATUS.DISMISSED
  } catch {
    return true
  }
}

/**
 * Mark a tour as completed or dismissed.
 */
export function markTourCompleted(key, status = TOUR_STATUS.COMPLETED) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, status)
  } catch (err) {
    console.warn('[TourStorage Warn]:', err)
  }
}

/**
 * Reset a tour to allow replaying.
 */
export function resetTour(key) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch (err) {
    console.warn('[TourStorage Warn]:', err)
  }
}

/**
 * Reset all tours for full replay.
 */
export function resetAllTours() {
  resetTour(STORAGE_KEYS.PRINT_TOUR)
  resetTour(STORAGE_KEYS.PAYMENT_TOUR)
}
