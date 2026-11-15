import { useCallback, useEffect, useState } from 'react'
import { deleteItem, listAll, setPublished } from '../data/items'
import { supabase } from '../supabaseClient'
import { formatDate } from '../components/ItemCard'
import { useLanguage } from '../i18n/LanguageContext'
import ItemForm from './ItemForm'

const TYPES = ['sessions', 'courses', 'diplomas', 'camps']

function PasswordForm({ s, email }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState({ text: '', bad: false })

  const submit = async (event) => {
    event.preventDefault()
    try {
      const { error: badPassword } = await supabase.auth.signInWithPassword({ email, password: current })
      if (badPassword) {
        throw new Error(badPassword.message)
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        throw new Error(updateError.message)
      }
      setMessage({ text: s.passwordChanged, bad: false })
      setCurrent('')
      setNext('')
    } catch (e) {
      setMessage({ text: e.message, bad: true })
    }
  }

  return (
    <form className="admin-card password-form" onSubmit={submit}>
      <h2 className="admin-subtitle">{s.settings}</h2>
      <div className="form-grid">
        <label className="field">
          <span>{s.currentPassword}</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>{s.newPassword}</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
      </div>
      {message.text && (
        <p className={message.bad ? 'form-error' : 'form-ok'} role="status">
          {message.text}
        </p>
      )}
      <button type="submit" className="control">
        {s.save}
      </button>
    </form>
  )
}

export default function AdminDashboard({ s, admin }) {
  const { lang } = useLanguage()
  const [type, setType] = useState('sessions')
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [editing, setEditing] = useState(null) // null | 'new' | item
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const all = await listAll()
      setCounts(all.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] || 0) + 1 }), {}))
      setItems(all)
      setError('')
    } catch (e) {
      setError(e.message || s.loadFailed)
    }
  }, [s.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const visible = items.filter((i) => i.type === type)
  const title = (i) => (lang === 'ar' ? i.title_ar || i.title_en : i.title_en || i.title_ar)

  const flash = (text) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const togglePublish = async (item) => {
    try {
      await setPublished(item.id, !item.is_published)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async (item) => {
    if (!window.confirm(s.confirmDelete)) {
      return
    }
    try {
      await deleteItem(item.id)
      flash(s.deleted)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const saved = async () => {
    setEditing(null)
    flash(s.saved)
    await load()
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-head">
        <h1 className="page-title">{s.title}</h1>
        <span className="admin-user">{admin.email}</span>
      </div>

      <div className="admin-tabs" role="tablist">
        {TYPES.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={type === key}
            className={`admin-tab${type === key ? ' active' : ''}`}
            onClick={() => {
              setType(key)
              setEditing(null)
            }}
          >
            {s[key]} <small>{counts[key] || 0}</small>
          </button>
        ))}
      </div>

      {notice && (
        <p className="form-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <ItemForm
          key={editing === 'new' ? 'new' : editing.id}
          s={s}
          type={type}
          item={editing === 'new' ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="admin-actions">
            <button type="button" className="control signin" onClick={() => setEditing('new')}>
              {s.add}
            </button>
          </div>
          {visible.length === 0 ? (
            <p className="empty-state">{s.empty}</p>
          ) : (
            <ul className="admin-list">
              {visible.map((item) => (
                <li key={item.id} className="admin-row">
                  {item.image_url ? (
                    <img className="row-thumb" src={item.image_url} alt="" />
                  ) : (
                    <span className="row-thumb row-thumb--empty" aria-hidden="true" />
                  )}
                  <div className="row-main">
                    <strong>{title(item) || '—'}</strong>
                    <small>
                      {[item.start_date && formatDate(item.start_date, lang), item.price != null && `${item.price}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                  <span className={`badge${item.is_published ? ' badge--live' : ''}`}>
                    {item.is_published ? s.published : s.draft}
                  </span>
                  <div className="row-actions">
                    <button type="button" className="control" onClick={() => togglePublish(item)}>
                      {item.is_published ? s.unpublish : s.publish}
                    </button>
                    <button type="button" className="control" onClick={() => setEditing(item)}>
                      {s.edit}
                    </button>
                    <button type="button" className="control control--danger" onClick={() => remove(item)}>
                      {s.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PasswordForm s={s} email={admin.email} />
        </>
      )}
    </div>
  )
}
