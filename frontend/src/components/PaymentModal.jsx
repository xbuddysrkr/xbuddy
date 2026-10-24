import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import PaymentProofForm from './PaymentProofForm'
import PaymentQrInstructionsModal from './PaymentQrInstructionsModal'
import {
  Smartphone,
  QrCode,
  Copy,
  Check,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Lightbulb,
  X,
  Clock,
  ExternalLink,
  ShieldCheck,
  Download,
  FileImage,
  Info,
} from 'lucide-react'
import { detectPlatform, getPhonePeLaunchUrl, buildUpiQuery, getUpiUrls, openPhonePeAppOnly } from '../utils/upiLauncher'
import { buildQrFilename, generateSharpQrPng, triggerQrDownload } from '../utils/qrDownload'
import { useLanguage } from '../i18n/LanguageContext'
import { getPaymentConfig, createDirectUpiIntentOrder, pollDirectUpiOrderStatus } from '../utils/api'
import InteractiveTourSpotlight from './InteractiveTourSpotlight'
import UpiAppSelectionSheet from './UpiAppSelectionSheet'
import { STORAGE_KEYS, isTourCompleted, markTourCompleted } from '../utils/tourStorage'
import { saveSessionState, getSessionState } from '../utils/sessionStore'

// Official Xerox Shopkeeper Receiving UPI Credentials
const OFFICIAL_UPI_ID = '9100280705@ybl'
const OFFICIAL_PAYEE_NAME = 'THANALA VS NSP SAILOKESH'

function sanitizeUpiId(id) {
  if (!id || typeof id !== 'string' || id.toLowerCase().includes('sreekar') || id.toLowerCase().includes('okaxis')) {
    return OFFICIAL_UPI_ID
  }
  return id.trim()
}

function sanitizePayeeName(name) {
  if (!name || typeof name !== 'string' || name.toLowerCase().includes('sreekar') || name.toLowerCase().includes('thota')) {
    return OFFICIAL_PAYEE_NAME
  }
  return name.trim()
}

const DEFAULT_UPI_ID = sanitizeUpiId(import.meta.env.VITE_UPI_ID)
const DEFAULT_PAYEE_NAME = sanitizePayeeName(import.meta.env.VITE_PAYEE_NAME)

const PAYMENT_APPS = [
  {
    id: 'phonepe',
    name: 'PhonePe',
    description: 'Tap to open PhonePe app',
    iconBg: '#5f259f',
    textColor: '#5f259f',
    borderColor: 'border-purple-200',
    bgGradient: 'from-purple-50 to-white hover:from-purple-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#5f259f] text-white flex items-center justify-center font-bold text-base shadow-xs">
        पे
      </div>
    ),
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    description: 'Tap to open Google Pay app',
    iconBg: '#ffffff',
    textColor: '#1a73e8',
    borderColor: 'border-blue-200',
    bgGradient: 'from-blue-50 to-white hover:from-blue-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center font-extrabold text-xs shadow-xs">
        <span className="text-[#4285F4]">G</span>
        <span className="text-[#EA4335]">P</span>
        <span className="text-[#FBBC05]">a</span>
        <span className="text-[#34A853]">y</span>
      </div>
    ),
  },
  {
    id: 'paytm',
    name: 'Paytm',
    description: 'Tap to open Paytm app',
    iconBg: '#002970',
    textColor: '#00b9f5',
    borderColor: 'border-sky-200',
    bgGradient: 'from-sky-50 to-white hover:from-sky-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#002970] text-[#00b9f5] flex items-center justify-center font-black text-[11px] shadow-xs">
        Paytm
      </div>
    ),
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    description: 'Tap to open BHIM app',
    iconBg: '#007849',
    textColor: '#007849',
    borderColor: 'border-emerald-200',
    bgGradient: 'from-emerald-50 to-white hover:from-emerald-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-[#007849] text-white flex items-center justify-center font-black text-[10px] shadow-xs">
        BHIM
      </div>
    ),
  },
  {
    id: 'any',
    name: 'Any UPI App',
    description: 'Cred, Amazon Pay, WhatsApp, etc.',
    iconBg: '#F7931E',
    textColor: '#F7931E',
    borderColor: 'border-orange-200',
    bgGradient: 'from-orange-50 to-white hover:from-orange-100/70',
    icon: (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#EA580C] to-[#F7931E] text-white flex items-center justify-center font-bold text-xs shadow-xs">
        UPI
      </div>
    ),
  },
]

