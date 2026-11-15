"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  Music,
  Video,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  BookOpen,
  Library,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const MATERIALS_BUCKET = "course-materials";
const MAX_STUDENT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_TITLE_LENGTH = 120;
const MAX_PENDING_UPLOADS = 10;

const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.mp3,.m4a,.wav,.ogg";

const UPLOAD_TYPES = {
  pdf: { mime: "application/pdf", kind: "document" },
  doc: { mime: "application/msword", kind: "document" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
  },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "document" },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "document",
  },
  xls: { mime: "application/vnd.ms-excel", kind: "document" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "document",
  },
  txt: { mime: "text/plain", kind: "document" },
  png: { mime: "image/png", kind: "document" },
  jpg: { mime: "image/jpeg", kind: "document" },
  jpeg: { mime: "image/jpeg", kind: "document" },
  mp3: { mime: "audio/mpeg", kind: "audio" },
  m4a: { mime: "audio/mp4", kind: "audio" },
  wav: { mime: "audio/wav", kind: "audio" },
  ogg: { mime: "audio/ogg", kind: "audio" },
};

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20, 32)
  );
}

function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isValidHttpsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function getStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return null;
  const prefix = baseUrl + "/storage/v1/object/public/" + MATERIALS_BUCKET + "/";
  if (!url.startsWith(prefix)) return null;
  const rawPath = url.slice(prefix.length).split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch (_) {
    return null;
  }
}

function formatAcademicYear(year) {
  if (!year) return null;
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || "الفرقة " + num;
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

function getReadableError(err) {
  if (!err) return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
  const rawMessage = String(err.message || err.error_description || "");
  const msg = rawMessage.toLowerCase();

  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed")
  ) {
    return "تعذر الاتصال أثناء الرفع. تأكد من الإنترنت وأن الملف محفوظ على الجهاز وليس على سحابة، ثم أعد المحاولة.";
  }
  if (msg.includes("pending materials limit") || err.code === "P0001") {
    return "لقد وصلت إلى الحد الأقصى للمواد قيد المراجعة (10 مواد). انتظر اعتماد أو مراجعة موادك الحالية أولاً.";
  }
  if (
    err.code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission") ||
    msg.includes("policy")
  ) {
    return "ليس لديك صلاحية لتنفيذ هذا الإجراء أو أن المقرر غير مخصص لفرقتك.";
  }
  if (msg.includes("exceed") || msg.includes("too large") || String(err.statusCode) === "413") {
    return "حجم الملف يتجاوز الحد المسموح به.";
  }

  const codeOrStatus = err.code || err.statusCode || err.status || "بدون كود";
  const shortMessage = (rawMessage || "خطأ غير معروف").slice(0, 100);
  return (
    "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى. (التفاصيل: " +
    codeOrStatus +
    " — " +
    shortMessage +
    ")"
  );
}

