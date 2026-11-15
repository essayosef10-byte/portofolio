import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ArrowIcon, LockIcon } from '../components/CourseIcons'
import GoogleButton from '../components/GoogleButton'
import { pick } from '../components/ItemCard'
import LecturePlaylist from '../components/LecturePlaylist'
import { useLanguage } from '../i18n/LanguageContext'
import { getLectureVideoUrl, getPublishedCourse, listOpenLectureIds, listPublishedLectures } from '../data/lectures'
import { toEmbedUrl } from '../lib/video'

function durationLabel(total, t, digits) {
  if (total <= 0) {
    return ''
  }
  if (total < 60) {
    return t.minutes.replace('{n}', total.toLocaleString(digits))
  }
  return t.durationHM
    .replace('{h}', Math.floor(total / 60).toLocaleString(digits))
    .replace('{m}', (total % 60).toLocaleString(digits))
}

function Chips({ className, priceText, count, duration, t, digits }) {
  return (
    <div className={`cp-chips ${className}`}>
      <span className="cp-chip cp-chip--price">{priceText}</span>
      <span className="cp-chip">
        <span>{t.lectures}</span>
        <strong>{count.toLocaleString(digits)}</strong>
      </span>
      {duration && <span className="cp-chip">{duration}</span>}
    </div>
  )
}

