import Marquee from '../components/Marquee'
import VortexCanvas from '../components/VortexCanvas'
import SiteFooter from '../components/SiteFooter'
import { useLanguage } from '../i18n/LanguageContext'

export default function Home() {
  const { t } = useLanguage()

  return (
    <div className="home">
      {/* The fold: everything from the header down to the marquee fits in one screen. */}
      <div className="fold">
        <div className="ambient" aria-hidden="true" />
        <VortexCanvas />
        <div className="grain" aria-hidden="true" />
        <section className="hero" aria-labelledby="headline">
          <div className="copy">
            <h1 className="headline" id="headline">
              <span className="line">{t.headlineLine1}</span>{' '}
              <span className="line">{t.headlineLine2}</span>{' '}
              <span className="line line--accent">{t.headlineLine3}</span>
            </h1>
            <p className="subhead">{t.subLine1}</p>
            <p className="description">{t.subLine2}</p>
          </div>
        </section>
        <Marquee />
      </div>
      <SiteFooter />
    </div>
  )
}
