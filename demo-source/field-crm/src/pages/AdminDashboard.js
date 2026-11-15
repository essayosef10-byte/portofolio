// src/pages/AdminDashboard.js
//
// أعمدة قاعدة البيانات الفعلية المستخدمة هنا:
// profiles:    { id, full_name, role }        -> role === 'rep'
// doctors:     { id, name, specialty, address, area, class }
// assignments: { id, rep_id, doctor_id, week_number, day_of_week, status }
//   - القالب الأسبوعي مش تواريخ حقيقية، فمفيش عمود visit_date في الجدول ده.
//     بنفلتر بـ week_number + day_of_week + status='approved' بدل كده
//     (نفس الإصلاح اللي اتعمل قبل كده في RepDashboard.js).
// visits:      { id, rep_id, doctor_id, visit_date, visit_time,
//                is_true_visit, comment, distance_meters }
//   - الأدوية بقت في جدول visit_medicines (join table) بدل عمود
//     medicine_name القديم على visits نفسها — نفس التصحيح اللي
//     اتعمل في AdminReports.js.
//   - is_true_visit: true = زيارة صحيحة/مطابقة، false = غير مطابقة
//   - مفيش عمود assignment_id في visits، فبنطابق الزيارة بالـ doctor_id
//   - الزيارات دايمًا مربوطة بتاريخ حقيقي (اليوم الفعلي)، فمينفعش نجيبها
//     إلا لما اليوم المختار (week/day) يكون هو نفسه "اليوم الحالي" فعليًا

