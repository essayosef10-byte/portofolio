import { useEffect, useRef } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'

/* Vortex: a luminous whirlpool in the brand colours.
   - Three spiral arms wind into a glowing funnel (navy -> royal blue -> cyan eye).
   - Matter flows inward along the arms (the pattern turns, the particles fall).
   - A small spiral inside the throat gives the funnel its depth.
   Everything is drawn on one canvas, no assets. */

const ARMS = 3
const TAU = Math.PI * 2
const TILT = 0.72 // vertical squash: a slight look down into the funnel
const TWIST = 5.2 // how tightly the arms wind

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)

/* Colour ramps from the hot inner edge to the cool outer edge. */
const RAMP_DARK = [
  [0, [200, 244, 255]],
  [0.2, [84, 207, 255]], // brand cyan
  [0.6, [71, 126, 255]], // brand royal
  [1, [48, 84, 214]],
]
const RAMP_LIGHT = [
  [0, [0, 156, 230]],
  [0.3, [8, 126, 185]], // brand accent (light)
  [0.65, [40, 91, 211]], // brand royal (light)
  [1, [30, 60, 160]],
]

function ramp(stops, u) {
  for (let i = 1; i < stops.length; i += 1) {
    if (u <= stops[i][0]) {
      const [u0, c0] = stops[i - 1]
      const [u1, c1] = stops[i]
      const t = (u - u0) / (u1 - u0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ]
    }
  }
  return stops[stops.length - 1][1]
}

function createParticles(count) {
  return Array.from({ length: count }, (_, i) => ({
    arm: i % ARMS,
    u0: Math.random(),
    flow: 0.022 + Math.random() * 0.045,
    j: (Math.random() - 0.5) * 0.36,
    rad: Math.random() - 0.5,
    s: 0.5 + Math.random() * 1.5,
    tw: Math.random() * TAU,
  }))
}

