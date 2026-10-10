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
import { parsePageRange, resolveAllPages } from './utils/pageRangeParser'
import { createNormalizedPrintSettings } from './utils/printSettings'
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
import CampusAdsAdmin from './components/CampusAdsAdmin'
import XBuddyIntro from './components/XBuddyIntro'
import XBuddyLogo from './components/XBuddyLogo'
import Footer from './components/Footer'
import { Menu, ClipboardList, Check } from 'lucide-react'

const STEP = { HERO: 'hero', UPLOAD: 'upload', SETTINGS: 'settings', PRINTING: 'printing', RESUME: 'resume', MY_ORDERS: 'my_orders', ADMIN: 'admin', ADS: 'ads' }
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
    case STEP.ADS:
      return '/xbuddyads'
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
      if (path.startsWith('/xbuddyads') || hash === '#xbuddyads' || path.startsWith('/ads') || hash === '#ads') {
        return STEP.ADS
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
                            window.location.hash === '#orders' ||
                            window.location.pathname.startsWith('/xbuddyads') ||
                            window.location.hash === '#xbuddyads' ||
                            window.location.pathname.startsWith('/ads') ||
                            window.location.hash === '#ads'
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
    } else if (currentPath.startsWith('/xbuddyads') || currentHash === '#xbuddyads' || currentPath.startsWith('/ads') || currentHash === '#ads') {
      initialStep = STEP.ADS
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
        } else if (path.startsWith('/xbuddyads') || hash === '#xbuddyads' || path.startsWith('/ads') || hash === '#ads') {
          setStep(STEP.ADS)
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
    } else if (target === 'ads') {
      goToStep(STEP.ADS, { replace })
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

  const isCustomRange = settings.pageRange === 'custom'
  const customParsed = (fileInfo && isCustomRange)
    ? parsePageRange(settings.customPages, fileInfo.totalPages)
    : null

  const selectedPages = isCustomRange
    ? (customParsed?.valid ? customParsed.selectedPages : [])
    : resolveAllPages(fileInfo?.totalPages || 1)

  const selectedPageCount = selectedPages.length
  const printableCount = selectedPageCount

  // For print agent, GAS and downstream:
  // When custom range is active, pageRange is the exact parsed range (e.g. "1" or "1-3,5").
  // When All Pages is active, pageRange is "all".
  const resolvedPageRange = isCustomRange
    ? (customParsed?.valid ? customParsed.pageRangeString : '')
    : 'all'

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

  const normalizedSettings = fileInfo
    ? createNormalizedPrintSettings({
        colorMode: settings.colorMode,
        sideMode: settings.sideMode,
        copies: settings.copies,
        paperSize: settings.pageSize,
        orientation: settings.orientation,
        pageRangeMode: settings.pageRange,
        customPages: settings.customPages,
      }, fileInfo.totalPages)
    : null

  const orderMeta = fileInfo && normalizedSettings
    ? {
        fileName: fileInfo.name,
        totalPages: fileInfo.totalPages,
        ...normalizedSettings,
        margins: settings.margins,
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
    setFileInfo({ file: result.pdfBlob, originalFile: file, name: file.name, size: '', totalPages: result.totalPages, thumbnail: result.thumbnail, typeInfo: { label: 'PDF', icon: 'pdf', category: 'document' }, requiresAgent: false })
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

      {/* Navigation Bar - Hidden only on Resume Builder route */}
      {step !== STEP.RESUME && (
        <nav className="fixed top-0 left-0 right-0 z-40 glass-nav transition-all duration-300 w-full max-w-[100vw] overflow-x-hidden">
          <div className="w-full max-w-7xl mx-auto px-2 min-[360px]:px-2.5 min-[390px]:px-3 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between gap-1 sm:gap-4 overflow-x-hidden">
            <div className="flex items-center gap-1.5 min-[360px]:gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={openDrawer}
                className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 sm:w-auto sm:h-auto p-1 min-[360px]:p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F78C25] font-bold text-xs min-[360px]:text-sm sm:text-base transition-all border border-orange-200 shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={handleReset}
                className="flex items-center group text-left cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                aria-label="XBuddy Home"
              >
                <img
                  src="/xbuddy-logo-transparent.png"
                  alt="XBuddy"
                  className="w-[102px] min-[360px]:w-[114px] min-[390px]:w-[122px] sm:w-[142px] md:w-[160px] h-auto aspect-[1024/341] object-contain shrink-0"
                />
              </button>
            </div>

            {step === STEP.HERO ? (
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="hidden md:flex items-center gap-5 lg:gap-6 text-xs font-semibold text-slate-600">
                  <a href="#how-it-works" className="hover:text-[#F7931E] transition-colors">How It Works</a>
                  <a href="#why-x-buddy" className="hover:text-[#F7931E] transition-colors">Why X Buddy</a>
                  <a href="#perfect-for" className="hover:text-[#F7931E] transition-colors">Who Is It For</a>
                  <a href="#academic-toolkit" className="hover:text-[#F7931E] transition-colors">Academic Toolkit</a>
                  <button onClick={() => goToStep(STEP.RESUME)} className="hover:text-[#F7931E] transition-colors cursor-pointer">
                    Resume Builder
                  </button>
                  <button onClick={() => goToStep(STEP.MY_ORDERS)} className="hover:text-[#F7931E] transition-colors flex items-center gap-1.5 cursor-pointer">
                    <ClipboardList className="w-4 h-4 text-[#F7931E]" /> My Orders
                  </button>
                </div>
                <button
                  onClick={() => goToStep(STEP.UPLOAD)}
                  className="px-3.5 min-[360px]:px-4 sm:px-5 py-1.5 sm:py-2 bg-gradient-to-r from-[#F7931E] to-[#FF6B00] hover:from-[#FF9C26] hover:to-[#EB740A] text-white rounded-lg sm:rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all cursor-pointer shrink-0"
                >
                  Print Now →
                </button>
              </div>
            ) : step === STEP.MY_ORDERS || step === STEP.ADMIN || step === STEP.ADS ? (
              <button
                onClick={handleReset}
                className="px-3 min-[360px]:px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                ← Back to Home
              </button>
            ) : (
              <div className="flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-3 text-[10px] min-[360px]:text-[11px] sm:text-xs font-semibold shrink-0">
                {[
                  { key: STEP.UPLOAD, label: 'Upload', short: 'Upload' },
                  { key: STEP.SETTINGS, label: 'Settings', short: 'Settings' },
                  { key: STEP.PRINTING, label: 'Pay & Print', short: 'Pay' }
                ].map(({ key, label, short }, i) => {
                  const stepKeys = [STEP.UPLOAD, STEP.SETTINGS, STEP.PRINTING]
                  const isPast   = (step === STEP.SETTINGS && i === 0) || (step === STEP.PRINTING && i < 2)
                  const isActive = step === stepKeys[i]
                  return (
                    <div key={label} className="flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 shrink-0">
                      <span className={`px-1.5 min-[360px]:px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${
                        isPast
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : isActive
                            ? 'bg-orange-50 text-[#F7931E] border border-orange-200 font-bold'
                            : 'text-slate-400 border border-transparent'
                      }`}>
                        {isPast ? <Check className="w-3 h-3 text-emerald-600 inline" /> : `${i + 1}.`}{' '}
                        {short === label ? (
                          label
                        ) : (
                          <>
                            <span className="inline min-[430px]:hidden">{short}</span>
                            <span className="hidden min-[430px]:inline">{label}</span>
                          </>
                        )}
                      </span>
                      {i < 2 && (
                        <span className="text-slate-300 text-[9px] min-[360px]:text-[10px] sm:text-xs select-none">
                          ›
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className={step === STEP.RESUME ? '' : 'pt-16 sm:pt-20'}>
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
              <Footer
                onStartPrinting={() => goToStep(STEP.UPLOAD)}
                onMyOrders={() => goToStep(STEP.MY_ORDERS)}
                onResumeBuilder={() => goToStep(STEP.RESUME)}
                onShopStaff={() => goToStep(STEP.ADMIN)}
                onCampusAds={() => goToStep(STEP.ADS)}
              />
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
            <motion.div key="resume" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen h-[100dvh] w-full overflow-hidden">
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

          {step === STEP.ADS && (
            <motion.div key="ads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CampusAdsAdmin onBack={handleReset} />
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
