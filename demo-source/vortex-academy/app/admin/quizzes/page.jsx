"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Search,
  Plus,
  Edit2,
  Eye,
  X,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Shield,
  CheckCircle2,
  FileText,
  Code,
  Users,
  Key,
  Clock,
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

const KIND_LABELS = {
  past_exam: "امتحان سابق",
  interactive: "اختبار تفاعلي",
};

const MATERIALS_BUCKET = "course-materials";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_HTML_BYTES = 512 * 1024; // 512 KB (matches the database CHECK)
const FILE_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

// Allowed uploads for exam / answer key files: extension -> MIME type
const FILE_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const EMPTY_FORM = {
  kind: "past_exam",
  title: "",
  courseId: "",
  year: "1",
  maxScore: "100",
  examMode: "upload", // "upload" | "link"
  examFile: null,
  examLink: "",
  keyMode: "none", // "none" | "upload" | "link"
  keyFile: null,
  keyLink: "",
  htmlMode: "file", // "file" | "paste"
  htmlFile: null,
  htmlText: "",
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

// Returns the Storage object path for a file in our own bucket, otherwise null
function getStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return null;
  const prefix = `${baseUrl}/storage/v1/object/public/${MATERIALS_BUCKET}/`;
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

function formatKind(kind) {
  return KIND_LABELS[kind] || "اختبار";
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return String(Math.round(num * 100) / 100);
}

// Result sent by an interactive quiz: { type: "vortex-quiz-result", score, total }
function parseQuizResultMessage(data) {
  if (!data || typeof data !== "object") return null;
  if (data.type !== "vortex-quiz-result") return null;
  const score = Number(data.score);
  const total = Number(data.total);
  if (!Number.isFinite(score) || !Number.isFinite(total)) return null;
  if (total <= 0 || score < 0 || score > total) return null;
  return { score, total };
}

// Self-reported result stored in quiz_attempts.answers by the student page
function getSelfReported(answers) {
  if (!answers || typeof answers !== "object") return null;
  return parseQuizResultMessage({ type: "vortex-quiz-result", ...(answers.self_reported || {}) });
}

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "23505") return "موجود بالفعل";
  if (err.code === "23514") return "قيمة غير مسموح بها";
  if (err.code === "23502") return "بيانات ناقصة. راجع إعدادات قاعدة البيانات.";
  if (err.code === "42P01") return "جدول مطلوب غير موجود. شغّل ملف supabase/quizzes-admin.sql أولاً.";
  if (err.code === "42703") return "عمود مطلوب غير موجود. شغّل ملف supabase/quizzes-admin.sql أولاً.";
  if (
    err.code === "42501" ||
    err.message?.toLowerCase().includes("permission") ||
    err.message?.toLowerCase().includes("row-level security") ||
    err.message?.toLowerCase().includes("policy")
  ) {
    return "ليس لديك صلاحية لهذا الإجراء";
  }
  if (err.message?.toLowerCase().includes("out of range")) {
    return "الدرجة خارج النطاق المسموح.";
  }
  return "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى.";
}

function getUploadErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع أثناء رفع الملف.";
  const message = String(err.message || "").toLowerCase();
  const status = String(err.statusCode || err.status || "");

  if (message.includes("bucket not found")) {
    return "لم يتم إعداد مخزن الملفات في Supabase بعد.";
  }
  if (status === "413" || message.includes("exceed") || message.includes("too large")) {
    return "حجم الملف أكبر من الحد المسموح.";
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
    return "ليس لديك صلاحية لرفع ملفات لهذا المقرر";
  }
  return "حدث خطأ أثناء رفع الملف. يرجى المحاولة مرة أخرى.";
}

