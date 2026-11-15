"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Search,
  RefreshCw,
  Shield,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Music,
  FileCheck,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import FileViewer from "@/components/FileViewer";

const MATERIALS_BUCKET = "course-materials";

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

function isValidHttpUrl(string) {
  if (!string || typeof string !== "string") return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function getStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return null;
  const prefix = `${baseUrl}/storage/v1/object/public/${MATERIALS_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const rawPath = url.slice(prefix.length).split(/[?#]/)[0];
  if (!rawPath) return null;
  try {
    return decodeURIComponent(rawPath);
  } catch (_) {
    return null;
  }
}

function formatKind(kind) {
  if (kind === "audio") return "صوتي";
  if (kind === "video") return "فيديو (رابط)";
  return "ملف / وثيقة";
}

function formatArabicDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return dateStr;
  }
}

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "23505") return "موجود بالفعل";
  if (err.code === "23514") return "قيمة غير مسموح بها";
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

export default function AdminInboxPage() {
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const [deptFilter, setDeptFilter] = useState("");

  const [activeTab, setActiveTab] = useState("pending");
  const [materials, setMaterials] = useState([]);
  const [coursesMap, setCoursesMap] = useState({});
  const [uploadersMap, setUploadersMap] = useState({});
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);

  const [tabCounts, setTabCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkSummary, setBulkSummary] = useState(null);

  const isAdmin = admin?.role === "admin";
  const isSuper = isAdmin && admin?.is_super_admin === true;
  const scopeDepartment = isSuper ? deptFilter : (admin?.department || "");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    let ignore = false;

    async function loadAdminProfile() {
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

    loadAdminProfile();

    return () => {
      ignore = true;
    };
  }, []);

  const loadMaterialsData = useCallback(async () => {
    if (!isAdmin) return;
    setDataLoading(true);
    setDataError(null);

    try {
      let scopedCourseIds = null;
      const preloadedCoursesMap = {};

      if (scopeDepartment) {
        const { data: deptCourses, error: deptCoursesErr } = await supabase
          .from("courses")
          .select("id, code, title, department")
          .eq("department", scopeDepartment);

        if (deptCoursesErr) throw deptCoursesErr;
        scopedCourseIds = (deptCourses || []).map((c) => c.id);
        (deptCourses || []).forEach((c) => {
          preloadedCoursesMap[c.id] = c;
        });

        if (scopedCourseIds.length === 0) {
          setMaterials([]);
          setCoursesMap({});
          setUploadersMap({});
          setSelectedMaterialId(null);
          setTabCounts({ pending: 0, approved: 0, rejected: 0 });
          setDataLoading(false);
          return;
        }
      }

      let listQuery = supabase
        .from("materials")
        .select("id, title, file_url, course_id, uploader_id, status, kind, created_at")
        .eq("status", activeTab)
        .order("created_at", { ascending: false });

      if (scopedCourseIds !== null) {
        listQuery = listQuery.in("course_id", scopedCourseIds);
      }

      const countOf = (status) => {
        let q = supabase
          .from("materials")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (scopedCourseIds !== null) {
          q = q.in("course_id", scopedCourseIds);
        }
        return q;
      };

      const [listRes, pendingCountRes, approvedCountRes, rejectedCountRes] =
        await Promise.all([
          listQuery,
          countOf("pending"),
          countOf("approved"),
          countOf("rejected"),
        ]);

      if (listRes.error) throw listRes.error;
      if (pendingCountRes.error) throw pendingCountRes.error;
      if (approvedCountRes.error) throw approvedCountRes.error;
      if (rejectedCountRes.error) throw rejectedCountRes.error;

      const items = listRes.data || [];
      setTabCounts({
        pending: pendingCountRes.count || 0,
        approved: approvedCountRes.count || 0,
        rejected: rejectedCountRes.count || 0,
      });

      const currentCoursesMap = { ...preloadedCoursesMap };
      const missingCourseIds = [
        ...new Set(
          items
            .map((m) => m.course_id)
            .filter((cid) => cid && !currentCoursesMap[cid])
        ),
      ];

      if (missingCourseIds.length > 0) {
        const { data: missingCourses, error: missingCoursesErr } = await supabase
          .from("courses")
          .select("id, code, title, department")
          .in("id", missingCourseIds);

        if (missingCoursesErr) throw missingCoursesErr;
        (missingCourses || []).forEach((c) => {
          currentCoursesMap[c.id] = c;
        });
      }

      const currentUploadersMap = {};
      const uploaderIds = [
        ...new Set(items.map((m) => m.uploader_id).filter(Boolean)),
      ];

      if (uploaderIds.length > 0) {
        const { data: uploaders, error: uploadersErr } = await supabase
          .from("profile_directory")
          .select("id, full_name, role, department")
          .in("id", uploaderIds);

        if (uploadersErr) throw uploadersErr;
        (uploaders || []).forEach((p) => {
          currentUploadersMap[p.id] = p;
        });
      }

      setCoursesMap(currentCoursesMap);
      setUploadersMap(currentUploadersMap);
      setMaterials(items);

      setSelectedMaterialId((prev) => {
        if (prev && items.some((it) => it.id === prev)) return prev;
        return items[0]?.id || null;
      });
    } catch (err) {
      console.error("Error loading inbox materials:", err);
      setDataError("حدث خطأ أثناء تحميل المواد الدراسية.");
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, scopeDepartment, activeTab]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadMaterialsData();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadMaterialsData]);

  const deleteMaterialPermanently = async (material) => {
    if (!material?.id) {
      return {
        ok: false,
        fileNotFound: false,
        errorMessage: "بيانات المادة غير صالحة.",
      };
    }

    let fileNotFound = false;
    const storagePath = getStoragePathFromUrl(material.file_url);

    if (storagePath) {
      const { data: removedFiles, error: storageErr } = await supabase.storage
        .from(MATERIALS_BUCKET)
        .remove([storagePath]);

      if (storageErr) {
        console.error("Storage remove error:", storageErr);
        return {
          ok: false,
          fileNotFound: false,
          errorMessage: "تعذر حذف الملف من التخزين. لم يتم حذف المادة ليتمكن النظام من إعادة المحاولة.",
        };
      }

      if (!removedFiles || removedFiles.length === 0) {
        const normalizedPath = storagePath.replace(/^\/+/, "");
        const lastSlashIndex = normalizedPath.lastIndexOf("/");
        const folderPath =
          lastSlashIndex !== -1 ? normalizedPath.slice(0, lastSlashIndex) : "";
        const fileName =
          lastSlashIndex !== -1 ? normalizedPath.slice(lastSlashIndex + 1) : normalizedPath;

        const { data: existingFiles, error: listErr } = await supabase.storage
          .from(MATERIALS_BUCKET)
          .list(folderPath, { search: fileName });

        if (listErr) {
          console.error("Storage list verification error:", listErr);
          return {
            ok: false,
            fileNotFound: false,
            errorMessage: "تعذر التحقق من حذف الملف من التخزين. لم يتم حذف المادة.",
          };
        }

        const stillExists = (existingFiles || []).some((file) => file.name === fileName);
        if (stillExists) {
          return {
            ok: false,
            fileNotFound: false,
            errorMessage: "ليس لديك صلاحية حذف الملف من التخزين",
          };
        }

        fileNotFound = true;
      }
    }

    const { data: deletedRows, error: dbErr } = await supabase
      .from("materials")
      .delete()
      .eq("id", material.id)
      .select("id");

    if (dbErr) {
      return {
        ok: false,
        fileNotFound,
        errorMessage: getDatabaseErrorMessage(dbErr),
      };
    }

    if (!deletedRows || deletedRows.length === 0) {
      return {
        ok: false,
        fileNotFound,
        errorMessage: "ليس لديك صلاحية أو المادة غير موجودة",
      };
    }

    return {
      ok: true,
      fileNotFound,
      errorMessage: null,
    };
  };

  const handlePermanentDeleteAction = async (material, sourceTab) => {
    if (!material?.id || updatingId || isBulkDeleting) return;

    let confirmMsg = "سيتم حذف المادة وملفها نهائياً ولا يمكن التراجع. متابعة؟";
    if (sourceTab === "approved") {
      confirmMsg = "هذه المادة معتمدة وظاهرة للطلاب. سيتم حذفها وملفها نهائياً. متابعة؟";
    }

    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    setUpdatingId(material.id);
    try {
      const result = await deleteMaterialPermanently(material);
      if (!result.ok) {
        showToast(result.errorMessage || "تعذر حذف المادة.");
        return;
      }

      setSelectedMaterialId(null);
      setIsMobileDetailOpen(false);
      await loadMaterialsData();

      if (result.fileNotFound) {
        showToast("تم حذف المادة نهائياً (ملف لم يُعثر عليه في التخزين).");
      } else {
        showToast("تم حذف المادة وملفها نهائياً بنجاح.");
      }
    } catch (err) {
      console.error("Permanent delete error:", err);
      showToast("حدث خطأ غير متوقع أثناء الحذف النهائي.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkDeleteRejected = async () => {
    if (activeTab !== "rejected" || isBulkDeleting || updatingId) return;

    const targetList = [...materials];
    const total = targetList.length;
    if (total === 0) return;

    const confirmText = "سيتم حذف جميع المواد المرفوضة الظاهرة في نطاقك وعددها (" + total + ") مادة مع ملفاتها نهائياً ولا يمكن التراجع. متابعة؟";
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setIsBulkDeleting(true);
    setBulkSummary(null);
    setBulkProgress({ deletedCount: 0, total });

    let successCount = 0;
    let failCount = 0;
    let fileNotFoundCount = 0;
    let consecutiveErrors = 0;
    let stoppedEarly = false;

    try {
      for (let i = 0; i < targetList.length; i++) {
        const item = targetList[i];
        try {
          const result = await deleteMaterialPermanently(item);
          if (result.ok) {
            successCount += 1;
            consecutiveErrors = 0;
            if (result.fileNotFound) {
              fileNotFoundCount += 1;
            }
          } else {
            failCount += 1;
            consecutiveErrors += 1;
          }
        } catch (err) {
          console.error("Bulk item delete error:", err);
          failCount += 1;
          consecutiveErrors += 1;
        }

        setBulkProgress({ deletedCount: successCount, total });

        if (consecutiveErrors >= 5) {
          stoppedEarly = true;
          break;
        }
      }

      setSelectedMaterialId(null);
      setIsMobileDetailOpen(false);
      await loadMaterialsData();

      setBulkSummary({
        successCount,
        failCount,
        fileNotFoundCount,
        stoppedEarly,
      });

      const stoppedNote = stoppedEarly ? " (توقف تلقائياً بعد 5 أخطاء متتالية)" : "";
      const summaryToast = "اكتمل الحذف: نجح " + successCount + " · فشل " + failCount + " · ملف لم يُعثر عليه " + fileNotFoundCount + stoppedNote;
      showToast(summaryToast);
    } finally {
      setIsBulkDeleting(false);
      setBulkProgress(null);
    }
  };

  const handleUpdateStatus = async (materialId, targetStatus) => {
    if (!materialId || updatingId || isBulkDeleting) return;

    setUpdatingId(materialId);
    try {
      const { error } = await supabase
        .from("materials")
        .update({ status: targetStatus })
        .eq("id", materialId);

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else {
        const successMessage =
          targetStatus === "approved"
            ? "تم اعتماد المادة الدراسية بنجاح."
            : "تمت إعادة المادة إلى قائمة قيد المراجعة.";
        showToast(successMessage);
        await loadMaterialsData();
      }
    } catch (err) {
      console.error("Status update error:", err);
      showToast("حدث خطأ غير متوقع أثناء تحديث الحالة.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredMaterials = useMemo(() => {
    if (!searchQuery.trim()) return materials;
    const query = searchQuery.trim().toLowerCase();

    return materials.filter((item) => {
      const course = coursesMap[item.course_id];
      const uploader = uploadersMap[item.uploader_id];

      const matchTitle = (item.title || "").toLowerCase().includes(query);
      const matchCourseCode = (course?.code || "").toLowerCase().includes(query);
      const matchCourseTitle = (course?.title || "").toLowerCase().includes(query);
      const matchUploader = (uploader?.full_name || "").toLowerCase().includes(query);

      return matchTitle || matchCourseCode || matchCourseTitle || matchUploader;
    });
  }, [materials, searchQuery, coursesMap, uploadersMap]);

  const selectedMaterial = useMemo(() => {
    if (!selectedMaterialId) return null;
    return (
      filteredMaterials.find((m) => m.id === selectedMaterialId) ||
      materials.find((m) => m.id === selectedMaterialId) ||
      null
    );
  }, [filteredMaterials, materials, selectedMaterialId]);

  if (authLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري التحقق من الصلاحيات...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
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
          <p className="text-xs text-slate-500 leading-relaxed">
            هذه الصفحة متاحة لمسؤولي النظام فقط.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
        >
          <span>العودة للرئيسية</span>
        </Link>
      </div>
    );
  }

  const scopeLabel = scopeDepartment ? "قسم " + scopeDepartment : "كل الأقسام";
  const selectedCourse = selectedMaterial ? coursesMap[selectedMaterial.course_id] : null;
  const selectedUploader = selectedMaterial ? uploadersMap[selectedMaterial.uploader_id] : null;
  const isSelectedUrlValid = selectedMaterial ? isValidHttpUrl(selectedMaterial.file_url) : false;

  const bulkProgressPercent = bulkProgress
    ? Math.min(100, Math.round((bulkProgress.deletedCount / Math.max(1, bulkProgress.total)) * 100))
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {toastMessage && (
        <div
          id="toast-inbox"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                <Inbox className="h-3.5 w-3.5" />
                <span>Admin Moderation</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                {tabCounts.pending} قيد الانتظار
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {isSuper ? "Super Admin · " + scopeLabel : "Department Admin · " + scopeLabel}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1.5">
              Material Approval & Moderation Inbox
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              مراجعة واعتماد أو رفض المواد والوثائق والملفات الصوتية المرفوعة من قبل أعضاء هيئة التدريس والطلاب للمقررات الدراسية.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {isSuper ? (
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
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
                {scopeLabel}
              </span>
            )}

            <button
              onClick={loadMaterialsData}
              disabled={dataLoading || isBulkDeleting}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={dataLoading ? "h-3.5 w-3.5 text-slate-500 animate-spin" : "h-3.5 w-3.5 text-slate-500"} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      {dataError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{dataError}</span>
          <button
            onClick={loadMaterialsData}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div
        id="admin-split-pane"
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row min-h-[680px] max-h-[860px]"
      >
        <div
          className={
            isMobileDetailOpen
              ? "w-full md:w-[380px] lg:w-[420px] shrink-0 border-r border-slate-200 flex-col bg-white hidden md:flex"
              : "w-full md:w-[380px] lg:w-[420px] shrink-0 border-r border-slate-200 flex flex-col bg-white"
          }
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                المواد الدراسية
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                {filteredMaterials.length} مادة
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالعنوان أو المقرر أو الرافع..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setActiveTab("pending");
                  setBulkSummary(null);
                }}
                disabled={isBulkDeleting}
                className={
                  activeTab === "pending"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-slate-900 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <Clock className="h-3 w-3" />
                <span>Pending</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/40">
                  {tabCounts.pending}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("approved");
                  setBulkSummary(null);
                }}
                disabled={isBulkDeleting}
                className={
                  activeTab === "approved"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-emerald-600 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Approved</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/40">
                  {tabCounts.approved}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("rejected");
                  setBulkSummary(null);
                }}
                disabled={isBulkDeleting}
                className={
                  activeTab === "rejected"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-rose-600 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <XCircle className="h-3 w-3" />
                <span>Rejected</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/40">
                  {tabCounts.rejected}
                </span>
              </button>
            </div>

            {activeTab === "rejected" && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2" dir="rtl">
                {materials.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteRejected}
                    disabled={isBulkDeleting || Boolean(updatingId)}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>حذف كل المرفوضة ({materials.length})</span>
                  </button>
                )}

                {bulkProgress && (
                  <div className="p-2.5 rounded-xl bg-white border border-rose-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-700">
                      <span>
                        تم حذف {bulkProgress.deletedCount} من {bulkProgress.total}
                      </span>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-600" />
                    </div>
                    <div className="w-full h-1.5 bg-rose-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-600 transition-all duration-200"
                        style={{ width: bulkProgressPercent + "%" }}
                      />
                    </div>
                  </div>
                )}

                {bulkSummary && !bulkProgress && (
                  <div className="p-2.5 rounded-xl bg-slate-900 text-white text-[11px] space-y-1">
                    <div className="font-bold text-blue-300">ملخص حذف المواد المرفوضة:</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span>الناجح: {bulkSummary.successCount}</span>
                      <span>الفاشل: {bulkSummary.failCount}</span>
                      <span>ملف لم يُعثر عليه: {bulkSummary.fileNotFoundCount}</span>
                    </div>
                    {bulkSummary.stoppedEarly && (
                      <div className="text-rose-300 font-semibold">
                        توقف تلقائياً بعد 5 أخطاء متتالية.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {dataLoading ? (
              <div className="p-12 text-center space-y-2">
                <div className="h-7 w-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">جاري تحميل البيانات...</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  لا توجد مواد في هذه القائمة
                </p>
                <p className="text-[11px] text-slate-400">
                  {searchQuery ? "جرب تعديل عبارة البحث." : "لم يتم العثور على أي عناصر مطابقة."}
                </p>
              </div>
            ) : (
              filteredMaterials.map((item) => {
                const isSelected = selectedMaterial?.id === item.id;
                const course = coursesMap[item.course_id];
                const uploader = uploadersMap[item.uploader_id];

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedMaterialId(item.id);
                      setIsMobileDetailOpen(true);
                    }}
                    className={
                      isSelected
                        ? "p-4 transition-colors cursor-pointer text-left relative bg-blue-50/70 border-l-4 border-blue-600"
                        : "p-4 transition-colors cursor-pointer text-left relative hover:bg-slate-50 bg-white"
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {uploader?.full_name ? uploader.full_name.charAt(0).toUpperCase() : "U"}
                        </div>
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {uploader?.full_name || "مستخدم غير معروف"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatArabicDate(item.created_at)}
                      </span>
                    </div>

                    <h4
                      className={
                        isSelected
                          ? "text-xs font-bold line-clamp-2 leading-snug mb-2 text-blue-950"
                          : "text-xs font-bold line-clamp-2 leading-snug mb-2 text-slate-800"
                      }
                    >
                      {item.title}
                    </h4>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {course?.code && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                          {course.code}
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {formatKind(item.kind)}
                      </span>

                      <div className="ml-auto flex items-center gap-1.5">
                        {item.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Approved
                          </span>
                        )}
                        {item.status === "rejected" && (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="h-3 w-3 text-rose-600" />
                              Rejected
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePermanentDeleteAction(item, "rejected");
                              }}
                              disabled={updatingId === item.id || isBulkDeleting}
                              title="حذف نهائي"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                              <span>حذف نهائي</span>
                            </button>
                          </>
                        )}
                        {item.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          className={
            isMobileDetailOpen
              ? "flex-1 flex flex-col bg-slate-50/30 overflow-y-auto"
              : "flex-1 flex-col bg-slate-50/30 overflow-y-auto hidden md:flex"
          }
        >
          {selectedMaterial ? (
            <div className="p-5 sm:p-7 space-y-6 flex-1 flex flex-col">
              <div className="md:hidden">
                <button
                  onClick={() => setIsMobileDetailOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>العودة لقائمة المواد</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedCourse?.code && (
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                          {selectedCourse.code}
                        </span>
                      )}
                      {selectedCourse?.title && (
                        <span className="text-xs text-slate-500 font-medium">
                          {selectedCourse.title}
                        </span>
                      )}
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {formatKind(selectedMaterial.kind)}
                      </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      {selectedMaterial.title}
                    </h2>
                  </div>

                  <div className="shrink-0">
                    {selectedMaterial.status === "approved" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Approved
                      </span>
                    )}
                    {selectedMaterial.status === "rejected" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        Rejected
                      </span>
                    )}
                    {selectedMaterial.status === "pending" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        Pending Review
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                      {selectedUploader?.full_name ? selectedUploader.full_name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">
                          {selectedUploader?.full_name || "مستخدم غير مسجل"}
                        </h4>
                        {selectedUploader?.role && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-semibold">
                            {selectedUploader.role}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {selectedUploader?.department ? "قسم " + selectedUploader.department : "القسم غير محدد"}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 sm:text-right">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      تاريخ الرفع
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatArabicDate(selectedMaterial.created_at)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      نوع المادة
                    </span>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      {selectedMaterial.kind === "audio" ? (
                        <Music className="h-3.5 w-3.5 text-purple-600" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                      )}
                      {formatKind(selectedMaterial.kind)}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      المقرر التابع له
                    </span>
                    <span className="font-bold text-slate-800 truncate block">
                      {selectedCourse ? selectedCourse.code + " - " + selectedCourse.title : "مقرر غير معروف"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      القسم الأكاديمي
                    </span>
                    <span className="font-bold text-slate-800 truncate block">
                      {selectedCourse?.department || "—"}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileCheck className="h-4 w-4 text-blue-600" />
                      <span>معاينة ورابط الملف المرفق</span>
                    </span>
                    {!isSelectedUrlValid && (
                      <span className="text-[11px] font-semibold text-rose-600">
                        رابط غير صالح
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-700 break-all select-all">
                    {selectedMaterial.file_url}
                  </div>
                </div>
              </div>

              {isSelectedUrlValid && (
                <FileViewer
                  fileUrl={selectedMaterial.file_url}
                  title={selectedMaterial.title}
                />
              )}

              <div
                id="moderation-action-bar"
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-auto sticky bottom-2"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    إجراء المشرف الأكاديمي
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {selectedMaterial.status === "pending"
                      ? "الموافقة ستنشر المادة مباشرة لطلاب المقرر، والرفض سيحذف المادة وملفها نهائياً."
                      : selectedMaterial.status === "approved"
                      ? "المادة معتمدة حالياً وتظهر للطلاب."
                      : "المادة مرفوضة حالياً ولا تظهر للطلاب."}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMaterial.status === "pending" && (
                    <>
                      <button
                        onClick={() => handlePermanentDeleteAction(selectedMaterial, "pending")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        <span>رفض وحذف نهائي</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedMaterial.id, "approved")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        <span>اعتماد ونشر (Approve)</span>
                      </button>
                    </>
                  )}

                  {selectedMaterial.status === "approved" && (
                    <>
                      <button
                        onClick={() => handlePermanentDeleteAction(selectedMaterial, "approved")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        <span>حذف نهائي</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedMaterial.id, "pending")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span>إعادة إلى قيد المراجعة (Move to Pending)</span>
                      </button>
                    </>
                  )}

                  {selectedMaterial.status === "rejected" && (
                    <>
                      <button
                        onClick={() => handlePermanentDeleteAction(selectedMaterial, "rejected")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        <span>حذف نهائي</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedMaterial.id, "approved")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>اعتماد الآن (Approve)</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedMaterial.id, "pending")}
                        disabled={updatingId === selectedMaterial.id || isBulkDeleting}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span>إعادة إلى قيد المراجعة (Move to Pending)</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 my-auto">
              اختر مادة دراسية من القائمة لعرض التفاصيل وإجراء الاعتماد أو الحذف.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}