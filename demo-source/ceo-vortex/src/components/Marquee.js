import { Fragment } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

function WordGroup({ words, hidden = false }) {
  return (
    <div
      className={`word-group${hidden ? ' word-group--clone' : ''}`}
      aria-hidden={hidden || undefined}
    >
      {words.map((word, index) => (
        <Fragment key={word}>
          <span className="word">{word}</span>
          {index < words.length - 1 && <i className="spark" />}
        </Fragment>
      ))}
    </div>
  )
}

export default function Marquee() {
  const { t } = useLanguage()
  const words = t.marqueeWords

  return (
    <section className="marquee" id="discover" aria-label={t.marqueeLabel}>
      <div className="mq">
        <WordGroup words={words} />
        <WordGroup words={words} hidden />
      </div>
    </section>
  )
}
