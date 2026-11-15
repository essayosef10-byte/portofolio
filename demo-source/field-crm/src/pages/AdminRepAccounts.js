// src/pages/AdminRepAccounts.js
//
// صفحة الأدمن لإنشاء حساب مندوب جديد.
// - بتستدعي Supabase Edge Function اسمها "create-rep" (شغالة على السيرفر
//   بصلاحية service_role) عشان تنشئ مستخدم Auth جديد. مينفعش ده يتعمل من
//   كود React العادي مباشرة لأسباب أمان (الـ anon key مش عنده صلاحية كافية).
// - الـ Edge Function بتتحقق بنفسها إن اللي بينادي عليها أدمن فعلاً.

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Users, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getInitials } from '../utils/initials';
import { SkeletonRow } from '../components/Skeletons';
import './AdminRepAccounts.css';

async function extractFunctionErrorMessage(fnError) {
  const fallback = 'حصل خطأ، حاول تاني';
  if (!fnError) return fallback;
  try {
    if (fnError.context && typeof fnError.context.json === 'function') {
      const body = await fnError.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // مفيش تفاصيل إضافية من السيرفر، هنكتفي بالرسالة العامة
  }
  return fnError.message || fallback;
}

export default function AdminRepAccounts() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ============ ليستة المناديب الحاليين + الحذف ============
  const [reps, setReps] = useState([]);
  const [repsLoading, setRepsLoading] = useState(true);
  const [repsError, setRepsError] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadReps = useCallback(async () => {
    setRepsLoading(true);
    setRepsError('');
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .eq('role', 'rep')
      .order('full_name', { ascending: true });

    if (fetchError) {
      setRepsError('حصل خطأ في تحميل ليستة المناديب، حاول تاني');
      setRepsLoading(false);
      return;
    }
    setReps(data || []);
    setRepsLoading(false);
  }, []);

  useEffect(() => {
    loadReps();
  }, [loadReps]);

  async function handleDeleteRep(rep) {
    if (deletingId) return;
    setDeletingId(rep.id);
    setError('');
    const { data, error: fnError } = await supabase.functions.invoke('delete-rep', {
      body: { user_id: rep.id },
    });
    setDeletingId(null);

    if (fnError) {
      setError(await extractFunctionErrorMessage(fnError));
      return;
    }
    if (!data?.success) {
      setError(data?.error || 'حصل خطأ في حذف الحساب، حاول تاني');
      return;
    }

    setReps((prev) => prev.filter((r) => r.id !== rep.id));
    setConfirmingDeleteId(null);
    setSuccessMsg(`اتحذف حساب "${rep.full_name || rep.username}" نهائيًا`);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanUsername = username.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (!cleanUsername || !password || !cleanFullName) {
      setError('من فضلك املأ اسم المستخدم وكلمة المرور والاسم الكامل');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور لازم تكون 6 حروف/أرقام على الأقل');
      return;
    }

    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke('create-rep', {
      body: { username: cleanUsername, password, full_name: cleanFullName },
    });
    setSubmitting(false);

    if (fnError) {
      setError(await extractFunctionErrorMessage(fnError));
      return;
    }
    if (!data?.success) {
      setError(data?.error || 'حصل خطأ في إنشاء الحساب، حاول تاني');
      return;
    }

    setSuccessMsg(`تم إنشاء حساب "${data.full_name}" (${data.username}) بنجاح`);
    setUsername('');
    setPassword('');
    setFullName('');
    loadReps();
  }

  return (
    <div className="admin-rep-accounts" dir="rtl" lang="ar">
      <header className="admin-rep-accounts__header">
        <h1>حسابات المناديب</h1>
        <p className="admin-rep-accounts__subtitle">
          أنشئ حساب دخول جديد لمندوب — هيقدر يدخل بنفس اسم المستخدم وكلمة السر دول على طول.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="admin-rep-accounts__banner">{successMsg}</div>}

      <form className="card admin-rep-accounts__form" onSubmit={handleSubmit}>
        <h2 className="admin-rep-accounts__form-title">
          <UserPlus size={16} strokeWidth={2.5} />
          حساب مندوب جديد
        </h2>

        <label className="field-label" htmlFor="new-rep-username">
          اسم المستخدم
        </label>
        <input
          id="new-rep-username"
          className="field-input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="مثلاً: ahmed"
          autoComplete="off"
        />

        <label className="field-label" htmlFor="new-rep-password">
          كلمة المرور
        </label>
        <input
          id="new-rep-password"
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6 حروف/أرقام على الأقل"
          autoComplete="new-password"
        />

        <label className="field-label" htmlFor="new-rep-fullname">
          الاسم الكامل
        </label>
        <input
          id="new-rep-fullname"
          className="field-input"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="مثلاً: أحمد محمد"
          autoComplete="off"
        />

        <button
          className={submitting ? 'btn-primary is-loading' : 'btn-primary'}
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
        </button>
      </form>

      <section className="admin-rep-accounts__list-section">
        <h2 className="admin-rep-accounts__list-title">
          <Users size={16} strokeWidth={2.5} />
          المناديب الحاليين
        </h2>

        {repsLoading && <SkeletonRow count={4} label="جاري تحميل المناديب" />}
        {repsError && <p className="admin-rep-accounts__message admin-rep-accounts__message--error">{repsError}</p>}
        {!repsLoading && !repsError && reps.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Users size={20} strokeWidth={2} />
            </span>
            <p className="empty-state__title">مفيش مناديب مسجلين لسه</p>
          </div>
        )}

        {!repsLoading && reps.length > 0 && (
          <div className="rep-account-list">
            {reps.map((rep) => (
              <div key={rep.id} className="rep-account-card">
                <div className="rep-account-card__identity">
                  <span className="avatar-badge avatar-badge--sm" aria-hidden="true">
                    {getInitials(rep.full_name || rep.username)}
                  </span>
                  <div className="rep-account-card__info">
                    <span className="rep-account-card__name">{rep.full_name || 'بدون اسم'}</span>
                    <span className="rep-account-card__username">{rep.username}</span>
                  </div>
                </div>

                {confirmingDeleteId === rep.id ? (
                  <div className="rep-account-card__confirm">
                    <span className="rep-account-card__confirm-text">الحذف نهائي، متأكد؟</span>
                    <button
                      type="button"
                      className={
                        deletingId === rep.id
                          ? 'btn-outline btn-outline--danger is-loading'
                          : 'btn-outline btn-outline--danger'
                      }
                      disabled={deletingId === rep.id}
                      onClick={() => handleDeleteRep(rep)}
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                      {deletingId === rep.id ? 'جاري الحذف...' : 'تأكيد الحذف'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={deletingId === rep.id}
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      <X size={14} strokeWidth={2.5} />
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-outline btn-outline--danger"
                    onClick={() => setConfirmingDeleteId(rep.id)}
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
