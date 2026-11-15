import Marquee from '../components/Marquee'
import { NAV_ITEMS } from '../components/Sidebar'
import { SCIENCE_ICONS } from '../components/FloatingIcons'
import { useLanguage } from '../i18n/LanguageContext'

const COLOR_TOKENS = [
  ['background', 'var(--bg)'],
  ['background 2', 'var(--bg2)'],
  ['ink', 'var(--ink)'],
  ['muted', 'var(--muted)'],
  ['line', 'var(--line)'],
  ['panel', 'var(--panel)'],
  ['accent', 'var(--accent)'],
  ['royal', 'var(--royal)'],
  ['glow', 'var(--glow)'],
]

export default function DesignSystem() {
  const { t } = useLanguage()

  return (
    <section className="page ds">
      <h1 className="page-title">Design System</h1>

      <h2 className="ds-heading">Colors</h2>
      <ul className="ds-swatches">
        {COLOR_TOKENS.map(([name, cssVar]) => (
          <li key={name} className="ds-swatch">
            <span className="ds-swatch-chip" style={{ background: cssVar }} />
            <span className="ds-swatch-name">{name}</span>
            <code className="ds-swatch-var">{cssVar}</code>
          </li>
        ))}
      </ul>

      <h2 className="ds-heading">Typography</h2>
      <div className="ds-type">
        <p className="ds-type-sample ds-type-sample--display">{t.headlineLine1}</p>
        <p className="ds-type-sample ds-type-sample--body">{t.subLine2}</p>
      </div>

      <h2 className="ds-heading">Buttons</h2>
      <div className="ds-row">
        <button type="button" className="control signin">
          <span>{t.signIn}</span>
          <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="control">
          {t.languageToggle}
        </button>
        <button type="button" className="control icon-btn" aria-label={t.menu}>
          <span className="hamb" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>

      <h2 className="ds-heading">Sidebar items</h2>
      <div className="ds-sidebar-sample">
        <nav className="drawer-links">
          {NAV_ITEMS.map(({ key, path }) => (
            <a key={key} href={path} onClick={(event) => event.preventDefault()}>
              <span>{t[key]}</span>
              <small>{key}</small>
              <span className="link-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </nav>
      </div>

      <h2 className="ds-heading">Marquee</h2>
      <Marquee />

      <h2 className="ds-heading">Science icons</h2>
      <div className="ds-icons">
        {SCIENCE_ICONS.map(({ id, Icon, props }) => (
          <span key={id} className="ds-icon">
            <Icon {...props} />
          </span>
        ))}
      </div>
    </section>
  )
}