export default function StudentUploadPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [offeredCourses, setOfferedCourses] = useState([]);
  const [coursesMap, setCoursesMap] = useState({});
  const [myMaterials, setMyMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [uploadMode, setUploadMode] = useState("file");
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setError("يجب تسجيل الدخول أولاً لرفع المواد الدراسية.");
        setLoading(false);
        return;
      }

      setUser(authUser);

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, role, department, academic_year")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileErr) throw profileErr;
      setProfile(profileData || null);

      if (profileData?.role === "admin") {
        setLoading(false);
        return;
      }

      let activeCourses = [];
      const cMap = {};

      if (profileData?.department && profileData?.academic_year != null) {
        const { data: offeringsData, error: offeringsErr } = await supabase
          .from("course_offerings")
          .select("course_id")
          .eq("department", profileData.department)
          .eq("academic_year", Number(profileData.academic_year));

        if (offeringsErr) throw offeringsErr;

        const offeredIds = [...new Set((offeringsData || []).map((o) => o.course_id))];

        if (offeredIds.length > 0) {
          const { data: coursesData, error: coursesErr } = await supabase
            .from("courses")
            .select("id, code, title, department, status")
            .in("id", offeredIds)
            .eq("status", "active")
            .order("code", { ascending: true });

          if (coursesErr) throw coursesErr;
          activeCourses = coursesData || [];
          activeCourses.forEach((c) => {
            cMap[c.id] = c;
          });
        }
      }

      setOfferedCourses(activeCourses);
      if (activeCourses.length > 0) {
        setSelectedCourseId((prev) =>
          prev && activeCourses.some((c) => c.id === prev) ? prev : activeCourses[0].id
        );
      } else {
        setSelectedCourseId("");
      }

      const { data: myMats, error: matsErr } = await supabase
        .from("materials")
        .select("id, title, file_url, course_id, uploader_id, status, kind, created_at")
        .eq("uploader_id", authUser.id)
        .order("created_at", { ascending: false });

      if (matsErr) throw matsErr;
      const contributions = myMats || [];
      setMyMaterials(contributions);

      const missingCourseIds = [
        ...new Set(
          contributions
            .map((m) => m.course_id)
            .filter((cid) => cid && !cMap[cid])
        ),
      ];

      if (missingCourseIds.length > 0) {
        const { data: extraCourses } = await supabase
          .from("courses")
          .select("id, code, title, department, status")
          .in("id", missingCourseIds);

        (extraCourses || []).forEach((c) => {
          cMap[c.id] = c;
        });
      }

      setCoursesMap(cMap);
    } catch (err) {
      console.error("Error loading student upload page:", err);
      setError("حدث خطأ أثناء تحميل الصفحة. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPageData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPageData]);

  const pendingCount = useMemo(() => {
    return myMaterials.filter((m) => m.status === "pending").length;
  }, [myMaterials]);

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setSelectedFile(file);
    setFormError("");
    if (file && !title.trim()) {
      const suggested = file.name.replace(/\.[^.]+$/, "").slice(0, MAX_TITLE_LENGTH);
      setTitle(suggested);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || submitting) return;

    setFormError("");

    if (!selectedCourseId) {
      setFormError("يرجى اختيار المقرر الدراسي أولاً.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("يرجى إدخال عنوان المادة التعليمية.");
      return;
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      setFormError("عنوان المادة يجب ألا يتجاوز " + MAX_TITLE_LENGTH + " حرفاً.");
      return;
    }

    if (pendingCount >= MAX_PENDING_UPLOADS) {
      setFormError(
        "لديك بالفعل " +
          MAX_PENDING_UPLOADS +
          " مواد قيد المراجعة. يرجى انتظار مراجعتها أو حذف إحدى المواد المعلقة قبل رفع مادة جديدة."
      );
      return;
    }

    let finalFileUrl = "";
    let finalKind = "document";
    let ext = "";
    let mimeType = "";

    if (uploadMode === "file") {
      if (!selectedFile) {
        setFormError("يرجى اختيار ملف أو مقطع صوتي لرفعه.");
        return;
      }

      ext = getFileExtension(selectedFile.name);
      const typeInfo = UPLOAD_TYPES[ext];
      if (!typeInfo) {
        setFormError(
          "نوع الملف غير مدعوم. الأنواع المسموحة: PDF، Word، PowerPoint، Excel، TXT، صور PNG/JPG، وملفات صوتية MP3/M4A/WAV/OGG."
        );
        return;
      }

      if (selectedFile.size <= 0) {
        setFormError("الملف المختار فارغ.");
        return;
      }

      if (selectedFile.size > MAX_STUDENT_UPLOAD_BYTES) {
        setFormError("حجم الملف أكبر من الحد المسموح به للطلاب (25 ميجابايت).");
        return;
      }

      if (
        selectedFile.type &&
        selectedFile.type !== "application/octet-stream" &&
        selectedFile.type !== typeInfo.mime
      ) {
        const isJpegVariant =
          (ext === "jpg" || ext === "jpeg") && selectedFile.type === "image/jpeg";
        const isAudioVariant =
          typeInfo.kind === "audio" && selectedFile.type.startsWith("audio/");
        if (!isJpegVariant && !isAudioVariant) {
          setFormError("نوع محتوى الملف لا يطابق امتداده. يرجى التأكد من سلامة الملف.");
          return;
        }
      }

      mimeType = typeInfo.mime;
      finalKind = typeInfo.kind;
    } else {
      const trimmedVideo = videoUrl.trim();
      if (!isValidHttpsUrl(trimmedVideo)) {
        setFormError("يرجى إدخال رابط فيديو صالح يبدأ بـ https:// حصراً.");
        return;
      }
      finalFileUrl = trimmedVideo;
      finalKind = "video";
    }

    setSubmitting(true);
    let uploadedStoragePath = null;

    try {
      if (uploadMode === "file") {
        const storagePath =
          selectedCourseId + "/student-uploads/" + user.id + "/" + generateUuid() + "." + ext;

        const { error: uploadErr } = await supabase.storage
          .from(MATERIALS_BUCKET)
          .upload(storagePath, selectedFile, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadErr) {
          console.error("Student storage upload error:", uploadErr);
          setFormError(getReadableError(uploadErr));
          setSubmitting(false);
          return;
        }

        uploadedStoragePath = storagePath;

        const { data: publicUrlData } = supabase.storage
          .from(MATERIALS_BUCKET)
          .getPublicUrl(storagePath);

        finalFileUrl = publicUrlData?.publicUrl || "";
        if (!isValidHttpsUrl(finalFileUrl)) {
          await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedStoragePath]);
          setFormError("تعذر استخراج رابط الملف بعد الرفع.");
          setSubmitting(false);
          return;
        }
      }

      const { error: insertErr } = await supabase.from("materials").insert({
        title: trimmedTitle,
        file_url: finalFileUrl,
        course_id: selectedCourseId,
        uploader_id: user.id,
        status: "pending",
        kind: finalKind,
      });

      if (insertErr) {
        if (uploadedStoragePath) {
          await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedStoragePath]);
        }
        setFormError(getReadableError(insertErr));
        return;
      }

      showToast("تم رفع المادة بنجاح وهي الآن قيد المراجعة من إدارة القسم.");
      setTitle("");
      setSelectedFile(null);
      setFileInputKey((k) => k + 1);
      setVideoUrl("");
      await loadPageData();
    } catch (err) {
      console.error("Unexpected error during student upload:", err);
      if (uploadedStoragePath) {
        await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedStoragePath]);
      }
      setFormError(getReadableError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePending = async (material) => {
    if (!material || material.status !== "pending" || deletingId) return;

    const confirmed = window.confirm(
      'هل أنت متأكد من حذف المادة المعلقة "' + material.title + '"؟'
    );
    if (!confirmed) return;

    setDeletingId(material.id);
    try {
      const { data: deletedRows, error: deleteErr } = await supabase
        .from("materials")
        .delete()
        .eq("id", material.id)
        .eq("status", "pending")
        .select("id");

      if (deleteErr) {
        showToast(getReadableError(deleteErr));
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        showToast("تعذر حذف المادة. قد تكون تمت مراجعتها بالفعل.");
        await loadPageData();
        return;
      }

      const storagePath = getStoragePathFromUrl(material.file_url);
      if (storagePath) {
        const { error: storageErr } = await supabase.storage
          .from(MATERIALS_BUCKET)
          .remove([storagePath]);
        if (storageErr) {
          console.error("Error cleaning up student file from storage:", storageErr);
        }
      }

      setMyMaterials((prev) => prev.filter((item) => item.id !== material.id));
      showToast("تم حذف المادة المعلقة وملفها بنجاح.");
    } catch (err) {
      console.error("Error deleting pending material:", err);
      showToast("حدث خطأ أثناء حذف المادة.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-4xl mx-auto my-8 shadow-xs">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري تحميل صفحة المساهمات...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-xs text-rose-600 leading-relaxed">{error}</p>
        <button
          onClick={loadPageData}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  if (profile?.role === "admin") {
    return (
      <div
        dir="rtl"
        className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 max-w-xl mx-auto my-8 shadow-xs"
      >
        <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
          <Library className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-slate-900">
            صفحة مساهمات الطلاب مخصصة لحسابات الطلاب
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            بصفتك مسؤولاً في النظام، يمكنك رفع واعتماد المواد مباشرة من صفحة إدارة المقررات والمناهج، أو مراجعة مساهمات الطلاب من صندوق المراجعة.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/admin/courses"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs"
          >
            <Library className="h-4 w-4" />
            <span>الانتقال إلى إدارة المناهج (Curriculum)</span>
          </Link>
          <Link
            href="/admin/inbox"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <Inbox className="h-4 w-4 text-amber-600" />
            <span>صندوق مراجعة المواد</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-8 animate-in fade-in duration-150 max-w-5xl mx-auto pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
                <Upload className="h-3.5 w-3.5" />
                <span>مساهمات الطلاب</span>
              </span>
              {profile?.academic_year && (
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {formatAcademicYear(profile.academic_year)}
                </span>
              )}
              {profile?.department && (
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  قسم {profile.department}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              رفع مادة أو ملخص دراسي
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              شارك الملخصات، المحاضرات المسجلة، والملفات الدراسية مع زملائك في الدفعة. تُنشر المساهمات للمقرر فور مراجعتها واعتمادها من مشرف القسم.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start">
            <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              معلقة حالياً: <strong>{pendingCount}</strong> / {MAX_PENDING_UPLOADS}
            </div>
            <button
              type="button"
              onClick={loadPageData}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={loading ? "h-3.5 w-3.5 text-slate-500 animate-spin" : "h-3.5 w-3.5 text-slate-500"} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" />
            <span>بيانات المادة المرفوعة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            اختر المقرر الدراسي وحدد نوع المساهمة (ملف أو تسجيل صوتي حتى 25 ميجابايت، أو رابط فيديو خارجي).
          </p>
        </div>

        {!profile?.department || profile?.academic_year == null ? (
          <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
            <p className="font-bold">لم يتم استكمال بيانات القسم والفرقة الدراسية</p>
            <p>يرجى استكمال بيانات ملفك الأكاديمي أولاً حتى تظهر لك المقررات المتاحة لفرقتك.</p>
          </div>
        ) : offeredCourses.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs text-center space-y-1">
            <p className="font-bold text-slate-800">لا توجد مقررات نشطة مخصصة لفرقتك حالياً</p>
            <p>ستتمكن من رفع المواد فور تخصيص المقررات الدراسية لقسمك وفرقتك من إدارة الكلية.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="break-words">{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  المقرر الدراسي *
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
                >
                  {offeredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    عنوان المادة *
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {title.length} / {MAX_TITLE_LENGTH}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={MAX_TITLE_LENGTH}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: ملخص المحاضرة الثالثة - الكيمياء العضوية"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                نوع الرفع *
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode("file");
                    setFormError("");
                  }}
                  className={
                    uploadMode === "file"
                      ? "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer bg-slate-900 text-white shadow-2xs"
                      : "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>ملف / صوت (يرفع على المنصة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUploadMode("video");
                    setFormError("");
                  }}
                  className={
                    uploadMode === "video"
                      ? "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer bg-slate-900 text-white shadow-2xs"
                      : "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>فيديو (رابط HTTPS خارجي)</span>
                </button>
              </div>
            </div>

            {uploadMode === "file" ? (
              <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="text-xs font-bold text-slate-700 block">
                  اختر الملف أو المقطع الصوتي *
                </label>
                <input
                  key={fileInputKey}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer file:ml-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-semibold"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  الامتدادات المسموحة: PDF، Word، PowerPoint، Excel، TXT، صور PNG/JPG، وصوتيات MP3/M4A/WAV/OGG. الحد الأقصى للحجم: <strong>25 ميجابايت</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="text-xs font-bold text-slate-700 block">
                  رابط الفيديو (HTTPS فقط) *
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  يمكنك وضع رابط محاضرة فيديو من YouTube أو Google Drive يبدأ بـ <code className="font-mono">https://</code>.
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting || pendingCount >= MAX_PENDING_UPLOADS}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>جاري الرفع والإرسال...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>إرسال للمراجعة</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">مساهماتي السابقة</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              سجل بجميع المواد التي قمت برفعها وحالتها الحالية. يمكنك حذف المواد التي لا تزال قيد المراجعة فقط.
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {myMaterials.length} مساهمة
          </span>
        </div>

        {myMaterials.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-slate-400">
            <Upload className="h-8 w-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">
              لم تقم برفع أي مساهمات دراسية حتى الآن.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {myMaterials.map((item) => {
              const course = coursesMap[item.course_id];
              const isPending = item.status === "pending";
              const isApproved = item.status === "approved";
              const isRejected = item.status === "rejected";

              return (
                <div
                  key={item.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {course?.code && (
                        <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                          {course.code}
                        </span>
                      )}
                      {course?.title && (
                        <span className="text-slate-500 font-medium truncate">
                          {course.title}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-[11px] inline-flex items-center gap-1">
                        {item.kind === "audio" ? (
                          <Music className="h-3 w-3 text-purple-600" />
                        ) : item.kind === "video" ? (
                          <Video className="h-3 w-3 text-blue-600" />
                        ) : (
                          <FileText className="h-3 w-3 text-slate-600" />
                        )}
                        {formatKind(item.kind)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {item.title}
                    </h3>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span>تاريخ الرفع: {formatArabicDate(item.created_at)}</span>
                      {isValidHttpsUrl(item.file_url) && (
                        <a
                          href={item.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          <span>معاينة الرابط</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>قيد المراجعة</span>
                      </span>
                    )}
                    {isApproved && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>مقبولة</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        <span>مرفوضة</span>
                      </span>
                    )}

                    {isPending && (
                      <button
                        type="button"
                        onClick={() => handleDeletePending(item)}
                        disabled={deletingId === item.id}
                        title="حذف المساهمة المعلقة"
                        className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}