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
} from 'lucide-react'
import {
  fetchAdminOrders,
  fetchAdminStats,
  fetchHealthStatus,
  updateOrderStatus,
  validateAndRelease,
} from '../utils/api'

const STATUS_BADGES = {
  'Pending':               'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  'Payment Submitted':     'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  'Order Received':        'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  'Accepted':              'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  'Waiting':               'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  'Printing':              'bg-violet-500/15 text-violet-300 border border-violet-500/30 animate-pulse',
  'Ready for Collection':  'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold',
  'Ready':                 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold',
  'Collected':             'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  'Printed':               'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  'Cancelled':             'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  'Failed':                'bg-rose-500/15 text-rose-300 border border-rose-500/30',
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'xbuddy@4921'
const formatCurrency = value => `₹${Number(value || 0).toLocaleString()}`

export default function AdminDashboard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState('')
  const [realConnected, setRealConnected] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('xbuddyAdminAuthorized')
      if (saved === 'true') {
        setIsAuthorized(true)
      }
    }
  }, [])

  const handleAdminLogin = (event) => {
    event.preventDefault()
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAuthorized(true)
      setAuthError('')
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('xbuddyAdminAuthorized', 'true')
      }
      return
    }
    setAuthError('Incorrect password. Please try again.')
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

            return {
              id: o.id || o.orderId,
              studentName,
              phone,
              fileName: o.fileName || 'Document.pdf',
              pages: Number(o.pages || o.totalPages || 1),
              copies: Number(o.copies || 1),
              printType: o.printType || (o.colorMode === 'color' ? 'Color' : 'B&W'),
              printSide: o.printSide || 'Single',
              customPages: o.customPages || '',
              amount: Number(o.amount || 0),
              paymentStatus: o.paymentStatus || 'Pending',
              status: currentStatus,
              time: timeStr || 'Just now',
              date: dateStr || new Date().toISOString().split('T')[0],
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

  // Statistics calculation
  const stats = useMemo(() => {
    const total = orders.length
    const revenue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
    const pending = orders.filter(o => o.status === 'Pending' || o.status === 'Payment Submitted' || o.status === 'Waiting' || o.status === 'Accepted' || o.status === 'Order Received').length
    const printing = orders.filter(o => o.status === 'Printing').length
    const ready = orders.filter(o => o.status === 'Ready for Collection' || o.status === 'Ready' || o.status === 'Printed').length
    const collected = orders.filter(o => o.status === 'Collected').length
    return { total, revenue, pending, printing, ready, collected }
  }, [orders])

  // Filtered & Searched Orders (newest first)
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
      if (statusFilter === 'PENDING') return order.status === 'Pending' || order.status === 'Payment Submitted' || order.status === 'Waiting' || order.status === 'Accepted' || order.status === 'Order Received'
      if (statusFilter === 'PRINTING') return order.status === 'Printing'
      if (statusFilter === 'READY') return order.status === 'Ready for Collection' || order.status === 'Ready' || order.status === 'Printed'
      if (statusFilter === 'COLLECTED') return order.status === 'Collected'
      if (statusFilter === 'CANCELLED') return order.status === 'Cancelled' || order.status === 'Failed'
      return true
    })
  }, [orders, searchQuery, statusFilter])

  // Status transition handler
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

  // Print triggering handler
  async function handlePrintTrigger(order) {
    setActionLoading(order.id)
    try {
      handleStatusChange(order.id, 'Printing')
      const res = await validateAndRelease(order.id)
      if (res && res.success) {
        handleStatusChange(order.id, 'Ready for Collection')
      } else {
        // If agent not running, allow staff to print via browser
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

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#09090E] text-white flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-orange-500/20 bg-slate-950/90 p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#F7931E] to-amber-400 flex items-center justify-center font-bold text-white shadow-lg">
              X
            </div>
            <div>
              <p className="text-xs text-orange-400 uppercase font-bold tracking-wider">Xerox Shop Portal</p>
              <h1 className="text-2xl font-bold">Staff Sign In</h1>
            </div>
          </div>
          <p className="text-slate-400 text-xs mb-6">Enter shop operator password to access incoming campus print orders.</p>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={adminPassword}
              onChange={e => { setAdminPassword(e.target.value); setAuthError('') }}
              placeholder="Enter staff password"
              className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white placeholder-slate-500 focus:border-[#F7931E] focus:outline-none text-sm font-mono"
            />
            {authError && <p className="text-rose-400 text-xs">{authError}</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-[#F7931E] hover:bg-[#e07010] px-4 py-3 text-sm font-bold text-white transition-all shadow-md shadow-orange-500/20"
            >
              Unlock Dashboard →
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08080C] text-slate-100 font-sans pb-16">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-slate-950/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#F7931E] to-amber-400 flex items-center justify-center font-black text-white text-lg shadow-md shadow-orange-500/20">
              X
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Xerox Shop Staff Dashboard</h1>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  Campus Queue
                </span>
              </div>
              <p className="text-xs text-slate-400">Order fulfillment, print dispatch, and customer collection</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs">
              <span className={`w-2 h-2 rounded-full ${realConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-300 font-semibold">{realConnected ? `Live Station Feed (${orders.length} Real Orders)` : 'Connecting...'}</span>
            </div>
            <a
              href="/"
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5"
            >
              <span>←</span>
              <span>Student App</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 pt-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
          {[
            { label: 'Total Orders', value: stats.total, icon: <Layers className="w-4 h-4" />, color: 'text-orange-400' },
            { label: 'Revenue', value: formatCurrency(stats.revenue), icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-400' },
            { label: 'Pending / Intake', value: stats.pending, icon: <Clock3 className="w-4 h-4" />, color: 'text-amber-400' },
            { label: 'Printing Queue', value: stats.printing, icon: <Printer className="w-4 h-4" />, color: 'text-violet-400' },
            { label: 'Ready for Pickup', value: stats.ready, icon: <Store className="w-4 h-4" />, color: 'text-emerald-400' },
            { label: 'Collected', value: stats.collected, icon: <PackageCheck className="w-4 h-4" />, color: 'text-slate-400' },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-sm backdrop-blur-xs">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>{item.label}</span>
                <span className={item.color}>{item.icon}</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Filter & Search Bar */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search */}
          <div className="relative w-full md:w-96">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Order ID, file, phone, student..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-[#F7931E] focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-400 hover:text-white absolute right-3 top-2.5 cursor-pointer"
                aria-label="Clear Search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs">
            {[
              { key: 'ALL', label: 'All Orders' },
              { key: 'PENDING', label: 'Pending / Accepted' },
              { key: 'PRINTING', label: 'Printing' },
              { key: 'READY', label: 'Ready for Collection' },
              { key: 'COLLECTED', label: 'Collected' },
              { key: 'CANCELLED', label: 'Cancelled' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-[#F7931E] text-white shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Orders Table */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/90 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/80">
                  <th className="py-3.5 px-4 font-bold">Order ID</th>
                  <th className="py-3.5 px-4 font-bold">Student / File</th>
                  <th className="py-3.5 px-4 font-bold text-center">Pages</th>
                  <th className="py-3.5 px-4 font-bold text-center">Copies</th>
                  <th className="py-3.5 px-4 font-bold">Print Type</th>
                  <th className="py-3.5 px-4 font-bold">Amount</th>
                  <th className="py-3.5 px-4 font-bold">Payment</th>
                  <th className="py-3.5 px-4 font-bold">Order Status</th>
                  <th className="py-3.5 px-4 font-bold">Time</th>
                  <th className="py-3.5 px-4 font-bold text-right">Staff Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      <div className="w-8 h-8 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                      <p className="font-semibold text-slate-300">Fetching live campus print orders...</p>
                      <p className="text-[11px] text-slate-500 mt-1">Connecting to Xerox print agent &amp; Google Sheets</p>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => {
                    const badgeCls = STATUS_BADGES[order.status] || STATUS_BADGES['Order Received']
                    const isBusy = actionLoading === order.id

                    return (
                      <tr key={order.id} className="hover:bg-white/[0.03] transition-colors">
                        {/* Order ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-orange-400 text-sm">
                          {order.id}
                        </td>

                        {/* Student / File */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white truncate max-w-[200px]" title={order.fileName}>
                            {order.fileName}
                          </p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <span>{order.studentName}</span>
                            {order.phone && <span>• {order.phone}</span>}
                          </p>
                        </td>

                        {/* Pages */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-slate-100">{order.pages}</span>
                          {order.customPages && (
                            <span className="block text-[10px] text-orange-400">({order.customPages})</span>
                          )}
                        </td>

                        {/* Copies */}
                        <td className="py-3.5 px-4 text-center font-bold text-slate-100">
                          {order.copies}
                        </td>

                        {/* Print Type */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.printType === 'Color' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-300'}`}>
                              {order.printType}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {order.printSide || 'Single'}
                            </span>
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 font-bold text-emerald-400">
                          {formatCurrency(order.amount)}
                        </td>

                        {/* Payment */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                            <Check className="w-3 h-3" /> Paid
                          </span>
                        </td>

                        {/* Order Status */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] ${badgeCls}`}>
                            {order.status}
                          </span>
                        </td>

                        {/* Time */}
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {order.time}
                        </td>

                        {/* Staff Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title="View Document Details"
                            >
                              <Eye className="w-3 h-3" /> Details
                            </button>

                            {/* Workflow buttons */}
                            {(order.status === 'Pending' || order.status === 'Waiting' || order.status === 'Payment Submitted') && (
                              <button
                                disabled={isBusy}
                                onClick={() => handleStatusChange(order.id, 'Accepted')}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all shadow-xs"
                              >
                                Accept Order
                              </button>
                            )}

                            {(order.status === 'Accepted' || order.status === 'Order Received') && (
                              <button
                                disabled={isBusy}
                                onClick={() => handlePrintTrigger(order)}
                                className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-all shadow-xs flex items-center gap-1"
                              >
                                <Printer className="w-3 h-3" /> Start Printing
                              </button>
                            )}

                            {order.status === 'Printing' && (
                              <button
                                disabled={isBusy}
                                onClick={() => handleStatusChange(order.id, 'Ready for Collection')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-xs flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Mark Ready
                              </button>
                            )}

                            {(order.status === 'Ready for Collection' || order.status === 'Ready' || order.status === 'Printed') && (
                              <button
                                disabled={isBusy}
                                onClick={() => handleStatusChange(order.id, 'Collected')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-extrabold transition-all shadow-xs flex items-center gap-1"
                              >
                                <PackageCheck className="w-3.5 h-3.5" /> Mark Collected
                              </button>
                            )}

                            {order.status !== 'Collected' && order.status !== 'Cancelled' && (
                              <button
                                disabled={isBusy}
                                onClick={() => handleStatusChange(order.id, 'Cancelled')}
                                className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] transition-colors cursor-pointer"
                                title="Cancel Order"
                                aria-label="Cancel Order"
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
      </main>

      {/* Order Details & Print File Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative z-10 bg-slate-900 border border-white/15 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-slate-100"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-extrabold text-[#F7931E]">{selectedOrder.id}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] ${STATUS_BADGES[selectedOrder.status] || ''}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                  aria-label="Close Order Details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Order Details Grid */}
              <div className="space-y-3 text-xs mb-6">
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-slate-400 text-[11px]">Document File</p>
                    <p className="font-bold text-white text-sm truncate">{selectedOrder.fileName}</p>
                  </div>
                  {selectedOrder.pdfUrl && (
                    <a
                      href={selectedOrder.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 font-bold border border-orange-500/30 flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
                    <span className="text-slate-400 block mb-0.5">Student / Contact</span>
                    <span className="font-bold text-white">{selectedOrder.studentName || 'Campus Student'}</span>
                    {selectedOrder.phone && <p className="text-slate-400 mt-0.5">{selectedOrder.phone}</p>}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
                    <span className="text-slate-400 block mb-0.5">Payment Total</span>
                    <span className="font-extrabold text-emerald-400 text-base">{formatCurrency(selectedOrder.amount)}</span>
                    <span className="text-[10px] text-emerald-400/80 block">Verified via UPI</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total / Printable Pages:</span>
                    <span className="font-bold text-white">{selectedOrder.pages} pages</span>
                  </div>
                  {selectedOrder.customPages && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Custom Page Selection:</span>
                      <span className="font-mono font-bold text-orange-400">{selectedOrder.customPages}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Number of Copies:</span>
                    <span className="font-bold text-white">{selectedOrder.copies}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Color Mode:</span>
                    <span className="font-bold text-white">{selectedOrder.printType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duplex / Sides:</span>
                    <span className="font-bold text-white">{selectedOrder.printSide || 'Single Side'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handlePrintTrigger(selectedOrder)}
                  className="flex-1 py-3 bg-[#F7931E] hover:bg-[#e07010] text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Print on Shop Printer
                </button>
                {selectedOrder.status !== 'Collected' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'Collected')
                      setSelectedOrder(null)
                    }}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1"
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

