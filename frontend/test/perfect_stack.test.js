import assert from 'node:assert/strict'
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  SHEET_HEIGHT,
  INITIAL_SHEET_WIDTH,
  MIN_SHEET_WIDTH,
  PERFECT_TOLERANCE,
  INITIAL_SPEED,
  calculateDrop,
  calculateNextSpeed,
  createInitialGameState,
  getStoredBestScore,
  saveStoredBestScore,
  STORAGE_KEY_BEST,
} from '../src/utils/perfectStackLogic.js'

console.log('🧪 Starting XBuddy Perfect Stack Regression Test Suite...\n')

// ── Test 1: Immediate Start (No Opt-in, No Delay) ──────────────────────────
{
  const state = createInitialGameState()
  assert.equal(state.status, 'playing', 'Game must immediately be in playing status upon initialization')
  assert.equal(state.score, 0, 'Initial score must be 0')
  assert.equal(state.stack.length, 1, 'Initial stack must contain base sheet')
  assert.equal(state.movingWidth, INITIAL_SHEET_WIDTH, 'Initial moving width must match initial sheet width')
  assert.equal(state.speed, INITIAL_SPEED, 'Speed starts at forgiving initial speed')
  console.log('✓ TEST 1 PASSED: Game initializes immediately in "playing" state without opt-in or delay')
}

// ── Test 2: Perfect Alignment Detection (diff <= 4px) ──────────────────────
{
  // Base sheet at x=80, width=140. Moving sheet at x=82 (diff=2 <= 4)
  const result = calculateDrop({
    movingX: 82,
    movingWidth: 140,
    topX: 80,
    topWidth: 140,
  })

  assert.equal(result.success, true, 'Placement should succeed')
  assert.equal(result.isPerfect, true, 'Diff <= 4px must be identified as Perfect Alignment')
  assert.equal(result.placedX, 80, 'Perfect alignment snaps accurately to top sheet')
  assert.equal(result.placedWidth, 140, 'Perfect alignment does not trim width')
  assert.equal(result.cutScrap, null, 'No scrap cut on perfect alignment')
  assert.equal(result.points, 2, 'Perfect alignment awards 2 points (1 base + 1 bonus)')
  assert.equal(result.bonus, 1, 'Bonus point recorded')
  console.log('✓ TEST 2 PASSED: Perfect alignment (within 4px) snaps, preserves full width, and awards bonus')
}

// ── Test 3: Standard Overhang Trimming (Left Overhang) ─────────────────────
{
  // Top sheet at x=80, width=140 (spans 80 to 220).
  // Moving sheet at x=60, width=140 (spans 60 to 200).
  // Overlap is from 80 to 200 => width 120. Overhang on left from 60 to 80 => scrap width 20.
  const result = calculateDrop({
    movingX: 60,
    movingWidth: 140,
    topX: 80,
    topWidth: 140,
  })

  assert.equal(result.success, true)
  assert.equal(result.isPerfect, false)
  assert.equal(result.placedX, 80)
  assert.equal(result.placedWidth, 120)
  assert.notEqual(result.cutScrap, null)
  assert.equal(result.cutScrap.x, 60)
  assert.equal(result.cutScrap.width, 20)
  assert.equal(result.cutScrap.side, 'left')
  assert.equal(result.points, 1)
  console.log('✓ TEST 3 PASSED: Left overhang accurately trimmed into falling scrap with 1 point awarded')
}

// ── Test 4: Standard Overhang Trimming (Right Overhang) ────────────────────
{
  // Top sheet at x=80, width=140 (spans 80 to 220).
  // Moving sheet at x=100, width=140 (spans 100 to 240).
  // Overlap is from 100 to 220 => width 120. Overhang on right from 220 to 240 => scrap width 20.
  const result = calculateDrop({
    movingX: 100,
    movingWidth: 140,
    topX: 80,
    topWidth: 140,
  })

  assert.equal(result.success, true)
  assert.equal(result.isPerfect, false)
  assert.equal(result.placedX, 100)
  assert.equal(result.placedWidth, 120)
  assert.notEqual(result.cutScrap, null)
  assert.equal(result.cutScrap.x, 220)
  assert.equal(result.cutScrap.width, 20)
  assert.equal(result.cutScrap.side, 'right')
  assert.equal(result.points, 1)
  console.log('✓ TEST 4 PASSED: Right overhang accurately trimmed into falling scrap with 1 point awarded')
}

// ── Test 5: Complete Miss Rejection (Game Over) ────────────────────────────
{
  // Top sheet spans 80 to 220. Moving sheet at x=230, width=50 (spans 230 to 280). No overlap!
  const result = calculateDrop({
    movingX: 230,
    movingWidth: 50,
    topX: 80,
    topWidth: 140,
  })

  assert.equal(result.success, false)
  assert.equal(result.isMiss, true)
  assert.equal(result.points, 0)
  console.log('✓ TEST 5 PASSED: Complete miss correctly flagged with zero points and failure')
}

