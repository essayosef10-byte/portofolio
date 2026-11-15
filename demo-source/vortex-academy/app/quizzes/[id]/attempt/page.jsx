"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import FileViewer from "@/components/FileViewer";
import { getSafeHttpsUrl } from "@/lib/fileViewer";

function formatKind(kind) {
  if (kind === "past_exam") return "امتحان سابق";
  if (kind === "interactive") return "اختبار تفاعلي";
  return "اختبار";
}

function parseQuizResultMessage(data) {
  if (!data || typeof data !== "object") return null;
  if (data.type !== "vortex-quiz-result") return null;
  const score = Number(data.score);
  const total = Number(data.total);
  if (!Number.isFinite(score) || !Number.isFinite(total)) return null;
  if (total <= 0 || score < 0 || score > total) return null;
  return { score, total };
}

export default function ActiveQuizAttemptPage() {
  const params = useParams();
  const router = useRouter();
  const rawQuizId = params?.id ? String(params.id) : "";

  const [quiz, setQuiz] = useState(null);
  const [course, setCourse] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [studentAnswerText, setStudentAnswerText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selfResult, setSelfResult] = useState(null);
  const iframeRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!rawQuizId) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (!user) {
          setError("يجب تسجيل الدخول أولاً لأداء الاختبار.");
          setLoading(false);
          return;
        }
        setCurrentUser(user);

        const { data: quizData, error: quizErr } = await supabase
          .from("quizzes")
          .select("id, course_id, department, academic_year, kind, title, exam_file_url, html_content, created_at")
          .eq("id", rawQuizId)
          .maybeSingle();

        if (ignore) return;
        if (quizErr) throw quizErr;

        if (!quizData) {
          setError("الاختبار المطلوب غير موجود أو غير متاح لقسمك وفرقتك الدراسية.");
          setLoading(false);
          return;
        }

        setQuiz(quizData);

        if (quizData.course_id) {
          const { data: courseData } = await supabase
            .from("courses")
            .select("id, code, title")
            .eq("id", quizData.course_id)
            .maybeSingle();

          if (!ignore && courseData) setCourse(courseData);
        }

        const { data: attemptData } = await supabase
          .from("quiz_attempts")
          .select("id, score, answers, submitted_at")
          .eq("quiz_id", quizData.id)
          .eq("student_id", user.id)
          .maybeSingle();

        if (!ignore && attemptData) {
          setExistingAttempt(attemptData);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading quiz:", err);
          setError("حدث خطأ أثناء تحميل بيانات الاختبار. يرجى المحاولة مرة أخرى.");
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
  }, [rawQuizId]);

  useEffect(() => {
    if (!quiz || quiz.kind !== "interactive" || existingAttempt) return;
    const handler = (event) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const parsed = parseQuizResultMessage(event.data);
      if (parsed) setSelfResult(parsed);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [quiz, existingAttempt]);

  const isInteractive = quiz?.kind === "interactive";

  const handleSubmitAttempt = async () => {
    if (!currentUser || !quiz) return;
    if (isInteractive) {
      if (!selfResult) {
        showToast("أنهِ حل الاختبار أولاً حتى تظهر نتيجتك.");
        return;
      }
    } else if (!studentAnswerText.trim()) {
      showToast("يرجى كتابة إجاباتك أو إرفاق تفاصيل الحل قبل الإرسال.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: insErr } = await supabase.from("quiz_attempts").insert({
        quiz_id: quiz.id,
        student_id: currentUser.id,
        score: null,
        answers: isInteractive
          ? {
              self_reported: { score: selfResult.score, total: selfResult.total },
              submitted_at: new Date().toISOString(),
            }
          : {
              submission_text: studentAnswerText.trim(),
              submitted_at: new Date().toISOString(),
            },
        submitted_at: new Date().toISOString(),
      });

      if (insErr) throw insErr;

      showToast("تم إرسال إجابة الاختبار بنجاح!");
      setShowSubmitModal(false);
      router.push(`/quizzes/${quiz.id}/result`);
    } catch (err) {
      console.error("Error submitting attempt:", err);
      showToast("حدث خطأ أثناء حفظ الإجابة. يرجى المحاولة مرة أخرى.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">جاري تحميل الاختبار...</p>
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
            <h2 className="text-base font-bold text-slate-900">تعذر فتح الاختبار</h2>
            <p className="text-xs text-rose-600 leading-relaxed">{error || "الاختبار غير موجود"}</p>
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

  const safeExamUrl = getSafeHttpsUrl(quiz.exam_file_url);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/quizzes"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="العودة إلى قائمة الاختبارات"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                {course?.code && (
                  <>
                    <span className="font-bold text-blue-600 uppercase tracking-wider">
                      {course.code}
                    </span>
                    <span className="text-slate-300">•</span>
                  </>
                )}
                <span className="text-slate-500 font-medium truncate">
                  {formatKind(quiz.kind)}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {quiz.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {existingAttempt ? (
              <Link
                href={`/quizzes/${quiz.id}/result`}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>تم الأداء · عرض النتيجة</span>
              </Link>
            ) : (
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={isInteractive && !selfResult}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>تسليم الإجابات</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {existingAttempt && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <p className="font-bold">لقد قمت بتسليم إجابة هذا الاختبار بالفعل.</p>
                <p className="text-emerald-700 mt-0.5">
                  تم التسليم بتاريخ: {new Date(existingAttempt.submitted_at).toLocaleString("ar-EG")}
                </p>
              </div>
            </div>
            <Link
              href={`/quizzes/${quiz.id}/result`}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors self-start sm:self-center shrink-0"
            >
              عرض النتيجة والتفاصيل
            </Link>
          </div>
        )}

        {safeExamUrl && (
          <FileViewer
            fileUrl={safeExamUrl}
            title={`ملف الأسئلة المرفق — ${quiz.title}`}
          />
        )}

        {quiz.html_content && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">نص وتفاصيل الاختبار</h2>
              <span className="text-[11px] text-slate-400">محتوى الأسئلة الرسمي</span>
            </div>
            <div className="w-full min-h-[400px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts"
                srcDoc={quiz.html_content}
                className={`w-full border-0 ${isInteractive ? "h-[640px]" : "h-[500px]"}`}
                title={quiz.title}
              />
            </div>
          </div>
        )}

        {!existingAttempt && isInteractive && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            {selfResult ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>
                  نتيجتك في الاختبار: <strong>{selfResult.score} / {selfResult.total}</strong>. يمكنك الآن تسليمها.
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs sm:text-sm">
                أنهِ حل الاختبار بالأعلى وستظهر نتيجتك هنا. التسليم مرة واحدة فقط.
              </div>
            )}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-slate-400">
                النتيجة هنا للمذاكرة، والدرجة الرسمية يعتمدها المصحّح.
              </span>
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={submitting || !selfResult}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>تسليم النتيجة</span>
              </button>
            </div>
          </div>
        )}

        {!existingAttempt && !isInteractive && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">نموذج إجابة الطالب</h2>
              <p className="text-xs text-slate-500">
                اكتب إجاباتك بالتفصيل، موضحاً رقم كل سؤال والخطوات الرياضية أو الشرح المطلوب.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                نص الإجابة والحلول
              </label>
              <textarea
                rows={10}
                maxLength={20000}
                value={studentAnswerText}
                onChange={(e) => setStudentAnswerText(e.target.value)}
                placeholder="اكتب هنا إجاباتك المنظمة..."
                className="w-full p-4 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all leading-relaxed"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                سيتم إرسال إجابتك مباشرة إلى مدرس المادة لرصد الدرجة.
              </span>
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={submitting || !studentAnswerText.trim()}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>تسليم الإجابات الآن</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Send className="h-5 w-5" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                تأكيد تسليم إجابة الاختبار؟
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                هل أنت متأكد من رغبتك في تسليم الحل النهائي للاختبار؟ لن تتمكن من تعديل الإجابات بعد التأكيد.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                متابعة الحل
              </button>
              <button
                onClick={handleSubmitAttempt}
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>جاري التسليم...</span>
                  </>
                ) : (
                  <span>تأكيد وتسليم</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}