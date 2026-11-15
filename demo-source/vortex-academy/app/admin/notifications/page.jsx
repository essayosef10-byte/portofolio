"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Megaphone,
  Plus,
  X,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Shield,
  Send,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadAllowedYears } from "@/lib/adminScope";

const DEPARTMENTS = [
  "كيمياء حيوي وكيمياء",
  "ميكروبيولوجي وكيمياء",
  "علم الحيوان وكيمياء",
  "نبات وكيمياء",
  "علوم البيئة وكيمياء",
  "الجيولوجيا والكيمياء",
  "علم النبات",
  "العلوم البيئية",
  "علم الحيوان",
  "الكيمياء",
  "علوم الحاسب",
  "الفيزياء والحاسب",
  "الفيزياء",
  "الرياضيات",
  "البيولوجيا الجزيئية",
  "التكنولوجيا الحيوية",
  "جيولوجيا البترول والتعدين",
];

// Must match the CHECK constraint on notifications.type
const TYPE_LABELS = {
  cancellation: "إلغاء محاضرة",
  makeup: "تعويض محاضرة",
  equipment: "تجهيزات",
  announcement: "إعلان",
};

const TYPE_STYLES = {
  cancellation: "bg-rose-50 text-rose-700 border-rose-100",
  makeup: "bg-emerald-50 text-emerald-700 border-emerald-100",
  equipment: "bg-amber-50 text-amber-700 border-amber-100",
  announcement: "bg-blue-50 text-blue-700 border-blue-100",
};

const EMPTY_FORM = {
  type: "announcement",
  title: "",
  body: "",
  department: "", // "" = all departments (super admin only)
  year: "", // "" = all years
};