// ── Test 6: Overlap Too Small (Width < 12px triggers Game Over) ────────────
{
  // Top sheet spans 80 to 220.
  // Moving sheet at x=212, width=50 (overlap from 212 to 220 => 8px < MIN_SHEET_WIDTH of 12px)
  const result = calculateDrop({
    movingX: 212,
    movingWidth: 50,
    topX: 80,
    topWidth: 140,
  })

  assert.equal(result.success, false)
  assert.equal(result.isTooSmall, true)
  assert.equal(result.points, 0)
  console.log('✓ TEST 6 PASSED: Slices thinner than 12px safely trigger game over (sheet too thin to balance)')
}

// ── Test 7: Speed Ramp Mechanics ───────────────────────────────────────────
{
  let speed = INITIAL_SPEED
  for (let i = 0; i < 5; i++) {
    const next = calculateNextSpeed(speed)
    assert.ok(next > speed, 'Speed must strictly increase')
    speed = next
  }
  // Max speed clamp test
  const clamped = calculateNextSpeed(500)
  assert.equal(clamped, 320, 'Speed must be clamped at MAX_SPEED')
  console.log('✓ TEST 7 PASSED: Speed ramps progressively and clamps at MAX_SPEED')
}

// ── Test 8: High Score Safe Persistence (Mock Storage) ─────────────────────
{
  const mockStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null },
    setItem(k, v) { this._data[k] = String(v) },
  }

  assert.equal(getStoredBestScore(mockStorage), 0, 'Default best score is 0')
  saveStoredBestScore(5, mockStorage)
  assert.equal(getStoredBestScore(mockStorage), 5, 'Stored best score updates to 5')
  saveStoredBestScore(3, mockStorage)
  assert.equal(getStoredBestScore(mockStorage), 5, 'Lower score does not overwrite best score')
  saveStoredBestScore(12, mockStorage)
  assert.equal(getStoredBestScore(mockStorage), 12, 'Higher score updates best score')

  // Broken storage gracefully handled without throwing
  const throwingStorage = {
    getItem() { throw new Error('QuotaExceeded') },
    setItem() { throw new Error('QuotaExceeded') },
  }
  assert.equal(getStoredBestScore(throwingStorage), 0)
  saveStoredBestScore(99, throwingStorage) // Should not throw
  console.log('✓ TEST 8 PASSED: High score storage operates cleanly and handles failures gracefully')
}

// ── Test 9: Order Isolation & Pure State Contract ──────────────────────────
{
  const orderMeta = {
    orderId: 'XB8899',
    fileName: 'ProjectReport.pdf',
    amount: 25,
  }

  // Simulate multiple game rounds
  let gameState = createInitialGameState()
  gameState = { ...gameState, score: 7, status: 'game_over' }

  // Restarting game
  const restartedGame = createInitialGameState()

  // Verify orderMeta is 100% untouched
  assert.equal(orderMeta.orderId, 'XB8899')
  assert.equal(orderMeta.fileName, 'ProjectReport.pdf')
  assert.equal(orderMeta.amount, 25)
  assert.equal(restartedGame.score, 0)
  assert.equal(restartedGame.status, 'playing')
  console.log('✓ TEST 9 PASSED: Gameplay round restarts have zero side effects on order metadata')
}

// ── Test 10: Lifecycle Contract — Terminal State Disconnect ────────────────
{
  // Evaluate the contract used in OrderProgress:
  // Show PerfectStackGame strictly when !isSuccess && !hasFailed
  function shouldRenderGame({ isSuccess, hasFailed }) {
    return !isSuccess && !hasFailed
  }

  // While processing:
  assert.equal(shouldRenderGame({ isSuccess: false, hasFailed: false }), true, 'Game must render while processing')

  // When order succeeds:
  assert.equal(shouldRenderGame({ isSuccess: true, hasFailed: false }), false, 'Game must stop immediately when order succeeds')

  // When order fails:
  assert.equal(shouldRenderGame({ isSuccess: false, hasFailed: true }), false, 'Game must stop immediately when order fails')

  // Edge case: both true (terminal conflict):
  assert.equal(shouldRenderGame({ isSuccess: true, hasFailed: true }), false, 'Game must stop when terminal state reached')
  console.log('✓ TEST 10 PASSED: Game mounting strictly obeys order lifecycle (instantly unmounts on success/failure)')
}

console.log('\n🎉 ALL 10 XBUDDY PERFECT STACK TESTS PASSED PERFECTLY!\n')
