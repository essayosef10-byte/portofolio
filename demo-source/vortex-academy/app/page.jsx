"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  BookOpen,
  Layers,
  AlertCircle,
  RefreshCw,
  Building2,
  Calendar,
  FileBadge,
  FileText,
  UserCheck,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatAcademicYear(year) {
  if (!year) return "لم يُحدد";
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[year] || `الفرقة ${year}`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [fallbackName, setFallbackName] = useState("");
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      setError("");
      setIsProfileIncomplete(false);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        setFallbackName(user.user_metadata?.full_name || "");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(profileError.message);
        }

        setProfile(profileData);

        // Check if department or academic_year is missing
        if (!profileData?.department || profileData?.academic_year == null) {
          setIsProfileIncomplete(true);
          setEnrolledCourses([]);
          setLoading(false);
          return;
        }

        // Fetch courses allocated for this student's department and academic year from course_offerings
        const { data: offeringsData, error: offeringsError } = await supabase
          .from("course_offerings")
          .select("course_id")
          .eq("department", profileData.department)
          .eq("academic_year", profileData.academic_year);

        if (offeringsError) {
          throw new Error(offeringsError.message);
        }

        const courseIds = (offeringsData || []).map((item) => item.course_id);

        if (courseIds.length === 0) {
          setEnrolledCourses([]);
          return;
        }

        const { data: coursesData, error: coursesError } = await supabase
          .from("courses")
          .select("*")
          .in("id", courseIds)
          .order("code", { ascending: true });

        if (coursesError) {
          throw new Error(coursesError.message);
        }

        const coursesWithMaterials = await Promise.all(
          (coursesData || []).map(async (course) => {
            const { count, error: countError } = await supabase
              .from("materials")
              .select("id", { count: "exact", head: true })
              .eq("course_id", course.id)
              .eq("status", "approved");

            return { ...course, materialsCount: countError ? 0 : count || 0 };
          })
        );

        setEnrolledCourses(coursesWithMaterials);
      } catch (err) {
        setError(err.message || "حدث خطأ أثناء تحميل بيانات لوحة التحكم.");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
        <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">جاري تحميل بيانات الطالب والمقررات الدراسية...</p>
      </div>
    );
  }

  const studentName = profile?.full_name || fallbackName || "طالب";

  return (
    <div className="space-y-8" dir="rtl">
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">خطأ في استعلام البيانات:</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Welcome header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              أهلاً، {studentName}
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              لوحة التحكم الأكاديمية الموحدة · كلية العلوم
            </p>
          </div>
        </div>

        {profile?.student_badge_id && (
          <div className="inline-flex items-center gap-2.5 px-3.5 py-2 bg-white rounded-xl border border-slate-200 shadow-xs self-start sm:self-center">
            <FileBadge className="h-4 w-4 text-blue-600" />
            <span className="text-[11px] font-medium text-slate-500">كود القيد:</span>
            <span className="text-sm font-mono font-bold text-slate-900" dir="ltr">
              {profile.student_badge_id}
            </span>
          </div>
        )}
      </section>

      {/* Quick facts */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">القسم / الشعبة</p>
            <p className="text-sm font-bold text-slate-900 truncate">
              {profile?.department || "لم يُحدد"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">الفرقة الدراسية</p>
            <p className="text-sm font-bold text-slate-900 truncate">
              {formatAcademicYear(profile?.academic_year)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">المقررات المتاحة</p>
            <p className="text-sm font-bold text-slate-900">{enrolledCourses.length} مقرر</p>
          </div>
        </div>
      </section>

      {/* Courses Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              المقررات الدراسية الحالية
            </h2>
            {!isProfileIncomplete && (
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 font-medium rounded-full border border-blue-100">
                {enrolledCourses.length}
              </span>
            )}
          </div>
        </div>

        {isProfileIncomplete ? (
          <div className="bg-white rounded-2xl border border-amber-200 p-8 sm:p-10 text-center space-y-4 shadow-xs">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-1">
              <UserCheck className="h-7 w-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-bold text-slate-900">
                استكمل بيانات ملفك الشخصي أولاً
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                يرجى تحديد القسم الأكاديمي والفرقة الدراسية في ملفك الشخصي ليتم عرض المقررات المخصصة لدفعتك تلقائياً.
              </p>
            </div>
            <div>
              <Link
                href="/setup"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <span>استكمال البيانات الشخصية</span>
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : enrolledCourses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">لسه مش مسجل في أي كورس</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              لم يتم العثور على أي تسجيلات نشطة لحسابك الحالي. تواصل مع شؤون الطلاب أو انتظر تأكيد التسجيل.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolledCourses.map((course) => (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-mono font-bold text-blue-700 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100"
                      dir="ltr"
                    >
                      {course.code}
                    </span>
                    <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      {course.department}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                    {course.title}
                  </h3>

                  {course.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {course.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-[11px]">المواد التعليمية</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {course.materialsCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}