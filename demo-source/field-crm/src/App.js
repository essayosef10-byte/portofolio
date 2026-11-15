import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { DEMO_MODE } from './lib/supabaseClient';
import TopBar from './components/TopBar';
import Login from './pages/Login';
import RepDashboard from './pages/RepDashboard';
import RepVisit from './pages/RepVisit';
import AdminDashboard from './pages/AdminDashboard';
import RepCoverage from './pages/RepCoverage';
import AdminApprovals from './pages/AdminApprovals';
import AdminRepAccounts from './pages/AdminRepAccounts';
import AdminReports from './pages/AdminReports';
import RepAddDoctor from './pages/RepAddDoctor';
import RepSetDoctorLocation from './pages/RepSetDoctorLocation';
import LoadingScreen from './components/LoadingScreen';

function AuthedLayout({ children }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        تخطي إلى المحتوى
      </a>
      <TopBar />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }
  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return children;
}

function HomeRouter() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }
  if (profile?.role === 'admin') {
    return <AdminDashboard />;
  }
  return <RepDashboard />;
}

function LoginRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }
  if (session) {
    return <Navigate to="/" replace />;
  }
  return <Login />;
}

const LAST_ROUTE_KEY = 'last_route';

// بيحفظ آخر مسار (route) زاره المستخدم في sessionStorage، وبيسترجعه تلقائيًا
// مرة واحدة بس عند فتح التطبيق. مفيد لما كروم يعمل "tab discarding" ويعمل
// reload كامل للتاب (بيفقد كل الـ state في الذاكرة)، فالمستخدم يرجع لمكانه
// بدل ما يبدأ من الصفحة الرئيسية من تاني.
function RouteMemory() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const hasCheckedRestoreRef = useRef(false);

  // بنقرا القيمة القديمة المحفوظة مرة واحدة بس عند أول render (قبل أي
  // useEffect يشتغل خالص)، عشان لو الـ effect بتاع الحفظ اشتغل قبل effect
  // الاسترجاع، منلاقيش نفسنا بنقارن المسار الحالي بنفسه (لأنه يبقى اتكتب
  // فوق القيمة القديمة في sessionStorage قبل ما نقراها).
  const [initialSavedRoute] = useState(() => sessionStorage.getItem(LAST_ROUTE_KEY));

  // حفظ المسار الحالي على كل تغيير — بس لو المستخدم مسجل دخول فعلاً ومش
  // واقف على /login (عشان منحفظش /login نفسها كـ "آخر مسار").
  useEffect(() => {
    if (loading || !session) return;
    if (location.pathname === '/login') return;
    sessionStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
  }, [loading, session, location.pathname, location.search]);

  // الاسترجاع بيحصل مرة واحدة بس عند أول تحميل للتطبيق، وبعد ما نتأكد من
  // حالة تسجيل الدخول (loading خلص) — عشان منعملش أي redirect لمستخدم مش
  // مسجل دخول لمسار محفوظ قديم. بيستخدم initialSavedRoute (القيمة اللي
  // اتقرت قبل أي كتابة) بدل ما يقرا sessionStorage تاني دلوقتي.
  useEffect(() => {
    if (hasCheckedRestoreRef.current || loading) return;
    hasCheckedRestoreRef.current = true;

    if (!session) return;
    if (location.pathname === '/login') return;

    const currentRoute = location.pathname + location.search;
    if (initialSavedRoute && initialSavedRoute !== currentRoute) {
      navigate(initialSavedRoute, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {DEMO_MODE && <div role="status" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '7px 12px', background: '#fff4d6', color: '#694b10', textAlign: 'center', fontSize: 12, fontWeight: 700, borderBottom: '1px solid #f0d18b' }}>DEMO PREVIEW · SAMPLE DATA · <a href="/?role=admin">Admin view</a> · <a href="/?role=rep">Rep view</a> · التغييرات مؤقتة</div>}
        <RouteMemory />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AuthedLayout>
                  <HomeRouter />
                </AuthedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/visit/:doctorId"
            element={
              <RequireAuth>
                <AuthedLayout>
                  <RepVisit />
                </AuthedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/weekly-plan"
            element={
              <RequireAuth>
                <AuthedLayout>
                  <RepCoverage />
                </AuthedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/add-doctor"
            element={
              <RequireAuth>
                <AuthedLayout>
                  <RepAddDoctor />
                </AuthedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/set-doctor-location"
            element={
              <RequireAuth>
                <AuthedLayout>
                  <RepSetDoctorLocation />
                </AuthedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AuthedLayout>
                    <AdminApprovals />
                  </AuthedLayout>
                </RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/reps"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AuthedLayout>
                    <AdminRepAccounts />
                  </AuthedLayout>
                </RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AuthedLayout>
                    <AdminReports />
                  </AuthedLayout>
                </RequireAdmin>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
