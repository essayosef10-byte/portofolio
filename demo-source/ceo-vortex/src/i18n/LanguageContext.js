import { createContext, useContext, useEffect, useState } from 'react'
import en from './en'
import ar from './ar'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'ceo-language'

function getInitialLang() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ar') {
      return saved
    }
  } catch (error) {
    /* localStorage unavailable — fall back to English */
  }
  return 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch (error) {
      /* localStorage unavailable — language stays in memory only */
    }
  }, [lang])

  const value = {
    lang,
    isRTL: lang === 'ar',
    t: lang === 'ar' ? ar : en,
    toggleLang: () => setLang((current) => (current === 'en' ? 'ar' : 'en')),
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
