import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { pick } from '../components/ItemCard'
import { requireSupabase } from '../supabaseClient'

/* Admin: the bookings of one camp or diploma. Counters, a table with a status
   dropdown per row (the database allows updating only the status column) and an
   Export CSV button — the backup when the Google Sheets sync fails. */

const STATUSES = ['booked', 'confirmed', 'rejected', 'cancelled']
const STATUS_KEYS = {
  booked: 'statusBooked',
  confirmed: 'statusConfirmed',
  rejected: 'statusRejected',
  cancelled: 'statusCancelled',
}
const CSV_HEADERS = [
  'Booking ID',
  'Created at',
  'Status',
  'Student ID',
  'Full name',
  'Phone',
  'Email',
  'University',
  'Faculty',
  'Year',
  'Item',
  'Type',
]
const PHONE_COLUMN = CSV_HEADERS.indexOf('Phone')
const FORMULA_PREFIX = /^[=+\-@\t\r]/
const PAGE_SIZE = 1000

/* Formula-injection guard: every cell except Phone gets a leading apostrophe
   when its text starts with = + - @, a tab or a carriage return, before the
   usual CSV quoting. Phone is validated by the database and its leading + must
   stay intact. */
function csvCell(value, isPhone) {
  const text = value == null ? '' : String(value)
  const guarded = !isPhone && FORMULA_PREFIX.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/* Supabase returns at most 1000 rows per select, so the bookings are paged with
   .range(from, from + 999) until a page comes back short. Both the table and
   the CSV export use this complete list. */
async function fetchAllBookings(itemId) {
  const supabase = requireSupabase()
  const allRows = []
  let from = 0
  let page = []
  do {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      throw new Error(error.message)
    }
    page = data || []
    allRows.push(...page)
    from += PAGE_SIZE
  } while (page.length === PAGE_SIZE)
  return allRows
}

function fileSlug(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item'
  )
}

function formatDateTime(value, lang) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BookingsManager({ s, item }) {
  const { lang } = useLanguage()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const digits = lang === 'ar' ? 'ar-EG' : 'en-US'

  const load = useCallback(async () => {
    try {
      const data = await fetchAllBookings(item.id)
      setRows(data)
      setStatus('ready')
      setError('')
    } catch (e) {
      setStatus('error')
      setError(e.message || s.bookingsLoadFailed)
    }
  }, [item.id, s.bookingsLoadFailed])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const changeStatus = async (booking, nextStatus) => {
    if (nextStatus === booking.status) {
      return
    }
    setBusyId(booking.id)
    setError('')
    try {
      const { error: updateError } = await requireSupabase()
        .from('bookings')
        .update({ status: nextStatus })
        .eq('id', booking.id)
      if (updateError) {
        throw new Error(updateError.message)
      }
      flash(s.statusSaved)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  /* Client-side CSV with a UTF-8 BOM, so Excel shows the Arabic correctly. */
  const exportCsv = () => {
    const title = pick(item, 'title', lang)
    const lines = [CSV_HEADERS]
    rows.forEach((row) => {
      lines.push([
        row.id,
        row.created_at || '',
        row.status,
        row.student_code,
        row.full_name,
        row.phone,
        row.email,
        row.university,
        row.faculty,
        row.year == null ? '' : row.year,
        title,
        item.type,
      ])
    })
    const csv = `\uFEFF${lines
      .map((line) => line.map((cell, index) => csvCell(cell, index === PHONE_COLUMN)).join(','))
      .join('\r\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bookings-${fileSlug(title)}-${item.id}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {})

  return (
    <section className="admin-card bookings-manager">
      <div className="admin-head">
        <h2 className="admin-subtitle">{s.bookings}</h2>
        {status === 'ready' && rows.length > 0 && (
          <button type="button" className="control" onClick={exportCsv}>
            {s.exportCsv}
          </button>
        )}
      </div>

      <div className="bookings-counters">
        {STATUSES.map((key) => (
          <span key={key} className="counter-chip">
            <span>{s[STATUS_KEYS[key]]}</span>
            <strong>{(counts[key] || 0).toLocaleString(digits)}</strong>
          </span>
        ))}
        <span className="counter-chip">
          <span>{s.capacityLabel}</span>
          <strong>{item.capacity == null ? '—' : item.capacity.toLocaleString(digits)}</strong>
        </span>
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

      {status === 'loading' && <p className="empty-state">{s.loading}</p>}
      {status === 'error' && (
        <div className="empty-state">
          <p>{s.bookingsLoadFailed}</p>
          <button type="button" className="control" onClick={load}>
            {s.retry}
          </button>
        </div>
      )}
      {status === 'ready' && rows.length === 0 && <p className="empty-state">{s.noBookings}</p>}
      {status === 'ready' && rows.length > 0 && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>{s.studentId}</th>
                <th>{s.colName}</th>
                <th>{s.colPhone}</th>
                <th>{s.colUniversity}</th>
                <th>{s.colFaculty}</th>
                <th>{s.colYear}</th>
                <th>{s.colStatus}</th>
                <th>{s.colDate}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.student_code}</td>
                  <td>{row.full_name}</td>
                  <td dir="ltr">{row.phone}</td>
                  <td>{row.university}</td>
                  <td>{row.faculty}</td>
                  <td>{row.year == null ? '' : row.year.toLocaleString(digits)}</td>
                  <td>
                    <select
                      value={row.status}
                      disabled={busyId === row.id}
                      onChange={(event) => changeStatus(row, event.target.value)}
                      aria-label={s.colStatus}
                    >
                      {STATUSES.map((key) => (
                        <option key={key} value={key}>
                          {s[STATUS_KEYS[key]]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatDateTime(row.created_at, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
