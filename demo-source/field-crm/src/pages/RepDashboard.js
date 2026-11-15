// src/pages/RepDashboard.js
//
// صفحة "زياراتي" — زيارات المندوب الحقيقية بالـ GPS.
// القالب الأسبوعي دورة متكررة (أسبوع 1-4 × يوم من القالب)، مش تواريخ
// حقيقية، فالصفحة بتحسب "أسبوع/يوم النهاردة" تلقائيًا بـ useTodayWeekDay
// (نظام التاريخ المرجعي)، وبتفلتر assignments على week_number/day_of_week
// (+ status='approved') بدل عمود visit_date اللي مش موجود في الجدول ده.
// جدول visits نفسه (تسجيل الـ check-in الفعلي) لسه بتاريخ حقيقي زي ما هو.
//
// المندوب يقدر كمان يتصفح أي يوم من الأربع أسابيع (مش يوم النهاردة بس)،
// لكن تسجيل الزيارة (GPS check-in) بيفضل متاح بس وهو واقف على يوم النهاردة
// الفعلي، عشان منطق GPS الأساسي في RepVisit.js يفضل زي ما هو بالظبط.

import LoadingScreen from '../components/LoadingScreen';
import { SkeletonDoctorCard } from '../components/Skeletons';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Clock,
  MapPin,
  Stethoscope,
  CheckCircle2,
  XCircle,
  CircleDashed,
  CalendarCheck,
  Inbox,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { DAY_KEYS, dayLabel, useTodayWeekDay, HOLIDAY_BANNER_MESSAGE } from '../lib/weekTemplate';
import { getDoctorClass } from '../lib/doctorClass';
import './RepDashboard.css';

const SLOTS_PER_WEEK = DAY_KEYS.length; // 5
const TOTAL_SLOTS = SLOTS_PER_WEEK * 4; // 20

/** بيحوّل (أسبوع، يوم) لرقم ترتيبي (index) في دورة الـ 20 يوم شغل. */
function slotIndex(weekNumber, dayKey) {
  const dayIdx = DAY_KEYS.indexOf(dayKey);
  if (dayIdx === -1) return null;
  return (weekNumber - 1) * SLOTS_PER_WEEK + dayIdx;
}

/** بيحوّل index (ممكن يكون سالب أو أكبر من 20) لـ (أسبوع، يوم) صحيحين. */
function slotFromIndex(index) {
  const normalized = ((index % TOTAL_SLOTS) + TOTAL_SLOTS) % TOTAL_SLOTS;
  const weekNumber = Math.floor(normalized / SLOTS_PER_WEEK) + 1;
  const dayKey = DAY_KEYS[normalized % SLOTS_PER_WEEK];
  return { weekNumber, dayKey };
}