function formatAcademicYear(year) {
  if (!year) return "كل الفرق";
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || `الفرقة ${num}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "23514") return "قيمة غير مسموح بها (تأكد من طول العنوان والنص).";
  if (err.code === "23502") return "بيانات ناقصة.";
  if (err.code === "23503") return "لا يمكن تنفيذ العملية بسبب بيانات مرتبطة.";
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

export default function AdminNotificationsPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = everything, including global notifications)
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = admin?.role === "admin";
  const isSuper = isAdmin && admin?.is_super_admin === true;
  const adminId = admin?.id || null;

  // Academic years this admin may manage (own year + extra years granted by the super admin)
  const [allowedYears, setAllowedYears] = useState([]);
  useEffect(() => {
    if (!adminId) return;
    let ignore = false;
    (async () => {
      try {
        const years = await loadAllowedYears(supabase, adminId);
        if (!ignore) setAllowedYears(years);
      } catch (err) {
        console.error("Error loading allowed years:", err);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [adminId]);
  const adminDepartment = admin?.department || "";

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1) Load signed-in user's profile
  useEffect(() => {
    let ignore = false;

    async function loadAdmin() {
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

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, full_name, role, department, is_super_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (ignore) return;
        if (profileErr) throw profileErr;
        setAdmin(profileData || null);
      } catch (err) {
        if (!ignore) {
          console.error("Error loading admin profile:", err);
          setAuthError("تعذر تحميل بيانات الحساب. تأكد من إعدادات الصلاحيات.");
        }
      } finally {
        if (!ignore) {
          setAuthLoading(false);
        }
      }
    }

    loadAdmin();

    return () => {
      ignore = true;
    };
  }, []);

  // 2) Load notifications. A department admin only manages (and so only lists) their own department.
  const loadNotifications = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let query = supabase
        .from("notifications")
        .select("id, department, academic_year, type, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (isSuper) {
        if (deptFilter) query = query.eq("department", deptFilter);
      } else {
        query = query.eq("department", adminDepartment);
      }

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setErrorMsg(getDatabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isSuper, adminDepartment, deptFilter, typeFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadNotifications();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadNotifications]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setForm({ ...EMPTY_FORM, department: isSuper ? deptFilter : admin?.department || "" });
    setFormError(null);
    setShowCreate(true);
  };

  const audienceDepartment = isSuper ? form.department : admin?.department || "";
  const yearLabel = form.year === "" && !isSuper ? "كل فرقك" : formatAcademicYear(form.year);
  const audienceLabel = `${audienceDepartment || "كل الأقسام"} · ${yearLabel}`;
  const isGlobal = isSuper && !form.department;

  // 3) Send a notification
  const handleCreate = async () => {
    if (!admin || saving) return;
    setFormError(null);

    if (!Object.keys(TYPE_LABELS).includes(form.type)) {
      setFormError("اختر نوع الإشعار.");
      return;
    }

    const title = form.title.trim();
    if (title.length < 3 || title.length > 200) {
      setFormError("عنوان الإشعار يجب أن يكون بين 3 و200 حرف.");
      return;
    }

    const body = form.body.trim();
    if (body.length > 2000) {
      setFormError("نص الإشعار أطول من 2000 حرف.");
      return;
    }

    let department = null;
    if (isSuper) {
      if (form.department) {
        if (!DEPARTMENTS.includes(form.department)) {
          setFormError("القسم غير صحيح.");
          return;
        }
        department = form.department;
      }
    } else {
      if (!admin.department) {
        setFormError("حسابك غير مرتبط بقسم. اطلب من المسؤول الأعلى تحديد القسم.");
        return;
      }
      department = admin.department;
    }

    // Super admin: a single year or all years (NULL). Department admin: one of their years,
    // or one notification per year they manage when "all my years" is chosen.
    let yearsToSend = [null];
    if (form.year !== "") {
      const selectedYear = Number(form.year);
      if (!allowedYears.includes(selectedYear)) {
        setFormError("الفرقة خارج نطاق صلاحياتك.");
        return;
      }
      yearsToSend = [selectedYear];
    } else if (!isSuper) {
      if (allowedYears.length === 0) {
        setFormError("لا توجد فرق ضمن نطاق صلاحياتك.");
        return;
      }
      yearsToSend = allowedYears;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert(
          yearsToSend.map((year) => ({
            type: form.type,
            title,
            body: body || null,
            department,
            academic_year: year,
            created_by: admin.id,
          }))
        )
        .select("id");

      if (error) throw error;
      if (!data || data.length !== yearsToSend.length) {
        setFormError("لم يتم إرسال الإشعار (صلاحيات غير كافية).");
        return;
      }

      setShowCreate(false);
      showToast("تم إرسال الإشعار.");
      await loadNotifications();
    } catch (err) {
      setFormError(getDatabaseErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // 4) Delete a notification (read receipts are removed by cascade)
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast("لم يتم الحذف: ليس لديك صلاحية لهذا الإشعار.");
        return;
      }

      setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("تم حذف الإشعار.");
    } catch (err) {
      showToast(getDatabaseErrorMessage(err));
    } finally {
      setDeleting(false);
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

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Shield className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">غير مصرح</h2>
          <p className="text-xs text-slate-500 leading-relaxed">هذه الصفحة متاحة لمسؤولي النظام فقط.</p>
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

  const scopeLabel = isSuper ? (deptFilter ? `قسم ${deptFilter}` : "كل الأقسام") : `قسم ${admin?.department || "—"}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">الإشعارات · {scopeLabel}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            إرسال إشعارات للطلبة (إلغاء محاضرة، تعويض، تجهيزات، إعلانات) لقسم وفرقة محددين. تظهر فوراً في جرس الإشعارات.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {isSuper && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
              dir="rtl"
            >
              <option value="">كل الأقسام</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
            dir="rtl"
          >
            <option value="all">كل الأنواع</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>إشعار جديد</span>
          </button>

          <button
            onClick={loadNotifications}
            disabled={loading}
            className="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
      </div>

      {!isSuper && !admin?.department && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>حسابك غير مرتبط بقسم، لذلك لا يمكنك إرسال إشعارات. اطلب من المسؤول الأعلى تحديد القسم.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            onClick={loadNotifications}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-xs">
          <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-3">جاري تحميل الإشعارات...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Megaphone className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-slate-900">لا توجد إشعارات</p>
          <p className="text-xs text-slate-500">لم يتم إرسال أي إشعار بهذه الفلاتر بعد.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold border ${
                      TYPE_STYLES[item.type] || "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {TYPE_LABELS[item.type] || "إشعار"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Users className="h-3 w-3" />
                    {item.department || "كل الأقسام"} · {formatAcademicYear(item.academic_year)}
                  </span>
                  <span className="text-slate-400">· {formatDateTime(item.created_at)}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                {item.body && (
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap wrap-break-word line-clamp-3">
                    {item.body}
                  </p>
                )}
              </div>

              <div className="shrink-0">
                <button
                  onClick={() => setDeleteTarget(item)}
                  className="p-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                  title="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <ModalShell
          title="إرسال إشعار جديد"
          subtitle="يصل للطلبة فوراً ويظهر في جرس الإشعارات."
          onClose={() => !saving && setShowCreate(false)}
        >
          <div className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateForm("type", value)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    form.type === value
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">العنوان</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                maxLength={200}
                placeholder="مثال: إلغاء محاضرة الكيمياء العضوية غداً"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                التفاصيل <span className="text-slate-400 font-normal">(اختياري)</span>
              </label>
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => updateForm("body", e.target.value)}
                maxLength={2000}
                placeholder="اكتب تفاصيل الإشعار..."
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">القسم</label>
                {isSuper ? (
                  <select
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    className={`${inputClass} cursor-pointer`}
                    dir="rtl"
                  >
                    <option value="">كل الأقسام (إشعار عام)</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={admin?.department || ""} disabled className={`${inputClass} bg-slate-50`} />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">الفرقة</label>
                <select
                  value={form.year}
                  onChange={(e) => updateForm("year", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                  dir="rtl"
                >
                  <option value="">{isSuper ? "كل الفرق" : "كل فرقي"}</option>
                  {allowedYears.map((y) => (
                    <option key={y} value={y}>
                      {formatAcademicYear(y)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-[11px] flex items-start gap-2 leading-relaxed ${
                isGlobal
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-blue-50 border-blue-100 text-blue-800"
              }`}
            >
              <Users className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                سيصل إلى: <strong>{audienceLabel}</strong>
                {isGlobal && " — إشعار عام لكل الطلبة."}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCreate(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>إرسال الإشعار</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ModalShell title="حذف الإشعار؟" onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>سيتم حذف «{deleteTarget.title}» من عند كل الطلبة ولا يمكن التراجع.</span>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? "جاري الحذف..." : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
