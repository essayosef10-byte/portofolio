import { useCallback, useEffect, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
import { pick } from '../components/ItemCard'
import { useAuth } from '../auth/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { requireSupabase } from '../supabaseClient'
import myLearning from '../data/myLearning'

const STATUS_KEYS = {
  booked: 'statusBooked',
  confirmed: 'statusConfirmed',
  rejected: 'statusRejected',
  cancelled: 'statusCancelled',
}

/* The signed-in student's bookings, read from their own rows (RLS). */
function MyBookings() {
  const { t, lang } = useLanguage()
  const [state, setState] = useState({ status: 'loading', bookings: [], links: {} })

  const load = useCallback(async () => {
    try {
      const { data, error } = await requireSupabase()
        .from('bookings')
        .select('id, item_id, status, created_at, items ( title_en, title_ar, type )')
        .order('created_at', { ascending: false })
      if (error) {
        throw new Error(error.message)
      }
      const rows = data || []
      const confirmedIds = rows.filter((row) => row.status === 'confirmed').map((row) => row.item_id)
      let links = {}
      if (confirmedIds.length > 0) {
        // item_private rows come back only for the confirmed bookings (RLS).
        const { data: privateRows, error: privateError } = await requireSupabase()
          .from('item_private')
          .select('item_id, group_link')
          .in('item_id', confirmedIds)
        if (privateError) {
          throw new Error(privateError.message)
        }
        links = (privateRows || []).reduce(
          (acc, row) => ({ ...acc, [row.item_id]: row.group_link || '' }),
          {}
        )
      }
      setState({ status: 'ready', bookings: rows, links })
    } catch (e) {
      setState({ status: 'error', bookings: [], links: {} })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (state.status === 'loading') {
    return null
  }

  if (state.status === 'error') {
    return (
      <div className="empty-state my-bookings-error">
        <p>{t.loadError}</p>
        <button type="button" className="control" onClick={load}>
          {t.retry}
        </button>
      </div>
    )
  }

  if (state.bookings.length === 0) {
    return null
  }

  return (
    <div className="my-bookings">
      <h2 className="my-bookings-title">{t.myBookings}</h2>
      <ul className="booking-list">
        {state.bookings.map((row) => {
          const link = state.links[row.item_id]
          return (
            <li key={row.id} className="booking-row">
              <div className="booking-row-main">
                <strong>{(row.items ? pick(row.items, 'title', lang) : '') || '—'}</strong>
                <small>{row.items && t[row.items.type] ? t[row.items.type] : ''}</small>
              </div>
              <span className={`booking-status booking-status--${row.status}`}>
                {t[STATUS_KEYS[row.status]] || row.status}
              </span>
              {row.status === 'confirmed' && link && (
                <a className="control" href={link} target="_blank" rel="noopener noreferrer">
                  {t.openGroup}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function MyLearning() {
  const { t } = useLanguage()
  const { isSignedIn, user, loading } = useAuth()

  return (
    <section className="page">
      <h1 className="page-title">{t.myLearning}</h1>
      {!loading && !isSignedIn && (
        <div className="signin-prompt">
          <p className="empty-state">{t.signInToSeeCourses}</p>
          <GoogleButton />
        </div>
      )}
      {!loading && isSignedIn && user && <MyBookings />}
      {!loading && isSignedIn && myLearning.length === 0 && <p className="empty-state">{t.emptyState}</p>}
    </section>
  )
}
