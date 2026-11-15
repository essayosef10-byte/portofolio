"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Download,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Maximize,
  Minimize,
  X,
} from "lucide-react";
import PdfCanvasViewer from "@/components/PdfCanvasViewer";
import {
  getSafeHttpsUrl,
  getFileViewerType,
  getOfficeEmbedUrl,
  getDownloadUrl,
  MAX_TXT_BYTES,
} from "@/lib/fileViewer";

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function subscribePdfCanvasMode(callback) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", callback);
  return () => {
    mql.removeEventListener("change", callback);
  };
}

function getPdfCanvasModeSnapshot() {
  const pdfDisabled =
    typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false;
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return Boolean(pdfDisabled || coarsePointer);
}

function getPdfCanvasModeServerSnapshot() {
  return false;
}

function usePdfCanvasMode() {
  return useSyncExternalStore(
    subscribePdfCanvasMode,
    getPdfCanvasModeSnapshot,
    getPdfCanvasModeServerSnapshot
  );
}

function useCanFullscreen() {
  return useSyncExternalStore(
    emptySubscribe,
    () => Boolean(typeof document !== "undefined" && document.fullscreenEnabled),
    () => false
  );
}

function buildFocusPdfIframeUrl(safeUrl) {
  if (!safeUrl) return null;
  const base = safeUrl.split("#")[0];
  return base + "#view=FitH";
}

