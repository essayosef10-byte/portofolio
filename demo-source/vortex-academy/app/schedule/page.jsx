"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  RefreshCw,
  Eye,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import FileViewer from "@/components/FileViewer";
import { getSafeHttpsUrl } from "@/lib/fileViewer";

function formatAcademicYear(year) {
  if (!year) return null;
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثه",
    4: "الفرقة الرابعة",
  };
  return years[num] || `الفرقة ${num}`;
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [activeScheduleId, setActiveScheduleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from("schedules")
        .select("id, department, academic_year, file_url, term, created_at")
        .order("created_at", { ascending: false });

      if (fetchErr) {
        throw fetchErr;
      }
      const rows = data || [];
      setSchedules(rows);
      const firstValid = rows.find((r) => getSafeHttpsUrl(r.file_url));
      setActiveScheduleId((prev) => prev || firstValid?.id || null);
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setError("حدث خطأ أثناء تحميل جدول المحاضرات. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("schedules")
          .select("id, department, academic_year, file_url, term, created_at")
          .order("created_at", { ascending: false });

        if (ignore) return;
        if (fetchErr) {
          throw fetchErr;
        }
        const rows = data || [];
        setSchedules(rows);
        const firstValid = rows.find((r) => getSafeHttpsUrl(r.file_url));
        if (firstValid) {
          setActiveScheduleId(firstValid.id);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching schedules:", err);
          setError("حدث خطأ أثناء تحميل جدول المحاضرات. يرجى المحاولة مرة أخرى.");
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
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <section
        id="schedule-header"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                <Calendar className="h-3.5 w-3.5" />
                <span>الجدول الدراسي الأكاديمي</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                المقررات والمحاضرات
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              جدول المحاضرات والسكاشن
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              استعراض وتحميل الجداول الدراسية الرسمية المعتمدة الخاصة بقسمك وفرقتك الأكاديمية.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchSchedules}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      <section id="schedule-content">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">جاري تحميل الجداول الدراسية...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">تعذر تحميل الجدول</h3>
              <p className="text-xs text-rose-600">{error}</p>
            </div>
            <button
              onClick={fetchSchedules}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">لا يوجد جدول دراسي متاح حالياً</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              لم يتم رفع أو نشر الجدول الدراسي المعتمد لقسمك وفرقتك الدراسية حتى الآن. سيظهر هنا فور اعتماده من إدارة الكلية.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {schedules.map((schedule) => {
              const safeUrl = getSafeHttpsUrl(schedule.file_url);
              const isExpanded = activeScheduleId === schedule.id;
              const scheduleTitle = `جدول المحاضرات الأكاديمي — ${
                schedule.term || "الفصل الدراسي الحالي"
              }`;

              return (
                <div
                  key={schedule.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-slate-300 transition-all space-y-5"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {schedule.term || "الفصل الدراسي الحالي"}
                        </span>
                        {schedule.academic_year && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {formatAcademicYear(schedule.academic_year)}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                        <span>جدول المحاضرات الأكاديمي</span>
                      </h3>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                        {schedule.department && (
                          <span>
                            القسم: <strong className="text-slate-800">{schedule.department}</strong>
                          </span>
                        )}
                        {schedule.created_at && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              تاريخ النشر:{" "}
                              {new Date(schedule.created_at).toLocaleDateString("ar-EG")}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                      {safeUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveScheduleId(isExpanded ? null : schedule.id)
                          }
                          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              <span>إخفاء الجدول</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              <span>عرض الجدول</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">الملف غير متوفر حالياً</span>
                      )}
                    </div>
                  </div>

                  {safeUrl && isExpanded && (
                    <div className="pt-4 border-t border-slate-100">
                      <FileViewer fileUrl={safeUrl} title={scheduleTitle} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}