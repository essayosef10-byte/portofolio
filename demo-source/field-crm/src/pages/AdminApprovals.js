// src/pages/AdminApprovals.js
//
// صفحة الأدمن لمراجعة "قوالب الزيارات الأسبوعية" اللي بعتها المندوبين،
// طلبات إضافة دكاترة/مستشفيات جديدة، وطلبات تعديل مواقع الدكاترة.
// - كل عنصر في القايمة (تبويب الأسابيع) = أسبوع كامل (كل صفوف status='pending' بتاعة مندوب + رقم أسبوع معيّن)
// - موافقة/رفض بيحصل على مستوى الأسبوع كله دفعة واحدة عن طريق RPC functions:
//   approve_week_plan(p_rep_id, p_week_number) / reject_week_plan(p_rep_id, p_week_number)

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  ArrowLeftRight,
  X,
  Search,
  Inbox,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DAYS, dayLabel, WEEK_NUMBERS } from '../lib/weekTemplate';
import { DOCTOR_CLASS_LABELS } from '../lib/doctorClass';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SkeletonRow } from '../components/Skeletons';
import './AdminApprovals.css';

function repDisplayName(rep) {
  return rep?.full_name || rep?.username || 'مندوب';
}

// بيحوّل timestamp لصيغة تاريخ/وقت عربية واضحة، بترجع '—' لو مفيش قيمة أو
// حصل خطأ في التحويل (زي التنسيق المستخدم بالفعل لطلبات حذف الدكاترة).
function formatRequestDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ar-EG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AdminApprovals() {
  const navigate = useNavigate();

  // "weeks" = مراجعة ليستات الزيارات الأسبوعية (السلوك الأصلي)
  // "submissions" = مراجعة طلبات إضافة دكاترة/مستشفيات جديدة من المناديب
  // "location_requests" = مراجعة طلبات تعديل مواقع دكاترة موجودين بالفعل
  const [viewMode, setViewMode] = useState('weeks');

  const [pendingRows, setPendingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [selectedKey, setSelectedKey] = useState(null);
  const [activeDay, setActiveDay] = useState('Saturday');
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [busy, setBusy] = useState(false);

  // "تعديل مباشر" لأسبوع مُقدَّم — نقل/حذف/إضافة دكتور من غير رفض الأسبوع كله
  const [editMode, setEditMode] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [repDoctors, setRepDoctors] = useState([]);
  const [repDoctorsLoading, setRepDoctorsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveWeek, setMoveWeek] = useState(1);
  const [moveDay, setMoveDay] = useState('Saturday');

  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsError, setSubmissionsError] = useState('');
  const [submissionBusyId, setSubmissionBusyId] = useState(null);

  const [locationRequests, setLocationRequests] = useState([]);
  const [locationRequestsLoading, setLocationRequestsLoading] = useState(true);
  const [locationRequestsError, setLocationRequestsError] = useState('');
  const [locationRequestBusyId, setLocationRequestBusyId] = useState(null);

  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionRequestsLoading, setDeletionRequestsLoading] = useState(true);
  const [deletionRequestsError, setDeletionRequestsError] = useState('');
  const [deletionRequestBusyId, setDeletionRequestBusyId] = useState(null);
  const [rejectingDeletionId, setRejectingDeletionId] = useState(null);
  const [deletionRejectionReason, setDeletionRejectionReason] = useState('');

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('assignments')
      .select(
        `id, rep_id, doctor_id, week_number, day_of_week, status, created_at,
         rep:profiles ( id, full_name, username ),
         doctor:doctors ( id, name, specialty, area, address )`
      )
      .eq('status', 'pending');

    if (fetchError) {
      setError('حصل خطأ في تحميل الأسابيع تحت المراجعة، حاول تاني');
      setLoading(false);
      return;
    }
    setPendingRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // تحديث محلي (مش إعادة تحميل الصفحة كلها) لصفوف pending الخاصة بمندوب معيّن
  // وبأرقام أسابيع معيّنة، بعد أي عملية تعديل مباشر (إضافة/نقل/حذف).
  const refreshRepWeeks = useCallback(async (repId, weekNumbers) => {
    const uniqueWeeks = Array.from(new Set(weekNumbers));
    const { data, error: fetchError } = await supabase
      .from('assignments')
      .select(
        `id, rep_id, doctor_id, week_number, day_of_week, status, created_at,
         rep:profiles ( id, full_name, username ),
         doctor:doctors ( id, name, specialty, area, address )`
      )
      .eq('rep_id', repId)
      .eq('status', 'pending')
      .in('week_number', uniqueWeeks);

    if (fetchError) {
      showBanner('حصل خطأ في تحديث الليستة: ' + fetchError.message, 'error');
      return;
    }

    setPendingRows((prev) => {
      const others = prev.filter(
        (row) => !(row.rep_id === repId && uniqueWeeks.includes(row.week_number))
      );
      return [...others, ...(data || [])];
    });
  }, []);

  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    setSubmissionsError('');
    const { data, error: fetchError } = await supabase
      .from('doctor_submissions')
      .select(
        `id, name, specialty, address, area, class, notes, status, created_at,
         submitted_by, submitter:profiles!doctor_submissions_submitted_by_fkey ( id, full_name, username )`
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) {
      setSubmissionsError('حصل خطأ في تحميل طلبات الدكاترة الجدد، حاول تاني');
      setSubmissionsLoading(false);
      return;
    }
    setSubmissions(data || []);
    setSubmissionsLoading(false);
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const loadLocationRequests = useCallback(async () => {
    setLocationRequestsLoading(true);
    setLocationRequestsError('');
    const { data, error: fetchError } = await supabase
      .from('doctor_location_change_requests')
      .select(
        `id, new_lat, new_lng, status, created_at,
         doctor:doctors ( id, name, area, address, lat, lng ),
         rep:profiles ( id, full_name, username )`
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) {
      setLocationRequestsError('حصل خطأ في تحميل طلبات تعديل المواقع، حاول تاني');
      setLocationRequestsLoading(false);
      return;
    }
    setLocationRequests(data || []);
    setLocationRequestsLoading(false);
  }, []);

  useEffect(() => {
    loadLocationRequests();
  }, [loadLocationRequests]);

  const loadDeletionRequests = useCallback(async () => {
    setDeletionRequestsLoading(true);
    setDeletionRequestsError('');
    const { data, error: fetchError } = await supabase
      .from('doctor_deletion_requests')
      .select(
        `id, reason, status, requested_at,
         doctor:doctors ( id, name, specialty, area, address ),
         requester:profiles!doctor_deletion_requests_rep_id_fkey ( id, full_name, username )`
      )
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (fetchError) {
      setDeletionRequestsError('حصل خطأ في تحميل طلبات حذف الدكاترة، حاول تاني');
      setDeletionRequestsLoading(false);
      return;
    }
    setDeletionRequests(data || []);
    setDeletionRequestsLoading(false);
  }, []);

  useEffect(() => {
    loadDeletionRequests();
  }, [loadDeletionRequests]);

  async function approveSubmission(submissionId) {
    if (submissionBusyId) return;
    setSubmissionBusyId(submissionId);
    const { error: rpcError } = await supabase.rpc('approve_doctor_submission', {
      p_submission_id: submissionId,
    });
    setSubmissionBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في الموافقة على الطلب: ' + rpcError.message, 'error');
      return;
    }
    showBanner('تمت إضافة الدكتور/المستشفى لقاعدة البيانات');
    setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
  }

  async function rejectSubmission(submissionId) {
    if (submissionBusyId) return;
    setSubmissionBusyId(submissionId);
    const { error: rpcError } = await supabase.rpc('reject_doctor_submission', {
      p_submission_id: submissionId,
    });
    setSubmissionBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في رفض الطلب: ' + rpcError.message, 'error');
      return;
    }
    showBanner('اترفض الطلب');
    setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
  }

  async function approveLocationRequest(requestId) {
    if (locationRequestBusyId) return;
    setLocationRequestBusyId(requestId);
    const { error: rpcError } = await supabase.rpc('approve_doctor_location_change_request', {
      p_request_id: requestId,
    });
    setLocationRequestBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في الموافقة على تعديل الموقع: ' + rpcError.message, 'error');
      return;
    }
    showBanner('تم تحديث موقع الدكتور');
    setLocationRequests((prev) => prev.filter((r) => r.id !== requestId));
  }

  async function rejectLocationRequest(requestId) {
    if (locationRequestBusyId) return;
    setLocationRequestBusyId(requestId);
    const { error: rpcError } = await supabase.rpc('reject_doctor_location_change_request', {
      p_request_id: requestId,
    });
    setLocationRequestBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في رفض طلب تعديل الموقع: ' + rpcError.message, 'error');
      return;
    }
    showBanner('اترفض طلب تعديل الموقع، والموقع القديم فضل زي ما هو');
    setLocationRequests((prev) => prev.filter((r) => r.id !== requestId));
  }

  async function approveDeletionRequest(requestId) {
    if (deletionRequestBusyId) return;
    setDeletionRequestBusyId(requestId);
    const { error: rpcError } = await supabase.rpc('approve_doctor_deletion', {
      p_request_id: requestId,
    });
    setDeletionRequestBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في الموافقة على حذف الدكتور: ' + rpcError.message, 'error');
      return;
    }
    showBanner('تم حذف الدكتور نهائيًا');
    loadDeletionRequests();
  }

  function openRejectDeletionRequest(requestId) {
    setRejectingDeletionId(requestId);
    setDeletionRejectionReason('');
  }

  function closeRejectDeletionRequest() {
    setRejectingDeletionId(null);
    setDeletionRejectionReason('');
  }

  async function rejectDeletionRequest(requestId) {
    if (deletionRequestBusyId) return;
    setDeletionRequestBusyId(requestId);
    const { error: rpcError } = await supabase.rpc('reject_doctor_deletion', {
      p_request_id: requestId,
      p_rejection_reason: deletionRejectionReason.trim() || null,
    });
    setDeletionRequestBusyId(null);
    if (rpcError) {
      showBanner('حصل خطأ في رفض طلب الحذف: ' + rpcError.message, 'error');
      return;
    }
    showBanner('اترفض طلب حذف الدكتور');
    setRejectingDeletionId(null);
    setDeletionRejectionReason('');
    loadDeletionRequests();
  }

  // تجميع الصفوف حسب (المندوب + رقم الأسبوع) — كل عنصر = أسبوع مُقدَّم من مندوب واحد.
  // بنحسب كمان earliestCreatedAt (أقدم created_at بين صفوف المجموعة) عشان
  // نعرف إمتى المندوب بدأ يقدّم الأسبوع ده فعليًا.
  const groupedByRepWeek = useMemo(() => {
    const groups = new Map();
    pendingRows.forEach((row) => {
      const key = `${row.rep_id}-${row.week_number}`;
      if (!groups.has(key)) {
        groups.set(key, {
          repId: row.rep_id,
          weekNumber: row.week_number,
          rep: row.rep,
          items: [],
          earliestCreatedAt: row.created_at || null,
        });
      }
      const group = groups.get(key);
      group.items.push(row);
      if (row.created_at && (!group.earliestCreatedAt || row.created_at < group.earliestCreatedAt)) {
        group.earliestCreatedAt = row.created_at;
      }
    });
    return Array.from(groups.values()).sort((a, b) => {
      const repCompare = repDisplayName(a.rep).localeCompare(repDisplayName(b.rep), 'ar');
      if (repCompare !== 0) return repCompare;
      return a.weekNumber - b.weekNumber;
    });
  }, [pendingRows]);

  // نفس المجموعات بس متجمّعة تاني بصريًا تحت اسم كل مندوب (ممكن يكون عنده أكتر من أسبوع مُقدَّم)
  const groupedByRep = useMemo(() => {
    const repGroups = new Map();
    groupedByRepWeek.forEach((weekGroup) => {
      if (!repGroups.has(weekGroup.repId)) {
        repGroups.set(weekGroup.repId, { repId: weekGroup.repId, rep: weekGroup.rep, weeks: [] });
      }
      repGroups.get(weekGroup.repId).weeks.push(weekGroup);
    });
    return Array.from(repGroups.values()).sort((a, b) =>
      repDisplayName(a.rep).localeCompare(repDisplayName(b.rep), 'ar')
    );
  }, [groupedByRepWeek]);

  const selectedGroup = useMemo(
    () => groupedByRepWeek.find((g) => `${g.repId}-${g.weekNumber}` === selectedKey) || null,
    [groupedByRepWeek, selectedKey]
  );

  // لو الأسبوع المفتوح اختفى من القايمة (بعد موافقة/رفض) ارجع تلقائيًا لشاشة القايمة
  useEffect(() => {
    if (selectedKey && !selectedGroup) {
      setSelectedKey(null);
      setConfirmingReject(false);
    }
  }, [selectedKey, selectedGroup]);

  const selectedDayItems = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.items
      .filter((item) => item.day_of_week === activeDay)
      .sort((a, b) => (a.doctor?.name || '').localeCompare(b.doctor?.name || '', 'ar'));
  }, [selectedGroup, activeDay]);

  // لما مودال "إضافة دكتور" يفتح، جيب دكاترة المندوب صاحب الأسبوع ده حصرًا
  // (owner_rep_id = rep الأسبوع المفتوح) مش كل الدكاترة.
  useEffect(() => {
    if (!pickerOpen || !selectedGroup) return;
    let cancelled = false;
    setRepDoctorsLoading(true);
    supabase
      .from('doctors')
      .select('id, name, specialty, area, address')
      .eq('owner_rep_id', selectedGroup.repId)
      .order('name', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          showBanner('حصل خطأ في تحميل دكاترة المندوب: ' + fetchError.message, 'error');
          setRepDoctors([]);
        } else {
          setRepDoctors(data || []);
        }
        setRepDoctorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, selectedGroup?.repId]);

  const editAssignedDoctorIdsInDay = useMemo(
    () => new Set(selectedDayItems.map((item) => item.doctor_id)),
    [selectedDayItems]
  );

  const editPickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return repDoctors
      .filter((d) => !editAssignedDoctorIdsInDay.has(d.id))
      .filter((d) => {
        if (!q) return true;
        return (d.name || '').toLowerCase().includes(q) || (d.area || '').toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [repDoctors, editAssignedDoctorIdsInDay, pickerQuery]);

  const isPickerModalOpen = viewMode === 'weeks' && editMode && pickerOpen && !!selectedGroup;
  const isMoveModalOpen = viewMode === 'weeks' && editMode && !!moveTarget;
  useEscapeKey(() => {
    setPickerOpen(false);
    setPickerQuery('');
  }, isPickerModalOpen);
  useEscapeKey(() => setMoveTarget(null), isMoveModalOpen);

  function showBanner(msg, type = 'success') {
    setBanner({ text: msg, type });
    setTimeout(() => setBanner(null), 3500);
  }

  function openGroup(key) {
    setSelectedKey(key);
    setActiveDay('Saturday');
    setConfirmingReject(false);
    setEditMode(false);
    setPickerOpen(false);
    setPickerQuery('');
    setMoveTarget(null);
  }

  function closeGroup() {
    setSelectedKey(null);
    setConfirmingReject(false);
    setEditMode(false);
    setPickerOpen(false);
    setPickerQuery('');
    setMoveTarget(null);
  }

  async function approveWeek(group) {
    if (busy) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('approve_week_plan', {
      p_rep_id: group.repId,
      p_week_number: group.weekNumber,
    });
    setBusy(false);
    if (rpcError) {
      showBanner('حصل خطأ في الموافقة: ' + rpcError.message, 'error');
      return;
    }
    showBanner(`تمت الموافقة على أسبوع ${group.weekNumber} لـ ${repDisplayName(group.rep)}`);
    loadPending();
  }

  async function rejectWeek(group) {
    if (busy) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('reject_week_plan', {
      p_rep_id: group.repId,
      p_week_number: group.weekNumber,
    });
    setBusy(false);
    if (rpcError) {
      showBanner('حصل خطأ في الرفض: ' + rpcError.message, 'error');
      return;
    }
    showBanner(`اترفض أسبوع ${group.weekNumber} لـ ${repDisplayName(group.rep)}، ورجع فاضي للمندوب`);
    loadPending();
  }

  // === تعديل مباشر (إضافة / نقل / حذف) على أسبوع تحت المراجعة ===
  // بيتطبق فورًا على جدول المندوب عن طريق RPC functions مخصوصة للأدمن،
  // من غير ما يستوجب رفض الأسبوع كله.

  async function adminAddDoctor(doctorId) {
    if (!selectedGroup || editBusy) return;
    setEditBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_add_assignment', {
      p_rep_id: selectedGroup.repId,
      p_doctor_id: doctorId,
      p_week_number: selectedGroup.weekNumber,
      p_day_of_week: activeDay,
    });
    if (rpcError) {
      setEditBusy(false);
      showBanner('حصل خطأ في إضافة الدكتور: ' + rpcError.message, 'error');
      return;
    }
    await refreshRepWeeks(selectedGroup.repId, [selectedGroup.weekNumber]);
    setEditBusy(false);
    setPickerOpen(false);
    setPickerQuery('');
    showBanner('تمت إضافة الدكتور لليوم فورًا في جدول المندوب');
  }

  function openMovePicker(item) {
    setMoveTarget(item);
    setMoveWeek(item.week_number);
    setMoveDay(item.day_of_week);
  }

  async function submitAdminMove() {
    if (!selectedGroup || !moveTarget || editBusy) return;
    setEditBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_move_assignment', {
      p_assignment_id: moveTarget.id,
      p_week_number: moveWeek,
      p_day_of_week: moveDay,
    });
    if (rpcError) {
      setEditBusy(false);
      showBanner('حصل خطأ في نقل الدكتور: ' + rpcError.message, 'error');
      return;
    }
    await refreshRepWeeks(selectedGroup.repId, [selectedGroup.weekNumber, moveWeek]);
    setEditBusy(false);
    setMoveTarget(null);
    showBanner('تم نقل الدكتور فورًا في جدول المندوب');
  }

  async function adminDeleteAssignment(assignmentId) {
    if (!selectedGroup || editBusy) return;
    setEditBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_delete_assignment', {
      p_assignment_id: assignmentId,
    });
    if (rpcError) {
      setEditBusy(false);
      showBanner('حصل خطأ في حذف الدكتور: ' + rpcError.message, 'error');
      return;
    }
    await refreshRepWeeks(selectedGroup.repId, [selectedGroup.weekNumber]);
    setEditBusy(false);
    showBanner('تم حذف الدكتور فورًا من جدول المندوب');
  }

  return (
    <div className="admin-approvals" dir="rtl" lang="ar">
      <button type="button" className="btn-outline admin-approvals__back" onClick={() => navigate('/')}>
        <ArrowRight size={15} strokeWidth={2.5} />
        رجوع للمتابعة
      </button>

      <header className="admin-approvals__header">
        <h1>مراجعة ليستات الزيارات الأسبوعية</h1>
        <p className="admin-approvals__subtitle">
          كل عنصر تحت ده أسبوع كامل بعته مندوب. افتحه وراجعه، وافق أو ارفض الأسبوع كله دفعة واحدة.
        </p>
      </header>

      <div className="admin-approvals__tabs">
        <button
          type="button"
          className={'day-tabs__tab' + (viewMode === 'weeks' ? ' day-tabs__tab--active' : '')}
          onClick={() => setViewMode('weeks')}
        >
          ليستات الأسابيع
        </button>
        <button
          type="button"
          className={'day-tabs__tab' + (viewMode === 'submissions' ? ' day-tabs__tab--active' : '')}
          onClick={() => setViewMode('submissions')}
        >
          طلبات دكاترة جدد{submissions.length > 0 ? ` (${submissions.length})` : ''}
        </button>
        <button
          type="button"
          className={'day-tabs__tab' + (viewMode === 'location_requests' ? ' day-tabs__tab--active' : '')}
          onClick={() => setViewMode('location_requests')}
        >
          طلبات تعديل المواقع{locationRequests.length > 0 ? ` (${locationRequests.length})` : ''}
        </button>
        <button
          type="button"
          className={'day-tabs__tab' + (viewMode === 'deletion_requests' ? ' day-tabs__tab--active' : '')}
          onClick={() => setViewMode('deletion_requests')}
        >
          طلبات حذف الدكاترة{deletionRequests.length > 0 ? ` (${deletionRequests.length})` : ''}
        </button>
      </div>

      {banner && (
        <div className={'admin-approvals__banner' + (banner.type === 'error' ? ' admin-approvals__banner--error' : '')}>
          {banner.text}
        </div>
      )}

      {viewMode === 'submissions' && (
        <div className="submissions-review">
          {submissionsError && (
            <p className="admin-approvals__message admin-approvals__message--error">{submissionsError}</p>
          )}
          {submissionsLoading && <SkeletonRow count={4} label="جاري تحميل الطلبات" />}
          {!submissionsLoading && !submissionsError && submissions.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <CheckCircle2 size={20} strokeWidth={2} />
              </span>
              <p className="empty-state__title">مفيش طلبات دكاترة جدد تحت المراجعة دلوقتي</p>
            </div>
          )}
          {!submissionsLoading && submissions.length > 0 && (
            <div className="week-review__list">
              {submissions.map((s) => (
                <div key={s.id} className="request-card">
                  <div className="request-card__top">
                    <span className="request-card__doctor">{s.name}</span>
                    {s.class && (
                      <span className="tag-amber">{DOCTOR_CLASS_LABELS[s.class] || s.class}</span>
                    )}
                  </div>
                  <p className="request-card__meta">
                    {s.specialty || '—'} · {s.area || s.address || '—'}
                  </p>
                  {s.notes && <p className="request-card__meta">ملاحظات: {s.notes}</p>}
                  <p className="request-card__meta">
                    مقدَّم من: {s.submitter?.full_name || s.submitter?.username || 'مندوب'}
                  </p>
                  <p className="request-card__meta">
                    تاريخ التقديم: {formatRequestDate(s.created_at)}
                  </p>
                  <div className="submissions-review__actions">
                    <button
                      type="button"
                      className="btn-primary submissions-review__approve"
                      disabled={submissionBusyId === s.id}
                      onClick={() => approveSubmission(s.id)}
                    >
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                      موافقة
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-outline--danger"
                      disabled={submissionBusyId === s.id}
                      onClick={() => rejectSubmission(s.id)}
                    >
                      <XCircle size={14} strokeWidth={2.5} />
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'location_requests' && (
        <div className="submissions-review">
          {locationRequestsError && (
            <p className="admin-approvals__message admin-approvals__message--error">
              {locationRequestsError}
            </p>
          )}
          {locationRequestsLoading && <SkeletonRow count={4} label="جاري تحميل طلبات المواقع" />}
          {!locationRequestsLoading && !locationRequestsError && locationRequests.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <CheckCircle2 size={20} strokeWidth={2} />
              </span>
              <p className="empty-state__title">مفيش طلبات تعديل مواقع تحت المراجعة دلوقتي</p>
            </div>
          )}
          {!locationRequestsLoading && locationRequests.length > 0 && (
            <div className="week-review__list">
              {locationRequests.map((r) => (
                <div key={r.id} className="request-card">
                  <div className="request-card__top">
                    <span className="request-card__doctor">{r.doctor?.name || '—'}</span>
                  </div>
                  <p className="request-card__meta">{r.doctor?.area || r.doctor?.address || '—'}</p>
                  <p className="request-card__meta">
                    الموقع الحالي:{' '}
                    {r.doctor?.lat && r.doctor?.lng ? (
                      <a
                        href={`https://www.google.com/maps?q=${r.doctor.lat},${r.doctor.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.doctor.lat.toFixed(5)}, {r.doctor.lng.toFixed(5)}
                      </a>
                    ) : (
                      'غير محدد'
                    )}
                  </p>
                  <p className="request-card__meta">
                    الموقع المطلوب:{' '}
                    <a
                      href={`https://www.google.com/maps?q=${r.new_lat},${r.new_lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.new_lat.toFixed(5)}, {r.new_lng.toFixed(5)}
                    </a>
                  </p>
                  <p className="request-card__meta">
                    مقدَّم من: {r.rep?.full_name || r.rep?.username || 'مندوب'}
                  </p>
                  <p className="request-card__meta">
                    تاريخ التقديم: {formatRequestDate(r.created_at)}
                  </p>
                  <div className="submissions-review__actions">
                    <button
                      type="button"
                      className="btn-primary submissions-review__approve"
                      disabled={locationRequestBusyId === r.id}
                      onClick={() => approveLocationRequest(r.id)}
                    >
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                      موافقة
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-outline--danger"
                      disabled={locationRequestBusyId === r.id}
                      onClick={() => rejectLocationRequest(r.id)}
                    >
                      <XCircle size={14} strokeWidth={2.5} />
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'deletion_requests' && (
        <div className="submissions-review">
          {deletionRequestsError && (
            <p className="admin-approvals__message admin-approvals__message--error">
              {deletionRequestsError}
            </p>
          )}
          {deletionRequestsLoading && <SkeletonRow count={4} label="جاري تحميل طلبات الحذف" />}
          {!deletionRequestsLoading && !deletionRequestsError && deletionRequests.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <CheckCircle2 size={20} strokeWidth={2} />
              </span>
              <p className="empty-state__title">مفيش طلبات حذف دكاترة تحت المراجعة دلوقتي</p>
            </div>
          )}
          {!deletionRequestsLoading && deletionRequests.length > 0 && (
            <div className="week-review__list">
              {deletionRequests.map((r) => (
                <div key={r.id} className="request-card">
                  <div className="request-card__top">
                    <span className="request-card__doctor">{r.doctor?.name || '—'}</span>
                  </div>
                  <p className="request-card__meta">
                    {r.doctor?.specialty || '—'} · {r.doctor?.area || r.doctor?.address || '—'}
                  </p>
                  <p className="request-card__meta">
                    مقدَّم من: {r.requester?.full_name || r.requester?.username || 'مندوب'}
                  </p>
                  <p className="request-card__meta">
                    تاريخ الطلب: {r.requested_at ? new Date(r.requested_at).toLocaleString('ar-EG') : '—'}
                  </p>
                  {r.reason && <p className="request-card__meta">السبب: {r.reason}</p>}

                  {rejectingDeletionId === r.id ? (
                    <div className="reject-box">
                      <p className="reject-box__warning">اكتب سبب رفض طلب حذف الدكتور ده (اختياري):</p>
                      <textarea
                        className="field-input"
                        rows={2}
                        value={deletionRejectionReason}
                        onChange={(e) => setDeletionRejectionReason(e.target.value)}
                        placeholder="سبب الرفض..."
                        disabled={deletionRequestBusyId === r.id}
                      />
                      <div className="reject-box__actions">
                        <button
                          type="button"
                          className="btn-outline btn-outline--danger"
                          disabled={deletionRequestBusyId === r.id}
                          onClick={() => rejectDeletionRequest(r.id)}
                        >
                          <XCircle size={14} strokeWidth={2.5} />
                          تأكيد الرفض
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          disabled={deletionRequestBusyId === r.id}
                          onClick={closeRejectDeletionRequest}
                        >
                          <X size={15} strokeWidth={2.5} />
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="submissions-review__actions">
                      <button
                        type="button"
                        className="btn-primary submissions-review__approve"
                        disabled={deletionRequestBusyId === r.id}
                        onClick={() => approveDeletionRequest(r.id)}
                      >
                        <CheckCircle2 size={14} strokeWidth={2.5} />
                        موافقة
                      </button>
                      <button
                        type="button"
                        className="btn-outline btn-outline--danger"
                        disabled={deletionRequestBusyId === r.id}
                        onClick={() => openRejectDeletionRequest(r.id)}
                      >
                        <XCircle size={14} strokeWidth={2.5} />
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'weeks' && error && (
        <p className="admin-approvals__message admin-approvals__message--error">{error}</p>
      )}
      {viewMode === 'weeks' && loading && <SkeletonRow count={5} label="جاري تحميل الأسابيع" />}

      {viewMode === 'weeks' && !loading && !error && !selectedGroup && groupedByRep.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon">
            <CheckCircle2 size={20} strokeWidth={2} />
          </span>
          <p className="empty-state__title">مفيش أسابيع تحت المراجعة دلوقتي</p>
        </div>
      )}

      {viewMode === 'weeks' && !loading && !selectedGroup && groupedByRep.length > 0 && (
        <div className="week-list">
          {groupedByRep.map((repGroup) => (
            <section key={repGroup.repId || 'unknown'} className="rep-group">
              <h2 className="rep-group__title">{repDisplayName(repGroup.rep)}</h2>
              <div className="rep-group__items">
                {repGroup.weeks.map((weekGroup) => {
                  const key = `${weekGroup.repId}-${weekGroup.weekNumber}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="week-list__item"
                      onClick={() => openGroup(key)}
                    >
                      <span className="week-list__week">أسبوع {weekGroup.weekNumber}</span>
                      <span className="week-list__date">
                        تاريخ التقديم: {formatRequestDate(weekGroup.earliestCreatedAt)}
                      </span>
                      <span className="count-badge">{weekGroup.items.length} دكتور</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {viewMode === 'weeks' && !loading && selectedGroup && (
        <div className="week-review">
          <button type="button" className="btn-outline week-review__back" onClick={closeGroup}>
            ← رجوع للقايمة
          </button>

          <div className="week-review__title-row">
            <h2>
              {repDisplayName(selectedGroup.rep)} — أسبوع {selectedGroup.weekNumber}
            </h2>
            <span className="count-badge">{selectedGroup.items.length} دكتور</span>
          </div>

          <p className="admin-approvals__message">
            تاريخ التقديم: {formatRequestDate(selectedGroup.earliestCreatedAt)}
          </p>

          <div className="week-review__actions">
            <button
              type="button"
              className="btn-primary week-review__approve"
              disabled={busy}
              onClick={() => approveWeek(selectedGroup)}
            >
              موافقة على الأسبوع
            </button>
            <button
              type="button"
              className="btn-outline btn-outline--danger"
              disabled={busy}
              onClick={() => setConfirmingReject(true)}
            >
              رفض الأسبوع
            </button>
            <button
              type="button"
              className="btn-outline"
              disabled={busy}
              onClick={() => {
                setEditMode((prev) => !prev);
                setPickerOpen(false);
                setMoveTarget(null);
              }}
            >
              {editMode ? 'إنهاء التعديل' : 'تعديل الليستة'}
            </button>
          </div>

          {editMode && (
            <div className="reject-box">
              <p className="reject-box__warning">
                ⚠️ أي تعديل بتعمله هنا بيتطبق فورًا على جدول المندوب، حتى قبل ما توافق على الأسبوع.
              </p>
            </div>
          )}

          {confirmingReject && (
            <div className="reject-box">
              <p className="reject-box__warning">
                هيتمسح كل الدكاترة اللي المندوب ضافهم في الأسبوع ده، ويرجع فاضي تمامًا. متأكد؟
              </p>
              <div className="reject-box__actions">
                <button
                  type="button"
                  className="btn-outline btn-outline--danger"
                  disabled={busy}
                  onClick={() => rejectWeek(selectedGroup)}
                >
                  <XCircle size={14} strokeWidth={2.5} />
                  تأكيد الرفض
                </button>
                <button type="button" className="btn-outline" onClick={() => setConfirmingReject(false)}>
                  <X size={15} strokeWidth={2.5} />
                  إلغاء
                </button>
              </div>
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

          <div className="week-review__day">
            {selectedDayItems.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon">
                  <Inbox size={20} strokeWidth={2} />
                </span>
                <p className="empty-state__title">مفيش دكاترة في {dayLabel(activeDay)} في الأسبوع ده</p>
              </div>
            ) : (
              <div className="week-review__list">
                {selectedDayItems.map((item) => (
                  <div key={item.id} className="request-card">
                    <div className="request-card__top">
                      <span className="request-card__doctor">{item.doctor?.name || '—'}</span>
                    </div>
                    <p className="request-card__meta">
                      {item.doctor?.specialty || '—'} · {item.doctor?.area || item.doctor?.address || '—'}
                    </p>
                    {editMode && (
                      <div className="submissions-review__actions">
                        <button
                          type="button"
                          className="btn-outline"
                          disabled={editBusy}
                          onClick={() => openMovePicker(item)}
                        >
                          <ArrowLeftRight size={14} strokeWidth={2.5} />
                          نقل
                        </button>
                        <button
                          type="button"
                          className="btn-outline btn-outline--danger"
                          disabled={editBusy}
                          onClick={() => adminDeleteAssignment(item.id)}
                        >
                          <Trash2 size={14} strokeWidth={2.5} />
                          حذف
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {editMode && (
              <button
                type="button"
                className="btn-outline coverage-day__add-more"
                disabled={editBusy}
                onClick={() => setPickerOpen(true)}
              >
                <Plus size={15} strokeWidth={2.5} />
                إضافة دكتور تاني لليوم ده
              </button>
            )}
          </div>
        </div>
      )}

      {isPickerModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setPickerOpen(false);
            setPickerQuery('');
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-approvals-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-approvals-picker-title">
              إضافة دكتور — أسبوع {selectedGroup.weekNumber}، {dayLabel(activeDay)}
            </h3>
            <p className="admin-approvals__message">
              دكاترة {repDisplayName(selectedGroup.rep)} فقط
            </p>
            <input
              type="text"
              className="field-input"
              placeholder="دوّر بالاسم أو المنطقة..."
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              autoFocus
            />
            <div className="modal-list">
              {repDoctorsLoading && <SkeletonRow count={3} label="جاري تحميل الدكاترة" />}
              {!repDoctorsLoading && editPickerResults.length === 0 && (
                <p className="admin-approvals__message admin-approvals__message--empty">
                  <Search size={14} strokeWidth={2.25} />
                  مفيش نتايج
                </p>
              )}
              {!repDoctorsLoading &&
                editPickerResults.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="modal-list__item"
                    disabled={editBusy}
                    onClick={() => adminAddDoctor(d.id)}
                  >
                    <span className="modal-list__name">{d.name}</span>
                    <span className="modal-list__meta">{d.area || d.address || '—'}</span>
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setPickerOpen(false);
                setPickerQuery('');
              }}
            >
              <X size={15} strokeWidth={2.5} />
              إغلاق
            </button>
          </div>
        </div>
      )}

      {viewMode === 'weeks' && editMode && moveTarget && (
        <div className="modal-overlay" onClick={() => setMoveTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-approvals-move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-approvals-move-title">نقل {moveTarget.doctor?.name}</h3>
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
            <button type="button" className="btn-primary" disabled={editBusy} onClick={submitAdminMove}>
              <ArrowLeftRight size={16} strokeWidth={2.5} />
              تأكيد النقل
            </button>
            <button type="button" className="btn-outline" disabled={editBusy} onClick={() => setMoveTarget(null)}>
              <X size={15} strokeWidth={2.5} />
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}