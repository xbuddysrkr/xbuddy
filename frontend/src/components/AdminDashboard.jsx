import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  DollarSign,
  Printer,
  Clock3,
  Search,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Store,
  Phone,
  Calendar,
  Layers,
  Check,
  X,
  Play,
  PackageCheck,
  Eye,
  Download,
  Filter,
  Receipt,
  ChevronDown,
  ChevronUp,
  LogOut,
  ShieldCheck,
  BarChart3,
  ArrowUpRight,
  Inbox,
  Copy,
} from 'lucide-react'
import {
  fetchAdminOrders,
  fetchAdminStats,
  fetchHealthStatus,
  updateOrderStatus,
  validateAndRelease,
  verifyAndApprovePayment,
  verifyAdsPassword,
} from '../utils/api'
import { calcDigitalProcessingFee } from '../utils/pricing'

const STATUS_BADGES = {
  'Pending':               'bg-amber-100 text-amber-800 border border-amber-300',
  'Payment Submitted':     'bg-amber-100 text-amber-800 border border-amber-300',
  'Order Received':        'bg-blue-100 text-blue-800 border border-blue-300',
  'Accepted':              'bg-blue-100 text-blue-800 border border-blue-300',
  'Waiting':               'bg-blue-100 text-blue-800 border border-blue-300',
  'Printing':              'bg-purple-100 text-purple-800 border border-purple-300 animate-pulse',
  'Ready for Collection':  'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold',
  'Ready':                 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold',
  'Collected':             'bg-stone-100 text-stone-700 border border-stone-300',
  'Printed':               'bg-emerald-100 text-emerald-800 border border-emerald-300',
  'Cancelled':             'bg-rose-100 text-rose-800 border border-rose-300',
  'Failed':                'bg-rose-100 text-rose-800 border border-rose-300',
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'xbuddy@4921'
const formatCurrency = value => `₹${Number(value || 0).toLocaleString()}`

export default function AdminDashboard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('feeReport') // 'feeReport' | 'orders'
  const [dateFilter, setDateFilter] = useState('ALL') // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'
  const [collapsedStations, setCollapsedStations] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState('')
  const [realConnected, setRealConnected] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [reconcileFeedback, setReconcileFeedback] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('xbuddyAdminAuthorized')
      if (saved === 'true') {
        setIsAuthorized(true)
      }
    }
  }, [])

  const handleAdminLogin = async (event) => {
    event.preventDefault()
    if (!adminPassword) return
    const res = await verifyAdsPassword(adminPassword)
    if (res?.success || (ADMIN_PASSWORD && adminPassword === ADMIN_PASSWORD)) {
      setIsAuthorized(true)
      setAuthError('')
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('xbuddyAdminAuthorized', 'true')
        window.sessionStorage.setItem('xbuddy_admin_password', adminPassword)
      }
      return
    }
    setAuthError(res?.error || 'Incorrect password. Please try again.')
  }

  const handleAdminLogout = () => {
    setIsAuthorized(false)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('xbuddyAdminAuthorized')
      window.sessionStorage.removeItem('xbuddy_admin_password')
    }
  }

  // Load real orders from backend & Google Sheets
  useEffect(() => {
    if (!isAuthorized) return
    let isMounted = true

    async function loadAdminData() {
      try {
        const ordersRes = await fetchAdminOrders()

        if (!isMounted) return

        if (ordersRes?.success && Array.isArray(ordersRes.orders)) {
          setRealConnected(true)
          const formatted = ordersRes.orders.map(o => {
            const nameStr = o.name != null ? String(o.name).trim() : ''
            const isPhone = /^\d{10}$/.test(nameStr)
            const phone = isPhone ? nameStr : (o.phone ? String(o.phone).trim() : '')
            const studentName = !isPhone && nameStr ? nameStr : (o.studentName || 'Student')

            let dateStr = ''
            let timeStr = ''
            if (o.timestamp) {
              try {
                const d = new Date(o.timestamp)
                if (!isNaN(d.getTime())) {
                  dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                } else {
                  dateStr = String(o.timestamp).split(' ')[0]
                  timeStr = String(o.timestamp)
                }
              } catch {
                dateStr = String(o.timestamp)
              }
            } else if (o.time) {
              timeStr = o.time
              dateStr = o.date || ''
            }

            let currentStatus = o.status || o.printStatus || 'Waiting'
            if (currentStatus === 'waiting_for_shopkeeper') currentStatus = 'Order Received'

            const cleanOrderId = String(o.id || o.orderId || '').trim().toUpperCase()
            const dynamicStation = String(
              o.stationId ||
              o.station ||
              (cleanOrderId === 'XB-TEST-01' || cleanOrderId.startsWith('XB-TEST-') ? 'TEST-01' : 'SRKR-XEROX-01')
            ).trim().toUpperCase()

            const pages = Number(o.pages || o.totalPages || 1)
            const copies = Number(o.copies || 1)
            const isDouble = Boolean(o.duplex || o.printSide === 'Double')
            const printablePages = Number(o.printableCount || o.selectedPageCount || pages)
            const billablePages = (isDouble ? Math.ceil(printablePages / 2) : printablePages) * copies

            let fee = Number(o.digitalProcessingFee ?? o.serviceFee ?? 0)
            if (!fee || isNaN(fee) || fee <= 0) {
              if (o.amount && o.printingCost && Number(o.amount) > Number(o.printingCost)) {
                fee = Number(o.amount) - Number(o.printingCost)
              } else {
                const calculated = calcDigitalProcessingFee(billablePages)
                fee = calculated?.fee || 1
              }
            }

            const printCost = Number(o.printingCost) || Math.max(0, Number(o.amount || 0) - fee)

            return {
              id: cleanOrderId,
              studentName,
              phone,
              fileName: o.fileName || 'Document.pdf',
              pages,
              copies,
              printType: o.printType || (o.colorMode === 'color' ? 'Color' : 'B&W'),
              printSide: o.printSide || 'Single',
              customPages: o.customPages || '',
              amount: Number(o.amount || 0),
              printingCost: printCost,
              digitalProcessingFee: fee,
              stationId: dynamicStation,
              paymentStatus: o.paymentStatus || 'Pending',
              isPaid: ['paid', 'verified'].includes(String(o.paymentStatus || '').toLowerCase()) || Boolean(o.isPaid),
              status: currentStatus,
              time: timeStr || 'Just now',
              date: dateStr || new Date().toISOString().split('T')[0],
              timestamp: o.timestamp || o.createdAt || '',
              expiresAt: o.expiresAt || o.checkoutExpiresAt || '',
              pdfUrl: o.pdfUrl || o.driveUrl || '',
              driveUrl: o.driveUrl || '',
              transactionId: o.transactionId ? String(o.transactionId) : '',
              releaseStatus: o.releaseStatus || '',
            }
          })

          // Latest orders first
          setOrders(formatted.reverse())
        }
      } catch (err) {
        console.error('Failed to load real admin orders:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadAdminData()
    const interval = setInterval(loadAdminData, 6000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isAuthorized])

  // Filtered orders by Date Range for the Fee Report
  const reportOrders = useMemo(() => {
    if (dateFilter === 'ALL') return orders

    const now = new Date()
    return orders.filter(o => {
      const dateVal = o.timestamp || o.date
      if (!dateVal) return true
      try {
        const orderDate = new Date(dateVal)
        if (isNaN(orderDate.getTime())) return true

        if (dateFilter === 'TODAY') {
          return orderDate.toDateString() === now.toDateString()
        }
        if (dateFilter === 'WEEK') {
          const diffMs = now.getTime() - orderDate.getTime()
          return diffMs <= 7 * 24 * 60 * 60 * 1000
        }
        if (dateFilter === 'MONTH') {
          const diffMs = now.getTime() - orderDate.getTime()
          return diffMs <= 30 * 24 * 60 * 60 * 1000
        }
      } catch {
        return true
      }
      return true
    })
  }, [orders, dateFilter])

  // Three Core Summary Cards for the Fee Report (reconciled with currently filtered reportOrders)
  const reportSummary = useMemo(() => {
    const totalOrders = reportOrders.length
    const totalAmount = reportOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
    const totalProcessingFee = reportOrders.reduce((sum, o) => sum + (Number(o.digitalProcessingFee) || 0), 0)
    return { totalOrders, totalAmount, totalProcessingFee }
  }, [reportOrders])

  // Group report orders dynamically by station ID
  const stationGroups = useMemo(() => {
    const groups = {}

    // Dynamic grouping based on current report orders
    reportOrders.forEach(order => {
      const sId = String(
        order.stationId ||
        (order.id === 'XB-TEST-01' || String(order.id).startsWith('XB-TEST-') ? 'TEST-01' : 'SRKR-XEROX-01')
      ).trim().toUpperCase()

      if (!groups[sId]) {
        groups[sId] = []
      }
      groups[sId].push(order)
    })

    // Ensure known station IDs are present dynamically even before first order is placed
    const knownStations = ['SRKR-XEROX-01', 'TEST-01']
    knownStations.forEach(s => {
      if (!groups[s]) {
        groups[s] = []
      }
    })

    return groups
  }, [reportOrders])

  const sortedStationIds = useMemo(() => {
    return Object.keys(stationGroups).sort((a, b) => {
      if (a === 'SRKR-XEROX-01') return -1
      if (b === 'SRKR-XEROX-01') return 1
      if (a === 'TEST-01') return -1
      if (b === 'TEST-01') return 1
      return a.localeCompare(b)
    })
  }, [stationGroups])

  // Toggle station collapse
  const toggleStationCollapse = (stationId) => {
    setCollapsedStations(prev => ({
      ...prev,
      [stationId]: !prev[stationId]
    }))
  }

  // Export report as CSV
  const handleExportReport = () => {
    if (!reportOrders || reportOrders.length === 0) return

    const headers = ['Order ID', 'Station ID', 'Total Amount (INR)', 'Digital Processing Fee (INR)', 'Date', 'Payment Status', 'Order Status']
    const rows = reportOrders.map(o => [
      `"${o.id}"`,
      `"${o.stationId}"`,
      o.amount,
      o.digitalProcessingFee,
      `"${o.date || ''}"`,
      `"${o.paymentStatus || 'Paid'}"`,
      `"${o.status || ''}"`
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `xbuddy_digital_processing_fee_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Statistics calculation for the Queue view
  const queueStats = useMemo(() => {
    const total = orders.length
    const revenue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
    const processingFee = orders.reduce((sum, o) => sum + (Number(o.digitalProcessingFee) || 0), 0)
    const pending = orders.filter(o => o.status === 'Pending' || o.status === 'Payment Submitted' || o.status === 'Waiting' || o.status === 'Accepted' || o.status === 'Order Received').length
    const printing = orders.filter(o => o.status === 'Printing').length
    const ready = orders.filter(o => o.status === 'Ready for Collection' || o.status === 'Ready' || o.status === 'Printed').length
    const collected = orders.filter(o => o.status === 'Collected').length
    return { total, revenue, processingFee, pending, printing, ready, collected }
  }, [orders])

  // Filtered & Searched Orders for the Queue view
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = !q ||
        (order.id && order.id.toLowerCase().includes(q)) ||
        (order.fileName && order.fileName.toLowerCase().includes(q)) ||
        (order.phone && order.phone.toLowerCase().includes(q)) ||
        (order.studentName && order.studentName.toLowerCase().includes(q)) ||
        (order.date && order.date.toLowerCase().includes(q))

      if (!matchSearch) return false

      if (statusFilter === 'ALL') return true
      if (statusFilter === 'PENDING_PAYMENT') {
        const pStatus = String(order.paymentStatus || '').toLowerCase()
        return pStatus === 'pending' || order.status === 'Payment Submitted' || (!order.isPaid && order.status === 'Waiting')
      }
      if (statusFilter === 'PENDING') return order.status === 'Pending' || order.status === 'Payment Submitted' || order.status === 'Waiting' || order.status === 'Accepted' || order.status === 'Order Received'
      if (statusFilter === 'PRINTING') return order.status === 'Printing'
      if (statusFilter === 'READY') return order.status === 'Ready for Collection' || order.status === 'Ready' || order.status === 'Printed'
      if (statusFilter === 'COLLECTED') return order.status === 'Collected'
      if (statusFilter === 'CANCELLED') return order.status === 'Cancelled' || order.status === 'Failed'
      return true
    })
  }, [orders, searchQuery, statusFilter])

  const handleCopyOrderId = (id) => {
    if (!id || typeof navigator === 'undefined') return
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  const getOrderExpiryInfo = (order) => {
    const isPaid = order.isPaid || ['paid', 'verified'].includes(String(order.paymentStatus || '').toLowerCase())
    if (isPaid) {
      return { isExpired: false, label: 'Paid / Verified', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    }
    const created = order.timestamp ? new Date(order.timestamp).getTime() : 0
    const expires = order.expiresAt ? new Date(order.expiresAt).getTime() : (created ? created + 300000 : 0)
    if (!expires) return { isExpired: false, label: 'Pending Payment', color: 'text-amber-700 bg-amber-50 border-amber-200' }
    const now = Date.now()
    if (now > expires) {
      const mins = Math.floor((now - expires) / 60000)
      return { isExpired: true, label: `Expired ${mins}m ago (Can Reconcile)`, color: 'text-rose-700 bg-rose-50 border-rose-200' }
    }
    const leftMins = Math.ceil((expires - now) / 60000)
    return { isExpired: false, label: `Expires in ${leftMins}m`, color: 'text-blue-700 bg-blue-50 border-blue-200' }
  }

  async function handleVerifyAndApprove(order) {
    setActionLoading(order.id)
    try {
      const res = await verifyAndApprovePayment(order.id, {
        adminPassword: ADMIN_PASSWORD,
        verifiedBy: 'Shopkeeper Staff',
        note: `Manual reconciliation for ₹${order.amount} on ${new Date().toLocaleTimeString()}`,
      })

      if (res && res.success) {
        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          paymentStatus: 'verified',
          isPaid: true,
          status: o.status === 'Pending' || o.status === 'Payment Submitted' ? 'Accepted' : o.status,
        } : o))

        if (selectedOrder && selectedOrder.id === order.id) {
          setSelectedOrder(prev => ({
            ...prev,
            paymentStatus: 'verified',
            isPaid: true,
            status: prev.status === 'Pending' || prev.status === 'Payment Submitted' ? 'Accepted' : prev.status,
          }))
        }

        setReconcileFeedback({
          type: 'success',
          message: `Order ${order.id} verified and approved successfully!`,
        })
        setTimeout(() => setReconcileFeedback(null), 4000)
      } else {
        throw new Error(res?.error || 'Verification failed')
      }
    } catch (err) {
      console.error('Failed to verify order payment:', err)
      setReconcileFeedback({
        type: 'error',
        message: `Failed to verify payment: ${err.message}`,
      })
      setTimeout(() => setReconcileFeedback(null), 5000)
    } finally {
      setActionLoading(null)
    }
  }

  // Status transition handler for staff
  async function handleStatusChange(orderId, newStatus) {
    setActionLoading(orderId)
    try {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }))
      }
      await updateOrderStatus(orderId, newStatus)
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Print triggering handler for staff
  async function handlePrintTrigger(order) {
    setActionLoading(order.id)
    try {
      handleStatusChange(order.id, 'Printing')
      const res = await validateAndRelease(order.id)
      if (res && res.success) {
        handleStatusChange(order.id, 'Ready for Collection')
      } else {
        if (order.pdfUrl) {
          window.open(order.pdfUrl, '_blank')
        }
      }
    } catch {
      if (order.pdfUrl) window.open(order.pdfUrl, '_blank')
    } finally {
      setActionLoading(null)
    }
  }

  // ── 1. UNAUTHORIZED STAFF LOGIN SCREEN ─────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] text-[#18181B] flex items-center justify-center px-4 py-10 font-sans">
        <div className="w-full max-w-md rounded-3xl border border-[#F1E2D2] bg-[#FFFCF8] p-8 shadow-xl">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F97316] to-[#EA580C] flex items-center justify-center font-black text-white text-xl shadow-md shadow-orange-500/20">
              X
            </div>
            <div>
              <p className="text-[11px] text-[#EA580C] uppercase font-black tracking-wider">Xerox Made Easy</p>
              <h1 className="text-2xl font-extrabold text-[#18181B] tracking-tight">XBuddy Admin</h1>
            </div>
          </div>
          <p className="text-[#71717A] text-xs mb-6 leading-relaxed">
            Authorized portal for shop operators and station administrators. Enter staff credentials to continue.
          </p>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Staff Password</label>
              <input
                type="password"
                value={adminPassword}
                onChange={e => { setAdminPassword(e.target.value); setAuthError('') }}
                placeholder="Enter staff password"
                className="w-full rounded-xl border border-[#F1E2D2] bg-[#FFF8F0] px-4 py-3 text-[#18181B] placeholder-[#71717A] focus:border-[#F97316] focus:bg-[#FFFCF8] focus:outline-none text-sm font-mono transition-all"
              />
            </div>
            {authError && <p className="text-rose-600 text-xs font-semibold">{authError}</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-[#F97316] hover:bg-[#EA580C] px-4 py-3 text-sm font-bold text-white transition-all shadow-md shadow-orange-500/20 cursor-pointer"
            >
              Unlock Dashboard →
            </button>
          </form>
          <div className="mt-6 pt-4 border-t border-[#F1E2D2] text-center">
            <a href="/" className="text-xs text-[#71717A] hover:text-[#EA580C] font-semibold transition-colors">
              ← Return to Student App
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── 2. AUTHORIZED ADMIN DASHBOARD WITH UNIFIED EXPERIENCE ───────────────────
  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#18181B] font-sans flex flex-col md:flex-row antialiased">
      {/* Sidebar Navigation (Desktop) / Top Nav (Mobile) */}
      <aside className="w-full md:w-64 bg-[#FFFCF8] border-b md:border-b-0 md:border-r border-[#F1E2D2] flex flex-col justify-between shrink-0 z-20">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-[#F1E2D2] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#F97316] to-[#EA580C] flex items-center justify-center font-black text-white text-lg shadow-sm shadow-orange-500/25">
                X
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base text-[#18181B] tracking-tight">XBuddy</span>
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-[#FFEDD5] text-[#EA580C]">
                    Admin
                  </span>
                </div>
                <p className="text-[10px] text-[#71717A] font-semibold uppercase tracking-wider">Xerox Made Easy</p>
              </div>
            </div>

            <button
              onClick={handleAdminLogout}
              className="md:hidden p-1.5 rounded-lg text-[#71717A] hover:text-rose-600 hover:bg-[#FFF8F0] transition-colors"
              title="Lock Dashboard"
              aria-label="Lock Dashboard"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5">
            <button
              onClick={() => setActiveView('feeReport')}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                activeView === 'feeReport'
                  ? 'bg-[#FFEDD5] text-[#EA580C] shadow-xs'
                  : 'text-[#71717A] hover:bg-[#FFF8F0] hover:text-[#18181B]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4" />
                <span>Processing Fee Report</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeView === 'feeReport' ? 'bg-[#EA580C] text-white' : 'bg-[#F1E2D2] text-[#71717A]'
              }`}>
                {formatCurrency(reportSummary.totalProcessingFee)}
              </span>
            </button>

            <button
              onClick={() => setActiveView('orders')}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                activeView === 'orders'
                  ? 'bg-[#FFEDD5] text-[#EA580C] shadow-xs'
                  : 'text-[#71717A] hover:bg-[#FFF8F0] hover:text-[#18181B]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Printer className="w-4 h-4" />
                <span>Campus Queue</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeView === 'orders' ? 'bg-[#EA580C] text-white' : 'bg-[#F1E2D2] text-[#71717A]'
              }`}>
                {orders.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#F1E2D2] space-y-3">
          <div className="p-2.5 rounded-xl bg-[#FFF8F0] border border-[#F1E2D2] flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${realConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#18181B] truncate">
                {realConnected ? 'Live Atlas Connection' : 'Connecting...'}
              </p>
              <p className="text-[10px] text-[#71717A]">
                {sortedStationIds.length} Stations Available
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <a
              href="/"
              className="text-[#71717A] hover:text-[#EA580C] font-semibold flex items-center gap-1 transition-colors"
            >
              <span>← Student App</span>
            </a>
            <button
              onClick={handleAdminLogout}
              className="hidden md:flex text-[#71717A] hover:text-rose-600 font-semibold items-center gap-1 transition-colors cursor-pointer"
              title="Lock Dashboard"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
          {/* VIEW 1: DIGITAL PROCESSING FEE REPORT */}
          {activeView === 'feeReport' ? (
            <div className="space-y-8">
              {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#F1E2D2]">
                <div>
                  <h1 className="text-2xl font-black text-[#18181B] tracking-tight">
                    Digital Processing Fee Report
                  </h1>
                  <p className="text-xs text-[#71717A] mt-1 font-medium">
                    Station-wise orders, total amount and digital processing fee
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Compact Date-Range Control */}
                  <div className="inline-flex items-center rounded-xl bg-[#FFFCF8] border border-[#F1E2D2] p-1 text-xs">
                    {[
                      { key: 'ALL', label: 'All Time' },
                      { key: 'TODAY', label: 'Today' },
                      { key: 'WEEK', label: '7 Days' },
                      { key: 'MONTH', label: '30 Days' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setDateFilter(tab.key)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          dateFilter === tab.key
                            ? 'bg-[#F97316] text-white shadow-xs'
                            : 'text-[#71717A] hover:text-[#18181B]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Export Report Action */}
                  <button
                    onClick={handleExportReport}
                    className="px-3.5 py-2 rounded-xl bg-[#FFFCF8] hover:bg-[#FFF8F0] border border-[#F1E2D2] text-[#18181B] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Export report as CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>Export Report</span>
                  </button>
                </div>
              </div>

              {/* Summary Cards (Exactly 3) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Total Orders */}
                <div className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] p-5 shadow-xs transition-all hover:border-[#EA580C]/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                      Total Orders
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-[#FFEDD5] text-[#EA580C] flex items-center justify-center font-bold">
                      <Layers className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-[#18181B] tracking-tight">
                    {reportSummary.totalOrders.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-[#71717A] mt-1 font-medium">
                    Orders processed across all stations
                  </p>
                </div>

                {/* 2. Total Amount */}
                <div className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] p-5 shadow-xs transition-all hover:border-[#EA580C]/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                      Total Amount
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-[#FFEDD5] text-[#EA580C] flex items-center justify-center font-bold">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-[#18181B] tracking-tight">
                    {formatCurrency(reportSummary.totalAmount)}
                  </p>
                  <p className="text-[11px] text-[#71717A] mt-1 font-medium">
                    Total financial transaction volume
                  </p>
                </div>

                {/* 3. Total Processing Fee */}
                <div className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] p-5 shadow-xs transition-all hover:border-[#EA580C]/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#EA580C]">
                      Total Processing Fee
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-[#FFEDD5] text-[#EA580C] flex items-center justify-center font-bold">
                      <Receipt className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-[#EA580C] tracking-tight">
                    {formatCurrency(reportSummary.totalProcessingFee)}
                  </p>
                  <p className="text-[11px] text-[#71717A] mt-1 font-medium">
                    Actual digital fees stored in database
                  </p>
                </div>
              </div>

              {/* Station-by-Station Vertical Rows (Full Width) */}
              <div className="space-y-6">
                {sortedStationIds.map(stationId => {
                  const stationOrders = stationGroups[stationId] || []
                  const stationTotalAmount = stationOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
                  const stationTotalFee = stationOrders.reduce((sum, o) => sum + (Number(o.digitalProcessingFee) || 0), 0)
                  const isCollapsed = Boolean(collapsedStations[stationId])

                  const stationDescription = stationId === 'SRKR-XEROX-01'
                    ? 'SRKR Engineering College Main Shop Station'
                    : (stationId === 'TEST-01' ? 'Isolated Virtual Test Station' : `Campus Print Station ${stationId}`)

                  return (
                    <div
                      key={stationId}
                      className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] shadow-xs overflow-hidden transition-all"
                    >
                      {/* Station Full-Width Header Card */}
                      <div
                        onClick={() => toggleStationCollapse(stationId)}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#FFF8F0]/70 transition-colors select-none"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-2xl bg-[#FFEDD5] text-[#EA580C] flex items-center justify-center font-bold shrink-0">
                            <Store className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="text-base font-black text-[#18181B] tracking-tight font-mono">
                                Station: {stationId}
                              </h2>
                              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FFEDD5] text-[#EA580C]">
                                {stationOrders.length} {stationOrders.length === 1 ? 'order' : 'orders'}
                              </span>
                            </div>
                            <p className="text-xs text-[#71717A] mt-0.5 font-medium">
                              {stationDescription}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-5 sm:gap-6 self-end sm:self-auto">
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-[#71717A] block">
                              Total Amount
                            </span>
                            <span className="text-sm font-black text-[#18181B]">
                              {formatCurrency(stationTotalAmount)}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-[#EA580C] block">
                              Processing Fee
                            </span>
                            <span className="text-sm font-black text-[#EA580C]">
                              {formatCurrency(stationTotalFee)}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="w-8 h-8 rounded-xl bg-[#FFF8F0] border border-[#F1E2D2] flex items-center justify-center text-[#71717A] hover:text-[#18181B] transition-colors"
                            aria-label={isCollapsed ? 'Expand Station Table' : 'Collapse Station Table'}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Station Orders Table: Exactly Three Columns */}
                      {!isCollapsed && (
                        <div className="border-t border-[#F1E2D2] overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[#F1E2D2] text-[11px] uppercase tracking-wider text-[#71717A] bg-[#FFF8F0]">
                                <th className="py-3 px-4 font-bold text-left">Order ID</th>
                                <th className="py-3 px-4 font-bold text-right">Total Amount</th>
                                <th className="py-3 px-4 font-bold text-right">Digital Processing Fee</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1E2D2]/60 text-xs text-[#18181B]">
                              {stationOrders.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="py-10 text-center text-[#71717A]">
                                    <Inbox className="w-7 h-7 mx-auto text-[#EA580C]/40 mb-2" />
                                    <p className="font-bold text-xs text-[#18181B]">No orders yet</p>
                                    <p className="text-[11px] text-[#71717A] mt-0.5">
                                      Orders dispatched to {stationId} will appear here dynamically.
                                    </p>
                                  </td>
                                </tr>
                              ) : (
                                stationOrders.map(order => (
                                  <tr
                                    key={order.id}
                                    className="hover:bg-[#FFF8F0] transition-colors bg-[#FFFCF8]"
                                  >
                                    {/* Column 1: Order ID (Left Aligned with Orange Accent) */}
                                    <td className="py-3 px-4 font-mono font-bold text-[#EA580C] text-sm text-left">
                                      {order.id}
                                    </td>

                                    {/* Column 2: Total Amount (Right Aligned) */}
                                    <td className="py-3 px-4 font-bold text-[#18181B] text-right">
                                      {formatCurrency(order.amount)}
                                    </td>

                                    {/* Column 3: Digital Processing Fee (Right Aligned with Restrained Orange Accent) */}
                                    <td className="py-3 px-4 font-black text-[#EA580C] text-right">
                                      {formatCurrency(order.digitalProcessingFee)}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* VIEW 2: CAMPUS QUEUE & FULFILLMENT */
            <div className="space-y-6">
              {/* Header */}
              <div className="pb-2 border-b border-[#F1E2D2]">
                <h1 className="text-2xl font-black text-[#18181B] tracking-tight">
                  Campus Queue &amp; Order Fulfillment
                </h1>
                <p className="text-xs text-[#71717A] mt-1 font-medium">
                  Real-time incoming campus student print jobs and shop dispatch
                </p>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Total Orders', value: queueStats.total, icon: <Layers className="w-4 h-4" />, color: 'text-[#EA580C]' },
                  { label: 'Revenue', value: formatCurrency(queueStats.revenue), icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-600' },
                  { label: 'Digital Fee', value: formatCurrency(queueStats.processingFee), icon: <Receipt className="w-4 h-4" />, color: 'text-[#EA580C]' },
                  { label: 'Pending / Intake', value: queueStats.pending, icon: <Clock3 className="w-4 h-4" />, color: 'text-amber-600' },
                  { label: 'Printing Queue', value: queueStats.printing, icon: <Printer className="w-4 h-4" />, color: 'text-purple-600' },
                  { label: 'Ready for Pickup', value: queueStats.ready, icon: <Store className="w-4 h-4" />, color: 'text-emerald-600' },
                  { label: 'Collected', value: queueStats.collected, icon: <PackageCheck className="w-4 h-4" />, color: 'text-[#71717A]' },
                ].map((item, i) => (
                  <div key={i} className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] p-4 shadow-xs">
                    <div className="flex items-center justify-between text-[#71717A] text-xs mb-2">
                      <span className="font-semibold text-[11px]">{item.label}</span>
                      <span className={item.color}>{item.icon}</span>
                    </div>
                    <p className="text-xl font-black text-[#18181B] tracking-tight">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Filter & Search Bar */}
              <div className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-96">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search Order ID, file, phone, student..."
                    className="w-full rounded-xl border border-[#F1E2D2] bg-[#FFF8F0] pl-10 pr-4 py-2 text-sm text-[#18181B] placeholder-[#71717A] focus:border-[#F97316] focus:bg-[#FFFCF8] focus:outline-none"
                  />
                  <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-3" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-[#71717A] hover:text-[#18181B] absolute right-3 top-2.5 cursor-pointer"
                      aria-label="Clear Search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs">
                  {[
                    { key: 'ALL', label: 'All Orders' },
                    { key: 'PENDING_PAYMENT', label: 'Pending Payments ⏳' },
                    { key: 'PENDING', label: 'Pending Queue' },
                    { key: 'PRINTING', label: 'Printing' },
                    { key: 'READY', label: 'Ready' },
                    { key: 'COLLECTED', label: 'Collected' },
                    { key: 'CANCELLED', label: 'Cancelled' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                        statusFilter === tab.key
                          ? 'bg-[#F97316] text-white shadow-xs'
                          : 'bg-[#FFF8F0] hover:bg-[#FFEDD5] text-[#71717A]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reconciliation Feedback Alert */}
              {reconcileFeedback && (
                <div className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-xs ${
                  reconcileFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {reconcileFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>{reconcileFeedback.message}</span>
                  </div>
                  <button
                    onClick={() => setReconcileFeedback(null)}
                    className="p-1 hover:bg-black/5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Orders Table */}
              <div className="rounded-2xl border border-[#F1E2D2] bg-[#FFFCF8] overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#F1E2D2] text-[11px] uppercase tracking-wider text-[#71717A] bg-[#FFF8F0]">
                        <th className="py-3 px-4 font-bold">Order ID</th>
                        <th className="py-3 px-4 font-bold">Student / File</th>
                        <th className="py-3 px-4 font-bold text-center">Pages</th>
                        <th className="py-3 px-4 font-bold text-center">Copies</th>
                        <th className="py-3 px-4 font-bold">Type</th>
                        <th className="py-3 px-4 font-bold">Amount</th>
                        <th className="py-3 px-4 font-bold">Status</th>
                        <th className="py-3 px-4 font-bold">Time</th>
                        <th className="py-3 px-4 font-bold text-right">Staff Workflow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1E2D2]/60 text-xs text-[#18181B]">
                      {loading && orders.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-14 text-center text-[#71717A]">
                            <div className="w-8 h-8 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                            <p className="font-bold text-[#18181B]">Fetching live campus print orders...</p>
                            <p className="text-[11px] text-[#71717A] mt-1">Connecting to Xerox print agent &amp; Google Sheets</p>
                          </td>
                        </tr>
                      ) : filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-[#71717A]">
                            No matching orders found.
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map(order => {
                          const badgeCls = STATUS_BADGES[order.status] || STATUS_BADGES['Order Received']
                          const isBusy = actionLoading === order.id

                          return (
                            <tr key={order.id} className="hover:bg-[#FFF8F0] transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5 font-mono font-bold text-[#EA580C] text-sm">
                                  <span>{order.id}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyOrderId(order.id)}
                                    className="p-1 rounded hover:bg-orange-100 text-[#EA580C] transition-colors cursor-pointer"
                                    title="Copy Order ID"
                                  >
                                    {copiedId === order.id ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-orange-400 hover:text-orange-600" />
                                    )}
                                  </button>
                                </div>
                                <div className="mt-1">
                                  {(() => {
                                    const exp = getOrderExpiryInfo(order)
                                    return (
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${exp.color}`}>
                                        {exp.label}
                                      </span>
                                    )
                                  })()}
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                <p className="font-bold text-[#18181B] truncate max-w-[200px]" title={order.fileName}>
                                  {order.fileName}
                                </p>
                                <p className="text-[11px] text-[#71717A] flex items-center gap-1 mt-0.5">
                                  <span>{order.studentName}</span>
                                  {order.phone && <span>• {order.phone}</span>}
                                </p>
                              </td>

                              <td className="py-3 px-4 text-center font-bold text-[#18181B]">
                                {order.pages}
                              </td>

                              <td className="py-3 px-4 text-center font-bold text-[#18181B]">
                                {order.copies}
                              </td>

                              <td className="py-3 px-4 font-medium">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  order.printType === 'Color' ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-700'
                                }`}>
                                  {order.printType} • {order.printSide || 'Single'}
                                </span>
                              </td>

                              <td className="py-3 px-4 font-bold text-[#18181B]">
                                <span className="block text-sm font-black">{formatCurrency(order.amount)}</span>
                                <div className="text-[10px] text-[#71717A] font-medium flex items-center gap-1 mt-0.5 whitespace-nowrap">
                                  <span>₹{Math.max(0, order.amount - order.digitalProcessingFee)} print</span>
                                  <span>+</span>
                                  <span className="text-[#EA580C] font-bold">₹{order.digitalProcessingFee} fee</span>
                                </div>
                                <span className={`text-[10px] font-semibold block mt-0.5 ${order.isPaid || order.paymentStatus === 'verified' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {order.isPaid || order.paymentStatus === 'verified' ? '✓ Verified' : '⏳ Pending'}
                                </span>
                              </td>

                              <td className="py-3 px-4">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] ${badgeCls}`}>
                                  {order.status}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-[#71717A] text-[11px]">
                                {order.time}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {(!order.isPaid && order.paymentStatus !== 'verified') && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handleVerifyAndApprove(order)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                                      title="Verify against PhonePe merchant transaction"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Verify &amp; Approve
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setSelectedOrder(order)}
                                    className="px-2.5 py-1 rounded-lg bg-[#FFF8F0] hover:bg-[#FFEDD5] text-[#18181B] text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                    title="View Document Details"
                                  >
                                    <Eye className="w-3 h-3" /> Details
                                  </button>

                                  {(order.status === 'Pending' || order.status === 'Waiting' || order.status === 'Payment Submitted') && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handleStatusChange(order.id, 'Accepted')}
                                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all cursor-pointer"
                                    >
                                      Accept
                                    </button>
                                  )}

                                  {(order.status === 'Accepted' || order.status === 'Order Received') && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handlePrintTrigger(order)}
                                      className="px-2.5 py-1 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Printer className="w-3 h-3" /> Print
                                    </button>
                                  )}

                                  {order.status === 'Printing' && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handleStatusChange(order.id, 'Ready for Collection')}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" /> Ready
                                    </button>
                                  )}

                                  {(order.status === 'Ready for Collection' || order.status === 'Ready' || order.status === 'Printed') && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handleStatusChange(order.id, 'Collected')}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <PackageCheck className="w-3.5 h-3.5" /> Collected
                                    </button>
                                  )}

                                  {order.status !== 'Collected' && order.status !== 'Cancelled' && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => handleStatusChange(order.id, 'Cancelled')}
                                      className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] transition-colors cursor-pointer"
                                      title="Cancel Order"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Order Details Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative z-10 bg-[#FFFCF8] border border-[#F1E2D2] rounded-3xl p-6 w-full max-w-lg shadow-2xl text-[#18181B]"
            >
              <div className="flex items-center justify-between mb-4 border-b border-[#F1E2D2] pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-extrabold text-[#EA580C]">{selectedOrder.id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyOrderId(selectedOrder.id)}
                    className="p-1 rounded-lg bg-[#FFF8F0] hover:bg-[#FFEDD5] text-[#EA580C] transition-colors cursor-pointer"
                    title="Copy Order ID"
                  >
                    {copiedId === selectedOrder.id ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-orange-500" />
                    )}
                  </button>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] ${STATUS_BADGES[selectedOrder.status] || ''}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-[#FFF8F0] hover:bg-[#FFEDD5] text-[#71717A] hover:text-[#18181B] flex items-center justify-center text-xs transition-colors cursor-pointer"
                  aria-label="Close Order Details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Payment Reconciliation Box */}
              <div className="mb-4">
                {(!selectedOrder.isPaid && selectedOrder.paymentStatus !== 'verified') ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-relaxed">
                        <strong>Payment Reconciliation:</strong> Compare with PhonePe / UPI merchant notification for transaction note <strong className="font-mono text-amber-950 font-bold">XBuddy {selectedOrder.id}</strong> and exact amount <strong>{formatCurrency(selectedOrder.amount)}</strong>.
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {(() => {
                        const exp = getOrderExpiryInfo(selectedOrder)
                        return (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${exp.color}`}>
                            {exp.label}
                          </span>
                        )
                      })()}
                      <button
                        disabled={actionLoading === selectedOrder.id}
                        onClick={() => handleVerifyAndApprove(selectedOrder)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Verify &amp; Approve Payment
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold">Payment Verified &amp; Approved</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                      Reconciled ✓
                    </span>
                  </div>
                )}
              </div>

              {/* Order Details Grid */}
              <div className="space-y-3 text-xs mb-6">
                <div className="p-3.5 rounded-2xl bg-[#FFF8F0] border border-[#F1E2D2] flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-[#71717A] text-[11px]">Document File</p>
                    <p className="font-bold text-[#18181B] text-sm truncate">{selectedOrder.fileName}</p>
                  </div>
                  {selectedOrder.pdfUrl && (
                    <a
                      href={selectedOrder.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-[#FFEDD5] hover:bg-[#fed7aa] text-[#EA580C] font-bold border border-[#F1E2D2] flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#FFF8F0] border border-[#F1E2D2]">
                    <span className="text-[#71717A] block mb-0.5">Student / Contact</span>
                    <span className="font-bold text-[#18181B]">{selectedOrder.studentName || 'Campus Student'}</span>
                    {selectedOrder.phone && <p className="text-[#71717A] mt-0.5">{selectedOrder.phone}</p>}
                  </div>
                  <div className="p-3 rounded-xl bg-[#FFF8F0] border border-[#F1E2D2]">
                    <span className="text-[#71717A] block mb-0.5">Payment Total</span>
                    <span className="font-extrabold text-[#18181B] text-base">{formatCurrency(selectedOrder.amount)}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold block">Verified via UPI</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FFF8F0] border border-[#F1E2D2] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Print Station:</span>
                    <span className="font-mono font-bold text-[#EA580C]">{selectedOrder.stationId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Printing Cost:</span>
                    <span className="font-bold text-[#18181B]">{formatCurrency(Math.max(0, selectedOrder.amount - selectedOrder.digitalProcessingFee))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Digital Processing Fee:</span>
                    <span className="font-bold text-[#EA580C]">{formatCurrency(selectedOrder.digitalProcessingFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Total / Printable Pages:</span>
                    <span className="font-bold text-[#18181B]">{selectedOrder.pages} pages</span>
                  </div>
                  {selectedOrder.customPages && (
                    <div className="flex justify-between">
                      <span className="text-[#71717A]">Custom Page Selection:</span>
                      <span className="font-mono font-bold text-[#EA580C]">{selectedOrder.customPages}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Number of Copies:</span>
                    <span className="font-bold text-[#18181B]">{selectedOrder.copies}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Color Mode:</span>
                    <span className="font-bold text-[#18181B]">{selectedOrder.printType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Duplex / Sides:</span>
                    <span className="font-bold text-[#18181B]">{selectedOrder.printSide || 'Single Side'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handlePrintTrigger(selectedOrder)}
                  className="flex-1 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Print on Shop Printer
                </button>
                {selectedOrder.status !== 'Collected' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'Collected')
                      setSelectedOrder(null)
                    }}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" /> Collected
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