export default function VortexCanvas() {
  const canvasRef = useRef(null)
  const { isRTL } = useLanguage()
  const { theme } = useTheme()
  const rtlRef = useRef(isRTL)
  const themeRef = useRef(theme)
  const reduceRef = useRef(false)
  const apiRef = useRef(null)

  useEffect(() => {
    rtlRef.current = isRTL
    if (apiRef.current) {
      apiRef.current.resize()
    }
  }, [isRTL])

  useEffect(() => {
    themeRef.current = theme
    if (apiRef.current && reduceRef.current) {
      apiRef.current.redraw()
    }
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: true })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    reduceRef.current = reduce

    let W = 0
    let H = 0
    let cx = 0
    let cy = 0
    let R = 0 // outer radius of the disc
    let rh = 0 // event horizon radius
    let last = 0
    let raf = 0
    let mx = 0.5
    let my = 0.5
    let particles = []
    const startTime = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      W = Math.max(1, rect.width)
      H = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const narrow = W < 820
      if (narrow) {
        cx = W * 0.5
        cy = H * 0.64
        R = Math.min(W * 0.62, H * 0.62)
      } else {
        cx = rtlRef.current ? W * 0.26 : W * 0.74
        cy = H * 0.48
        R = Math.min(W * 0.34, H * 1.0)
      }
      rh = R * 0.15
      particles = createParticles(narrow ? 340 : 760)
      draw(reduce ? 0 : performance.now() - startTime)
    }

    /* Point on an arm, in the disc's own (tilted) plane. */
    const armPoint = (arm, u, rot, tt) => {
      const r0 = rh * 0.3
      const wob = 1 + 0.018 * Math.sin(u * 17 - tt * 1.8 + arm * 2)
      const r = (r0 + Math.pow(u, 1.25) * (R - r0)) * wob
      const a = (arm * TAU) / ARMS + TWIST * Math.log(1 + u * 7) - rot
      return [Math.cos(a) * r, Math.sin(a) * r * TILT]
    }

    const inHalf = (y, half) => (half === 'back' ? y < 0 : y >= 0)

    function drawFilaments(half, tt, rot, ent, stops, light) {
      const SEG = 120
      const CH = 6 // segments per stroked chunk: continuous joins, few seams
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'round'
      for (let arm = 0; arm < ARMS; arm += 1) {
        const pts = []
        for (let j = 0; j <= SEG; j += 1) {
          const u = 0.02 + (j / SEG) * 0.98
          const [x, y] = armPoint(arm, u, rot, tt)
          pts.push([x, y, u])
        }
        for (let layer = 0; layer < 2; layer += 1) {
          for (let i = 0; i < SEG; i += CH) {
            const end = Math.min(SEG, i + CH)
            let ym = 0
            for (let k = i; k <= end; k += 1) {
              ym += pts[k][1]
            }
            ym /= end - i + 1
            if (!inHalf(ym, half)) {
              continue
            }
            const u = pts[Math.round((i + end) / 2)][2]
            const fade = smooth(0, 0.07, u) * (1 - smooth(0.78, 1, u))
            const base = layer === 0 ? 0.22 : 0.8
            const alpha = base * fade * ent * (1 - 0.35 * u) * (light ? 0.9 : 1)
            const [r, g, b] = ramp(stops, u)
            const w = R * 0.05 * (0.25 + 0.75 * (1 - u))
            ctx.beginPath()
            ctx.moveTo(pts[i][0], pts[i][1])
            for (let k = i + 1; k <= end; k += 1) {
              ctx.lineTo(pts[k][0], pts[k][1])
            }
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
            ctx.lineWidth = layer === 0 ? Math.max(3, w) : Math.max(0.9, w * 0.26)
            ctx.stroke()
          }
        }
      }
    }

    function drawParticles(half, tt, rot, ent, stops) {
      for (const p of particles) {
        const u = (((p.u0 - tt * p.flow) % 1) + 1) % 1
        const uu = 0.02 + u * 0.98
        const [bx, by] = armPoint(p.arm, uu, rot, tt)
        const k = p.j * (0.25 + uu) // angular scatter widens outward
        const cs = Math.cos(k)
        const sn = Math.sin(k)
        const rr = 1 + (p.rad * 0.06 * uu) / 0.5
        const x = (bx * cs - (by / TILT) * sn) * rr
        const y = (bx * sn + (by / TILT) * cs) * rr * TILT
        if (!inHalf(y, half)) {
          continue
        }
        const fade = smooth(0, 0.05, uu) * (1 - smooth(0.85, 1, uu))
        const heat = Math.pow(1 - uu, 0.6)
        const tw = 0.75 + 0.25 * Math.sin(tt * 2.2 + p.tw)
        const alpha = (0.2 + 0.8 * heat) * fade * tw * ent
        const [r, g, b] = ramp(stops, uu)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, p.s * (0.55 + 0.9 * (1 - uu)), 0, TAU)
        ctx.fill()
      }
    }

    function draw(now) {
      if (!W || !H) {
        return
      }
      const tt = reduce ? 0 : now * 0.001
      const ent = reduce ? 1 : easeOutCubic(Math.min(1, tt / 2.4))
      const light = themeRef.current === 'light'
      const stops = light ? RAMP_LIGHT : RAMP_DARK
      const rot = reduce ? 0.6 : tt * 0.32
      const ox = reduce ? 0 : (mx - 0.5) * 16
      const oy = reduce ? 0 : (my - 0.5) * 12

      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(cx + ox, cy + oy)
      ctx.rotate(-0.2)

      const additive = light ? 'source-over' : 'lighter'

      // Wide ambient glow in brand blue.
      const glow = ctx.createRadialGradient(0, 0, rh, 0, 0, R * 1.15)
      glow.addColorStop(0, light ? 'rgba(40,91,211,0.22)' : 'rgba(71,126,255,0.34)')
      glow.addColorStop(0.5, light ? 'rgba(40,91,211,0.08)' : 'rgba(71,126,255,0.12)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = ent
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.15, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1

      // Funnel throat: deep navy at the rim, royal blue, then a bright cyan eye.
      const throatR = rh * 2.1 * (0.6 + 0.4 * ent)
      const throat = ctx.createRadialGradient(0, 0, 0, 0, 0, throatR)
      throat.addColorStop(0, light ? 'rgba(120,225,255,1)' : 'rgba(215,248,255,1)')
      throat.addColorStop(0.1, light ? 'rgba(0,156,230,0.95)' : 'rgba(84,207,255,0.95)')
      throat.addColorStop(0.38, light ? 'rgba(40,91,211,0.92)' : 'rgba(71,126,255,0.88)')
      throat.addColorStop(0.72, light ? 'rgba(14,44,130,0.85)' : 'rgba(10,26,74,0.92)')
      throat.addColorStop(1, 'rgba(10,26,74,0)')
      ctx.globalAlpha = ent
      ctx.fillStyle = throat
      ctx.beginPath()
      ctx.arc(0, 0, throatR, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1

      // The arms and falling particles, drawn over the throat.
      ctx.globalCompositeOperation = additive
      drawFilaments('back', tt, rot, ent, stops, light)
      drawFilaments('front', tt, rot, ent, stops, light)
      drawParticles('back', tt, rot, ent, stops)
      drawParticles('front', tt, rot, ent, stops)

      // A small spiral inside the throat, turning inward.
      ctx.beginPath()
      for (let j = 0; j <= 90; j += 1) {
        const u = j / 90
        const a = u * TAU * 2.1 + (reduce ? 0 : tt * 1.4)
        const r = rh * (0.06 + u * 1.15) * (0.6 + 0.4 * ent)
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r * TILT
        if (j === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1.3, rh * 0.05)
      ctx.strokeStyle = light ? 'rgba(120,225,255,0.9)' : 'rgba(200,244,255,0.85)'
      ctx.shadowBlur = 14
      ctx.shadowColor = light ? 'rgba(40,91,211,0.8)' : 'rgba(84,207,255,0.95)'
      ctx.stroke()
      ctx.shadowBlur = 0

      ctx.globalCompositeOperation = 'source-over'
      ctx.restore()
    }

    const loop = (now) => {
      if (!document.hidden) {
        if (now - last > 22) {
          draw(now - startTime)
          last = now
        }
        raf = requestAnimationFrame(loop)
      }
    }

    const onPointerMove = (ev) => {
      mx = ev.clientX / window.innerWidth
      my = ev.clientY / window.innerHeight
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
      } else if (!reduce) {
        raf = requestAnimationFrame(loop)
      }
    }

    apiRef.current = {
      resize,
      redraw: () => draw(reduce ? 0 : performance.now() - startTime),
    }

    resize()
    if (!reduce) {
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      apiRef.current = null
    }
  }, [])

  return <canvas ref={canvasRef} className="vortex-canvas" aria-hidden="true" />
}