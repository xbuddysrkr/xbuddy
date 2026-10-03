import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Hero from './components/Hero'
import Workflow from './components/Workflow'
import WhyXBuddy from './components/WhyXBuddy'
import PerfectFor from './components/PerfectFor'
import UploadSection from './components/UploadSection'
import PrintSettings from './components/PrintSettings'
import PriceCard from './components/PriceCard'
import PaymentModal from './components/PaymentModal'
import PrintStatus from './components/PrintStatus'
import AcademicToolkit from './components/AcademicToolkit'
import { calcPriceBreakdown } from './utils/pricing'
import { parsePageRange } from './utils/pageRangeParser'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
import { processFile, countPdfPagesFromBinary, countOfficeDocumentPages } from './utils/fileProcessor'

import ResumeBuilder from './resume-builder/ResumeBuilder'
import NavigationDrawer from './components/NavigationDrawer'
import MyOrdersPage from './components/MyOrdersPage'
import AdminDashboard from './components/AdminDashboard'
import XBuddyIntro from './components/XBuddyIntro'
import XBuddyLogo from './components/XBuddyLogo'

const STEP = { HERO: 'hero', UPLOAD: 'upload', SETTINGS: 'settings', PRINTING: 'printing', RESUME: 'resume', MY_ORDERS: 'my_orders', ADMIN: 'admin' }
const DEFAULT_SETTINGS = {
  colorMode: 'bw', sideMode: 'single', copies: 1,
  pageSize: 'A4', orientation: 'portrait', margins: 'normal',
  pageRange: 'all', customPages: '', imageFit: 'fit',
}

function getUrlForStep(stepName) {
  switch (stepName) {
    case STEP.UPLOAD:
    case STEP.SETTINGS:
      return '/print'
    case STEP.MY_ORDERS:
      return '/my-orders'
    case STEP.ADMIN:
      return '/admin'
    case STEP.RESUME:
      return '/resume'
    case STEP.PRINTING:
      return '/order-status'
    case STEP.HERO:
    default:
      return '/'
  }
}

async function getPageCountFromFile(file) {
  try {
    const result = await processFile(file)
    return result.totalPages
  } catch (err) {
    try {
      const buffer = await file.arrayBuffer()
      const ext = file.name.split('.').pop().toLowerCase()
      if (ext === 'pdf') {
        return countPdfPagesFromBinary(buffer)
      } else {
        return countOfficeDocumentPages(buffer, file.name)
      }
    } catch {
      return 1
    }
  }
}

