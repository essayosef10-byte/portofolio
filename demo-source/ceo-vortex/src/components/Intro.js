import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

/* Cinematic intro shown once per session before the home page.
   The home page is mounted underneath the whole time so it is ready when the
   intro ends. The intro plays automatically; any tap or click on the screen
   (or Escape) skips straight to the exit. */

const STORAGE_KEY = 'ceo-intro-seen'

const SCENES = [
  { key: 'introScene1', duration: 2500 },
  { key: 'introScene2', duration: 2500 },
  { key: 'introScene3', duration: 2500 },
  { key: 'introScene4', duration: 2500 },
  { key: 'introScene5', duration: 2500 },
]

const BARS_IN = 600
const LOGOS = 1600
const EXIT = 700

const PARTICLE_COLORS = ['#54cfff', '#477eff', '#7c9cff']

/* Decide once, synchronously, whether the intro should play this load. */
export function shouldPlayIntro() {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('intro') === '1') {
      return true
    }
    if (params.get('intro') === '0') {
      return false
    }
    const seen = window.sessionStorage.getItem(STORAGE_KEY)
    if (seen) {
      return false
    }
    const reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      return false
    }
    const path = window.location.pathname || '/'
    const isRoot = path === '/' || path === '/index.html' || path.endsWith('/index.html')
    if (!isRoot) {
      return false
    }
    return true
  } catch (e) {
    return false
  }
}

/* Mark the intro as seen so it does not play again this session, and add the
   intro-done class so the hero entrance can fire. Safe to call repeatedly.
   Also clears the anti-flash background set on <html> before React loaded,
   so the floating icons (z-index: -1) show through again. */
export function markIntroDone() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, '1')
  } catch (e) {
    /* sessionStorage blocked */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('intro-done')
    document.documentElement.style.background = ''
  }
}

export default function Intro({ onDone }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState('bars')
  const [scene, setScene] = useState(0)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const starsRef = useRef([])
  const startTimeRef = useRef(0)
  const pausedAtRef = useRef(0)
  const exitingRef = useRef(false)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) {
      return
    }
    doneRef.current = true
    markIntroDone()
    if (typeof onDone === 'function') {
      onDone()
    }
  }, [onDone])

  const runExit = useCallback(() => {
    if (exitingRef.current) {
      return
    }
    exitingRef.current = true
    setPhase('exit')
    window.setTimeout(finish, EXIT)
  }, [finish])

  /* Star-field canvas: particles drift toward the center and accelerate over
     the scenes. transform/opacity only, capped DPR, no per-frame layout. */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return undefined
    }
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const count = window.innerWidth < 768 ? 70 : 140
    const makeStars = () => {
      const stars = []
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.6 + 40
        stars.push({
          x: window.innerWidth / 2 + Math.cos(angle) * radius,
          y: window.innerHeight / 2 + Math.sin(angle) * radius,
          z: Math.random() * 0.8 + 0.2,
          size: Math.random() * 1.6 + 0.4,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        })
      }
      starsRef.current = stars
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (starsRef.current.length === 0) {
        makeStars()
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (now) => {
      if (!startTimeRef.current) {
        startTimeRef.current = now
      }
      const elapsed = now - startTimeRef.current - pausedAtRef.current
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const sceneProgress = Math.min(elapsed / (SCENES.length * 2500), 1)
      const speed = 0.6 + sceneProgress * 2.4
      const stars = starsRef.current
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < stars.length; i += 1) {
        const s = stars[i]
        const dx = s.x - cx
        const dy = s.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const pull = speed * s.z
        s.x -= (dx / dist) * pull
        s.y -= (dy / dist) * pull
        if (dist < 6 || s.x < -20 || s.x > window.innerWidth + 20 || s.y < -20 || s.y > window.innerHeight + 20) {
          const angle = Math.random() * Math.PI * 2
          const radius = Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.6 + 40
          s.x = cx + Math.cos(angle) * radius
          s.y = cy + Math.sin(angle) * radius
        }
        const alpha = 0.4 + 0.5 * (1 - Math.min(dist / 400, 1))
        ctx.globalAlpha = alpha
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
        pausedAtRef.current -= performance.now()
      } else {
        pausedAtRef.current += performance.now()
        rafRef.current = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /* Phase driver: bars → scenes. */
  useEffect(() => {
    if (phase !== 'bars') {
      return undefined
    }
    const timer = window.setTimeout(() => setPhase('scenes'), BARS_IN)
    return () => window.clearTimeout(timer)
  }, [phase])

  /* Auto-advance the current scene after its duration. */
  useEffect(() => {
    if (phase !== 'scenes') {
      return undefined
    }
    const timer = window.setTimeout(() => {
      if (scene >= SCENES.length - 1) {
        setPhase('logos')
      } else {
        setScene(scene + 1)
      }
    }, SCENES[scene].duration)
    return () => window.clearTimeout(timer)
  }, [phase, scene])

  /* Logos phase: hold then exit. */
  useEffect(() => {
    if (phase !== 'logos') {
      return undefined
    }
    const timer = window.setTimeout(runExit, LOGOS)
    return () => window.clearTimeout(timer)
  }, [phase, runExit])

  /* Any tap, click or Escape skips straight to the exit. */
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        runExit()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
    }
  }, [runExit])

  /* Lock the page while the intro plays. */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const isLogos = phase === 'logos'
  const isExit = phase === 'exit'

  return (
    <div
      className={`intro intro--${phase}${isExit ? ' intro--leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.introAria}
      onClick={runExit}
      onTouchStart={runExit}
    >
      <canvas className="intro-canvas" ref={canvasRef} aria-hidden="true" />
      <div className="intro-grain" aria-hidden="true" />
      <div className="intro-vignette" aria-hidden="true" />
      <div className="intro-bar intro-bar--top" aria-hidden="true" />
      <div className="intro-bar intro-bar--bottom" aria-hidden="true" />

      <div className="intro-stage" aria-live="polite">
        {phase === 'scenes' && (
          <p key={scene} className="intro-line">
            {t[SCENES[scene].key]}
          </p>
        )}
        {isLogos && (
          <div className="intro-logos">
            <img
              className="intro-logo intro-logo--ceo"
              src={`${process.env.PUBLIC_URL}/assets/logos/logo-ceo.png`}
              alt=""
            />
            <img
              className="intro-logo intro-logo--wordmark"
              src={`${process.env.PUBLIC_URL}/assets/logos/logo-vortex-wordmark.png`}
              alt="CEO by Vortex"
            />
          </div>
        )}
      </div>
    </div>
  )
}
