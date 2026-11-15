export function LockIcon({ className = '' }) {
  return (
    <svg className={`cp-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/* Points to the start side (left in LTR). Flipped by CSS in RTL. */
export function ArrowIcon({ className = '' }) {
  return (
    <svg className={`cp-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}