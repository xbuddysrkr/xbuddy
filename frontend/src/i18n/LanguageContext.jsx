import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { en } from './locales/en'
import { te } from './locales/te'

const STORAGE_KEY = 'xbuddy_language'

const TRANSLATIONS = {
  en,
  te,
}

export const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === 'te' || stored === 'en') return stored
      } catch {}
    }
    return 'en' // Default is English for first-time visitors
  })

  // Synchronize document attributes on language change
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  const setLanguage = useCallback((newLang) => {
    if (newLang !== 'en' && newLang !== 'te') return
    setLanguageState(newLang)
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, newLang)
      }
    } catch {}
  }, [])

  /**
   * Reusable translation resolver.
   * Usage:
   *   t('common.printNow')
   *   t('pricing.estimatedTime', { count: 30 })
   *   t('custom.key', 'Fallback string')
   */
  const t = useCallback((path, paramsOrFallback = null, fallback = null) => {
    if (!path || typeof path !== 'string') return ''

    let params = null
    let defaultText = null

    if (paramsOrFallback !== null && typeof paramsOrFallback === 'object') {
      params = paramsOrFallback
      defaultText = typeof fallback === 'string' ? fallback : null
    } else if (typeof paramsOrFallback === 'string') {
      defaultText = paramsOrFallback
      if (fallback !== null && typeof fallback === 'object') {
        params = fallback
      }
    } else if (typeof fallback === 'string') {
      defaultText = fallback
    } else if (fallback !== null && typeof fallback === 'object') {
      params = fallback
    }

    const keys = path.split('.')

    // 1. Try active language
    let current = TRANSLATIONS[language]
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k]
      } else {
        current = undefined
        break
      }
    }

    // 2. Fall back to English
    if (current === undefined || current === null) {
      let fallbackObj = TRANSLATIONS.en
      for (const k of keys) {
        if (fallbackObj && typeof fallbackObj === 'object' && k in fallbackObj) {
          fallbackObj = fallbackObj[k]
        } else {
          fallbackObj = undefined
          break
        }
      }
      current = fallbackObj
    }

    // 3. Fall back to provided defaultText or raw path
    if (current === undefined || current === null || typeof current !== 'string') {
      current = defaultText || path
    }

    // 4. Interpolate {param} tokens
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        current = current.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal))
      })
    }

    return current
  }, [language])

  const value = {
    language,
    isTelugu: language === 'te',
    setLanguage,
    t,
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    // Graceful fallback if called outside provider (e.g. tests or isolated components)
    return {
      language: 'en',
      isTelugu: false,
      setLanguage: () => {},
      t: (path, paramsOrFallback, fallback) => {
        let text = ''
        let params = null
        if (paramsOrFallback !== null && typeof paramsOrFallback === 'object') {
          params = paramsOrFallback
          text = typeof fallback === 'string' ? fallback : (path.split('.').pop() || path)
        } else if (typeof paramsOrFallback === 'string') {
          text = paramsOrFallback
          if (fallback !== null && typeof fallback === 'object') {
            params = fallback
          }
        } else if (typeof fallback === 'string') {
          text = fallback
        } else {
          text = path.split('.').pop() || path
        }
        if (params && typeof params === 'object') {
          Object.entries(params).forEach(([k, v]) => {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
          })
        }
        return text
      },
    }
  }
  return context
}

/**
 * Clean, accessible Language Switcher component matching XBuddy aesthetic.
 * Segmented Pill: English | తెలుగు
 */
export function LanguageSwitcher({ className = '', variant = 'header' }) {
  const { language, setLanguage } = useLanguage()

  const isTe = language === 'te'

  if (variant === 'drawer') {
    return (
      <div className={`p-3 bg-white border border-orange-200/80 rounded-2xl flex items-center justify-between shadow-2xs ${className}`}>
        <span className="text-xs font-bold text-slate-700">Language / భాష:</span>
        <div
          role="group"
          aria-label="Language selection"
          className="inline-flex items-center p-1 bg-orange-50/80 border border-orange-200/90 rounded-xl gap-1"
        >
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-pressed={!isTe}
            className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
              !isTe
                ? 'bg-[#F7931E] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('te')}
            aria-pressed={isTe}
            className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
              isTe
                ? 'bg-[#F7931E] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            తెలుగు
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center p-0.5 sm:p-1 bg-orange-50/90 hover:bg-orange-100/70 border border-orange-200/80 rounded-xl transition-all shadow-2xs shrink-0 select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={!isTe}
        className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
          !isTe
            ? 'bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white shadow-xs'
            : 'text-slate-600 hover:text-[#F7931E]'
        }`}
      >
        English
      </button>
      <span className="text-orange-300 text-[10px] sm:text-xs px-0.5 select-none font-bold">|</span>
      <button
        type="button"
        onClick={() => setLanguage('te')}
        aria-pressed={isTe}
        className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
          isTe
            ? 'bg-gradient-to-r from-[#F7931E] to-[#FF6B00] text-white shadow-xs'
            : 'text-slate-600 hover:text-[#F7931E]'
        }`}
      >
        తెలుగు
      </button>
    </div>
  )
}
