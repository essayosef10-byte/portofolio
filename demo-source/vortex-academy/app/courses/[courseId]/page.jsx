"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  Download,
  Clock,
  Play,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  Layers,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDownloadUrl } from "@/lib/fileViewer";

export default function CourseDetailPage() {
  const params = useParams();
  const rawCourseId = params?.courseId ? String(params.courseId) : "";

  const [course, setCourse] = useState(null);
  const [instructorName, setInstructorName] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("materials");
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!rawCourseId) return;

      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCourseId);
        if (!isUuid) {
          setError("المقرر الدراسي غير موجود أو غير متاح حالياً.");
          setLoading(false);
          return;
        }

        const { data: courseData, error: courseErr } = await supabase
          .from("courses")
          .select("id, code, title, description, department, instructor_id, status, created_at")
          .eq("id", rawCourseId)
          .maybeSingle();

        if (ignore) return;
        if (courseErr) throw courseErr;
        if (!courseData) {
          setError("المقرر الدراسي غير موجود أو غير متاح حالياً.");
          setLoading(false);
          return;
        }

        setCourse(courseData);

        if (courseData.instructor_id) {
          const { data: profData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", courseData.instructor_id)
            .maybeSingle();

          if (!ignore && profData?.full_name) {
            setInstructorName(profData.full_name);
          }
        }

        const { data: matsData, error: matsErr } = await supabase
          .from("materials")
          .select("id, title, file_url, course_id, uploader_id, status, created_at, kind")
          .eq("course_id", courseData.id)
          .eq("status", "approved")
          .order("created_at", { ascending: true });

        if (!ignore && !matsErr && matsData) {
          setMaterials(matsData);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading course:", err);
          setError("حدث خطأ أثناء تحميل بيانات المقرر الدراسي.");
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
  }, [rawCourseId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري تحميل بيانات المقرر...</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto my-8">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">تعذر العثور على المقرر</h2>
          <p className="text-xs text-rose-600">{error || "المقرر المطلوب غير متاح"}</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>العودة للرئيسية</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link
          href="/"
          className="hover:text-slate-900 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>الرئيسية</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-bold">{course.code}</span>
      </div>

      <section
        id="course-header"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                {course.code}
              </span>
              {course.department && (
                <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg font-medium">
                  قسم {course.department}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {course.title}
            </h1>

            {instructorName && (
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                <span>أستاذ المقرر:</span>
                <span className="font-semibold text-slate-800">{instructorName}</span>
              </div>
            )}

            {course.description && (
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed pt-1">
                {course.description}
              </p>
            )}
          </div>
        </div>
      </section>

      <section id="course-tabs-navigation" className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-2 sm:space-x-4" aria-label="Course Sections">
            <button
              onClick={() => setActiveTab("materials")}
              className={`pb-3.5 px-3 text-sm font-semibold transition-all relative flex items-center gap-2 cursor-pointer ${
                activeTab === "materials"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>المحاضرات والمواد التعليمية</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  activeTab === "materials"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {materials.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("assignments")}
              className={`pb-3.5 px-3 text-sm font-semibold transition-all relative flex items-center gap-2 cursor-pointer ${
                activeTab === "assignments"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              <span>الواجبات والتكليفات</span>
            </button>
          </nav>
        </div>

        {activeTab === "materials" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {materials.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Layers className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  لا توجد محاضرات أو مواد تعليمية متاحة بعد
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  لم يقم أستاذ المادة برفع أي ملفات أو محاضرات معتمدة لهذا المقرر حتى الآن.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {materials.map((mat, idx) => {
                  const lectureUrl = `/courses/${course.id}/lecture/${mat.id}`;
                  const downloadUrl =
                    mat.kind === "video" ? null : getDownloadUrl(mat.file_url, mat.title);

                  return (
                    <div
                      key={mat.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          {idx + 1}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                              {mat.kind || "محاضرة"}
                            </span>
                            {mat.created_at && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{new Date(mat.created_at).toLocaleDateString("ar-EG")}</span>
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-bold text-slate-900 tracking-tight">
                            {mat.title}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                        <Link
                          href={lectureUrl}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>فتح المحاضرة</span>
                        </Link>

                        {downloadUrl && (
                          <a
                            href={downloadUrl}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                          >
                            <Download className="h-3.5 w-3.5 text-slate-500" />
                            <span>تحميل</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "assignments" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3 animate-in fade-in duration-150">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <ClipboardList className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">لا توجد واجبات بعد</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              لم يتم تكليف أي واجبات أو تسليمات دراسية لهذا المقرر حالياً.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}