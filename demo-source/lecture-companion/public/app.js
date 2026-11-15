const $ = (selector) => document.querySelector(selector);
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1';

// ── Upload limits (Supabase free plan: 50 MB/object) ───────────────────
// Audio above COMPRESS_ABOVE_BYTES is re-encoded in the browser (ffmpeg.wasm)
// before upload. PDFs above STORAGE_LIMIT_BYTES are rejected outright (no
// client-side PDF compression yet). The <input> max stays 100 MB.
const STORAGE_LIMIT_BYTES = 48 * 1024 * 1024;   // 48 MB (safety margin under 50)
const COMPRESS_ABOVE_BYTES = 40 * 1024 * 1024;   // 40 MB — compress above this
// Audio input cap. Originally 100 MB, raised to 250 MB now that client-side
// compression (ffmpeg.wasm) reduces >40 MB files to <15 MB before upload.
// 250 MB covers a ~2.5-hour lecture at 192 kbps. Beyond that the browser's
// memory (arrayBuffer for ffmpeg) gets risky on phones.
const MAX_AUDIO_INPUT_BYTES = 250 * 1024 * 1024;  // 250 MB

// ── Supabase client (lazy-loaded) ──────────────────────────────────────
let supabaseClient = null;
async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const response = await fetch('/api/config');
  if (!response.ok) return null;
  const config = await response.json();
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabaseClient = createClient(config.supabaseUrl, config.supabaseKey);
  return supabaseClient;
}

async function uploadToSupabase(file, bucket = 'lectures') {
  const sb = await getSupabase();
  if (!sb) return null;
  const ext = file.name.split('.').pop() || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await sb.storage.from(bucket).upload(fileName, file, { upsert: false });
  if (error) {
    // Never leak raw English errors — log the details, show a friendly Arabic message.
    console.error('Supabase upload error:', error);
    const msg = String(error.message || '');
    if (/exceeded the maximum allowed size|payload too large|413/i.test(msg)) {
      throw new Error('الملف أكبر من حد التخزين المجاني (50 ميجابايت)');
    }
    throw new Error('تعذر رفع الملف على التخزين.');
  }
  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(fileName);
  return urlData.publicUrl;
}

// True when Supabase Storage is configured (Vercel). The local-dev raw-upload
// path returns false and skips compression — large files go straight to the
// server which has no 50 MB object limit.
let _storageChecked = false;
let _storageConfigured = false;
async function isStorageConfigured() {
  if (_storageChecked) return _storageConfigured;
  _storageConfigured = Boolean(await getSupabase());
  _storageChecked = true;
  return _storageConfigured;
}

// ── Client-side audio compression (ffmpeg.wasm, single-thread, no SAB) ──
// Pinned versions (no @latest). The UMD main exposes self.FFmpegWASM.FFmpeg.
// The class worker (814.ffmpeg.js) MUST be blobbed — browsers block cross-origin
// Workers. The core uses the ESM build (the module worker does import()).
const FFMPEG_FF_BASE = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd';
const FFMPEG_CORE_ESM = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
let _ffmpegScriptInjected = false;

async function _toBlobURL(url, mimeType) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`تعذر تحميل ملف الضغط (${url}: ${resp.status}).`);
  return URL.createObjectURL(new Blob([await resp.arrayBuffer()], { type: mimeType }));
}

