/* Inline icons for the redesigned booking page. Each one inherits the panel's
   text color via currentColor and follows the same stroke style as the rest of
   the project, so no new library is needed. */

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  focusable: false,
}

export function CalendarIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  )
}

export function ClockIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function CheckIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <path d="M5 12l4 4 10-10" />
    </svg>
  )
}

export function XIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function BanIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  )
}

export function CopyIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export function InfoIcon({ className = '' }) {
  return (
    <svg className={className} {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}
