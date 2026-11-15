function FlaskIcon({ base = true }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3h10M9 3v7l-5 8a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-8V3" />
      {base && <path d="M7 15h10" />}
    </svg>
  )
}

function BeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M7 13h4M7 16h7" />
    </svg>
  )
}

function RaysIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2c4 4 4 16 0 20M12 2C8 6 8 18 12 22M4 5c4 4 12 10 16 14M20 5C16 9 8 15 4 19M5 8h14M5 16h14" />
    </svg>
  )
}

function ChartBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 21 21 3M7 3h14v14M3 7v14h14M7 17l10-10" />
    </svg>
  )
}

function OrbitIcon({ angle }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="2" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform={`rotate(${angle} 12 12)`} />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform={`rotate(${-angle} 12 12)`} />
    </svg>
  )
}

function TriangleWideIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20 12 4l8 16zM8 12h8M6 16h12" />
    </svg>
  )
}

function TriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20 12 4l8 16zM8 12h8" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 4h16v16H4zM4 12h16M12 4v16M7 7l10 10M17 7 7 17" />
    </svg>
  )
}

function DocumentTallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

function DocumentNarrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h6" />
    </svg>
  )
}

function LineChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 18 8 6l4 9 3-6 6 9M3 21h18" />
    </svg>
  )
}

function StarburstIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function ChartLineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 20h18M5 16l5-8 4 5 5-9" />
    </svg>
  )
}

export const SCIENCE_ICONS = [
  { id: 'flask-1', Icon: FlaskIcon },
  { id: 'beaker', Icon: BeakerIcon },
  { id: 'rays', Icon: RaysIcon },
  { id: 'flask-2', Icon: FlaskIcon },
  { id: 'chart-box', Icon: ChartBoxIcon },
  { id: 'orbit-35', Icon: OrbitIcon, props: { angle: 35 } },
  { id: 'triangle-wide', Icon: TriangleWideIcon },
  { id: 'grid', Icon: GridIcon },
  { id: 'doc-tall', Icon: DocumentTallIcon },
  { id: 'orbit-60', Icon: OrbitIcon, props: { angle: 60 } },
  { id: 'line-chart', Icon: LineChartIcon },
  { id: 'starburst', Icon: StarburstIcon },
  { id: 'doc-mid', Icon: DocumentIcon },
  { id: 'flask-3', Icon: FlaskIcon, props: { base: false } },
  { id: 'triangle', Icon: TriangleIcon },
  { id: 'orbit-25', Icon: OrbitIcon, props: { angle: 25 } },
  { id: 'doc-narrow', Icon: DocumentNarrowIcon },
  { id: 'chart-line', Icon: ChartLineIcon },
]

export default function FloatingIcons() {
  return (
    <div className="science-field" aria-hidden="true">
      {SCIENCE_ICONS.map(({ id, Icon, props }) => (
        <span key={id} className="science">
          <Icon {...props} />
        </span>
      ))}
    </div>
  )
}
