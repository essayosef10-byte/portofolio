import { useEffect, useRef, useState } from 'react'
import { getGroupLink, saveItem, uploadImage } from '../data/items'
import BookingsManager from './BookingsManager'
import LectureManager from './LectureManager'

const MAX_IMAGE = 4 * 1024 * 1024

function blank(type) {
  return {
    type,
    title_en: '',
    title_ar: '',
    description_en: '',
    description_ar: '',
    price: '',
    start_date: '',
    link_url: '',
    image_url: '',
    sort_order: 0,
    is_published: false,
    capacity: '',
    booking_open: false,
  }
}

export default function ItemForm({ s, type, item, onSaved, onCancel }) {
  const isBookable = type === 'camps' || type === 'diplomas'
  const [form, setForm] = useState(() =>
    item
      ? {
          ...item,
          price: item.price == null ? '' : String(item.price),
          capacity: item.capacity == null ? '' : String(item.capacity),
        }
      : blank(type)
  )
  // The group link lives in item_private, not in items, so it is loaded apart.
  const [groupLink, setGroupLink] = useState(item && isBookable ? null : '') // null = still loading
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!isBookable || !item) {
      return undefined
    }
    let active = true
    getGroupLink(item.id)
      .then((link) => {
        if (active) {
          setGroupLink(link)
        }
      })
      .catch(() => {
        if (active) {
          setGroupLink('')
        }
      })
    return () => {
      active = false
    }
  }, [isBookable, item])

  const set = (key) => (event) =>
    setForm((f) => ({
      ...f,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }))

  const upload = (event) => {
    const file = event.target.files[0]
    if (!file) {
      return
    }
    if (file.size > MAX_IMAGE) {
      setError(s.imageTooBig)
      return
    }
    setBusy(true)
    setError('')
    uploadImage(file)
      .then((url) => setForm((f) => ({ ...f, image_url: url })))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const validateBookable = () => {
    if (form.capacity !== '' && form.capacity != null) {
      const capacity = Number(form.capacity)
      if (!Number.isInteger(capacity) || capacity <= 0) {
        return s.capacityInvalid
      }
    }
    const link = (groupLink || '').trim()
    if (link !== '' && !/^https:\/\//.test(link)) {
      return s.invalidGroupLink
    }
    return ''
  }

  const submit = async (event) => {
    event.preventDefault()
    if (isBookable) {
      const problem = validateBookable()
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(true)
    setError('')
    try {
      onSaved(
        await saveItem(
          { ...form, group_link: isBookable ? (groupLink || '').trim() : undefined },
          type,
          item ? item.id : null
        )
      )
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const linkPending = isBookable && Boolean(item) && groupLink === null

  return (
    <>
      <form className="admin-card item-form" onSubmit={submit}>
        <h2 className="admin-subtitle">{item ? s.editItem : s.newItem}</h2>

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
            <textarea rows={4} value={form.description_en} onChange={set('description_en')} dir="ltr" />
          </label>
          <label className="field">
            <span>{s.descAr}</span>
            <textarea rows={4} value={form.description_ar} onChange={set('description_ar')} dir="rtl" />
          </label>
          <label className="field">
            <span>{s.price}</span>
            <input type="number" min="0" step="any" value={form.price} onChange={set('price')} />
          </label>
          <label className="field">
            <span>{s.startDate}</span>
            <input type="date" value={form.start_date} onChange={set('start_date')} />
          </label>
          {isBookable && (
            <label className="field">
              <span>{s.capacity}</span>
              <input type="number" min="1" step="1" value={form.capacity} onChange={set('capacity')} />
            </label>
          )}
          <label className="field field--wide">
            <span>{s.link}</span>
            <input type="url" value={form.link_url} onChange={set('link_url')} placeholder="https://" dir="ltr" />
          </label>
          <label className="field">
            <span>{s.sortOrder}</span>
            <input type="number" value={form.sort_order} onChange={set('sort_order')} />
          </label>
        </div>

        <div className="field">
          <span>{s.image}</span>
          <div className="image-row">
            {form.image_url ? (
              <img className="image-preview" src={form.image_url} alt="" />
            ) : (
              <div className="image-preview image-preview--empty" aria-hidden="true" />
            )}
            <div className="image-actions">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} hidden />
              <button type="button" className="control" onClick={() => fileRef.current.click()} disabled={busy}>
                {s.chooseImage}
              </button>
              {form.image_url && (
                <button type="button" className="control" onClick={() => setForm((f) => ({ ...f, image_url: '' }))}>
                  {s.removeImage}
                </button>
              )}
              <small>{s.imageHint}</small>
            </div>
          </div>
        </div>

        {isBookable && (
          <>
            <label className="check">
              <input type="checkbox" checked={form.booking_open} onChange={set('booking_open')} />
              <span>{s.bookingOpen}</span>
            </label>
            <label className="field">
              <span>{s.groupLink}</span>
              <input
                type="url"
                value={groupLink == null ? '' : groupLink}
                onChange={(event) => setGroupLink(event.target.value)}
                placeholder="https://"
                dir="ltr"
              />
              <small className="field-note">{s.groupLinkNote}</small>
            </label>
          </>
        )}

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
          <button type="submit" className="control signin" disabled={busy || linkPending}>
            {busy ? s.saving : s.save}
          </button>
          <button type="button" className="control" onClick={onCancel}>
            {s.cancel}
          </button>
        </div>
      </form>

      {type === 'courses' &&
        (item ? <LectureManager s={s} itemId={item.id} /> : <p className="empty-state">{s.saveFirst}</p>)}

      {isBookable &&
        (item ? (
          <BookingsManager s={s} item={item} />
        ) : (
          <p className="empty-state">{s.saveFirstBookings}</p>
        ))}
    </>
  )
}
