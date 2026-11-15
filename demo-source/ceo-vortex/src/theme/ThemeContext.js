import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

function getSystemTheme() {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getSystemTheme)

  /* Apply the active theme to the document. */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#07132f' : '#f4f7fc')
    }
  }, [theme])

  /* Clear any previously saved manual choice, then follow the device's
     dark/light mode live. */
  useEffect(() => {
    try {
      window.localStorage.removeItem('ceo-theme')
    } catch (e) {
      /* localStorage unavailable */
    }
    if (typeof window.matchMedia !== 'function') {
      return undefined
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event) => {
      setTheme(event.matches ? 'dark' : 'light')
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }
    /* Older Safari fallback */
    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  const value = {
    theme,
    isDark: theme === 'dark',
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
