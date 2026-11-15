import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import Logo from './Logo'

function Avatar({ url, letter }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return <img className="avatar" src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  }
  return (
    <span className="avatar avatar--letter" aria-hidden="true">
      {letter}
    </span>
  )
}

export default function Header({
  sidebarOpen,
  menuButtonRef,
  onOpenSidebar,
  showMenuButton,
}) {
  const { isSignedIn, loading, user, profile, signInWithGoogle } = useAuth()
  const { t, toggleLang } = useLanguage()

  const name = (profile && (profile.full_name || profile.email)) || (user && user.email) || ''
  const letter = name.trim().charAt(0).toUpperCase() || '•'
  const avatarUrl = profile && profile.avatar_url ? profile.avatar_url : ''

  return (
    <header className="header">
      <div className="header-start">
        <Link to="/" className="brand" aria-label="CEO by Vortex home">
          <Logo name="logo-ceo" alt="CEO" width={408} height={144} />
        </Link>
      </div>
      <div className="header-center">
        {isSignedIn ? (
          <Link to="/account" className="control signin account-chip" aria-label={t.myAccount}>
            <span className="account-mark" aria-hidden="true" />
            <Avatar key={avatarUrl} url={avatarUrl} letter={letter} />
            <span className="chip-label">{t.account}</span>
            <span className="chip-label" aria-hidden="true">
              ↗
            </span>
          </Link>
        ) : (
          <button
            type="button"
            className={`control signin${loading ? ' control--pending' : ''}`}
            onClick={signInWithGoogle}
            disabled={loading}
            aria-hidden={loading || undefined}
          >
            <span>{t.signIn}</span>
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      <div className="header-end">
        <button
          type="button"
          className="control"
          onClick={toggleLang}
          aria-label={t.languageAria}
        >
          {t.languageToggle}
        </button>
        {showMenuButton && (
          <button
            type="button"
            className="control icon-btn"
            aria-label={t.menu}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            onClick={onOpenSidebar}
            ref={menuButtonRef}
          >
            <span className="hamb" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        )}
      </div>
    </header>
  )
}