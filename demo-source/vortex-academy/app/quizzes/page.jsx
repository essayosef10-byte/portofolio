"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  HelpCircle,
  Calendar,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Play,
  Award,
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

export default function QuizzesHubPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [attemptsMap, setAttemptsMap] = useState({});
  const [coursesMap, setCoursesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'available' | 'completed'
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState(null);

  const fetchQuizzesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Notice: explicitly NEVER select answer_key_file_url per security instructions
      const { data: qData, error: qErr } = await supabase
        .from("quizzes")
        .select("id, course_id, department, academic_year, kind, title, exam_file_url, created_at")
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;

      const fetchedQuizzes = qData || [];
      setQuizzes(fetchedQuizzes);

      const courseIds = [...new Set(fetchedQuizzes.map((q) => q.course_id).filter(Boolean))];
      if (courseIds.length > 0) {
        const { data: cData } = await supabase
          .from("courses")
          .select("id, code, title")
          .in("id", courseIds);

        if (cData) {
          const cMap = {};
          cData.forEach((c) => {
            cMap[c.id] = c;
          });
          setCoursesMap(cMap);
        }
      }

      if (user) {
        const { data: aData } = await supabase
          .from("quiz_attempts")
          .select("id, quiz_id, score, submitted_at")
          .eq("student_id", user.id);

        if (aData) {
          const aMap = {};
          aData.forEach((att) => {
            aMap[att.quiz_id] = att;
          });
          setAttemptsMap(aMap);
        }
      }
    } catch (err) {
      console.error("Error fetching quizzes:", err);
      setError("حدث خطأ أثناء تحميل الاختبارات. يرجى المحاولة مرة أخرى.");
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

        const { data: qData, error: qErr } = await supabase
          .from("quizzes")
          .select("id, course_id, department, academic_year, kind, title, exam_file_url, created_at")
          .order("created_at", { ascending: false });

        if (ignore) return;
        if (qErr) throw qErr;

        const fetchedQuizzes = qData || [];
        setQuizzes(fetchedQuizzes);

        const courseIds = [...new Set(fetchedQuizzes.map((q) => q.course_id).filter(Boolean))];
        if (courseIds.length > 0) {
          const { data: cData } = await supabase
            .from("courses")
            .select("id, code, title")
            .in("id", courseIds);

          if (!ignore && cData) {
            const cMap = {};
            cData.forEach((c) => {
              cMap[c.id] = c;
            });
            setCoursesMap(cMap);
          }
        }

        if (user) {
          const { data: aData } = await supabase
            .from("quiz_attempts")
            .select("id, quiz_id, score, submitted_at")
            .eq("student_id", user.id);

          if (!ignore && aData) {
            const aMap = {};
            aData.forEach((att) => {
              aMap[att.quiz_id] = att;
            });
            setAttemptsMap(aMap);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching quizzes:", err);
          setError("حدث خطأ أثناء تحميل الاختبارات. يرجى المحاولة مرة أخرى.");
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

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((quiz) => {
      const hasAttempt = Boolean(attemptsMap[quiz.id]);
      if (activeTab === "available" && hasAttempt) return false;
      if (activeTab === "completed" && !hasAttempt) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = quiz.title ? quiz.title.toLowerCase().includes(q) : false;
        const course = coursesMap[quiz.course_id];
        const matchCourse = course
          ? course.title.toLowerCase().includes(q) || course.code.toLowerCase().includes(q)
          : false;
        if (!matchTitle && !matchCourse) return false;
      }
      return true;
    });
  }, [quizzes, attemptsMap, coursesMap, activeTab, searchQuery]);

  const countCompleted = useMemo(() => {
    return quizzes.filter((q) => Boolean(attemptsMap[q.id])).length;
  }, [quizzes, attemptsMap]);

  const countAvailable = useMemo(() => {
    return quizzes.filter((q) => !attemptsMap[q.id]).length;
  }, [quizzes, attemptsMap]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <section
        id="quizzes-header"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
                الاختبارات والتقييمات
              </span>
              <span className="text-xs font-semibold text-slate-500">
                بوابة الطالب
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              الاختبارات الإلكترونية
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              أداء الاختبارات والواجبات الدورية المتاحة لقسمك وفرقتك الدراسية ومراجعة نتائجك السابقة.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">المتاحة</p>
              <p className="text-lg font-bold text-blue-600">{countAvailable}</p>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">المكتملة</p>
              <p className="text-lg font-bold text-emerald-600">{countCompleted}</p>
            </div>
            <button
              onClick={fetchQuizzesData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              title="تحديث"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Controls: Tabs & Search */}
      <section id="quizzes-controls" className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl border border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>جميع الاختبارات</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {quizzes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("available")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === "available"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <span>متاح للأداء</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                {countAvailable}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("completed")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === "completed"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>تم أداؤها</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {countCompleted}
              </span>
            </button>
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الاختبارات..."
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Quizzes Grid Layout */}
      <section id="quizzes-grid-container">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">جاري تحميل الاختبارات...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">تعذر تحميل الاختبارات</h3>
              <p className="text-xs text-rose-600">{error}</p>
            </div>
            <button
              onClick={fetchQuizzesData}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <HelpCircle className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">لا توجد اختبارات متاحة حالياً</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              لم يتم إضافة أي اختبارات لقسمك وفرقتك الدراسية حتى الآن.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredQuizzes.map((quiz) => {
              const attempt = attemptsMap[quiz.id];
              const isCompleted = Boolean(attempt);
              const course = coursesMap[quiz.course_id];
              const attemptUrl = `/quizzes/${quiz.id}/attempt`;
              const resultUrl = `/quizzes/${quiz.id}/result`;

              return (
                <div
                  key={quiz.id}
                  id={`card-quiz-${quiz.id}`}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {course?.code ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80">
                          {course.code}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                          {quiz.kind || "اختبار"}
                        </span>
                      )}

                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>تم الأداء</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                          <span>متاح</span>
                        </span>
                      )}
                    </div>

                    {course?.title && (
                      <p className="text-xs font-semibold text-slate-500 line-clamp-1">
                        {course.title}
                      </p>
                    )}

                    <h3 className="text-base font-bold text-slate-900 tracking-tight line-clamp-2">
                      {quiz.title}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 flex-wrap">
                      {quiz.department && (
                        <span>قسم {quiz.department}</span>
                      )}
                      {quiz.academic_year && (
                        <>
                          <span>•</span>
                          <span>{formatAcademicYear(quiz.academic_year)}</span>
                        </>
                      )}
                      {quiz.created_at && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{new Date(quiz.created_at).toLocaleDateString("ar-EG")}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                    {isCompleted && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">الدرجة:</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {attempt.score !== null ? `${attempt.score} نقطة` : "قيد التصحيح"}
                        </span>
                      </div>
                    )}

                    <div>
                      {isCompleted ? (
                        <Link
                          href={resultUrl}
                          className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Award className="h-3.5 w-3.5 text-emerald-600" />
                          <span>عرض النتيجة والتفاصيل</span>
                        </Link>
                      ) : (
                        <Link
                          href={attemptUrl}
                          className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>بدء الاختبار الآن</span>
                        </Link>
                      )}
                    </div>
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
