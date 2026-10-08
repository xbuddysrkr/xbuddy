import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock,
  Unlock,
  AlertTriangle,
  Printer,
  CheckCircle2,
  RefreshCw,
  FileText,
  Layers,
  ExternalLink,
  Eye,
  Zap,
  Clock,
  Sparkles,
  Copy,
  Check,
  Search,
  Wifi,
  ChevronRight,
  Info,
  X,
  FileCheck
} from 'lucide-react'
import {
  getOrderStatus,
  updateOrderStatus,
  boothLogin,
  validateAndRelease,
  fetchPendingOrders,
  fetchOrderPdfBlob,
  getOrderPdfUrl,
  triggerBrowserPrint
} from '../utils/api'

const SESSION_KEY = 'xbuddy_booth_auth'

function isAuthed() {
  return sessionStorage.getItem(SESSION_KEY) === 'true'
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
    const res = await boothLogin(pin)
    if (res.success) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      onSuccess()
    } else {
      setError(res.error || 'Wrong PIN. Try 4921')
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center px-4 font-sans text-slate-800">
      {/* Brand Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-10"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#EA580C] to-[#F78C25] flex items-center justify-center shadow-lg shadow-orange-500/20">
          <span className="text-white font-black text-2xl tracking-tight">X</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-slate-900 font-extrabold text-2xl tracking-tight">X Buddy</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-[#EA580C] uppercase tracking-wider">
              Booth
            </span>
          </div>
          <p className="text-slate-500 text-xs font-medium">Campus Xerox Station Terminal</p>
        </div>
      </motion.div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200/80 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-8 h-8 text-[#EA580C]" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Shopkeeper Terminal</h2>
          <p className="text-slate-500 text-xs mt-1">Enter your station PIN to open the browser print station</p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          animate={shake ? { x: [-8, 8, -6, 6, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl p-7 space-y-5 border border-orange-100 shadow-xl shadow-orange-950/5"
        >
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider text-center">
              Station Security PIN
            </label>
            <input
              ref={inputRef}
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError('') }}
              placeholder="••••"
              maxLength={8}
              className="w-full bg-[#FFF9F2] border-2 border-orange-200/70 rounded-2xl px-4 py-4 text-slate-900 text-3xl font-mono tracking-[0.5em] placeholder-slate-300 focus:outline-none focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all text-center"
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-rose-600 text-xs bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-center flex items-center justify-center gap-2 font-medium"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full py-4 bg-gradient-to-r from-[#EA580C] to-[#F78C25] hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                <span>Unlock Print Station</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-slate-400 font-medium">
            Default Station PIN: <span className="font-mono font-bold text-slate-600">4921</span>
          </p>
        </motion.form>
      </motion.div>
    </div>
  )
}

// ── Kiosk Setup Help Modal ───────────────────────────────────────────────────
function KioskHelpModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false)
  const chromeCmd = `chrome.exe --kiosk-printing "https://xbuddysrkr.vercel.app/booth.html"`

  function handleCopy() {
    navigator.clipboard.writeText(chromeCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#EA580C] flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">1-Click Silent Auto-Printing</h3>
            <p className="text-xs text-slate-500">Optional trick: Bypass the Windows print dialog completely</p>
          </div>
        </div>

        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <p>
            By default, clicking <strong>"Print"</strong> opens the browser preview and you press <strong>Enter</strong> to send to your printer.
          </p>
          <p>
            To make it print <strong>instantly with 0 clicks</strong> (just like a supermarket POS machine), create a Chrome shortcut with the <code className="bg-orange-50 text-[#EA580C] px-1.5 py-0.5 rounded font-mono font-bold">--kiosk-printing</code> flag:
          </p>

          <div className="bg-slate-900 text-slate-100 p-3.5 rounded-2xl font-mono text-[11px] relative flex items-center justify-between border border-slate-800">
            <span className="truncate pr-3">{chromeCmd}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-sans text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <ol className="list-decimal list-inside space-y-1 text-slate-500">
            <li>Right-click your Chrome desktop shortcut and select <strong>Properties</strong>.</li>
            <li>In the <strong>Target</strong> box, paste the command above.</li>
            <li>Click <strong>OK</strong>. Whenever opened from this shortcut, print is 100% silent!</li>
          </ol>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
          >
            Got it, thanks!
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Booth Release Station ────────────────────────────────────────────────
function ReleasePrintStation({ onLock }) {
  const [activeTab, setActiveTab] = useState('lookup') // 'lookup' | 'queue'
  const [orderId, setOrderId] = useState('XB')
  const [loading, setLoading] = useState(false)
  const [printLoading, setPrintLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [result, setResult] = useState(null)
  const [lastPrint, setLastPrint] = useState(null)
  const [pendingOrders, setPendingOrders] = useState([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [showKioskModal, setShowKioskModal] = useState(false)
  const [time, setTime] = useState(new Date())
  const inputRef = useRef()

  // Real-time Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-focus input on mount
  useEffect(() => {
    if (activeTab === 'lookup') inputRef.current?.focus()
  }, [activeTab])

  // Fetch pending queue
  const refreshQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const orders = await fetchPendingOrders()
      setPendingOrders(orders)
    } catch (err) {
      console.warn('Queue fetch error:', err)
    } finally {
      setQueueLoading(false)
    }
  }, [])

  // Poll queue every 6 seconds
  useEffect(() => {
    refreshQueue()
    const timer = setInterval(refreshQueue, 6000)
    return () => clearInterval(timer)
  }, [refreshQueue])

  // Look up order details
  async function handleLookupOrder(targetId) {
    const cleanId = (targetId || orderId).trim().toUpperCase()
    if (!cleanId || cleanId.length < 4) return
    setLoading(true)
    setResult(null)
    setSelectedOrder(null)

    try {
      const res = await getOrderStatus(cleanId)
      if (res?.success && (res?.order || res?.fileName)) {
        const ord = res.order || res
        setSelectedOrder(ord)
        setOrderId(cleanId)
      } else {
        setResult({
          success: false,
          error: `Order ${cleanId} not found in system. Please verify Order ID with the student.`,
        })
      }
    } catch (err) {
      setResult({
        success: false,
        error: `Could not fetch order: ${err.message}`,
      })
    } finally {
      setLoading(false)
    }
  }

  // 1-Click Direct In-Browser Print Action
  async function handleDirectPrint(orderToPrint) {
    const target = orderToPrint || selectedOrder
    if (!target) return
    const id = (target.orderId || target.id).trim().toUpperCase()

    setPrintLoading(true)
    setResult(null)

    try {
      // 1. Fetch PDF binary blob directly from cloud backend
      const pdfBlob = await fetchOrderPdfBlob(id)

      // 2. Trigger browser print (hidden iframe with fallback)
      await triggerBrowserPrint(pdfBlob)

      // 3. Mark status as Printed in MongoDB Atlas
      await updateOrderStatus(id, 'Printed')

      setLastPrint({
        orderId: id,
        fileName: target.fileName || `${id}.pdf`,
        time: new Date().toLocaleTimeString(),
      })

      // Update state
      if (selectedOrder && (selectedOrder.orderId === id || selectedOrder.id === id)) {
        setSelectedOrder(prev => ({ ...prev, printStatus: 'Printed' }))
      }

      // Refresh queue to remove completed job
      refreshQueue()

      setResult({
        success: true,
        message: `Order ${id} sent to printer! Status marked as Printed.`,
      })
    } catch (err) {
      console.error('[Direct Print Failed]:', err)
      // Provide actionable fallback so shopkeeper is never stranded
      const pdfUrl = getOrderPdfUrl(id)
      setResult({
        success: false,
        error: `Browser print preview issue: ${err.message}. You can still click "Preview & Print PDF" below.`,
        fallbackUrl: pdfUrl,
      })
    } finally {
      setPrintLoading(false)
    }
  }

  function handleLock() {
    sessionStorage.removeItem(SESSION_KEY)
    onLock()
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans text-slate-800">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 lg:px-10 py-4 bg-white/90 backdrop-blur-md border-b border-orange-100 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#EA580C] to-[#F78C25] flex items-center justify-center shadow-md shadow-orange-500/20">
            <span className="text-white font-black text-xl">X</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-slate-900 font-extrabold text-base tracking-tight">X Buddy Station</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Zero-Setup Web Print Active
              </span>
            </div>
            <p className="text-slate-500 text-xs">Direct In-Browser Printing (No Agent or Tunnels Needed)</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowKioskModal(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-50 text-[#EA580C] hover:bg-orange-100 transition-colors border border-orange-200"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Silent Kiosk Mode</span>
          </button>

          <div className="text-right hidden md:block">
            <p className="text-slate-900 font-mono font-bold text-sm">{time.toLocaleTimeString()}</p>
            <p className="text-slate-400 text-[11px] font-medium">{time.toLocaleDateString()}</p>
          </div>

          <button
            onClick={handleLock}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all border border-slate-200/80 inline-flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-orange-100 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('lookup')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'lookup'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-slate-600 hover:bg-orange-50/60 border border-slate-200/60'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Enter Order ID</span>
            </button>

            <button
              onClick={() => { setActiveTab('queue'); refreshQueue() }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 relative ${
                activeTab === 'queue'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-slate-600 hover:bg-orange-50/60 border border-slate-200/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Live Queue</span>
              {pendingOrders.length > 0 && (
                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'queue' ? 'bg-white text-orange-600' : 'bg-orange-500 text-white'
                }`}>
                  {pendingOrders.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={refreshQueue}
            disabled={queueLoading}
            className="p-2 rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${queueLoading ? 'animate-spin text-orange-500' : ''}`} />
          </button>
        </div>

        {/* TAB 1: Direct Order Lookup */}
        {activeTab === 'lookup' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Input Card */}
            <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-orange-100 shadow-sm space-y-4">
              <div className="text-center sm:text-left">
                <h3 className="text-base font-bold text-slate-900">Release by Order ID</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Type the student's 6-character code (e.g. XB1024)
                </p>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); handleLookupOrder() }}
                className="space-y-3"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={orderId}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase()
                    if (!val.startsWith('XB')) { setOrderId('XB'); return }
                    setOrderId(val)
                    if (val.length >= 6) {
                      handleLookupOrder(val)
                    }
                  }}
                  placeholder="XB0000"
                  maxLength={7}
                  className="w-full bg-[#FFF9F2] border-2 border-orange-200/80 rounded-2xl px-4 py-4 text-slate-900 text-3xl font-mono tracking-[0.25em] placeholder-slate-300 focus:outline-none focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all text-center uppercase font-black"
                />

                <button
                  type="submit"
                  disabled={loading || orderId.length < 4}
                  className="w-full py-3.5 bg-gradient-to-r from-[#EA580C] to-[#F78C25] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Find Order</span>
                    </>
                  )}
                </button>
              </form>

              {/* Status / Error Toast */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-3.5 rounded-2xl text-xs font-semibold flex flex-col gap-2 ${
                      result.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : 'bg-rose-50 border border-rose-200 text-rose-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                      )}
                      <span>{result.message || result.error}</span>
                    </div>

                    {result.fallbackUrl && (
                      <a
                        href={result.fallbackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-orange-600 hover:underline pt-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Click here to open PDF preview window directly</span>
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Last Printed Card */}
              {lastPrint && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Last Printed: <strong className="font-mono text-slate-800">{lastPrint.orderId}</strong></span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{lastPrint.time}</span>
                </div>
              )}
            </div>

            {/* Order Details Ticket */}
            <div className="lg:col-span-7">
              {selectedOrder ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl p-6 border border-orange-100 shadow-sm space-y-6"
                >
                  {/* Ticket Header */}
                  <div className="flex items-start justify-between border-b border-orange-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black font-mono text-slate-900 tracking-wider">
                          {selectedOrder.orderId || selectedOrder.id}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          String(selectedOrder.printStatus).toLowerCase() === 'printed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {selectedOrder.printStatus || 'Waiting'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-orange-500" />
                        <span className="font-medium text-slate-700 truncate max-w-xs">{selectedOrder.fileName || 'Document.pdf'}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-2xl font-black text-[#EA580C]">
                        ₹{selectedOrder.amount || selectedOrder.totalCost || 0}
                      </span>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Paid Amount</p>
                    </div>
                  </div>

                  {/* Print Settings Grid */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Print Specifications
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-[#FFF9F2] p-3 rounded-2xl border border-orange-100/80">
                        <p className="text-[10px] text-slate-400 font-medium">Copies</p>
                        <p className="text-sm font-black text-slate-800 font-mono">
                          {selectedOrder.copies || 1} {selectedOrder.copies > 1 ? 'copies' : 'copy'}
                        </p>
                      </div>

                      <div className="bg-[#FFF9F2] p-3 rounded-2xl border border-orange-100/80">
                        <p className="text-[10px] text-slate-400 font-medium">Color Mode</p>
                        <p className="text-sm font-black text-slate-800">
                          {selectedOrder.colorMode === 'color' || selectedOrder.printType === 'Color' ? '🎨 Color' : '⬛ B&W'}
                        </p>
                      </div>

                      <div className="bg-[#FFF9F2] p-3 rounded-2xl border border-orange-100/80">
                        <p className="text-[10px] text-slate-400 font-medium">Sides</p>
                        <p className="text-sm font-black text-slate-800">
                          {selectedOrder.duplex || selectedOrder.printSide === 'Double' ? '🔄 Double Sided' : '📄 Single Sided'}
                        </p>
                      </div>

                      <div className="bg-[#FFF9F2] p-3 rounded-2xl border border-orange-100/80">
                        <p className="text-[10px] text-slate-400 font-medium">Pages</p>
                        <p className="text-sm font-black text-slate-800 truncate" title={selectedOrder.customPages || 'All'}>
                          {selectedOrder.pageRange === 'custom' ? `Pg: ${selectedOrder.customPages}` : 'All Pages'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Student Contact Info if available */}
                  {selectedOrder.name && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                      <span>Student: <strong>{selectedOrder.name}</strong></span>
                      {selectedOrder.createdAt && (
                        <span className="text-slate-400 font-mono text-[11px]">
                          {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Primary Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={() => handleDirectPrint(selectedOrder)}
                      disabled={printLoading}
                      className="flex-1 py-4 bg-gradient-to-r from-[#EA580C] to-[#F78C25] hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base rounded-2xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2.5"
                    >
                      {printLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>Streaming & Printing...</span>
                        </>
                      ) : (
                        <>
                          <Printer className="w-5 h-5" />
                          <span>Print Document Now</span>
                        </>
                      )}
                    </button>

                    <a
                      href={getOrderPdfUrl(selectedOrder.orderId || selectedOrder.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2"
                      title="Inspect PDF in browser tab before printing"
                    >
                      <Eye className="w-4 h-4 text-slate-500" />
                      <span>Preview PDF</span>
                    </a>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-white/60 border-2 border-dashed border-orange-200/80 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-400 flex items-center justify-center mb-3">
                    <FileCheck className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No Order Selected</h4>
                  <p className="text-xs text-slate-400 max-w-xs mt-1">
                    Enter an Order ID on the left or click any waiting job in the <strong>Live Queue</strong> to start printing.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Live Pending Orders Queue */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Waiting Print Orders</h3>
                <p className="text-xs text-slate-500">
                  Real-time list of student print requests waiting for release
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Auto-updating every 6s
              </span>
            </div>

            {pendingOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-orange-100 shadow-sm flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-slate-800">All Caught Up!</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  There are no pending print jobs waiting right now. When students submit orders, they will appear here instantly.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingOrders.map((ord) => {
                  const id = ord.orderId || ord.id
                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl p-5 border border-orange-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-lg text-slate-900">
                              {id}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Waiting
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium truncate max-w-xs mt-1">
                            {ord.fileName || 'Document.pdf'}
                          </p>
                        </div>

                        <span className="text-lg font-black text-[#EA580C]">
                          ₹{ord.amount || ord.totalCost || 0}
                        </span>
                      </div>

                      {/* Specs Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <span className="px-2 py-1 rounded-lg bg-[#FFF9F2] border border-orange-100">
                          {ord.copies || 1} {ord.copies > 1 ? 'copies' : 'copy'}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-[#FFF9F2] border border-orange-100">
                          {ord.colorMode === 'color' || ord.printType === 'Color' ? '🎨 Color' : '⬛ B&W'}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-[#FFF9F2] border border-orange-100">
                          {ord.duplex || ord.printSide === 'Double' ? '🔄 Duplex' : '📄 Single'}
                        </span>
                        {ord.pageRange === 'custom' && (
                          <span className="px-2 py-1 rounded-lg bg-[#FFF9F2] border border-orange-100">
                            Pages: {ord.customPages}
                          </span>
                        )}
                      </div>

                      {/* Action Row */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleDirectPrint(ord)}
                          disabled={printLoading}
                          className="flex-1 py-2.5 bg-gradient-to-r from-[#EA580C] to-[#F78C25] hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          <Printer className="w-4 h-4" />
                          <span>Print Now (1-Click)</span>
                        </button>

                        <a
                          href={getOrderPdfUrl(id)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          title="Preview in new tab"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 px-6 border-t border-orange-100 bg-white text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>X Buddy Campus Xerox Station • Connected via Direct Browser Cloud Print</p>
        <p className="font-mono text-[11px]">SRKR Engineering College • Zero PC Setup Overhead</p>
      </footer>

      {/* Kiosk Mode Setup Modal */}
      <KioskHelpModal
        isOpen={showKioskModal}
        onClose={() => setShowKioskModal(false)}
      />
    </div>
  )
}

// ── Root App Component ────────────────────────────────────────────────────────
export default function BoothApp() {
  const [authed, setAuthed] = useState(isAuthed)

  return authed ? (
    <ReleasePrintStation onLock={() => setAuthed(false)} />
  ) : (
    <PinLogin onSuccess={() => setAuthed(true)} />
  )
}
