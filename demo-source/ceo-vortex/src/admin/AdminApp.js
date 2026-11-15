import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isConfigured, supabase } from '../supabaseClient'
import Logo from '../components/Logo'
import { useLanguage } from '../i18n/LanguageContext'
import AdminDashboard from './AdminDashboard'
import strings from './strings'

/* Returns { id, email } when the signed-in user is listed in the admins table. */
async function loadAdmin() {
  const { data } = await supabase.auth.getSession()
  const user = data.session ? data.session.user : null
  if (!user) {
    return null
  }
  const { data: row } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  return row ? { id: user.id, email: user.email } : 'not-admin'
}

function LoginForm({ s, onSignedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: username.trim(), password })
      if (authError) {
        throw new Error(authError.message)
      }
      const admin = await loadAdmin()
      if (admin === 'not-admin') {
        await supabase.auth.signOut()
        throw new Error(s.notAdmin)
      }
      onSignedIn(admin)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-card admin-login" onSubmit={submit}>
      <h1 className="page-title">{s.signInTitle}</h1>
      <label className="field">
        <span>{s.username}</span>
        <input type="email" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label className="field">
        <span>{s.password}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="control signin" disabled={busy}>
        {s.signIn}
      </button>
    </form>
  )
}

export default function AdminApp() {
  const { lang, t, toggleLang } = useLanguage()
  const s = strings[lang]
  // undefined = still checking, null = signed out, 'not-admin' = signed in but not an admin, object = admin
  const [admin, setAdmin] = useState(undefined)
  const isAdmin = Boolean(admin) && admin !== 'not-admin'

  useEffect(() => {
    if (!isConfigured) {
      setAdmin(null)
      return
    }
    loadAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {})
    setAdmin(null)
  }

  return (
    <div className="admin">
      <header className="admin-bar">
        <Link to="/" className="brand" aria-label={s.backToSite}>
          <Logo name="logo-ceo" alt="CEO" width={408} height={144} />
        </Link>
        <div className="admin-bar-end">
          <Link to="/" className="text-link">
            {s.backToSite}
          </Link>
          <button type="button" className="control" onClick={toggleLang} aria-label={t.languageAria}>
            {t.languageToggle}
          </button>
          {admin && (
            <button type="button" className="control" onClick={signOut}>
              {s.signOut}
            </button>
          )}
        </div>
      </header>
      <main className="admin-main">
        {admin === undefined && <p className="empty-state">{s.checking}</p>}
        {admin === null && !isConfigured && <p className="form-error">{s.notConfigured}</p>}
        {admin === null && isConfigured && <LoginForm s={s} onSignedIn={setAdmin} />}
        {admin === 'not-admin' && (
          <div className="admin-card admin-login">
            <p className="form-error" role="alert">
              {s.notAdmin}
            </p>
            <button type="button" className="control" onClick={signOut}>
              {s.signOut}
            </button>
          </div>
        )}
        {isAdmin && <AdminDashboard s={s} admin={admin} />}
      </main>
    </div>
  )
}