function ModalShell({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-2xl border border-slate-200 w-full ${
          wide ? "max-w-4xl" : "max-w-xl"
        } shadow-xl my-6`}
      >
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

export default function AdminQuizzesPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = all departments)
  const [deptFilter, setDeptFilter] = useState("");

  // Data
  const [quizzes, setQuizzes] = useState([]);
  const [coursesMap, setCoursesMap] = useState({});
  const [statsMap, setStatsMap] = useState({});
  const [keyMap, setKeyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const [toastMessage, setToastMessage] = useState(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editQuiz, setEditQuiz] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editYear, setEditYear] = useState("1");
  const [editError, setEditError] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Grading panel
  const [gradingQuiz, setGradingQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [gradingKeyUrl, setGradingKeyUrl] = useState(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [expandedAttempts, setExpandedAttempts] = useState({});
  const [gradeFilter, setGradeFilter] = useState("all"); // "all" | "pending" | "graded"
  const [savingId, setSavingId] = useState(null);

  // Preview of an interactive quiz
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const previewFrameRef = useRef(null);

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

  // Attempt counters (view quiz_attempt_stats, RLS applies through security_invoker)
  const loadStats = useCallback(async () => {
    const { data, error } = await supabase
      .from("quiz_attempt_stats")
      .select("quiz_id, total_attempts, pending_attempts");
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      map[row.quiz_id] = {
        total: Number(row.total_attempts) || 0,
        pending: Number(row.pending_attempts) || 0,
      };
    });
    setStatsMap(map);
  }, []);

  // 2) Load quizzes, courses, answer-key flags and counters
  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let quizQuery = supabase
        .from("quizzes")
        .select("id, course_id, department, academic_year, kind, title, exam_file_url, max_score, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      let courseQuery = supabase
        .from("courses")
        .select("id, code, title, department, status")
        .order("code", { ascending: true })
        .limit(500);

      if (scopeDepartment) {
        quizQuery = quizQuery.eq("department", scopeDepartment);
        courseQuery = courseQuery.eq("department", scopeDepartment);
      }

      const [quizRes, courseRes, keyRes] = await Promise.all([
        quizQuery,
        courseQuery,
        supabase.from("quiz_answer_keys").select("quiz_id"),
      ]);

      if (quizRes.error) throw quizRes.error;
      if (courseRes.error) throw courseRes.error;
      if (keyRes.error) throw keyRes.error;

      setQuizzes(quizRes.data || []);

      const cMap = {};
      (courseRes.data || []).forEach((c) => {
        cMap[c.id] = c;
      });
      setCoursesMap(cMap);

      const kMap = {};
      (keyRes.data || []).forEach((k) => {
        kMap[k.quiz_id] = true;
      });
      setKeyMap(kMap);

      await loadStats();
    } catch (err) {
      console.error("Error fetching quizzes:", err);
      setErrorMsg(getDatabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, scopeDepartment, loadStats]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadData]);

  // Listen to results sent by the interactive quiz inside the preview iframe
  useEffect(() => {
    if (!previewQuiz) return;
    const handler = (event) => {
      if (!previewFrameRef.current || event.source !== previewFrameRef.current.contentWindow) return;
      const parsed = parseQuizResultMessage(event.data);
      if (parsed) setPreviewResult(parsed);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [previewQuiz]);

  const filteredQuizzes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      if (kindFilter !== "all" && quiz.kind !== kindFilter) return false;
      if (yearFilter !== "all" && Number(quiz.academic_year) !== Number(yearFilter)) return false;
      if (!q) return true;
      const course = coursesMap[quiz.course_id];
      return (
        quiz.title?.toLowerCase().includes(q) ||
        course?.code?.toLowerCase().includes(q) ||
        course?.title?.toLowerCase().includes(q)
      );
    });
  }, [quizzes, searchQuery, kindFilter, yearFilter, coursesMap]);

  const totals = useMemo(() => {
    let attemptsTotal = 0;
    let pending = 0;
    quizzes.forEach((quiz) => {
      const s = statsMap[quiz.id];
      if (s) {
        attemptsTotal += s.total;
        pending += s.pending;
      }
    });
    return { quizzes: quizzes.length, attempts: attemptsTotal, pending };
  }, [quizzes, statsMap]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setForm({ ...EMPTY_FORM, year: String(allowedYears[0] || 1) });
    setFormError(null);
    setShowCreate(true);
  };

  // 3) Create quiz: validate, upload files, insert quiz, insert answer key (rollback on failure)
  const handleCreate = async () => {
    if (!admin || saving) return;
    setFormError(null);

    const title = form.title.trim();
    if (title.length < 3 || title.length > 200) {
      setFormError("عنوان الاختبار يجب أن يكون بين 3 و200 حرف.");
      return;
    }

    const course = coursesMap[form.courseId];
    if (!course) {
      setFormError("اختر المقرر الذي يتبعه الاختبار.");
      return;
    }

    const year = Number(form.year);
    if (!allowedYears.includes(year)) {
      setFormError("اختر الفرقة الدراسية.");
      return;
    }

    const maxScore = Number(form.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
      setFormError("الدرجة النهائية يجب أن تكون رقماً بين 1 و1000.");
      return;
    }

    const isInteractive = form.kind === "interactive";
    let htmlText = null;
    let examUpload = null; // { file, ext }
    let keyUpload = null;
    let examUrl = null;
    let keyUrl = null;

    if (isInteractive) {
      try {
        if (form.htmlMode === "file") {
          if (!form.htmlFile) {
            setFormError("اختر ملف HTML الخاص بالاختبار.");
            return;
          }
          const ext = getFileExtension(form.htmlFile.name);
          if (ext !== "html" && ext !== "htm") {
            setFormError("الملف يجب أن يكون بصيغة HTML.");
            return;
          }
          htmlText = await form.htmlFile.text();
        } else {
          htmlText = form.htmlText;
        }
      } catch (err) {
        console.error("Read HTML file error:", err);
        setFormError("تعذر قراءة ملف HTML.");
        return;
      }

      if (!htmlText || !htmlText.trim() || !htmlText.includes("<")) {
        setFormError("محتوى HTML فارغ أو غير صالح.");
        return;
      }
      if (new Blob([htmlText]).size > MAX_HTML_BYTES) {
        setFormError("حجم ملف HTML أكبر من 512 كيلوبايت.");
        return;
      }
    } else {
      if (form.examMode === "upload") {
        if (!form.examFile) {
          setFormError("اختر ملف أسئلة الامتحان.");
          return;
        }
        const ext = getFileExtension(form.examFile.name);
        if (!FILE_TYPES[ext]) {
          setFormError("نوع ملف الأسئلة غير مسموح (PDF أو Word أو صورة).");
          return;
        }
        if (form.examFile.size > MAX_UPLOAD_BYTES) {
          setFormError("حجم ملف الأسئلة أكبر من 50 ميجابايت.");
          return;
        }
        examUpload = { file: form.examFile, ext };
      } else {
        if (!isValidHttpsUrl(form.examLink)) {
          setFormError("رابط الأسئلة يجب أن يبدأ بـ https://");
          return;
        }
        examUrl = form.examLink.trim();
      }

      if (form.keyMode === "upload") {
        if (!form.keyFile) {
          setFormError("اختر ملف نموذج الإجابة أو غيّر الخيار إلى (بدون).");
          return;
        }
        const ext = getFileExtension(form.keyFile.name);
        if (!FILE_TYPES[ext]) {
          setFormError("نوع ملف نموذج الإجابة غير مسموح (PDF أو Word أو صورة).");
          return;
        }
        if (form.keyFile.size > MAX_UPLOAD_BYTES) {
          setFormError("حجم ملف نموذج الإجابة أكبر من 50 ميجابايت.");
          return;
        }
        keyUpload = { file: form.keyFile, ext };
      } else if (form.keyMode === "link") {
        if (!isValidHttpsUrl(form.keyLink)) {
          setFormError("رابط نموذج الإجابة يجب أن يبدأ بـ https://");
          return;
        }
        keyUrl = form.keyLink.trim();
      }
    }

    setSaving(true);
    const uploadedPaths = [];

    const rollbackFiles = async () => {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(MATERIALS_BUCKET).remove(uploadedPaths);
      }
    };

    const uploadFile = async (upload) => {
      // Files live under <course_id>/<random-uuid>.<ext> so the storage policy can check the course
      const path = `${course.id}/${crypto.randomUUID()}.${upload.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(MATERIALS_BUCKET)
        .upload(path, upload.file, {
          contentType: FILE_TYPES[upload.ext],
          upsert: false,
          cacheControl: "3600",
        });
      if (uploadError) {
        console.error("Upload error:", uploadError);
        return { error: uploadError };
      }
      uploadedPaths.push(path);
      const { data: publicData } = supabase.storage.from(MATERIALS_BUCKET).getPublicUrl(path);
      return { url: publicData?.publicUrl || null };
    };

    try {
      if (examUpload) {
        const res = await uploadFile(examUpload);
        if (res.error || !isValidHttpOrHttpsUrl(res.url)) {
          setFormError(res.error ? getUploadErrorMessage(res.error) : "تعذر الحصول على رابط الملف.");
          await rollbackFiles();
          setSaving(false);
          return;
        }
        examUrl = res.url;
      }

      if (keyUpload) {
        const res = await uploadFile(keyUpload);
        if (res.error || !isValidHttpOrHttpsUrl(res.url)) {
          setFormError(res.error ? getUploadErrorMessage(res.error) : "تعذر الحصول على رابط الملف.");
          await rollbackFiles();
          setSaving(false);
          return;
        }
        keyUrl = res.url;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("quizzes")
        .insert({
          course_id: course.id,
          department: course.department,
          academic_year: year,
          kind: form.kind,
          title,
          exam_file_url: isInteractive ? null : examUrl,
          html_content: isInteractive ? htmlText : null,
          max_score: maxScore,
          created_by: admin.id,
        })
        .select("id");

      if (insertError || !inserted || inserted.length === 0) {
        setFormError(
          insertError ? getDatabaseErrorMessage(insertError) : "لم يتم حفظ الاختبار (صلاحيات غير كافية)."
        );
        await rollbackFiles();
        setSaving(false);
        return;
      }

      const newQuizId = inserted[0].id;

      if (keyUrl) {
        const { data: keyInserted, error: keyError } = await supabase
          .from("quiz_answer_keys")
          .insert({ quiz_id: newQuizId, answer_key_file_url: keyUrl })
          .select("quiz_id");

        if (keyError || !keyInserted || keyInserted.length === 0) {
          // Undo the quiz so we never leave a half-created record
          await supabase.from("quizzes").delete().eq("id", newQuizId);
          await rollbackFiles();
          setFormError(
            keyError ? getDatabaseErrorMessage(keyError) : "تعذر حفظ نموذج الإجابة، لم يتم إنشاء الاختبار."
          );
          setSaving(false);
          return;
        }
      }

      setShowCreate(false);
      showToast("تم إنشاء الاختبار بنجاح.");
      await loadData();
    } catch (err) {
      console.error("Create quiz error:", err);
      await rollbackFiles();
      setFormError("حدث خطأ غير متوقع أثناء إنشاء الاختبار.");
    } finally {
      setSaving(false);
    }
  };

  // 4) Edit title / academic year
  const openEditModal = (quiz) => {
    setEditQuiz(quiz);
    setEditTitle(quiz.title || "");
    setEditYear(String(Number(quiz.academic_year) || 1));
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editQuiz || editSaving) return;
    const title = editTitle.trim();
    const year = Number(editYear);

    if (title.length < 3 || title.length > 200) {
      setEditError("عنوان الاختبار يجب أن يكون بين 3 و200 حرف.");
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
        .from("quizzes")
        .update({ title, academic_year: year })
        .eq("id", editQuiz.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        setEditError("لم يتم الحفظ: ليس لديك صلاحية لتعديل هذا الاختبار.");
        return;
      }

      setQuizzes((prev) =>
        prev.map((q) => (q.id === editQuiz.id ? { ...q, title, academic_year: year } : q))
      );
      setEditQuiz(null);
      showToast("تم حفظ التعديلات.");
    } catch (err) {
      setEditError(getDatabaseErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  // 5) Delete quiz (attempts and answer key are removed by cascade), then clean our own storage files
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { data: keyRow } = await supabase
        .from("quiz_answer_keys")
        .select("answer_key_file_url")
        .eq("quiz_id", deleteTarget.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("quizzes")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast("لم يتم الحذف: ليس لديك صلاحية لهذا الاختبار.");
        return;
      }

      const paths = [
        getStoragePathFromUrl(deleteTarget.exam_file_url),
        getStoragePathFromUrl(keyRow?.answer_key_file_url),
      ].filter(Boolean);

      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from(MATERIALS_BUCKET).remove(paths);
        if (storageError) console.error("Storage cleanup error:", storageError);
      }

      setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("تم حذف الاختبار.");
    } catch (err) {
      showToast(getDatabaseErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // 6) Grading
  const openGrading = async (quiz) => {
    setGradingQuiz(quiz);
    setAttempts([]);
    setProfilesMap({});
    setScoreInputs({});
    setExpandedAttempts({});
    setGradeFilter("all");
    setGradingKeyUrl(null);
    setAttemptsError(null);
    setAttemptsLoading(true);

    try {
      const { data, error } = await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, student_id, score, answers, submitted_at")
        .eq("quiz_id", quiz.id)
        .order("submitted_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      const rows = data || [];
      setAttempts(rows);

      const inputs = {};
      rows.forEach((row) => {
        inputs[row.id] = row.score === null || row.score === undefined ? "" : formatScore(row.score);
      });
      setScoreInputs(inputs);

      const studentIds = [...new Set(rows.map((r) => r.student_id))];
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 100) {
        chunks.push(studentIds.slice(i, i + 100));
      }

      const profileResults = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from("profile_directory")
            .select("id, full_name, student_id, student_badge_id")
            .in("id", ids)
        )
      );

      const pMap = {};
      profileResults.forEach((res) => {
        if (res.error) throw res.error;
        (res.data || []).forEach((p) => {
          pMap[p.id] = p;
        });
      });
      setProfilesMap(pMap);

      const { data: keyRow } = await supabase
        .from("quiz_answer_keys")
        .select("answer_key_file_url")
        .eq("quiz_id", quiz.id)
        .maybeSingle();
      setGradingKeyUrl(keyRow?.answer_key_file_url || null);
    } catch (err) {
      setAttemptsError(getDatabaseErrorMessage(err));
    } finally {
      setAttemptsLoading(false);
    }
  };

  const closeGrading = () => {
    setGradingQuiz(null);
    loadStats().catch((err) => console.error("Refresh stats error:", err));
  };

  const writeScore = async (attempt, value) => {
    setSavingId(attempt.id);
    try {
      const { data, error } = await supabase
        .from("quiz_attempts")
        .update({ score: value })
        .eq("id", attempt.id)
        .select("id, score");

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast("لم يتم الحفظ: ليس لديك صلاحية لهذه الإجابة.");
        return;
      }

      const saved = data[0].score === null ? null : Number(data[0].score);
      setAttempts((prev) => prev.map((a) => (a.id === attempt.id ? { ...a, score: saved } : a)));
      setScoreInputs((prev) => ({ ...prev, [attempt.id]: saved === null ? "" : formatScore(saved) }));
      showToast(saved === null ? "أُعيدت الإجابة إلى قيد التصحيح." : "تم حفظ الدرجة.");
    } catch (err) {
      showToast(getDatabaseErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveScore = (attempt) => {
    const max = Number(gradingQuiz?.max_score) || 100;
    const raw = String(scoreInputs[attempt.id] ?? "").trim();
    if (raw === "") {
      showToast("أدخل الدرجة أولاً.");
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      showToast(`الدرجة يجب أن تكون بين 0 و${formatScore(max)}.`);
      return;
    }
    writeScore(attempt, Math.round(value * 100) / 100);
  };

  const handleAcceptSelfReported = (attempt, selfReported) => {
    const max = Number(gradingQuiz?.max_score) || 100;
    const value = Math.round((selfReported.score / selfReported.total) * max * 100) / 100;
    writeScore(attempt, value);
  };

  // 7) Preview an interactive quiz (HTML is fetched on demand, never rendered outside a sandboxed iframe)
  const openPreview = async (quiz) => {
    try {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, html_content")
        .eq("id", quiz.id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.html_content) {
        showToast("لا يوجد محتوى HTML لهذا الاختبار.");
        return;
      }
      setPreviewResult(null);
      setPreviewQuiz({ id: data.id, title: data.title, html: data.html_content });
    } catch (err) {
      showToast(getDatabaseErrorMessage(err));
    }
  };

  const visibleAttempts = useMemo(() => {
    if (gradeFilter === "pending") return attempts.filter((a) => a.score === null);
    if (gradeFilter === "graded") return attempts.filter((a) => a.score !== null);
    return attempts;
  }, [attempts, gradeFilter]);

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
  const coursesList = Object.values(coursesMap);
  const gradingMax = Number(gradingQuiz?.max_score) || 100;

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
              <ClipboardCheck className="h-3.5 w-3.5" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">الاختبارات والتصحيح · {scopeLabel}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">Quizzes & Grading</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            إنشاء الامتحانات السابقة والاختبارات التفاعلية، ورفع نماذج الإجابة، وتصحيح إجابات الطلاب ورصد الدرجات.
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

          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة اختبار جديد</span>
          </button>

          <button
            onClick={loadData}
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
          <span>حسابك غير مرتبط بقسم، لذلك لن تظهر لك أي اختبارات. اطلب من المسؤول الأعلى تحديد القسم.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">إجمالي الاختبارات</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.quizzes}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">إجابات الطلاب المسلّمة</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.attempts}</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs">
          <p className="text-xs text-amber-700 font-medium">بانتظار التصحيح</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totals.pending}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بعنوان الاختبار أو كود المقرر..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:outline-hidden transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
            dir="rtl"
          >
            <option value="all">كل الأنواع</option>
            <option value="past_exam">{KIND_LABELS.past_exam}</option>
            <option value="interactive">{KIND_LABELS.interactive}</option>
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
            dir="rtl"
          >
            <option value="all">كل الفرق</option>
            {allowedYears.map((y) => (
              <option key={y} value={y}>
                {formatAcademicYear(y)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quizzes list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-xs">
          <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-3">جاري تحميل الاختبارات...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-slate-900">لا توجد اختبارات</p>
          <p className="text-xs text-slate-500">
            {quizzes.length === 0
              ? "ابدأ بإضافة أول اختبار لقسمك."
              : "لا توجد نتائج مطابقة للبحث أو الفلاتر الحالية."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuizzes.map((quiz) => {
            const course = coursesMap[quiz.course_id];
            const stats = statsMap[quiz.id] || { total: 0, pending: 0 };
            const interactive = quiz.kind === "interactive";
            return (
              <div
                key={quiz.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      interactive ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {interactive ? <Code className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{quiz.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold border ${
                          interactive
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : "bg-blue-50 text-blue-700 border-blue-100"
                        }`}
                      >
                        {formatKind(quiz.kind)}
                      </span>
                      {course && (
                        <span className="font-semibold text-slate-700">
                          {course.code}
                        </span>
                      )}
                      <span>{formatAcademicYear(quiz.academic_year)}</span>
                      {isSuper && <span>· {quiz.department}</span>}
                      <span>· من {formatScore(quiz.max_score)} درجة</span>
                      {!interactive && (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            keyMap[quiz.id] ? "text-emerald-600" : "text-slate-400"
                          }`}
                        >
                          <Key className="h-3 w-3" />
                          {keyMap[quiz.id] ? "نموذج الإجابة مرفوع" : "بدون نموذج إجابة"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Users className="h-3 w-3" />
                        {stats.total} إجابة
                      </span>
                      {stats.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          <Clock className="h-3 w-3" />
                          {stats.pending} بانتظار التصحيح
                        </span>
                      ) : stats.total > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle2 className="h-3 w-3" />
                          تم تصحيح الكل
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    onClick={() => openGrading(quiz)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span>التصحيح</span>
                  </button>
                  {interactive && (
                    <button
                      onClick={() => openPreview(quiz)}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>معاينة</span>
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(quiz)}
                    className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                    title="تعديل"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(quiz)}
                    className="p-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* Create modal                                                          */}
      {/* ===================================================================== */}
      {showCreate && (
        <ModalShell
          title="إضافة اختبار جديد"
          subtitle="يظهر الاختبار تلقائياً لطلاب قسم المقرر في الفرقة المحددة."
          onClose={() => !saving && setShowCreate(false)}
        >
          <div className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Kind */}
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(KIND_LABELS).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => updateForm("kind", k)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    form.kind === k
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">عنوان الاختبار</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                maxLength={200}
                placeholder="مثال: امتحان نهاية الفصل الأول 2025"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">المقرر</label>
              <select
                value={form.courseId}
                onChange={(e) => updateForm("courseId", e.target.value)}
                className={`${inputClass} cursor-pointer`}
                dir="rtl"
              >
                <option value="">اختر المقرر...</option>
                {coursesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                    {isSuper ? ` (${c.department})` : ""}
                  </option>
                ))}
              </select>
              {coursesList.length === 0 && (
                <p className="text-[11px] text-amber-700">لا توجد مقررات متاحة. أضف مقرراً من صفحة الخطة الدراسية أولاً.</p>
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
                <label className="text-xs font-semibold text-slate-700 block">الدرجة النهائية</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step="any"
                  value={form.maxScore}
                  onChange={(e) => updateForm("maxScore", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {form.kind === "past_exam" ? (
              <>
                {/* Exam file */}
                <div className="space-y-2 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">ملف الأسئلة</label>
                    <div className="flex items-center gap-1 text-[11px]">
                      {["upload", "link"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateForm("examMode", m)}
                          className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                            form.examMode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white"
                          }`}
                        >
                          {m === "upload" ? "رفع ملف" : "رابط"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.examMode === "upload" ? (
                    <input
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(e) => updateForm("examFile", e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:cursor-pointer"
                    />
                  ) : (
                    <input
                      type="url"
                      dir="ltr"
                      value={form.examLink}
                      onChange={(e) => updateForm("examLink", e.target.value)}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  )}
                </div>

                {/* Answer key */}
                <div className="space-y-2 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      نموذج الإجابة <span className="text-slate-400 font-normal">(اختياري)</span>
                    </label>
                    <div className="flex items-center gap-1 text-[11px]">
                      {[
                        ["none", "بدون"],
                        ["upload", "رفع ملف"],
                        ["link", "رابط"],
                      ].map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateForm("keyMode", m)}
                          className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                            form.keyMode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.keyMode === "upload" && (
                    <input
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(e) => updateForm("keyFile", e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:cursor-pointer"
                    />
                  )}
                  {form.keyMode === "link" && (
                    <input
                      type="url"
                      dir="ltr"
                      value={form.keyLink}
                      onChange={(e) => updateForm("keyLink", e.target.value)}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  )}
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    لا يراه الطالب إلا بعد تسليم إجابته. محفوظ في جدول منفصل للمسؤولين.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">ملف الاختبار (HTML)</label>
                  <div className="flex items-center gap-1 text-[11px]">
                    {[
                      ["file", "رفع ملف"],
                      ["paste", "لصق الكود"],
                    ].map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateForm("htmlMode", m)}
                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                          form.htmlMode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.htmlMode === "file" ? (
                  <input
                    type="file"
                    accept=".html,.htm,text/html"
                    onChange={(e) => updateForm("htmlFile", e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:cursor-pointer"
                  />
                ) : (
                  <textarea
                    dir="ltr"
                    rows={8}
                    value={form.htmlText}
                    onChange={(e) => updateForm("htmlText", e.target.value)}
                    placeholder="<!doctype html>..."
                    className={`${inputClass} font-mono`}
                  />
                )}
                <div className="text-[11px] text-slate-500 leading-relaxed space-y-1">
                  <p>
                    يعمل الاختبار داخل إطار معزول (sandbox) ولا يمكنه الوصول لبيانات الموقع. الحد الأقصى 512 كيلوبايت،
                    ويجب أن يكون الملف مكتفياً بذاته.
                  </p>
                  <p>لتسجيل نتيجة الطالب أرسل هذه الرسالة من الصفحة عند انتهاء الحل:</p>
                  <code
                    dir="ltr"
                    className="block p-2 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 overflow-x-auto"
                  >
                    {`window.parent.postMessage({ type: "vortex-quiz-result", score: 8, total: 10 }, "*");`}
                  </code>
                  <p>تُعتبر النتيجة للمذاكرة الذاتية، ويعتمدها المصحّح يدوياً كدرجة رسمية.</p>
                </div>
              </div>
            )}

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
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <span>حفظ الاختبار</span>
                )}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Edit modal */}
      {editQuiz && (
        <ModalShell title="تعديل الاختبار" onClose={() => !editSaving && setEditQuiz(null)}>
          <div className="space-y-4">
            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">عنوان الاختبار</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className={inputClass}
              />
            </div>
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
            <p className="text-[11px] text-slate-500 leading-relaxed">
              لتغيير الملفات أو الدرجة النهائية احذف الاختبار وأنشئه من جديد.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditQuiz(null)}
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
        <ModalShell title="حذف الاختبار؟" onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                سيتم حذف «{deleteTarget.title}» نهائياً مع كل إجابات الطلاب ودرجاتهم ونموذج الإجابة. لا يمكن التراجع.
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

      {/* ===================================================================== */}
      {/* Grading panel                                                         */}
      {/* ===================================================================== */}
      {gradingQuiz && (
        <ModalShell
          wide
          title={`تصحيح: ${gradingQuiz.title}`}
          subtitle={`${formatKind(gradingQuiz.kind)} · ${formatAcademicYear(gradingQuiz.academic_year)} · الدرجة النهائية ${formatScore(gradingMax)}`}
          onClose={closeGrading}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-[11px]">
                {[
                  ["all", "الكل"],
                  ["pending", "بانتظار التصحيح"],
                  ["graded", "تم تصحيحها"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setGradeFilter(value)}
                    className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      gradeFilter === value
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {isValidHttpOrHttpsUrl(gradingQuiz.exam_file_url) && (
                  <a
                    href={gradingQuiz.exam_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    ملف الأسئلة
                  </a>
                )}
                {isValidHttpOrHttpsUrl(gradingKeyUrl) && (
                  <a
                    href={gradingKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold"
                  >
                    <Key className="h-3.5 w-3.5" />
                    نموذج الإجابة
                  </a>
                )}
              </div>
            </div>

            {attemptsError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {attemptsError}
              </div>
            )}

            {attemptsLoading ? (
              <div className="py-12 text-center">
                <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 mt-3">جاري تحميل إجابات الطلاب...</p>
              </div>
            ) : visibleAttempts.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {attempts.length === 0 ? "لم يسلّم أي طالب إجابته بعد." : "لا توجد إجابات في هذا الفلتر."}
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {visibleAttempts.map((attempt) => {
                  const profile = profilesMap[attempt.student_id];
                  const selfReported = getSelfReported(attempt.answers);
                  const text =
                    attempt.answers && typeof attempt.answers.submission_text === "string"
                      ? attempt.answers.submission_text
                      : "";
                  const expanded = expandedAttempts[attempt.id] === true;
                  const isLong = text.length > 600;
                  const graded = attempt.score !== null && attempt.score !== undefined;
                  const busy = savingId === attempt.id;

                  return (
                    <div key={attempt.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {profile?.full_name || "طالب غير معروف"}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {profile?.student_id || "—"}
                            {profile?.student_badge_id ? ` · ${profile.student_badge_id}` : ""} · سُلّمت{" "}
                            {formatDateTime(attempt.submitted_at)}
                          </p>
                        </div>
                        {graded ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {formatScore(attempt.score)} / {formatScore(gradingMax)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            بانتظار التصحيح
                          </span>
                        )}
                      </div>

                      {text && (
                        <div className="space-y-1">
                          <div
                            className={`text-xs text-slate-800 leading-relaxed whitespace-pre-wrap wrap-break-word bg-slate-50 border border-slate-200 rounded-lg p-3 ${
                              expanded ? "max-h-96 overflow-y-auto" : "max-h-32 overflow-hidden"
                            }`}
                          >
                            {text}
                          </div>
                          {isLong && (
                            <button
                              onClick={() =>
                                setExpandedAttempts((prev) => ({ ...prev, [attempt.id]: !expanded }))
                              }
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                            >
                              {expanded ? "إخفاء" : "عرض الإجابة كاملة"}
                            </button>
                          )}
                        </div>
                      )}

                      {!text && !selfReported && (
                        <p className="text-[11px] text-slate-400">لا يوجد نص إجابة مسجل.</p>
                      )}

                      {selfReported && (
                        <div className="flex items-center justify-between gap-2 flex-wrap p-3 rounded-lg bg-violet-50 border border-violet-100 text-xs">
                          <span className="text-violet-800">
                            نتيجة الطالب في الاختبار التفاعلي (مذاكرة ذاتية):{" "}
                            <strong>
                              {formatScore(selfReported.score)} / {formatScore(selfReported.total)}
                            </strong>
                          </span>
                          {!graded && (
                            <button
                              onClick={() => handleAcceptSelfReported(attempt, selfReported)}
                              disabled={busy}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                            >
                              اعتماد كدرجة رسمية
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <input
                          type="number"
                          min={0}
                          max={gradingMax}
                          step="any"
                          value={scoreInputs[attempt.id] ?? ""}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({ ...prev, [attempt.id]: e.target.value }))
                          }
                          placeholder={`0 - ${formatScore(gradingMax)}`}
                          className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:outline-hidden"
                        />
                        <button
                          onClick={() => handleSaveScore(attempt)}
                          disabled={busy}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {busy ? "جاري الحفظ..." : graded ? "تحديث الدرجة" : "حفظ الدرجة"}
                        </button>
                        {graded && (
                          <button
                            onClick={() => writeScore(attempt, null)}
                            disabled={busy}
                            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            إعادة للتصحيح
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Interactive quiz preview (sandboxed iframe only) */}
      {previewQuiz && (
        <ModalShell
          wide
          title={`معاينة: ${previewQuiz.title}`}
          subtitle="هكذا سيظهر الاختبار للطالب. أنهِ الحل لتتأكد أن النتيجة تصل للنظام."
          onClose={() => setPreviewQuiz(null)}
        >
          <div className="space-y-3">
            <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <iframe
                ref={previewFrameRef}
                sandbox="allow-scripts"
                srcDoc={previewQuiz.html}
                className="w-full h-[480px] border-0"
                title={previewQuiz.title}
              />
            </div>
            {previewResult ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  وصلت نتيجة صحيحة من الاختبار: {formatScore(previewResult.score)} / {formatScore(previewResult.total)}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                لم تصل أي نتيجة بعد. إن لم يرسل الاختبار الرسالة المطلوبة فسيُسلَّم من الطالب دون نتيجة تلقائية.
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
