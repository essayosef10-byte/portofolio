import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'

export default function AuthBanner() {
  const { t } = useLanguage()
  const { user, profile, profileComplete, error, clearError } = useAuth()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(false)

  const showProfile = Boolean(user && profile && !profileComplete) && pathname !== '/account' && !dismissed

  if (!error && !showProfile) {
    return null
  }

  return (
    <div className="auth-toasts">
      {error && (
        <div className="auth-toast auth-toast--error" role="alert">
          <span>{t.genericError}</span>
          <button type="button" className="toast-close" aria-label={t.close} onClick={clearError}>
            ×
          </button>
        </div>
      )}
      {showProfile && (
        <div className="auth-toast" role="status">
          <span>{t.completeProfile}</span>
          <Link to="/account" className="toast-action">
            {t.completeAction}
          </Link>
          <button type="button" className="toast-close" aria-label={t.close} onClick={() => setDismissed(true)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}