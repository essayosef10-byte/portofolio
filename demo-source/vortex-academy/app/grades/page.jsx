"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Award,
  GraduationCap,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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

export default function GradesPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfileGpa = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, gpa, academic_year, department")
          .eq("id", user.id)
          .maybeSingle();

        if (pErr) throw pErr;
        setProfile(data);
      }
    } catch (err) {
      console.error("Error fetching profile grades:", err);
      setError("حدث خطأ أثناء تحميل السجل الأكاديمي.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (user) {
          const { data, error: pErr } = await supabase
            .from("profiles")
            .select("id, full_name, gpa, academic_year, department")
            .eq("id", user.id)
            .maybeSingle();

          if (!ignore && !pErr) {
            setProfile(data);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching profile grades:", err);
          setError("حدث خطأ أثناء تحميل السجل الأكاديمي.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header Section */}
      <section
        id="grades-summary-overview"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                <GraduationCap className="h-3.5 w-3.5" />
                <span>السجل الأكاديمي</span>
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
              الدرجات والتقييم الأكاديمي
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              متابعة الدرجات والنتائج الرسمية المعتمدة للمقررات الدراسية والمعدل التراكمي.
            </p>
          </div>

          {/* GPA Metric Display */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center flex flex-col justify-center min-w-[160px]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              المعدل التراكمي (GPA)
            </p>
            <div className="flex items-baseline justify-center gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {profile?.gpa !== null && profile?.gpa !== undefined
                  ? profile.gpa
                  : "—"}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ 4.00</span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              السجل التراكمي المعتمد
            </p>
          </div>
        </div>
      </section>

      {/* Main Content: Clean Arabic Empty State (strictly required as no grades table exists) */}
      <section id="grades-content">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3">
            <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">جاري تحميل السجل...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">تعذر تحميل الدرجات</h2>
              <p className="text-xs text-rose-600 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={fetchProfileGpa}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-4 shadow-xs">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Award className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg font-bold text-slate-900">لا توجد درجات بعد</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                لم يتم رصد أو اعتماد أي درجات أو تقييمات فصلية حتى الآن. ستظهر هنا فور إعلان النتائج الرسمية من الكنترول.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>العودة للرئيسية</span>
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
