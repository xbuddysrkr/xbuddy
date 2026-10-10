import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Sparkles } from 'lucide-react'
import {
  ARENA_WIDTH,
  SHEET_HEIGHT,
  calculateDrop,
  calculateNextSpeed,
  createInitialGameState,
  getStoredBestScore,
  saveStoredBestScore,
} from '../utils/perfectStackLogic'

export default function PerfectStackGame() {
  const [gameState, setGameState] = useState(createInitialGameState)
  const [bestScore, setBestScore] = useState(() => getStoredBestScore())
  const [feedback, setFeedback] = useState(null)
  const [fallingScraps, setFallingScraps] = useState([])

  // Mutable refs for 60fps animation without triggering React re-renders every frame
  const movingXRef = useRef(0)
  const directionRef = useRef(1)
  const speedRef = useRef(gameState.speed)
  const movingWidthRef = useRef(gameState.movingWidth)
  const statusRef = useRef(gameState.status)
  const stackRef = useRef(gameState.stack)
  const animFrameIdRef = useRef(null)
  const lastTimeRef = useRef(null)
  const movingSheetElRef = useRef(null)
  const arenaElRef = useRef(null)
  const feedbackTimeoutRef = useRef(null)

  // Keep refs in sync with state
  useEffect(() => {
    speedRef.current = gameState.speed
    movingWidthRef.current = gameState.movingWidth
    statusRef.current = gameState.status
    stackRef.current = gameState.stack
  }, [gameState.speed, gameState.movingWidth, gameState.status, gameState.stack])

  // Animation Loop (60 FPS direct CSS transform)
  const animate = useCallback((time) => {
    if (statusRef.current !== 'playing') return

    if (lastTimeRef.current == null) {
      lastTimeRef.current = time
    }
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1)
    lastTimeRef.current = time

    // Motion reduction check
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const effectiveSpeed = prefersReducedMotion ? speedRef.current * 0.5 : speedRef.current

    let nextX = movingXRef.current + directionRef.current * effectiveSpeed * dt
    const maxBound = ARENA_WIDTH - movingWidthRef.current

    if (nextX >= maxBound) {
      nextX = maxBound
      directionRef.current = -1
    } else if (nextX <= 0) {
      nextX = 0
      directionRef.current = 1
    }

    movingXRef.current = nextX

    if (movingSheetElRef.current) {
      movingSheetElRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`
    }

    animFrameIdRef.current = requestAnimationFrame(animate)
  }, [])

  // Start animation immediately on mount
  useEffect(() => {
    lastTimeRef.current = null
    if (gameState.status === 'playing') {
      animFrameIdRef.current = requestAnimationFrame(animate)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current)
          animFrameIdRef.current = null
        }
        lastTimeRef.current = null
      } else if (statusRef.current === 'playing') {
        lastTimeRef.current = null
        animFrameIdRef.current = requestAnimationFrame(animate)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [animate, gameState.status])

  // Handle Sheet Drop Action (tap/click anywhere)
  const handleDrop = useCallback(() => {
    if (statusRef.current !== 'playing') return

    const currentX = movingXRef.current
    const currentWidth = movingWidthRef.current
    const currentStack = stackRef.current
    const topSheet = currentStack[currentStack.length - 1]

    const result = calculateDrop({
      movingX: currentX,
      movingWidth: currentWidth,
      topX: topSheet.x,
      topWidth: topSheet.width,
    })

    if (result.cutScrap) {
      const scrapId = Date.now() + Math.random()
      setFallingScraps(prev => [...prev.slice(-3), { ...result.cutScrap, id: scrapId }])
      setTimeout(() => {
        setFallingScraps(prev => prev.filter(s => s.id !== scrapId))
      }, 700)
    }

    if (result.success) {
      const newSheet = {
        id: currentStack.length + 1,
        x: result.placedX,
        width: result.placedWidth,
        y: currentStack.length * SHEET_HEIGHT,
        isPerfect: result.isPerfect,
      }

      const nextStack = [...currentStack, newSheet]
      const nextScore = gameState.score + result.points
      const nextSpeed = calculateNextSpeed(speedRef.current)

      // Feedback celebratory pop
      setFeedback({ text: result.message, isPerfect: result.isPerfect, id: Date.now() })
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1200)

      if (nextScore > bestScore) {
        setBestScore(nextScore)
        saveStoredBestScore(nextScore)
      }

      movingWidthRef.current = result.placedWidth
      speedRef.current = nextSpeed
      const startX = result.placedX > (ARENA_WIDTH - result.placedWidth) / 2 ? 0 : (ARENA_WIDTH - result.placedWidth)
      movingXRef.current = startX
      directionRef.current = startX === 0 ? 1 : -1
      if (movingSheetElRef.current) {
        movingSheetElRef.current.style.transform = `translate3d(${startX}px, 0, 0)`
      }

      setGameState(prev => ({
        ...prev,
        stack: nextStack,
        score: nextScore,
        movingWidth: result.placedWidth,
        speed: nextSpeed,
      }))
    } else {
      statusRef.current = 'game_over'
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      setFeedback({ text: result.message, isPerfect: false, id: Date.now() })
      setGameState(prev => ({
        ...prev,
        status: 'game_over',
      }))
    }
  }, [gameState.score, bestScore])

  // Restart Round
  const handleRestart = useCallback((e) => {
    e?.stopPropagation()
    const fresh = createInitialGameState()
    movingXRef.current = 0
    directionRef.current = 1
    speedRef.current = fresh.speed
    movingWidthRef.current = fresh.movingWidth
    statusRef.current = 'playing'
    stackRef.current = fresh.stack
    lastTimeRef.current = null

    if (movingSheetElRef.current) {
      movingSheetElRef.current.style.transform = 'translate3d(0px, 0, 0)'
    }

    setFallingScraps([])
    setFeedback(null)
    setGameState(fresh)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (gameState.status === 'playing') {
        handleDrop()
      } else {
        handleRestart()
      }
    }
  }

  // Camera scroll: smoothly keep top sheets and moving sheet centered
  const stackHeight = gameState.stack.length * SHEET_HEIGHT
  const maxStackVisibleHeight = 110
  const cameraOffset = Math.max(0, stackHeight - maxStackVisibleHeight)

  return (
    <div
      ref={arenaElRef}
      role="button"
      tabIndex={0}
      onClick={gameState.status === 'playing' ? handleDrop : undefined}
      onKeyDown={handleKeyDown}
      className="relative w-full h-[225px] rounded-2xl overflow-hidden select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F78C25]/60 transition-all shadow-md"
      style={{
        backgroundColor: '#18271E',
        backgroundImage: `
          radial-gradient(ellipse at 50% 65%, #23372B 0%, #17241D 100%),
          linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 20px 20px, 20px 20px',
      }}
      aria-label="XBuddy Perfect Stack: Tap to drop sheet"
    >
      {/* ── Top Header matching the Blueprint Design ── */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 py-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-white/95 text-xs sm:text-sm tracking-wider uppercase font-sans drop-shadow-xs">
            BUILD YOUR TOWER
          </span>
          {gameState.score > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[#F8A548] font-mono text-[11px] font-extrabold">
              {gameState.score}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {bestScore > 0 && (
            <span className="text-[10px] text-white/40 font-mono font-medium tracking-wide hidden min-[360px]:inline">
              BEST: {bestScore}
            </span>
          )}
          <span className="text-white/60 font-bold text-[11px] sm:text-xs tracking-wider uppercase transition-opacity">
            TAP TO DROP
          </span>
        </div>
      </div>

      {/* Celebratory Feedback Pop Badge */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback.id}
            initial={{ opacity: 0, y: -6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={`absolute top-9 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-[11px] font-black shadow-md flex items-center gap-1.5 pointer-events-none ${
              feedback.isPerfect
                ? 'bg-gradient-to-r from-amber-400 to-[#F78C25] text-white shadow-amber-500/25'
                : 'bg-[#23372B] border border-white/20 text-[#F8A548]'
            }`}
          >
            {feedback.isPerfect && <Sparkles className="w-3 h-3 text-white animate-spin" />}
            <span>{feedback.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Baseline / Drafting Wire Line across the bottom ── */}
      <div
        className="absolute left-3 right-3 h-[1px] bg-white/15 pointer-events-none"
        style={{ bottom: '26px' }}
      />

      {/* ── Stack World Container (Camera scrolling) ── */}
      <div
        className="absolute inset-0 transition-transform duration-200 ease-out"
        style={{ transform: `translate3d(0, ${cameraOffset}px, 0)` }}
      >
        {/* Placed Stack Sheets (Cream/Beige paper blocks) */}
        <div className="absolute left-0 right-0 pointer-events-none" style={{ bottom: '27px' }}>
          {gameState.stack.map((sheet, index) => {
            const isBase = index === 0
            return (
              <div
                key={sheet.id || index}
                style={{
                  position: 'absolute',
                  left: `${(sheet.x / ARENA_WIDTH) * 100}%`,
                  width: `${(sheet.width / ARENA_WIDTH) * 100}%`,
                  bottom: `${index * SHEET_HEIGHT}px`,
                  height: `${SHEET_HEIGHT}px`,
                }}
                className={`rounded-md transition-all duration-150 relative overflow-hidden shadow-[0_3px_8px_rgba(0,0,0,0.35)] ${
                  isBase
                    ? 'bg-gradient-to-b from-[#F7F2E8] to-[#E9DFCFCF] border border-[#DDD3C2]'
                    : sheet.isPerfect
                    ? 'bg-gradient-to-b from-[#FFF9EE] to-[#EFE4D2] border border-[#F8A548]/50 shadow-[0_0_8px_rgba(248,165,72,0.3)]'
                    : 'bg-gradient-to-b from-[#F5EFE5] to-[#E8DECEDB] border border-[#DDD3C2]'
                }`}
              >
                {/* Embossed Paper Document Lines */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 w-16 pointer-events-none opacity-30">
                  <div className="h-[1.5px] bg-black/50 rounded-full w-full" />
                  <div className="h-[1.5px] bg-black/50 rounded-full w-3/5" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Falling Trimmed Scraps */}
        {fallingScraps.map(scrap => (
          <motion.div
            key={scrap.id}
            initial={{ y: 0, opacity: 1, rotate: 0 }}
            animate={{
              y: 70,
              opacity: 0,
              rotate: scrap.side === 'left' ? -25 : 25,
            }}
            transition={{ duration: 0.6, ease: 'easeIn' }}
            style={{
              position: 'absolute',
              left: `${(scrap.x / ARENA_WIDTH) * 100}%`,
              width: `${(scrap.width / ARENA_WIDTH) * 100}%`,
              bottom: `${(gameState.stack.length) * SHEET_HEIGHT + 27}px`,
              height: `${SHEET_HEIGHT}px`,
            }}
            className="bg-[#F8A548]/90 rounded-md shadow-xs pointer-events-none"
          />
        ))}
      </div>

      {/* ── Moving Active Sheet (Warm Orange paper block) ── */}
      {gameState.status === 'playing' && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{
            bottom: `${Math.min(145, stackHeight - cameraOffset + 27)}px`,
            height: `${SHEET_HEIGHT}px`,
          }}
        >
          <div
            ref={movingSheetElRef}
            style={{
              position: 'absolute',
              left: 0,
              width: `${(gameState.movingWidth / ARENA_WIDTH) * 100}%`,
              height: `${SHEET_HEIGHT}px`,
              willChange: 'transform',
            }}
            className="bg-gradient-to-b from-[#FFB766] via-[#F8A548] to-[#E98B26] border border-[#FFAE57] rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.45)] flex items-center px-3"
          >
            {/* Embossed Paper Document Lines */}
            <div className="flex flex-col gap-0.5 w-16 pointer-events-none opacity-35">
              <div className="h-[1.5px] bg-black/50 rounded-full w-full" />
              <div className="h-[1.5px] bg-black/50 rounded-full w-3/5" />
            </div>
          </div>
        </div>
      )}

      {/* ── Game Over Overlay matching the Blueprint Aesthetic ── */}
      {gameState.status === 'game_over' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 bg-[#121E17]/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-white text-center cursor-default"
          onClick={e => e.stopPropagation()}
        >
          <p className="font-extrabold text-base tracking-wider uppercase mb-0.5 text-white">Tower Toppled!</p>
          <p className="text-xs text-[#F8A548] font-mono mb-3">
            Height: <strong>{gameState.stack.length - 1}</strong> sheets
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="py-2 px-5 bg-gradient-to-r from-[#F8A548] to-[#EA7C1C] hover:from-[#fba23c] hover:to-[#db6d0e] active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try Again
          </button>
        </motion.div>
      )}
    </div>
  )
}
