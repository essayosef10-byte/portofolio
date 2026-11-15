// src/pages/RepCoverage.js

import LoadingScreen from '../components/LoadingScreen';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Plus,
  ArrowLeftRight,
  Trash2,
  Clock,
  Search,
  X,
  CalendarX,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  WEEK_NUMBERS,
  DAYS,
  dayLabel,
  STATUS_LABELS,
  useTodayWeekDay,
} from '../lib/weekTemplate';
import { getDoctorClass } from '../lib/doctorClass';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SkeletonRow } from '../components/Skeletons';
import './RepCoverage.css';

const ASSIGNMENT_SELECT =
  'id, doctor_id, week_number, day_of_week, status, doctor:doctors ( id, name, specialty, address, area, class, rep_notes )';

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function RepCoverage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const activeWeek = useMemo(() => {
    const raw = parseInt(searchParams.get('week'), 10);
    return WEEK_NUMBERS.includes(raw) ? raw : 1;
  }, [searchParams]);

  const activeDay = useMemo(() => {
    const raw = searchParams.get('day');
    return DAYS.some((d) => d.key === raw) ? raw : 'Saturday';
  }, [searchParams]);

  function setActiveWeek(week) {
    const next = new URLSearchParams(searchParams);
    next.set('week', String(week));
    if (!next.get('day')) next.set('day', activeDay);
    setSearchParams(next, { replace: true });
  }

  function setActiveDay(day) {
    const next = new URLSearchParams(searchParams);
    next.set('day', day);
    if (!next.get('week')) next.set('week', String(activeWeek));
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (!searchParams.get('week') || !searchParams.get('day')) {
      const next = new URLSearchParams(searchParams);
      if (!next.get('week')) next.set('week', String(activeWeek));
      if (!next.get('day')) next.set('day', activeDay);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  const [allDoctors, setAllDoctors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [todayVisits, setTodayVisits] = useState({});
  const [dayStartTimes, setDayStartTimes] = useState({});
  const [savingStartTime, setSavingStartTime] = useState(false);
  const [approvedHistoryWeeks, setApprovedHistoryWeeks] = useState(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveWeek, setMoveWeek] = useState(1);
  const [moveDay, setMoveDay] = useState('Saturday');

  const [busy, setBusy] = useState(false);
  const [submittingWeek, setSubmittingWeek] = useState(false);
  const [savingNotesId, setSavingNotesId] = useState(null);

  const [pendingDeletionDoctorIds, setPendingDeletionDoctorIds] = useState(new Set());
  const [deleteRequestTarget, setDeleteRequestTarget] = useState(null);
  const [deleteRequestReason, setDeleteRequestReason] = useState('');
  const [deleteRequestBusy, setDeleteRequestBusy] = useState(false);

  const loadAll = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError('');

    const [doctorsRes, assignmentsRes, visitsRes, startTimesRes, historyRes, deletionRequestsRes] =
      await Promise.all([
        supabase
          .from('doctors')
          .select('id, name, specialty, address, area, class, rep_notes')
          .order('name', { ascending: true }),
        supabase.from('assignments').select(ASSIGNMENT_SELECT).eq('rep_id', profile.id),
        supabase
          .from('visits')
          .select('doctor_id, arrival_status')
          .eq('rep_id', profile.id)
          .eq('visit_date', getTodayString()),
        supabase
          .from('day_start_times')
          .select('week_number, day_of_week, start_time')
          .eq('rep_id', profile.id),
        supabase.from('week_approval_history').select('week_number').eq('rep_id', profile.id),
        supabase.from('doctor_deletion_requests').select('doctor_id').eq('status', 'pending'),
      ]);

    if (doctorsRes.error || assignmentsRes.error || visitsRes.error || startTimesRes.error) {
      setError('حصل خطأ في تحميل البيانات، حاول تاني');
      setLoading(false);
      return;
    }

    setAllDoctors(doctorsRes.data || []);
    setAssignments(assignmentsRes.data || []);
    setApprovedHistoryWeeks(new Set((historyRes.data || []).map((row) => row.week_number)));
    setPendingDeletionDoctorIds(
      new Set((deletionRequestsRes.data || []).map((row) => row.doctor_id))
    );

    const vMap = {};
    (visitsRes.data || []).forEach((v) => {
      if (!vMap[v.doctor_id]) vMap[v.doctor_id] = [];
      vMap[v.doctor_id].push(v);
    });
    setTodayVisits(vMap);

    const stMap = {};
    (startTimesRes.data || []).forEach((row) => {
      stMap[`${row.week_number}_${row.day_of_week}`] = (row.start_time || '').slice(0, 5);
    });
    setDayStartTimes(stMap);

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const { weekNumber: todayWeek, dayKey: todayDayKey } = useTodayWeekDay();

  const isActiveWeekPreApproved = approvedHistoryWeeks.has(activeWeek);

  const weekAssignments = useMemo(
    () => assignments.filter((a) => a.week_number === activeWeek),
    [assignments, activeWeek]
  );

  const weekIsEmpty = weekAssignments.length === 0;

  const activeStartTime = dayStartTimes[`${activeWeek}_${activeDay}`] || '';

  const weekDraftCount = useMemo(
    () => weekAssignments.filter((a) => a.status === 'draft').length,
    [weekAssignments]
  );

  const dayAssignments = useMemo(
    () =>
      weekAssignments
        .filter((a) => a.day_of_week === activeDay)
        .sort((a, b) => (a.doctor?.name || '').localeCompare(b.doctor?.name || '', 'ar')),
    [weekAssignments, activeDay]
  );

  const assignedDoctorIdsInSlot = useMemo(
    () => new Set(dayAssignments.map((a) => a.doctor_id)),
    [dayAssignments]
  );

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allDoctors
      .filter((d) => !assignedDoctorIdsInSlot.has(d.id))
      .filter((d) => {
        if (!q) return true;
        return (d.name || '').toLowerCase().includes(q) || (d.area || '').toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [allDoctors, assignedDoctorIdsInSlot, pickerQuery]);

  function getVisitStatus(doctorId) {
    const visits = todayVisits[doctorId];
    if (!visits || visits.length === 0) return null;
    if (visits.some((v) => v.arrival_status === 'arrived')) return 'true_visit';
    if (visits.some((v) => v.arrival_status === 'false_visit')) return 'false_visit';
    return null;
  }

  function showBanner(msg, type = 'success') {
    setBanner({ text: msg, type });
    setTimeout(() => setBanner(null), 3500);
  }

  function handleNoteChange(assignmentId, value) {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id === assignmentId) {
          return { ...a, doctor: { ...a.doctor, rep_notes: value } };
        }
        return a;
      })
    );
  }

  async function saveDoctorNotes(assignmentId, doctorId, notes) {
    setSavingNotesId(assignmentId);
    const { error: notesError } = await supabase
      .from('doctors')
      .update({ rep_notes: notes })
      .eq('id', doctorId);

    setSavingNotesId(null);
    if (notesError) {
      showBanner('حصل خطأ في حفظ الملاحظة', 'error');
      return;
    }
    setAllDoctors((prev) =>
      prev.map((d) => (d.id === doctorId ? { ...d, rep_notes: notes } : d))
    );
  }

  async function addDoctor(doctorId) {
    if (!profile?.id || busy) return;
    setBusy(true);
    const { data, error: insertError } = await supabase
      .from('assignments')
      .insert({
        rep_id: profile.id,
        doctor_id: doctorId,
        week_number: activeWeek,
        day_of_week: activeDay,
        status: isActiveWeekPreApproved ? 'approved' : 'draft',
      })
      .select(ASSIGNMENT_SELECT)
      .single();
    setBusy(false);

    if (insertError) {
      showBanner('حصل خطأ في الإضافة، حاول تاني', 'error');
      return;
    }
    setAssignments((prev) => [...prev, data]);
    setPickerOpen(false);
    setPickerQuery('');
  }

  async function deleteDoctor(assignmentId) {
    if (busy) return;
    setBusy(true);
    const { data, error: deleteError } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId)
      .select('id');
    setBusy(false);

    if (deleteError || !data || data.length === 0) {
      showBanner('حصل خطأ في الحذف، تحقق وحاول تاني', 'error');
      loadAll();
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  }

  async function updateDayStartTime(value) {
    if (!profile?.id) return;
    const key = `${activeWeek}_${activeDay}`;
    setDayStartTimes((prev) => ({ ...prev, [key]: value }));
    setSavingStartTime(true);
    const { error: upsertError } = await supabase.from('day_start_times').upsert(
      {
        rep_id: profile.id,
        week_number: activeWeek,
        day_of_week: activeDay,
        start_time: value || null,
      },
      { onConflict: 'rep_id,week_number,day_of_week' }
    );
    setSavingStartTime(false);
    if (upsertError) {
      showBanner('حصل خطأ في حفظ معاد البداية، حاول تاني', 'error');
    }
  }

  function openMovePicker(assignment) {
    setMoveTarget(assignment);
    setMoveWeek(assignment.week_number);
    setMoveDay(assignment.day_of_week);
  }

  async function submitMove() {
    if (!moveTarget || busy) return;
    setBusy(true);
    const destinationPreApproved = approvedHistoryWeeks.has(moveWeek);
    const nextStatus = destinationPreApproved
      ? 'approved'
      : moveTarget.status === 'approved'
      ? 'draft'
      : moveTarget.status;
    const { data, error: updateError } = await supabase
      .from('assignments')
      .update({ week_number: moveWeek, day_of_week: moveDay, status: nextStatus })
      .eq('id', moveTarget.id)
      .select(ASSIGNMENT_SELECT)
      .single();
    setBusy(false);

    if (updateError || !data) {
      showBanner('حصل خطأ في النقل، تحقق وحاول تاني', 'error');
      loadAll();
      return;
    }
    setAssignments((prev) => prev.map((a) => (a.id === data.id ? data : a)));
    setMoveTarget(null);
  }

  async function submitWeek() {
    if (!profile?.id || submittingWeek || weekDraftCount === 0) return;
    setSubmittingWeek(true);
    const { data, error: updateError } = await supabase
      .from('assignments')
      .update({ status: 'pending' })
      .eq('rep_id', profile.id)
      .eq('week_number', activeWeek)
      .eq('status', 'draft')
      .select(ASSIGNMENT_SELECT);
    setSubmittingWeek(false);

    if (updateError) {
      showBanner('حصل خطأ في الإرسال، حاول تاني', 'error');
      return;
    }
    const updatedById = new Map((data || []).map((row) => [row.id, row]));
    setAssignments((prev) => prev.map((a) => updatedById.get(a.id) || a));
    showBanner(`تم إرسال أسبوع ${activeWeek} للأدمن، في انتظار المراجعة`);
  }

  function openDeleteRequest(assignment) {
    setDeleteRequestTarget(assignment);
    setDeleteRequestReason('');
  }

  function closeDeleteRequest() {
    if (deleteRequestBusy) return;
    setDeleteRequestTarget(null);
    setDeleteRequestReason('');
  }

  useEscapeKey(() => setPickerOpen(false), pickerOpen);
  useEscapeKey(() => setMoveTarget(null), !!moveTarget);
  useEscapeKey(closeDeleteRequest, !!deleteRequestTarget);

  async function submitDeleteRequest() {
    if (!deleteRequestTarget || deleteRequestBusy) return;
    setDeleteRequestBusy(true);
    const { error: rpcError } = await supabase.rpc('request_doctor_deletion', {
      p_doctor_id: deleteRequestTarget.doctor_id,
      p_reason: deleteRequestReason.trim() || null,
    });
    setDeleteRequestBusy(false);

    if (rpcError) {
      showBanner('حصل خطأ في إرسال طلب الحذف: ' + rpcError.message, 'error');
      return;
    }
    setPendingDeletionDoctorIds((prev) => new Set(prev).add(deleteRequestTarget.doctor_id));
    setDeleteRequestTarget(null);
    setDeleteRequestReason('');
    showBanner('تم إرسال طلب الحذف للأدمن');
  }

  if (!profile) {
    return (
      <div className="rep-coverage" dir="rtl" lang="ar">
        <LoadingScreen inline label="جاري التحقق من الحساب" />
      </div>
    );
  }

  return (
    <div className="rep-coverage" dir="rtl" lang="ar">
      <button type="button" className="btn-outline rep-coverage__back" onClick={() => navigate('/')}>
        <ArrowRight size={15} strokeWidth={2.5} />
        رجوع لزياراتي
      </button>

      <header className="rep-coverage__header">
        <h1>ليستة الزيارات الأسبوعية</h1>
        <p className="rep-coverage__subtitle">
          وزّع الـ{allDoctors.length || 109} دكتور على 4 أسابيع × 5 أيام. عدّل بحرية وفورية، ولما
          تخلص ابعت الأسبوع كامل للأدمن بزرار واحد.
        </p>
      </header>

      {banner && (
        <div className={'rep-coverage__banner' + (banner.type === 'error' ? ' rep-coverage__banner--error' : '')}>
          {banner.text}
        </div>
      )}
      {error && <p className="rep-coverage__message rep-coverage__message--error">{error}</p>}

      <div className="week-tabs">
        {WEEK_NUMBERS.map((w) => (
          <button
            key={w}
            type="button"
            className={'week-tabs__tab' + (activeWeek === w ? ' week-tabs__tab--active' : '')}
            onClick={() => setActiveWeek(w)}
          >
            أسبوع {w}
          </button>
        ))}
      </div>

      {!loading && isActiveWeekPreApproved && (
        <div className="week-submit-bar week-submit-bar--info">
          <span className="week-submit-bar__hint">
            <CheckCircle2 size={15} strokeWidth={2.5} />
            أسبوع {activeWeek} اتوافق عليه قبل كده — التعديلات في الأسبوع ده بتتطبّق فورًا من غير ما تحتاج ترسله للأدمن تاني.
          </span>
        </div>
      )}

      {!loading && !isActiveWeekPreApproved && (
        <div className="week-submit-bar">
          <span className="week-submit-bar__hint">
            {weekDraftCount > 0
              ? `عندك ${weekDraftCount} تغيير لسه متبعتش للأدمن`
              : 'كل تغييرات الأسبوع ده متبعتة أو مفيش تغييرات جديدة'}
          </span>
          <button
            type="button"
            className={
              submittingWeek ? 'btn-primary week-submit-bar__btn is-loading' : 'btn-primary week-submit-bar__btn'
            }
            disabled={weekDraftCount === 0 || submittingWeek}
            onClick={submitWeek}
          >
            {submittingWeek ? 'جاري الإرسال...' : 'إرسال الأسبوع للأدمن'}
          </button>
        </div>
      )}

      {loading && <SkeletonRow count={5} label="جاري تحميل التغطية" />}

      {!loading && (
        <>
          {weekIsEmpty && (
            <div className="coverage-week-empty">
              <p className="coverage-week-empty__title">أسبوع {activeWeek} لسه فاضي تمامًا</p>
              <p className="coverage-week-empty__hint">اختار يوم من تحت وابدأ ضيف الدكاترة اللي عايز تزورهم.</p>
            </div>
          )}

          <div className="day-tabs">
            {DAYS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={'day-tabs__tab' + (activeDay === d.key ? ' day-tabs__tab--active' : '')}
                onClick={() => setActiveDay(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="day-start-time">
            <label className="field-label day-start-time__label" htmlFor="day-start-time-input">
              <Clock size={14} strokeWidth={2.5} />
              معاد بداية اليوم
            </label>
            <input
              id="day-start-time-input"
              type="time"
              className="field-input day-start-time__input"
              value={activeStartTime}
              onChange={(e) => updateDayStartTime(e.target.value)}
            />
            {savingStartTime && <span className="day-start-time__saving">جاري الحفظ...</span>}
          </div>

          <div className="coverage-day">
            {dayAssignments.length === 0 ? (
              <div className="coverage-day__empty empty-state">
                <span className="empty-state__icon">
                  <CalendarX size={20} strokeWidth={2} />
                </span>
                <p className="empty-state__title">
                  مفيش دكاترة متعيّنين في {dayLabel(activeDay)} — أسبوع {activeWeek} لسه
                </p>
                <button
                  type="button"
                  className="btn-primary coverage-day__empty-btn"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  إضافة دكاترة لليوم ده
                </button>
              </div>
            ) : (
              <>
                <div className="coverage-day__list">
                  {dayAssignments.map((a) => {
                    const isLocked = a.status === 'pending';
                    const visitStatus = getVisitStatus(a.doctor_id);
                    return (
                      <div key={a.id} className="coverage-card">
                        <div className="coverage-card__info">
                          <h3 className="coverage-card__name">{a.doctor?.name}</h3>
                          <p className="coverage-card__meta">
                            {a.doctor?.specialty || '—'} · {a.doctor?.area || a.doctor?.address || '—'}
                          </p>
                          <div className="coverage-card__tags">
                            {getDoctorClass(a.doctor) && (
                              <span className="tag-amber">{getDoctorClass(a.doctor)}</span>
                            )}
                            {a.status !== 'approved' && (
                              <span className="tag-amber">{STATUS_LABELS[a.status]}</span>
                            )}
                            {activeWeek === todayWeek && activeDay === todayDayKey && visitStatus && (
                              <span
                                className={
                                  'coverage-status-chip ' +
                                  (visitStatus === 'true_visit' ? 'coverage-status-chip--green' : 'coverage-status-chip--red')
                                }
                              >
                                {visitStatus === 'true_visit' ? 'تمت الزيارة النهاردة' : 'موقع غير مطابق'}
                              </span>
                            )}
                          </div>

                          <div className="coverage-card__notes">
                            <label className="coverage-card__notes-label" htmlFor={`notes-${a.id}`}>
                              ملاحظات / تفاصيل الحجز {savingNotesId === a.id && '(جاري الحفظ...)'}
                            </label>
                            <textarea
                              id={`notes-${a.id}`}
                              className="field-input coverage-card__notes-input"
                              rows={2}
                              value={a.doctor?.rep_notes || ''}
                              disabled={isLocked}
                              onChange={(e) => handleNoteChange(a.id, e.target.value)}
                              onBlur={(e) => saveDoctorNotes(a.id, a.doctor.id, e.target.value)}
                              placeholder="اكتب ملاحظات الحجز هنا..."
                            />
                          </div>
                        </div>
                        <div className="coverage-card__actions">
                          <button
                            type="button"
                            className="btn-outline"
                            disabled={isLocked || busy}
                            onClick={() => openMovePicker(a)}
                          >
                            <ArrowLeftRight size={14} strokeWidth={2.5} />
                            نقل
                          </button>
                          <button
                            type="button"
                            className="btn-outline btn-outline--danger"
                            disabled={isLocked || busy}
                            onClick={() => deleteDoctor(a.id)}
                          >
                            <Trash2 size={14} strokeWidth={2.5} />
                            حذف
                          </button>
                        </div>
                        <div className="coverage-card__actions">
                          <button
                            type="button"
                            className="btn-outline btn-outline--danger coverage-card__request-delete"
                            disabled={pendingDeletionDoctorIds.has(a.doctor_id) || deleteRequestBusy}
                            onClick={() => openDeleteRequest(a)}
                          >
                            {pendingDeletionDoctorIds.has(a.doctor_id)
                              ? 'طلب الحذف قيد المراجعة'
                              : 'طلب حذف نهائي'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn-outline coverage-day__add-more"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus size={15} strokeWidth={2.5} />
                  إضافة دكتور تاني لليوم ده
                </button>
              </>
            )}
          </div>
        </>
      )}

      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rep-coverage-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rep-coverage-picker-title">
              إضافة دكتور — أسبوع {activeWeek}، {dayLabel(activeDay)}
            </h3>
            <input
              type="text"
              className="field-input"
              placeholder="دوّر بالاسم أو المنطقة..."
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              autoFocus
            />
            <div className="modal-list">
              {pickerResults.length === 0 && (
                <p className="rep-coverage__message rep-coverage__message--empty">
                  <Search size={14} strokeWidth={2.25} />
                  مفيش نتايج
                </p>
              )}
              {pickerResults.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="modal-list__item"
                  disabled={busy}
                  onClick={() => addDoctor(d.id)}
                >
                  <span className="modal-list__name">{d.name}</span>
                  <span className="modal-list__meta">{d.area || d.address || '—'}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn-outline" onClick={() => setPickerOpen(false)}>
              <X size={15} strokeWidth={2.5} />
              إغلاق
            </button>
          </div>
        </div>
      )}

      {moveTarget && (
        <div className="modal-overlay" onClick={() => setMoveTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rep-coverage-move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rep-coverage-move-title">نقل {moveTarget.doctor?.name}</h3>
            <label className="field-label">الأسبوع الجديد</label>
            <div className="week-tabs">
              {WEEK_NUMBERS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={'week-tabs__tab' + (moveWeek === w ? ' week-tabs__tab--active' : '')}
                  onClick={() => setMoveWeek(w)}
                >
                  أسبوع {w}
                </button>
              ))}
            </div>
            <label className="field-label">اليوم الجديد</label>
            <div className="day-tabs">
              {DAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={'day-tabs__tab' + (moveDay === d.key ? ' day-tabs__tab--active' : '')}
                  onClick={() => setMoveDay(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {approvedHistoryWeeks.has(moveWeek) ? (
              <p className="modal-note">أسبوع {moveWeek} سبق اعتماده — النقل هيتطبّق فورًا من غير مراجعة.</p>
            ) : (
              moveTarget.status === 'approved' && (
                <p className="modal-note">
                  الدكتور ده معتمد حاليًا — النقل هيحوّله لمسودة لحد ما تبعت الأسبوع تاني وتوافق الإدارة.
                </p>
              )
            )}
            <button type="button" className="btn-primary" disabled={busy} onClick={submitMove}>
              <ArrowLeftRight size={16} strokeWidth={2.5} />
              تأكيد النقل
            </button>
            <button type="button" className="btn-outline" onClick={() => setMoveTarget(null)}>
              <X size={15} strokeWidth={2.5} />
              إلغاء
            </button>
          </div>
        </div>
      )}

      {deleteRequestTarget && (
        <div className="modal-overlay" onClick={closeDeleteRequest}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rep-coverage-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rep-coverage-delete-title">طلب حذف نهائي — {deleteRequestTarget.doctor?.name}</h3>
            <p className="modal-note">
              ده حذف نهائي: بعد ما الأدمن يوافق، الدكتور هيتمسح من كل الأسابيع وسجل الزيارات
              الخاصة بيه بالكامل. الطلب مش هيتنفذ إلا بعد موافقة الأدمن.
            </p>
            <label className="field-label" htmlFor="delete-request-reason">
              سبب الطلب (اختياري)
            </label>
            <textarea
              id="delete-request-reason"
              className="field-input"
              rows={3}
              value={deleteRequestReason}
              onChange={(e) => setDeleteRequestReason(e.target.value)}
              placeholder="اكتب سبب طلب الحذف هنا..."
              disabled={deleteRequestBusy}
            />
            <button
              type="button"
              className={
                deleteRequestBusy
                  ? 'btn-outline btn-outline--danger is-loading'
                  : 'btn-outline btn-outline--danger'
              }
              disabled={deleteRequestBusy}
              onClick={submitDeleteRequest}
            >
              <Trash2 size={15} strokeWidth={2.5} />
              {deleteRequestBusy ? 'جاري الإرسال...' : 'تأكيد الطلب'}
            </button>
            <button type="button" className="btn-outline" disabled={deleteRequestBusy} onClick={closeDeleteRequest}>
              <X size={15} strokeWidth={2.5} />
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}