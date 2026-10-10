import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getMyOrders, saveOrder, updateOrder } from '../utils/orderStore'
import { getOrderStatus, reprintOrder } from '../utils/api'
import {
  Bell,
  Copy,
  Check,
  Store,
  FileText,
  ArrowRight,
  Search,
  Loader2,
  Clock,
  CreditCard,
  Inbox,
  Printer,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardList,
  X,
  RotateCw,
} from 'lucide-react'

// Status mappings for comprehensive lifecycle
export const STATUS_MAP = {
  'pending':                { label: 'Pending',              cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
  'payment submitted':      { label: 'Payment Submitted',    cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: CreditCard },
  'order received':         { label: 'Order Received',       cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  'waiting_for_shopkeeper': { label: 'Order Received',       cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  'waiting':                { label: 'Order Received',       cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  'accepted':               { label: 'Order Received',       cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  'queued':                 { label: 'Order Received',       cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  'printing':               { label: 'Printing...',          cls: 'bg-violet-50 text-violet-700 border-violet-200 animate-pulse', icon: Printer },
  'ready for collection':   { label: 'Ready for Collection', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold', icon: Store },
  'ready':                  { label: 'Ready for Collection', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold', icon: Store },
  'printed':                { label: 'Printed',              cls: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold', icon: CheckCircle2 },
  'collected':              { label: 'Collected',            cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: CheckCircle2 },
  'cancelled':              { label: 'Cancelled',            cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  'failed':                 { label: 'Order Failed',         cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
}

export function getStatusInfo(rawStatus) {
  if (!rawStatus) return STATUS_MAP['order received']
  const key = String(rawStatus).toLowerCase().trim().replace(/[\s-]+/g, ' ')
  if (STATUS_MAP[key]) return STATUS_MAP[key]
  const underscoredKey = key.replace(/\s+/g, '_')
  if (STATUS_MAP[underscoredKey]) return STATUS_MAP[underscoredKey]
  if (key.includes('print') && !key.includes('not')) {
    if (key === 'printed') return STATUS_MAP['printed']
    return STATUS_MAP['printing']
  }
  if (key.includes('ready')) return STATUS_MAP['ready for collection']
  return STATUS_MAP['order received']
}

function formatRemainingCountdown(seconds) {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

export default function MyOrdersPage({ onStartPrinting }) {
  const [orders, setOrders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [liveStatuses, setLiveStatuses] = useState({})
  const [liveOrderData, setLiveOrderData] = useState({})
  const [serverOffset, setServerOffset] = useState(0)
  const [reprintingId, setReprintingId] = useState(null)
  const [reprintMessage, setReprintMessage] = useState(null)
  const [tick, setTick] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [shopModalOrder, setShopModalOrder] = useState(null)
  const [copied, setCopied] = useState(false)
  const [cloudSearching, setCloudSearching] = useState(false)
  const [cloudSearchError, setCloudSearchError] = useState('')
  const pollRef = useRef(null)

  // Load orders from localStorage
  const loadOrders = () => {
    const data = getMyOrders()
    setOrders(data)
  }

  useEffect(() => {
    loadOrders()
  }, [])

  // 1-second interval ticker for smooth countdown rendering
  useEffect(() => {
    const ticker = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(ticker)
  }, [])

  // Live polling for getOrderStatus(orderId) across saved orders
  useEffect(() => {
    if (orders.length === 0) return

    async function pollStatuses() {
      const statusUpdates = {}
      const dataUpdates = {}

      const results = await Promise.allSettled(
        orders.filter(o => o.orderId).map(async (order) => {
          const res = await getOrderStatus(order.orderId)
          return { orderId: order.orderId, res }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.res?.success) {
          const { orderId, res } = result.value
          const ord = res.order || res
          const st = ord.printStatus || res.printStatus
          if (st) {
            statusUpdates[orderId] = st
            updateOrder(orderId, {
              status: st,
              printStatus: st,
              paymentStatus: ord.paymentStatus,
              printedAt: ord.printedAt,
              pdfExpiresAt: ord.pdfExpiresAt,
              pdfDeletedAt: ord.pdfDeletedAt,
              hasPdf: ord.hasPdf,
            })
          }
          dataUpdates[orderId] = {
            printStatus: st,
            printedAt: ord.printedAt,
            pdfExpiresAt: ord.pdfExpiresAt,
            pdfDeletedAt: ord.pdfDeletedAt,
            hasPdf: ord.hasPdf,
            paymentStatus: ord.paymentStatus,
            reprintCount: Number(ord.reprintCount) || 0,
            reprintEligible: ord.reprintEligible,
            reprintReason: ord.reprintReason,
          }
          if (res.serverTime) {
            setServerOffset(Date.now() - new Date(res.serverTime).getTime())
          }
        }
      }

      if (Object.keys(statusUpdates).length > 0) {
        setLiveStatuses(prev => ({ ...prev, ...statusUpdates }))
      }
      if (Object.keys(dataUpdates).length > 0) {
        setLiveOrderData(prev => ({ ...prev, ...dataUpdates }))
      }
    }

    pollStatuses()
    pollRef.current = setInterval(pollStatuses, 5000)
    return () => clearInterval(pollRef.current)
  }, [orders])

  async function handleReprint(orderId) {
    if (!orderId || reprintingId) return
    setReprintingId(orderId)
    setReprintMessage(null)
    try {
      const res = await reprintOrder(orderId)
      if (res?.success) {
        setReprintMessage({
          orderId,
          type: 'success',
          text: 'Reprint requested successfully! Document is queued at the Xerox shop.',
        })
        setLiveStatuses(prev => ({ ...prev, [orderId]: 'waiting_for_shopkeeper' }))
        setLiveOrderData(prev => ({
          ...prev,
          [orderId]: {
            ...(prev[orderId] || {}),
            printStatus: 'waiting_for_shopkeeper',
            reprintPending: true,
          },
        }))
      } else {
        setReprintMessage({
          orderId,
          type: 'error',
          text: res?.error || 'Reprint window expired; document permanently deleted.',
        })
      }
    } catch (err) {
      setReprintMessage({
        orderId,
        type: 'error',
        text: `Network error: ${err.message}`,
      })
    } finally {
      setReprintingId(null)
    }
  }

  async function handleCloudSearch(targetId) {
    const id = (targetId || searchQuery).trim().toUpperCase()
    if (!id) return
    setCloudSearching(true)
    setCloudSearchError('')
    try {
      const res = await getOrderStatus(id)
      if (res?.success && (res?.order || res?.orderId)) {
        const ord = res.order || res
        const newOrder = {
          orderId: ord.orderId || id,
          fileName: ord.fileName || 'Document.pdf',
          totalPages: Number(ord.totalPages || 1),
          printableCount: Number(ord.printableCount || ord.totalPages || 1),
          copies: Number(ord.copies || 1),
          colorMode: ord.colorMode || 'bw',
          printType: ord.colorMode === 'color' ? 'Color' : 'B&W',
          printSide: ord.printSide || (ord.duplex ? 'Double' : 'Single'),
          duplex: ord.duplex === true || ord.printSide === 'Double',
          pageSize: ord.pageSize || 'A4',
          amount: Number(ord.amount || 0),
          status: ord.printStatus || 'Order Received',
          printStatus: ord.printStatus || 'Order Received',
          paymentStatus: ord.paymentStatus || 'Pending',
          printedAt: ord.printedAt,
          pdfExpiresAt: ord.pdfExpiresAt,
          pdfDeletedAt: ord.pdfDeletedAt,
          hasPdf: ord.hasPdf,
          transactionId: ord.transactionId || '',
          savedAt: Date.now(),
        }
        saveOrder(newOrder)
        loadOrders()
        setSearchQuery('')
      } else {
        setCloudSearchError(`Order "${id}" was not found in Google Sheets.`)
      }
    } catch {
      setCloudSearchError(`Network error while searching for "${id}".`)
    } finally {
      setCloudSearching(false)
    }
  }

  // Client-side filter by orderId or fileName
  const filteredOrders = orders.filter(o => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    const idMatch = o.orderId ? o.orderId.toLowerCase().includes(q) : false
    const nameMatch = o.fileName ? o.fileName.toLowerCase().includes(q) : false
    return idMatch || nameMatch
  })

  function handleCopyId(id) {
    if (!id) return
    navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatSavedAt(timestamp) {
    if (!timestamp) return 'Just now'
    try {
      const d = new Date(timestamp)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return 'Just now'
    }
  }

  // Check if any order is currently Ready for Collection
  const readyOrders = orders.filter(o => {
    const s = String(liveStatuses[o.orderId] || o.printStatus || o.status || '').toLowerCase().trim()
    return s === 'ready for collection' || s === 'ready' || s === 'printed'
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Ready for Collection Notification Banner */}
      <AnimatePresence>
        {readyOrders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <p className="text-emerald-900 font-bold text-sm">
                  Your X Buddy order is ready for collection!
                </p>
                <p className="text-emerald-700 text-xs mt-0.5">
                  Order ID{readyOrders.length > 1 ? 's' : ''}: <span className="font-mono font-extrabold">{readyOrders.map(o => o.orderId).join(', ')}</span> — Collect from the campus Xerox shop.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShopModalOrder(readyOrders[0])}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors whitespace-nowrap shadow-xs"
            >
              Show ID →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#222222] tracking-tight">
            My Print Orders
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Track live print status and access your Order IDs for Xerox shop collection.
          </p>
        </div>
        <button
          onClick={onStartPrinting}
          className="self-start md:self-auto px-4 py-2 bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 hover:shadow-lg transition-all"
        >
          + New Print Order
        </button>
      </div>

      {/* Search Filter Bar (Always visible to look up any Order ID) */}
      <div className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (filteredOrders.length === 0 && searchQuery.trim()) {
              handleCloudSearch(searchQuery)
            }
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-lg"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCloudSearchError('')
              }}
              placeholder="Search by Order ID (e.g. XB8709) or file name..."
              className="w-full bg-[#FAFAFA] border border-orange-200 rounded-xl pl-10 pr-9 py-2.5 text-[#222222] text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#F78C25] focus:ring-1 focus:ring-orange-200 transition-all uppercase"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setCloudSearchError('')
                }}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
                aria-label="Clear Search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery.trim().length >= 3 && (
            <button
              type="button"
              disabled={cloudSearching}
              onClick={() => handleCloudSearch(searchQuery)}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {cloudSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Looking up...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Find Order</span>
                </>
              )}
            </button>
          )}
        </form>

        {cloudSearchError && (
          <p className="mt-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg max-w-lg flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{cloudSearchError}</span>
          </p>
        )}
      </div>

      {/* Empty State */}
      {orders.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FFFDF9] border border-orange-200/80 rounded-3xl p-10 text-center max-w-md mx-auto my-12 shadow-sm"
        >
          <div className="w-20 h-20 bg-orange-50 border border-orange-200 rounded-3xl flex items-center justify-center mx-auto mb-4 text-[#F78C25] shadow-inner">
            <ClipboardList className="w-9 h-9" />
          </div>
          <h3 className="text-lg font-bold text-[#222222] mb-1">
            No local orders stored yet.
          </h3>
          <p className="text-gray-500 text-xs mb-6 max-w-xs mx-auto leading-relaxed">
            Placed an order on another device or phone? Enter your Order ID above (e.g. <strong>XB8709</strong>) to track it live!
          </p>
          <button
            onClick={onStartPrinting}
            className="px-6 py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold text-sm rounded-xl shadow-md shadow-orange-500/20 hover:shadow-lg transition-all cursor-pointer"
          >
            Start Printing
          </button>
        </motion.div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[#FFFDF9] border border-orange-100 rounded-2xl p-8 text-center my-6 max-w-lg">
          <p className="text-gray-600 text-sm font-semibold">
            No saved order matches "{searchQuery}"
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Check the Google Sheets database to pull this order into your tracking dashboard:
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              disabled={cloudSearching}
              onClick={() => handleCloudSearch(searchQuery)}
              className="px-4 py-2 bg-[#F78C25] hover:bg-[#e07010] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {cloudSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Find "{searchQuery.toUpperCase()}" on Server</span>
            </button>
            <button
              onClick={() => setSearchQuery('')}
              className="px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold"
            >
              Clear Filter
            </button>
          </div>
        </div>
      ) : (
        /* Orders List */
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const liveData = liveOrderData[order.orderId] || {}
            const rawStatus = liveData.printStatus || liveStatuses[order.orderId] || order.printStatus || order.status || 'Order Received'
            const statusInfo = getStatusInfo(rawStatus)
            const StatusIcon = statusInfo.icon

            const printedAt = liveData.printedAt || order.printedAt
            const normStatus = String(rawStatus).toLowerCase().trim()
            const isPrinted = normStatus === 'printed' || normStatus === 'ready for collection' || normStatus === 'ready' || Boolean(printedAt)

            // Derive deadline as printedAt + 30 minutes if pdfExpiresAt absent
            const effectiveExpiresAt = liveData.pdfExpiresAt || (printedAt ? new Date(new Date(printedAt).getTime() + 30 * 60 * 1000).toISOString() : null)
            const isPdfDeleted = Boolean(liveData.pdfDeletedAt || liveData.hasPdf === false)

            // Authoritative server-clock adjusted countdown
            const serverNow = Date.now() - serverOffset
            const remainingSecs = effectiveExpiresAt ? Math.max(0, Math.floor((new Date(effectiveExpiresAt).getTime() - serverNow) / 1000)) : 0
            const isExpired = Boolean(effectiveExpiresAt && remainingSecs <= 0)

            // Payment guard: reprint blocked if payment is pending, failed, rejected, or cancelled
            const normPayment = String(liveData.paymentStatus || order.paymentStatus || 'pending').toLowerCase().trim()
            const isPaymentEligible = normPayment === 'paid' || normPayment === 'completed'

            const canReprint = Boolean(
              isPrinted &&
              effectiveExpiresAt &&
              !isExpired &&
              !isPdfDeleted &&
              isPaymentEligible &&
              normStatus !== 'printing' &&
              !liveData.reprintPending &&
              (liveData.reprintEligible !== false)
            )

            return (
              <motion.div
                key={order.orderId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-orange-200/80 hover:border-orange-300 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[#F78C25] text-base">
                      {order.orderId}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${statusInfo.cls}`}>
                      <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{statusInfo.label}</span>
                    </span>
                  </div>
                  <p className="text-[#222222] font-semibold text-sm truncate">
                    {order.fileName}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span>{order.printableCount || order.totalPages} {Number(order.printableCount || order.totalPages) === 1 ? 'page' : 'pages'}</span>
                    <span>•</span>
                    <span>{order.copies} {order.copies === 1 ? 'copy' : 'copies'}</span>
                    <span>•</span>
                    <span>{order.printType}</span>
                    <span>•</span>
                    <span className="font-bold text-gray-700">₹{order.amount}</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Placed: {formatSavedAt(order.savedAt)}
                  </p>

                  {/* 30-Minute Retention Countdown & Status Badges */}
                  {canReprint && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-xl mt-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
                      <span>Reprint available: <strong className="font-mono font-bold text-amber-900">{formatRemainingCountdown(remainingSecs)}</strong></span>
                      {liveData.reprintCount > 0 && (
                        <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-1.5 py-0.5 rounded-md ml-1">
                          {liveData.reprintCount} {liveData.reprintCount === 1 ? 'reprint' : 'reprints'}
                        </span>
                      )}
                    </div>
                  )}

                  {(isExpired || isPdfDeleted) && (isPrinted || printedAt) && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Reprint window expired; document permanently deleted.</span>
                    </div>
                  )}

                  {liveData.reprintPending && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl mt-1">
                      <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                      <span>Reprint queued — waiting for Xerox shop dispatch</span>
                    </div>
                  )}

                  {reprintMessage && reprintMessage.orderId === order.orderId && (
                    <div className={`mt-2 p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                      reprintMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {reprintMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{reprintMessage.text}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-orange-100 flex-wrap">
                  {canReprint && (
                    <button
                      id={`reprint-btn-${order.orderId}`}
                      disabled={reprintingId === order.orderId}
                      onClick={() => handleReprint(order.orderId)}
                      className="px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      title="Reprint order using existing stored PDF within 30 minutes"
                    >
                      {reprintingId === order.orderId ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Queueing...</span>
                        </>
                      ) : (
                        <>
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Reprint</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setShopModalOrder(order)}
                    className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-[#F78C25] border border-orange-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Store className="w-3.5 h-3.5 shrink-0" />
                    <span>Show Order ID</span>
                  </button>
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* View Details Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 bg-white border border-orange-200 rounded-3xl p-6 w-full max-w-md shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#222222]">Order Details</h3>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 text-gray-400 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close Order Details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Order ID Banner */}
                <div className="p-4 bg-[#FFF8F2] border border-orange-200 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Order ID</p>
                    <p className="font-mono text-xl font-extrabold text-[#F78C25]">
                      {selectedOrder.orderId}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyId(selectedOrder.orderId)}
                    className="px-3 py-1.5 bg-white border border-orange-200 text-[#F78C25] font-bold text-xs rounded-lg hover:bg-orange-50 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      'Copy ID'
                    )}
                  </button>
                </div>

                {/* Details Breakdown */}
                <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">File Name:</span>
                    <span className="font-semibold text-gray-800 text-right truncate max-w-[200px]">
                      {selectedOrder.fileName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Pages:</span>
                    <span className="font-semibold text-gray-800">{selectedOrder.totalPages}</span>
                  </div>
                  {(selectedOrder.pageRangeMode === 'custom' || (selectedOrder.pageRange && selectedOrder.pageRange !== 'all') || selectedOrder.customPages) && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Custom Pages:</span>
                      <span className="font-semibold text-[#F78C25]">{selectedOrder.customPages || selectedOrder.pageRange} ({selectedOrder.printableCount || selectedOrder.selectedPageCount || selectedOrder.totalPages} pages)</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Copies:</span>
                    <span className="font-semibold text-gray-800">{selectedOrder.copies}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Print Color:</span>
                    <span className="font-semibold text-gray-800">{selectedOrder.printType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Print Side:</span>
                    <span className="font-semibold text-gray-800">{selectedOrder.printSide || 'Single'}</span>
                  </div>
                  {selectedOrder.printingCost > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Printing Cost:</span>
                      <span className="font-medium text-gray-700">₹{selectedOrder.printingCost}</span>
                    </div>
                  )}
                  {(selectedOrder.digitalProcessingFee > 0 || selectedOrder.serviceFee > 0) && (
                    <div className="flex justify-between text-gray-500">
                      <span>Digital Processing Fee:</span>
                      <span className="font-medium text-gray-700">+₹{selectedOrder.digitalProcessingFee || selectedOrder.serviceFee}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="text-gray-700 font-bold">Total Paid:</span>
                    <span className="font-extrabold text-[#F78C25] text-sm">₹{selectedOrder.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Placed On:</span>
                    <span className="text-gray-600">{formatSavedAt(selectedOrder.savedAt)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="text-gray-500 font-medium">Order Status:</span>
                    {(() => {
                      const curStatus = STATUS_MAP[liveStatuses[selectedOrder.orderId] || selectedOrder.status || 'Order Received'] || STATUS_MAP['Order Received']
                      const CurIcon = curStatus.icon
                      return (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${curStatus.cls}`}>
                          <CurIcon className="w-3 h-3 shrink-0" />
                          <span>{curStatus.label}</span>
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Details Modal 30-Minute Retention & Reprint Guard */}
                {(() => {
                  const selData = liveOrderData[selectedOrder.orderId] || {}
                  const selStatus = selData.printStatus || liveStatuses[selectedOrder.orderId] || selectedOrder.status || 'Order Received'
                  const isPrinted = selStatus === 'Printed' || selStatus === 'Ready for Collection' || selStatus === 'Ready' || Boolean(selData.printedAt)
                  const pdfExpiresAt = selData.pdfExpiresAt
                  const isPdfDeleted = Boolean(selData.pdfDeletedAt || selData.hasPdf === false)
                  const serverNow = Date.now() - serverOffset
                  const remainingSecs = pdfExpiresAt ? Math.max(0, Math.floor((new Date(pdfExpiresAt).getTime() - serverNow) / 1000)) : 0
                  const isExpired = Boolean(pdfExpiresAt && remainingSecs <= 0)

                  const canReprint = Boolean(
                    isPrinted &&
                    pdfExpiresAt &&
                    !isExpired &&
                    !isPdfDeleted &&
                    selData.paymentStatus !== 'failed' &&
                    selData.paymentStatus !== 'rejected' &&
                    selData.paymentStatus !== 'cancelled' &&
                    selStatus !== 'Printing' &&
                    !selData.reprintPending
                  )

                  if (canReprint) {
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="text-xs">
                            <span className="text-amber-800 font-semibold">Reprint window: </span>
                            <strong className="font-mono font-bold text-amber-950">{formatRemainingCountdown(remainingSecs)}</strong>
                          </div>
                        </div>
                        <button
                          id={`modal-reprint-btn-${selectedOrder.orderId}`}
                          disabled={reprintingId === selectedOrder.orderId}
                          onClick={() => handleReprint(selectedOrder.orderId)}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          {reprintingId === selectedOrder.orderId ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Queueing...</span>
                            </>
                          ) : (
                            <>
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>Reprint Document</span>
                            </>
                          )}
                        </button>
                      </div>
                    )
                  }

                  if ((isExpired || isPdfDeleted) && (isPrinted || selData.printedAt)) {
                    return (
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Reprint window expired; document permanently deleted.</span>
                      </div>
                    )
                  }

                  return null
                })()}

                <button
                  onClick={() => {
                    const ord = selectedOrder
                    setSelectedOrder(null)
                    setShopModalOrder(ord)
                  }}
                  className="w-full py-3 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>Show Order ID at Xerox Shop</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Show at Xerox Shop Modal (Large Clear Order ID Display) */}
      <AnimatePresence>
        {shopModalOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShopModalOrder(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="relative z-10 bg-[#FFFDF9] border-2 border-orange-300 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl"
            >
              <button
                onClick={() => setShopModalOrder(null)}
                className="absolute right-4 top-4 w-8 h-8 rounded-full bg-orange-100 hover:bg-orange-200 text-gray-500 flex items-center justify-center text-xs transition-colors cursor-pointer"
                aria-label="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-14 h-14 bg-orange-100 border border-orange-200 rounded-2xl flex items-center justify-center mx-auto mb-3 text-[#F78C25]">
                <Store className="w-7 h-7" />
              </div>

              <h3 className="text-base font-bold text-[#222222]">
                Show at Campus Xerox Shop
              </h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                The Xerox shop staff will look up this Order ID to hand over your printed documents.
              </p>

              {/* Large, clear, copyable Order ID display */}
              <div className="bg-white border-2 border-orange-200 rounded-2xl p-4 mb-4 shadow-inner">
                <p className="text-[10px] uppercase font-extrabold text-orange-400 tracking-wider mb-1">
                  ORDER ID
                </p>
                <p className="font-mono text-3xl font-black text-[#F78C25] tracking-widest selection:bg-orange-200">
                  {shopModalOrder.orderId}
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleCopyId(shopModalOrder.orderId)}
                  className="w-full py-2.5 bg-[#F78C25] hover:bg-[#e07010] text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Order ID Copied!</span>
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-4 h-4 text-white" />
                      <span>Copy Order ID</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 truncate">
                  File: <span className="font-medium text-gray-600">{shopModalOrder.fileName}</span>
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

