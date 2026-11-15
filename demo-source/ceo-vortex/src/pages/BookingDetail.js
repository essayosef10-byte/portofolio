import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import GoogleButton from '../components/GoogleButton'
import { ArrowIcon } from '../components/CourseIcons'
import {
  BanIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  InfoIcon,
  XIcon,
} from '../components/BookingIcons'
import { formatDate, pick } from '../components/ItemCard'
import { useLanguage } from '../i18n/LanguageContext'
import { requireSupabase } from '../supabaseClient'

/* One shared page for /camps/:id and /diplomas/:id.
   The browser only displays: booking and cancelling happen inside the database
   functions book_item and cancel_booking, which decide everything. */

const ERROR_KEYS = {
  not_signed_in: 'genericError',
  not_open: 'bookingClosed',
  profile_incomplete: 'completeProfileFirst',
  invalid_phone: 'invalidPhone',
  full: 'bookingFull',
  rejected: 'statusRejected',
  already_booked: 'statusBooked',
}

const STATUS_META = {
  booked: { Icon: ClockIcon, cls: 'bk-status--booked', key: 'statusBooked' },
  confirmed: { Icon: CheckIcon, cls: 'bk-status--confirmed', key: 'statusConfirmed' },
  rejected: { Icon: XIcon, cls: 'bk-status--rejected', key: 'statusRejected' },
  cancelled: { Icon: BanIcon, cls: 'bk-status--cancelled', key: 'statusCancelled' },
}

function errorCode(error) {
  return String((error && error.message) || '')
    .split('\n')[0]
    .trim()
}

/* Clipboard write with a legacy fallback for older browsers. */
function copyText(text) {
  return new Promise((resolve) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => resolve(true),
          () => resolve(false)
        )
        return
      }
    } catch (e) {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '-1000px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      resolve(ok)
    } catch (e) {
      resolve(false)
    }
  })
}

