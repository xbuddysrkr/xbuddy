import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Home, ClipboardList, Store, Megaphone, Info, HelpCircle, X } from 'lucide-react'

export default function NavigationDrawer({ isOpen, onClose, onNavigate, currentStep }) {
  const drawerRef = useRef(null)
  const previousFocusRef = useRef(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      const focusTimer = setTimeout(() => {
        const closeBtn = drawerRef.current?.querySelector('button[aria-label="Close Navigation Menu"]')
        if (closeBtn) {
          closeBtn.focus()
        }
      }, 50)

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }

      window.addEventListener('keydown', handleKeyDown)

      return () => {
        clearTimeout(focusTimer)
        document.body.style.overflow = originalOverflow
        window.removeEventListener('keydown', handleKeyDown)
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus()
        }
      }
    }
  }, [isOpen, onClose])

  // Determine active item from actual route / step / hash rather than a hard-coded Home selection
  const getActiveItem = () => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase()
      const hash = window.location.hash.toLowerCase()

      if (path.startsWith('/admin') || hash === '#admin' || currentStep === 'admin') return 'admin'
      if (path.startsWith('/xbuddyads') || path.startsWith('/ads') || hash === '#xbuddyads' || hash === '#ads' || currentStep === 'ads') return 'ads'
      if (path.startsWith('/my-orders') || hash === '#orders' || currentStep === 'my_orders') return 'my_orders'
      if (hash === '#why-x-buddy') return 'about'
      if (hash === '#how-it-works') return 'help'
      if (currentStep === 'hero' || currentStep === 'home') return 'home'
    }
    return currentStep === 'hero' ? 'home' : currentStep
  }

  const activeId = getActiveItem()

  const menuItems = [
    { id: 'home', label: 'Home', icon: Home, action: () => onNavigate('home') },
    { id: 'my_orders', label: 'My Orders', icon: ClipboardList, action: () => onNavigate('my_orders') },
    { id: 'admin', label: 'Shop Dashboard', icon: Store, action: () => onNavigate('admin') },
    { id: 'ads', label: 'Campus Ads', icon: Megaphone, action: () => onNavigate('ads') },
    { id: 'about', label: 'About X Buddy', icon: Info, action: () => onNavigate('about') },
    { id: 'help', label: 'Help', icon: HelpCircle, action: () => onNavigate('help') },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Subtle Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0.05 } : { duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 cursor-pointer"
            aria-hidden="true"
          />

          {/* Slide-out Drawer */}
          <motion.div
            ref={drawerRef}
            key="drawer-content"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            tabIndex={-1}
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '-100%' }}
            transition={
              shouldReduceMotion
                ? { duration: 0.05 }
                : { type: 'spring', damping: 28, stiffness: 280 }
            }
            className="fixed top-0 left-0 bottom-0 w-[84vw] max-w-[340px] sm:w-80 md:w-84 h-full h-[100dvh] bg-[#FFFDF9] border-r border-orange-200/80 shadow-2xl z-50 flex flex-col justify-between overflow-hidden"
          >
            {/* Top Header */}
            <div className="p-4 sm:p-5 border-b border-orange-100 flex items-center justify-between bg-white shrink-0">
              <button
                type="button"
                onClick={() => {
                  onNavigate('home')
                  onClose()
                }}
                className="flex items-center group text-left cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                aria-label="XBuddy Home"
              >
                <img
                  src="/xbuddy-logo-transparent.png"
                  alt="XBuddy"
                  className="w-[115px] sm:w-[130px] h-auto aspect-[1024/341] object-contain shrink-0"
                />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-orange-50/80 hover:bg-orange-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors border border-orange-200/70 shadow-2xs cursor-pointer shrink-0"
                aria-label="Close Navigation Menu"
              >
                <X className="w-4 h-4 text-slate-700" strokeWidth={2.2} />
              </button>
            </div>

            {/* Navigation Section */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
              <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 select-none">
                NAVIGATION
              </p>
              {menuItems.map((item) => {
                const isActive = activeId === item.id
                const IconComponent = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      item.action()
                      onClose()
                    }}
                    className={`w-full flex items-center gap-3.5 px-4 h-[50px] sm:h-[52px] rounded-xl sm:rounded-2xl text-sm transition-all text-left cursor-pointer ${
                      isActive
                        ? 'bg-[#FFF7ED] text-[#F7931E] border border-orange-200/90 font-bold shadow-2xs'
                        : 'text-slate-800 font-medium hover:bg-orange-50/50 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <IconComponent
                      className="w-5 h-5 shrink-0 text-[#F7931E]"
                      strokeWidth={2}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Fixed Bottom Information Card */}
            <div className="p-4 border-t border-orange-100 bg-[#FFFDF9] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="p-3.5 bg-white border border-orange-200/80 rounded-2xl text-center shadow-2xs">
                <p className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                  Campus Xerox Ordering
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-relaxed">
                  Show Order ID at the Xerox shop to collect.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
