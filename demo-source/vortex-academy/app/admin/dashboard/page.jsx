"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Users,
  BookOpen,
  Inbox,
  HelpCircle,
  Bell,
  Clock,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  GraduationCap,
  FileCheck,
  Library,
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

export default function AdminDashboardPage() {
  // Signed-in admin profile
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Super admin department filter ("" = all departments)
  const [deptFilter, setDeptFilter] = useState("");

  // Dashboard data
  const [stats, setStats] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isAdmin = admin?.role === "admin";
  const isSuper = isAdmin && admin?.is_super_admin === true;
  const scopeDepartment = isSuper ? deptFilter : (admin?.department || "");

  // 1) Load the signed-in user's profile
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
          setAuthError("تعذر تحميل بيانات الحساب. تأكد من تنفيذ إعدادات صلاحيات الأدمن في Supabase.");
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

  // 2) Load dashboard numbers (RLS already limits rows to the admin's department)
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;

    async function loadData() {
      setDataLoading(true);
      setDataError(null);

      try {
        const withDept = (query) =>
          scopeDepartment ? query.eq("department", scopeDepartment) : query;
        const countOf = (table) =>
          supabase.from(table).select("id", { count: "exact", head: true });

        // Materials have no department column: filter them through their course
        let courseIds = null;
        if (scopeDepartment) {
          const { data: deptCourses, error: deptCoursesErr } = await supabase
            .from("courses")
            .select("id")
            .eq("department", scopeDepartment);
          if (deptCoursesErr) throw deptCoursesErr;
          courseIds = (deptCourses || []).map((c) => c.id);
        }

        let pendingCountQuery = countOf("materials").eq("status", "pending");
        let pendingListQuery = supabase
          .from("materials")
          .select("id, title, kind, created_at, course_id")
          .eq("status", "pending");

        if (courseIds !== null) {
          if (courseIds.length === 0) {
            pendingCountQuery = null;
            pendingListQuery = null;
          } else {
            pendingCountQuery = pendingCountQuery.in("course_id", courseIds);
            pendingListQuery = pendingListQuery.in("course_id", courseIds);
          }
        }
        if (pendingListQuery) {
          pendingListQuery = pendingListQuery
            .order("created_at", { ascending: false })
            .limit(5);
        }

        const studentsBase = () => countOf("profile_directory").eq("role", "student");

        const [
          studentsRes,
          year1Res,
          year2Res,
          year3Res,
          year4Res,
          coursesRes,
          quizzesRes,
          notificationsRes,
          pendingCountRes,
          pendingListRes,
          recentStudentsRes,
        ] = await Promise.all([
          withDept(studentsBase()),
          withDept(studentsBase().eq("academic_year", 1)),
          withDept(studentsBase().eq("academic_year", 2)),
          withDept(studentsBase().eq("academic_year", 3)),
          withDept(studentsBase().eq("academic_year", 4)),
          withDept(countOf("courses").eq("status", "active")),
          withDept(countOf("quizzes")),
          withDept(countOf("notifications")),
          pendingCountQuery || Promise.resolve({ count: 0, error: null }),
          pendingListQuery || Promise.resolve({ data: [], error: null }),
          withDept(
            supabase
              .from("profile_directory")
              .select("id, full_name, department, academic_year, student_badge_id, created_at")
              .eq("role", "student")
          )
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const allResults = [
          studentsRes,
          year1Res,
          year2Res,
          year3Res,
          year4Res,
          coursesRes,
          quizzesRes,
          notificationsRes,
          pendingCountRes,
          pendingListRes,
          recentStudentsRes,
        ];
        const failed = allResults.find((r) => r.error);
        if (failed) throw failed.error;

        const pending = pendingListRes.data || [];
        const pendingCourseIds = [
          ...new Set(pending.map((m) => m.course_id).filter(Boolean)),
        ];
        const coursesMap = {};
        if (pendingCourseIds.length > 0) {
          const { data: courseRows } = await supabase
            .from("courses")
            .select("id, code, title")
            .in("id", pendingCourseIds);
          (courseRows || []).forEach((c) => {
            coursesMap[c.id] = c;
          });
        }

        if (ignore) return;
        setStats({
          students: studentsRes.count || 0,
          years: [
            { year: 1, count: year1Res.count || 0 },
            { year: 2, count: year2Res.count || 0 },
            { year: 3, count: year3Res.count || 0 },
            { year: 4, count: year4Res.count || 0 },
          ],
          activeCourses: coursesRes.count || 0,
          quizzes: quizzesRes.count || 0,
          notifications: notificationsRes.count || 0,
          pendingCount: pendingCountRes.count || 0,
          pending,
          coursesMap,
          recentStudents: recentStudentsRes.data || [],
        });
      } catch (err) {
        if (!ignore) {
          console.error("Error loading dashboard data:", err);
          setDataError("حدث خطأ أثناء تحميل بيانات لوحة التحكم.");
        }
      } finally {
        if (!ignore) {
          setDataLoading(false);
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [isAdmin, scopeDepartment, reloadKey]);

  if (authLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-lg mx-auto my-8">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري التحقق من الصلاحيات...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto my-8">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-xs text-rose-600 leading-relaxed">{authError}</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-4 max-w-lg mx-auto my-8">
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
  const showValue = (value) => (stats ? value : "—");
  const maxYearCount = stats ? Math.max(1, ...stats.years.map((y) => y.count)) : 1;
  const hasNoDepartment = !isSuper && !admin?.department;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              {isSuper ? "Super Admin" : "Department Admin"}
            </span>
            <span className="text-xs text-slate-500 font-medium">{scopeLabel}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
            Admin Overview Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            أرقام حقيقية من قاعدة البيانات: الطلاب والمقررات والمواد قيد المراجعة
            {isSuper ? " لجميع الأقسام أو لقسم محدد." : " الخاصة بقسمك فقط."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isSuper && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
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
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={dataLoading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${dataLoading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {hasNoDepartment && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
          حسابك لا يحتوي على قسم مسجل، لذلك لن تظهر أي بيانات. يجب تحديد القسم أولاً.
        </div>
      )}

      {dataError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{dataError}</span>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Users className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Students</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{showValue(stats?.students)}</h3>
            <p className="text-[11px] text-slate-400 mt-1">{scopeLabel}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Courses</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{showValue(stats?.activeCourses)}</h3>
            <p className="text-[11px] text-slate-400 mt-1">المقررات المفعّلة</p>
          </div>
        </div>

        <Link
          href="/admin/inbox"
          className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all block group ${
            stats && stats.pendingCount > 0
              ? "bg-amber-50/40 border-amber-200 hover:border-amber-300"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                stats && stats.pendingCount > 0
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              <Inbox className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Materials</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{showValue(stats?.pendingCount)}</h3>
            <p className="text-[11px] text-slate-500 mt-1">مواد في انتظار المراجعة</p>
          </div>
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quizzes</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{showValue(stats?.quizzes)}</h3>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Bell className="h-3 w-3" />
              <span>{stats ? `${stats.notifications} إشعار منشور` : "—"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Pending materials */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <FileCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">أحدث المواد قيد المراجعة</h2>
                  <p className="text-xs text-slate-500">آخر 5 مواد في انتظار الاعتماد</p>
                </div>
              </div>
              <Link href="/admin/inbox" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                فتح صندوق المراجعة
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {!stats ? (
                <div className="p-8 text-center text-slate-500 text-xs">جاري التحميل...</div>
              ) : stats.pending.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  لا توجد مواد قيد المراجعة حالياً.
                </div>
              ) : (
                stats.pending.map((mat) => {
                  const course = stats.coursesMap[mat.course_id];
                  return (
                    <div key={mat.id} className="p-4 sm:p-5 flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{mat.title}</p>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                          {course?.code && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-700">
                              {course.code}
                            </span>
                          )}
                          {course?.title && <span className="truncate">{course.title}</span>}
                          {mat.kind && <span>• {mat.kind}</span>}
                        </div>
                      </div>
                      {mat.created_at && (
                        <span className="text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(mat.created_at).toLocaleDateString("ar-EG")}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Newest students */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">أحدث الطلاب المسجلين</h2>
                  <p className="text-xs text-slate-500">آخر 5 حسابات طلاب</p>
                </div>
              </div>
              <Link href="/admin/users" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                إدارة الطلاب
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {!stats ? (
                <div className="p-8 text-center text-slate-500 text-xs">جاري التحميل...</div>
              ) : stats.recentStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">لا يوجد طلاب مسجلون بعد.</div>
              ) : (
                stats.recentStudents.map((student) => (
                  <div key={student.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {student.full_name?.trim() ? student.full_name.trim().charAt(0).toUpperCase() : "V"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{student.full_name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {formatAcademicYear(student.academic_year)}
                          {isSuper && student.department ? ` · ${student.department}` : ""}
                        </p>
                      </div>
                    </div>
                    {student.student_badge_id && (
                      <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {student.student_badge_id}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">الطلاب حسب الفرقة</h3>
              <p className="text-[11px] text-slate-500">{scopeLabel}</p>
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((year) => {
                const count = stats ? stats.years.find((y) => y.year === year)?.count || 0 : 0;
                const width = stats ? Math.round((count / maxYearCount) * 100) : 0;
                return (
                  <div key={year} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{formatAcademicYear(year)}</span>
                      <span className="font-bold text-slate-900">{stats ? count : "—"}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">روابط سريعة</h3>

            <Link
              href="/admin/courses"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Library className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">المقررات والمنهج</h4>
                  <p className="text-[11px] text-slate-500">إنشاء مقرر وتخصيصه لقسم وفرقة</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
            </Link>

            <Link
              href="/admin/users"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">الطلاب والصلاحيات</h4>
                  <p className="text-[11px] text-slate-500">عرض الطلاب وتحديث الفرقة والمعدل</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
            </Link>

            <Link
              href="/admin/inbox"
              className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50/70 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-600 text-white flex items-center justify-center">
                  <Inbox className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">صندوق المراجعة</h4>
                  <p className="text-[11px] text-amber-800/80">اعتماد أو رفض المواد المرفوعة</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-600" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}