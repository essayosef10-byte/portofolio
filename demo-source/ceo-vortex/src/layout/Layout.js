import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthBanner from '../components/AuthBanner'
import FloatingIcons from '../components/FloatingIcons'
import Header from '../components/Header'
import Intro, { shouldPlayIntro, markIntroDone } from '../components/Intro'
import Sidebar from '../components/Sidebar'
import { DEMO_MODE } from '../supabaseClient'

export default function Layout() {
  const { isSignedIn } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuButtonRef = useRef(null)

  /* The intro only plays on "/". shouldPlayIntro is checked once on mount so
     it does not flicker back on if a query string changes later. */
  const [introState, setIntroState] = useState(() => {
    if (typeof window !== 'undefined' && shouldPlayIntro()) {
      return 'playing'
    }
    return 'done'
  })

  useEffect(() => {
    if (introState !== 'playing') {
      markIntroDone()
    }
  }, [introState])

  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const playing = introState === 'playing'
  const rootPath =
    location.pathname === '/' ||
    location.pathname === '/index.html' ||
    location.pathname.indexOf('/index.html') === location.pathname.length - 11

  return (
    <div className={`app-shell${isSignedIn ? ' signed-in' : ''}`}>
      {DEMO_MODE && <div role="status" style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 1000, border: '1px solid #f0d18b', borderRadius: 999, padding: '8px 14px', background: '#fff4d6', color: '#694b10', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 24px #17203322' }}>DEMO PREVIEW · SAMPLE DATA</div>}
      <FloatingIcons />
      <Header
        sidebarOpen={sidebarOpen}
        menuButtonRef={menuButtonRef}
        onOpenSidebar={openSidebar}
        showMenuButton
      />
      <div className="app-body" aria-hidden={playing || undefined}>
        <main className="app-main" inert={playing ? '' : undefined}>
          <Outlet />
        </main>
      </div>
      <AuthBanner />
      <Sidebar
        variant="overlay"
        open={sidebarOpen}
        onClose={closeSidebar}
        menuButtonRef={menuButtonRef}
      />
      {playing && rootPath && (
        <Intro
          onDone={() => setIntroState('done')}
        />
      )}
    </div>
  )
}
