/**
 * XBuddy Perfect Stack — Core Game Logic
 * Pure, deterministic rules for paper stacking mini-game:
 * - Overhang trimming
 * - Alignment & perfect bonus calculation
 * - Speed ramping
 * - Safe persistence
 */

export const ARENA_WIDTH = 300
export const ARENA_HEIGHT = 160
export const SHEET_HEIGHT = 14
export const INITIAL_SHEET_WIDTH = 140
export const MIN_SHEET_WIDTH = 12
export const PERFECT_TOLERANCE = 4
export const INITIAL_SPEED = 160
export const SPEED_INCREMENT = 8
export const MAX_SPEED = 320

export const STORAGE_KEY_BEST = 'xbuddy_perfect_stack_best'

/**
 * Calculates the result of dropping a moving paper sheet onto the top sheet of the stack.
 *
 * @param {object} params
 * @param {number} params.movingX - Horizontal position of moving sheet
 * @param {number} params.movingWidth - Width of moving sheet
 * @param {number} params.topX - Horizontal position of current top sheet
 * @param {number} params.topWidth - Width of current top sheet
 * @returns {object} Drop resolution result
 */
export function calculateDrop({ movingX, movingWidth, topX, topWidth }) {
  const diff = Math.abs(movingX - topX)

  // 1. Perfect Alignment Check
  if (diff <= PERFECT_TOLERANCE) {
    return {
      success: true,
      isPerfect: true,
      placedX: topX, // Snap perfectly to top sheet
      placedWidth: topWidth,
      cutScrap: null,
      isMiss: false,
      isTooSmall: false,
      points: 2, // 1 base + 1 perfect bonus
      bonus: 1,
      message: 'PERFECT! +2',
    }
  }

  // 2. Overlap Calculation
  const left = Math.max(movingX, topX)
  const right = Math.min(movingX + movingWidth, topX + topWidth)
  const overlap = right - left

  // Complete miss
  if (overlap <= 0) {
    return {
      success: false,
      isPerfect: false,
      placedX: movingX,
      placedWidth: movingWidth,
      cutScrap: {
        x: movingX,
        width: movingWidth,
        side: movingX < topX ? 'left' : 'right',
      },
      isMiss: true,
      isTooSmall: false,
      points: 0,
      bonus: 0,
      message: 'Missed the stack!',
    }
  }

  // Overlap too small (sheet trimmed below minimum workable size)
  if (overlap < MIN_SHEET_WIDTH) {
    return {
      success: false,
      isPerfect: false,
      placedX: left,
      placedWidth: overlap,
      cutScrap: {
        x: movingX < topX ? movingX : topX + topWidth,
        width: movingX < topX ? (topX - movingX) : ((movingX + movingWidth) - (topX + topWidth)),
        side: movingX < topX ? 'left' : 'right',
      },
      isMiss: false,
      isTooSmall: true,
      points: 0,
      bonus: 0,
      message: 'Sheet too thin to balance!',
    }
  }

  // Normal successful placement with trimmed overhang
  let cutScrap = null
  if (movingX < topX) {
    cutScrap = {
      x: movingX,
      width: topX - movingX,
      side: 'left',
    }
  } else if (movingX + movingWidth > topX + topWidth) {
    cutScrap = {
      x: topX + topWidth,
      width: (movingX + movingWidth) - (topX + topWidth),
      side: 'right',
    }
  }

  return {
    success: true,
    isPerfect: false,
    placedX: left,
    placedWidth: overlap,
    cutScrap,
    isMiss: false,
    isTooSmall: false,
    points: 1,
    bonus: 0,
    message: 'NICE STACK! +1',
  }
}

/**
 * Creates initial fresh game state.
 */
export function createInitialGameState() {
  const baseSheet = {
    id: 1,
    x: (ARENA_WIDTH - INITIAL_SHEET_WIDTH) / 2,
    width: INITIAL_SHEET_WIDTH,
    y: 0,
    isPerfect: false,
  }

  return {
    stack: [baseSheet],
    score: 0,
    movingWidth: INITIAL_SHEET_WIDTH,
    movingX: 0,
    direction: 1, // 1 for right, -1 for left
    speed: INITIAL_SPEED,
    status: 'playing', // 'playing' | 'game_over'
    feedback: null, // { text, id }
    scraps: [], // falling pieces
  }
}

/**
 * Calculates next movement speed with gentle ramping.
 */
export function calculateNextSpeed(currentSpeed) {
  return Math.min(MAX_SPEED, (currentSpeed || INITIAL_SPEED) + SPEED_INCREMENT)
}

/**
 * Safe local storage read for personal best score.
 */
export function getStoredBestScore(customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null)
    if (!storage) return 0
    const raw = storage.getItem(STORAGE_KEY_BEST)
    const val = parseInt(raw, 10)
    return isNaN(val) || val < 0 ? 0 : val
  } catch {
    return 0
  }
}

/**
 * Safe local storage write for personal best score.
 */
export function saveStoredBestScore(newScore, customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null)
    if (!storage || typeof newScore !== 'number') return
    const current = getStoredBestScore(storage)
    if (newScore > current) {
      storage.setItem(STORAGE_KEY_BEST, String(newScore))
    }
  } catch {}
}
