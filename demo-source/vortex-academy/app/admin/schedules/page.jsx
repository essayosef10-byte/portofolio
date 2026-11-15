"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Plus,
  Edit2,
  X,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Shield,
  FileText,
  Bell,
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

const TERM_SUGGESTIONS = ["الفصل الدراسي الأول", "الفصل الدراسي الثاني", "الفصل الصيفي"];

const SCHEDULES_BUCKET = "schedules";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (matches the bucket limit)
const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg";
const FILE_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const EMPTY_FORM = {
  department: "",
  year: "1",
  term: "",
  mode: "upload", // "upload" | "link"
  file: null,
  link: "",
};

function isValidHttpsUrl(string) {
  if (!string || typeof string !== "string") return false;
  try {
    return new URL(string.trim()).protocol === "https:";
  } catch (_) {
    return false;
  }
}

function isValidHttpOrHttpsUrl(string) {
  if (!string || typeof string !== "string") return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

// Returns the Storage object path for a file in our schedules bucket, otherwise null
function getStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return null;
  const prefix = `${baseUrl}/storage/v1/object/public/${SCHEDULES_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const rawPath = url.slice(prefix.length).split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch (_) {
    return null;
  }
}

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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-EG", { dateStyle: "medium" });
}

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "23514") return "قيمة غير مسموح بها (تأكد أن الرابط يبدأ بـ http أو https).";
  if (err.code === "23502") return "بيانات ناقصة.";
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

function getUploadErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع أثناء رفع الملف.";
  const message = String(err.message || "").toLowerCase();
  const status = String(err.statusCode || err.status || "");

  if (message.includes("bucket not found")) {
    return "مخزن ملفات الجداول غير موجود. شغّل ملف supabase/schedules-notifications-admin.sql أولاً.";
  }
  if (status === "413" || message.includes("exceed") || message.includes("too large")) {
    return "حجم الملف أكبر من الحد المسموح (10 ميجابايت).";
  }
  if (message.includes("mime")) {
    return "نوع الملف غير مسموح به.";
  }
  if (
    status === "403" ||
    status === "401" ||
    message.includes("row-level security") ||
    message.includes("unauthorized") ||
    message.includes("policy")
  ) {
    return "ليس لديك صلاحية لرفع ملفات الجداول";
  }
  return "حدث خطأ أثناء رفع الملف. يرجى المحاولة مرة أخرى.";
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

export default function AdminSchedulesPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = all departments)
  const [deptFilter, setDeptFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Edit modal (term + academic year only)
  const [editItem, setEditItem] = useState(null);
  const [editTerm, setEditTerm] = useState("");
  const [editYear, setEditYear] = useState("1");
  const [editError, setEditError] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

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
  const scopeDepartment = isSuper ? deptFilter : admin?.department || "";

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

  // 2) Load schedules
  const loadSchedules = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let query = supabase
        .from("schedules")
        .select("id, department, academic_year, file_url, term, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (scopeDepartment) {
        query = query.eq("department", scopeDepartment);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSchedules(data || []);
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setErrorMsg(getDatabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, scopeDepartment]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadSchedules();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadSchedules]);

  const visibleSchedules = useMemo(() => {
    if (yearFilter === "all") return schedules;
    return schedules.filter((s) => Number(s.academic_year) === Number(yearFilter));
  }, [schedules, yearFilter]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setForm({
      ...EMPTY_FORM,
      year: String(allowedYears[0] || 1),
      department: isSuper ? deptFilter || DEPARTMENTS[0] : admin?.department || "",
    });
    setFormError(null);
    setShowCreate(true);
  };

  // 3) Create schedule: upload file (or link) and insert the row
  const handleCreate = async () => {
    if (!admin || saving) return;
    setFormError(null);

    const department = isSuper ? form.department : admin.department;
    if (!department || !DEPARTMENTS.includes(department)) {
      setFormError("القسم غير محدد. اطلب من المسؤول الأعلى تحديد قسم حسابك.");
      return;
    }

    const year = Number(form.year);
    if (!allowedYears.includes(year)) {
      setFormError("اختر الفرقة الدراسية.");
      return;
    }

    const term = form.term.trim();
    if (term.length > 100) {
      setFormError("اسم الفصل الدراسي طويل جداً.");
      return;
    }

    let upload = null;
    let fileUrl = null;

    if (form.mode === "upload") {
      if (!form.file) {
        setFormError("اختر ملف الجدول.");
        return;
      }
      const ext = getFileExtension(form.file.name);
      if (!FILE_TYPES[ext]) {
        setFormError("نوع الملف غير مسموح (PDF أو صورة PNG/JPG).");
        return;
      }
      if (form.file.size > MAX_UPLOAD_BYTES) {
        setFormError("حجم الملف أكبر من 10 ميجابايت.");
        return;
      }
      upload = { file: form.file, ext };
    } else {
      if (!isValidHttpsUrl(form.link)) {
        setFormError("الرابط يجب أن يبدأ بـ https://");
        return;
      }
      fileUrl = form.link.trim();
    }

    setSaving(true);
    let uploadedPath = null;

    try {
      if (upload) {
        // Files live under <user_id>/<random-uuid>.<ext> so the storage policy can check the uploader
        const path = `${admin.id}/${crypto.randomUUID()}.${upload.ext}`;
        const { error: uploadError } = await supabase.storage
          .from(SCHEDULES_BUCKET)
          .upload(path, upload.file, {
            contentType: FILE_TYPES[upload.ext],
            upsert: false,
            cacheControl: "3600",
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          setFormError(getUploadErrorMessage(uploadError));
          return;
        }

        uploadedPath = path;
        const { data: publicData } = supabase.storage.from(SCHEDULES_BUCKET).getPublicUrl(path);
        fileUrl = publicData?.publicUrl || null;
        if (!isValidHttpOrHttpsUrl(fileUrl)) {
          await supabase.storage.from(SCHEDULES_BUCKET).remove([uploadedPath]);
          setFormError("تعذر الحصول على رابط الملف.");
          return;
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from("schedules")
        .insert({
          department,
          academic_year: year,
          file_url: fileUrl,
          term: term || null,
        })
        .select("id");

      if (insertError || !inserted || inserted.length === 0) {
        setFormError(
          insertError ? getDatabaseErrorMessage(insertError) : "لم يتم حفظ الجدول (صلاحيات غير كافية)."
        );
        if (uploadedPath) {
          await supabase.storage.from(SCHEDULES_BUCKET).remove([uploadedPath]);
        }
        return;
      }

      setShowCreate(false);
      showToast("تم نشر الجدول وإرسال إشعار للطلبة.");
      await loadSchedules();
    } catch (err) {
      console.error("Create schedule error:", err);
      if (uploadedPath) {
        await supabase.storage.from(SCHEDULES_BUCKET).remove([uploadedPath]);
      }
      setFormError("حدث خطأ غير متوقع أثناء نشر الجدول.");
    } finally {
      setSaving(false);
    }
  };

  // 4) Edit term / academic year
  const openEditModal = (item) => {
    setEditItem(item);
    setEditTerm(item.term || "");
    setEditYear(String(Number(item.academic_year) || 1));
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editItem || editSaving) return;
    const term = editTerm.trim();
    const year = Number(editYear);

    if (term.length > 100) {
      setEditError("اسم الفصل الدراسي طويل جداً.");
      return;
    }
    if (!allowedYears.includes(year)) {
      setEditError("اختر الفرقة الدراسية.");
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const { data, error } = await supabase
        .from("schedules")
        .update({ term: term || null, academic_year: year })
        .eq("id", editItem.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        setEditError("لم يتم الحفظ: ليس لديك صلاحية لتعديل هذا الجدول.");
        return;
      }

      setSchedules((prev) =>
        prev.map((s) => (s.id === editItem.id ? { ...s, term: term || null, academic_year: year } : s))
      );
      setEditItem(null);
      showToast("تم حفظ التعديلات.");
    } catch (err) {
      setEditError(getDatabaseErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  // 5) Delete the row first, then the file (best effort: a different admin may not own the file)
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase
        .from("schedules")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast("لم يتم الحذف: ليس لديك صلاحية لهذا الجدول.");
        return;
      }

      const path = getStoragePathFromUrl(deleteTarget.file_url);
      if (path) {
        const { error: storageError } = await supabase.storage.from(SCHEDULES_BUCKET).remove([path]);
        if (storageError) console.error("Storage cleanup error:", storageError);
      }

      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("تم حذف الجدول.");
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

  const scopeLabel = scopeDepartment ? `قسم ${scopeDepartment}` : "كل الأقسام";

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
              <CalendarDays className="h-3.5 w-3.5" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">الجداول الدراسية · {scopeLabel}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">Schedules</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            نشر جداول المحاضرات والامتحانات للأقسام والفرق. يصل إشعار تلقائي للطلبة عند نشر جدول جديد.
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
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
            dir="rtl"
          >
            <option value="all">كل الفرق</option>
            {allowedYears.map((y) => (
              <option key={y} value={y}>
                {formatAcademicYear(y)}
              </option>
            ))}
          </select>

          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>نشر جدول جديد</span>
          </button>

          <button
            onClick={loadSchedules}
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
          <span>حسابك غير مرتبط بقسم، لذلك لن تظهر لك أي جداول. اطلب من المسؤول الأعلى تحديد القسم.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            onClick={loadSchedules}
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
          <p className="text-xs text-slate-500 mt-3">جاري تحميل الجداول...</p>
        </div>
      ) : visibleSchedules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <CalendarDays className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-slate-900">لا توجد جداول</p>
          <p className="text-xs text-slate-500">
            {schedules.length === 0 ? "ابدأ بنشر أول جدول لقسمك." : "لا توجد جداول لهذه الفرقة."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSchedules.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {item.term || "الفصل الدراسي الحالي"}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                    <span className="px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {formatAcademicYear(item.academic_year)}
                    </span>
                    <span>{item.department}</span>
                    <span>· نُشر {formatDate(item.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {isValidHttpOrHttpsUrl(item.file_url) && (
                  <a
                    href={item.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>فتح الملف</span>
                  </a>
                )}
                <button
                  onClick={() => openEditModal(item)}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                  title="تعديل"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
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
          title="نشر جدول جديد"
          subtitle="يظهر الجدول لطلاب القسم والفرقة المحددين."
          onClose={() => !saving && setShowCreate(false)}
        >
          <div className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">القسم</label>
              {isSuper ? (
                <select
                  value={form.department}
                  onChange={(e) => updateForm("department", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                  dir="rtl"
                >
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">الفرقة</label>
                <select
                  value={form.year}
                  onChange={(e) => updateForm("year", e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                  dir="rtl"
                >
                  {allowedYears.map((y) => (
                    <option key={y} value={y}>
                      {formatAcademicYear(y)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  الفصل الدراسي <span className="text-slate-400 font-normal">(اختياري)</span>
                </label>
                <input
                  type="text"
                  list="term-suggestions"
                  value={form.term}
                  onChange={(e) => updateForm("term", e.target.value)}
                  maxLength={100}
                  placeholder="الفصل الدراسي الأول"
                  className={inputClass}
                />
                <datalist id="term-suggestions">
                  {TERM_SUGGESTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-2 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">ملف الجدول</label>
                <div className="flex items-center gap-1 text-[11px]">
                  {[
                    ["upload", "رفع ملف"],
                    ["link", "رابط"],
                  ].map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateForm("mode", m)}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        form.mode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {form.mode === "upload" ? (
                <>
                  <input
                    type="file"
                    accept={FILE_ACCEPT}
                    onChange={(e) => updateForm("file", e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500">PDF أو صورة PNG/JPG، حتى 10 ميجابايت.</p>
                </>
              ) : (
                <input
                  type="url"
                  dir="ltr"
                  value={form.link}
                  onChange={(e) => updateForm("link", e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              )}
            </div>

            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-[11px] flex items-start gap-2 leading-relaxed">
              <Bell className="h-4 w-4 shrink-0 mt-0.5" />
              <span>بعد النشر يصل إشعار تلقائي «تم نشر جدول جديد» لطلاب هذا القسم والفرقة.</span>
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
                    <span>جاري النشر...</span>
                  </>
                ) : (
                  <span>نشر الجدول</span>
                )}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Edit modal */}
      {editItem && (
        <ModalShell title="تعديل الجدول" onClose={() => !editSaving && setEditItem(null)}>
          <div className="space-y-4">
            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">الفرقة</label>
                <select
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                  dir="rtl"
                >
                  {allowedYears.map((y) => (
                    <option key={y} value={y}>
                      {formatAcademicYear(y)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">الفصل الدراسي</label>
                <input
                  type="text"
                  list="term-suggestions-edit"
                  value={editTerm}
                  onChange={(e) => setEditTerm(e.target.value)}
                  maxLength={100}
                  className={inputClass}
                />
                <datalist id="term-suggestions-edit">
                  {TERM_SUGGESTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              لتغيير الملف أو القسم احذف الجدول وانشره من جديد.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditItem(null)}
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

      {/* Delete confirmation */}
      {deleteTarget && (
        <ModalShell title="حذف الجدول؟" onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                سيتم حذف جدول «{deleteTarget.term || "الفصل الدراسي الحالي"}» ({formatAcademicYear(deleteTarget.academic_year)}) ولن يظهر للطلبة بعد الآن.
              </span>
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
