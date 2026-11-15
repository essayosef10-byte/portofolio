"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Award,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Calendar,
  AlertCircle,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import FileViewer from "@/components/FileViewer";
import { getSafeHttpsUrl } from "@/lib/fileViewer";

function formatKind(kind) {
  if (kind === "past_exam") return "امتحان سابق";
  if (kind === "interactive") return "اختبار تفاعلي";
  return "اختبار";
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return String(Math.round(num * 100) / 100);
}

export default function QuizResultPage() {
  const params = useParams();
  const rawQuizId = params?.id ? String(params.id) : "";

  const [quiz, setQuiz] = useState(null);
  const [course, setCourse] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answerKeyUrl, setAnswerKeyUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    async function loadResultData() {
      if (!rawQuizId) return;
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("يجب تسجيل الدخول لعرض النتيجة.");
          setLoading(false);
          return;
        }

        const { data: qData, error: qErr } = await supabase
          .from("quizzes")
          .select("id, course_id, department, academic_year, kind, title, exam_file_url, max_score, created_at")
          .eq("id", rawQuizId)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!qData) {
          setError("الاختبار غير موجود.");
          setLoading(false);
          return;
        }

        setQuiz(qData);

        if (qData.course_id) {
          const { data: cData } = await supabase
            .from("courses")
            .select("id, code, title")
            .eq("id", qData.course_id)
            .maybeSingle();

          if (cData) setCourse(cData);
        }

        const { data: aData, error: aErr } = await supabase
          .from("quiz_attempts")
          .select("id, score, answers, submitted_at")
          .eq("quiz_id", qData.id)
          .eq("student_id", user.id)
          .maybeSingle();

        if (aErr) throw aErr;
        setAttempt(aData || null);

        if (aData) {
          const { data: keyData } = await supabase
            .from("quiz_answer_keys")
            .select("answer_key_file_url")
            .eq("quiz_id", qData.id)
            .maybeSingle();
          setAnswerKeyUrl(keyData?.answer_key_file_url || null);
        }
      } catch (err) {
        console.error("Error loading result:", err);
        setError("حدث خطأ أثناء تحميل نتيجة الاختبار.");
      } finally {
        setLoading(false);
      }
    }

    loadResultData();
  }, [rawQuizId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">جاري تحميل نتيجة الاختبار...</p>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">تعذر عرض النتيجة</h2>
            <p className="text-xs text-rose-600">{error || "الاختبار غير موجود"}</p>
          </div>
          <Link
            href="/quizzes"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>العودة إلى الاختبارات</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="space-y-8 animate-in fade-in duration-150 max-w-3xl mx-auto py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">لم يتم أداء هذا الاختبار بعد</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              لم تسجل أي محاولة تسليم لهذا الاختبار حتى الآن. يمكنك بدء الاختبار الآن إن كان متاحاً.
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href="/quizzes"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>قائمة الاختبارات</span>
            </Link>
            <Link
              href={`/quizzes/${quiz.id}/attempt`}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs inline-flex items-center gap-1.5"
            >
              <span>بدء الاختبار</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isGraded = attempt.score !== null;
  const safeExamUrl = getSafeHttpsUrl(quiz.exam_file_url);
  const safeAnswerKeyUrl = getSafeHttpsUrl(answerKeyUrl);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Link
            href="/quizzes"
            className="hover:text-slate-900 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>الاختبارات</span>
          </Link>
          <span>/</span>
          {course?.code && (
            <>
              <span className="text-slate-900 font-bold">{course.code}</span>
              <span>/</span>
            </>
          )}
          <span className="text-slate-500 truncate max-w-xs">{quiz.title}</span>
          <span>/</span>
          <span className="text-blue-600 font-semibold">النتيجة</span>
        </div>
      </div>

      <section
        id="quiz-score-overview"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-4 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200/80 text-center space-y-2">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Award className="h-8 w-8" />
            </div>

            <div className="pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                الدرجة المرصودة
              </p>
              <div className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {isGraded ? `${formatScore(attempt.score)} / ${formatScore(quiz.max_score)}` : "قيد التصحيح"}
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border mt-2 ${
                isGraded
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {isGraded ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>تم رصد الدرجة</span>
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>في انتظار تقييم المدرس</span>
                </>
              )}
            </span>
          </div>

          <div className="md:col-span-8 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {course?.code && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
                    {course.code}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {formatKind(quiz.kind)}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {quiz.title}
              </h1>

              {attempt.submitted_at && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    تاريخ التسليم: {new Date(attempt.submitted_at).toLocaleString("ar-EG")}
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-3 flex-wrap">
              <Link
                href="/quizzes"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>العودة إلى الاختبارات</span>
              </Link>

              {quiz.course_id && (
                <Link
                  href={`/courses/${quiz.course_id}`}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                  <span>صفحة المقرر الدراسي</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {attempt.answers && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">الإجابة المسلمة</h2>
            <span className="text-xs text-slate-400">نسخة الطالب الرسمية</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {typeof attempt.answers === "object" && attempt.answers.submission_text
              ? attempt.answers.submission_text
              : typeof attempt.answers === "object" && attempt.answers.self_reported
                ? `نتيجتك في الاختبار التفاعلي: ${formatScore(attempt.answers.self_reported.score)} / ${formatScore(attempt.answers.self_reported.total)}`
                : "تم تسجيل إجابتك."}
          </div>
        </section>
      )}

      {safeExamUrl && (
        <section>
          <FileViewer
            fileUrl={safeExamUrl}
            title={`ملف أسئلة الاختبار — ${quiz.title}`}
          />
        </section>
      )}

      {safeAnswerKeyUrl && (
        <section>
          <FileViewer
            fileUrl={safeAnswerKeyUrl}
            title={`نموذج الإجابة — ${quiz.title}`}
          />
        </section>
      )}
    </div>
  );
}