"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Edit2,
  Eye,
  Shield,
  X,
  Sparkles,
  AlertCircle,
  GraduationCap,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Phone,
  Calendar,
  Award,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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

const PAGE_SIZE = 20;

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

function formatArabicDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
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

export default function AdminUsersPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = all departments)
  const [deptFilter, setDeptFilter] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("All"); // "All" | "1" | "2" | "3" | "4"
  const [currentPage, setCurrentPage] = useState(1);

  // Data & counts
  const [students, setStudents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    totalStudents: 0,
    year1: 0,
    year2: 0,
    year3: 0,
    year4: 0,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Modal states: Edit (academic_year & gpa only) and View Details
  const [editingStudent, setEditingStudent] = useState(null);
  const [editYear, setEditYear] = useState(1);
  const [editGpa, setEditGpa] = useState("");
  const [editValidationErr, setEditValidationErr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [viewingStudent, setViewingStudent] = useState(null);

  const isAdmin = admin?.role === "admin";
  const isSuper = isAdmin && admin?.is_super_admin === true;
  const scopeDepartment = isSuper ? deptFilter : (admin?.department || "");

  // Admins list (name, department, year, role badge only)
  const [adminsList, setAdminsList] = useState([]);
  useEffect(() => {
    if (!isSuper) return;
    let ignore = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, department, academic_year, is_super_admin")
          .eq("role", "admin")
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) throw error;
        if (!ignore) setAdminsList(data || []);
      } catch (err) {
        console.error("Error loading admins list:", err);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [isSuper]);

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

  // 2) Load Quick Summary Metrics for Students
  const loadMetrics = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const withDept = (query) =>
        scopeDepartment ? query.eq("department", scopeDepartment) : query;

      const baseQuery = () =>
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "student");

      const [totalRes, y1Res, y2Res, y3Res, y4Res] = await Promise.all([
        withDept(baseQuery()),
        withDept(baseQuery().eq("academic_year", 1)),
        withDept(baseQuery().eq("academic_year", 2)),
        withDept(baseQuery().eq("academic_year", 3)),
        withDept(baseQuery().eq("academic_year", 4)),
      ]);

      setStats({
        totalStudents: totalRes.count || 0,
        year1: y1Res.count || 0,
        year2: y2Res.count || 0,
        year3: y3Res.count || 0,
        year4: y4Res.count || 0,
      });
    } catch (err) {
      console.error("Error loading student metrics:", err);
    }
  }, [isAdmin, scopeDepartment]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadMetrics();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadMetrics]);

  // 3) Load Paginated Students
  const loadStudents = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let query = supabase
        .from("profiles")
        .select(
          "id, full_name, student_badge_id, academic_year, department, phone, gpa, created_at",
          { count: "exact" }
        )
        .eq("role", "student");

      // Scope department
      if (scopeDepartment) {
        query = query.eq("department", scopeDepartment);
      }

      // Academic Year Filter
      if (selectedYear !== "All") {
        query = query.eq("academic_year", Number(selectedYear));
      }

      // Search Query: strip characters % , ( ) before using in filter
      const cleanSearch = searchQuery.replace(/[%(),]/g, "").trim();
      if (cleanSearch) {
        query = query.or(
          `full_name.ilike.%${cleanSearch}%,student_badge_id.ilike.%${cleanSearch}%`
        );
      }

      // Order & Pagination
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      setStudents(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Error fetching students:", err);
      setErrorMsg("حدث خطأ أثناء تحميل بيانات الطلاب.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, scopeDepartment, selectedYear, searchQuery, currentPage]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      loadStudents();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, loadStudents]);

  // Reset page when filters change
  const handleDepartmentChange = (val) => {
    setDeptFilter(val);
    setCurrentPage(1);
  };

  const handleYearChange = (val) => {
    setSelectedYear(val);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  // Open edit modal for student
  const openEditModal = (student) => {
    setEditingStudent(student);
    setEditYear(student.academic_year ? Number(student.academic_year) : 1);
    setEditGpa(student.gpa !== null && student.gpa !== undefined ? String(student.gpa) : "");
    setEditValidationErr("");
  };

  // Save student updates (ONLY academic_year & gpa allowed)
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    if (!editingStudent || isSubmitting) return;

    // Validate academic year: Number 1-4
    const yearNum = Number(editYear);
    if (![1, 2, 3, 4].includes(yearNum)) {
      setEditValidationErr("يجب اختيار فرقة دراسية صحيحة (1 إلى 4).");
      return;
    }

    // Validate GPA: 0 to 4, max 2 decimals, or empty -> null
    let gpaValue = null;
    const trimmedGpa = editGpa.trim();

    if (trimmedGpa !== "") {
      const parsedGpa = parseFloat(trimmedGpa);
      const isValidNumber = !isNaN(parsedGpa) && /^\d+(\.\d{1,2})?$/.test(trimmedGpa);

      if (!isValidNumber || parsedGpa < 0 || parsedGpa > 4.0) {
        setEditValidationErr("يجب أن يكون المعدل التراكمي (GPA) رقماً بين 0.00 و 4.00 وبحد أقصى خانتين عشريتين.");
        return;
      }
      gpaValue = parseFloat(parsedGpa.toFixed(2));
    }

    setEditValidationErr("");
    setIsSubmitting(true);

    try {
      const { data: updatedRows, error } = await supabase
        .from("profiles")
        .update({
          academic_year: yearNum,
          gpa: gpaValue,
        })
        .eq("id", editingStudent.id)
        .select("id");

      if (error) {
        showToast(getDatabaseErrorMessage(error));
      } else if (!updatedRows || updatedRows.length === 0) {
        showToast("لم يتم تحديث أي بيانات. تأكد من صلاحياتك.");
      } else {
        showToast("تم تحديث بيانات الطالب بنجاح.");
        setEditingStudent(null);
        await Promise.all([loadStudents(), loadMetrics()]);
      }
    } catch (err) {
      console.error("Error updating student:", err);
      showToast("حدث خطأ أثناء حفظ التعديلات.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  if (!isSuper) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Shield className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">غير مصرح</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            هذه الصفحة متاحة للمسؤول الأعلى فقط.
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
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast-users"
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
              <Shield className="h-3.5 w-3.5" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              سجل الطلاب · {scopeLabel}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
            Users & Access Management (Students)
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            عرض بيانات الطلاب المسجلين والبحث حسب الاسم أو الرقم التعريفي وتعديل الفرقة والمعدل التراكمي.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {isSuper && (
            <select
              value={deptFilter}
              onChange={(e) => handleDepartmentChange(e.target.value)}
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
            onClick={() => {
              loadStudents();
              loadMetrics();
            }}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            onClick={loadStudents}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Admins (name, department, year and role only) */}
      {adminsList.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-slate-900">المسؤولون ({adminsList.length})</h2>
            <Link href="/admin/access" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              إدارة النطاق والصلاحيات
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {adminsList.map((row) => (
              <div
                key={row.id}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-2 flex-wrap"
              >
                <span className="font-bold text-slate-900">{row.full_name}</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold border ${
                    row.is_super_admin
                      ? "bg-violet-50 text-violet-700 border-violet-100"
                      : "bg-blue-50 text-blue-700 border-blue-100"
                  }`}
                >
                  {row.is_super_admin ? "Super Admin" : "Admin"}
                </span>
                {!row.is_super_admin && (
                  <span className="text-slate-500">
                    {row.department || "بدون قسم"} · {formatAcademicYear(row.academic_year)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUMMARY METRICS                                                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            إجمالي الطلاب
          </p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {stats.totalStudents}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block truncate">
            {scopeLabel}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            الفرقة الأولى
          </p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {stats.year1}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            طلاب سنة أولى
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            الفرقة الثانية
          </p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {stats.year2}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            طلاب سنة ثانية
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            الفرقة الثالثة
          </p>
          <p className="text-xl font-bold text-amber-700 mt-1">
            {stats.year3}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            طلاب سنة ثالثة
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            الفرقة الرابعة
          </p>
          <p className="text-xl font-bold text-purple-700 mt-1">
            {stats.year4}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            طلاب التخرج
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FILTER & SEARCH TOOLBAR                                                */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="بحث باسم الطالب أو رقم الكارنيه (student_badge_id)..."
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:outline-hidden transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Academic Year Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 hidden lg:inline">
              الفرقة:
            </span>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
            >
              <option value="All">جميع الفرق</option>
              <option value="1">الفرقة الأولى (1)</option>
              <option value="2">الفرقة الثانية (2)</option>
              <option value="3">الفرقة الثالثة (3)</option>
              <option value="4">الفرقة الرابعة (4)</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(searchQuery || selectedYear !== "All" || (isSuper && deptFilter)) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedYear("All");
                if (isSuper) setDeptFilter("");
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. STUDENTS DATA TABLE                                                    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-5">الطالب (Name)</th>
                <th className="py-3.5 px-4">رقم الكارنيه (Badge ID)</th>
                <th className="py-3.5 px-4">الفرقة (Year)</th>
                <th className="py-3.5 px-4">القسم (Department)</th>
                <th className="py-3.5 px-4">الهاتف (Phone)</th>
                <th className="py-3.5 px-4">المعدل (GPA)</th>
                <th className="py-3.5 px-4">تاريخ التسجيل</th>
                <th className="py-3.5 px-5 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">جاري تحميل بيانات الطلاب...</p>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <AlertCircle className="h-8 w-8 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-800">لا يوجد طلاب مطابقون للبحث</p>
                      <p className="text-xs text-slate-400">
                        تأكد من شروط البحث أو جرب اختيار فرقة أو قسم آخر.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const initial = student.full_name?.trim()
                    ? student.full_name.trim().charAt(0).toUpperCase()
                    : "S";

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Name & Avatar */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors">
                              {student.full_name || "بدون اسم"}
                            </p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              ID: {student.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Badge ID */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {student.student_badge_id ? (
                          <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-900 border border-slate-200">
                            {student.student_badge_id}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Year */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          <GraduationCap className="h-3 w-3" />
                          {formatAcademicYear(student.academic_year)}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-4 px-4 max-w-[200px] truncate" title={student.department}>
                        <span className="font-medium text-slate-700">
                          {student.department || "غير محدد"}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="font-mono text-slate-600">
                          {student.phone || "—"}
                        </span>
                      </td>

                      {/* GPA */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {student.gpa !== null && student.gpa !== undefined ? (
                          <span className="font-bold text-slate-900 bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                            {Number(student.gpa).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-medium">غير مسجل</span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-4 px-4 whitespace-nowrap text-slate-500">
                        {formatArabicDate(student.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => setViewingStudent(student)}
                            title="عرض تفاصيل الطالب"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Edit Academic Year & GPA */}
                          <button
                            onClick={() => openEditModal(student)}
                            title="تعديل الفرقة والمعدل التراكمي"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
          <p>
            عرض{" "}
            <span className="font-bold text-slate-800">
              {students.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
            </span>{" "}
            إلى{" "}
            <span className="font-bold text-slate-800">
              {Math.min(currentPage * PAGE_SIZE, totalCount)}
            </span>{" "}
            من إجمالي <span className="font-bold text-slate-800">{totalCount}</span> طالب
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>السابق</span>
            </button>

            <span className="px-2 font-semibold text-slate-700">
              صفحة {currentPage} من {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1 font-semibold cursor-pointer"
            >
              <span>التالي</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: EDIT ACADEMIC YEAR & GPA (ONLY allowed fields)                  */}
      {/* ========================================================================= */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Edit2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    تعديل بيانات الطالب الأكاديمية
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingStudent.full_name || "طالب"} (
                    {editingStudent.student_badge_id || editingStudent.id.slice(0, 8)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Read-only Info Badge */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">القسم:</span>
                <span className="font-bold text-slate-800">{editingStudent.department || "غير محدد"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">رقم الكارنيه:</span>
                <span className="font-mono font-bold text-slate-800">
                  {editingStudent.student_badge_id || "غير مسجل"}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveStudent} className="space-y-4">
              {editValidationErr && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {editValidationErr}
                </div>
              )}

              {/* 1. Academic Year (1-4) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  الفرقة الدراسية (Academic Year) *
                </label>
                <select
                  value={editYear}
                  onChange={(e) => setEditYear(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
                >
                  <option value={1}>الفرقة الأولى (1)</option>
                  <option value={2}>الفرقة الثانية (2)</option>
                  <option value={3}>الفرقة الثالثة (3)</option>
                  <option value={4}>الفرقة الرابعة (4)</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  تحديد الفرقة يتحكم تلقائياً في المقررات المعروضة للطالب.
                </p>
              </div>

              {/* 2. GPA (0 - 4, at most 2 decimals, or empty -> null) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  المعدل التراكمي (GPA)
                </label>
                <input
                  type="text"
                  placeholder="مثال: 3.75 أو اتركه فارغاً"
                  value={editGpa}
                  onChange={(e) => setEditGpa(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-400">
                  يجب أن تكون القيمة بين 0.00 و 4.00 (خانة أو خانتان عشريتان)، أو فارغة.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW STUDENT FULL DETAILS                                        */}
      {/* ========================================================================= */}
      {viewingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {viewingStudent.full_name?.trim()
                    ? viewingStudent.full_name.trim().charAt(0).toUpperCase()
                    : "S"}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {viewingStudent.full_name || "بدون اسم"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    طالب · {formatAcademicYear(viewingStudent.academic_year)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5 py-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  الفرقة الدراسية
                </span>
                <span className="text-xs font-bold text-slate-900 mt-1 block">
                  {formatAcademicYear(viewingStudent.academic_year)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  المعدل التراكمي (GPA)
                </span>
                <span className="text-xs font-bold text-emerald-700 mt-1 block">
                  {viewingStudent.gpa !== null && viewingStudent.gpa !== undefined
                    ? Number(viewingStudent.gpa).toFixed(2)
                    : "غير مسجل"}
                </span>
              </div>
            </div>

            {/* Details list */}
            <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">القسم الأكاديمي:</span>
                <span className="font-semibold text-slate-900">
                  {viewingStudent.department || "غير محدد"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">رقم الكارنيه:</span>
                <span className="font-mono font-bold text-slate-900">
                  {viewingStudent.student_badge_id || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">رقم الهاتف:</span>
                <span className="font-mono text-slate-900">
                  {viewingStudent.phone || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">تاريخ التسجيل:</span>
                <span className="text-slate-900">
                  {formatArabicDate(viewingStudent.created_at)}
                </span>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setViewingStudent(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  const target = viewingStudent;
                  setViewingStudent(null);
                  openEditModal(target);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>تعديل البيانات الأكاديمية</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}