/** بيرجع تاريخ النهاردة بصيغة YYYY-MM-DD حسب توقيت الجهاز (من غير مشاكل تحويل UTC). */
function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** بيحوّل وقت من قاعدة البيانات ("HH:MM:SS" أو "HH:MM") لصيغة عربية 12 ساعة زي "9:00 ص". */
function formatArabicTime(timeStr) {
  if (!timeStr) return null;
  const [hStr, mStr] = timeStr.split(':');
  let hours = parseInt(hStr, 10);
  if (Number.isNaN(hours)) return null;
  const period = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${mStr} ${period}`;
}

/** بيحدد حالة الدكتور بناءً على الزيارات المسجلة له في نفس اليوم. */
function getDoctorStatus(doctorId, visitsByDoctor) {
  const doctorVisits = visitsByDoctor[doctorId];
  if (!doctorVisits || doctorVisits.length === 0) return 'pending';
  const hasTrueVisit = doctorVisits.some((v) => v.is_true_visit === true);
  return hasTrueVisit ? 'true_visit' : 'false_visit';
}

const STATUS_CONFIG = {
  true_visit: { label: 'تمت الزيارة', className: 'visit-status-chip visit-status-chip--green', Icon: CheckCircle2 },
  false_visit: { label: 'موقع غير مطابق', className: 'visit-status-chip visit-status-chip--red', Icon: XCircle },
  pending: { label: 'لسه', className: 'visit-status-chip visit-status-chip--gray', Icon: CircleDashed },
};

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status];
  const { Icon } = cfg;
  return (
    <span className={cfg.className}>
      <Icon size={13} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

function DoctorCard({ assignment, status, isToday, onClick }) {
  const doctor = assignment.doctor;
  if (!doctor) return null;
  const doctorClass = getDoctorClass(doctor);

  const content = (
    <>
      <div className="doctor-card__info">
        <h3 className="doctor-card__name">
          {doctor.name}
          {doctorClass && <span className="tag-amber doctor-card__class">{doctorClass}</span>}
        </h3>
        <p className="doctor-card__specialty">
          <Stethoscope size={13} strokeWidth={2.25} />
          {doctor.specialty || '—'}
        </p>
        <p className="doctor-card__address">
          <MapPin size={13} strokeWidth={2.25} />
          <span>{doctor.address || '—'}</span>
        </p>
        {doctor.rep_notes && <p className="doctor-card__notes">{doctor.rep_notes}</p>}
      </div>
      <div className="doctor-card__status">{isToday && <StatusChip status={status} />}</div>
    </>
  );

  if (!isToday) {
    // تصفح يوم غير النهاردة: عرض بس، من غير إمكانية تسجيل زيارة
    return (
      <div className="doctor-card doctor-card--readonly" data-status={status}>
        {content}
      </div>
    );
  }

  return (
    <button type="button" className="doctor-card" data-status={status} onClick={onClick}>
      {content}
    </button>
  );
}

export default function RepDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const {
    weekNumber: currentWeekNumber,
    dayKey: currentDayKey,
    loading: weekLoading,
  } = useTodayWeekDay();

  // "المؤشر" اللي المندوب واقف عليه دلوقتي في التصفح (ممكن يكون مختلف عن اليوم الحالي)
  const [viewIndex, setViewIndex] = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!weekLoading && !initialized) {
      const startIndex =
        slotIndex(currentWeekNumber, currentDayKey) ?? slotIndex(currentWeekNumber, 'Saturday');
      setViewIndex(startIndex);
      setInitialized(true);
    }
  }, [weekLoading, initialized, currentWeekNumber, currentDayKey]);

  const { weekNumber: viewWeek, dayKey: viewDay } =
    viewIndex === null ? { weekNumber: currentWeekNumber, dayKey: null } : slotFromIndex(viewIndex);

  const todaySlotIndex = slotIndex(currentWeekNumber, currentDayKey);
  const isViewingToday = viewIndex !== null && todaySlotIndex !== null && viewIndex === todaySlotIndex;

  // النهاردة برا القالب (خميس/جمعة) لو currentDayKey جه null بعد ما التحميل خلص.
  // ده بس علم عرض (UI) — مبيغيّرش أي حاجة في computeWeekAndDay أو currentWeekNumber.
  const isHolidayToday = !weekLoading && currentDayKey === null;
  const holidayFallbackIndex = isHolidayToday ? slotIndex(currentWeekNumber, 'Saturday') : null;
  // بيبقى true بس لما المندوب واقف بالظبط على السلوت اللي اتفتح تلقائيًا
  // بسبب الإجازة (مش لو نقّل بنفسه ليوم تاني بالتصفح اليدوي).
  const isViewingHolidayFallback = isHolidayToday && viewIndex === holidayFallbackIndex;

  const [assignments, setAssignments] = useState([]);
  const [visitsByDoctor, setVisitsByDoctor] = useState({});
  const [dayStartTime, setDayStartTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.id || viewIndex === null) return undefined;

    let cancelled = false;

    async function loadDay() {
      setLoading(true);
      setError('');

      const [assignmentsRes, visitsRes, startTimeRes] = await Promise.all([
        supabase
          .from('assignments')
          .select(
            `
            id,
            doctor_id,
            week_number,
            day_of_week,
            doctor:doctors ( id, name, specialty, address, lat, lng, class, rep_notes )
          `
          )
          .eq('rep_id', profile.id)
          .eq('week_number', viewWeek)
          .eq('day_of_week', viewDay)
          .eq('status', 'approved'),
        isViewingToday
          ? supabase
              .from('visits')
              .select('doctor_id, is_true_visit')
              .eq('rep_id', profile.id)
              .eq('visit_date', getTodayString())
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('day_start_times')
          .select('start_time')
          .eq('rep_id', profile.id)
          .eq('week_number', viewWeek)
          .eq('day_of_week', viewDay)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (assignmentsRes.error) {
        setError('حصل خطأ في تحميل الزيارات المجدولة، حاول تاني');
        setLoading(false);
        return;
      }
      if (visitsRes.error) {
        setError('حصل خطأ في تحميل حالة الزيارات، حاول تاني');
        setLoading(false);
        return;
      }

      const visitMap = {};
      (visitsRes.data || []).forEach((v) => {
        if (!visitMap[v.doctor_id]) visitMap[v.doctor_id] = [];
        visitMap[v.doctor_id].push(v);
      });

      setAssignments(assignmentsRes.data || []);
      setVisitsByDoctor(visitMap);
      setDayStartTime(startTimeRes.error ? null : startTimeRes.data?.start_time || null);
      setLoading(false);
    }

    loadDay();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, viewIndex, viewWeek, viewDay, isViewingToday]);

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) =>
      (a.doctor?.name || '').localeCompare(b.doctor?.name || '', 'ar')
    );
  }, [assignments]);

  const summary = useMemo(() => {
    let done = 0;
    let mismatch = 0;
    let pending = 0;
    sortedAssignments.forEach((a) => {
      const status = getDoctorStatus(a.doctor_id, visitsByDoctor);
      if (status === 'true_visit') done += 1;
      else if (status === 'false_visit') mismatch += 1;
      else pending += 1;
    });
    return { done, mismatch, pending, total: sortedAssignments.length };
  }, [sortedAssignments, visitsByDoctor]);

  const handleCardClick = (doctorId) => {
    if (!isViewingToday) return;
    navigate(`/visit/${doctorId}?date=${getTodayString()}`);
  };

  const goPrevDay = () => setViewIndex((idx) => (idx === null ? idx : idx - 1));
  const goNextDay = () => setViewIndex((idx) => (idx === null ? idx : idx + 1));
  const goToday = () => setViewIndex(todaySlotIndex ?? slotIndex(currentWeekNumber, 'Saturday'));

  if (!profile) {
    return (
      <div className="rep-dashboard" dir="rtl" lang="ar">
        <LoadingScreen inline label="جاري التحقق من الحساب" />
      </div>
    );
  }

  return (
    <div className="rep-dashboard" dir="rtl" lang="ar">
      <header className="rep-dashboard__header">
        <div className="page-header">
          <div className="page-header__titles">
            <span className="page-header__icon">
              <CalendarCheck size={20} strokeWidth={2.25} />
            </span>
            <div>
              <h1>زياراتي</h1>
              <p className="page-header__subtitle rep-dashboard__today-label">
                {viewDay
                  ? `${isViewingToday ? 'زيارات اليوم' : 'تصفح'} — أسبوع ${viewWeek}، ${dayLabel(viewDay)}`
                  : 'يوم إجازة أسبوعية — مفيش يوم في القالب'}
              </p>
              {formatArabicTime(dayStartTime) && (
                <p className="rep-dashboard__start-time">
                  <Clock size={13} strokeWidth={2.5} />
                  يبدأ الساعة {formatArabicTime(dayStartTime)}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {isViewingHolidayFallback && (
        <div className="rep-dashboard__banner rep-dashboard__banner--info">
          {HOLIDAY_BANNER_MESSAGE}
        </div>
      )}

      <div className="rep-dashboard__day-nav">
        <button type="button" className="btn-outline" onClick={goPrevDay} disabled={viewIndex === null}>
          <ChevronRight size={15} strokeWidth={2.5} />
          اليوم السابق
        </button>
        {!isViewingToday && (
          <button type="button" className="btn-outline" onClick={goToday}>
            <RotateCcw size={15} strokeWidth={2.5} />
            رجوع لليوم الحالي
          </button>
        )}
        <button type="button" className="btn-outline" onClick={goNextDay} disabled={viewIndex === null}>
          اليوم التالي
          <ChevronLeft size={15} strokeWidth={2.5} />
        </button>
      </div>

      {!loading && !error && sortedAssignments.length > 0 && (
        <div className="rep-dashboard__summary">
          <div className="stat-grid">
            <div className="stat-card stat-card--total">
              <span className="stat-card__value">{summary.total}</span>
              <span className="stat-card__label">الإجمالي</span>
            </div>
            {isViewingToday && (
              <>
                <div className="stat-card stat-card--true">
                  <span className="stat-card__value">{summary.done}</span>
                  <span className="stat-card__label">تمت</span>
                </div>
                <div className="stat-card stat-card--false">
                  <span className="stat-card__value">{summary.mismatch}</span>
                  <span className="stat-card__label">غير مطابق</span>
                </div>
                <div className="stat-card stat-card--pending">
                  <span className="stat-card__value">{summary.pending}</span>
                  <span className="stat-card__label">لسه</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(loading || viewIndex === null) && <SkeletonDoctorCard count={4} />}

      {!loading && viewIndex !== null && error && (
        <div className="rep-dashboard__message">
          <div className="empty-state">
            <span className="empty-state__icon">
              <AlertTriangle size={20} strokeWidth={2} />
            </span>
            <p className="empty-state__title rep-dashboard__message--error">{error}</p>
          </div>
        </div>
      )}

      {!loading && viewIndex !== null && !error && sortedAssignments.length === 0 && (
        <div className="rep-dashboard__message">
          <div className="empty-state">
            <span className="empty-state__icon">
              <Inbox size={20} strokeWidth={2} />
            </span>
            <p className="empty-state__title">مفيش زيارات مجدولة في اليوم ده</p>
          </div>
        </div>
      )}

      {!loading && viewIndex !== null && !error && sortedAssignments.length > 0 && (
        <div className="rep-dashboard__list">
          {sortedAssignments.map((assignment) => (
            <DoctorCard
              key={assignment.id}
              assignment={assignment}
              status={getDoctorStatus(assignment.doctor_id, visitsByDoctor)}
              isToday={isViewingToday}
              onClick={() => handleCardClick(assignment.doctor_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}