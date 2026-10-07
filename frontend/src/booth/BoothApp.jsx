import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, AlertTriangle, Printer, CheckCircle2 } from 'lucide-react'
import { getOrderStatus, updateOrderStatus, boothLogin, validateAndRelease } from '../utils/api'

const SESSION_KEY   = 'xbuddy_booth_auth'

function isAuthed() { return sessionStorage.getItem(SESSION_KEY) === 'true' }

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
    const res = await boothLogin(pin)
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
            <Lock className="w-10 h-10 text-[#F78C25]" />
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
                className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-center flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full py-4 bg-[#F78C25] hover:bg-[#e07010] disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                <span>Unlock Terminal</span>
              </>
            )}
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
    
    // 1. Try agent print release (via Cloudflare tunnel / local agent)
    let res = await validateAndRelease(id)

    // 2. If order could not be sent to agent, check cloud order and alert operator
    if (!res || !res.success) {
      try {
        const cloudOrder = await getOrderStatus(id)
        if (cloudOrder?.success && cloudOrder?.order) {
          const ord = cloudOrder.order
          res = {
            success: false,
            orderId: id,
            error: `Order ${id} found in cloud (${ord.fileName || 'Doc'}), but Print Agent on kiosk is unreachable. Check local server or tunnel connection.`,
          }
        } else {
          res = {
            success: false,
            orderId: id,
            error: res?.error || `Order ${id} not found in database.`,
          }
        }
      } catch (err) {
        res = { success: false, error: 'Could not connect to printer or orders service.' }
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
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-orange-50 text-[#6B7280] hover:bg-red-50 hover:text-red-500 transition-all border border-orange-200 inline-flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock</span>
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
              <Printer className="w-10 h-10 text-[#F78C25]" />
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
                  {result.success ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
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
              className="w-full py-5 bg-[#F78C25] hover:bg-[#e07010] disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold text-xl rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying & Printing...</span>
                </>
              ) : (
                <>
                  <Printer className="w-6 h-6" />
                  <span>Release Print</span>
                </>
              )}
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
              { Icon: CheckCircle2, iconCls: 'text-green-500', label: 'Valid Order', desc: 'Prints immediately' },
              { Icon: AlertTriangle, iconCls: 'text-red-500', label: 'Wrong ID',    desc: 'Rejected' },
              { Icon: Lock, iconCls: 'text-amber-500', label: 'Duplicate',   desc: 'Blocked' },
            ].map(({ Icon, iconCls, label, desc }) => (
              <div key={label} className="text-center p-3 rounded-xl bg-white border border-orange-100 shadow-sm">
                <Icon className={`w-6 h-6 mx-auto mb-1 ${iconCls}`} />
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
