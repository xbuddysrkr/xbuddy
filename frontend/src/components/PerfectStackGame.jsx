import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, RotateCcw, Sparkles } from 'lucide-react'
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  SHEET_HEIGHT,
  INITIAL_SHEET_WIDTH,
  calculateDrop,
  calculateNextSpeed,
  createInitialGameState,
  getStoredBestScore,
  saveStoredBestScore,
} from '../utils/perfectStackLogic'

export default function PerfectStackGame() {
  const [gameState, setGameState] = useState(createInitialGameState)
  const [bestScore, setBestScore] = useState(() => getStoredBestScore())
  const [feedback, setFeedback] = useState(null) // { text, id }
  const [fallingScraps, setFallingScraps] = useState([])

  // Mutable refs for high-frequency 60fps animation without triggering React re-renders every frame
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

  // Core Animation Loop (runs via requestAnimationFrame, updating DOM transform directly)
  const animate = useCallback((time) => {
    if (statusRef.current !== 'playing') return

    if (lastTimeRef.current == null) {
      lastTimeRef.current = time
    }
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1) // clamp delta to 100ms
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

    // Directly update DOM transform on moving sheet ref for silky-smooth 60 FPS
    if (movingSheetElRef.current) {
      movingSheetElRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`
    }

    animFrameIdRef.current = requestAnimationFrame(animate)
  }, [])

  // Start animation immediately on mount or restart
  useEffect(() => {
    lastTimeRef.current = null
    if (gameState.status === 'playing') {
      animFrameIdRef.current = requestAnimationFrame(animate)
    }

    // Visibility listener: pause when tab is backgrounded
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

  // Handle Sheet Drop Action
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

      // Update feedback badge
      setFeedback({ text: result.message, isPerfect: result.isPerfect, id: Date.now() })
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1200)

      // Update best score
      if (nextScore > bestScore) {
        setBestScore(nextScore)
        saveStoredBestScore(nextScore)
      }

      // Reposition moving sheet for next drop
      movingWidthRef.current = result.placedWidth
      speedRef.current = nextSpeed
      // Start moving sheet from opposite side of placement for dynamic gameplay
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
      // Game Over: Miss or too small
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

  // Restart Round (Isolated from real order submission)
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

  // Keyboard navigation on button or arena
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
  const maxStackVisibleHeight = 85
  const cameraOffset = Math.max(0, stackHeight - maxStackVisibleHeight)

  return (
    <div
      ref={arenaElRef}
      className="w-full bg-[#FFFDF9] border border-orange-200/90 rounded-2xl p-3 shadow-xs select-none"
    >
      {/* Game Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-[#222222] text-xs sm:text-sm tracking-tight flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#F78C25]" /> Perfect Stack
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-orange-100 text-[#F78C25] text-[9px] font-black uppercase tracking-wider">
              Mini-Game
            </span>
          </div>
          <p className="text-[11px] text-gray-400 italic">Build your paper tower while we save your order!</p>
        </div>

        {/* Score Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="px-2 py-0.5 rounded-lg bg-orange-50 border border-orange-200 text-[#F78C25] font-bold text-xs">
            Score: <span className="font-extrabold">{gameState.score}</span>
          </div>
          <div className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-xs">
            Best: <span className="font-bold">{bestScore}</span>
          </div>
        </div>
      </div>

      {/* Arcade Surface / Arena */}
      <div
        role="button"
        tabIndex={0}
        onClick={gameState.status === 'playing' ? handleDrop : undefined}
        onKeyDown={handleKeyDown}
        className="relative w-full h-[150px] bg-gradient-to-b from-[#FFF9F3] to-[#FFF4E8] rounded-xl border border-orange-200/80 overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F78C25]/50 transition-shadow"
        aria-label={gameState.status === 'playing' ? 'Game Arena: Click or tap to drop sheet' : 'Game Arena: Round finished'}
      >
        {/* Paper Counter Desk Strip (bottom base) */}
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-amber-900/10 border-t border-amber-900/15 flex items-center justify-center">
          <span className="text-[8px] font-bold uppercase tracking-widest text-amber-950/40">Xerox Counter Desk</span>
        </div>

        {/* Celebratory Feedback Badge */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback.id}
              initial={{ opacity: 0, y: -6, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={`absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full text-[11px] font-black shadow-sm flex items-center gap-1 ${
                feedback.isPerfect
                  ? 'bg-gradient-to-r from-amber-400 to-[#F78C25] text-white shadow-amber-500/20'
                  : 'bg-white border border-orange-200 text-[#F78C25]'
              }`}
            >
              {feedback.isPerfect && <Sparkles className="w-3 h-3 text-white animate-spin" />}
              <span>{feedback.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stack World Container (scrolled by cameraOffset) */}
        <div
          className="absolute inset-0 transition-transform duration-200 ease-out"
          style={{ transform: `translate3d(0, ${cameraOffset}px, 0)` }}
        >
          {/* Stacked Paper Sheets */}
          <div className="absolute bottom-4 left-0 right-0">
            {gameState.stack.map((sheet, index) => {
              const isBase = index === 0
              const isTop = index === gameState.stack.length - 1
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
                  className={`rounded-[3px] border transition-all duration-150 flex items-center justify-center overflow-hidden ${
                    isBase
                      ? 'bg-amber-100 border-amber-300 shadow-2xs'
                      : sheet.isPerfect
                      ? 'bg-gradient-to-r from-orange-50 via-white to-orange-50 border-[#F78C25] shadow-xs'
                      : 'bg-white border-orange-200 shadow-2xs'
                  }`}
                >
                  {/* Subtle paper line */}
                  <div className={`w-full h-full border-b border-black/5 ${isTop ? 'bg-orange-50/30' : ''}`} />
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
                y: 60,
                opacity: 0,
                rotate: scrap.side === 'left' ? -25 : 25,
              }}
              transition={{ duration: 0.6, ease: 'easeIn' }}
              style={{
                position: 'absolute',
                left: `${(scrap.x / ARENA_WIDTH) * 100}%`,
                width: `${(scrap.width / ARENA_WIDTH) * 100}%`,
                bottom: `${(gameState.stack.length) * SHEET_HEIGHT + 16}px`,
                height: `${SHEET_HEIGHT}px`,
              }}
              className="bg-orange-100/80 border border-orange-300 rounded-[2px]"
            />
          ))}
        </div>

        {/* Moving Paper Sheet (Top Layer) */}
        {gameState.status === 'playing' && (
          <div
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{
              bottom: `${Math.min(115, stackHeight - cameraOffset + 16)}px`,
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
              className="bg-white border-2 border-[#F78C25] rounded-[4px] shadow-md flex items-center justify-between px-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
              <div className="h-0.5 w-6 bg-orange-200 rounded-full" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#F78C25]" />
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState.status === 'game_over' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 bg-black/35 backdrop-blur-[1px] flex flex-col items-center justify-center p-3 text-white text-center"
          >
            <p className="font-extrabold text-sm mb-0.5">Tower Toppled!</p>
            <p className="text-[11px] text-orange-200 mb-2.5">
              Stack Height: <strong>{gameState.stack.length - 1}</strong> sheets
            </p>
            <button
              type="button"
              onClick={handleRestart}
              className="py-1.5 px-4 bg-[#F78C25] hover:bg-[#e07010] active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try Again
            </button>
          </motion.div>
        )}
      </div>

      {/* Game Controls Footer */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          Tap surface or click button to stack accurately
        </p>

        {gameState.status === 'playing' ? (
          <button
            type="button"
            onClick={handleDrop}
            className="py-2 px-5 bg-gradient-to-r from-[#F78C25] to-[#EA580C] hover:from-[#ea7915] hover:to-[#d04900] active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            aria-label="DROP SHEET: Place moving paper onto the stack"
          >
            <span>DROP SHEET</span>
            <span className="text-white/80 text-[10px]">▼</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRestart}
            className="py-2 px-4 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restart Round
          </button>
        )}
      </div>
    </div>
  )
}
