"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  Plus,
  Edit2,
  Eye,
  Clock,
  CheckCircle2,
  FileText,
  Archive,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  AlertCircle,
  Building2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  GraduationCap,
  Music,
  Check,
  AlertTriangle,
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

function isValidHttpsUrl(string) {
  if (!string || typeof string !== "string") return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === "https:";
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

function formatKind(kind) {
  if (kind === "audio") return "صوتي";
  if (kind === "video") return "فيديو (رابط)";
  return "ملف / وثيقة";
}

const MATERIALS_BUCKET = "course-materials";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.mp3,.m4a,.wav,.ogg";

// Allowed file types: extension -> MIME type sent to Storage + material kind
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

function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

// Returns the Storage object path for a file uploaded to our own bucket, otherwise null
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

function getDatabaseErrorMessage(err) {
  if (!err) return "حدث خطأ غير متوقع.";
  console.error("Supabase Error:", err);
  if (err.code === "23505") {
    if (err.message?.includes("code") || err.details?.includes("code")) {
      return "كود المقرر موجود بالفعل";
    }
    return "موجود بالفعل";
  }
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

export default function AdminCurriculumPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = all departments)
  const [deptFilter, setDeptFilter] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All"); // "All" | "active" | "draft" | "archived"

  // Courses & Offerings State
  const [courses, setCourses] = useState([]);
  const [offeringsMap, setOfferingsMap] = useState({}); // course_id -> [offerings]
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Expanded course ID for Offerings & Materials management
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsError, setMaterialsError] = useState(null);

  // Add Material Form State
  const [matTitle, setMatTitle] = useState("");
  const [matKind, setMatKind] = useState("document");
  const [matUrl, setMatUrl] = useState("");
  const [matMode, setMatMode] = useState("upload"); // "upload" | "link"
  const [matFile, setMatFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [matSubmitting, setMatSubmitting] = useState(false);
  const [matFormError, setMatFormError] = useState("");

  // Add Offering Form State
  const [offYear, setOffYear] = useState(1);
  const [offDept, setOffDept] = useState("");
  const [offSubmitting, setOffSubmitting] = useState(false);
  const [offFormError, setOffFormError] = useState("");

  // Course Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseFormData, setCourseFormData] = useState({
    code: "",
    title: "",
    description: "",
    status: "draft",
    capacity: 40,
    department: "",
  });
  const [courseFormError, setCourseFormError] = useState("");
  const [isSavingCourse, setIsSavingCourse] = useState(false);

  // Action busy indicators
  const [busyActionId, setBusyActionId] = useState(null);

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
  const scopeDepartment = isSuper ? deptFilter : (admin?.department || "");

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

  // 2) Load Courses & their Offerings
  const loadCourses = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let query = supabase
        .from("courses")
        .select("id, code, title, description, department, status, capacity, created_at")
        .order("created_at", { ascending: false });

      if (scopeDepartment) {
        query = query.eq("department", scopeDepartment);
      }

      if (selectedStatus !== "All") {
        query = query.eq("status", selectedStatus);
      }

      const { data: coursesData, error: coursesErr } = await query;
      if (coursesErr) throw coursesErr;

      const loadedCourses = coursesData || [];
      setCourses(loadedCourses);

      // Load Offerings for the loaded courses
      const courseIds = loadedCourses.map((c) => c.id);
      if (courseIds.length > 0) {
        const { data: offeringsData, error: offeringsErr } = await supabase
          .from("course_offerings")
          .select("id, course_id, department, academic_year, created_at")
          .in("course_id", courseIds);

        if (offeringsErr) throw offeringsErr;

        const newOfferingsMap = {};
        (offeringsData || []).forEach((off) => {
          if (!newOfferingsMap[off.course_id]) {
            newOfferingsMap[off.course_id] = [];
          }
          newOfferingsMap[off.course_id].push(off);
        });
        setOfferingsMap(newOfferingsMap);
      } else {
        setOfferingsMap({});
      }
    } catch (err) {
      console.error("Error fetching courses:", err);
      setErrorMsg("حدث خطأ أثناء تحميل بيانات المقررات.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, scopeDepartment, selectedStatus]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadCourses();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadCourses]);

  // 3) Load Materials for the Expanded Course (load only when expanded)
  const loadMaterialsForCourse = useCallback(async (courseId) => {
    if (!courseId) {
      setCourseMaterials([]);
      return;
    }
    setLoadingMaterials(true);
    setMaterialsError(null);

    try {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, file_url, course_id, uploader_id, status, kind, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCourseMaterials(data || []);
    } catch (err) {
      console.error("Error loading course materials:", err);
      setMaterialsError("حدث خطأ أثناء تحميل مواد المقرر.");
    } finally {
      setLoadingMaterials(false);
    }
  }, []);

  const handleToggleExpandCourse = (courseId) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      setCourseMaterials([]);
    } else {
      setExpandedCourseId(courseId);
      // Reset forms
      setMatTitle("");
      setMatUrl("");
      setMatKind("document");
      setMatFormError("");
      setMatMode("upload");
      setMatFile(null);
      setFileInputKey((k) => k + 1);
      setOffFormError("");
      setOffYear(allowedYears[0] || 1);
      setOffDept(isSuper ? DEPARTMENTS[0] : (admin?.department || ""));
      loadMaterialsForCourse(courseId);
    }
  };

  // 4) Add Offering Handler
  const handleAddOffering = async (e, courseId) => {
    e.preventDefault();
    if (!courseId || offSubmitting) return;

    const targetDept = isSuper ? offDept.trim() : (admin?.department || "").trim();
    if (!targetDept) {
      setOffFormError("يجب تحديد القسم لتخصيص المقرر.");
      return;
    }

    const yearNum = Number(offYear);
    if (!allowedYears.includes(yearNum)) {
      setOffFormError("هذه الفرقة خارج نطاق صلاحياتك.");
      return;
    }

    setOffFormError("");
    setOffSubmitting(true);

    try {
      const { error } = await supabase
        .from("course_offerings")
        .insert({
          course_id: courseId,
          department: targetDept,
          academic_year: yearNum,
        });

      if (error) {
        setOffFormError(getDatabaseErrorMessage(error));
      } else {
        showToast("تم تخصيص المقرر للفرقة والقسم بنجاح.");
        // Reload offerings
        const { data: updatedOfferings } = await supabase
          .from("course_offerings")
          .select("id, course_id, department, academic_year, created_at")
          .eq("course_id", courseId);

        setOfferingsMap((prev) => ({
          ...prev,
          [courseId]: updatedOfferings || [],
        }));
      }
    } catch (err) {
      console.error("Error adding offering:", err);
      setOffFormError("حدث خطأ غير متوقع أثناء إضافة التخصيص.");
    } finally {
      setOffSubmitting(false);
    }
  };

  // 5) Remove Offering Handler
  const handleRemoveOffering = async (offeringId, courseId) => {
    if (!offeringId || busyActionId) return;

    const confirmed = window.confirm("هل أنت متأكد من حذف هذا التخصيص للمقرر؟");
    if (!confirmed) return;

    setBusyActionId(offeringId);
    try {
      const { error } = await supabase
        .from("course_offerings")
        .delete()
        .eq("id", offeringId);

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else {
        showToast("تم حذف تخصيص المقرر بنجاح.");
        setOfferingsMap((prev) => ({
          ...prev,
          [courseId]: (prev[courseId] || []).filter((o) => o.id !== offeringId),
        }));
      }
    } catch (err) {
      console.error("Error removing offering:", err);
      showToast("حدث خطأ أثناء حذف التخصيص.");
    } finally {
      setBusyActionId(null);
    }
  };

  // Pick a file: remember it and suggest a title from the file name
  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setMatFile(file);
    setMatFormError("");
    if (file && !matTitle.trim()) {
      setMatTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  // 6) Add Material Handler: upload a real file to Storage, or paste an https link
  const handleAddMaterial = async (e, courseId) => {
    e.preventDefault();
    if (!courseId || matSubmitting) return;

    const trimmedTitle = matTitle.trim();
    if (!trimmedTitle) {
      setMatFormError("يرجى إدخال عنوان المادة الدراسية.");
      return;
    }

    let fileUrl = "";
    let kindToSave = matKind;
    let uploadExtension = "";
    let uploadMime = "";

    if (matMode === "upload") {
      if (!matFile) {
        setMatFormError("يرجى اختيار ملف لرفعه.");
        return;
      }

      uploadExtension = getFileExtension(matFile.name);
      const typeInfo = UPLOAD_TYPES[uploadExtension];
      if (!typeInfo) {
        setMatFormError(
          "نوع الملف غير مدعوم. المسموح: PDF وWord وPowerPoint وExcel وTXT وصور PNG/JPG وصوت MP3/M4A/WAV/OGG. الفيديو يُضاف برابط فقط."
        );
        return;
      }
      if (matFile.size === 0) {
        setMatFormError("الملف المختار فارغ.");
        return;
      }
      if (matFile.size > MAX_UPLOAD_BYTES) {
        setMatFormError("حجم الملف أكبر من الحد المسموح (50 ميجابايت).");
        return;
      }

      uploadMime = typeInfo.mime;
      kindToSave = typeInfo.kind;
    } else {
      const trimmedUrl = matUrl.trim();

      if (!isValidHttpsUrl(trimmedUrl)) {
        setMatFormError("يجب أن يكون رابط الملف صالحاً ويبدأ بـ https:// حصراً.");
        return;
      }

      if (!["document", "audio", "video"].includes(matKind)) {
        setMatFormError("نوع المادة يجب أن يكون وثيقة أو ملف صوتي أو فيديو.");
        return;
      }

      fileUrl = trimmedUrl;
    }

    setMatFormError("");
    setMatSubmitting(true);
    let uploadedPath = null;

    try {
      if (matMode === "upload") {
        // Files live under <course_id>/<random-uuid>.<ext> so the storage policy can check the course
        const path = `${courseId}/${crypto.randomUUID()}.${uploadExtension}`;

        const { error: uploadError } = await supabase.storage
          .from(MATERIALS_BUCKET)
          .upload(path, matFile, {
            contentType: uploadMime,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          setMatFormError(getUploadErrorMessage(uploadError));
          return;
        }

        uploadedPath = path;
        const { data: publicData } = supabase.storage
          .from(MATERIALS_BUCKET)
          .getPublicUrl(path);
        fileUrl = publicData?.publicUrl || "";

        if (!isValidHttpsUrl(fileUrl)) {
          await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedPath]);
          setMatFormError("تعذر الحصول على رابط الملف بعد الرفع.");
          return;
        }
      }

      const { error } = await supabase
        .from("materials")
        .insert({
          title: trimmedTitle,
          file_url: fileUrl,
          course_id: courseId,
          uploader_id: admin.id,
          status: "approved",
          kind: kindToSave,
        });

      if (error) {
        // Do not leave an orphan file in Storage when the database insert fails
        if (uploadedPath) {
          await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedPath]);
        }
        setMatFormError(getDatabaseErrorMessage(error));
      } else {
        showToast(
          matMode === "upload"
            ? "تم رفع الملف وإضافة المادة واعتمادها بنجاح."
            : "تمت إضافة المادة واعتمادها بنجاح."
        );
        setMatTitle("");
        setMatUrl("");
        setMatKind("document");
        setMatFile(null);
        setFileInputKey((k) => k + 1);
        await loadMaterialsForCourse(courseId);
      }
    } catch (err) {
      console.error("Error adding material:", err);
      if (uploadedPath) {
        await supabase.storage.from(MATERIALS_BUCKET).remove([uploadedPath]);
      }
      setMatFormError("حدث خطأ غير متوقع أثناء إضافة المادة.");
    } finally {
      setMatSubmitting(false);
    }
  };

  // 7) Change Material Status Handler
  const handleChangeMaterialStatus = async (materialId, targetStatus, courseId) => {
    if (!materialId || busyActionId) return;

    if (targetStatus === "rejected") {
      const confirmed = window.confirm("هل أنت متأكد من رفض هذه المادة؟");
      if (!confirmed) return;
    }

    setBusyActionId(materialId);
    try {
      const { error } = await supabase
        .from("materials")
        .update({ status: targetStatus })
        .eq("id", materialId);

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else {
        showToast("تم تحديث حالة المادة.");
        await loadMaterialsForCourse(courseId);
      }
    } catch (err) {
      console.error("Error updating material status:", err);
      showToast("حدث خطأ أثناء تغيير الحالة.");
    } finally {
      setBusyActionId(null);
    }
  };

  // 8) Delete Material Handler
  const handleDeleteMaterial = async (materialId, courseId) => {
    if (!materialId || busyActionId) return;

    const confirmed = window.confirm("هل أنت متأكد من حذف هذه المادة نهائياً؟");
    if (!confirmed) return;

    const material = courseMaterials.find((m) => m.id === materialId);

    setBusyActionId(materialId);
    try {
      const { data: deletedRows, error } = await supabase
        .from("materials")
        .delete()
        .eq("id", materialId)
        .select("id");

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else if (!deletedRows || deletedRows.length === 0) {
        showToast("لم يتم حذف المادة. تأكد من صلاحياتك.");
      } else {
        // Remove the uploaded file too (links to external sites are left untouched)
        const storagePath = getStoragePathFromUrl(material?.file_url);
        if (storagePath) {
          const { error: storageError } = await supabase.storage
            .from(MATERIALS_BUCKET)
            .remove([storagePath]);
          if (storageError) {
            console.error("Storage cleanup error:", storageError);
          }
        }
        showToast("تم حذف المادة بنجاح.");
        await loadMaterialsForCourse(courseId);
      }
    } catch (err) {
      console.error("Error deleting material:", err);
      showToast("حدث خطأ أثناء حذف المادة.");
    } finally {
      setBusyActionId(null);
    }
  };

  // 9) Open Create Course Modal
  const openCreateModal = () => {
    setEditingCourse(null);
    setCourseFormData({
      code: "",
      title: "",
      description: "",
      status: "draft",
      capacity: 40,
      department: isSuper ? DEPARTMENTS[0] : (admin?.department || ""),
    });
    setCourseFormError("");
    setIsModalOpen(true);
  };

  // 10) Open Edit Course Modal
  const openEditModal = (course) => {
    setEditingCourse(course);
    setCourseFormData({
      code: course.code,
      title: course.title,
      description: course.description || "",
      status: course.status,
      capacity: course.capacity || 40,
      department: course.department,
    });
    setCourseFormError("");
    setIsModalOpen(true);
  };

  // 11) Save Course (Create or Edit)
  const handleSaveCourse = async (e) => {
    e.preventDefault();
    if (isSavingCourse) return;

    const code = courseFormData.code.trim().toUpperCase();
    const title = courseFormData.title.trim();
    const department = isSuper ? courseFormData.department : (admin?.department || "").trim();
    const description = courseFormData.description.trim() ? courseFormData.description.trim() : null;
    const capacityNum = parseInt(courseFormData.capacity, 10);
    const validCapacity = !isNaN(capacityNum) && capacityNum >= 1 ? capacityNum : 40;

    if (!code) {
      setCourseFormError("كود المقرر مطلوب.");
      return;
    }

    if (!title) {
      setCourseFormError("عنوان المقرر مطلوب.");
      return;
    }

    if (!department) {
      setCourseFormError("القسم مطلوب.");
      return;
    }

    setCourseFormError("");
    setIsSavingCourse(true);

    try {
      if (editingCourse) {
        // Edit course
        const { error } = await supabase
          .from("courses")
          .update({
            code,
            title,
            description,
            status: courseFormData.status,
            capacity: validCapacity,
            department,
          })
          .eq("id", editingCourse.id);

        if (error) {
          setCourseFormError(getDatabaseErrorMessage(error));
        } else {
          showToast("تم تحديث بيانات المقرر بنجاح.");
          setIsModalOpen(false);
          await loadCourses();
        }
      } else {
        // Create course
        const { error } = await supabase
          .from("courses")
          .insert({
            code,
            title,
            description,
            status: courseFormData.status,
            capacity: validCapacity,
            department,
          });

        if (error) {
          setCourseFormError(getDatabaseErrorMessage(error));
        } else {
          showToast("تم إنشاء المقرر الدراسي بنجاح.");
          setIsModalOpen(false);
          await loadCourses();
        }
      }
    } catch (err) {
      console.error("Error saving course:", err);
      setCourseFormError("حدث خطأ غير متوقع أثناء حفظ المقرر.");
    } finally {
      setIsSavingCourse(false);
    }
  };

  // 12) Archive Course Action (No delete allowed, set status='archived')
  const handleArchiveCourse = async (course) => {
    if (!course || busyActionId) return;

    const confirmed = window.confirm(`هل أنت متأكد من أرشفة مقرر "${course.code} - ${course.title}"؟`);
    if (!confirmed) return;

    setBusyActionId(course.id);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ status: "archived" })
        .eq("id", course.id);

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else {
        showToast("تمت أرشفة المقرر بنجاح.");
        await loadCourses();
      }
    } catch (err) {
      console.error("Error archiving course:", err);
      showToast("حدث خطأ أثناء أرشفة المقرر.");
    } finally {
      setBusyActionId(null);
    }
  };

  // Filtered courses by search query
  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      const matchCode = (c.code || "").toLowerCase().includes(q);
      const matchTitle = (c.title || "").toLowerCase().includes(q);
      return matchCode || matchTitle;
    });
  }, [courses, searchQuery]);

  // Auth screen states
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

  const scopeLabel = scopeDepartment ? `قسم ${scopeDepartment}` : "كل الأقسام";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast-curriculum"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PAGE HEADER                                                            */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              الخطة الدراسية · {scopeLabel}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
            Curriculum Management (Courses)
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            إدارة المقررات الدراسية، تخصيص المقررات للأقسام والفرق، ورفع واعتماد المواد والملفات.
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
            id="btn-add-course"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة مقرر جديد</span>
          </button>

          <button
            onClick={loadCourses}
            disabled={loading}
            className="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            onClick={loadCourses}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FILTER & SEARCH TOOLBAR                                                */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بكود المقرر أو العنوان..."
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:outline-hidden transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-500">الحالة:</span>
          {["All", "active", "draft", "archived"].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedStatus === st
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {st === "All"
                ? "الكل"
                : st === "active"
                ? "نشط (Active)"
                : st === "draft"
                ? "مسودة (Draft)"
                : "مؤرشف (Archived)"}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. COURSES LIST (Accordion with Offerings & Materials)                     */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 shadow-xs">
            <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-700">جاري تحميل المقررات الدراسية...</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 shadow-xs">
            <BookOpen className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800">لا توجد مقررات دراسية مطابقة</p>
            <p className="text-xs text-slate-400">
              {searchQuery ? "جرب تعديل عبارة البحث." : "لم يتم تسجيل أي مقررات بعد."}
            </p>
          </div>
        ) : (
          filteredCourses.map((course) => {
            const isExpanded = expandedCourseId === course.id;
            const offerings = offeringsMap[course.id] || [];
            const isVisibleToStudents = course.status === "active" && offerings.length > 0;

            return (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all"
              >
                {/* Main Course Card Header */}
                <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                        {course.code}
                      </span>

                      {/* Course status badge */}
                      {course.status === "active" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Active</span>
                        </span>
                      )}
                      {course.status === "draft" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <Clock className="h-3 w-3" />
                          <span>Draft</span>
                        </span>
                      )}
                      {course.status === "archived" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Archive className="h-3 w-3" />
                          <span>Archived</span>
                        </span>
                      )}

                      {/* Student visibility indicator */}
                      {!isVisibleToStudents && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200" title="المقرر لن يظهر للطلاب إلا إذا كانت حالته Active ولديه تخصيص واحد على الأقل">
                          <AlertTriangle className="h-3 w-3" />
                          <span>غير ظاهر للطلاب بعد</span>
                        </span>
                      )}

                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {course.department}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 max-w-3xl leading-relaxed">
                        {course.description}
                      </p>
                    )}

                    {/* Metadata strip */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 flex-wrap">
                      <span>السعة: <strong className="text-slate-800">{course.capacity}</strong> طالب</span>
                      <span>•</span>
                      <span>
                        تخصيصات الفرق: <strong className="text-blue-600">{offerings.length}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Actions & Expand Button */}
                  <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                    <button
                      onClick={() => openEditModal(course)}
                      title="تعديل بيانات المقرر"
                      className="p-2 rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>

                    {course.status !== "archived" && (
                      <button
                        onClick={() => handleArchiveCourse(course)}
                        title="أرشفة المقرر"
                        disabled={busyActionId === course.id}
                        className="p-2 rounded-xl text-amber-700 hover:bg-amber-50 border border-amber-200 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleExpandCourse(course.id)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <span>{isExpanded ? "إغلاق التفاصيل" : "التخصيصات والمواد"}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* =================================================================== */}
                {/* EXPANDED SECTION: OFFERINGS + MATERIALS                             */}
                {/* =================================================================== */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/60 p-5 sm:p-7 space-y-8 animate-in fade-in duration-150">
                    {/* SECTION 1: COURSE OFFERINGS */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-blue-600" />
                            <span>تخصيصات المقرر للفرق الدراسية (Course Offerings)</span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            المقرر يظهر تلقائياً لطلاب القسم والفرقة المحددة دون الحاجة لتسجيل يدوي.
                          </p>
                        </div>
                      </div>

                      {/* Offerings list */}
                      <div className="space-y-2">
                        {offerings.length === 0 ? (
                          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                            <span>
                              لم يتم تخصيص هذا المقرر لأي قسم أو فرقة بعد. قم بإضافة تخصيص ليتمكن الطلاب من رؤيته ودراسته.
                            </span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {offerings.map((off) => (
                              <div
                                key={off.id}
                                className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <span className="font-bold text-xs text-slate-900 block truncate">
                                    {formatAcademicYear(off.academic_year)}
                                  </span>
                                  <span className="text-[11px] text-slate-500 block truncate">
                                    {off.department}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveOffering(off.id, course.id)}
                                  disabled={busyActionId === off.id}
                                  title="حذف هذا التخصيص"
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Offering Form */}
                      <form
                        onSubmit={(e) => handleAddOffering(e, course.id)}
                        className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2.5"
                      >
                        {offFormError && (
                          <div className="w-full text-xs text-rose-600 font-medium">
                            {offFormError}
                          </div>
                        )}

                        <div className="w-full sm:w-auto flex-1">
                          {isSuper ? (
                            <select
                              value={offDept}
                              onChange={(e) => setOffDept(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
                              dir="rtl"
                            >
                              {DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              readOnly
                              value={admin?.department || ""}
                              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold cursor-not-allowed"
                            />
                          )}
                        </div>

                        <div className="w-full sm:w-44">
                          <select
                            value={offYear}
                            onChange={(e) => setOffYear(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
                          >
                            {allowedYears.map((y) => (
                              <option key={y} value={y}>
                                {formatAcademicYear(y)} ({y})
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={offSubmitting}
                          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          <span>{offSubmitting ? "جاري الإضافة..." : "إضافة تخصيص"}</span>
                        </button>
                      </form>
                    </div>

                    {/* SECTION 2: COURSE MATERIALS */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          <span>المواد والوثائق الدراسية للمقرر (Course Materials)</span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          رفع ملف من جهازك أو إضافة رابط HTTPS مباشر (تُعتمد تلقائياً)، أو إدارة المواد الحالية.
                        </p>
                      </div>

                      {/* Materials List */}
                      {loadingMaterials ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-1.5" />
                          <span>جاري تحميل المواد...</span>
                        </div>
                      ) : materialsError ? (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                          {materialsError}
                        </div>
                      ) : courseMaterials.length === 0 ? (
                        <p className="text-xs text-slate-400 py-3 text-center">
                          لا توجد مواد مرفوعة لهذا المقرر حالياً.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {courseMaterials.map((mat) => {
                            const isUrlValid = isValidHttpOrHttpsUrl(mat.file_url);

                            return (
                              <div
                                key={mat.id}
                                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900">{mat.title}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-600">
                                      {formatKind(mat.kind)}
                                    </span>
                                    {mat.status === "approved" && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                        Approved
                                      </span>
                                    )}
                                    {mat.status === "pending" && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-200">
                                        Pending
                                      </span>
                                    )}
                                    {mat.status === "rejected" && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                        Rejected
                                      </span>
                                    )}
                                  </div>

                                  {isUrlValid ? (
                                    <a
                                      href={mat.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-lg"
                                    >
                                      <span className="truncate">{mat.file_url}</span>
                                      <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 font-mono text-[11px] truncate block">
                                      {mat.file_url}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Change status buttons */}
                                  {mat.status !== "approved" && (
                                    <button
                                      onClick={() => handleChangeMaterialStatus(mat.id, "approved", course.id)}
                                      disabled={busyActionId === mat.id}
                                      title="اعتماد المادة"
                                      className="px-2.5 py-1 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                                    >
                                      اعتماد
                                    </button>
                                  )}
                                  {mat.status !== "rejected" && (
                                    <button
                                      onClick={() => handleChangeMaterialStatus(mat.id, "rejected", course.id)}
                                      disabled={busyActionId === mat.id}
                                      title="رفض المادة"
                                      className="px-2.5 py-1 rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                                    >
                                      رفض
                                    </button>
                                  )}

                                  {/* Delete material */}
                                  <button
                                    onClick={() => handleDeleteMaterial(mat.id, course.id)}
                                    disabled={busyActionId === mat.id}
                                    title="حذف المادة"
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add Material by HTTPS Link */}
                      <form
                        onSubmit={(e) => handleAddMaterial(e, course.id)}
                        className="pt-3 border-t border-slate-100 space-y-3"
                      >
                        <span className="text-xs font-bold text-slate-800 block">
                          إضافة مادة جديدة للمقرر
                        </span>

                        {matFormError && (
                          <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                            {matFormError}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMatMode("upload");
                              setMatFormError("");
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              matMode === "upload"
                                ? "bg-slate-900 text-white"
                                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            رفع ملف من الجهاز
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMatMode("link");
                              setMatFormError("");
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              matMode === "link"
                                ? "bg-slate-900 text-white"
                                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            رابط خارجي (https)
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <input
                            type="text"
                            placeholder="عنوان المادة (مثال: ملخص المحاضرة الأولى)"
                            value={matTitle}
                            onChange={(e) => setMatTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                          />

                          {matMode === "upload" ? (
                            <input
                              key={fileInputKey}
                              type="file"
                              accept={UPLOAD_ACCEPT}
                              onChange={handleFileSelected}
                              className="sm:col-span-2 w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-semibold"
                            />
                          ) : (
                            <>
                              <select
                                value={matKind}
                                onChange={(e) => setMatKind(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
                              >
                                <option value="document">ملف / وثيقة (document)</option>
                                <option value="audio">صوتي (audio)</option>
                                <option value="video">فيديو (رابط YouTube / Drive / mp4)</option>
                              </select>

                              <input
                                type="url"
                                placeholder="رابط الملف: https://..."
                                value={matUrl}
                                onChange={(e) => setMatUrl(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                              />
                            </>
                          )}
                        </div>

                        {matMode === "upload" && (
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            الأنواع المسموحة: PDF وWord وPowerPoint وExcel وTXT وصور PNG/JPG وصوت MP3/M4A/WAV/OGG وفيديو MP4، بحد أقصى 50 ميجابايت للملف. يتم تحديد نوع المادة تلقائياً.
                          </p>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={matSubmitting}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                          >
                            <Plus className="h-4 w-4" />
                            <span>
                              {matSubmitting
                                ? matMode === "upload"
                                  ? "جاري الرفع..."
                                  : "جاري الإضافة..."
                                : matMode === "upload"
                                ? "رفع وإضافة المادة"
                                : "إضافة واعتماد المادة"}
                            </span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT COURSE                                               */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  {editingCourse ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingCourse ? "تعديل المقرر الدراسي" : "إنشاء مقرر دراسي جديد"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingCourse ? `تعديل بيانات ${editingCourse.code}` : "إضافة مقرر جديد إلى الخطة الدراسية"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error in modal */}
            {courseFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {courseFormError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveCourse} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Code */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    كود المقرر (Code) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: CS-101"
                    value={courseFormData.code}
                    onChange={(e) =>
                      setCourseFormData({ ...courseFormData, code: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    القسم الأكاديمي (Department) *
                  </label>
                  {isSuper ? (
                    <select
                      value={courseFormData.department}
                      onChange={(e) =>
                        setCourseFormData({
                          ...courseFormData,
                          department: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
                      dir="rtl"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={admin?.department || ""}
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold cursor-not-allowed"
                    />
                  )}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  عنوان المقرر (Title) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: البرمجة المتقدمة وهياكل البيانات"
                  value={courseFormData.title}
                  onChange={(e) =>
                    setCourseFormData({ ...courseFormData, title: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              {/* Status & Capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    الحالة (Status) *
                  </label>
                  <select
                    value={courseFormData.status}
                    onChange={(e) =>
                      setCourseFormData({ ...courseFormData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
                  >
                    <option value="draft">مسودة (Draft)</option>
                    <option value="active">نشط ومفعل (Active)</option>
                    <option value="archived">مؤرشف (Archived)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    السعة الاستيعابية (Capacity) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={courseFormData.capacity}
                    onChange={(e) =>
                      setCourseFormData({
                        ...courseFormData,
                        capacity: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  وصف المقرر ومحتواه (اختياري)
                </label>
                <textarea
                  rows={3}
                  placeholder="وصف مختصر لمفردات المنهج والأهداف التعليمية..."
                  value={courseFormData.description}
                  onChange={(e) =>
                    setCourseFormData({
                      ...courseFormData,
                      description: e.target.value,
                    })
                  }
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden leading-relaxed"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSavingCourse}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingCourse}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {isSavingCourse
                      ? "جاري الحفظ..."
                      : editingCourse
                      ? "حفظ التعديلات"
                      : "إنشاء المقرر"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}