import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider } from './auth/AuthContext'
import Layout from './layout/Layout'
import Home from './pages/Home'
import Sessions from './pages/Sessions'
import Courses from './pages/Courses'
import CourseDetail from './pages/CourseDetail'
import Diplomas from './pages/Diplomas'
import Camps from './pages/Camps'
import BookingDetail from './pages/BookingDetail'
import MyLearning from './pages/MyLearning'
import Account from './pages/Account'
import NotFound from './pages/NotFound'
import AdminApp from './admin/AdminApp'

/* The design-system page is a dev-only aid; in production the route falls
   through to NotFound. Loading it lazily in dev keeps the production bundle
   free of the design-system code. */
const DesignSystem =
  process.env.NODE_ENV === 'production' ? null : lazy(() => import('./pages/DesignSystem'))

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/:id" element={<CourseDetail />} />
              <Route path="/diplomas" element={<Diplomas />} />
              <Route path="/diplomas/:id" element={<BookingDetail type="diplomas" />} />
              <Route path="/camps" element={<Camps />} />
              <Route path="/camps/:id" element={<BookingDetail type="camps" />} />
              <Route path="/my-learning" element={<MyLearning />} />
              <Route path="/account" element={<Account />} />
              {DesignSystem && (
                <Route
                  path="/design-system"
                  element={
                    <Suspense fallback={null}>
                      <DesignSystem />
                    </Suspense>
                  }
                />
              )}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  )
}

