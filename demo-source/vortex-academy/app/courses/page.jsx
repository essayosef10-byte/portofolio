"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  AlertCircle,
  RefreshCw,
  Layers,
  ChevronLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import CourseAccessPanel from "@/components/CourseAccessPanel";

function formatAcademicYear(year) {
  if (!year) return null;
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || `الفرقة ${num}`;
}

export default function CoursesListPage() {
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [materialCounts, setMaterialCounts] = useState({});
  const [requests, setRequests] = useState([]);
  const [crossYears, setCrossYears] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("يجب تسجيل الدخول لعرض المقررات.");
        return;
      }

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, department, academic_year")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;
      setProfile(profileData || null);

      if (!profileData?.department || !profileData?.academic_year) {
        setCourses([]);
        setMaterialCounts({});
        return;
      }

      // The admin assigns a course to a department + academic year (course_offerings):
      // every student with the same department and year sees it automatically.
      const { data: offerings, error: offeringsErr } = await supabase
        .from("course_offerings")
        .select("course_id")
        .eq("department", profileData.department)
        .eq("academic_year", Number(profileData.academic_year));

      if (offeringsErr) throw offeringsErr;

      const ownIds = [...new Set((offerings || []).map((o) => o.course_id))];

      // Courses from another year that the admin approved for this student (RLS opens them).
      let myRequests = [];
      try {
        const { data: reqData, error: reqErr } = await supabase.rpc("course_access_my_requests");
        if (!reqErr && Array.isArray(reqData)) myRequests = reqData;
      } catch (_) {}
      setRequests(myRequests);

      const crossIds = myRequests
        .filter((r) => r.status === "approved" && !ownIds.includes(r.course_id))
        .map((r) => r.course_id);

      const courseIds = [...new Set([...ownIds, ...crossIds])];
      if (courseIds.length === 0) {
        setCourses([]);
        setMaterialCounts({});
        setCrossYears({});
        return;
      }

      const { data: coursesData, error: coursesErr } = await supabase
        .from("courses")
        .select("id, code, title, description, department, status")
        .in("id", courseIds)
        .eq("status", "active")
        .order("code", { ascending: true });

      if (coursesErr) throw coursesErr;

      const years = {};
      if (crossIds.length > 0) {
        const { data: crossOfferings } = await supabase
          .from("course_offerings")
          .select("course_id, academic_year")
          .in("course_id", crossIds)
          .eq("department", profileData.department);
        (crossOfferings || []).forEach((o) => {
          years[o.course_id] = [...(years[o.course_id] || []), o.academic_year];
        });
      }
      setCrossYears(years);

      const loadedCourses = coursesData || [];
      setCourses(loadedCourses);

      if (loadedCourses.length > 0) {
        const { data: materialsData, error: materialsErr } = await supabase
          .from("materials")
          .select("id, course_id")
          .in(
            "course_id",
            loadedCourses.map((c) => c.id)
          )
          .eq("status", "approved");

        if (materialsErr) throw materialsErr;

        const counts = {};
        (materialsData || []).forEach((m) => {
          counts[m.course_id] = (counts[m.course_id] || 0) + 1;
        });
        setMaterialCounts(counts);
      } else {
        setMaterialCounts({});
      }
    } catch (err) {
      console.error("Error loading courses list:", err);
      setError("حدث خطأ أثناء تحميل المقررات الدراسية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCourses();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadCourses]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
                <BookOpen className="h-3.5 w-3.5" />
                <span>المقررات الدراسية</span>
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
              مقرراتي الدراسية
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              المقررات المخصصة لقسمك وفرقتك الدراسية، وتظهر هنا تلقائياً دون أي تسجيل يدوي.
            </p>
          </div>

          <button
            onClick={loadCourses}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>
        </div>
      </section>

      {profile?.department && profile?.academic_year && (
        <CourseAccessPanel requests={requests} onChanged={loadCourses} />
      )}

      {/* Content */}
      <section>
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
            <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">جاري تحميل المقررات...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-4 max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <p className="text-xs text-rose-600 leading-relaxed">{error}</p>
            <button
              onClick={loadCourses}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : !profile?.department || !profile?.academic_year ? (
          <div className="bg-white rounded-2xl border border-amber-200 p-12 text-center space-y-2 max-w-lg mx-auto">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-900">لم يتم تحديد القسم والفرقة</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              أكمل بيانات القيد الأكاديمي أولاً ليظهر لك المقررات المخصصة لقسمك وفرقتك.
            </p>
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Layers className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">لا توجد مقررات متاحة حالياً</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              لم يتم تخصيص أي مقررات مفعّلة لقسمك وفرقتك حتى الآن. ستظهر هنا فور تخصيصها من إدارة الكلية.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {courses.map((course) => {
              const materialsCount = materialCounts[course.id] || 0;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between gap-5 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                        {course.code}
                      </span>
                      {crossYears[course.id] && (
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          من {crossYears[course.id].map((y) => formatAcademicYear(y)).join("، ")}
                        </span>
                      )}
                      {course.department && (
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {course.department}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 tracking-tight group-hover:text-blue-700 transition-colors">
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span>
                        المواد التعليمية: <strong className="text-slate-900">{materialsCount}</strong>
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                      <span>فتح المقرر</span>
                      <ChevronLeft className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}