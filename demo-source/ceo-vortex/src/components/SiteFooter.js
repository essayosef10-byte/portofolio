import Logo from './Logo'
import { useLanguage } from '../i18n/LanguageContext'
import { SITE_CONTACTS, TEAM_MEMBERS } from '../config/site'

/* A small rounded icon button used in the footer. */
function IconButton({ href, label, children }) {
  return (
    <a
      className="footer-li-btn"
      href={href}
      {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      aria-label={label}
      dir="ltr"
    >
      {children}
    </a>
  )
}

/* The small LinkedIn glyph reused across the footer. */
function LinkedInGlyph() {
  return (
    <svg className="footer-li-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM0 8h5v16H0V8zm7.5 0H12v2.2h.07c.63-1.2 2.17-2.46 4.46-2.46C21.4 7.74 24 10 24 14.6V24h-5v-8.4c0-2-.04-4.6-2.8-4.6-2.8 0-3.2 2.18-3.2 4.45V24h-5V8z" />
    </svg>
  )
}

/* A small LinkedIn icon button placed beside a team member's name. */
function LinkedInButton({ href }) {
  return (
    <IconButton href={href} label="LinkedIn">
      <LinkedInGlyph />
    </IconButton>
  )
}

function FacebookGlyph() {
  return (
    <svg className="footer-li-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08V12h3.05V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.69.24 2.69.24v2.95h-1.52c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38C19.61 22.95 24 17.99 24 12z" />
    </svg>
  )
}

function MailGlyph() {
  return (
    <svg className="footer-li-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 4h20a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm10 7L3 6v12h18V6l-9 5z" />
    </svg>
  )
}

function PhoneGlyph() {
  return (
    <svg className="footer-li-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.1 1.2z" />
    </svg>
  )
}

/* A plain contact value rendered as a real link that looks like normal text:
   inherits the muted footer color, no underline, no hover change. The visible
   focus ring stays, for keyboard users. Latin/URL values are isolated with
   dir="ltr" + unicode-bidi:isolate so they render correctly inside Arabic. */
function ContactLink({ href, children }) {
  return (
    <a
      className="footer-contact-link"
      href={href}
      {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      dir="ltr"
    >
      {children}
    </a>
  )
}

/* A contact row with an icon button beside the text link. */
function ContactLinkWithIcon({ href, label, text, icon }) {
  return (
    <span className="footer-team-row">
      <ContactLink href={href}>{text}</ContactLink>
      <IconButton href={href} label={label}>
        {icon}
      </IconButton>
    </span>
  )
}

export default function SiteFooter() {
  const { t } = useLanguage()
  const { platform, developer } = SITE_CONTACTS

  return (
    <footer className="footer">
      <a className="footer-brand" href="#top" aria-label="Vortex">
        <Logo
          name="logo-vortex-wordmark"
          alt="Vortex"
          width={463}
          height={95}
        />
      </a>

      <div className="footer-contacts" aria-label={t.footerContact}>
        {/* Developer — left column */}
        <div className="footer-contact-group">
          <span className="footer-contact-label">{t.footerDeveloper}</span>
          <span className="footer-contact-line">
            <span className="footer-team-row">
              <span className="footer-contact-name">{developer.name}</span>
              {developer.linkedin && <LinkedInButton href={developer.linkedin} />}
            </span>
            <ContactLinkWithIcon
              href={`tel:${developer.phone}`}
              label="Phone"
              text={developer.phone}
              icon={<PhoneGlyph />}
            />
            <ContactLinkWithIcon
              href={`mailto:${developer.email}`}
              label="Email"
              text={developer.email}
              icon={<MailGlyph />}
            />
          </span>
        </div>

        {/* Our team — center column */}
        <div className="footer-contact-group">
          <span className="footer-contact-label">{t.footerOurTeam}</span>
          <span className="footer-contact-line footer-team-list">
            {TEAM_MEMBERS.map((member) => (
              <span key={member.name} className="footer-team-row">
                <span className="footer-contact-name">{member.name}</span>
                <LinkedInButton href={member.linkedin} />
              </span>
            ))}
          </span>
        </div>

        {/* Contact us — right column */}
        <div className="footer-contact-group">
          <span className="footer-contact-label">{t.footerContact}</span>
          <span className="footer-contact-line">
            <ContactLinkWithIcon
              href={`mailto:${platform.email}`}
              label="Email"
              text={platform.email}
              icon={<MailGlyph />}
            />
            <ContactLinkWithIcon
              href={platform.facebook}
              label="Facebook"
              text="Facebook"
              icon={<FacebookGlyph />}
            />
            <ContactLinkWithIcon
              href={platform.linkedin}
              label="LinkedIn"
              text="LinkedIn"
              icon={<LinkedInGlyph />}
            />
          </span>
        </div>
      </div>
    </footer>
  )
}