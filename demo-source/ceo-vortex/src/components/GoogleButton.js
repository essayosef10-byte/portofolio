import { useAuth } from '../auth/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'

export default function GoogleButton() {
  const { t } = useLanguage()
  const { signInWithGoogle, loading } = useAuth()

  return (
    <button type="button" className="control signin" onClick={signInWithGoogle} disabled={loading}>
      <span>{t.continueWithGoogle}</span>
      <span aria-hidden="true">↗</span>
    </button>
  )
}