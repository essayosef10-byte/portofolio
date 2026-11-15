import { useEffect, useRef, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
import { useAuth } from '../auth/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'

const YEARS = [1, 2, 3, 4, 5, 6, 7]

function toForm(profile) {
  return {
    full_name: profile.full_name || '',
    university: profile.university || '',
    faculty: profile.faculty || '',
    year: profile.year == null ? '' : String(profile.year),
  }
}

function AccountForm({ profile }) {
  const { t, lang } = useLanguage()
  const { updateProfile, signOut } = useAuth()
  const [form, setForm] = useState(() => toForm(profile))
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [copied, setCopied] = useState(false)
  const idRef = useRef(null)

  useEffect(() => {
    if (status !== 'saved') {
      return undefined
    }
    const timer = window.setTimeout(() => setStatus('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (!copied) {
      return undefined
    }
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const set = (key) => (event) => {
    const value = event.target.value
    setForm((current) => ({ ...current, [key]: value }))
    setStatus((current) => (current === 'saved' || current === 'error' ? 'idle' : current))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.student_code)
      setCopied(true)
    } catch (error) {
      if (idRef.current) {
        idRef.current.select()
      }
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setStatus('saving')
    try {
      await updateProfile(form)
      setStatus('saved')
    } catch (error) {
      setStatus('error')
    }
  }

  const digits = lang === 'ar' ? 'ar-EG' : 'en-US'

  return (
    <form className="account-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="student-id">{t.studentId}</label>
        <div className="id-row">
          <input id="student-id" ref={idRef} value={profile.student_code} readOnly dir="ltr" />
          <button type="button" className="control" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="account-email">{t.email}</label>
        <input id="account-email" value={profile.email || ''} readOnly dir="ltr" />
      </div>

      <div className="form-grid">
        <div className="field field--wide">
          <label htmlFor="account-name">{t.fullName}</label>
          <input id="account-name" value={form.full_name} onChange={set('full_name')} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="account-university">{t.university}</label>
          <input id="account-university" value={form.university} onChange={set('university')} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="account-faculty">{t.faculty}</label>
          <input id="account-faculty" value={form.faculty} onChange={set('faculty')} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="account-year">{t.year}</label>
          <select id="account-year" value={form.year} onChange={set('year')}>
            <option value="" />
            {YEARS.map((n) => (
              <option key={n} value={String(n)}>
                {t.yearOption.replace('{n}', n.toLocaleString(digits))}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'error' && (
        <p className="form-error" role="alert">
          {t.genericError}
        </p>
      )}
      {status === 'saved' && (
        <p className="form-ok" role="status">
          {t.saved}
        </p>
      )}

      <div className="account-actions">
        <button type="submit" className="control signin" disabled={status === 'saving'}>
          {t.save}
        </button>
        <button type="button" className="control" onClick={signOut}>
          {t.signOut}
        </button>
      </div>
    </form>
  )
}

export default function Account() {
  const { t } = useLanguage()
  const { user, profile, loading, profileLoading, refreshProfile } = useAuth()

  return (
    <section className="page">
      <h1 className="page-title">{t.myAccount}</h1>
      {loading && <p className="empty-state">{t.loading}</p>}
      {!loading && !user && <GoogleButton />}
      {!loading && user && profileLoading && <p className="empty-state">{t.loading}</p>}
      {!loading && user && !profileLoading && !profile && (
        <div className="empty-state">
          <p>{t.genericError}</p>
          <button type="button" className="control" onClick={() => refreshProfile()}>
            {t.retry}
          </button>
        </div>
      )}
      {!loading && user && profile && <AccountForm key={profile.user_id} profile={profile} />}
    </section>
  )
}