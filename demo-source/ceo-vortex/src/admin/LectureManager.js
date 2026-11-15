import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { toEmbedUrl } from '../lib/video'
import { adminListLectures, deleteLecture, patchLecture, reorderLectures, saveLecture } from '../data/lectures'

function blank() {
  return {
    title_en: '',
    title_ar: '',
    description_en: '',
    description_ar: '',
    video_url: '',
    duration_minutes: '',
    is_free_preview: false,
    is_published: false,
  }
}

function validate(form, s) {
  if (!form.title_en.trim() && !form.title_ar.trim()) {
    return s.titleRequired
  }
  if (!toEmbedUrl(form.video_url)) {
    return s.unsupportedVideo
  }
  if (form.duration_minutes !== '') {
    const minutes = Number(form.duration_minutes)
    if (!Number.isInteger(minutes) || minutes < 0) {
      return s.durationInvalid
    }
  }
  return ''
}

function LectureForm({ s, itemId, lecture, onSaved, onCancel }) {
  const [form, setForm] = useState(() =>
    lecture ? { ...lecture, duration_minutes: lecture.duration_minutes == null ? '' : String(lecture.duration_minutes) } : blank()
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) =>
    setForm((f) => ({
      ...f,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }))

  const submit = async (event) => {
    event.preventDefault()
    const problem = validate(form, s)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveLecture(form, itemId, lecture)
      onSaved()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <form className="admin-card lecture-form" onSubmit={submit}>
      <h3 className="admin-subtitle">{lecture ? s.editLecture : s.newLecture}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{s.titleEn}</span>
          <input value={form.title_en} onChange={set('title_en')} maxLength={160} dir="ltr" />
        </label>
        <label className="field">
          <span>{s.titleAr}</span>
          <input value={form.title_ar} onChange={set('title_ar')} maxLength={160} dir="rtl" />
        </label>
        <label className="field">
          <span>{s.descEn}</span>
          <textarea rows={3} value={form.description_en} onChange={set('description_en')} maxLength={2000} dir="ltr" />
        </label>
        <label className="field">
          <span>{s.descAr}</span>
          <textarea rows={3} value={form.description_ar} onChange={set('description_ar')} maxLength={2000} dir="rtl" />
        </label>
        <label className="field field--wide">
          <span>{s.videoUrl}</span>
          <input type="url" value={form.video_url} onChange={set('video_url')} placeholder="https://" dir="ltr" />
        </label>
        <label className="field">
          <span>{s.duration}</span>
          <input type="number" min="0" step="1" value={form.duration_minutes} onChange={set('duration_minutes')} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.is_free_preview} onChange={set('is_free_preview')} />
        <span>{s.freePreview}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={form.is_published} onChange={set('is_published')} />
        <span>{s.showOnSite}</span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="control signin" disabled={busy}>
          {busy ? s.saving : s.save}
        </button>
        <button type="button" className="control" onClick={onCancel}>
          {s.cancel}
        </button>
      </div>
    </form>
  )
}

export default function LectureManager({ s, itemId }) {
  const { lang } = useLanguage()
  const [lectures, setLectures] = useState([])
  const [status, setStatus] = useState('loading')
  const [editing, setEditing] = useState(null) // null | 'new' | lecture
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      setLectures(await adminListLectures(itemId))
      setStatus('ready')
      setError('')
    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }, [itemId])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const run = async (action, doneText) => {
    setError('')
    try {
      await action()
      if (doneText) {
        flash(doneText)
      }
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const move = (index, step) => {
    const target = index + step
    if (target < 0 || target >= lectures.length) {
      return
    }
    const next = [...lectures]
    ;[next[index], next[target]] = [next[target], next[index]]
    run(() => reorderLectures(next))
  }

  const remove = (lecture) => {
    if (!window.confirm(s.confirmDeleteLecture)) {
      return
    }
    run(() => deleteLecture(lecture.id), s.deleted)
  }

  const title = (l) => (lang === 'ar' ? l.title_ar || l.title_en : l.title_en || l.title_ar) || '—'

  return (
    <section className="admin-card lecture-manager">
      <div className="admin-head">
        <h2 className="admin-subtitle">{s.lectures}</h2>
        {!editing && (
          <button type="button" className="control signin" onClick={() => setEditing('new')}>
            {s.addLecture}
          </button>
        )}
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

      {editing && (
        <LectureForm
          key={editing === 'new' ? 'new' : editing.id}
          s={s}
          itemId={itemId}
          lecture={editing === 'new' ? null : editing}
          onSaved={async () => {
            setEditing(null)
            flash(s.saved)
            await load()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {status === 'loading' && <p className="empty-state">{s.checking}</p>}
      {status === 'ready' && lectures.length === 0 && !editing && <p className="empty-state">{s.noLecturesAdmin}</p>}
      {status === 'ready' && lectures.length > 0 && (
        <ul className="admin-list">
          {lectures.map((lecture, index) => (
            <li key={lecture.id} className="admin-row">
              <span className="row-pos">{index + 1}</span>
              <div className="row-main">
                <strong>{title(lecture)}</strong>
                <small>{lecture.duration_minutes != null ? `${lecture.duration_minutes} min` : ''}</small>
              </div>
              {lecture.is_free_preview && <span className="badge badge--live">{s.freePreview}</span>}
              <span className={`badge${lecture.is_published ? ' badge--live' : ''}`}>
                {lecture.is_published ? s.published : s.draft}
              </span>
              <div className="row-actions">
                <button
                  type="button"
                  className="control"
                  aria-label={s.moveUp}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="control"
                  aria-label={s.moveDown}
                  disabled={index === lectures.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="control"
                  onClick={() => run(() => patchLecture(lecture.id, { is_published: !lecture.is_published }))}
                >
                  {lecture.is_published ? s.unpublish : s.publish}
                </button>
                <button
                  type="button"
                  className="control"
                  onClick={() => run(() => patchLecture(lecture.id, { is_free_preview: !lecture.is_free_preview }))}
                >
                  {lecture.is_free_preview ? s.removePreview : s.freePreview}
                </button>
                <button type="button" className="control" onClick={() => setEditing(lecture)}>
                  {s.edit}
                </button>
                <button type="button" className="control control--danger" onClick={() => remove(lecture)}>
                  {s.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}