export default function PaymentModal({ total, orderMeta, onSuccess, onClose }) {
  const { t } = useLanguage()
  // Step states: 'SELECT' | 'LAUNCHING' | 'DID_YOU_PAY' | 'FORM'
  const [step, setStep] = useState('SELECT')
  const [selectedApp, setSelectedApp] = useState(null)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedOrderId, setCopiedOrderId] = useState(false)
  const [viewMode, setViewMode] = useState('qr') // Default to 'qr' for instant QR download & display
  const [desktopNotice, setDesktopNotice] = useState('')
  const [fallbackNotice, setFallbackNotice] = useState('')
  const [genericFallbackUri, setGenericFallbackUri] = useState('')

  // Shopkeeper Receiving Details from Server
  const [receiverConfig, setReceiverConfig] = useState({
    upiId: DEFAULT_UPI_ID,
    payeeName: DEFAULT_PAYEE_NAME,
  })

  // Direct UPI Intent Session from Server
  const [intentData, setIntentData] = useState(null)
  const [vectorQrSvg, setVectorQrSvg] = useState('')
  const [pngDataUrl, setPngDataUrl] = useState('')

  // Auto-Download & Instructions Popup State
  const [showInstructionsPopup, setShowInstructionsPopup] = useState(false)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const autoDownloadedOrdersRef = useRef(new Set())

  // 5-Minute Checkout Expiry Countdown (recalculated from absolute timestamp)
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const session = getSessionState()
    if (session?.expiresAt) {
      return Math.max(0, Math.floor((Number(session.expiresAt) - Date.now()) / 1000))
    }
    return 300
  })

  // Custom UPI App Selection Bottom Sheet State (Open Only)
  const [showAppSelector, setShowAppSelector] = useState(false)

  // First-Time Payment Interactive Guided Tour State
  const [paymentTourStep, setPaymentTourStep] = useState(0)
  const [isPaymentTourActive, setIsPaymentTourActive] = useState(() => {
    return !isTourCompleted(STORAGE_KEYS.PAYMENT_TOUR)
  })

  const launchingTimeoutRef = useRef(null)
  const isLaunchingRef = useRef(false)
  const isPollingRef = useRef(false)

  const platform = detectPlatform()
  const phonePeLaunchUrl = getPhonePeLaunchUrl()

  const activeOrderId = orderMeta?.orderId || intentData?.orderId || ''
  const note = activeOrderId
    ? `XBuddy Order ${activeOrderId}`
    : (orderMeta?.isReprint ? 'XBuddy Reprint' : 'XBuddy Print')

  // Build standard UPI URI for QR code and generic fallback
  const upiQuery = buildUpiQuery({
    upiId: receiverConfig.upiId,
    payeeName: receiverConfig.payeeName,
    amount: total,
    note,
    refId: activeOrderId,
  })
  const genericUpiUri = intentData?.upiUri || `upi://pay?${upiQuery}`

  // ── 1. Fetch Safe Receiving Config & Authoritative Order on Mount ────────
  useEffect(() => {
    let isMounted = true
    getPaymentConfig()
      .then((cfg) => {
        if (isMounted && cfg && cfg.upiId) {
          setReceiverConfig({
            upiId: sanitizeUpiId(cfg.upiId),
            payeeName: sanitizePayeeName(cfg.payeeName),
          })
        }
      })
      .catch((err) => {
        console.warn('[Direct UPI Config Warn]:', err)
      })

    // Immediately register order on server to ensure persistent orderId & authoritative intent
    registerIntentOrderOnServer()

    return () => {
      isMounted = false
    }
  }, [])

  // ── 2. Vector SVG & High-Res PNG QR Generation ───────────────────────────
  useEffect(() => {
    if (!genericUpiUri) return
    let isCancelled = false

    // 2a. Vector SVG for clean on-screen rendering
    QRCode.toString(genericUpiUri, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        if (!isCancelled) setVectorQrSvg(svg)
      })
      .catch((err) => {
        console.warn('[Vector QR Generation Warn]:', err)
      })

    // 2b. High-Res PNG for sharp mobile download & UPI app gallery scanning
    generateSharpQrPng(genericUpiUri, {
      width: 800,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!isCancelled) setPngDataUrl(dataUrl)
      })
      .catch((err) => {
        console.warn('[PNG QR Generation Warn]:', err)
      })

    return () => {
      isCancelled = true
    }
  }, [genericUpiUri])

  // ── 3. Automatic QR Download Trigger (Idempotent per Order) ───────────────
  useEffect(() => {
    if (!pngDataUrl || !activeOrderId) return
    if (autoDownloadedOrdersRef.current.has(activeOrderId)) return

    // Verify whether QR was already downloaded in this or previous session
    const session = getSessionState()
    if (session?.orderId === activeOrderId && session?.isDownloaded) {
      autoDownloadedOrdersRef.current.add(activeOrderId)
      setIsDownloaded(true)
      return
    }

    autoDownloadedOrdersRef.current.add(activeOrderId)
    const filename = buildQrFilename(activeOrderId)
    const success = triggerQrDownload(pngDataUrl, filename)

    setIsDownloaded(true)
    setDownloadError(!success)
    setShowInstructionsPopup(true)

    // Save download state so reload does not trigger duplicate download
    saveSessionState({
      orderId: activeOrderId,
      isDownloaded: true,
    })
  }, [pngDataUrl, activeOrderId])

  // ── 4. Re-Download & App Launcher Handlers ────────────────────────────────
  function handleDownloadAgain() {
    const filename = buildQrFilename(activeOrderId)
    if (pngDataUrl) {
      const success = triggerQrDownload(pngDataUrl, filename)
      setDownloadError(!success)
      if (success) setIsDownloaded(true)
    } else if (genericUpiUri) {
      generateSharpQrPng(genericUpiUri, { width: 800, margin: 2 }).then((url) => {
        setPngDataUrl(url)
        const success = triggerQrDownload(url, filename)
        setDownloadError(!success)
        if (success) setIsDownloaded(true)
      })
    }
  }

  // ── 5. Absolute Timestamp Countdown Timer (Tab-Switch & Reload Immune) ────
  useEffect(() => {
    const tickCountdown = () => {
      const session = getSessionState()
      const expiry = session?.expiresAt || intentData?.expiresAt
      if (expiry) {
        const expiryMs = typeof expiry === 'string' ? new Date(expiry).getTime() : Number(expiry)
        const diff = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000))
        setRemainingSeconds(diff)
      } else {
        setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0))
      }
    }

    tickCountdown()
    const timer = setInterval(tickCountdown, 1000)

    const handleVisibilityOrShow = () => {
      if (document.visibilityState === 'visible') {
        tickCountdown()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrShow)
    window.addEventListener('pageshow', handleVisibilityOrShow)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityOrShow)
      window.removeEventListener('pageshow', handleVisibilityOrShow)
    }
  }, [intentData])

  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ── 6. Authoritative Server Order Persistence on Click & Mount ───────────
  async function registerIntentOrderOnServer(forceRefresh = false) {
    try {
      const orderPayload = {
        orderId: orderMeta?.orderId || activeOrderId || undefined,
        fileName: orderMeta?.fileName,
        totalPages: orderMeta?.totalPages || orderMeta?.filePages || 1,
        copies: orderMeta?.copies || 1,
        colorMode: orderMeta?.colorMode || 'bw',
        duplex: orderMeta?.isDoubleSide || orderMeta?.duplex || false,
        printableCount: orderMeta?.printableCount || orderMeta?.selectedPagesCount,
        phoneNumber: orderMeta?.phoneNumber,
        isReprint: orderMeta?.isReprint,
      }
      const data = await createDirectUpiIntentOrder(orderPayload)
      if (data && data.success) {
        setIntentData(data)
        if (data.qrSvg) {
          setVectorQrSvg(data.qrSvg)
        }

        const expiryMs = data.expiresAt ? new Date(data.expiresAt).getTime() : (Date.now() + 300 * 1000)
        saveSessionState({
          orderId: data.orderId,
          expiresAt: expiryMs,
          showPayment: true,
          paymentStatus: data.alreadyPaid ? 'paid' : 'pending',
        })

        const remaining = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000))
        setRemainingSeconds(remaining)

        if (data.alreadyPaid) {
          onSuccess(data.orderId, data)
        }
        return data
      }
    } catch (err) {
      console.warn('[Direct UPI Order Registration Notice]:', err.message)
    }
    return null
  }

  function handleRenewSession() {
    registerIntentOrderOnServer(true)
  }

  // ── 5. Background Verification Polling ────────────────────────────────────
  useEffect(() => {
    if (!activeOrderId || isPollingRef.current) return
    isPollingRef.current = true

    pollDirectUpiOrderStatus(activeOrderId, {
      maxAttempts: 60,
      intervalMs: 3000,
      onStatusUpdate: (order) => {
        if (order.isPaid || order.paymentStatus === 'paid' || order.paymentStatus === 'verified') {
          setTimeout(() => {
            onSuccess(activeOrderId, order)
          }, 600)
        }
      },
    }).finally(() => {
      isPollingRef.current = false
    })
  }, [activeOrderId, onSuccess])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (launchingTimeoutRef.current) {
        clearTimeout(launchingTimeoutRef.current)
      }
    }
  }, [])

  // ── 6. Handle App Tap / Launch ────────────────────────────────────────────
  async function handleSelectApp(app) {
    if (isLaunchingRef.current) return
    isLaunchingRef.current = true
    setTimeout(() => {
      isLaunchingRef.current = false
    }, 1500)

    setSelectedApp(app)

    // Ensure order is authoritatively registered on server
    const serverIntent = await registerIntentOrderOnServer()

    if (platform === 'desktop') {
      setViewMode('qr')
      setDesktopNotice(`Please scan the QR code below using ${app.name} on your mobile phone to pay ₹${Number(total || 0).toFixed(2)} for Order ${activeOrderId || ''}.`)
      setFallbackNotice('')
      return
    }

    setDesktopNotice('')
    setFallbackNotice('')

    // Generate app-specific intent or generic UPI URI
    const targetQuery = serverIntent?.upiUri ? serverIntent.upiUri.replace(/^upi:\/\/pay\?/, '') : upiQuery
    const { primary, genericFallback } = getUpiUrls({
      appId: app.id,
      platform,
      upiQuery: targetQuery,
    })

    setGenericFallbackUri(genericFallback)
    setStep('LAUNCHING')

    // Persist session snapshot synchronously before launching external app
    saveSessionState({
      orderId: activeOrderId || serverIntent?.orderId,
      showPayment: true,
      lastLaunchedApp: app.id,
      isDownloaded: true,
      step: 'LAUNCHING',
      updatedAt: Date.now(),
    })

    try {
      window.location.href = primary
    } catch (launchErr) {
      console.warn('[App Launch Intent Fallback]:', launchErr)
    }

    if (launchingTimeoutRef.current) clearTimeout(launchingTimeoutRef.current)
    launchingTimeoutRef.current = setTimeout(() => {
      setStep((currentStep) => (currentStep === 'LAUNCHING' ? 'DID_YOU_PAY' : currentStep))
    }, 4500)
  }

  function copyUpiId() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(receiverConfig.upiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2000)
    }
  }

  function copyOrderId() {
    if (activeOrderId && navigator.clipboard) {
      navigator.clipboard.writeText(activeOrderId)
      setCopiedOrderId(true)
      setTimeout(() => setCopiedOrderId(false), 2000)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />
      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-orange-200 shadow-2xl max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-[#222222]">
                {orderMeta?.isReprint
                  ? (step === 'FORM' ? t('payment.confirmAndPayReprint', 'Confirm Reprint Payment') : t('payment.confirmAndPayReprint', 'Pay for Reprint'))
                  : (step === 'FORM' ? t('payment.confirmPayment', 'Confirm Payment') : t('payment.scanAndPay', 'Scan & Pay'))}
              </h3>
              <p className="text-gray-400 text-xs">
                {orderMeta?.isReprint
                  ? t('payment.reprintNotice', 'New payment required for reprint · 30-min window')
                  : (step === 'FORM' ? t('payment.enterTxDetails', 'Enter transaction details') : t('payment.payUpiSubtitle', 'Direct UPI Payment to Shopkeeper'))}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Close payment modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ─── STEP 1: PAYMENT APP SELECTOR & QR CODE ─── */}
          {step === 'SELECT' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Amount Banner & Order ID Badge */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-4 text-center border border-orange-100 mb-4 shadow-2xs">
                <span className="text-xs text-slate-500 font-medium block mb-1">
                  {orderMeta?.isReprint ? t('payment.amountToPayReprint', 'Reprint Amount:') : t('payment.amountToPay', 'Amount to Pay:')}
                </span>
                <span className="text-3xl font-black text-[#F78C25] tracking-tight">₹{Number(total || 0).toFixed(2)}</span>

                {/* Clearly Visible XBuddy Order ID Card with 1-click Copy */}
                <div className="mt-3 bg-white/95 border border-orange-200 rounded-xl p-2.5 flex items-center justify-between shadow-2xs">
                  <div className="text-left">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                      {t('payment.orderReference', 'XBuddy Order ID')}
                    </span>
                    <span className="font-mono text-base font-extrabold text-slate-900 tracking-wider">
                      {activeOrderId || 'XP----'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copyOrderId}
                    disabled={!activeOrderId}
                    className="px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#F78C25] border border-orange-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                    title="Copy Order ID"
                  >
                    {copiedOrderId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">{t('common.copied', 'Copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('common.copy', 'Copy')}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Instruction for Payment Confirmation */}
                <p className="text-[11px] text-slate-600 font-semibold mt-2.5 flex items-center justify-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#F78C25] shrink-0" />
                  <span>
                    {t('payment.keepOrderIdNotice', 'Keep Order ID ({orderId}) for payment confirmation.', {
                      orderId: activeOrderId || 'XP----',
                    })}
                  </span>
                </p>

                <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-orange-200/50 text-[10px] text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Direct UPI · Receiver: <strong>{receiverConfig.payeeName}</strong></span>
                </div>
              </div>

              {/* View Switcher Tabs: Choose UPI App vs Scan QR Code */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setShowAppSelector(true)}
                  className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer text-slate-600 hover:text-[#F78C25] font-bold"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#F78C25]" /> {t('payment.chooseUpiApp', 'Choose your UPI app 📱')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    registerIntentOrderOnServer()
                  }}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'qr' ? 'bg-white text-[#F78C25] shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" /> {t('payment.scanQrCode', 'Scan QR Code')}
                </button>
              </div>

              {/* View: 1-Tap UPI Apps */}
              {viewMode === 'apps' && (
                <div className="space-y-2.5 mb-4">
                  {fallbackNotice && (
                    <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center justify-between shadow-2xs">
                      <span className="inline-flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{fallbackNotice}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setFallbackNotice('')}
                        className="text-amber-700 hover:text-amber-900 text-xs font-bold ml-2 cursor-pointer p-0.5"
                        aria-label="Dismiss notice"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                    <span>{t('payment.selectAppToOpen', 'Select app to open:')}</span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Direct Launcher</span>
                  </p>

                  {PAYMENT_APPS.map((app) => {
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => handleSelectApp(app)}
                        className={`w-full p-3 rounded-2xl border ${app.borderColor} bg-gradient-to-r ${app.bgGradient} flex items-center justify-between transition-all duration-150 cursor-pointer group shadow-2xs hover:shadow-xs`}
                      >
                        <div className="flex items-center gap-3">
                          {app.icon}
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{app.name}</span>
                            </div>
                            <p className="text-[10px] text-slate-400">{app.description}</p>
                          </div>
                        </div>
                        <span className="font-bold text-xs flex items-center gap-1 group-hover:translate-x-0.5 transition-transform" style={{ color: app.textColor }}>
                          {t('payment.openApp', { name: app.name })} <ArrowRight className="w-3 h-3" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* View: Vector SVG QR Code */}
              {viewMode === 'qr' && (
                <div className="mb-4 text-center">
                  {desktopNotice ? (
                    <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center justify-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{desktopNotice}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mb-2">{t('payment.scanWithApps', 'Scan using PhonePe, Google Pay, Paytm, or BHIM')}</p>
                  )}

                  {/* 5-Minute Expiry Countdown or Expired Session Banner */}
                  {remainingSeconds === 0 ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl mb-3 text-center shadow-xs">
                      <p className="text-xs font-bold text-red-700 mb-1">
                        ⚠️ {t('payment.sessionExpired', 'Payment Window Expired')}
                      </p>
                      <p className="text-[11px] text-red-600 mb-2">
                        {t('payment.expiredNotice', 'If you already paid in your UPI app, tap below to confirm. Otherwise, renew the session.')}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStep('FORM')}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer active:scale-98"
                        >
                          {t('payment.alreadyPaidBtn', 'I Already Paid')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRenewSession}
                          className="px-3 py-1.5 bg-white border border-red-300 text-red-700 font-bold text-xs rounded-xl hover:bg-red-50 cursor-pointer active:scale-98"
                        >
                          {t('payment.renewSessionBtn', 'Renew Session')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full py-1 px-3 w-fit mx-auto mb-3">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Session expires in: <strong>{formatCountdown(remainingSeconds)}</strong></span>
                    </div>
                  )}

                  {/* Crisp Vector SVG QR Code with Tap to Open Trigger */}
                  <div
                    onClick={() => setShowAppSelector(true)}
                    className="bg-white rounded-2xl p-4 mb-2 mx-auto w-fit border border-orange-200 shadow-sm cursor-pointer hover:border-[#F78C25] hover:shadow-md transition-all group relative"
                    title={t('payment.tapQrToChooseApp', 'Tap QR to choose UPI app 📱')}
                  >
                    {vectorQrSvg ? (
                      <div
                        className="w-48 h-48 mx-auto flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:rounded-lg"
                        dangerouslySetInnerHTML={{ __html: vectorQrSvg }}
                      />
                    ) : (
                      <div className="w-48 h-48 mx-auto flex items-center justify-center text-slate-400 text-xs">
                        Generating Vector QR...
                      </div>
                    )}
                    {/* Interactive prompt banner */}
                    <div className="mt-2 py-1 px-2.5 rounded-xl bg-orange-50 border border-orange-200 text-[#F78C25] text-[11px] font-bold flex items-center justify-center gap-1 transition-all group-hover:bg-[#F78C25] group-hover:text-white">
                      <Smartphone className="w-3 h-3 shrink-0" />
                      <span>{t('payment.tapQrToChooseApp', 'Tap QR to choose UPI app 📱')}</span>
                    </div>
                  </div>

                  {/* QR Action Buttons: Download Again, Open in App, & Payment Steps */}
                  <div className="flex items-center justify-center gap-1.5 min-[380px]:gap-2 mb-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDownloadAgain}
                      className="px-2.5 min-[380px]:px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] border border-orange-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> {t('payment.saveQrImage', 'Save QR Image')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAppSelector(true)}
                      className="px-2.5 min-[380px]:px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-[#F78C25] hover:from-orange-600 hover:to-orange-700 text-white border border-orange-400 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                    >
                      <Smartphone className="w-3.5 h-3.5" /> {t('payment.openInUpiApp', 'Open in UPI App 📱')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInstructionsPopup(true)}
                      className="px-2.5 min-[380px]:px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#5f259f] border border-purple-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" /> {t('payment.phonePeSteps', 'Payment Steps')}
                    </button>
                  </div>

                  {/* Order & Receiving Details */}
                  <div id="tour-payment-review-details" data-tour="payment-review-details" className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-3 text-xs space-y-1 text-left">
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Shop Name:</span>
                      <strong className="text-slate-800">{receiverConfig.payeeName}</strong>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Order Reference:</span>
                      <strong className="font-mono text-slate-800">{activeOrderId}</strong>
                    </div>
                  </div>

                  {/* UPI ID copy */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                    <div className="text-left">
                      <span className="text-slate-400 text-[10px] block">{t('payment.upiId', 'UPI ID')}</span>
                      <span className="font-mono font-bold text-slate-700">{receiverConfig.upiId}</span>
                    </div>
                    <button
                      type="button"
                      onClick={copyUpiId}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#F78C25] text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" /> {t('common.copied', 'Copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> {t('common.copy', 'Copy')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Jump to Form if already paid */}
              <div className="border-t border-slate-100 pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="text-xs font-semibold text-[#F78C25] hover:text-[#e07010] hover:underline cursor-pointer transition-colors"
                >
                  {t('payment.alreadyPaidPrompt', 'Already paid? Enter Transaction ID →')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 2: LAUNCHING APP ─── */}
          {step === 'LAUNCHING' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-5 text-center space-y-3.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center relative shadow-sm">
                <div className="w-10 h-10 border-3 border-[#F78C25] border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">{t('payment.openingApp', { name: selectedApp?.name || 'UPI App' })}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {t('payment.payInAppAndReturn', {
                    amount: Number(total || 0).toFixed(2),
                    name: selectedApp?.name || 'your UPI app',
                    orderId: activeOrderId || '',
                  })}
                </p>
              </div>

              {/* Action Hierarchy: Fallback Generic UPI -> Payment Completed -> QR Code fallback */}
              <div className="space-y-2 pt-1">
                <a
                  href={genericFallbackUri || genericUpiUri}
                  className="w-full py-2.5 px-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer no-underline"
                >
                  <Smartphone className="w-3.5 h-3.5" /> {t('payment.appDidntOpen', { name: selectedApp?.name || 'App' })}
                </a>

                <button
                  type="button"
                  onClick={() => setStep('DID_YOU_PAY')}
                  className="w-full py-2.5 bg-[#F78C25] text-white font-bold text-xs rounded-xl shadow-xs hover:bg-[#e07010] transition-colors cursor-pointer"
                >
                  {t('payment.completedThePayment', 'I Completed the Payment →')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    setStep('SELECT')
                  }}
                  className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  {t('payment.appCouldNotBeOpenedQr', 'App could not be opened? Use UPI QR Code')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 3: DID YOU PAY CONFIRMATION CHECK ─── */}
          {step === 'DID_YOU_PAY' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-4 space-y-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">{t('payment.didYouPayTitle', 'Did you complete the payment?')}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {t('payment.didYouPaySubtitle', { amount: Number(total || 0).toFixed(2), name: selectedApp?.name || 'UPI' })}
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-medium text-left flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Payment verification pending. Enter your UPI Transaction ID (UTR) or wait for shopkeeper approval to begin printing.
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> {t('payment.yesIPaid', { amount: Number(total || 0).toFixed(2) })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('qr')
                    setStep('SELECT')
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('payment.noOrQr', 'No / Use UPI QR Code')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 4: TRANSACTION ID CONFIRMATION FORM ─── */}
          {step === 'FORM' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                <span className="text-slate-500 font-medium">{t('payment.paymentFor', 'Payment for:')}</span>
                <span className="font-bold text-slate-800">₹{Number(total || 0).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => setStep('SELECT')}
                  className="text-xs text-[#F78C25] font-semibold hover:underline cursor-pointer"
                >
                  {t('payment.changeApp', 'Change App')}
                </button>
              </div>

              <PaymentProofForm orderMeta={orderMeta} onSuccess={onSuccess} onClose={onClose} />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Dynamic Payment QR Instructions Popup */}
      <PaymentQrInstructionsModal
        isOpen={showInstructionsPopup}
        onClose={() => {
          setShowInstructionsPopup(false)
          if (isPaymentTourActive && paymentTourStep === 0) {
            setPaymentTourStep(1)
          }
        }}
        onOpenUpiApps={() => setShowAppSelector(true)}
        amount={total}
        orderId={activeOrderId}
        payeeName={receiverConfig.payeeName}
        remainingSeconds={remainingSeconds}
        onDownloadAgain={handleDownloadAgain}
        isDownloaded={isDownloaded}
        downloadError={downloadError}
      />

      {/* First-Time Interactive Payment Tour */}
      {isPaymentTourActive && (
        <InteractiveTourSpotlight
          isOpen={isPaymentTourActive}
          stepIndex={paymentTourStep}
          totalSteps={2}
          stepData={
            paymentTourStep === 0
              ? {
                  targetSelector: '[data-tour="payment-qr-got-it"]',
                  title: t('tour.paymentStep1Title', 'Your QR is ready!'),
                  description: isDownloaded
                    ? t('tour.paymentStep1DescDownloaded', 'Your payment QR has been downloaded. Open your UPI app and select the QR from Gallery.')
                    : t('tour.paymentStep1DescStarted', 'Your payment QR download started. Open your UPI app and select the QR from Gallery.'),
                  pulseShape: 'pill',
                  padding: 8,
                  mascot: '/xbuddy-mascot.png',
                }
              : {
                  targetSelector: '[data-tour="payment-review-details"]',
                  title: t('tour.paymentStep2Title', 'One last check! 💳'),
                  description: t('tour.paymentStep2Desc', 'Check the recipient and amount before confirming your payment.'),
                  pulseShape: 'rect',
                  padding: 8,
                }
          }
          onNext={() => {
            if (paymentTourStep === 0) {
              setShowInstructionsPopup(false)
              setPaymentTourStep(1)
            }
          }}
          onBack={() => {
            if (paymentTourStep === 1) {
              setShowInstructionsPopup(true)
              setPaymentTourStep(0)
            }
          }}
          onFinish={() => {
            markTourCompleted(STORAGE_KEYS.PAYMENT_TOUR, 'completed')
            setIsPaymentTourActive(false)
          }}
          onSkip={() => {
            markTourCompleted(STORAGE_KEYS.PAYMENT_TOUR, 'dismissed')
            setIsPaymentTourActive(false)
          }}
        />
      )}

      {/* Custom UPI App Selection Bottom Sheet (Open App Only) */}
      <UpiAppSelectionSheet
        isOpen={showAppSelector}
        onClose={() => setShowAppSelector(false)}
        payeeName={receiverConfig.payeeName}
        amount={total}
        orderId={activeOrderId}
      />
    </AnimatePresence>
  )
}