import { SkeletonRow, SkeletonStatGrid } from '../components/Skeletons';
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { WEEK_NUMBERS, DAYS, dayLabel, useTodayWeekDay, HOLIDAY_BANNER_MESSAGE } from "../lib/weekTemplate";
import { getDoctorClass } from "../lib/doctorClass";
import {
  Users,
  CheckCircle2,
  XCircle,
  CircleDashed,
  RotateCcw,
  Clock,
  Pill,
  Ruler,
  AlertCircle,
  Inbox,
} from "lucide-react";
import "./AdminDashboard.css";

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatDateTime(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("ar-EG", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function AdminDashboard() {
  const {
    weekNumber: currentWeekNumber,
    dayKey: currentDayKey,
    loading: weekLoading,
  } = useTodayWeekDay();

  const [reps, setReps] = useState([]);
  const [repsLoading, setRepsLoading] = useState(true);
  const [repsError, setRepsError] = useState(null);

  const [selectedRepId, setSelectedRepId] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState("Saturday");
  const [initializedSlot, setInitializedSlot] = useState(false);

  const [lastVisit, setLastVisit] = useState(null);
  const [lastVisitLoading, setLastVisitLoading] = useState(false);

  const [dayRows, setDayRows] = useState([]); // صفوف مدمجة: assignment + visit (لو موجودة وكان اليوم ده هو "النهاردة" فعليًا)
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState(null);

  // لو النهاردة أصلاً برّه أيام القالب (خميس/جمعة)، dayKey هترجع null —
  // نبدأ افتراضيًا بالسبت في الحالة دي عشان الـ tabs يكون ليها قيمة دايمًا.
  // بنستنى !weekLoading قبل الـ init (زي RepDashboard.js بالظبط)، عشان
  // منقفلش على القيم المبدئية (week=1, dayKey=null) قبل ما useTodayWeekDay
  // يجيب التاريخ المرجعي الحقيقي من قاعدة البيانات.
  useEffect(() => {
    if (!weekLoading && !initializedSlot) {
      setSelectedWeek(currentWeekNumber);
      setSelectedDay(currentDayKey || "Saturday");
      setInitializedSlot(true);
    }
  }, [weekLoading, initializedSlot, currentWeekNumber, currentDayKey]);

  const isViewingCurrentSlot =
    initializedSlot && selectedWeek === currentWeekNumber && selectedDay === currentDayKey;

  // النهاردة برا القالب (خميس/جمعة). ده بس علم عرض (UI) — مبيغيّرش أي حاجة
  // في computeWeekAndDay أو currentWeekNumber.
  const isHolidayToday = !weekLoading && currentDayKey === null;
  // بيبقى true بس لما الأدمن واقف بالظبط على الـ slot اللي اتفتح تلقائيًا
  // بسبب الإجازة (مش لو اختار يدويًا "السبت" أو أسبوع تاني بنفسه).
  const isViewingHolidayFallback =
    isHolidayToday &&
    initializedSlot &&
    selectedWeek === currentWeekNumber &&
    selectedDay === "Saturday";

  // 1) جلب ليستة المناديب
  useEffect(() => {
    let active = true;
    (async () => {
      setRepsLoading(true);
      setRepsError(null);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "rep")
        .order("full_name", { ascending: true });

      if (!active) return;
      if (error) {
        setRepsError(error.message);
        setReps([]);
      } else {
        setReps(data || []);
        if (!selectedRepId && data && data.length > 0) {
          setSelectedRepId(data[0].id);
        }
      }
      setRepsLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) آخر زيارة مسجلة للمندوب المختار (بغض النظر عن اليوم/الأسبوع المختارين)
  const fetchLastVisit = useCallback(async (repId) => {
    if (!repId) {
      setLastVisit(null);
      return;
    }
    setLastVisitLoading(true);
    const { data, error } = await supabase
      .from("visits")
      .select("id, visit_time, is_true_visit, doctors ( name )")
      .eq("rep_id", repId)
      .order("visit_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("fetchLastVisit error:", error.message);
      setLastVisit(null);
    } else {
      setLastVisit(data || null);
    }
    setLastVisitLoading(false);
  }, []);

  // 3) بيانات الأسبوع/اليوم المختارين: كل الدكاترة المعتمدين (status='approved')
  // في الـ slot ده، سواء كان ده اليوم الحالي فعليًا أو أي يوم تاني من القالب.
  // بيانات الزيارة الفعلية (وقت/دواء/ملاحظات/حالة مطابقة) بتتجاب بس لو الـ
  // slot المختار هو "النهاردة" الحقيقي فعلاً، لأن جدول visits مربوط بتاريخ
  // حقيقي مش بأسبوع/يوم القالب.
  const fetchSlotData = useCallback(async (repId, weekNumber, dayKey, isToday) => {
    if (!repId || !dayKey) {
      setDayRows([]);
      return;
    }
    setDayLoading(true);
    setDayError(null);

    const { data: assignments, error: aErr } = await supabase
      .from("assignments")
      .select("id, doctor_id, doctors ( name, specialty, area, address, class )")
      .eq("rep_id", repId)
      .eq("week_number", weekNumber)
      .eq("day_of_week", dayKey)
      .eq("status", "approved");

    if (aErr) {
      setDayError(aErr.message);
      setDayRows([]);
      setDayLoading(false);
      return;
    }

    let visitsByDoctor = new Map();
    if (isToday) {
      const { data: visits, error: vErr } = await supabase
        .from("visits")
        .select(
          "id, doctor_id, visit_time, is_true_visit, comment, distance_meters, visit_medicines ( medicine:medicines ( name ) )"
        )
        .eq("rep_id", repId)
        .eq("visit_date", getTodayString());

      if (vErr) {
        setDayError(vErr.message);
        setDayRows([]);
        setDayLoading(false);
        return;
      }

      // لو حصل أكتر من زيارة لنفس الدكتور في نفس اليوم، ناخد الأحدث
      (visits || []).forEach((v) => {
        const existing = visitsByDoctor.get(v.doctor_id);
        if (!existing || v.visit_time > existing.visit_time) {
          visitsByDoctor.set(v.doctor_id, v);
        }
      });
    }

    const rows = (assignments || []).map((a) => {
      const v = visitsByDoctor.get(a.doctor_id);
      let statusKey = isToday ? "pending" : null; // null = مفيش بيانات زيارة فعلية (يوم غير اليوم الحالي)
      if (isToday && v) statusKey = v.is_true_visit ? "match" : "mismatch";
      return {
        assignmentId: a.id,
        doctorName: a.doctors?.name || "—",
        doctorSpecialty: a.doctors?.specialty || "—",
        doctorArea: a.doctors?.area || a.doctors?.address || "—",
        doctorClass: getDoctorClass(a.doctors),
        time: v?.visit_time || null,
        medicine:
          (v?.visit_medicines || [])
            .map((vm) => vm.medicine?.name)
            .filter(Boolean)
            .join('، ') || "-",
        comment: v?.comment || "-",
        distance: v?.distance_meters ?? null,
        statusKey,
      };
    });

    // ترتيب: اللي فيها وقت زيارة الأول (الأحدث فالأقدم)، بعدين الباقي بالاسم
    rows.sort((r1, r2) => {
      if (r1.time && r2.time) return new Date(r2.time) - new Date(r1.time);
      if (r1.time) return -1;
      if (r2.time) return 1;
      return r1.doctorName.localeCompare(r2.doctorName, "ar");
    });

    setDayRows(rows);
    setDayLoading(false);
  }, []);

  useEffect(() => {
    fetchLastVisit(selectedRepId);
  }, [selectedRepId, fetchLastVisit]);

  useEffect(() => {
    if (!initializedSlot) return;
    fetchSlotData(selectedRepId, selectedWeek, selectedDay, isViewingCurrentSlot);
  }, [selectedRepId, selectedWeek, selectedDay, isViewingCurrentSlot, initializedSlot, fetchSlotData]);

  const stats = useMemo(() => {
    let matchCount = 0;
    let mismatchCount = 0;
    let pendingCount = 0;
    dayRows.forEach((r) => {
      if (r.statusKey === "match") matchCount += 1;
      else if (r.statusKey === "mismatch") mismatchCount += 1;
      else if (r.statusKey === "pending") pendingCount += 1;
    });
    return { matchCount, mismatchCount, pendingCount };
  }, [dayRows]);

  const selectedRep = reps.find((r) => r.id === selectedRepId) || null;

  function statusLabel(key) {
    if (key === "match") return "مطابقة";
    if (key === "mismatch") return "غير مطابقة";
    if (key === "pending") return "معلّقة";
    return null;
  }

  function statusClass(key) {
    return `dash-status-chip dash-status-chip--${key}`;
  }

  function goToCurrentSlot() {
    setSelectedWeek(currentWeekNumber);
    setSelectedDay(currentDayKey || "Saturday");
  }

  return (
    <div className="admin-dashboard">
      {/* العمود الجانبي: ليستة المناديب */}
      <aside className="card admin-dashboard__sidebar">
        <h3 className="admin-dashboard__sidebar-title">
          <Users size={16} strokeWidth={2.5} />
          المناديب
        </h3>

        {repsLoading && <SkeletonRow count={5} label="جاري تحميل المناديب" />}
        {repsError && <p className="admin-dashboard__error">خطأ: {repsError}</p>}

        {!repsLoading && !repsError && reps.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Users size={20} strokeWidth={2} />
            </span>
            <p className="empty-state__title">مفيش مناديب مسجلين</p>
          </div>
        )}

        <ul className="admin-dashboard__rep-list">
          {reps.map((rep) => (
            <li key={rep.id}>
              <button
                type="button"
                className={
                  "rep-list-item" +
                  (rep.id === selectedRepId ? " rep-list-item--active" : "")
                }
                aria-pressed={rep.id === selectedRepId}
                onClick={() => setSelectedRepId(rep.id)}
              >
                {rep.full_name || "بدون اسم"}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* المحتوى الرئيسي */}
      <main className="admin-dashboard__main">
        {!selectedRep && (
          <div className="card">
            <p>اختار مندوب من الليستة عشان تعرض بياناته.</p>
          </div>
        )}

        {selectedRep && (
          <>
            {isViewingHolidayFallback && (
              <p className="admin-dashboard__note admin-dashboard__note--holiday">
                {HOLIDAY_BANNER_MESSAGE}
              </p>
            )}

            {/* كارت آخر زيارة مسجلة (بغض النظر عن اليوم/الأسبوع المختارين) */}
            <div className="card">
              <h3 className="admin-dashboard__card-title">
                <Clock size={16} strokeWidth={2.5} />
                آخر زيارة مسجلة - {selectedRep.full_name}
              </h3>
              {lastVisitLoading && (
                <div role="status" aria-live="polite">
                  <span className="sr-only">جاري تحميل آخر زيارة</span>
                  <div className="admin-dashboard__last-visit" aria-hidden="true">
                    <div>
                      <div className="admin-dashboard__label">الدكتور</div>
                      <span className="skeleton skeleton-text skeleton-text--lg" />
                    </div>
                    <div>
                      <div className="admin-dashboard__label">التوقيت</div>
                      <span className="skeleton skeleton-text skeleton-text--sm" />
                    </div>
                    <div>
                      <div className="admin-dashboard__label">الحالة</div>
                      <span className="skeleton skeleton-text skeleton-text--sm" />
                    </div>
                  </div>
                </div>
              )}
              {!lastVisitLoading && !lastVisit && (
                <div className="empty-state">
                  <span className="empty-state__icon">
                    <Inbox size={20} strokeWidth={2} />
                  </span>
                  <p className="empty-state__title">مفيش زيارات مسجلة لسه</p>
                </div>
              )}
              {!lastVisitLoading && lastVisit && (
                <div className="admin-dashboard__last-visit">
                  <div>
                    <div className="admin-dashboard__label">الدكتور</div>
                    <div>{lastVisit.doctors?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="admin-dashboard__label">التوقيت</div>
                    <div>{formatDateTime(lastVisit.visit_time)}</div>
                  </div>
                  <div>
                    <div className="admin-dashboard__label">الحالة</div>
                    <span className={statusClass(lastVisit.is_true_visit ? "match" : "mismatch")}>
                      {lastVisit.is_true_visit ? "مطابقة" : "غير مطابقة"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* اختيار الأسبوع (1-4) */}
            <div className="card admin-dashboard__slot-picker">
              <div className="admin-dashboard__slot-picker-row">
                <span className="admin-dashboard__label">الأسبوع:</span>
                <div className="week-tabs">
                  {WEEK_NUMBERS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={"week-tabs__tab" + (selectedWeek === w ? " week-tabs__tab--active" : "")}
                      onClick={() => setSelectedWeek(w)}
                    >
                      أسبوع {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-dashboard__slot-picker-row">
                <span className="admin-dashboard__label">اليوم:</span>
                <div className="day-tabs">
                  {DAYS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={"day-tabs__tab" + (selectedDay === d.key ? " day-tabs__tab--active" : "")}
                      onClick={() => setSelectedDay(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {!isViewingCurrentSlot && (
                <button type="button" className="btn-logout admin-dashboard__today-btn" onClick={goToCurrentSlot}>
                  <RotateCcw size={14} strokeWidth={2.5} />
                  رجوع لليوم الحالي (أسبوع {currentWeekNumber}
                  {currentDayKey ? `، ${dayLabel(currentDayKey)}` : ""})
                </button>
              )}
            </div>

            {/* كروت الإحصائيات — بتظهر بس لو بنعرض اليوم الحالي فعليًا، لأن
                غيره مفيش بيانات زيارة فعلية نحسب منها مطابقة/غير مطابقة */}
            {isViewingCurrentSlot && dayLoading && (
              <SkeletonStatGrid count={3} label="جاري تحميل الإحصائيات" />
            )}
            {isViewingCurrentSlot && !dayLoading && (
              <div className="stat-grid">
                <div className="stat-card stat-card--true">
                  <CheckCircle2 className="stat-card__icon" size={16} strokeWidth={2.5} />
                  <span className="stat-card__value">{stats.matchCount}</span>
                  <span className="stat-card__label">زيارات صحيحة</span>
                </div>
                <div className="stat-card stat-card--false">
                  <XCircle className="stat-card__icon" size={16} strokeWidth={2.5} />
                  <span className="stat-card__value">{stats.mismatchCount}</span>
                  <span className="stat-card__label">غير مطابقة</span>
                </div>
                <div className="stat-card stat-card--pending">
                  <CircleDashed className="stat-card__icon" size={16} strokeWidth={2.5} />
                  <span className="stat-card__value">{stats.pendingCount}</span>
                  <span className="stat-card__label">لسه معلّقة</span>
                </div>
              </div>
            )}

            {/* ليستة تفصيلية للدكاترة المعتمدين في الأسبوع/اليوم المختارين */}
            <div className="card">
              <h3 className="admin-dashboard__card-title">
                دكاترة أسبوع {selectedWeek}
                {selectedDay ? `، ${dayLabel(selectedDay)}` : ""}
                {isViewingCurrentSlot ? " (النهاردة)" : ""}
              </h3>

              {!isViewingCurrentSlot && (
                <p className="admin-dashboard__note">
                  <AlertCircle size={14} strokeWidth={2.25} />
                  ده يوم من القالب المتكرر مش تاريخ حقيقي، فمفيش بيانات زيارة فعلية (وقت/دواء/مطابقة) نعرضها هنا —
                  دي بس ليستة الدكاترة المعتمدين للمندوب في اليوم ده من القالب.
                </p>
              )}

              {dayLoading && <SkeletonRow count={4} label="جاري تحميل قائمة الدكاترة" />}
              {dayError && <p className="admin-dashboard__error">خطأ: {dayError}</p>}
              {!dayLoading && !dayError && dayRows.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state__icon">
                    <Inbox size={20} strokeWidth={2} />
                  </span>
                  <p className="empty-state__title">مفيش دكاترة معتمدين لهذا اليوم</p>
                </div>
              )}

              {!dayLoading && !dayError && dayRows.length > 0 && (
                <div>
                  {dayRows.map((row) => (
                    <div key={row.assignmentId} className="visit-row">
                      <div className="visit-row__doctor">
                        {row.doctorName}
                        {row.doctorClass && (
                          <span className="tag-amber visit-row__class">{row.doctorClass}</span>
                        )}
                      </div>
                      {isViewingCurrentSlot ? (
                        <>
                          <div className="visit-row__time">
                            <Clock size={12} strokeWidth={2.25} />
                            {row.time ? formatTime(row.time) : "-"}
                          </div>
                          <div className="visit-row__medicine">
                            <Pill size={12} strokeWidth={2.25} />
                            {row.medicine}
                          </div>
                          <div className="visit-row__comment">{row.comment}</div>
                          <div className="visit-row__distance">
                            <Ruler size={12} strokeWidth={2.25} />
                            {row.distance !== null ? `${row.distance} م` : "-"}
                          </div>
                          <span className={statusClass(row.statusKey)}>{statusLabel(row.statusKey)}</span>
                        </>
                      ) : (
                        <div className="visit-row__medicine">
                          {row.doctorSpecialty} · {row.doctorArea}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}