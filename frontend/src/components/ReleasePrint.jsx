import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Store, AlertTriangle, Unlock, Lock, Printer, CheckCircle2 } from 'lucide-react'
import {
  boothLogin,
  validateAndRelease,
  fetchOrderPdfBlob,
  triggerBrowserPrint,
  updateOrderStatus,
  getOrderStatus
} from '../utils/api'

const SESSION_KEY     = 'xbuddy_booth_auth'
const INACTIVITY_MS   = 5 * 60 * 1000  // 5 minutes

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === 'true'
}

// ── PIN Login Screen ──────────────────────────────────────────────────────────
function BoothLogin({ onSuccess }) {
  const [pin,     setPin]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const inputRef = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (pin.length < 4) return
    setLoading(true)
    setError('')
    const res = await boothLogin(pin)
    if (res.success) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      onSuccess()
    } else {
      setError(res.error || 'Wrong PIN')
      setPin('')
      inputRef.current?.focus()
    }
    setLoading(false)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto px-4 py-20"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mx-auto mb-4">
          <Store className="w-8 h-8 text-[#F7931E]" />
        </div>
        <h2 className="text-2xl font-bold text-white">Xerox Shop Terminal</h2>
        <p className="text-gray-400 text-sm mt-1">Enter shopkeeper PIN to access print release</p>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Staff PIN</label>
          <input
            ref={inputRef}
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError('') }}
            placeholder="••••"
            maxLength={8}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-mono tracking-widest placeholder-gray-600 focus:outline-none focus:border-[#F7931E] transition-colors text-center"
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={loading || pin.length < 4}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Unlock className="w-4 h-4" />
              <span>Unlock Booth</span>
            </>
          )}
        </motion.button>
      </form>
    </motion.section>
  )
}

// ── Release Panel ─────────────────────────────────────────────────────────────
function BoothPanel({ onLogout }) {
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const timerRef = useRef(null)

  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY)
      onLogout()
    }, INACTIVITY_MS)
  }, [onLogout])

  useEffect(() => {
    resetTimer()
    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('keydown',   resetTimer)
    return () => {
      clearTimeout(timerRef.current)
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('keydown',   resetTimer)
    }
  }, [resetTimer])

  async function handleRelease(e) {
    e.preventDefault()
    const id = orderId.trim().toUpperCase()
    if (!id) return
    setLoading(true)
    setResult(null)

    // 1. Try agent print release first (via local agent if running)
    let res = await validateAndRelease(id)

    // 2. If agent unreachable, seamlessly fall back to Direct In-Browser Print!
    if (!res || !res.success) {
      try {
        const pdfBlob = await fetchOrderPdfBlob(id)
        await triggerBrowserPrint(pdfBlob)
        await updateOrderStatus(id, 'Printed')
        res = {
          success: true,
          message: `Order ${id} sent to browser printer! Marked as Printed.`,
        }
      } catch (printErr) {
        // Check if order exists in cloud database
        const cloudOrder = await getOrderStatus(id)
        if (cloudOrder?.success && (cloudOrder.order || cloudOrder.fileName)) {
          res = {
            success: false,
            error: `Browser print error: ${printErr.message}. Check browser permissions.`,
          }
        } else {
          res = {
            success: false,
            error: `Order ${id} not found in database.`,
          }
        }
      }
    }

    setResult(res)
    setLoading(false)
    if (res.success) setOrderId('')
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY)
    onLogout()
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto px-4 py-16"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Printer className="w-6 h-6 text-[#F7931E]" />
            <span>Xerox Shop Terminal</span>
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">Enter student's Order ID to print</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all inline-flex items-center gap-1.5"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock</span>
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleRelease} className="glass rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Student Order ID</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => { setOrderId(e.target.value.toUpperCase()); setResult(null) }}
            placeholder="e.g. XB2045"
            maxLength={8}
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-mono tracking-widest placeholder-gray-600 focus:outline-none focus:border-[#F7931E] transition-colors text-center"
          />
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                result.success
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{result.success ? result.message : result.error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={loading || !orderId.trim()}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.97 }}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying & Printing...
            </>
          ) : (
            <>
              <Printer className="w-4 h-4" />
              <span>Release Print</span>
            </>
          )}
        </motion.button>
      </form>

      {/* Info */}
      <div className="mt-6 space-y-2">
        {[
          { Icon: CheckCircle2, iconCls: 'text-green-400', label: 'Valid Order ID', desc: 'Print starts immediately' },
          { Icon: AlertTriangle, iconCls: 'text-red-400', label: 'Wrong Order ID', desc: 'Rejected with error' },
          { Icon: Lock, iconCls: 'text-amber-400', label: 'Already Printed', desc: 'Blocked — no duplicate print' },
        ].map(({ Icon, iconCls, label, desc }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/3 border border-white/5">
            <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
            <div>
              <p className="text-white text-xs font-medium">{label}</p>
              <p className="text-gray-600 text-xs">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-gray-700 text-xs mt-6">Auto-locks after 5 min of inactivity</p>
    </motion.section>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function ReleasePrint() {
  const [authed, setAuthed] = useState(isAuthenticated)
  return authed
    ? <BoothPanel  onLogout={() => setAuthed(false)} />
    : <BoothLogin  onSuccess={() => setAuthed(true)} />
}
