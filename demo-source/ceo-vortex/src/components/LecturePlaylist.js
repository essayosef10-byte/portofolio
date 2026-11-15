import { useEffect, useRef } from 'react'
import { pick } from './ItemCard'
import { LockIcon } from './CourseIcons'

export default function LecturePlaylist({ lectures, selectedId, openIds, isFree, onSelect, t, lang, digits }) {
  const boxRef = useRef(null)
  const activeRef = useRef(null)

  /* Keep the active lecture visible inside the list without moving the page. */
  useEffect(() => {
    const box = boxRef.current
    const item = activeRef.current
    if (!box || !item) {
      return
    }
    const top = item.offsetTop
    const bottom = top + item.offsetHeight
    if (top < box.scrollTop) {
      box.scrollTop = Math.max(0, top - 8)
    } else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight + 8
    }
  }, [selectedId])

  return (
    <div className="cp-list-box" ref={boxRef}>
      <ol className="cp-list" aria-label={t.lectures}>
        {lectures.map((lecture, index) => {
          const active = lecture.id === selectedId
          const locked = Boolean(openIds && !openIds.has(lecture.id))
          const preview = !isFree && lecture.is_free_preview
          const minutes =
            lecture.duration_minutes != null
              ? t.minutes.replace('{n}', lecture.duration_minutes.toLocaleString(digits))
              : ''
          return (
            <li key={lecture.id} className="cp-li" style={{ '--i': Math.min(index, 14) }}>
              <button
                type="button"
                ref={active ? activeRef : null}
                className={`cp-item${active ? ' active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(lecture.id)}
              >
                <span className="cp-num">{(index + 1).toLocaleString(digits)}</span>
                <span className="cp-item-title">{pick(lecture, 'title', lang)}</span>
                {(minutes || preview || locked) && (
                  <span className="cp-end">
                    {minutes && <span className="cp-dur">{minutes}</span>}
                    {preview && <span className="cp-tag">{t.freePreview}</span>}
                    {locked && !preview && (
                      <>
                        <LockIcon className="cp-lock" />
                        <span className="cp-sr">{t.locked}</span>
                      </>
                    )}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}