async function _loadFfmpegEngine() {
  if (!_ffmpegScriptInjected) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${FFMPEG_FF_BASE}/ffmpeg.js`;
      s.onload = () => { _ffmpegScriptInjected = true; resolve(); };
      s.onerror = () => reject(new Error('تعذر تحميل مكتبة الضغط.'));
      document.head.appendChild(s);
    });
  }
  const { FFmpeg } = self.FFmpegWASM;
  const ffmpeg = new FFmpeg();
  const classWorkerURL = await _toBlobURL(`${FFMPEG_FF_BASE}/814.ffmpeg.js`, 'text/javascript');
  await ffmpeg.load({
    classWorkerURL,
    coreURL: `${FFMPEG_CORE_ESM}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_CORE_ESM}/ffmpeg-core.wasm`,
  });
  return ffmpeg;
}

// Compress audio for upload. Returns { file, compressed }.
//  - file.size <= COMPRESS_ABOVE_BYTES → returned unchanged.
//  - Supabase not configured (local dev) → returned unchanged (raw upload).
//  - Otherwise: ffmpeg -vn -ac 1 -ar 16000 -b:a 32k → MP3 (libmp3lame).
// The original state.audioFile is NEVER touched — only the upload copy changes.
async function prepareAudioForUpload(file) {
  if (file.size <= COMPRESS_ABOVE_BYTES) return { file, compressed: false };
  if (!(await isStorageConfigured())) return { file, compressed: false };

  let ffmpeg = null;
  let wakeLock = null;
  const inputName = `in-${Date.now()}.bin`;
  const outputName = 'out.mp3';
  try {
    // Keep the screen awake on phones — compression can take minutes.
    if (navigator.wakeLock?.request) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    }
    setProgress('جارٍ تجهيز أداة الضغط (مرة واحدة)…', 2);
    ffmpeg = await _loadFfmpegEngine();
    // ffmpeg progress is 0..1 for the current exec. Remap into 5..40 so the
    // bar never goes backwards when transcription continues from ~42.
    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.max(0, Math.min(1, progress));
      setProgress('جارٍ ضغط الصوت قبل الرفع…', Math.round(5 + pct * 35));
    });
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    setProgress('جارٍ ضغط الصوت قبل الرفع…', 6);
    // -vn: drop video · -ac 1: mono · -ar 16000: speech-friendly
    // Adaptive bitrate: 32k for normal files, 24k for >150 MB (likely long
    // lectures that would exceed the 48 MB storage limit at 32k). 24k mono
    // 16 kHz is still perfectly intelligible for speech.
    const bitrate = file.size > 150 * 1024 * 1024 ? '24k' : '32k';
    await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '1', '-ar', '16000', '-b:a', bitrate, outputName]);
    const out = await ffmpeg.readFile(outputName);
    if (!out || out.length === 0) throw new Error('الناتج فاضي.');
    if (out.length > STORAGE_LIMIT_BYTES) throw new Error('الناتج أكبر من حد التخزين.');
    const basename = file.name.replace(/\.[^.]+$/, '') || 'audio';
    const compressed = new File([out], `${basename}.mp3`, { type: 'audio/mpeg' });
    setProgress('اكتمل ضغط الصوت.', 41);
    return { file: compressed, compressed: true };
  } catch (err) {
    console.error('Audio compression failed:', err);
    throw new Error('تعذر ضغط الملف، جرّب ملفاً أقصر');
  } finally {
    if (ffmpeg) {
      try { await ffmpeg.deleteFile(inputName); } catch {}
      try { await ffmpeg.deleteFile(outputName); } catch {}
      try { ffmpeg.terminate(); } catch {}
    }
    if (wakeLock) { try { wakeLock.release(); } catch {} }
  }
}

// ── Client-side OCR (for scanned PDFs like CamScanner) ──────────────────
// On Vercel, server-side OCR times out (60s free / 300s Pro). For a 24MB
// scanned PDF, OCR can take 5-15 min. The browser has no such limit, so we
// run it here. We render each empty page to a canvas with pdfjs-dist, then
// run Tesseract (Arabic + English) on the canvas. Images never leave the
// device — only the extracted text goes into the saved session.
let pdfjsLib = null;
let tesseractWorkerSingleton = null;
let ocrLanguageData = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  // IMPORTANT: pdfjs-dist v4 main ESM bundle pulls in node_utils.js which
  // calls `canvas.createCanvas()` — that breaks in the browser. We use the
  // `legacy/build/pdf.mjs` build instead, which is the browser-safe variant
  // (no node-only deps). v3.x is also browser-safe but v4 legacy is fine here.
  //
  // We can't use `+esm` jsdelivr auto-bundling because it picks the main entry
  // (node build). We point directly at the legacy file inside the package.
  const PDFJS_VERSION = '4.6.82';
  const baseUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;
  pdfjsLib = import(`${baseUrl}/legacy/build/pdf.mjs`).then((mod) => {
    const lib = mod.default || mod;
    // Point pdfjs at its own worker so rendering doesn't block the main thread.
    // The legacy worker is the one that matches the legacy main build.
    lib.GlobalWorkerOptions.workerSrc = `${baseUrl}/legacy/build/pdf.worker.min.mjs`;
    // Some browsers need `workerPort` set explicitly when loading .mjs workers
    // from a cross-origin CDN. Use a real Worker to be safe.
    try {
      const workerUrl = `${baseUrl}/legacy/build/pdf.worker.min.mjs`;
      // Cross-origin module workers need a wrapper (browsers block cross-origin
      // `new Worker(url, { type: 'module' })` for some CDN setups). Use the
      // blob trick: import the worker as a module inside a blob.
      const blob = new Blob(
        [`import '${workerUrl}';`],
        { type: 'application/javascript' }
      );
      const blobUrl = URL.createObjectURL(blob);
      lib.GlobalWorkerOptions.workerPort = new Worker(blobUrl, { type: 'module' });
    } catch (err) {
      console.warn('Could not set pdfjs workerPort, falling back to workerSrc:', err);
    }
    return lib;
  });
  return pdfjsLib;
}

async function getTesseractWorker() {
  if (tesseractWorkerSingleton) return tesseractWorkerSingleton;
  const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/+esm');
  const tesseract = mod.default || mod;
  const { createWorker } = tesseract;
  // Arabic + English. The first call downloads language data (~10MB for ara,
  // ~12MB for eng) and caches it in IndexedDB; subsequent calls are fast.
  const workerPromise = createWorker(['ara', 'eng']);
  // If loading fails (CDN hiccup, blocked download…), clear the cached promise
  // so the NEXT upload can retry instead of staying broken until page reload.
  workerPromise.catch(() => {
    if (tesseractWorkerSingleton === workerPromise) tesseractWorkerSingleton = null;
  });
  tesseractWorkerSingleton = workerPromise;
  return tesseractWorkerSingleton;
}

// Render one PDF page to a canvas at 2× scale (good balance of OCR accuracy
// vs memory). Returns the canvas.
//
// Pixel cap: a 300dpi A4 scan is ~2480×3508pt → at scale 2 that's ~35
// MILLION pixels — iOS Safari refuses canvases over 16MP and the page would
// fail silently per-page. We clamp the render to ≤12MP (plenty for Tesseract)
// and never below scale 1.
const MAX_OCR_PIXELS = 12e6;
async function renderPageToCanvas(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  let scale = 2;
  if (base.width * base.height * scale * scale > MAX_OCR_PIXELS) {
    scale = Math.max(1, Math.sqrt(MAX_OCR_PIXELS / (base.width * base.height)));
  }
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

// OCR one page. The worker is created once by the caller (ocrEmptyPages)
// and passed in, so a worker-init failure surfaces immediately with a clear
// message instead of failing silently once per page.
async function ocrPage(pdfDoc, pageNum, worker) {
  const canvas = await renderPageToCanvas(pdfDoc, pageNum);
  const { data } = await worker.recognize(canvas, {}, {});
  return (data.text || '').replace(/\s+/g, ' ').trim();
}

// Run OCR on all empty pages of a scanned PDF. Reports overall progress
// (0-100) and a human label to the UI.
//
// Returns { results, failedCount, firstError } so the caller can tell the
// user WHY pages stayed empty instead of failing silently. Throws only when
// the OCR engine itself cannot start (CDN / language-data download failure).
async function ocrEmptyPages(pdfSource, emptyPages, onProgress) {
  if (!emptyPages.length) return { results: [], failedCount: 0, firstError: null };
  const pdfDoc = await openPdfDoc(pdfSource);

  // Load the engine up front: the first time downloads ~22MB of language
  // data, so show that in the progress label instead of looking stuck.
  onProgress(2, 'جارٍ تحميل محرك OCR وملفات اللغة (أول مرة بس)…');
  let worker;
  try {
    worker = await getTesseractWorker();
  } catch (err) {
    console.error('OCR engine failed to load:', err);
    throw new Error(`تعذر تحميل محرك OCR: ${err && err.message ? err.message : err}`);
  }

  const results = [];
  let failedCount = 0;
  let firstError = null;
  for (let i = 0; i < emptyPages.length; i++) {
    const pageNum = emptyPages[i];
    const overallProgress = Math.round((i / emptyPages.length) * 100);
    onProgress(overallProgress, `OCR للصفحة ${pageNum} (${i + 1} من ${emptyPages.length})…`);
    try {
      const text = await ocrPage(pdfDoc, pageNum, worker);
      results.push({ page: pageNum, text });
    } catch (err) {
      console.error(`OCR failed for page ${pageNum}:`, err);
      failedCount += 1;
      if (!firstError) firstError = err && err.message ? err.message : String(err);
      results.push({ page: pageNum, text: '' });
    }
  }
  onProgress(100, 'اكتمل OCR.');
  return { results, failedCount, firstError };
}

// ── Client-side text extraction with pdfjs-dist ────────────────────────
// Fallback when the server's pdf-parse only extracts text from page 1 and
// marks the rest as "empty" even though they have real text content. We use
// pdfjs-dist (already loaded for OCR) to extract text from those pages
// directly — much faster than OCR and works for any text-based PDF.
async function extractTextWithPdfjs(pdfSource, pageNumbers, onProgress) {
  if (!pageNumbers.length) return [];
  const pdfDoc = await openPdfDoc(pdfSource);

  const results = [];
  for (let i = 0; i < pageNumbers.length; i++) {
    const pageNum = pageNumbers[i];
    const overallProgress = Math.round((i / pageNumbers.length) * 100);
    if (onProgress) onProgress(overallProgress, `استخراج نص الصفحة ${pageNum} (${i + 1} من ${pageNumbers.length})…`);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      // Join all text items, preserving reading order (pdfjs returns items
      // in document order). Group by line using transform[5] (y position).
      let text = '';
      let lastY = null;
      for (const item of textContent.items) {
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
          text += '\n';
        }
        text += (item.str || '') + (item.hasEOL ? '\n' : ' ');
        lastY = y;
      }
      text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      results.push({ page: pageNum, text });
    } catch (err) {
      console.error(`Text extraction failed for page ${pageNum}:`, err);
      results.push({ page: pageNum, text: '' });
    }
  }
  if (onProgress) onProgress(100, 'اكتمل استخراج النص.');
  return results;
}

// ── PDF canvas viewer (zoom + fullscreen) ──────────────────────────────
// Replaces the old <iframe> viewer with a pdfjs-rendered <canvas> so we get
// consistent rendering on mobile (iOS Safari can't display PDFs in
// iframes), pinch-zoom via buttons, and a fullscreen overlay mode.
const PDF_MIN_ZOOM = 0.5;
const PDF_MAX_ZOOM = 4;
const pdfRenderState = {
  doc: null,
  currentPage: 1,
  shownPage: 0,
  zoom: 1, // 1 = fit to container width
  rendering: false,
  pendingPage: null,
  afterRender: null,
  lastWidth: 0
};

function hasRealText(text) {
  return String(text || '').replace(/\s/g, '').length >= 3;
}

function pdfScroller() {
  return nodes.pdfViewerWrap ? nodes.pdfViewerWrap.querySelector('.pdf-canvas-scroll') : null;
}

// Accepts either an already-open pdf.js document or a File/Blob.
async function openPdfDoc(source) {
  if (source && typeof source.getPage === 'function') return source;
  const lib = await loadPdfjs();
  const data = await source.arrayBuffer();
  return lib.getDocument({ data }).promise;
}

async function loadPdfForRendering(file) {
  if (!file) return null;
  if (pdfRenderState.doc) {
    try { await pdfRenderState.doc.destroy(); } catch {}
    pdfRenderState.doc = null;
  }
  pdfRenderState.zoom = 1;
  pdfRenderState.currentPage = 1;
  pdfRenderState.shownPage = 0;
  pdfRenderState.doc = await openPdfDoc(file);
  if (nodes.pdfTotalPages) nodes.pdfTotalPages.textContent = String(pdfRenderState.doc.numPages);
  return pdfRenderState.doc;
}

async function renderPdfPage(pageNum) {
  const doc = pdfRenderState.doc;
  const canvas = nodes.pdfCanvas;
  if (!doc || !canvas) return;
  pageNum = Math.max(1, Math.min(Number(pageNum) || 1, doc.numPages));

  // Serialize renders: a second request while one is running is queued.
  if (pdfRenderState.rendering) {
    pdfRenderState.pendingPage = pageNum;
    return;
  }
  pdfRenderState.rendering = true;
  pdfRenderState.currentPage = pageNum;

  try {
    const page = await doc.getPage(pageNum);
    const scroll = pdfScroller();
    const available = Math.max(200, (scroll ? scroll.clientWidth : 0) - 16);
    const base = page.getViewport({ scale: 1 });
    const cssScale = (available / base.width) * pdfRenderState.zoom;
    const cssW = base.width * cssScale;
    const cssH = base.height * cssScale;

    // Keep the backing canvas under ~16M pixels (mobile browsers refuse larger canvases).
    let ratio = Math.min(window.devicePixelRatio || 1, 2);
    while (ratio > 1 && cssW * ratio * cssH * ratio > 16e6) ratio -= 0.25;
    ratio = Math.max(1, ratio);

    const viewport = page.getViewport({ scale: cssScale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    pdfRenderState.lastWidth = scroll ? scroll.clientWidth : 0;
    if (scroll && pdfRenderState.shownPage !== pageNum) { scroll.scrollTop = 0; scroll.scrollLeft = 0; }
    pdfRenderState.shownPage = pageNum;
    if (nodes.pdfCurrentPage) nodes.pdfCurrentPage.textContent = String(pageNum);
    if (nodes.pdfZoomLevel) nodes.pdfZoomLevel.textContent = String(Math.round(pdfRenderState.zoom * 100));
  } catch (err) {
    console.error('Failed to render PDF page:', err);
  } finally {
    pdfRenderState.rendering = false;
    if (pdfRenderState.pendingPage !== null) {
      const next = pdfRenderState.pendingPage;
      pdfRenderState.pendingPage = null;
      renderPdfPage(next);
    } else if (pdfRenderState.afterRender) {
      const fn = pdfRenderState.afterRender;
      pdfRenderState.afterRender = null;
      fn();
    }
  }
}

// Zoom around a point (coordinates relative to the scroll container).
function setPdfZoom(newZoom, center) {
  const old = pdfRenderState.zoom;
  const next = Math.round(Math.max(PDF_MIN_ZOOM, Math.min(PDF_MAX_ZOOM, newZoom)) * 100) / 100;
  if (!pdfRenderState.doc || next === old) return;
  const scroll = pdfScroller();
  const c = center || (scroll ? { x: scroll.clientWidth / 2, y: scroll.clientHeight / 2 } : { x: 0, y: 0 });
  const anchorX = scroll ? scroll.scrollLeft + c.x : 0;
  const anchorY = scroll ? scroll.scrollTop + c.y : 0;
  const ratio = next / old;
  pdfRenderState.zoom = next;
  pdfRenderState.afterRender = () => {
    if (!scroll) return;
    scroll.scrollLeft = anchorX * ratio - c.x;
    scroll.scrollTop = anchorY * ratio - c.y;
  };
  renderPdfPage(pdfRenderState.currentPage);
}

function togglePdfFullscreen() {
  if (!nodes.pdfViewerWrap) return;
  const isFs = nodes.pdfViewerWrap.classList.toggle('pdf-fullscreen');
  document.body.classList.toggle('pdf-fullscreen-open', isFs);
  if (nodes.pdfFullscreen) {
    nodes.pdfFullscreen.textContent = isFs ? '✕' : '⛶';
    nodes.pdfFullscreen.setAttribute('aria-label', isFs ? 'إغلاق ملء الشاشة' : 'ملء الشاشة');
    nodes.pdfFullscreen.title = isFs ? 'إغلاق ملء الشاشة' : 'ملء الشاشة';
  }
  pdfRenderState.zoom = 1;
  // Re-fit to the new container size after the layout settles
  setTimeout(() => renderPdfPage(pdfRenderState.currentPage), 80);
}

// Pinch-to-zoom (touch), Ctrl+wheel zoom (desktop), re-fit on resize.
function initPdfGestures() {
  const scroll = pdfScroller();
  const canvas = nodes.pdfCanvas;
  if (!scroll || !canvas) return;
  const distance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let startDist = 0;
  let startZoom = 1;
  let factor = 1;
  let centerClient = null;

  scroll.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return;
    startDist = distance(event.touches);
    startZoom = pdfRenderState.zoom;
    factor = 1;
    centerClient = {
      x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
      y: (event.touches[0].clientY + event.touches[1].clientY) / 2
    };
    const rect = canvas.getBoundingClientRect();
    canvas.style.transformOrigin = `${centerClient.x - rect.left}px ${centerClient.y - rect.top}px`;
  }, { passive: true });

  scroll.addEventListener('touchmove', (event) => {
    if (!startDist || event.touches.length !== 2) return;
    event.preventDefault();
    const raw = distance(event.touches) / startDist;
    factor = Math.max(PDF_MIN_ZOOM / startZoom, Math.min(PDF_MAX_ZOOM / startZoom, raw));
    canvas.style.transform = `scale(${factor})`;
  }, { passive: false });

  const endPinch = (event) => {
    if (!startDist || event.touches.length >= 2) return;
    const finalFactor = factor;
    const rect = scroll.getBoundingClientRect();
    const center = { x: centerClient.x - rect.left, y: centerClient.y - rect.top };
    startDist = 0;
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    if (Math.abs(finalFactor - 1) > 0.02) setPdfZoom(startZoom * finalFactor, center);
  };
  scroll.addEventListener('touchend', endPinch, { passive: true });
  scroll.addEventListener('touchcancel', endPinch, { passive: true });

  scroll.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const rect = scroll.getBoundingClientRect();
    const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setPdfZoom(pdfRenderState.zoom * step, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!pdfRenderState.doc || !scroll.clientWidth) return;
      if (Math.abs(scroll.clientWidth - pdfRenderState.lastWidth) > 4) renderPdfPage(pdfRenderState.currentPage);
    }, 150);
  });
}

// ── State + DOM (unchanged from original app.js) ───────────────────────

const state = {
  audioFile: null, audioUrl: null, pdfFile: null, pdfUrl: null,
  pages: [], segments: [], events: [], history: [],
  geminiKey: '', geminiModels: [],
  busy: false,
  extra: { openrouter: { key: '', base: 'https://openrouter.ai/api/v1', models: [], model: '', connected: false } },
  sessionId: null, sessionCreatedAt: 0, totalPages: 0, emptyPages: [], audioDuration: 0, summary: '', textVersion: 0
};

const nodes = {
  audioInput: $('#audioInput'), pdfInput: $('#pdfInput'), audioDrop: $('#audioDrop'), pdfDrop: $('#pdfDrop'),
  audioTitle: $('#audioTitle'), audioHint: $('#audioHint'), audioMeta: $('#audioMeta'),
  pdfTitle: $('#pdfTitle'), pdfHint: $('#pdfHint'), pdfMeta: $('#pdfMeta'),
  audioPlayer: $('#audioPlayer'), analyzeBtn: $('#analyzeBtn'), progressWrap: $('#progressWrap'),
  progressBar: $('#progressBar'), progressLabel: $('#progressLabel'), resultsGrid: $('#resultsGrid'),
  timelineList: $('#timelineList'), timelineEmpty: $('#timelineEmpty'), summaryBox: $('#summaryBox'),
  transcriptList: $('#transcriptList'), transcriptCount: $('#transcriptCount'),
  pdfCanvas: $('#pdfCanvas'), pdfViewerWrap: $('#pdfViewerWrap'),
  pdfCurrentPage: $('#pdfCurrentPage'), pdfTotalPages: $('#pdfTotalPages'),
  pdfZoomLevel: $('#pdfZoomLevel'), pdfZoomIn: $('#pdfZoomIn'), pdfZoomOut: $('#pdfZoomOut'),
  pdfFullscreen: $('#pdfFullscreen'), pdfPrev: $('#pdfPrev'), pdfNext: $('#pdfNext'),
  pageSelect: $('#pageSelect'), pageText: $('#pageText'), pdfCount: $('#pdfCount'), pdfPanelTitle: $('#pdfPanelTitle'),
  pdfWarning: $('#pdfWarning'), chatPanel: $('#chatPanel'), chatMessages: $('#chatMessages'),
  chatForm: $('#chatForm'), questionInput: $('#questionInput'), sendButton: $('.send-button'),
  chatHint: $('#chatHint'), providerSelect: $('#providerSelect'), settingsDialog: $('#settingsDialog'),
  geminiKeyInput: $('#geminiKeyInput'), geminiStatus: $('#geminiStatus'), geminiModelSelect: $('#geminiModelSelect'),
  toast: $('#toast'),
  sessionsList: $('#sessionsList'), newLectureBtn: $('#newLectureBtn'), refreshSessionsBtn: $('#refreshSessionsBtn'),
  viewAllSessionsBtn: $('#viewAllSessionsBtn'), historyGrid: $('#historyGrid'), historyDialog: $('#historyDialog'), historyCloseBtn: $('#historyCloseBtn'),
  sidebarStatus: $('#sidebarStatus'),
  readyLine: $('#readyLine'), sessionChip: $('#sessionChip'),
  openrouterKeyInput: $('#openrouterKeyInput'), openrouterStatus: $('#openrouterStatus'),
  openrouterBaseUrlInput: $('#openrouterBaseUrlInput'), openrouterModelInput: $('#openrouterModelInput'),
  openrouterModelsList: $('#openrouterModelsList'), saveOpenrouterBtn: $('#saveOpenrouterBtn')
};

const OPENROUTER_CONFIG = {
  label: 'OpenRouter', short: 'OpenRouter', needsKey: true, base: 'https://openrouter.ai/api/v1',
  defaultModel: /qwen|kimi|glm/i
};

function extraState(id) { return state.extra[id] || (state.extra[id] = { key: '', base: OPENROUTER_CONFIG.base, models: [], model: '', connected: false }); }
function providerLabel(id) { return id === 'gemini' ? 'Gemini' : (id === 'openrouter' ? 'OpenRouter' : id); }

let toastTimer;
function toast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => nodes.toast.classList.remove('show'), 4200);
}
function setBusy(isBusy) {
  state.busy = isBusy;
  nodes.analyzeBtn.disabled = isBusy || !state.audioFile || !state.pdfFile;
  nodes.sendButton.disabled = isBusy || !state.pages.length;
  nodes.questionInput.disabled = isBusy || !state.pages.length;
  $('#reanalyzeBtn').disabled = isBusy || !state.pages.length || !state.segments.length;
}
// Progress uses a high-water mark so the bar never shrinks when a later phase
// reports a lower percentage (e.g. "transcribe done at 62" after pollJob hit 95,
// or compression ending at 41 before transcription continues from 42).
let progressHighMark = 0;
function setProgress(label, percentage) {
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  if (pct > progressHighMark) progressHighMark = pct;
  nodes.progressWrap.hidden = false;
  nodes.progressLabel.textContent = label;
  nodes.progressBar.style.width = `${progressHighMark}%`;
}
function finishProgress() {
  progressHighMark = 100;
  nodes.progressBar.style.width = '100%';
  setTimeout(() => { nodes.progressWrap.hidden = true; nodes.progressBar.style.width = '0'; progressHighMark = 0; }, 700);
}
function updateSteps() {
  nodes.analyzeBtn.disabled = state.busy || !state.audioFile || !state.pdfFile;
  if (nodes.sidebarStatus) {
    if (state.busy) nodes.sidebarStatus.textContent = 'بيشتغل…';
    else if (state.events.length) nodes.sidebarStatus.textContent = 'التحليل جاهز';
    else if (state.segments.length) nodes.sidebarStatus.textContent = 'التفريغ جاهز';
    else if (state.audioFile || state.pdfFile) nodes.sidebarStatus.textContent = 'جاهز للتحليل';
    else nodes.sidebarStatus.textContent = 'جاهز';
  }
  // Ready line: visible only when both files are picked AND PDF text is extracted.
  if (nodes.readyLine) {
    nodes.readyLine.hidden = !(state.audioFile && state.pdfFile && state.pages.length > 0);
  }
}
function bytesLabel(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت` : `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}
function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function parseTime(value) { return String(value).split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0); }
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function bindDropzone(zone, input, callback) {
  zone.addEventListener('click', (event) => { if (!event.target.closest('button')) input.click(); });
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('dragging'); const file = event.dataTransfer.files?.[0]; if (file) callback(file); });
}

// ── Mobile drawer (sidebar toggle) ─────────────────────────────────────
// Self-contained: no globals leaked. Uses matchMedia to know when we're in
// drawer mode (<=900px). When closed in that mode the sidebar gets
// `inert` + `aria-hidden` so it can't be tabbed to and can't widen the page.
const drawerToggle = $('#drawerToggle');
const sidebarOverlay = $('#sidebarOverlay');
const appSidebar = document.querySelector('.sidebar');
const drawerMobileQuery = window.matchMedia('(max-width: 900px)');

function openDrawer() {
  if (!appSidebar) return;
  appSidebar.classList.add('open');
  appSidebar.removeAttribute('inert');
  appSidebar.setAttribute('aria-hidden', 'false');
  if (sidebarOverlay) {
    sidebarOverlay.classList.add('show');
    sidebarOverlay.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('drawer-open');
  if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  if (!appSidebar) return;
  appSidebar.classList.remove('open');
  if (drawerMobileQuery.matches) {
    appSidebar.setAttribute('inert', '');
    appSidebar.setAttribute('aria-hidden', 'true');
  }
  if (sidebarOverlay) {
    sidebarOverlay.classList.remove('show');
    sidebarOverlay.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('drawer-open');
  if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'false');
}

function toggleDrawer() {
  if (appSidebar && appSidebar.classList.contains('open')) closeDrawer();
  else openDrawer();
}

function syncDrawerWithViewport() {
  if (!appSidebar) return;
  if (!drawerMobileQuery.matches) {
    // Desktop: sidebar is always visible & interactive
    appSidebar.classList.remove('open');
    appSidebar.removeAttribute('inert');
    appSidebar.setAttribute('aria-hidden', 'false');
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove('show');
      sidebarOverlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('drawer-open');
    if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'false');
  } else {
    // Mobile: default to closed
    closeDrawer();
  }
}

if (drawerToggle) drawerToggle.addEventListener('click', toggleDrawer);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && appSidebar && appSidebar.classList.contains('open')) closeDrawer();
});
if (drawerMobileQuery.addEventListener) {
  drawerMobileQuery.addEventListener('change', syncDrawerWithViewport);
} else if (drawerMobileQuery.addListener) {
  // Safari < 14 fallback
  drawerMobileQuery.addListener(syncDrawerWithViewport);
}

// ── Saved sessions (IndexedDB — unchanged from original) ───────────────
// NOTE: the DB name 'madar-sessions' and localStorage key 'madar.lastSession'
// are internal identifiers — intentionally NOT renamed to Vortex-Madar so
// existing users keep their saved lectures.
const DB_NAME = 'madar-sessions';
const LAST_SESSION_KEY = 'madar.lastSession';
let dbPromise = null;
let saveTimer = null;
let storageWarned = false;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}
function idb(storeName, mode, makeRequest) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = makeRequest(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('تعذر الحفظ.'));
  }));
}
function warnStorage(error) {
  console.warn('Session storage error:', error);
  if (storageWarned) return;
  storageWarned = true;
  toast('تعذر حفظ الجلسة على هذا المتصفح. التطبيق سيكمل بدون حفظ.');
}
function ensureSession() {
  if (state.sessionId) return;
  state.sessionId = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  state.sessionCreatedAt = Date.now();
  try { localStorage.setItem(LAST_SESSION_KEY, state.sessionId); } catch {}
  navigator.storage?.persist?.().catch?.(() => {});
}
function sessionTitle() {
  if (state.pdfFile) return state.pdfFile.name.replace(/\.pdf$/i, '');
  if (state.audioFile) return state.audioFile.name;
  return 'محاضرة بدون عنوان';
}
async function saveFile(kind, file) {
  if (!state.sessionId || !file) return;
  try { await idb('files', 'readwrite', (store) => store.put({ blob: file, name: file.name, type: file.type, size: file.size }, `${state.sessionId}:${kind}`)); }
  catch (error) { warnStorage(error); }
}
async function saveSessionNow() {
  if (!state.sessionId) return;
  const record = {
    id: state.sessionId, title: sessionTitle(), createdAt: state.sessionCreatedAt, updatedAt: Date.now(),
    audio: state.audioFile ? { name: state.audioFile.name, size: state.audioFile.size } : null,
    pdf: state.pdfFile ? { name: state.pdfFile.name, size: state.pdfFile.size } : null,
    pages: state.pages, totalPages: state.totalPages, emptyPages: state.emptyPages,
    segments: state.segments, language: state.transcriptLanguage || '', duration: state.audioDuration,
    events: state.events, summary: state.summary, history: state.history, textVersion: state.textVersion || 0,
    provider: state.provider,
    geminiKey: state.geminiKey, geminiModels: state.geminiModels,
    extra: state.extra
  };
  try { await idb('sessions', 'readwrite', (store) => store.put(record)); }
  catch (error) { warnStorage(error); }
  await renderSidebarSessions();
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionNow, 500);
}
function reloadApp() { location.reload(); }
function confirmReplace(kind) {
  const hasWork = state.segments.length || state.events.length || state.history.length;
  const hasFile = kind === 'audio' ? state.audioFile : state.pdfFile;
  if (!hasFile || !hasWork) return true;
  return confirm('عندك محاضرة محفوظة بتحليلها. لو استبدلت الملف هتتحدّث الجلسة. لو عايز تحتفظ بالقديمة اختار «محاضرة جديدة» الأول. تكمّل؟');
}

async function restoreSession(id) {
  const record = await idb('sessions', 'readonly', (store) => store.get(id));
  if (!record) return false;
  const [audio, pdf] = await Promise.all([
    idb('files', 'readonly', (store) => store.get(`${id}:audio`)),
    idb('files', 'readonly', (store) => store.get(`${id}:pdf`))
  ]);
  state.sessionId = id;
  state.sessionCreatedAt = record.createdAt || Date.now();
  state.textVersion = record.textVersion || 0;
  let missingFile = false;

  state.pages = record.pages || [];
  state.totalPages = record.totalPages || state.pages.length;
  state.emptyPages = record.emptyPages || [];
  if (record.pdf) {
    if (pdf) state.pdfFile = new File([pdf.blob], pdf.name, { type: pdf.type });
    else { missingFile = true; state.pdfFile = new File([], record.pdf.name, { type: 'application/pdf' }); }
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = URL.createObjectURL(state.pdfFile);
    nodes.pdfTitle.textContent = record.pdf.name;
    nodes.pdfMeta.hidden = false;
    nodes.pdfMeta.textContent = bytesLabel(record.pdf.size || 0);
    nodes.pdfPanelTitle.textContent = record.pdf.name;
    if (pdf) {
      loadPdfForRendering(state.pdfFile).then(() => renderPdfPage(1)).catch((err) => console.error('PDF render load failed:', err));
    }
    renderPdfResult({ pages: state.pages, totalPages: state.totalPages, emptyPages: state.emptyPages });
  }

  state.segments = record.segments || [];
  state.transcriptLanguage = record.language || '';
  state.audioDuration = record.duration || 0;
  if (record.audio) {
    if (audio) state.audioFile = new File([audio.blob], audio.name, { type: audio.type });
    else { missingFile = true; state.audioFile = new File([], record.audio.name, { type: 'audio/mpeg' }); }
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(state.audioFile);
    if (audio) { nodes.audioPlayer.src = state.audioUrl; nodes.audioPlayer.hidden = false; }
    nodes.audioTitle.textContent = record.audio.name;
    nodes.audioMeta.hidden = false;
    nodes.audioMeta.textContent = bytesLabel(record.audio.size || 0);
    nodes.audioHint.textContent = state.segments.length ? `تم التفريغ · ${formatTime(state.audioDuration)}` : 'جاهز للتفريغ';
    if (state.segments.length) { renderTranscript(); nodes.transcriptCount.textContent = `${state.segments.length} مقطع`; }
  }

  if ((record.events || []).length || record.summary) {
    renderTimeline({ events: record.events || [], summary: record.summary || '' });
  }
  state.history = record.history || [];
  for (const item of state.history) addMessage(item.role === 'user' ? 'user' : 'assistant', item.content, '', item.provider || state.provider);

  state.provider = record.provider || state.provider || 'gemini';
  nodes.providerSelect.value = state.provider;
  state.geminiKey = record.geminiKey || '';
  state.geminiModels = record.geminiModels || [];
  if (state.geminiKey && state.geminiModels.length) {
    nodes.geminiKeyInput.value = state.geminiKey;
    setModelOptions(nodes.geminiModelSelect, state.geminiModels, /flash/i);
    nodes.geminiStatus.textContent = 'متصل';
    nodes.geminiStatus.classList.add('connected');
  }
  if (record.extra) {
    for (const [pid, info] of Object.entries(record.extra)) {
      const local = extraState(pid);
      local.key = info.key || '';
      local.base = info.base || OPENROUTER_CONFIG.base;
      local.models = info.models || [];
      local.model = info.model || '';
      local.connected = info.connected || false;
    }
  }
  syncOpenrouterUiFromState();

  nodes.resultsGrid.hidden = !state.pdfFile;
  updateSteps();
  updateChatAvailability();
  toast(missingFile ? 'اتسترجعت المحاضرة، بس ملف الصوت أو الـPDF مش محفوظ كامل.' : 'اتسترجعت محاضرتك المحفوظة.');

  // Re-extract missing pages in the background — fixes sessions that were
  // saved BEFORE the pdfjs text-extraction fix was deployed (those sessions
  // only have page 1's text in state.pages). This runs asynchronously so it
  // doesn't block the UI; when done, state.pages is updated and the session
  // is re-saved with the full text.
  if (pdf && state.pdfFile && state.pdfFile.size > 0 && state.textVersion !== 2 && state.totalPages > 0) {
    // Old sessions came from a server bug that put the whole document in page 1,
    // so re-read every page once with pdf.js.
    const missingPages = Array.from({ length: state.totalPages }, (_, i) => i + 1);
    if (missingPages.length > 0) {
      toast(`جارٍ إعادة قراءة نص ${missingPages.length} صفحة في الخلفية…`);
      extractTextWithPdfjs(state.pdfFile, missingPages, () => {}).then((textResults) => {
        const byPage = new Map(state.pages.map((p) => [Number(p.page), p]));
        for (const { page, text } of textResults) {
          if (hasRealText(text)) byPage.set(page, { page, text });
        }
        state.pages = [...byPage.values()].sort((a, b) => a.page - b.page);
        state.textVersion = 2;
        // Recalculate empty pages
        const newFound = new Set(state.pages.map((p) => Number(p.page)));
        state.emptyPages = [];
        for (let i = 1; i <= state.totalPages; i++) {
          if (!newFound.has(i)) state.emptyPages.push(i);
        }
        // Update the warning display
        if (nodes.pdfWarning) {
          if (state.emptyPages.length) {
            nodes.pdfWarning.hidden = false;
            nodes.pdfWarning.textContent = `بعض الصفحات بلا نص (${state.emptyPages.slice(0, 8).join('، ')}${state.emptyPages.length > 8 ? '…' : ''}).`;
          } else {
            nodes.pdfWarning.hidden = true;
          }
        }
        // Update the current page text if we're viewing a page that just got extracted
        const currentPage = Number(nodes.pageSelect.value) || 1;
        showPageText(currentPage);
        scheduleSave();
        toast(`اكتمل استخراج النص: ${state.pages.length} من ${state.totalPages} صفحة.`);
      }).catch((err) => {
        console.error('Background re-extraction failed:', err);
        toast('تعذر استخراج بعض الصفحات. حاول ترفع الملف تاني.');
      });
    }
  }
  return true;
}
async function restoreLastSession() {
  let id = null;
  try { id = localStorage.getItem(LAST_SESSION_KEY); } catch {}
  if (!id) return;
  try { if (!(await restoreSession(id))) localStorage.removeItem(LAST_SESSION_KEY); }
  catch (error) { console.warn('Could not restore session:', error); }
}
async function deleteSession(id) {
  await idb('sessions', 'readwrite', (store) => store.delete(id));
  await idb('files', 'readwrite', (store) => store.delete(`${id}:audio`));
  await idb('files', 'readwrite', (store) => store.delete(`${id}:pdf`));
}

const SIDEBAR_MAX_SESSIONS = 5;

async function renderSidebarSessions() {
  let sessions = [];
  try { sessions = await idb('sessions', 'readonly', (store) => store.getAll()); } catch (error) { warnStorage(error); }
  sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (nodes.viewAllSessionsBtn) {
    nodes.viewAllSessionsBtn.hidden = sessions.length <= SIDEBAR_MAX_SESSIONS;
  }
  const visible = sessions.slice(0, SIDEBAR_MAX_SESSIONS);
  const fragment = document.createDocumentFragment();
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'sessions-empty'; empty.textContent = 'مفيش محاضرات محفوظة لسه.'; fragment.append(empty);
  } else {
    for (const session of visible) {
      fragment.append(buildSessionItem(session));
    }
  }
  nodes.sessionsList.replaceChildren(fragment);
}

function buildSessionItem(session) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'session-item';
  if (session.id === state.sessionId) row.classList.add('active');
  row.dataset.sessionId = session.id;
  const title = document.createElement('span');
  title.className = 'session-item-title';
  title.textContent = session.title || 'محاضرة بدون عنوان';
  const meta = document.createElement('span');
  meta.className = 'session-item-meta';
  const when = new Date(session.updatedAt || session.createdAt || Date.now());
  const today = new Date();
  const isToday = when.toDateString() === today.toDateString();
  const timeStr = isToday ? when.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : when.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  const parts = [timeStr];
  const questions = (session.history || []).filter((item) => item.role === 'user').length;
  if (questions) parts.push(`${questions} سؤال`);
  meta.textContent = parts.join(' · ');
  row.append(title, meta);
  const del = document.createElement('span');
  del.className = 'session-item-delete';
  del.textContent = '×';
  del.title = 'حذف';
  del.dataset.action = 'delete';
  row.append(del);
  return row;
}

async function renderHistoryPage() {
  let sessions = [];
  try { sessions = await idb('sessions', 'readonly', (store) => store.getAll()); } catch (error) { warnStorage(error); }
  sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const fragment = document.createDocumentFragment();
  if (!sessions.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'text-align:center;color:var(--muted);padding:40px 0';
    empty.textContent = 'مفيش محاضرات محفوظة لسه.';
    fragment.append(empty);
  } else {
    for (const session of sessions) {
      const card = document.createElement('div');
      card.className = 'history-card';
      card.dataset.sessionId = session.id;
      if (session.id === state.sessionId) card.classList.add('active');
      const title = document.createElement('div');
      title.className = 'history-card-title';
      title.textContent = session.title || 'محاضرة بدون عنوان';
      const meta = document.createElement('div');
      meta.className = 'history-card-meta';
      const when = new Date(session.updatedAt || session.createdAt || Date.now());
      meta.textContent = when.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
      const stats = document.createElement('div');
      stats.className = 'history-card-stats';
      const segments = (session.segments || []).length;
      const events = (session.events || []).length;
      const questions = (session.history || []).filter((item) => item.role === 'user').length;
      if (segments) stats.append(buildStat('📝', `${segments} مقطع`));
      if (events) stats.append(buildStat('🔗', `${events} ربط`));
      if (questions) stats.append(buildStat('❓', `${questions} سؤال`));
      card.append(title, meta, stats);
      fragment.append(card);
    }
  }
  nodes.historyGrid.replaceChildren(fragment);
}

function buildStat(icon, text) {
  const stat = document.createElement('div');
  stat.className = 'history-card-stat';
  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  const textEl = document.createElement('span');
  textEl.textContent = text;
  stat.append(iconEl, textEl);
  return stat;
}

function startNewLecture() {
  closeDrawer();
  try { localStorage.removeItem(LAST_SESSION_KEY); } catch {}
  reloadApp();
}

function renderPdfResult(result) {
  state.pages = result.pages || [];
  const count = Number(result.totalPages) || state.pages.length;
  state.totalPages = count;
  state.emptyPages = result.emptyPages || [];
  nodes.pdfHint.textContent = count ? `${count} صفحة — تم استخراج النص` : 'لم يتم العثور على صفحات';
  nodes.pdfCount.textContent = `${count} صفحة`;
  if (nodes.pdfTotalPages) nodes.pdfTotalPages.textContent = String(count);
  nodes.pageSelect.replaceChildren(...Array.from({ length: count }, (_, index) => {
    const option = document.createElement('option'); option.value = String(index + 1); option.textContent = `صفحة ${index + 1}`; return option;
  }));
  if (state.pages.length) showPageText(1);
  else {
    nodes.pageText.textContent = 'لم يُعثر على نص في هذا الملف.';
    renderPdfPage(1);
  }
  nodes.pdfWarning.hidden = true;
  if (state.emptyPages.length) {
    nodes.pdfWarning.hidden = false;
    nodes.pdfWarning.textContent = `بعض الصفحات بلا نص (${state.emptyPages.slice(0, 8).join('، ')}${state.emptyPages.length > 8 ? '…' : ''}).`;
  }
  nodes.resultsGrid.hidden = false;
  updateSteps();
  updateChatAvailability();
}

// ── PDF load: everything runs in the browser ───────────────────────────
// 1. Open the PDF with pdf.js (also used by the canvas viewer).
// 2. Read the text of every page with pdf.js.
// 3. If most pages have no text (scanned PDF), run Tesseract OCR on them.
async function loadPdf(file) {
  if (!file || file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return toast('اختار ملف PDF صالح.');
  if (file.size > 100 * 1024 * 1024) return toast('حجم ملف PDF أكبر من 100 ميجابايت.');
  // Free Supabase storage caps objects at 50 MB. Reject oversized PDFs BEFORE
  // touching any state so the currently loaded file and UI stay intact.
  // (Local-dev without Supabase still accepts files up to 100 MB raw.)
  if (file.size > STORAGE_LIMIT_BYTES && await isStorageConfigured()) {
    return toast('حجم الـPDF أكبر من 50 ميجابايت (حد التخزين المجاني). اضغطه أولاً ثم أعد الرفع.');
  }
  if (!confirmReplace('pdf')) return;
  state.pdfFile = file;
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.pdfUrl = URL.createObjectURL(file);
  nodes.pdfTitle.textContent = file.name;
  nodes.pdfHint.textContent = 'جارٍ استخراج نص الصفحات…';
  nodes.pdfMeta.hidden = false;
  nodes.pdfMeta.textContent = bytesLabel(file.size);
  nodes.pdfPanelTitle.textContent = file.name;
  state.pages = [];
  state.events = [];
  state.summary = '';
  nodes.pdfWarning.hidden = true;
  nodes.summaryBox.hidden = true;
  nodes.timelineList.replaceChildren();
  updateSteps(); // hide readyLine immediately while the new PDF is being processed
  try {
    const doc = await loadPdfForRendering(file);
    const totalPages = doc.numPages;
    const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);

    const textResults = await extractTextWithPdfjs(doc, allPages, (progress, label) => {
      setProgress(label, progress);
      nodes.pdfHint.textContent = label;
    });
    const mergedPages = [];
    let emptyPages = [];
    for (const { page, text } of textResults) {
      if (hasRealText(text)) mergedPages.push({ page, text });
      else emptyPages.push(page);
    }

    // ANY page without a text layer gets OCR'd in the browser. The previous
    // ">= 50% empty" rule skipped mixed documents entirely — e.g. a digital
    // cover page + scanned content, or CamScanner files that embed an OCR
    // text layer on only SOME pages — leaving those pages permanently empty
    // with no OCR attempt at all.
    if (emptyPages.length) {
      nodes.pdfHint.textContent = `${emptyPages.length} صفحة من غير نص — جارٍ OCR عليها…`;
      toast(`${emptyPages.length} صفحة من غير نص قابل للنسخ. هشغّل OCR في المتصفح عليها — أول مرة بيسحب ملفات اللغة (~٢٢ ميجا) وبعدين كل صفحة بتاخد شوية. ما هينقطعش.`);
      let ocrOutcome = null;
      try {
        ocrOutcome = await ocrEmptyPages(doc, emptyPages, (progress, label) => {
          setProgress(label, progress);
          nodes.pdfHint.textContent = label;
        });
      } catch (engineErr) {
        // Engine-level failure (CDN / language data): keep the pages we
        // already extracted, but tell the user clearly instead of silently
        // leaving pages empty.
        console.error('OCR could not run:', engineErr);
        toast(engineErr.message || 'تعذر تشغيل OCR على هذا المتصفح.');
      }
      if (ocrOutcome) {
        const stillEmpty = [];
        for (const { page, text } of ocrOutcome.results) {
          if (hasRealText(text)) mergedPages.push({ page, text });
          else stillEmpty.push(page);
        }
        emptyPages = stillEmpty;
        if (ocrOutcome.failedCount > 0) {
          toast(`OCR فشل على ${ocrOutcome.failedCount} صفحة${ocrOutcome.firstError ? ` — السبب: ${ocrOutcome.firstError}` : ''}.`);
        }
      }
    }

    mergedPages.sort((a, b) => a.page - b.page);
    state.textVersion = 2;
    renderPdfResult({ pages: mergedPages, totalPages, emptyPages });
    finishProgress();

    if (emptyPages.length > 0) {
      toast(`استخراج النص اكتمل: ${mergedPages.length} صفحة فيها نص. ${emptyPages.length} صفحة بدون نص (ممكن تكون فاضية أو صور).`);
    } else {
      toast(`اتحمّل PDF: ${totalPages} صفحة، اتعمل استخراج لكل الصفحات.`);
    }

    ensureSession();
    saveFile('pdf', file);
    scheduleSave();
  } catch (error) {
    console.error('PDF load failed:', error);
    state.pdfFile = null;
    nodes.progressWrap.hidden = true;
    nodes.pdfHint.textContent = 'تعذر قراءة الملف';
    toast(error?.message ? `تعذر قراءة ملف PDF: ${error.message}` : 'تعذر قراءة ملف PDF.');
    updateSteps();
  }
}

function showPageText(pageNumber) {
  const page = state.pages.find((item) => Number(item.page) === Number(pageNumber));
  nodes.pageText.textContent = page?.text || 'لا يوجد نص قابل للاستخراج في هذه الصفحة.';
  renderPdfPage(Number(pageNumber));
}
function selectPage(pageNumber) {
  const count = Number(nodes.pageSelect.options.length);
  const page = Math.min(Math.max(1, Number(pageNumber) || 1), Math.max(1, count));
  nodes.pageSelect.value = String(page);
  showPageText(page);
}

function loadAudio(file) {
  if (!file || !file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|webm|flac|mp4|aac|wma)$/i.test(file.name)) return toast('اختار ملفاً صوتياً مدعوماً.');
  if (file.size > MAX_AUDIO_INPUT_BYTES) return toast(`حجم الملف أكبر من ${Math.round(MAX_AUDIO_INPUT_BYTES/1024/1024)} ميجابايت — اضغطه أو قسّمه لملفين.`);
  if (!confirmReplace('audio')) return;
  state.audioFile = file;
  state.segments = [];
  state.events = [];
  state.history = [];
  state.summary = '';
  state.audioDuration = 0;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(file);
  nodes.audioPlayer.src = state.audioUrl;
  nodes.audioPlayer.hidden = false;
  nodes.audioTitle.textContent = file.name;
  nodes.audioHint.textContent = 'جاهز للتفريغ';
  nodes.audioMeta.hidden = false;
  nodes.audioMeta.textContent = bytesLabel(file.size);
  nodes.transcriptList.replaceChildren();
  nodes.transcriptCount.textContent = '—';
  nodes.timelineList.replaceChildren();
  nodes.chatMessages.replaceChildren();
  nodes.summaryBox.hidden = true;
  nodes.resultsGrid.hidden = Boolean(!state.pdfFile);
  ensureSession();
  saveFile('audio', file);
  scheduleSave();
  updateSteps();
  updateChatAvailability();
}

async function transcribeAudio() {
  if (!state.audioFile) throw new Error('ارفع ملف الصوت أولاً.');
  // Compress large audio before uploading to Supabase (free plan: 50 MB/object).
  // state.audioFile (IndexedDB + player) is untouched — only the upload copy
  // is compressed. Local-dev (no Supabase) skips compression and sends raw.
  const { file: uploadFile, compressed } = await prepareAudioForUpload(state.audioFile);
  // Baseline: continue from ~42 if we just compressed, otherwise start at 12.
  // pollJob's 0..100 is mapped into [base, 95] so the bar never goes backwards.
  const base = compressed ? 42 : 12;
  setProgress(compressed ? 'اكتمل الضغط، جارٍ الرفع والتفريغ…' : 'جارٍ تفريغ الصوت…', base);
  const supabaseUrl = await uploadToSupabase(uploadFile);
  const startResponse = supabaseUrl
    ? await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: supabaseUrl, filename: uploadFile.name }) })
    : await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': uploadFile.type || 'application/octet-stream', 'x-file-name': uploadFile.name }, body: uploadFile });
  const start = await startResponse.json();
  if (!startResponse.ok) throw new Error(start.error || 'تعذر بدء التفريغ.');
  const result = await pollJob(start.jobId, (progress, label) => {
    const mapped = base + Math.round((Math.max(0, Math.min(100, progress)) / 100) * (95 - base));
    setProgress(label || 'جارٍ التفريغ…', mapped);
  });
  if (result.error) throw new Error(result.error);
  state.segments = result.segments || [];
  if (!state.segments.length) throw new Error('لم يعثر Whisper على كلام واضح في التسجيل.');
  state.transcriptLanguage = result.language || 'unknown';
  state.audioDuration = result.duration || 0;
  renderTranscript();
  nodes.audioHint.textContent = `تم التفريغ · ${formatTime(result.duration || 0)}`;
  nodes.transcriptCount.textContent = `${state.segments.length} مقطع`;
  updateSteps();
  updateChatAvailability();
  setProgress('اكتمل تفريغ الصوت.', 62);
  scheduleSave();
}

async function pollJob(jobId, onProgress) {
  const interval = 2000;
  const maxAttempts = 600;
  for (let i = 0; i < maxAttempts; i += 1) {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'تعذر متابعة المهمة.');
    }
    const job = await response.json();
    if (onProgress) onProgress(job.progress || 0, job.label);
    if (job.status === 'done') return job.result || job;
    if (job.status === 'failed') throw new Error(job.error || 'فشلت المهمة.');
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('انتهت مهلة المهمة (أكثر من 20 دقيقة).');
}

function renderTranscript() {
  const fragment = document.createDocumentFragment();
  for (const segment of state.segments) {
    const row = document.createElement('div'); row.className = 'transcript-row';
    const time = document.createElement('button'); time.type = 'button'; time.className = 'transcript-time'; time.textContent = formatTime(segment.start); time.dataset.seek = String(segment.start);
    const text = document.createElement('div'); text.className = 'transcript-text'; text.textContent = segment.text;
    row.append(time, text); fragment.append(row);
  }
  nodes.transcriptList.replaceChildren(fragment);
}

const kindLabels = { concept: 'معلومة', question: 'سؤال', extra_explanation: 'شرح إضافي', example: 'مثال', transition: 'انتقال', uncertain: 'غير مؤكد' };
function renderTimeline(analysis) {
  state.events = Array.isArray(analysis.events) ? analysis.events : [];
  state.summary = analysis.summary || '';
  nodes.summaryBox.hidden = !analysis.summary;
  nodes.summaryBox.textContent = analysis.summary || '';
  const fragment = document.createDocumentFragment();
  state.events.sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
  for (const event of state.events) {
    const card = document.createElement('article'); card.className = 'event-card';
    const time = document.createElement('button'); time.type = 'button'; time.className = 'event-time'; time.dataset.seek = String(event.start || 0); time.textContent = formatTime(event.start || 0);
    const content = document.createElement('div');
    const row = document.createElement('div'); row.className = 'event-title-row';
    const title = document.createElement('span'); title.className = 'event-title'; title.textContent = event.title || 'نقطة من المحاضرة';
    const kind = document.createElement('span'); kind.className = `event-kind ${event.kind || ''}`; kind.textContent = kindLabels[event.kind] || 'محتوى';
    row.append(title, kind);
    if (Number(event.confidence) < 0.55) { const confidence = document.createElement('span'); confidence.className = 'confidence-low'; confidence.textContent = 'ربط غير مؤكد'; row.append(confidence); }
    const detail = document.createElement('p'); detail.className = 'event-detail'; detail.textContent = event.detail || '';
    content.append(row, detail);
    if (event.evidence) { const evidence = document.createElement('p'); evidence.className = 'event-evidence'; evidence.textContent = `«${event.evidence}»`; content.append(evidence); }
    if (Number.isInteger(Number(event.page)) && Number(event.page) > 0) {
      const pageButton = document.createElement('button'); pageButton.type = 'button'; pageButton.className = 'citation'; pageButton.dataset.page = String(event.page); pageButton.textContent = `صفحة ${event.page}`; content.append(pageButton);
    }
    card.append(time, content); fragment.append(card);
  }
  nodes.timelineList.replaceChildren(fragment);
  nodes.timelineEmpty.hidden = state.events.length > 0;
  updateSteps();
}

function setModelOptions(select, models, defaultPredicate) {
  select.replaceChildren(...models.map((model) => {
    const option = document.createElement('option'); option.value = model.id; option.textContent = model.name || model.id; return option;
  }));
  select.hidden = models.length === 0;
  if (models.length) select.value = (models.find((model) => defaultPredicate.test(model.id)) || models[0]).id;
}

async function connectGeminiKey() {
  const key = nodes.geminiKeyInput.value.trim();
  if (!key) throw new Error('أدخل مفتاح Gemini API من Google AI Studio.');
  nodes.geminiStatus.textContent = 'جارٍ التحقق…';
  const response = await fetch('/api/gemini/models', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gemini-key': key }, body: '{}' });
  const result = await response.json();
  if (!response.ok) { nodes.geminiStatus.textContent = 'تعذر الاتصال'; throw new Error(result.error || 'تعذر التحقق من مفتاح Gemini.'); }
  state.geminiKey = key;
  state.geminiModels = result.models || [];
  if (!state.geminiModels.length) throw new Error('المفتاح صالح، لكن لم يظهر نموذج متاح.');
  nodes.geminiStatus.textContent = 'متصل';
  nodes.geminiStatus.classList.add('connected');
  setModelOptions(nodes.geminiModelSelect, state.geminiModels, /flash/i);
  updateChatAvailability();
  scheduleSave();
  toast('تم تفعيل Gemini.');
}

async function connectOpenrouter() {
  const info = extraState('openrouter');
  info.key = (nodes.openrouterKeyInput.value || '').trim();
  info.base = (nodes.openrouterBaseUrlInput.value || '').trim() || OPENROUTER_CONFIG.base;
  if (!info.key) throw new Error('أدخل مفتاح OpenRouter.');
  nodes.openrouterStatus.textContent = 'جارٍ التحقق…';
  const response = await fetch('/api/provider/models', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-provider-key': info.key },
    body: JSON.stringify({ provider: 'openrouter', baseUrl: info.base })
  });
  const result = await response.json();
  if (!response.ok) { nodes.openrouterStatus.textContent = 'تعذر الاتصال'; throw new Error(result.error || 'تعذر الاتصال بـ OpenRouter.'); }
  info.models = result.models || [];
  nodes.openrouterModelsList.replaceChildren(...info.models.map((m) => {
    const o = document.createElement('option'); o.value = m.id; o.label = m.name || m.id; return o;
  }));
  if (!info.model || !info.models.some((m) => m.id === info.model)) {
    info.model = (info.models.find((m) => OPENROUTER_CONFIG.defaultModel.test(m.id)) || info.models[0])?.id || '';
  }
  nodes.openrouterModelInput.value = info.model;
  info.connected = true;
  nodes.openrouterStatus.textContent = 'متصل';
  nodes.openrouterStatus.classList.add('connected');
  updateChatAvailability();
  scheduleSave();
  toast('تم تفعيل OpenRouter.');
}

function syncOpenrouterUiFromState() {
  const info = extraState('openrouter');
  if (info.key) nodes.openrouterKeyInput.value = info.key;
  if (info.base) nodes.openrouterBaseUrlInput.value = info.base;
  if (info.model) nodes.openrouterModelInput.value = info.model;
  if (info.models.length) {
    nodes.openrouterModelsList.replaceChildren(...info.models.map((m) => {
      const o = document.createElement('option'); o.value = m.id; o.label = m.name || m.id; return o;
    }));
  }
  if (info.connected) {
    nodes.openrouterStatus.textContent = 'متصل';
    nodes.openrouterStatus.classList.add('connected');
  }
}

function updateChatAvailability() {
  const filesReady = Boolean(state.pages.length && state.audioFile);
  let modelReady = false;
  if (state.provider === 'gemini') {
    modelReady = Boolean(state.geminiKey && state.geminiModels.length);
  } else if (state.provider === 'openrouter') {
    const info = extraState('openrouter');
    modelReady = Boolean(info.connected && info.model.trim());
  }
  nodes.questionInput.disabled = !filesReady || state.busy;
  nodes.sendButton.disabled = !filesReady || state.busy;
  nodes.chatHint.textContent = !filesReady ? 'ارفع ملف الصوت وPDF أولاً.' : !modelReady ? 'فعّل الموديل من «إعدادات الموديلات».' : 'السياق المرسل يتضمن نص المحاضرة وصفحات الـPDF.';
  nodes.questionInput.placeholder = filesReady ? 'اسأل عن فكرة أو سؤال قاله الدكتور…' : 'ارفع الملفات أولاً لبدء السؤال';
}

async function getModelSelection() {
  if (state.provider === 'gemini') {
    if (!state.geminiKey) { nodes.settingsDialog.showModal(); throw new Error('فعّل Gemini من إعدادات الموديلات أولاً.'); }
    return { model: nodes.geminiModelSelect.value, headers: { 'x-gemini-key': state.geminiKey }, body: {} };
  }
  if (state.provider === 'openrouter') {
    const info = extraState('openrouter');
    if (!info.connected || !info.model.trim()) { nodes.settingsDialog.showModal(); throw new Error('فعّل OpenRouter من إعدادات الموديلات أولاً.'); }
    return { model: info.model.trim(), headers: { 'x-provider-key': info.key }, body: { baseUrl: info.base } };
  }
  throw new Error('اختر مزوّداً.');
}

function addMessage(role, text, extraClass = '', provider = state.provider) {
  const wrapper = document.createElement('div'); wrapper.className = `message ${role} ${extraClass}`;
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = role === 'user' ? 'أنت' : providerLabel(provider);
  const body = document.createElement('div');
  let html = escapeHtml(text).replace(/\[صفحة\s*(\d+)\]/g, '<button type="button" class="citation" data-page="$1">صفحة $1</button>');
  html = html.replace(/\[وقت\s*([\d:]+)\]/g, '<button type="button" class="citation" data-seek="$1">$1</button>');
  body.innerHTML = html.replace(/\n/g, '<br>');
  wrapper.append(meta, body); nodes.chatMessages.append(wrapper); nodes.chatMessages.scrollTop = nodes.chatMessages.scrollHeight;
  return wrapper;
}

async function sendQuestion(question) {
  if (!state.pages.length) return toast('ارفع ملف PDF أولاً.');
  if (DEMO_MODE) {
    state.history.push({ role: 'user', content: question });
    addMessage('user', question);
    const response = 'الفكرة الأساسية في المثال هي تحويل المشكلة الكبيرة إلى خطوات أصغر يمكن اختبارها. راجع الشريحة [صفحة 1] عند الدقيقة [وقت 00:24] لمتابعة الشرح.';
    addMessage('assistant', response);
    state.history.push({ role: 'assistant', content: response, provider: 'demo' });
    return;
  }
  if (!state.segments.length) await transcribeAudio();
  const selection = await getModelSelection();
  state.history.push({ role: 'user', content: question });
  addMessage('user', question);
  setBusy(true);
  const placeholder = addMessage('assistant', 'بفكر في مصادر المحاضرة…');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...selection.headers },
      body: JSON.stringify({ provider: state.provider, model: selection.model, question, pages: state.pages, segments: state.segments, history: state.history.slice(-9, -1), ...selection.body })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر الحصول على إجابة.');
    placeholder.remove();
    addMessage('assistant', result.answer);
    state.history.push({ role: 'assistant', content: result.answer, provider: state.provider });
    scheduleSave();
  } catch (error) {
    placeholder.remove();
    addMessage('assistant', error.message, 'error');
    scheduleSave();
  } finally { setBusy(false); updateChatAvailability(); }
}

async function analyzeLecture() {
  if (DEMO_MODE) return toast('التحليل التجريبي جاهز بالفعل. جرّب التصفح والأسئلة في اللوحة.');
  if (!state.audioFile || !state.pdfFile) return;
  setBusy(true);
  try {
    if (!state.segments.length) await transcribeAudio();
    if (!state.pages.length) throw new Error('لم يتم العثور على نص في PDF.');
    const selection = await getModelSelection();
    setProgress('جارٍ ربط كلام المحاضرة بصفحات PDF…', 72);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...selection.headers },
      body: JSON.stringify({ provider: state.provider, model: selection.model, pages: state.pages, segments: state.segments, ...selection.body })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر تحليل المحاضرة.');
    renderTimeline(result);
    scheduleSave();
    nodes.resultsGrid.hidden = false;
    setProgress('اكتمل تحليل المحاضرة وربط المصادر.', 100);
    finishProgress();
    updateChatAvailability();
  } catch (error) {
    nodes.progressWrap.hidden = true;
    toast(error.message);
  } finally { setBusy(false); updateChatAvailability(); }
}

bindDropzone(nodes.audioDrop, nodes.audioInput, loadAudio);
bindDropzone(nodes.pdfDrop, nodes.pdfInput, loadPdf);
nodes.audioInput.addEventListener('change', () => loadAudio(nodes.audioInput.files[0]));
nodes.pdfInput.addEventListener('change', () => loadPdf(nodes.pdfInput.files[0]));
$('#audioBrowse').addEventListener('click', (event) => { event.stopPropagation(); nodes.audioInput.click(); });
$('#pdfBrowse').addEventListener('click', (event) => { event.stopPropagation(); nodes.pdfInput.click(); });
nodes.analyzeBtn.addEventListener('click', analyzeLecture);
$('#reanalyzeBtn').addEventListener('click', analyzeLecture);
nodes.pageSelect.addEventListener('change', () => showPageText(nodes.pageSelect.value));
// PDF viewer controls — zoom, page navigation, fullscreen
if (nodes.pdfZoomIn) nodes.pdfZoomIn.addEventListener('click', () => setPdfZoom(pdfRenderState.zoom + 0.25));
if (nodes.pdfZoomOut) nodes.pdfZoomOut.addEventListener('click', () => setPdfZoom(pdfRenderState.zoom - 0.25));
initPdfGestures();
if (nodes.pdfFullscreen) nodes.pdfFullscreen.addEventListener('click', togglePdfFullscreen);
if (nodes.pdfPrev) nodes.pdfPrev.addEventListener('click', () => {
  const p = Math.max(1, pdfRenderState.currentPage - 1);
  selectPage(p);
});
if (nodes.pdfNext) nodes.pdfNext.addEventListener('click', () => {
  const max = pdfRenderState.doc ? pdfRenderState.doc.numPages : 1;
  const p = Math.min(max, pdfRenderState.currentPage + 1);
  selectPage(p);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nodes.pdfViewerWrap && nodes.pdfViewerWrap.classList.contains('pdf-fullscreen')) {
    togglePdfFullscreen();
  }
});
nodes.providerSelect.addEventListener('change', () => { state.provider = nodes.providerSelect.value; updateChatAvailability(); scheduleSave(); });
$('#settingsBtn').addEventListener('click', () => nodes.settingsDialog.showModal());
$('#settingsDoneBtn').addEventListener('click', () => nodes.settingsDialog.close());
$('#helpBtn').addEventListener('click', () => $('#aboutDialog').showModal());
$('#saveGeminiBtn').addEventListener('click', () => connectGeminiKey().catch((error) => toast(error.message)));
nodes.saveOpenrouterBtn.addEventListener('click', () => connectOpenrouter().catch((error) => toast(error.message)));
nodes.openrouterModelInput.addEventListener('input', () => { extraState('openrouter').model = nodes.openrouterModelInput.value.trim(); updateChatAvailability(); scheduleSave(); });
nodes.newLectureBtn.addEventListener('click', startNewLecture);
if (nodes.sessionChip) nodes.sessionChip.addEventListener('click', startNewLecture);
nodes.refreshSessionsBtn.addEventListener('click', () => renderSidebarSessions());
nodes.viewAllSessionsBtn.addEventListener('click', async () => {
  closeDrawer();
  await renderHistoryPage();
  nodes.historyDialog.showModal();
});
nodes.historyCloseBtn.addEventListener('click', () => nodes.historyDialog.close());
nodes.historyGrid.addEventListener('click', async (event) => {
  const card = event.target.closest('.history-card');
  if (!card) return;
  const id = card.dataset.sessionId;
  if (id === state.sessionId) { nodes.historyDialog.close(); return; }
  try { localStorage.setItem(LAST_SESSION_KEY, id); } catch {}
  reloadApp();
});
nodes.sessionsList.addEventListener('click', async (event) => {
  const delBtn = event.target.closest('[data-action="delete"]');
  const item = event.target.closest('.session-item');
  if (!item) return;
  const id = item.dataset.sessionId;
  if (delBtn) {
    event.stopPropagation();
    if (!confirm('تحذف المحاضرة دي نهائياً؟')) return;
    await deleteSession(id);
    if (id === state.sessionId) { try { localStorage.removeItem(LAST_SESSION_KEY); } catch {} closeDrawer(); return reloadApp(); }
    await renderSidebarSessions();
    return;
  }
  if (id === state.sessionId) { closeDrawer(); return; }
  closeDrawer();
  try { localStorage.setItem(LAST_SESSION_KEY, id); } catch {}
  reloadApp();
});

nodes.chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = nodes.questionInput.value.trim();
  if (!question || state.busy) return;
  nodes.questionInput.value = '';
  nodes.questionInput.style.height = 'auto';
  try { await sendQuestion(question); }
  catch (error) { nodes.questionInput.value = question; toast(error.message); }
});
nodes.questionInput.addEventListener('input', () => { nodes.questionInput.style.height = 'auto'; nodes.questionInput.style.height = `${Math.min(nodes.questionInput.scrollHeight, 130)}px`; });
nodes.questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); nodes.chatForm.requestSubmit(); }
});

document.addEventListener('click', (event) => {
  const citation = event.target.closest('[data-page], [data-seek]');
  if (!citation) return;
  if (citation.dataset.page && DEMO_MODE) {
    nodes.pageText.textContent = state.pages[Number(citation.dataset.page) - 1]?.text || state.pages[0]?.text || '';
    return;
  }
  if (citation.dataset.page) selectPage(citation.dataset.page);
  if (citation.dataset.seek) {
    if (DEMO_MODE) return toast('التوقيت للعرض التجريبي فقط.');
    const value = citation.dataset.seek;
    nodes.audioPlayer.currentTime = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : parseTime(value);
    nodes.audioPlayer.play().catch(() => {});
  }
});

async function initialize() {
  state.provider = nodes.providerSelect.value;
  // /api/health fetch removed — topbar status element (#systemStatus) no longer exists.
  updateChatAvailability();
  syncDrawerWithViewport();
  await renderSidebarSessions();
  if (DEMO_MODE) {
    state.audioFile = { name: 'محاضرة تجريبية.mp3', size: 18000000 };
    state.pdfFile = { name: 'شرائح المحاضرة.pdf', size: 1200000 };
    state.audioDuration = 96;
    state.pages = [{ page: 1, text: 'المتغيرات، الدوال، والمصفوفات هي اللبنات الأساسية لبناء البرامج. نستخدم الدوال لتقسيم المشكلة إلى خطوات قابلة لإعادة الاستخدام.' }];
    state.segments = [
      { start: 0, end: 18, text: 'النهارده هنتكلم عن إزاي نقسم أي مشكلة كبيرة لأجزاء صغيرة ونبني الحل خطوة خطوة.' },
      { start: 24, end: 46, text: 'الدالة بتخلينا نكتب منطق مرة واحدة ونستخدمه في أماكن مختلفة، وده بيخلي الكود أوضح وأسهل في التعديل.' },
      { start: 54, end: 78, text: 'لما نربط كل خطوة بالبيانات المناسبة، نقدر نختبر النتيجة ونتأكد إن كل جزء بيعمل المطلوب.' },
    ];
    state.sessionId = 'portfolio-demo';
    nodes.audioTitle.textContent = state.audioFile.name;
    nodes.audioHint.textContent = 'ملف تجريبي · 01:36';
    nodes.pdfTitle.textContent = state.pdfFile.name;
    nodes.pdfPanelTitle.textContent = state.pdfFile.name;
    nodes.pdfCount.textContent = '1 صفحة';
    nodes.pdfTotalPages.textContent = '1';
    nodes.pdfCurrentPage.textContent = '1';
    nodes.pageText.textContent = state.pages[0].text;
    nodes.pageSelect.innerHTML = '<option value="1">صفحة 1</option>';
    nodes.transcriptCount.textContent = '3 مقاطع';
    renderTranscript();
    renderTimeline({
      summary: 'تشرح المحاضرة طريقة تقسيم المسائل البرمجية إلى خطوات، ثم استخدام الدوال لتنظيم المنطق وإعادة استخدامه.',
      events: [
        { start: 0, title: 'تقسيم المشكلة', kind: 'concept', detail: 'ابدأ بتحويل المشكلة الكبيرة إلى خطوات أصغر يسهل فهمها واختبارها.', confidence: 0.94 },
        { start: 24, title: 'الدوال وإعادة الاستخدام', kind: 'example', detail: 'الدالة تجمع منطقًا واضحًا في مكان واحد لتسهيل التعديل وإعادة الاستخدام.', confidence: 0.91 },
        { start: 54, title: 'اختبار كل خطوة', kind: 'transition', detail: 'اربط كل خطوة بالبيانات المناسبة ثم تحقق من النتيجة.', confidence: 0.87 },
      ],
    });
    nodes.resultsGrid.hidden = false;
    nodes.timelineEmpty.hidden = true;
    nodes.questionInput.disabled = false;
    nodes.sendButton.disabled = false;
    nodes.chatHint.textContent = 'اسأل عن المحاضرة التجريبية؛ الإجابات تستخدم بيانات محلية.';
    nodes.questionInput.placeholder = 'جرّب: إزاي نستخدم الدوال؟';
  } else {
    await restoreLastSession();
  }
}
// ── In-app update check (APK distributed outside Google Play) ──────────
// Reads /version.json (served from the same site as the app) and compares
// its versionCode with the installed APK's versionCode. If a newer build
// exists, shows a dialog with an "Update now" button that opens the APK
// download link. Runs only inside the Android app, never in a normal browser.
//
// version.json format:
//   { "versionCode": 2, "versionName": "1.1.0", "minVersionCode": 1,
//     "url": "https://github.com/essayosef10-byte/<RELEASES-REPO>/releases/latest/download/Madar.apk",
//     "notes": "what's new" }
// If the installed versionCode is lower than minVersionCode the update is
// mandatory (no "Later" button).
const UPDATE_JSON_URL = '/version.json';
const UPDATE_DISMISSED_KEY = 'madar.update.dismissedVersionCode';

function isNativeApp() {
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

async function getInstalledVersionCode() {
  const appPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (appPlugin && typeof appPlugin.getInfo === 'function') {
    try {
      const info = await appPlugin.getInfo();
      const build = parseInt(info.build, 10);
      if (Number.isFinite(build)) return build;
    } catch (err) {
      console.warn('App.getInfo failed:', err);
    }
  }
  // The very first APK (versionCode 1) shipped without the App plugin.
  return 1;
}

function showUpdateDialog({ versionName, notes, url, force }) {
  // Styled with the app's own design tokens (--brand, --surface, --line, …)
  // and its .button classes, so it looks native to Vortex-Madar.
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('dir', 'rtl');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
      'background:rgba(39,0,55,.4)',
      'backdrop-filter:blur(3px)', '-webkit-backdrop-filter:blur(3px)'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'width:min(380px, 100%)',
      'background:var(--surface,#fff)', 'color:var(--ink,#20102e)',
      'border:1px solid var(--line,#e6e1ee)', 'border-radius:22px',
      'padding:24px', 'box-shadow:0 28px 100px rgba(39,0,55,.22)',
      'text-align:right', 'font-family:inherit'
    ].join(';');

    const icon = document.createElement('div');
    icon.style.cssText = 'width:44px;height:44px;border-radius:14px;background:var(--brand-soft,#f1e8f9);color:var(--brand,#5b1a8f);display:flex;align-items:center;justify-content:center;margin-bottom:14px;';
    icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';

    const title = document.createElement('h3');
    title.style.cssText = 'margin:0 0 8px;font-size:20px;font-weight:700;line-height:1.4;';
    title.textContent = force ? 'التحديث مطلوب' : 'فيه نسخة جديدة';

    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-block;margin:0 0 12px;padding:3px 12px;border-radius:999px;background:var(--brand-soft,#f1e8f9);border:1px solid var(--brand-tint,#e6d6f5);color:var(--brand-dark,#3d0a5c);font-size:12px;font-weight:600;font-family:Inter,sans-serif;direction:ltr;';
    chip.textContent = `v${versionName}`;

    const body = document.createElement('p');
    body.style.cssText = 'margin:0 0 20px;font-size:14px;line-height:1.7;color:var(--muted,#7a7488);white-space:pre-line;overflow-wrap:anywhere;';
    body.textContent = notes || 'تم إصدار نسخة جديدة من التطبيق.';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;';

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.className = 'button button-primary';
    updateBtn.style.cssText = 'flex:1;padding:12px 17px;font-size:14px;';
    updateBtn.textContent = 'حدّث الآن';
    updateBtn.addEventListener('click', () => {
      const opened = window.open(url, '_blank');
      if (!opened) window.location.href = url;
      if (!force) { overlay.remove(); resolve('updated'); }
    });
    actions.append(updateBtn);

    if (!force) {
      const laterBtn = document.createElement('button');
      laterBtn.type = 'button';
      laterBtn.className = 'button button-secondary';
      laterBtn.style.cssText = 'flex:1;padding:12px 17px;font-size:14px;';
      laterBtn.textContent = 'لاحقاً';
      laterBtn.addEventListener('click', () => { overlay.remove(); resolve('later'); });
      actions.append(laterBtn);
    }

    box.append(icon, title, chip, body, actions);
    overlay.append(box);
    document.body.append(overlay);
  });
}

async function checkForUpdate() {
  if (!isNativeApp()) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${UPDATE_JSON_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return;
    const latest = await response.json();
    if (!latest || !Number.isFinite(Number(latest.versionCode)) || !latest.url) return;

    const installed = await getInstalledVersionCode();
    const latestCode = Number(latest.versionCode);
    if (latestCode <= installed) return;

    const force = Number.isFinite(Number(latest.minVersionCode)) && installed < Number(latest.minVersionCode);

    if (!force) {
      let dismissed = 0;
      try { dismissed = Number(localStorage.getItem(UPDATE_DISMISSED_KEY)) || 0; } catch {}
      if (dismissed >= latestCode) return;
    }

    const choice = await showUpdateDialog({
      versionName: latest.versionName || String(latestCode),
      notes: latest.notes,
      url: latest.url,
      force
    });
    if (choice === 'later') {
      try { localStorage.setItem(UPDATE_DISMISSED_KEY, String(latestCode)); } catch {}
    }
  } catch (err) {
    // No internet or bad JSON: stay silent, never block the app.
    console.warn('Update check skipped:', err);
  }
}

initialize();
checkForUpdate();
