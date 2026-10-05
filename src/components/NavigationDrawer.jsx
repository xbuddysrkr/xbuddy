import { motion, AnimatePresence } from 'framer-motion'
import XBuddyLogo from './XBuddyLogo'

export default function NavigationDrawer({ isOpen, onClose, onNavigate, currentStep }) {
  const menuItems = [
    { id: 'home', label: 'Home', icon: '🏠', action: () => onNavigate('home') },
    { id: 'my_orders', label: 'My Orders', icon: '📋', action: () => onNavigate('my_orders') },
    { id: 'admin', label: 'Shop Dashboard', icon: '🏪', action: () => onNavigate('admin') },
    { id: 'about', label: 'About X Buddy', icon: '💡', action: () => onNavigate('about') },
    { id: 'help', label: 'Help', icon: '❓', action: () => onNavigate('help') },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50"
          />

          {/* Slide-out Drawer */}
          <motion.div
            key="drawer-content"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed top-0 left-0 bottom-0 w-72 sm:w-80 bg-[#FFFDF9] border-r border-orange-200 shadow-2xl z-50 flex flex-col justify-between"
          >
            <div>
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-orange-100 flex items-center justify-between bg-white/60">
                <button
                  type="button"
                  onClick={() => { onNavigate('home'); onClose(); }}
                  className="flex items-center group text-left cursor-pointer"
                  aria-label="XBuddy Home"
                >
                  <img
                    src="/xbuddy-logo-transparent.png"
                    alt="XBuddy"
                    className="h-8 sm:h-9 w-auto object-contain"
                  />
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 text-gray-400 flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Navigation Items */}
              <div className="p-4 space-y-1.5">
                <p className="px-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Navigation
                </p>
                {menuItems.map((item) => {
                  const isActive = currentStep === item.id || (item.id === 'home' && currentStep === 'hero')
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action()
                        onClose()
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all ${isActive
                          ? 'bg-orange-50 text-[#F7931E] border border-orange-200 shadow-xs'
                          : 'text-slate-700 hover:bg-orange-50/60 hover:text-[#F78C25]'
                        }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer inside Drawer */}
            <div className="p-4 border-t border-orange-100 bg-orange-50/30">
              <div className="p-3 bg-white border border-orange-100 rounded-xl text-center">
                <p className="text-xs font-semibold text-[#222222]">Campus Xerox Ordering</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Show Order ID at the Xerox shop to collect</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
