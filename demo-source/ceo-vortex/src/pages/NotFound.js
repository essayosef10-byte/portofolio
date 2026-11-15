import Logo from '../components/Logo'
import { useLanguage } from '../i18n/LanguageContext'

export default function NotFound() {
  const { t } = useLanguage()

  return (
    <section className="page not-found">
      <Logo
        name="logo-vortex-lockup"
        alt="CEO by Vortex"
        width={463}
        height={184}
        className="not-found-lockup"
      />
      <h1 className="page-title">{t.notFound}</h1>
    </section>
  )
}
