"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  UserCog,
  UserPlus,
  UserMinus,
  Search,
  Edit2,
  X,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const YEARS = [1, 2, 3, 4];

function formatAcademicYear(year) {
  if (!year) return "غير محدد";
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || `الفرقة ${num}`;
}

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "42P01") return "جدول admin_scopes غير موجود. شغّل ملف supabase/phase1-scopes.sql أولاً.";
  if (err.code === "23505") return "موجود بالفعل";
  if (
    err.code === "42501" ||
    err.message?.toLowerCase().includes("permission") ||
    err.message?.toLowerCase().includes("row-level security") ||
    err.message?.toLowerCase().includes("policy")
  ) {
    return "ليس لديك صلاحية لهذا الإجراء";
  }
  return "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى.";
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl shadow-xl my-6">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:outline-hidden transition-all";

export default function AdminAccessPage() {
  const [me, setMe] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const [admins, setAdmins] = useState([]);
  const [scopesMap, setScopesMap] = useState({}); // admin_id -> [years]
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Edit modal
  const [editAdmin, setEditAdmin] = useState(null);
  const [editPrimaryYear, setEditPrimaryYear] = useState(1);
  const [editExtraYears, setEditExtraYears] = useState([]);
  const [editError, setEditError] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // Demote confirmation
  const [demoteTarget, setDemoteTarget] = useState(null);
  const [demoting, setDemoting] = useState(false);

  // Promote modal
  const [showPromote, setShowPromote] = useState(false);
  const [promoteQuery, setPromoteQuery] = useState("");
  const [promoteResults, setPromoteResults] = useState([]);
  const [promoteSearching, setPromoteSearching] = useState(false);
  const [promoteError, setPromoteError] = useState(null);
  const [promoteTarget, setPromoteTarget] = useState(null);
  const [promoting, setPromoting] = useState(false);

  const isSuper = me?.role === "admin" && me?.is_super_admin === true;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1) Who is signed in
  useEffect(() => {
    let ignore = false;

    async function loadMe() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (!user) {
          setAuthError("يجب تسجيل الدخول أولاً.");
          setAuthLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, role, is_super_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (ignore) return;
        if (error) throw error;
        setMe(data || null);
      } catch (err) {
        if (!ignore) {
          console.error("Error loading profile:", err);
          setAuthError("تعذر تحميل بيانات الحساب.");
        }
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    }

    loadMe();

    return () => {
      ignore = true;
    };
  }, []);

  // 2) Load admins and their extra years
  const loadAdmins = useCallback(async () => {
    if (!isSuper) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const [adminsRes, scopesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, department, academic_year, is_super_admin, student_badge_id, created_at")
          .eq("role", "admin")
          .order("created_at", { ascending: true })
          .limit(200),
        supabase.from("admin_scopes").select("admin_id, academic_year").limit(1000),
      ]);

      if (adminsRes.error) throw adminsRes.error;
      if (scopesRes.error) throw scopesRes.error;

      setAdmins(adminsRes.data || []);

      const map = {};
      (scopesRes.data || []).forEach((row) => {
        if (!map[row.admin_id]) map[row.admin_id] = [];
        map[row.admin_id].push(Number(row.academic_year));
      });
      Object.keys(map).forEach((key) => map[key].sort((a, b) => a - b));
      setScopesMap(map);
    } catch (err) {
      console.error("Error loading admins:", err);
      setErrorMsg(getDatabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isSuper]);

  useEffect(() => {
    if (!isSuper) return;
    const timer = setTimeout(() => {
      loadAdmins();
    }, 0);
    return () => clearTimeout(timer);
  }, [isSuper, loadAdmins]);

  // 3) Edit an admin: primary year + extra years
  const openEdit = (adminRow) => {
    setEditAdmin(adminRow);
    setEditPrimaryYear(Number(adminRow.academic_year) || 1);
    setEditExtraYears(scopesMap[adminRow.id] || []);
    setEditError(null);
  };

  const toggleExtraYear = (year) => {
    setEditExtraYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  };

  const handleEditSave = async () => {
    if (!editAdmin || editSaving) return;
    setEditSaving(true);
    setEditError(null);

    try {
      const primary = Number(editPrimaryYear);
      if (!YEARS.includes(primary)) {
        setEditError("اختر الفرقة الأساسية.");
        return;
      }

      if (primary !== Number(editAdmin.academic_year)) {
        const { data, error } = await supabase
          .from("profiles")
          .update({ academic_year: primary })
          .eq("id", editAdmin.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          setEditError("لم يتم الحفظ: تعذر تعديل الفرقة الأساسية.");
          return;
        }
      }

      // Extra years never include the primary year (it is always included)
      const desired = [...new Set(editExtraYears.map(Number))].filter((y) => YEARS.includes(y) && y !== primary);
      const current = scopesMap[editAdmin.id] || [];
      const toRemove = current.filter((y) => !desired.includes(y));
      const toAdd = desired.filter((y) => !current.includes(y));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("admin_scopes")
          .delete()
          .eq("admin_id", editAdmin.id)
          .in("academic_year", toRemove);
        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const { data, error } = await supabase
          .from("admin_scopes")
          .insert(toAdd.map((year) => ({ admin_id: editAdmin.id, academic_year: year })))
          .select("id");
        if (error) throw error;
        if (!data || data.length !== toAdd.length) {
          setEditError("لم يتم حفظ كل السنوات الإضافية.");
          return;
        }
      }

      setEditAdmin(null);
      showToast("تم حفظ نطاق الأدمن.");
      await loadAdmins();
    } catch (err) {
      setEditError(getDatabaseErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  // 4) Demote an admin back to a student
  const handleDemote = async () => {
    if (!demoteTarget || demoting) return;
    setDemoting(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ role: "student" })
        .eq("id", demoteTarget.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast("لم يتم التنفيذ: ليس لديك صلاحية.");
        return;
      }

      // Extra years of a non-admin are meaningless: clean them up
      const { error: scopeError } = await supabase.from("admin_scopes").delete().eq("admin_id", demoteTarget.id);
      if (scopeError) console.error("Scope cleanup error:", scopeError);

      setDemoteTarget(null);
      showToast("تم إلغاء صلاحية الأدمن.");
      await loadAdmins();
    } catch (err) {
      showToast(getDatabaseErrorMessage(err));
    } finally {
      setDemoting(false);
    }
  };

  // 5) Promote a student to admin
  const openPromote = () => {
    setPromoteQuery("");
    setPromoteResults([]);
    setPromoteError(null);
    setPromoteTarget(null);
    setShowPromote(true);
  };

  const handleSearchStudents = async () => {
    const term = promoteQuery.trim().replace(/[%,()]/g, " ").trim();
    if (term.length < 2) {
      setPromoteError("اكتب حرفين على الأقل للبحث.");
      return;
    }

    setPromoteSearching(true);
    setPromoteError(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department, academic_year, student_badge_id")
        .eq("role", "student")
        .or(`full_name.ilike.%${term}%,student_badge_id.ilike.%${term}%`)
        .limit(10);

      if (error) throw error;
      setPromoteResults(data || []);
      if (!data || data.length === 0) setPromoteError("لا توجد نتائج مطابقة.");
    } catch (err) {
      setPromoteError(getDatabaseErrorMessage(err));
    } finally {
      setPromoteSearching(false);
    }
  };

  const handlePromote = async () => {
    if (!promoteTarget || promoting) return;
    if (!promoteTarget.department || !YEARS.includes(Number(promoteTarget.academic_year))) {
      setPromoteError("لا يمكن تعيين طالب لم يكمل بيانات القسم والفرقة.");
      return;
    }

    setPromoting(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", promoteTarget.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        setPromoteError("لم يتم التنفيذ: ليس لديك صلاحية.");
        return;
      }

      setShowPromote(false);
      showToast("تم تعيين الأدمن. نطاقه: قسمه وفرقته.");
      await loadAdmins();
    } catch (err) {
      setPromoteError(getDatabaseErrorMessage(err));
    } finally {
      setPromoting(false);
    }
  };

  // ----------------------------------------------------------------------
  // Guards
  // ----------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-3 text-center">
          <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-3 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-xs text-rose-600 leading-relaxed">{authError}</p>
      </div>
    );
  }

  if (!isSuper) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Shield className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">غير مصرح</h2>
          <p className="text-xs text-slate-500 leading-relaxed">هذه الصفحة متاحة للمسؤول الأعلى فقط.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
        >
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 inline-flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            Super Admin
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">Access</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            إدارة المسؤولين: كل أدمن يرى قسمه وفرقته فقط، ويمكنك منحه فرقاً إضافية من نفس قسمه.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            onClick={openPromote}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>تعيين أدمن جديد</span>
          </button>
          <button
            onClick={loadAdmins}
            disabled={loading}
            className="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button onClick={loadAdmins} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Admins list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-xs">
          <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-3">جاري تحميل المسؤولين...</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-xs text-xs text-slate-500">
          لا يوجد مسؤولون.
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map((row) => {
            const extra = scopesMap[row.id] || [];
            const isSelf = row.id === me.id;
            return (
              <div
                key={row.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{row.full_name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        row.is_super_admin
                          ? "bg-violet-50 text-violet-700 border-violet-100"
                          : "bg-blue-50 text-blue-700 border-blue-100"
                      }`}
                    >
                      {row.is_super_admin ? "Super Admin" : "Admin"}
                    </span>
                    {isSelf && <span className="text-[11px] text-slate-400">(أنت)</span>}
                  </div>

                  {row.is_super_admin ? (
                    <p className="text-[11px] text-slate-500">يرى كل الأقسام وكل الفرق.</p>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600">
                      <span>{row.department || "بدون قسم"}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-semibold">
                        {formatAcademicYear(row.academic_year)}
                      </span>
                      {extra.length > 0 && (
                        <span className="text-slate-500">
                          + {extra.map((y) => formatAcademicYear(y)).join("، ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {!row.is_super_admin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(row)}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>النطاق</span>
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => setDemoteTarget(row)}
                        className="p-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                        title="إلغاء صلاحية الأدمن"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit scope modal */}
      {editAdmin && (
        <ModalShell
          title={`نطاق: ${editAdmin.full_name}`}
          subtitle={editAdmin.department || "بدون قسم"}
          onClose={() => !editSaving && setEditAdmin(null)}
        >
          <div className="space-y-4">
            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">الفرقة الأساسية</label>
              <select
                value={editPrimaryYear}
                onChange={(e) => setEditPrimaryYear(Number(e.target.value))}
                className={`${inputClass} cursor-pointer`}
                dir="rtl"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {formatAcademicYear(y)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">فرق إضافية (من نفس القسم)</label>
              <div className="grid grid-cols-2 gap-2">
                {YEARS.filter((y) => y !== Number(editPrimaryYear)).map((y) => (
                  <label
                    key={y}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                      editExtraYears.includes(y)
                        ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editExtraYears.includes(y)}
                      onChange={() => toggleExtraYear(y)}
                      className="accent-blue-600"
                    />
                    {formatAcademicYear(y)}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                يرى الأدمن ويدير بيانات قسمه في الفرقة الأساسية والفرق المحددة هنا فقط.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditAdmin(null)}
                disabled={editSaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {editSaving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Demote confirmation */}
      {demoteTarget && (
        <ModalShell title="إلغاء صلاحية الأدمن؟" onClose={() => !demoting && setDemoteTarget(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                سيعود «{demoteTarget.full_name}» طالباً عادياً ويفقد وصوله لكل صفحات الإدارة وفرقه الإضافية.
              </span>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDemoteTarget(null)}
                disabled={demoting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleDemote}
                disabled={demoting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {demoting ? "جاري التنفيذ..." : "تأكيد"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Promote modal */}
      {showPromote && (
        <ModalShell
          title="تعيين أدمن جديد"
          subtitle="ابحث عن طالب أكمل بياناته، وسيدير قسمه وفرقته فقط."
          onClose={() => !promoting && setShowPromote(false)}
        >
          <div className="space-y-4">
            {promoteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{promoteError}</span>
              </div>
            )}

            {!promoteTarget ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={promoteQuery}
                      onChange={(e) => setPromoteQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearchStudents();
                      }}
                      placeholder="الاسم أو رقم البطاقة..."
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  <button
                    onClick={handleSearchStudents}
                    disabled={promoteSearching}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {promoteSearching ? "..." : "بحث"}
                  </button>
                </div>

                {promoteResults.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {promoteResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setPromoteError(null);
                          setPromoteTarget(s);
                        }}
                        className="w-full text-right p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-900">{s.full_name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {s.department || "بدون قسم"} · {formatAcademicYear(s.academic_year)}
                          {s.student_badge_id ? ` · ${s.student_badge_id}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 text-xs leading-relaxed space-y-1">
                  <p className="font-bold">{promoteTarget.full_name}</p>
                  <p>
                    سيصبح أدمن على: <strong>{promoteTarget.department || "—"}</strong> ·{" "}
                    <strong>{formatAcademicYear(promoteTarget.academic_year)}</strong>
                  </p>
                  <p className="text-blue-800">يمكنك بعد التعيين منحه فرقاً إضافية من زر «النطاق».</p>
                </div>
                <div className="flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => setPromoteTarget(null)}
                    disabled={promoting}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    رجوع
                  </button>
                  <button
                    onClick={handlePromote}
                    disabled={promoting}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {promoting ? "جاري التعيين..." : "تأكيد التعيين"}
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