export default function BookingDetail({ type }) {
  const { id } = useParams()
  const { t, lang } = useLanguage()
  const { user, profile, profileComplete, profileLoading, loading: authLoading, isSignedIn } = useAuth()

  const [data, setData] = useState({ status: 'loading', item: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [booking, setBooking] = useState(undefined)
  const [bookingKey, setBookingKey] = useState(0)
  const [phone, setPhone] = useState('')
  const [formError, setFormError] = useState('')
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [groupLink, setGroupLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const cancelBtnRef = useRef(null)
  const dialogRef = useRef(null)

  const userId = user ? user.id : null

  /* The item: published and of the route's type, or nothing. */
  useEffect(() => {
    let active = true
    const load = async () => {
      setData({ status: 'loading', item: null })
      if (!/^\d+$/.test(String(id))) {
        setData({ status: 'ready', item: null })
        return
      }
      try {
        const { data: row, error: itemError } = await requireSupabase()
          .from('items')
          .select('*')
          .eq('id', id)
          .eq('type', type)
          .eq('is_published', true)
          .maybeSingle()
        if (itemError) {
          throw new Error(itemError.message)
        }
        if (!active) {
          return
        }
        setData({
          status: 'ready',
          item: row ? { ...row, price: row.price == null ? null : Number(row.price) } : null,
        })
      } catch (e) {
        if (active) {
          setData({ status: 'error', item: null })
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [id, type, reloadKey])

  /* The signed-in student's own booking for this item; RLS returns only their row. */
  useEffect(() => {
    let active = true
    const load = async () => {
      if (authLoading) {
        return
      }
      if (!userId) {
        if (active) {
          setBooking(null)
        }
        return
      }
      try {
        const { data: row, error: bookingError } = await requireSupabase()
          .from('bookings')
          .select('*')
          .eq('item_id', id)
          .maybeSingle()
        if (bookingError) {
          throw new Error(bookingError.message)
        }
        if (active) {
          setBooking(row || null)
        }
      } catch (e) {
        if (active) {
          setBooking(null)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [authLoading, userId, id, bookingKey])

  /* Prefill the WhatsApp number from the student's last booking, if any. */
  useEffect(() => {
    let active = true
    const load = async () => {
      if (authLoading || !userId) {
        return
      }
      try {
        const { data: rows, error: phoneError } = await requireSupabase()
          .from('bookings')
          .select('phone')
          .order('created_at', { ascending: false })
          .limit(1)
        if (phoneError) {
          throw new Error(phoneError.message)
        }
        if (active && rows && rows.length > 0 && rows[0].phone) {
          setPhone((current) => current || rows[0].phone)
        }
      } catch (e) {
        /* no prefill available */
      }
    }
    load()
    return () => {
      active = false
    }
  }, [authLoading, userId])

  /* The private group link: the database returns it only for a confirmed booking. */
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!booking || booking.status !== 'confirmed') {
        setGroupLink('')
        return
      }
      try {
        const { data: row, error: linkError } = await requireSupabase()
          .from('item_private')
          .select('group_link')
          .eq('item_id', booking.item_id)
          .maybeSingle()
        if (linkError) {
          throw new Error(linkError.message)
        }
        if (active) {
          setGroupLink(row ? row.group_link || '' : '')
        }
      } catch (e) {
        if (active) {
          setGroupLink('')
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [booking])

  /* While the confirm dialog is open: move focus into it, close on Escape,
     and return focus to the Cancel booking button when it closes. */
  useEffect(() => {
    if (!confirmOpen) {
      return undefined
    }
    const node = dialogRef.current
    if (node && typeof node.focus === 'function') {
      node.focus()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setConfirmOpen(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const btn = cancelBtnRef.current
      if (btn && typeof btn.focus === 'function') {
        btn.focus()
      }
    }
  }, [confirmOpen])

  const backPath = type === 'camps' ? '/camps' : '/diplomas'
  const backLink = (
    <Link to={backPath} className="cp-back">
      <ArrowIcon className="cp-arrow" />
      <span>{t[type]}</span>
    </Link>
  )

  if (data.status === 'loading') {
    return (
      <section className="page bk">
        <div className="bk-back-row">{backLink}</div>
        <p className="empty-state">{t.loading}</p>
      </section>
    )
  }

  if (data.status === 'error') {
    return (
      <section className="page bk">
        <div className="bk-back-row">{backLink}</div>
        <div className="empty-state">
          <p>{t.loadError}</p>
          <button type="button" className="control" onClick={() => setReloadKey((key) => key + 1)}>
            {t.retry}
          </button>
        </div>
      </section>
    )
  }

  const item = data.item
  if (!item) {
    return (
      <section className="page bk">
        <div className="bk-back-row">{backLink}</div>
        <p className="empty-state">{t.notFound}</p>
      </section>
    )
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const { data: row, error: bookError } = await requireSupabase().rpc('book_item', {
        p_item_id: item.id,
        p_phone: phone.trim(),
      })
      if (bookError) {
        throw bookError
      }
      setFull(false)
      setBooking(row || null)
    } catch (e) {
      const code = errorCode(e)
      if (code === 'full') {
        setFull(true)
      } else if (code === 'already_booked' || code === 'rejected') {
        setBookingKey((key) => key + 1)
      } else if (code === 'not_open') {
        setFormError(t.bookingClosed)
        setReloadKey((key) => key + 1)
      } else {
        setFormError(t[ERROR_KEYS[code]] || t.genericError)
      }
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!booking) {
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const { data: row, error: cancelError } = await requireSupabase().rpc('cancel_booking', {
        p_item_id: item.id,
      })
      if (cancelError) {
        throw cancelError
      }
      setFull(false)
      setBooking(row || null)
    } catch (e) {
      const code = errorCode(e)
      setFormError(code === 'not_open' ? t.bookingClosed : t.genericError)
    } finally {
      setBusy(false)
    }
  }

  const onCopyId = async () => {
    const value = profile && profile.student_code ? profile.student_code : ''
    if (!value) {
      return
    }
    const ok = await copyText(value)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  const openConfirm = () => {
    setConfirmOpen(true)
  }

  const closeConfirm = () => {
    setConfirmOpen(false)
  }

  const confirmCancel = async () => {
    setConfirmOpen(false)
    await cancel()
  }

  const title = pick(item, 'title', lang)
  const description = pick(item, 'description', lang)
  const cardLoading = authLoading || booking === undefined || (isSignedIn && profileLoading)

  const cancelBtn = (
    <button
      type="button"
      className="bk-cancel-btn"
      onClick={openConfirm}
      disabled={busy}
      ref={cancelBtnRef}
    >
      {t.cancelBooking}
    </button>
  )

  /* Status panel, shown whenever a booking row exists. */
  let statusBlock = null
  if (booking && STATUS_META[booking.status]) {
    const meta = STATUS_META[booking.status]
    const StatusIcon = meta.Icon
    statusBlock = (
      <div className={`bk-status ${meta.cls}`} role="status">
        <StatusIcon className="bk-status-icon" />
        <span>{t[meta.key]}</span>
      </div>
    )
  }

  /* Two-step progress line: step 1 Pending review, step 2 Accepted.
     Step 2 reads "Not accepted" in red when rejected; the line is hidden
     when cancelled. */
  let progressBlock = null
  if (booking && booking.status !== 'cancelled') {
    const step1Class =
      booking.status === 'booked' ? 'bk-step--active' : 'bk-step--done'
    const step2Rejected = booking.status === 'rejected'
    const step2Class = booking.status === 'confirmed' ? 'bk-step--active' : ''
    progressBlock = (
      <ol className="bk-steps" aria-hidden="true">
        <li className={`bk-step ${step1Class}`}>
          <span className="bk-step-dot" />
          <span className="bk-step-label">{t.statusBooked}</span>
        </li>
        <li className="bk-step-sep" aria-hidden="true" />
        <li className={`bk-step ${step2Class} ${step2Rejected ? 'bk-step--rejected' : ''}`}>
          <span className="bk-step-dot" />
          <span className="bk-step-label">
            {step2Rejected ? t.statusRejected : t.statusConfirmed}
          </span>
        </li>
      </ol>
    )
  }

  /* The action row under the status: open the group (confirmed) and/or the
     quiet Cancel booking button (booked, confirmed). */
  let actionBody = null
  if (!cardLoading && isSignedIn && profileComplete) {
    if (booking && booking.status === 'booked') {
      actionBody = cancelBtn
    } else if (booking && booking.status === 'confirmed') {
      actionBody = (
        <div className="bk-card-actions">
          {groupLink ? (
            <a
              className="control signin bk-open-group"
              href={groupLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.openGroup}
            </a>
          ) : null}
          {cancelBtn}
        </div>
      )
    }
  }

  /* The rest of the card: a notice for closed/full/profile-incomplete, the
     booking form when the place is open, or a skeleton while loading. */
  let body = null
  if (cardLoading) {
    body = (
      <div className="bk-skeleton" aria-hidden="true">
        <span className="bk-skel-line bk-skel-line--lg" />
        <span className="bk-skel-line" />
        <span className="bk-skel-line bk-skel-line--sm" />
      </div>
    )
  } else if (!isSignedIn) {
    body = <GoogleButton />
  } else if (!profileComplete) {
    body = (
      <div className="bk-notice bk-notice--info">
        <InfoIcon className="bk-notice-icon" />
        <div className="bk-notice-body">
          <p className="bk-notice-text">{t.completeProfileFirst}</p>
          <Link to="/account" className="text-link">
            {t.completeAction}
          </Link>
        </div>
      </div>
    )
  } else if (
    booking &&
    (booking.status === 'booked' ||
      booking.status === 'confirmed' ||
      booking.status === 'rejected')
  ) {
    /* Status, progress and actions already render above; nothing else here. */
    body = null
  } else if (!item.booking_open) {
    body = (
      <div className="bk-notice bk-notice--muted">
        <InfoIcon className="bk-notice-icon" />
        <p className="bk-notice-text">{t.bookingClosed}</p>
      </div>
    )
  } else if (full) {
    body = (
      <div className="bk-notice bk-notice--muted">
        <InfoIcon className="bk-notice-icon" />
        <div className="bk-notice-body">
          <p className="bk-notice-text">{t.bookingFull}</p>
          <button type="button" className="control" onClick={() => setFull(false)}>
            {t.retry}
          </button>
        </div>
      </div>
    )
  } else {
    body = (
      <form className="bk-form" onSubmit={submit}>
        <label className="field">
          <span>{t.whatsappNumber}</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            dir="ltr"
            inputMode="tel"
            maxLength={20}
            required
          />
        </label>
        <button type="submit" className="control signin bk-form-submit" disabled={busy}>
          {t.book}
        </button>
        <p className="booking-note">{t.dataShared}</p>
      </form>
    )
  }

  const descParagraphs = description ? description.split(/\n{2,}/) : []

  return (
    <>
      <section className={`page bk ${item.image_url ? '' : 'bk--no-cover'}`}>
        <div className="bk-back-row">{backLink}</div>

        <div className="bk-area-intro">
          <h1 className="bk-title">{title}</h1>
          <div className="bk-chips">
            <span className="bk-chip bk-chip--type">{t[type]}</span>
            {item.start_date && (
              <span className="bk-chip bk-chip--date">
                <CalendarIcon className="bk-chip-icon" />
                <span>{formatDate(item.start_date, lang)}</span>
              </span>
            )}
          </div>
        </div>

        {item.image_url && (
          <div className="bk-area-cover">
            <div className="bk-cover">
              <img src={item.image_url} alt="" decoding="async" />
            </div>
          </div>
        )}

        <aside className="bk-area-card">
          <div className="bk-card">
            <h2 className="bk-card-title">{t.bookNow}</h2>

            {isSignedIn && profile && (
              <div className="bk-id">
                <span className="bk-id-label">{t.yourStudentId}</span>
                <div className="bk-id-badge">
                  <span className="bk-id-value" dir="ltr">
                    {profile.student_code}
                  </span>
                  <button
                    type="button"
                    className="bk-copy"
                    onClick={onCopyId}
                    aria-label={t.copy}
                  >
                    <CopyIcon className="bk-copy-icon" />
                    <span>{copied ? t.copied : t.copy}</span>
                  </button>
                </div>
                <p className="booking-note">{t.useIdToEnter}</p>
              </div>
            )}

            {statusBlock}
            {progressBlock}
            {actionBody}
            {body}

            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
          </div>
        </aside>

        {description && (
          <div className="bk-area-desc">
            <div className="bk-desc">
              {descParagraphs.map((para, index) => (
                <p key={index}>{para}</p>
              ))}
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <div
          className="bk-dialog-scrim"
          onClick={closeConfirm}
          role="presentation"
        >
          <div
            className="bk-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bk-confirm-title"
            tabIndex={-1}
            ref={dialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="bk-confirm-title" className="bk-dialog-title">
              {t.confirmCancel}
            </h3>
            <div className="bk-dialog-actions">
              <button
                type="button"
                className="control bk-dialog-cancel"
                onClick={closeConfirm}
              >
                {t.keepBooking}
              </button>
              <button
                type="button"
                className="control bk-dialog-confirm"
                onClick={confirmCancel}
                disabled={busy}
              >
                {t.cancelBooking}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
