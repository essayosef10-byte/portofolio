import ItemCard from './ItemCard'
import useItems from '../hooks/useItems'
import { useLanguage } from '../i18n/LanguageContext'

/* Shared page for sessions, courses, diplomas and camps. */
export default function ItemsPage({ type }) {
  const { t } = useLanguage()
  const { items, status, reload } = useItems(type)

  return (
    <section className="page">
      <h1 className="page-title">{t[type]}</h1>
      {status === 'loading' && <p className="empty-state">{t.loading}</p>}
      {status === 'error' && (
        <div className="empty-state">
          <p>{t.loadError}</p>
          <button type="button" className="control" onClick={reload}>
            {t.retry}
          </button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && <p className="empty-state">{t.emptyState}</p>}
      {status === 'ready' && items.length > 0 && (
        <div className="item-grid">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
