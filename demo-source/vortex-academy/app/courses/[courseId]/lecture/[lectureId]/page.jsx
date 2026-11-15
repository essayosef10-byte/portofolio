"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Music,
  Sparkles,
  AlertCircle,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import FileViewer from "@/components/FileViewer";
import {
  getSafeHttpsUrl,
  getPathnameExtension,
  getDownloadUrl,
} from "@/lib/fileViewer";

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg"]);
const DIRECT_VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

function getVideoEmbedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let id = null;
    if (host === "youtu.be") {
      id = u.pathname.split("/")[1];
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
        if (m) id = m[2];
      }
    }
    if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "drive.google.com") {
      const m = u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
  } catch (_) {}
  return null;
}

export default function FocusModeLecturePage() {
  const params = useParams();
  const router = useRouter();

  const rawCourseId = params?.courseId ? String(params.courseId) : "";
  const rawLectureId = params?.lectureId ? String(params.lectureId) : "";

  const [lectureState, setLectureState] = useState({
    lectureId: null,
    material: null,
    course: null,
    courseMaterials: [],
    error: null,
  });
  const [toastMessage, setToastMessage] = useState(null);

  const loading = Boolean(rawLectureId) && lectureState.lectureId !== rawLectureId;
  const material = lectureState.lectureId === rawLectureId ? lectureState.material : null;
  const course = lectureState.lectureId === rawLectureId ? lectureState.course : null;
  const courseMaterials =
    lectureState.lectureId === rawLectureId ? lectureState.courseMaterials : [];
  const error = lectureState.lectureId === rawLectureId ? lectureState.error : null;

  useEffect(() => {
    let ignore = false;

    async function loadLectureData() {
      if (!rawLectureId) return;

      try {
        const { data: matData, error: matErr } = await supabase
          .from("materials")
          .select("id, title, file_url, course_id, uploader_id, status, created_at, kind")
          .eq("id", rawLectureId)
          .eq("status", "approved")
          .maybeSingle();

        if (ignore) return;
        if (matErr) throw matErr;
        if (!matData) {
          setLectureState({
            lectureId: rawLectureId,
            material: null,
            course: null,
            courseMaterials: [],
            error: "المحاضرة أو المادة التعليمية غير متوفرة.",
          });
          return;
        }

        let loadedCourse = null;
        let loadedMaterials = [];

        const targetCourseId = matData.course_id || rawCourseId;
        if (targetCourseId) {
          const { data: cData } = await supabase
            .from("courses")
            .select("id, code, title")
            .eq("id", targetCourseId)
            .maybeSingle();

          if (cData) loadedCourse = cData;

          const { data: allMats } = await supabase
            .from("materials")
            .select("id, title, kind, created_at")
            .eq("course_id", targetCourseId)
            .eq("status", "approved")
            .order("created_at", { ascending: true });

          if (allMats) loadedMaterials = allMats;
        }

        if (!ignore) {
          setLectureState({
            lectureId: rawLectureId,
            material: matData,
            course: loadedCourse,
            courseMaterials: loadedMaterials,
            error: null,
          });
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading lecture:", err);
          setLectureState({
            lectureId: rawLectureId,
            material: null,
            course: null,
            courseMaterials: [],
            error: "حدث خطأ أثناء تحميل المحاضرة.",
          });
        }
      }
    }

    loadLectureData();

    return () => {
      ignore = true;
    };
  }, [rawLectureId, rawCourseId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">جاري تحميل المحاضرة...</p>
        </div>
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">تعذر فتح المحاضرة</h2>
            <p className="text-xs text-rose-600">{error || "المحاضرة غير متوفرة"}</p>
          </div>
          <Link
            href={course ? `/courses/${course.id}` : "/"}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>العودة إلى المقرر</span>
          </Link>
        </div>
      </div>
    );
  }

  const currentIndex = courseMaterials.findIndex((m) => m.id === material.id);
  const prevMaterial = currentIndex > 0 ? courseMaterials[currentIndex - 1] : null;
  const nextMaterial =
    currentIndex !== -1 && currentIndex < courseMaterials.length - 1
      ? courseMaterials[currentIndex + 1]
      : null;

  const safeFileUrl = getSafeHttpsUrl(material.file_url);
  const ext = getPathnameExtension(safeFileUrl);

  const videoEmbedUrl = safeFileUrl ? getVideoEmbedUrl(safeFileUrl) : null;
  const isDirectVideo = Boolean(safeFileUrl && DIRECT_VIDEO_EXTENSIONS.has(ext));
  const isVideoFile = Boolean(
    safeFileUrl && (material.kind === "video" || videoEmbedUrl || isDirectVideo)
  );

  const isAudioFile = Boolean(
    safeFileUrl && (material.kind === "audio" || AUDIO_EXTENSIONS.has(ext))
  );
  const audioDownloadUrl = isAudioFile ? getDownloadUrl(safeFileUrl, material.title) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={course ? `/courses/${course.id}` : "/"}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">العودة إلى {course?.code || "المقرر"}</span>
            <span className="sm:hidden">رجوع</span>
          </Link>

          <div className="h-4 w-px bg-slate-200 hidden sm:block shrink-0" />

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-blue-600 uppercase tracking-wider">
                {material.kind || "محاضرة"}
              </span>
              {course?.title && (
                <>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span className="text-slate-500 font-medium hidden sm:inline truncate">
                    {course.title}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-sm font-bold text-slate-900 truncate max-w-xs sm:max-w-md md:max-w-xl">
              {material.title}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {!safeFileUrl ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg font-bold text-slate-900">{material.title}</h2>
              <p className="text-xs text-slate-400">
                لا يوجد رابط ملف آمن (HTTPS) مرفق لهذه المحاضرة.
              </p>
            </div>
          </div>
        ) : isVideoFile ? (
          <div className="bg-slate-950 rounded-2xl overflow-hidden shadow-md border border-slate-800 text-white relative aspect-video flex flex-col justify-center">
            {videoEmbedUrl ? (
              <iframe
                src={videoEmbedUrl}
                title={material.title}
                className="w-full h-full border-0"
                allow="fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : isDirectVideo ? (
              <video src={safeFileUrl} controls className="w-full h-full object-contain">
                متصفحك لا يدعم تشغيل هذا الفيديو مباشرة.
              </video>
            ) : (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-slate-300">
                  هذا الرابط لا يدعم التشغيل داخل المنصة.
                </p>
                <a
                  href={safeFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>فتح الفيديو</span>
                </a>
              </div>
            )}
          </div>
        ) : isAudioFile ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-5 text-center">
            <div className="h-14 w-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-200">
              <Music className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{material.title}</h2>
            <audio
              src={safeFileUrl}
              controls
              preload="metadata"
              className="w-full max-w-xl mx-auto"
            >
              متصفحك لا يدعم تشغيل الملفات الصوتية.
            </audio>
            {audioDownloadUrl && (
              <div className="pt-2">
                <a
                  href={audioDownloadUrl}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>تحميل</span>
                </a>
              </div>
            )}
          </div>
        ) : (
          <FileViewer
            fileUrl={safeFileUrl}
            title={material.title}
            defaultFocus={true}
          />
        )}
      </main>

      {courseMaterials.length > 1 && (
        <footer
          id="lecture-focus-footer"
          className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-xs border-t border-slate-200 px-4 sm:px-8 py-3.5 shadow-md"
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => {
                if (prevMaterial) {
                  router.push(`/courses/${course?.id || rawCourseId}/lecture/${prevMaterial.id}`);
                }
              }}
              disabled={!prevMaterial}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                prevMaterial
                  ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
              <span>المحاضرة السابقة</span>
            </button>

            <span className="text-xs text-slate-500 font-medium">
              {currentIndex + 1} من {courseMaterials.length}
            </span>

            <button
              onClick={() => {
                if (nextMaterial) {
                  router.push(`/courses/${course?.id || rawCourseId}/lecture/${nextMaterial.id}`);
                }
              }}
              disabled={!nextMaterial}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                nextMaterial
                  ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              <span>المحاضرة التالية</span>
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}