export default function FileViewer({
  fileUrl,
  title = "ملف مرفق",
  defaultFocus = false,
}) {
  const safeUrl = getSafeHttpsUrl(fileUrl);
  const viewerType = getFileViewerType(safeUrl);
  const downloadUrl = getDownloadUrl(safeUrl, title);

  const isClient = useIsClient();
  const useCanvasPdf = usePdfCanvasMode();
  const canFullscreen = useCanFullscreen();

  const focusKey = (safeUrl || "") + "::" + String(Boolean(defaultFocus));
  const [focusState, setFocusState] = useState(() => ({
    key: focusKey,
    isOpen: Boolean(defaultFocus),
    hasExited: false,
  }));

  const isFocusOpen =
    focusState.key === focusKey ? focusState.isOpen : Boolean(defaultFocus);
  const hasExitedFocus =
    focusState.key === focusKey ? focusState.hasExited : false;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const overlayRef = useRef(null);
  const focusTriggerRef = useRef(null);
  const wasFocusOpenRef = useRef(false);

  const [txtState, setTxtState] = useState({
    url: null,
    status: "idle",
    content: "",
  });

  const closeFocusMode = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setFocusState({
      key: focusKey,
      isOpen: false,
      hasExited: true,
    });
  }, [focusKey]);

  const openFocusMode = useCallback(() => {
    setFocusState((prev) => ({
      key: focusKey,
      isOpen: true,
      hasExited: prev.key === focusKey ? prev.hasExited : false,
    }));
  }, [focusKey]);

  useEffect(() => {
    if (!isClient) return;

    if (isFocusOpen) {
      wasFocusOpenRef.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const focusTimer = setTimeout(() => {
        if (overlayRef.current) {
          overlayRef.current.focus();
        }
      }, 0);

      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeFocusMode();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        clearTimeout(focusTimer);
        window.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousOverflow;
      };
    } else if (wasFocusOpenRef.current) {
      wasFocusOpenRef.current = false;
      const returnTimer = setTimeout(() => {
        if (focusTriggerRef.current && typeof focusTriggerRef.current.focus === "function") {
          focusTriggerRef.current.focus();
        }
      }, 0);
      return () => clearTimeout(returnTimer);
    }
  }, [isFocusOpen, isClient, closeFocusMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement && overlayRef.current) {
        overlayRef.current.focus();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    if (typeof document === "undefined" || !overlayRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (overlayRef.current.requestFullscreen) {
        await overlayRef.current.requestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen toggle error:", err);
    }
  };

  useEffect(() => {
    if (viewerType !== "txt" || !safeUrl) return;

    const controller = new AbortController();
    let cancelled = false;

    async function loadTextFile() {
      try {
        const response = await fetch(safeUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const contentLength = Number(response.headers.get("content-length") || "0");
        if (contentLength > MAX_TXT_BYTES) {
          if (!cancelled) {
            setTxtState({ url: safeUrl, status: "too_large", content: "" });
          }
          return;
        }

        if (response.body && typeof response.body.getReader === "function") {
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > MAX_TXT_BYTES) {
              await reader.cancel();
              if (!cancelled) {
                setTxtState({ url: safeUrl, status: "too_large", content: "" });
              }
              return;
            }
            chunks.push(value);
          }

          const combined = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
          }

          const decoded = new TextDecoder("utf-8").decode(combined);
          if (!cancelled) {
            setTxtState({ url: safeUrl, status: "ready", content: decoded });
          }
        } else {
          const blob = await response.blob();
          if (blob.size > MAX_TXT_BYTES) {
            if (!cancelled) {
              setTxtState({ url: safeUrl, status: "too_large", content: "" });
            }
            return;
          }
          const text = await blob.text();
          if (!cancelled) {
            setTxtState({ url: safeUrl, status: "ready", content: text });
          }
        }
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        console.error("Error loading text file:", err);
        setTxtState({ url: safeUrl, status: "error", content: "" });
      }
    }

    loadTextFile();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [safeUrl, viewerType]);

  if (!safeUrl || viewerType === "invalid") {
    return null;
  }

  const officeEmbedUrl = viewerType === "office" ? getOfficeEmbedUrl(safeUrl) : null;
  const focusPdfIframeUrl = viewerType === "pdf" ? buildFocusPdfIframeUrl(safeUrl) : null;
  const isTxtLoading =
    viewerType === "txt" && (txtState.url !== safeUrl || txtState.status === "loading");
  const canEnterFocus = viewerType !== "download";

  const focusOverlay =
    isClient && isFocusOpen && canEnterFocus
      ? createPortal(
          <div
            ref={overlayRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            dir="rtl"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-slate-950 text-white flex flex-col focus:outline-hidden select-none"
          >
            <div className="h-11 min-h-[44px] px-2 sm:px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                {viewerType === "image" ? (
                  <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  {title}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-400" />
                    <span>تحميل</span>
                  </a>
                )}

                {canFullscreen && (
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    title={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors cursor-pointer"
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize className="h-3.5 w-3.5 text-blue-400" />
                        <span className="hidden sm:inline">إنهاء ملء الشاشة</span>
                      </>
                    ) : (
                      <>
                        <Maximize className="h-3.5 w-3.5 text-blue-400" />
                        <span className="hidden sm:inline">ملء الشاشة</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeFocusMode}
                  aria-label="إغلاق وضع التركيز"
                  title="إغلاق (Esc)"
                  className="min-w-[44px] min-h-[44px] -my-1 inline-flex items-center justify-center rounded-lg text-slate-200 hover:text-white hover:bg-rose-600/80 transition-colors cursor-pointer text-lg font-bold"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 w-full relative overflow-hidden bg-slate-950 flex flex-col">
              {viewerType === "pdf" &&
                (useCanvasPdf ? (
                  <PdfCanvasViewer fileUrl={safeUrl} title={title} inFocus={true} />
                ) : (
                  <iframe
                    src={focusPdfIframeUrl || safeUrl}
                    className="w-full h-full flex-1 border-0 bg-slate-900"
                    title={title}
                  />
                ))}

              {viewerType === "office" && officeEmbedUrl && (
                <div className="w-full h-full flex-1 flex flex-col">
                  <iframe
                    src={officeEmbedUrl}
                    className="w-full flex-1 border-0 bg-white"
                    title={title}
                    allowFullScreen
                  />
                  <div className="py-1.5 px-3 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 text-center shrink-0">
                    لو الملف ما ظهرش، حمّله من الزر
                  </div>
                </div>
              )}

              {viewerType === "image" && (
                <div
                  style={{ touchAction: "pan-x pan-y pinch-zoom" }}
                  className="w-full h-full flex-1 overflow-auto flex items-center justify-center p-2 sm:p-4 bg-slate-950"
                >
                  <img
                    src={safeUrl}
                    alt={title}
                    className="max-w-full max-h-full w-auto h-auto object-contain select-auto"
                  />
                </div>
              )}

              {viewerType === "txt" && (
                <div className="w-full h-full flex-1 overflow-auto p-4 sm:p-8 bg-slate-950 select-text">
                  {isTxtLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
                      <RefreshCw className="h-6 w-6 text-blue-400 animate-spin" />
                      <p className="text-xs font-semibold">جاري تحميل محتوى الملف...</p>
                    </div>
                  ) : txtState.status === "too_large" ? (
                    <div className="max-w-md mx-auto my-12 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-center space-y-2">
                      <AlertCircle className="h-6 w-6 text-amber-400 mx-auto" />
                      <p className="text-xs font-bold">الملف كبير، حمّله</p>
                    </div>
                  ) : txtState.status === "error" ? (
                    <div className="max-w-md mx-auto my-12 p-6 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-center space-y-2">
                      <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-semibold">تعذر عرض الملف النصي داخل الصفحة.</p>
                    </div>
                  ) : (
                    <pre className="max-w-4xl mx-auto p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 text-sm sm:text-base text-slate-100 font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {txtState.content}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {focusOverlay}

      <div
        dir="rtl"
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 min-w-0">
            {viewerType === "image" ? (
              <ImageIcon className="h-5 w-5 text-blue-600 shrink-0" />
            ) : (
              <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            )}
            <span className="truncate">{title}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canEnterFocus && (
              <button
                ref={focusTriggerRef}
                type="button"
                onClick={openFocusMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs cursor-pointer"
              >
                <Maximize className="h-3.5 w-3.5" />
                <span>
                  {defaultFocus && hasExitedFocus ? "العودة لوضع التركيز" : "وضع التركيز"}
                </span>
              </button>
            )}

            {downloadUrl && viewerType !== "download" && (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-2xs shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>تحميل</span>
              </a>
            )}
          </div>
        </div>

        {viewerType === "pdf" &&
          (useCanvasPdf ? (
            <PdfCanvasViewer fileUrl={safeUrl} title={title} inFocus={false} />
          ) : (
            <div className="w-full h-[650px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <iframe src={safeUrl} className="w-full h-full border-0" title={title} />
            </div>
          ))}

        {viewerType === "image" && (
          <div
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
            className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-3 flex items-center justify-center"
          >
            <img
              src={safeUrl}
              alt={title}
              className="max-w-full max-h-[700px] w-auto h-auto object-contain rounded-lg"
            />
          </div>
        )}

        {viewerType === "txt" && (
          <div className="space-y-3">
            {isTxtLoading ? (
              <div className="py-12 text-center space-y-2 rounded-xl border border-slate-200 bg-slate-50">
                <RefreshCw className="h-6 w-6 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-600">جاري تحميل محتوى الملف...</p>
              </div>
            ) : txtState.status === "too_large" ? (
              <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-amber-600 mx-auto" />
                <p className="text-xs font-bold">الملف كبير، حمّله</p>
              </div>
            ) : txtState.status === "error" ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold">تعذر عرض الملف النصي داخل الصفحة.</p>
              </div>
            ) : (
              <pre className="w-full max-h-[600px] overflow-auto p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono whitespace-pre-wrap break-words leading-relaxed">
                {txtState.content}
              </pre>
            )}
          </div>
        )}

        {viewerType === "office" && officeEmbedUrl && (
          <div className="space-y-2">
            <div className="w-full h-[650px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <iframe
                src={officeEmbedUrl}
                className="w-full h-full border-0"
                title={title}
                allowFullScreen
              />
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              لو الملف ما ظهرش، حمّله من الزر
            </p>
          </div>
        )}

        {viewerType === "download" && (
          <div className="p-8 text-center space-y-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {downloadUrl
                  ? "هذا النوع من الملفات متاح للتحميل المباشر من الزر."
                  : "هذا الرابط متاح للفتح والاطلاع مباشرة."}
              </p>
            </div>
            <div>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                  <span>تحميل</span>
                </a>
              ) : (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                  <span>فتح الرابط</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}