export default function App() {
  const [step, setStep]               = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase()
      const hash = window.location.hash.toLowerCase()
      if (path.startsWith('/admin') || hash === '#admin') {
        return STEP.ADMIN
      }
      if (path.startsWith('/my-orders') || hash === '#orders') {
        return STEP.MY_ORDERS
      }
      if (path.startsWith('/resume') || hash === '#resume') {
        return STEP.RESUME
      }
      if (path.startsWith('/print') || hash === '#print') {
        return STEP.UPLOAD
      }
    }
    return STEP.HERO
  })
  const [fileInfo, setFileInfo]       = useState(null)
  const [settings, setSettings]       = useState(DEFAULT_SETTINGS)
  const [showPayment, setShowPayment] = useState(false)
  const [orderId, setOrderId]         = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [showIntro, setShowIntro]     = useState(() => {
    if (typeof window !== 'undefined') {
      const isDirectRoute = window.location.pathname.startsWith('/admin') ||
                            window.location.hash === '#admin' ||
                            window.location.pathname.startsWith('/my-orders') ||
                            window.location.hash === '#orders'
      if (isDirectRoute) return false
      if (window.sessionStorage.getItem('xbuddy_intro_seen')) return false
      return true
    }
    return false
  })

  const settingsRef = useRef(null)
  const isNavigatingRef = useRef(false)
  const orderIdRef = useRef(null)

  // 1. Initial history entry setup (use replaceState so initial load does NOT create duplicate history entry)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const currentPath = window.location.pathname.toLowerCase()
    const currentHash = window.location.hash.toLowerCase()
    let initialStep = STEP.HERO

    if (currentPath.startsWith('/admin') || currentHash === '#admin') {
      initialStep = STEP.ADMIN
    } else if (currentPath.startsWith('/my-orders') || currentHash === '#orders') {
      initialStep = STEP.MY_ORDERS
    } else if (currentPath.startsWith('/resume') || currentHash === '#resume') {
      initialStep = STEP.RESUME
    } else if (currentPath.startsWith('/print') || currentHash === '#print') {
      initialStep = STEP.UPLOAD
    }

    const state = window.history.state
    if (!state || !state.step) {
      try {
        window.history.replaceState({
          step: initialStep,
          showPayment: false,
          isDrawerOpen: false,
          orderId: null,
        }, '', window.location.href)
      } catch {}
    }
  }, [])

  // 2. Browser Back / Forward handler (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return

    function handlePopState(event) {
      const state = event.state
      isNavigatingRef.current = true

      if (state && typeof state === 'object') {
        setShowPayment(Boolean(state.showPayment))
        setIsDrawerOpen(Boolean(state.isDrawerOpen))

        if (state.step && Object.values(STEP).includes(state.step)) {
          setStep(state.step)
        } else {
          setStep(STEP.HERO)
        }

        if (state.orderId !== undefined) {
          setOrderId(state.orderId)
          orderIdRef.current = state.orderId
        }

        if (state.step === STEP.HERO) {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else {
        // Fallback for null history state (e.g. direct URL entry or edge cases)
        setShowPayment(false)
        setIsDrawerOpen(false)

        const path = window.location.pathname.toLowerCase()
        const hash = window.location.hash.toLowerCase()

        if (path.startsWith('/admin') || hash === '#admin') {
          setStep(STEP.ADMIN)
        } else if (path.startsWith('/my-orders') || hash === '#orders') {
          setStep(STEP.MY_ORDERS)
        } else if (path.startsWith('/resume') || hash === '#resume') {
          setStep(STEP.RESUME)
        } else if (path.startsWith('/print') || hash === '#print') {
          setStep(STEP.UPLOAD)
        } else {
          setStep(STEP.HERO)
        }
      }

      isNavigatingRef.current = false
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // 3. Central Navigation Controller: pushes or replaces history entry
  function goToStep(nextStep, options = {}) {
    if (isNavigatingRef.current) return
    const { replace = false, preserveScroll = false } = options
    const targetUrl = getUrlForStep(nextStep)
    const nextState = {
      step: nextStep,
      showPayment: false,
      isDrawerOpen: false,
      orderId: orderIdRef.current,
    }

    try {
      if (replace) {
        window.history.replaceState(nextState, '', targetUrl)
      } else {
        window.history.pushState(nextState, '', targetUrl)
      }
    } catch {}

    setStep(nextStep)
    setShowPayment(false)
    setIsDrawerOpen(false)

    if (!preserveScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 4. Modal Controls with History Integration
  function openPayment() {
    if (showPayment) return
    const currentState = window.history.state || { step, showPayment: false, isDrawerOpen: false }
    try {
      window.history.pushState({ ...currentState, showPayment: true }, '', window.location.pathname + '#payment')
    } catch {}
    setShowPayment(true)
  }

  function closePayment() {
    if (!showPayment) return
    if (window.history.state?.showPayment) {
      window.history.back()
    } else {
      setShowPayment(false)
    }
  }

  function openDrawer() {
    if (isDrawerOpen) return
    const currentState = window.history.state || { step, showPayment: false, isDrawerOpen: false }
    try {
      window.history.pushState({ ...currentState, isDrawerOpen: true }, '', window.location.href)
    } catch {}
    setIsDrawerOpen(true)
  }

  function closeDrawer() {
    if (!isDrawerOpen) return
    if (window.history.state?.isDrawerOpen) {
      window.history.back()
    } else {
      setIsDrawerOpen(false)
    }
  }

  function handleDrawerNavigate(target) {
    setIsDrawerOpen(false)
    const replace = Boolean(window.history.state?.isDrawerOpen)

    if (target === 'home') {
      goToStep(STEP.HERO, { replace })
    } else if (target === 'my_orders') {
      goToStep(STEP.MY_ORDERS, { replace })
    } else if (target === 'admin') {
      goToStep(STEP.ADMIN, { replace })
    } else if (target === 'about') {
      goToStep(STEP.HERO, { replace })
      setTimeout(() => {
        const el = document.getElementById('why-x-buddy')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    } else if (target === 'help') {
      goToStep(STEP.HERO, { replace })
      setTimeout(() => {
        const el = document.getElementById('how-it-works')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    }
  }

  let selectedPages = []
  if (fileInfo && settings.pageRange === 'custom' && settings.customPages) {
    const parsed = parsePageRange(settings.customPages, fileInfo.totalPages)
    if (parsed.valid) selectedPages = parsed.selectedPages
  }

  const priceBreakdown = fileInfo
    ? calcPriceBreakdown({
        totalPages: fileInfo.totalPages,
        colorMode: settings.colorMode,
        isDoubleSide: settings.sideMode === 'double',
        copies: settings.copies,
        pageRange: settings.pageRange,
        selectedPages,
      })
    : { totalAmount: 0, printingCost: 0, serviceFee: 0, printablePages: 0 }

  const total = priceBreakdown.totalAmount
  const printableCount = settings.pageRange === 'custom' ? selectedPages.length : (fileInfo?.totalPages || 1)

  const orderMeta = fileInfo
    ? {
        fileName: fileInfo.name,
        totalPages: fileInfo.totalPages,
        copies: settings.copies,
        printType: settings.colorMode === 'color' ? 'Color' : 'B&W',
        printSide: settings.sideMode === 'double' ? 'Double' : 'Single',
        pageSize: settings.pageSize,
        orientation: settings.orientation,
        margins: settings.margins,
        pageRange: settings.pageRange,
        customPages: settings.customPages,
        selectedPages,
        printableCount,
        imageFit: settings.imageFit,
        printingCost: priceBreakdown.printingCost,
        digitalProcessingFee: priceBreakdown.digitalProcessingFee,
        serviceFee: priceBreakdown.digitalProcessingFee,
        amount: total,
        pdfFile: fileInfo.file,
        requiresAgent: fileInfo.requiresAgent || false,
      }
    : null

  async function handleFileReady(info) {
    setFileInfo(info)
    goToStep(STEP.SETTINGS, { preserveScroll: true })
    setTimeout(() => settingsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function handleExternalPrint(fileOrUrl, name) {
    let file
    if (typeof fileOrUrl === 'string') {
      const res  = await fetch(fileOrUrl)
      const blob = await res.blob()
      file = new File([blob], name + '.pdf', { type: 'application/pdf' })
    } else {
      file = fileOrUrl
    }
    const result = await processFile(file)
    setFileInfo({ file: result.pdfBlob, originalFile: file, name: file.name, size: '', totalPages: result.totalPages, thumbnail: result.thumbnail, typeInfo: { label: 'PDF', icon: '📄', category: 'document' }, requiresAgent: false })
    goToStep(STEP.SETTINGS)
    setTimeout(() => settingsRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
  }

  function handleOrderSuccess(id) {
    setOrderId(id)
    orderIdRef.current = id
    setShowPayment(false)
    goToStep(STEP.PRINTING, { replace: true })
  }

  function handleReset() {
    goToStep(STEP.HERO)
    setFileInfo(null)
    setSettings(DEFAULT_SETTINGS)
    setShowPayment(false)
    setOrderId(null)
    orderIdRef.current = null
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-orange-100 selection:text-[#F7931E]">
      {/* Navigation Drawer */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onNavigate={handleDrawerNavigate}
        currentStep={step}
      />

      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 glass-nav transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openDrawer}
              className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] font-bold text-base transition-all border border-orange-200 shadow-xs"
              aria-label="Open Navigation Menu"
            >
              ☰
            </button>
            <button onClick={handleReset} className="flex items-center gap-2.5 group text-left cursor-pointer">
              <XBuddyLogo className="w-9 h-9 sm:w-10 sm:h-10 group-hover:scale-105 transition-transform" />
              <div className="flex flex-col">
                <span className="text-slate-900 font-extrabold text-lg leading-none tracking-tight group-hover:text-[#F7931E] transition-colors">
                  X Buddy
                </span>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
                  Smart Digital Printing
                </span>
              </div>
            </button>
          </div>

          {step === STEP.HERO ? (
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
                <a href="#how-it-works" className="hover:text-[#F7931E] transition-colors">How It Works</a>
                <a href="#why-x-buddy" className="hover:text-[#F7931E] transition-colors">Why X Buddy</a>
                <a href="#perfect-for" className="hover:text-[#F7931E] transition-colors">Who Is It For</a>
                <a href="#academic-toolkit" className="hover:text-[#F7931E] transition-colors">Academic Toolkit</a>
                <button onClick={() => goToStep(STEP.RESUME)} className="hover:text-[#F7931E] transition-colors cursor-pointer">
                  Resume Builder
                </button>
                <button onClick={() => goToStep(STEP.MY_ORDERS)} className="hover:text-[#F7931E] transition-colors flex items-center gap-1 cursor-pointer">
                  📋 My Orders
                </button>
                <button onClick={() => goToStep(STEP.ADMIN)} className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-[#F7931E] border border-orange-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer">
                  🏪 Shop Staff
                </button>
              </div>
              <button
                onClick={() => goToStep(STEP.UPLOAD)}
                className="px-5 py-2 bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                Print Now →
              </button>
            </div>
          ) : step === STEP.RESUME || step === STEP.MY_ORDERS || step === STEP.ADMIN ? (
            <button
              onClick={handleReset}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              ← Back to Home
            </button>
          ) : (
            <div className="flex items-center gap-3 text-xs font-semibold">
              {['Upload', 'Settings', 'Pay & Print'].map((label, i) => {
                const stepKeys = [STEP.UPLOAD, STEP.SETTINGS, STEP.PRINTING]
                const isPast   = step === STEP.PRINTING && i < 2
                const isActive = step === stepKeys[i]
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg ${isPast ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : isActive ? 'bg-orange-50 text-[#F7931E] border border-orange-200' : 'text-slate-400'}`}>
                      {isPast ? '✓' : `${i + 1}.`} {label}
                    </span>
                    {i < 2 && <span className="text-slate-300">›</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16">
        <AnimatePresence mode="wait">
          {step === STEP.HERO && (
            <motion.div key="hero" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              {/* Hero Section */}
              <Hero onGetStarted={() => goToStep(STEP.UPLOAD)} onResumeBuilder={() => goToStep(STEP.RESUME)} onMyOrders={() => goToStep(STEP.MY_ORDERS)} />
              
              {/* Timeline Section */}
              <div id="how-it-works">
                <Workflow onStartPrint={() => goToStep(STEP.UPLOAD)} />
              </div>

              {/* Feature Grid */}
              <div id="why-x-buddy">
                <WhyXBuddy />
              </div>

              {/* Perfect For Section */}
              <div id="perfect-for">
                <PerfectFor />
              </div>

              {/* Academic Toolkit Section */}
              <div id="academic-toolkit" className="border-t border-orange-100/60 bg-gradient-to-b from-white via-orange-50/20 to-white">
                <AcademicToolkit onPrint={handleExternalPrint} />
              </div>

              {/* Premium Footer */}
              <footer className="border-t border-orange-100 bg-white py-12 px-4">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F7931E] flex items-center justify-center text-white font-bold text-sm">
                      X
                    </div>
                    <div>
                      <p className="text-slate-900 font-bold text-sm">X Buddy</p>
                      <p className="text-slate-400 text-xs">Digital Print Ordering Platform for Campus Xerox Shops</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <button onClick={() => goToStep(STEP.ADMIN)} className="text-slate-500 hover:text-[#F7931E] font-medium transition-colors cursor-pointer">
                      🏪 Xerox Shop Staff Dashboard
                    </button>
                    <span className="w-1 h-1 rounded-full bg-[#F7931E]" />
                    <span>Powered by <strong className="text-slate-700 font-semibold">NextGen Labs</strong></span>
                    <span className="w-1 h-1 rounded-full bg-[#F7931E]" />
                    <span>© {new Date().getFullYear()} All Rights Reserved.</span>
                  </div>
                </div>
              </footer>
            </motion.div>
          )}

          {(step === STEP.UPLOAD || step === STEP.SETTINGS) && (
            <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UploadSection onFileReady={handleFileReady} />
              <AnimatePresence>
                {fileInfo && step === STEP.SETTINGS && (
                  <motion.div ref={settingsRef} key="settings" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <PrintSettings fileInfo={fileInfo} settings={settings} onChange={setSettings} />
                    <PriceCard fileInfo={fileInfo} settings={settings} onPayAndPrint={openPayment} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {step === STEP.RESUME && (
            <motion.div key="resume" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: 'calc(100vh - 4rem)' }}>
              <ResumeBuilder onPrint={handleExternalPrint} onBack={handleReset} />
            </motion.div>
          )}

          {step === STEP.MY_ORDERS && (
            <motion.div key="my_orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MyOrdersPage onStartPrinting={() => goToStep(STEP.UPLOAD)} />
            </motion.div>
          )}

          {step === STEP.ADMIN && (
            <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminDashboard />
            </motion.div>
          )}

          {step === STEP.PRINTING && (
            <motion.div key="printing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <PrintStatus
                fileInfo={fileInfo}
                settings={settings}
                orderId={orderId}
                onReset={handleReset}
                onViewMyOrders={() => goToStep(STEP.MY_ORDERS)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {showPayment && (
        <PaymentModal total={total} orderMeta={orderMeta} onSuccess={handleOrderSuccess} onClose={closePayment} />
      )}

      {/* Cinematic Brand Intro Native Animation Overlay */}
      {showIntro && (
        <XBuddyIntro
          onComplete={() => {
            try {
              window.sessionStorage.setItem('xbuddy_intro_seen', 'true')
            } catch {}
            setShowIntro(false)
          }}
        />
      )}
    </div>
  )
}
