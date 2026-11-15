"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const MAX_CANVAS_PIXELS = 12000000;

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  targetWidth,
  isNearViewport,
  defaultAspectRatio,
  onAspectRatioChange,
}) {
  const canvasRef = useRef(null);
  const activeTaskRef = useRef(null);
  const renderedSigRef = useRef("");
  const [renderedSig, setRenderedSig] = useState("");
  const [pageRatio, setPageRatio] = useState(defaultAspectRatio || 1.414);

  const safeWidth = Math.max(200, Math.floor(targetWidth || 320));
  const estimatedHeight = Math.max(240, Math.round(safeWidth * pageRatio));
  const widthPrefix = pageNumber + "-" + safeWidth + "-";
  const isRenderedForCurrentWidth =
    isNearViewport && renderedSig.startsWith(widthPrefix);

  useEffect(() => {
    let cancelled = false;

    async function cancelCurrentTask() {
      const existingTask = activeTaskRef.current;
      if (existingTask) {
        activeTaskRef.current = null;
        try {
          existingTask.cancel();
        } catch (_) {}
        try {
          await existingTask.promise;
        } catch (_) {}
      }
    }

    async function runPageLifecycle() {
      const canvas = canvasRef.current;

      if (!isNearViewport) {
        await cancelCurrentTask();
        if (cancelled) return;
        if (canvas && (canvas.width > 0 || canvas.height > 0)) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.width = 0;
          canvas.height = 0;
        }
        renderedSigRef.current = "";
        await Promise.resolve();
        if (!cancelled) {
          setRenderedSig("");
        }
        return;
      }

      if (!pdfDoc || !canvas || safeWidth <= 0) return;

      const dpr = Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        2.5
      );
      const currentSig = pageNumber + "-" + safeWidth + "-" + dpr;

      if (renderedSigRef.current === currentSig) {
        return;
      }

      await cancelCurrentTask();
      if (cancelled) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const ratio = unscaledViewport.height / unscaledViewport.width;
        if (Number.isFinite(ratio) && ratio > 0) {
          setPageRatio(ratio);
          if (pageNumber === 1 && onAspectRatioChange) {
            onAspectRatioChange(ratio);
          }
        }

        const cssScale = safeWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: cssScale });

        const targetCanvas = canvasRef.current;
        if (!targetCanvas || cancelled) return;

        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);

        // حد أقصى لحجم الـ canvas (Android Chrome يفشل بصمت عند canvas ضخمة)
        let outputScale = dpr;
        const requestedPixels =
          viewport.width * outputScale * viewport.height * outputScale;
        if (requestedPixels > MAX_CANVAS_PIXELS) {
          outputScale *= Math.sqrt(MAX_CANVAS_PIXELS / requestedPixels);
        }

        const pixelWidth = Math.max(1, Math.floor(viewport.width * outputScale));
        const pixelHeight = Math.max(1, Math.floor(viewport.height * outputScale));

        targetCanvas.width = pixelWidth;
        targetCanvas.height = pixelHeight;
        targetCanvas.style.width = cssWidth + "px";
        targetCanvas.style.height = cssHeight + "px";

        const ctx = targetCanvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pixelWidth, pixelHeight);

        const renderContext = {
          canvasContext: ctx,
          viewport,
          transform:
            outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          annotationMode: 0,
        };

        const renderTask = page.render(renderContext);
        activeTaskRef.current = renderTask;

        await renderTask.promise;

        if (activeTaskRef.current === renderTask) {
          activeTaskRef.current = null;
        }

        if (!cancelled) {
          renderedSigRef.current = currentSig;
          setRenderedSig(currentSig);
        }
      } catch (err) {
        if (
          cancelled ||
          err?.name === "RenderingCancelledException" ||
          String(err?.message || "").includes("cancelled")
        ) {
          return;
        }
        console.error("Error rendering PDF page " + pageNumber + ":", err);
      }
    }

    runPageLifecycle();

    return () => {
      cancelled = true;
      const runningTask = activeTaskRef.current;
      if (runningTask) {
        try {
          runningTask.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, pageNumber, safeWidth, isNearViewport, onAspectRatioChange]);

  useEffect(() => {
    return () => {
      const runningTask = activeTaskRef.current;
      if (runningTask) {
        activeTaskRef.current = null;
        try {
          runningTask.cancel();
        } catch (_) {}
      }
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  return (
    <div
      data-page-number={pageNumber}
      style={{
        width: safeWidth + "px",
        minHeight: estimatedHeight + "px",
      }}
      className="relative mx-auto bg-white shadow-md rounded-lg overflow-hidden flex items-center justify-center select-none"
    >
      <canvas ref={canvasRef} className="block" />
      {!isRenderedForCurrentWidth && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-[11px] font-mono">صفحة {pageNumber}</span>
        </div>
      )}
    </div>
  );
}

export default function PdfCanvasViewer({
  fileUrl,
  title = "مستند PDF",
  inFocus = false,
}) {
  const scrollContainerRef = useRef(null);
  const [docState, setDocState] = useState({
    url: null,
    status: "loading",
    pdfDoc: null,
    numPages: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingProgress, setLoadingProgress] = useState(10);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [nearPages, setNearPages] = useState(() => new Set([1, 2]));
  const [defaultRatio, setDefaultRatio] = useState(1.414);

  const isCurrentUrl = docState.url === fileUrl;
  const status = isCurrentUrl ? docState.status : "loading";
  const pdfDoc = isCurrentUrl ? docState.pdfDoc : null;
  const numPages = isCurrentUrl ? docState.numPages : 0;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setContainerWidth(Math.max(220, w - (inFocus ? 16 : 24)));
      }
    };

    const initTimer = setTimeout(measure, 0);

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } else {
      window.addEventListener("resize", measure);
    }

    return () => {
      clearTimeout(initTimer);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", measure);
    };
  }, [inFocus]);

  useEffect(() => {
    if (!fileUrl) return;

    let cancelled = false;
    let loadingTask = null;
    let loadedDoc = null;

    async function loadDocument() {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (cancelled) return;

        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        }

        loadingTask = pdfjs.getDocument({
          url: fileUrl,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          isEvalSupported: false,
          disableFontFace: true,
          useSystemFonts: false,
        });

        loadingTask.onProgress = (progressData) => {
          if (cancelled) return;
          if (progressData && progressData.total > 0) {
            const pct = Math.min(
              95,
              Math.max(15, Math.round((progressData.loaded / progressData.total) * 100))
            );
            setLoadingProgress(pct);
          }
        };

        loadedDoc = await loadingTask.promise;
        if (cancelled) {
          await loadedDoc.destroy();
          return;
        }

        setCurrentPage(1);
        setNearPages(new Set([1, 2]));
        setLoadingProgress(100);
        setDocState({
          url: fileUrl,
          status: "ready",
          pdfDoc: loadedDoc,
          numPages: loadedDoc.numPages || 0,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading PDF in PdfCanvasViewer:", err);
        setDocState({
          url: fileUrl,
          status: "error",
          pdfDoc: null,
          numPages: 0,
        });
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
      if (loadingTask && typeof loadingTask.destroy === "function") {
        try {
          loadingTask.destroy();
        } catch (_) {}
      }
      if (loadedDoc && typeof loadedDoc.destroy === "function") {
        try {
          loadedDoc.destroy();
        } catch (_) {}
      }
    };
  }, [fileUrl]);

  useEffect(() => {
    if (status !== "ready" || numPages <= 0) return;
    const root = scrollContainerRef.current;
    if (!root) return;

    const nodes = root.querySelectorAll("[data-page-number]");
    if (!nodes.length) return;

    const lazyObserver = new IntersectionObserver(
      (entries) => {
        setNearPages((prev) => {
          const next = new Set(prev);
          entries.forEach((entry) => {
            const pageNum = Number(entry.target.getAttribute("data-page-number"));
            if (!pageNum) return;
            if (entry.isIntersecting) {
              next.add(pageNum);
              if (pageNum > 1) next.add(pageNum - 1);
              if (pageNum < numPages) next.add(pageNum + 1);
            } else {
              next.delete(pageNum);
            }
          });
          if (next.size === 0) next.add(1);
          return next;
        });
      },
      {
        root,
        rootMargin: "120% 0px 120% 0px",
        threshold: 0.01,
      }
    );

    const visibleRatios = new Map();
    const currentObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute("data-page-number"));
          if (!pageNum) return;
          if (entry.isIntersecting) {
            visibleRatios.set(pageNum, entry.intersectionRatio);
          } else {
            visibleRatios.delete(pageNum);
          }
        });

        let bestPage = null;
        let bestRatio = -1;
        visibleRatios.forEach((ratio, p) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = p;
          }
        });
        if (bestPage) {
          setCurrentPage(bestPage);
        }
      },
      {
        root,
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    );

    nodes.forEach((node) => {
      lazyObserver.observe(node);
      currentObserver.observe(node);
    });

    return () => {
      lazyObserver.disconnect();
      currentObserver.disconnect();
    };
  }, [status, numPages, zoom, containerWidth]);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  }, []);

  const handleFitWidth = useCallback(() => {
    setZoom(1);
  }, []);

  const targetPageWidth = Math.max(200, Math.floor((containerWidth || 320) * zoom));
  const pagesArray = Array.from({ length: numPages }, (_, i) => i + 1);
  const displayedProgress = isCurrentUrl ? loadingProgress : 10;

  return (
    <div
      dir="rtl"
      className={
        inFocus
          ? "flex flex-col w-full h-full bg-slate-900 text-slate-100"
          : "flex flex-col w-full h-[650px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 text-slate-900"
      }
    >
      <div
        className={
          inFocus
            ? "flex items-center justify-between gap-2 px-3 py-2 border-b text-xs shrink-0 flex-wrap bg-slate-900/95 border-slate-800 text-slate-200"
            : "flex items-center justify-between gap-2 px-3 py-2 border-b text-xs shrink-0 flex-wrap bg-white border-slate-200 text-slate-700"
        }
      >
        <div className="flex items-center gap-2 font-semibold">
          <span
            className={
              inFocus
                ? "px-2.5 py-1 rounded-lg font-mono text-[11px] bg-slate-800 text-slate-200 border border-slate-700"
                : "px-2.5 py-1 rounded-lg font-mono text-[11px] bg-slate-100 text-slate-800 border border-slate-200"
            }
          >
            {numPages > 0 ? "صفحة " + currentPage + " / " + numPages : "جاري التحميل..."}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={status !== "ready" || zoom <= MIN_ZOOM}
            title="تصغير"
            aria-label="تصغير"
            className={
              inFocus
                ? "p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                : "p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            }
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <span className="font-mono text-[11px] min-w-[44px] text-center font-semibold">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={status !== "ready" || zoom >= MAX_ZOOM}
            title="تكبير"
            aria-label="تكبير"
            className={
              inFocus
                ? "p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                : "p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            }
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleFitWidth}
            disabled={status !== "ready" || zoom === 1}
            title="ملاءمة العرض"
            className={
              inFocus
                ? "px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                : "px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            }
          >
            <Maximize2 className="h-3 w-3" />
            <span>ملاءمة العرض</span>
          </button>
        </div>
      </div>

      {status === "loading" && (
        <div className="w-full h-1 bg-slate-700/30 overflow-hidden shrink-0">
          <div
            className="h-full bg-blue-600 transition-all duration-200"
            style={{ width: displayedProgress + "%" }}
          />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
        className={
          inFocus
            ? "flex-1 overflow-auto p-2 sm:p-4 space-y-4 bg-slate-950"
            : "flex-1 overflow-auto p-2 sm:p-4 space-y-4 bg-slate-200/70"
        }
      >
        {status === "loading" && (
          <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-center p-6">
            <RefreshCw className="h-7 w-7 animate-spin text-blue-500" />
            <div className="space-y-1">
              <p className={inFocus ? "text-xs font-bold text-slate-200" : "text-xs font-bold text-slate-800"}>
                جاري تجهيز صفحات المستند... ({displayedProgress}%)
              </p>
              <p className="text-[11px] text-slate-400 truncate max-w-xs">{title}</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-4 text-center p-6">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className={inFocus ? "text-sm font-bold text-white" : "text-sm font-bold text-slate-900"}>
                تعذر عرض ملف الـ PDF داخل الصفحة
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                قد يكون السبب قيود المصدر الخارجي (CORS) أو اتصال الشبكة. يمكنك فتح الملف مباشرة.
              </p>
            </div>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>فتح الملف</span>
            </a>
          </div>
        )}

        {status === "ready" &&
          pdfDoc &&
          pagesArray.map((pageNum) => (
            <PdfPageCanvas
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNumber={pageNum}
              targetWidth={targetPageWidth}
              isNearViewport={nearPages.has(pageNum)}
              defaultAspectRatio={defaultRatio}
              onAspectRatioChange={setDefaultRatio}
            />
          ))}
      </div>
    </div>
  );
}