export default function CourseDetail() {
  const { id } = useParams()
  const { t, lang } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState({ status: 'loading', course: null, lectures: [] })
  const [reloadKey, setReloadKey] = useState(0)
  const [openIds, setOpenIds] = useState(null) // null = still asking the database
  const [video, setVideo] = useState({ status: 'idle', url: '' })

  const userId = user ? user.id : null
  const lectures = data.lectures

  useEffect(() => {
    let active = true
    setData({ status: 'loading', course: null, lectures: [] })
    setOpenIds(null)
    getPublishedCourse(id)
      .then(async (course) => {
        if (!course) {
          return { status: 'ready', course: null, lectures: [] }
        }
        return { status: 'ready', course, lectures: await listPublishedLectures(course.id) }
      })
      .then((next) => {
        if (active) {
          setData(next)
        }
      })
      .catch(() => {
        if (active) {
          setData({ status: 'error', course: null, lectures: [] })
        }
      })
    return () => {
      active = false
    }
  }, [id, reloadKey])

  /* Which lectures this user can open: the database decides, a row comes back or it does not. */
  useEffect(() => {
    if (data.status !== 'ready' || authLoading) {
      return undefined
    }
    if (!userId || lectures.length === 0) {
      setOpenIds(new Set())
      return undefined
    }
    let active = true
    listOpenLectureIds(lectures.map((lecture) => lecture.id))
      .then((ids) => {
        if (active) {
          setOpenIds(new Set(ids))
        }
      })
      .catch(() => {
        if (active) {
          setOpenIds(new Set())
        }
      })
    return () => {
      active = false
    }
  }, [data.status, authLoading, userId, lectures])

  const wanted = params.get('lecture')
  const selected = lectures.find((lecture) => String(lecture.id) === wanted) || lectures[0] || null
  const selectedId = selected ? selected.id : null
  const unlocked = Boolean(selectedId && openIds && openIds.has(selectedId))

  useEffect(() => {
    if (!selectedId || !unlocked) {
      setVideo({ status: 'idle', url: '' })
      return undefined
    }
    let active = true
    setVideo({ status: 'loading', url: '' })
    getLectureVideoUrl(selectedId)
      .then((url) => {
        if (active) {
          setVideo(url ? { status: 'ready', url } : { status: 'error', url: '' })
        }
      })
      .catch(() => {
        if (active) {
          setVideo({ status: 'error', url: '' })
        }
      })
    return () => {
      active = false
    }
  }, [selectedId, unlocked])

  const digits = lang === 'ar' ? 'ar-EG' : 'en-US'
  const select = (lectureId) => setParams({ lecture: String(lectureId) })
  const backLink = (
    <Link to="/courses" className="cp-back">
      <ArrowIcon className="cp-arrow" />
      <span>{t.backToCourses}</span>
    </Link>
  )

  if (data.status === 'loading') {
    return (
      <section className="page">
        <p className="empty-state">{t.loading}</p>
      </section>
    )
  }

  if (data.status === 'error') {
    return (
      <section className="page">
        {backLink}
        <div className="empty-state">
          <p>{t.loadError}</p>
          <button type="button" className="control" onClick={() => setReloadKey((key) => key + 1)}>
            {t.retry}
          </button>
        </div>
      </section>
    )
  }

  const course = data.course
  if (!course) {
    return (
      <section className="page">
        {backLink}
        <p className="empty-state">{t.notFound}</p>
      </section>
    )
  }

  const isFree = !course.price
  const priceText = isFree ? t.free : `${course.price.toLocaleString(digits)} ${t.currency}`
  const title = pick(course, 'title', lang)
  const description = pick(course, 'description', lang)
  const total = lectures.reduce((sum, lecture) => sum + (lecture.duration_minutes || 0), 0)
  const duration = durationLabel(total, t, digits)
  const selectedIndex = selected ? lectures.indexOf(selected) : -1
  const prev = selectedIndex > 0 ? lectures[selectedIndex - 1] : null
  const next = selectedIndex >= 0 && selectedIndex < lectures.length - 1 ? lectures[selectedIndex + 1] : null
  const prevNumber = Math.max(1, selectedIndex)
  const nextNumber = Math.min(lectures.length, selectedIndex + 2)
  const canSignInToUnlock = Boolean(!userId && selected && (isFree || selected.is_free_preview))
  const embed = video.status === 'ready' ? toEmbedUrl(video.url) : null

  const skeleton = (
    <div className="cp-skeleton" role="status" aria-busy="true">
      <span className="cp-sr">{t.loading}</span>
    </div>
  )

  let player
  if (!selected) {
    player = (
      <div className="cp-overlay">
        <p>{t.noLectures}</p>
      </div>
    )
  } else if (authLoading || openIds === null) {
    player = skeleton
  } else if (unlocked) {
    if (embed) {
      player = (
        <iframe
          key={embed}
          className="cp-frame"
          src={embed}
          title={pick(selected, 'title', lang)}
          loading="lazy"
          allowFullScreen
          allow="fullscreen; picture-in-picture; encrypted-media; autoplay"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        />
      )
    } else if (video.status === 'error' || video.status === 'ready') {
      player = (
        <div className="cp-overlay" role="alert">
          <p>{t.genericError}</p>
        </div>
      )
    } else {
      player = skeleton
    }
  } else if (canSignInToUnlock) {
    player = (
      <div className="cp-overlay">
        <LockIcon />
        <p>{t.signInToWatch}</p>
        <GoogleButton />
      </div>
    )
  } else {
    player = (
      <div className="cp-overlay">
        <LockIcon />
        <p>{t.locked}</p>
      </div>
    )
  }

  return (
    <section className="page cp">
      {backLink}

      <header className={`cp-head${course.image_url ? ' cp-head--cover' : ''}`}>
        {course.image_url && (
          <>
            <img className="cp-cover" src={course.image_url} alt="" decoding="async" />
            <span className="cp-head-shade" aria-hidden="true" />
          </>
        )}
        <h1 className="cp-title">{title}</h1>
        <Chips
          className="cp-chips--head"
          priceText={priceText}
          count={lectures.length}
          duration={duration}
          t={t}
          digits={digits}
        />
      </header>

      {description && <p className="cp-desc">{description}</p>}

      <div className="cp-main">
        <div className="cp-player">{player}</div>
        {selected && (
          <div className="cp-info">
            <small className="cp-eyebrow">{t.lectureN.replace('{n}', (selectedIndex + 1).toLocaleString(digits))}</small>
            <h2 className="cp-lecture-title">{pick(selected, 'title', lang)}</h2>
            {pick(selected, 'description', lang) && <p className="cp-text">{pick(selected, 'description', lang)}</p>}
            <div className="cp-nav">
              <button type="button" className="control" disabled={!prev} onClick={() => prev && select(prev.id)}>
                <ArrowIcon className="cp-arrow" />
                <span>{t.lectureN.replace('{n}', prevNumber.toLocaleString(digits))}</span>
              </button>
              <button type="button" className="control" disabled={!next} onClick={() => next && select(next.id)}>
                <span>{t.lectureN.replace('{n}', nextNumber.toLocaleString(digits))}</span>
                <ArrowIcon className="cp-arrow cp-arrow--flip" />
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="cp-side">
        <p className="cp-side-title" aria-hidden="true">
          {title}
        </p>
        <Chips
          className="cp-chips--side"
          priceText={priceText}
          count={lectures.length}
          duration={duration}
          t={t}
          digits={digits}
        />
        {lectures.length > 0 && (
          <>
            <h2 className="cp-list-title">{t.lectures}</h2>
            <LecturePlaylist
              lectures={lectures}
              selectedId={selectedId}
              openIds={openIds}
              isFree={isFree}
              onSelect={select}
              t={t}
              lang={lang}
              digits={digits}
            />
          </>
        )}
      </aside>
    </section>
  )
}