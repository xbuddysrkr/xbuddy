import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getOrderStatus, updateOrderStatus } from '../utils/api'

const SESSION_KEY   = 'xbuddy_booth_auth'
const AGENT_URL     = import.meta.env.VITE_PRINT_AGENT_URL || 'http://localhost:3001'

function isAuthed() { return sessionStorage.getItem(SESSION_KEY) === 'true' }

async function apiPost(path, body) {
  try {
    const res = await fetch(`${AGENT_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Cannot connect to print agent. Is it running?' }
  }
}

// ── PIN Login ─────────────────────────────────────────────────────────────────
function PinLogin({ onSuccess }) {
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [shake,   setShake]   = useState(false)
  const inputRef = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (pin.length < 4) return
    setLoading(true)
    const res = await apiPost('/booth-login', { pin })
    if (res.success) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      onSuccess()
    } else {
      setError(res.error || 'Wrong PIN')
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-12"
      >
        <div className="w-12 h-12 rounded-xl bg-[#F78C25] flex items-center justify-center shadow-md">
          <span className="text-white font-bold text-xl">X</span>
        </div>
        <div>
          <p className="text-[#222222] font-bold text-2xl">X Buddy</p>
          <p className="text-[#6B7280] text-xs">Xerox Shop Print Terminal</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-[#222222]">Shopkeeper Access</h2>
          <p className="text-[#6B7280] text-sm mt-1">Enter your PIN to unlock the print terminal</p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          animate={shake ? { x: [-8, 8, -6, 6, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl p-6 space-y-4 border border-orange-200 shadow-md"
        >
          <input
            ref={inputRef}
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError('') }}
            placeholder="Enter PIN"
            maxLength={8}
            className="w-full bg-[#FFF8F2] border border-orange-200 rounded-xl px-4 py-4 text-[#222222] text-2xl font-mono tracking-[0.5em] placeholder-gray-300 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-colors text-center"
          />

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-center"
              >
                ⚠️ {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full py-4 bg-[#F78C25] hover:bg-[#e07010] disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : '🔓 Unlock Terminal'
            }
          </button>
        </motion.form>
      </motion.div>
    </div>
  )
}

// ── Release Panel ─────────────────────────────────────────────────────────────
function ReleasePrint({ onLock }) {
  const [orderId,  setOrderId]  = useState('XB')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [lastPrint, setLastPrint] = useState(null)
  const [time,     setTime]     = useState(new Date())
  const inputRef  = useRef()

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleRelease(e) {
    e.preventDefault()
    const id = orderId.trim().toUpperCase()
    if (!id) return
    setLoading(true)
    setResult(null)
    
    // 1. Try local agent print release first
    let res = await apiPost('/release-print', { orderId: id })

    // 2. If order not in local agent memory, check authoritative Google Sheet
    if (!res || !res.success) {
      try {
        const cloudOrder = await getOrderStatus(id)
        if (cloudOrder?.success && cloudOrder?.order) {
          const ord = cloudOrder.order
          // Mark as ready / verified in Google Sheets
          await updateOrderStatus(id, 'Ready')
          res = {
            success: true,
            orderId: id,
            message: `Order ${id} Verified! File: ${ord.fileName || 'Doc'} (${ord.copies || 1} copies, ₹${ord.amount || 0}) — Status updated to Ready!`,
          }
        }
      } catch (err) {
        console.warn('Fallback status check failed:', err)
      }
    }

    setResult(res)
    setLoading(false)
    if (res && res.success) {
      setLastPrint({ orderId: id, time: new Date().toLocaleTimeString() })
      setOrderId('XB')
    }
    // Re-focus after result
    setTimeout(() => inputRef.current?.focus(), 300)
  }

  function handleLock() {
    sessionStorage.removeItem(SESSION_KEY)
    onLock()
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-orange-100 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#F78C25] flex items-center justify-center">
            <span className="text-white font-bold">X</span>
          </div>
          <div>
            <p className="text-[#222222] font-bold text-sm">X Buddy Terminal</p>
            <p className="text-[#6B7280] text-xs">Campus Print Station</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[#222222] font-mono text-lg">{time.toLocaleTimeString()}</p>
            <p className="text-[#6B7280] text-xs">{time.toLocaleDateString()}</p>
          </div>
          <button
            onClick={handleLock}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-orange-50 text-[#6B7280] hover:bg-red-50 hover:text-red-500 transition-all border border-orange-200"
          >
            🔒 Lock
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {/* Title */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🖨️</span>
            </div>
            <h1 className="text-3xl font-bold text-[#222222]">Release Print</h1>
            <p className="text-[#6B7280] mt-2">Enter the student's Order ID to start printing</p>
          </div>

          {/* Form */}
          <form onSubmit={handleRelease} className="space-y-4">
            <input
              ref={inputRef}
              type="text"
              value={orderId}
              onChange={(e) => {
                const val = e.target.value.toUpperCase()
                if (!val.startsWith('XB')) { setOrderId('XB'); return }
                setOrderId(val)
                setResult(null)
              }}
              placeholder="XB0000"
              maxLength={7}
              className="w-full bg-[#FFF8F2] border-2 border-orange-200 rounded-2xl px-6 py-5 text-[#222222] text-4xl font-mono tracking-[0.3em] placeholder-gray-300 focus:outline-none focus:border-[#F78C25] focus:ring-2 focus:ring-orange-100 transition-colors text-center uppercase"
            />

            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  key={result.success ? 'ok' : 'err'}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`p-4 rounded-2xl text-base font-semibold flex items-center justify-center gap-3 ${
                    result.success
                      ? 'bg-green-50 border border-green-200 text-green-600'
                      : 'bg-red-50 border border-red-200 text-red-500'
                  }`}
                >
                  <span className="text-2xl">{result.success ? '✅' : '⚠️'}</span>
                  <span>{result.success ? result.message : result.error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={loading || !orderId.trim()}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.97 }}
              className="w-full py-5 bg-[#F78C25] hover:bg-[#e07010] disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold text-xl rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying & Printing...
                </>
              ) : '🖨️ Release Print'}
            </motion.button>
          </form>

          {/* Last printed */}
          <AnimatePresence>
            {lastPrint && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 rounded-2xl bg-white border border-orange-100 shadow-sm flex items-center justify-between"
              >
                <div>
                  <p className="text-[#6B7280] text-xs">Last printed</p>
                  <p className="text-[#222222] font-mono font-semibold">{lastPrint.orderId}</p>
                </div>
                <p className="text-[#6B7280] text-xs">{lastPrint.time}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status legend */}
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              ['✅', 'Valid Order', 'Prints immediately'],
              ['⚠️', 'Wrong ID',    'Rejected'],
              ['🔒', 'Duplicate',   'Blocked'],
            ].map(([icon, label, desc]) => (
              <div key={label} className="text-center p-3 rounded-xl bg-white border border-orange-100 shadow-sm">
                <p className="text-xl mb-1">{icon}</p>
                <p className="text-[#222222] text-xs font-medium">{label}</p>
                <p className="text-[#6B7280] text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 border-t border-orange-100 bg-white">
        <p className="text-[#6B7280] text-xs">X Buddy Booth Terminal</p>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function BoothApp() {
  const [authed, setAuthed] = useState(isAuthed)
  return authed
    ? <ReleasePrint onLock={() => setAuthed(false)} />
    : <PinLogin     onSuccess={() => setAuthed(true)} />
}
