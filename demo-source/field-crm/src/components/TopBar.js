import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CalendarRange,
  UserPlus,
  MapPin,
  ClipboardCheck,
  Users,
  FileDown,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getInitials } from '../utils/initials';

// عناصر التنقّل — كل عنصر بيحمل المسار، النص الأصلي (زي ما هو تمامًا)،
// وأيقونة Lucide بس للتوضيح البصري. مفيش أي تغيير في المسارات أو النصوص.
const REP_LINKS = [
  { to: '/weekly-plan', label: 'بناء ليستة الأسبوع', Icon: CalendarRange },
  { to: '/add-doctor', label: 'إضافة دكتور/مستشفى جديد', Icon: UserPlus },
  { to: '/set-doctor-location', label: 'تحديد موقع دكتور', Icon: MapPin },
];

const ADMIN_LINKS = [
  { to: '/admin/approvals', label: 'مراجعة الليستات', Icon: ClipboardCheck },
  { to: '/admin/reps', label: 'حسابات المناديب', Icon: Users },
  { to: '/admin/reports', label: 'تصدير التقارير', Icon: FileDown },
];

// المسار اللي بيتحط عليه نقطة التنبيه لو في أي طلبات معلّقة
const APPROVALS_PATH = '/admin/approvals';

// polling بسيط كل دقيقة عشان النقطة الحمراء تفضل محدّثة من غير ما نعيد
// تحميل الصفحة أو نستخدم أي حاجة تقيلة (websocket/realtime).
const PENDING_CHECK_INTERVAL_MS = 60000;

export default function TopBar() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const location = useLocation();
  const links = isAdmin ? ADMIN_LINKS : REP_LINKS;

  const displayName = profile?.full_name || profile?.username || 'مستخدم';
  const initials = getInitials(displayName);

  const [hasPendingApprovals, setHasPendingApprovals] = useState(false);

  // بيجيب عدد الطلبات المعلّقة بس (count) من كل مصادر المراجعة الموجودة في
  // AdminApprovals.js — أسابيع تحت المراجعة، طلبات دكاترة جدد، طلبات تعديل
  // مواقع، وطلبات حذف دكاترة. استعلام head:true يعني السيرفر بيرجع العدد
  // بس من غير ما يجيب أي صفوف فعلية، فده خفيف جدًا ومش بديل عن التحميل
  // الكامل اللي بيحصل جوه AdminApprovals.js نفسها.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function checkPendingApprovals() {
      const [weeksRes, submissionsRes, locationRequestsRes, deletionRequestsRes] = await Promise.all([
        supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('doctor_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('doctor_location_change_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('doctor_deletion_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      if (cancelled) return;

      const totalPending =
        (weeksRes.count || 0) +
        (submissionsRes.count || 0) +
        (locationRequestsRes.count || 0) +
        (deletionRequestsRes.count || 0);

      setHasPendingApprovals(totalPending > 0);
    }

    checkPendingApprovals();
    const intervalId = setInterval(checkPendingApprovals, PENDING_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isAdmin]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/fontebeam-icon.png" alt="Fonte Beam" className="brand-mark" />
        <span className="brand-wordmark">Field CRM</span>
      </div>

      <nav className="topbar-nav">
        {links.map(({ to, label, Icon }) => {
          const isActive = location.pathname === to;
          const showBadge = isAdmin && to === APPROVALS_PATH && hasPendingApprovals;
          return (
            <Link
              key={to}
              to={to}
              className={
                isActive
                  ? 'topbar-nav__link topbar-nav__link--active'
                  : 'topbar-nav__link'
              }
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="topbar-nav__icon-wrap">
                <Icon size={15} strokeWidth={2.25} />
                {showBadge && (
                  <span
                    aria-hidden="true"
                    title="فيه طلبات مراجعة معلّقة"
                    className="topbar-nav__pending-dot"
                  />
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="topbar-user">
        <span className="avatar-badge" aria-hidden="true">
          {initials}
        </span>
        <span className="topbar-user__info">
          <span className="topbar-username">{displayName}</span>
          <span className="topbar-user__role">{isAdmin ? 'مدير النظام' : 'مندوب مبيعات'}</span>
        </span>
        <button className="btn-logout" onClick={signOut}>
          <LogOut size={15} strokeWidth={2.25} />
          خروج
        </button>
      </div>
    </header>
  );
}