import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import en from '../i18n/en'
import ar from '../i18n/ar'
import Logo from './Logo'

export const NAV_ITEMS = [
  { key: 'sessions', path: '/sessions' },
  { key: 'courses', path: '/courses' },
  { key: 'diplomas', path: '/diplomas' },
  { key: 'camps', path: '/camps' },
]

export default function Sidebar({ variant, open = false, onClose, menuButtonRef }) {
  const { t, lang } = useLanguage()
  const panelRef = useRef(null)
  const other = lang === 'en' ? ar : en

  useEffect(() => {
    if (variant !== 'overlay' || !open) {
      return undefined
    }
    const panel = panelRef.current
    const menuButton = menuButtonRef ? menuButtonRef.current : null
    if (panel) {
      panel.focus()
    }
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab' && panel) {
        const focusable = panel.querySelectorAll('a[href], button:not([disabled])')
        if (focusable.length === 0) {
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (menuButton) {
        menuButton.focus()
      }
    }
  }, [variant, open, onClose, menuButtonRef])

  const renderNav = (isOverlay) => (
    <nav className="drawer-links" aria-label={t.menu}>
      {NAV_ITEMS.map(({ key, path }) => (
        <NavLink
          key={key}
          to={path}
          onClick={isOverlay ? onClose : undefined}
        >
          <span>{t[key]}</span>
          <small>{other[key]}</small>
          <span className="link-arrow" aria-hidden="true">
            ↗
          </span>
        </NavLink>
      ))}
    </nav>
  )

  if (variant === 'permanent') {
    return (
      <aside className="drawer drawer--permanent" id="app-sidebar">
        <div className="drawer-top">
          <Logo name="logo-ceo-full" alt="CEO" width={395} height={167} />
        </div>
        {renderNav(false)}
      </aside>
    )
  }

  return (
    <>
      <div
        className={`scrim${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        id="app-sidebar"
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="drawer-top">
          <Logo name="logo-ceo-full" alt="CEO" width={395} height={167} />
          <button
            type="button"
            className="drawer-close"
            aria-label={t.close}
            onClick={onClose}
            tabIndex={open ? 0 : -1}
          >
            ×
          </button>
        </div>
        {renderNav(true)}
      </aside>
    </>
  )
}
