/**
 * Purely decorative orbital/molecular motif, echoing the logo symbol and
 * the packaging's background lattice. Deliberately abstract — no labels,
 * no annotations, no mechanism-of-action implication. See Phase 2 design
 * system, Section K.
 */
export function OrbitMotif({ className = "", opacity = 0.3 }: { className?: string; opacity?: number }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ opacity }}
    >
      <circle cx="100" cy="100" r="60" stroke="url(#orbit-grad)" strokeWidth="0.4" />
      <circle cx="100" cy="100" r="85" stroke="url(#orbit-grad)" strokeWidth="0.3" />
      <circle cx="100" cy="100" r="40" stroke="url(#orbit-grad)" strokeWidth="0.25" />
      <circle cx="100" cy="40" r="3.5" fill="#6FC7FF" />
      <circle cx="160" cy="100" r="2.5" fill="#3B7DFF" />
      <circle cx="100" cy="160" r="4" fill="#1E3FE0" />
      <circle cx="40" cy="100" r="2.5" fill="#6FC7FF" />
      <defs>
        <linearGradient id="orbit-grad" x1="0" y1="0" x2="200" y2="200">
          <stop stopColor="#1E3FE0" />
          <stop offset="1" stopColor="#6FC7FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
