import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'

export function pick(item, field, lang) {
  const main = item[`${field}_${lang}`]
  const other = item[`${field}_${lang === 'ar' ? 'en' : 'ar'}`]
  return main || other || ''
}

export function formatDate(value, lang) {
  if (!value) {
    return ''
  }
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
}

export default function ItemCard({ item }) {
  const { t, lang } = useLanguage()
  const title = pick(item, 'title', lang)
  const description = pick(item, 'description', lang)
  const price =
    item.price == null ? '' : item.price === 0 ? t.free : `${item.price.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')} ${t.currency}`
  const isCourse = item.type === 'courses'
  const isBookable = item.type === 'camps' || item.type === 'diplomas'
  const detailPath = isCourse
    ? `/courses/${item.id}`
    : isBookable
      ? `/${item.type}/${item.id}`
      : ''

  return (
    <article className="item-card">
      {item.image_url ? (
        <img className="item-image" src={item.image_url} alt="" loading="lazy" />
      ) : (
        <div className="item-image item-image--empty" aria-hidden="true" />
      )}
      <div className="item-body">
        <h2 className="item-title">
          {(isCourse || isBookable) && detailPath ? <Link to={detailPath}>{title}</Link> : title}
        </h2>
        {description && <p className="item-text">{description}</p>}
        <div className="item-meta">
          {item.start_date && (
            <span>
              {t.startsOn} {formatDate(item.start_date, lang)}
            </span>
          )}
          {price && <strong>{price}</strong>}
        </div>
        {(isCourse || isBookable) && detailPath ? (
          <Link className="control item-link" to={detailPath}>
            {isBookable ? t.book : t.details}
          </Link>
        ) : (
          item.link_url && (
            <a className="control item-link" href={item.link_url} target="_blank" rel="noreferrer">
              {t.details}
            </a>
          )
        )}
      </div>
    </article>
  )
}
