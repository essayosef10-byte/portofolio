import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAnalysisPrompt, buildLecturePrompt, parseModelJson } from './src/providers.js';
import { createJob, getJob, updateJob, runJob, jobToJson, deleteJob } from './src/jobs.js';
import { extractPdf } from './src/extract_pdf.js';
import { transcribeGroq } from './src/transcribe_groq.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB — Groq handles splitting internally
const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const PDF_TIMEOUT_MS = 30 * 60 * 1000;
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 1500);
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 120_000);

// Only providers that are actually free for a student audience.
// - Gemini: free tier via Google AI Studio
// - OpenRouter: free models (Qwen / Kimi / GLM) up to 50 requests/day
const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter — نماذج مجانية (Qwen / Kimi / GLM)',
    short: 'OpenRouter',
    kind: 'openai',
    base: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'مفتاح مجاني من openrouter.ai. النماذج المجانية محدودة: حسب وثائقهم 20 طلب/دقيقة و50 طلب/يوم، وتزيد لـ 1000 بعد شراء رصيد 10$ مرة واحدة.'
  }
};
const STATIC_MODELS = {};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(Object.assign(new Error('الطلب كبير جداً.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('صيغة JSON غير صحيحة.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function writeUpload(req, extension, maxBytes) {
  const filePath = path.join(os.tmpdir(), `lecture-${crypto.randomUUID()}${extension}`);
  await new Promise((resolve, reject) => {
    let size = 0;
    const output = fs.createWriteStream(filePath, { flags: 'wx' });
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        output.destroy(new Error('الملف أكبر من الحد المسموح.'));
        req.destroy();
      }
    });
    req.pipe(output);
    output.on('finish', () => size ? resolve() : reject(new Error('الملف فارغ.')));
    output.on('error', reject);
    req.on('error', reject);
  }).catch(async (error) => {
    await fsp.rm(filePath, { force: true }).catch(() => {});
    throw error;
  });
  return filePath;
}

function runPython(scriptName, filePath, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const bundledPython = path.join(HERE, '.venv', 'Scripts', 'python.exe');
    const executable = process.env.PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python');
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
    const child = spawn(executable, ['-u', path.join(HERE, scriptName), filePath], { cwd: HERE, windowsHide: true, env });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 5_000_000) child.kill('SIGTERM'); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`تعذر تشغيل Python: ${error.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('انتهت مهلة المعالجة قبل اكتمالها. جرّب ملفاً أقصر أو بصفحات أقل.'));
      let payload;
      try { payload = JSON.parse(stdout.trim()); }
      catch {
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine ? `${scriptName} فشل: ${lastLine}` : `تعذر قراءة نتيجة ${scriptName}.`));
      }
      if (code !== 0 || payload.error) return reject(new Error(payload.error || stderr || `${scriptName} فشل.`));
      resolve(payload);
    });
  });
}

// ── Gemini ──────────────────────────────────────────────────────────

async function requestGeminiModels(apiKey) {
  const response = await fetch(`${GEMINI_BASE}/models`, { headers: { 'x-goog-api-key': apiKey } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'تعذر الاتصال بـGemini. تحقق من المفتاح وحدود الاستخدام المجاني.'), { status: response.status });
  return (payload.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => ({ id: String(model.name || '').replace(/^models\//, ''), name: model.displayName || model.name }))
    .filter((model) => model.id && !/embedding|image|tts/i.test(model.id));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(apiKey, model, prompt, { jsonMode, mergeInstructions }) {
  const text = mergeInstructions ? `${prompt.instructions}\n\n${prompt.input}` : prompt.input;
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { ...(jsonMode ? { responseMimeType: 'application/json' } : {}), maxOutputTokens: 4096 }
  };
  if (!mergeInstructions) body.systemInstruction = { parts: [{ text: prompt.instructions }] };
  const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function classifyGeminiError(status, message) {
  const text = String(message || '');
  if (/developer instruction/i.test(text)) return 'no-system-instruction';
  if (/json mode|response_?mime_?type/i.test(text)) return 'no-json-mode';
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(text)) return 'quota';
  if (status === 503 || /high demand|overloaded|UNAVAILABLE/i.test(text)) return 'busy';
  if (status === 404) return 'missing-model';
  if (/not enabled|not supported/i.test(text)) return 'unsupported';
  return 'other';
}

function geminiFailure(last, tried) {
  const detail = String(last?.message || '').replace(/\s+/g, ' ').slice(0, 200);
  const base = {
    quota: 'حصة Gemini المجانية لهذا النموذج غير متاحة أو انتهت.',
    busy: 'نموذج Gemini مزدحم حالياً.',
    'missing-model': 'نموذج Gemini غير متاح لهذا المفتاح.'
  }[last?.kind] || 'تعذر استخدام Gemini.';
  const triedText = tried.length > 1 ? ` جرّبنا: ${tried.join('، ')}.` : '';
  return Object.assign(new Error(`${base}${triedText} اختر نموذجاً آخر من الإعدادات أو أعد المحاولة بعد قليل. (${detail})`), { status: last?.status || 502 });
}

async function geminiFallbackModels(apiKey, tried) {
  try {
    const models = await requestGeminiModels(apiKey);
    const score = (id) => (/preview/i.test(id) ? 10 : 0) + (/lite/i.test(id) ? 1 : 0);
    return models.map((model) => model.id)
      .filter((id) => /^gemini-.*flash/i.test(id) && !/live|audio|thinking|exp|image|tts|embedding|robotics|computer/i.test(id) && !tried.includes(id))
      .sort((a, b) => score(a) - score(b) || b.localeCompare(a))
      .slice(0, 3);
  } catch { return []; }
}

async function generateWithGemini(apiKey, model, prompt, jsonMode = false) {
  if (!apiKey) throw Object.assign(new Error('أدخل مفتاح Gemini API المجاني من Google AI Studio.'), { status: 401 });
  const tried = [];
  let queue = [model];
  let fallbacksLoaded = false;
  let last = null;
  while (queue.length) {
    const current = queue.shift();
    tried.push(current);
    let mergeInstructions = false;
    let useJson = jsonMode;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { response, payload } = await callGemini(apiKey, current, prompt, { jsonMode: useJson, mergeInstructions });
      if (response.ok) {
        const text = (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
        if (text) {
          if (current !== model) console.log(`Gemini: "${model}" failed, answered with "${current}".`);
          return text;
        }
        last = { kind: 'other', status: 502, message: 'لم يُرجع Gemini نصاً.' };
        break;
      }
      const message = payload.error?.message || '';
      const kind = classifyGeminiError(response.status, message);
      last = { kind, status: response.status, message };
      if (kind === 'no-system-instruction' && !mergeInstructions) { mergeInstructions = true; continue; }
      if (kind === 'no-json-mode' && useJson) { useJson = false; continue; }
      if (kind === 'busy' && attempt < 3) { await sleep(GEMINI_RETRY_BASE_MS * 2 ** attempt); continue; }
      if (kind === 'other' && current === model && [400, 401, 403].includes(response.status)) throw geminiFailure(last, tried);
      break;
    }
    if (!queue.length && !fallbacksLoaded) {
      fallbacksLoaded = true;
      queue = await geminiFallbackModels(apiKey, tried);
    }
  }
  throw geminiFailure(last, tried);
}

// ── OpenRouter (OpenAI-compatible) ────────────────────────────────────

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function resolveBase(defaultBase, requested) {
  if (!requested) return defaultBase;
  let parsed;
  try { parsed = new URL(String(requested)); }
  catch { throw Object.assign(new Error('عنوان الخدمة غير صحيح.'), { status: 400 }); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback))) {
    throw Object.assign(new Error('عنوان الخدمة لازم يبدأ بـ https (أو http على نفس الجهاز).'), { status: 400 });
  }
  return parsed.toString().replace(/\/+$/, '');
}

function providerError(label, status, message, id) {
  const text = String(message || '');
  const detail = text.replace(/\s+/g, ' ').slice(0, 200);
  let base;
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|authentication/i.test(text)) {
    base = `مفتاح ${label} غير صالح أو غير مسموح له.`;
  } else if (status === 402 || /insufficient|balance|credits?/i.test(text) && status !== 429) {
    base = `رصيد حساب ${label} غير كافٍ.`;
  } else if (status === 429) {
    base = id === 'openrouter'
      ? 'وصلت لحد استخدام OpenRouter (النماذج المجانية محدودة بالدقيقة وباليوم). جرّب بعد قليل أو غيّر الموديل.'
      : `وصلت لحد استخدام ${label}. جرّب بعد قليل أو غيّر الموديل.`;
  } else if (status === 404 && /data policy|privacy|publication/i.test(text)) {
    base = 'OpenRouter رفض النموذج المجاني بسبب إعدادات الخصوصية في حسابك. افتح إعدادات الخصوصية في حسابك وفعّل استخدام النماذج المجانية.';
  } else if (status === 404) {
    base = `النموذج غير متاح عند ${label}. جرّب موديلاً آخر من القايمة.`;
  } else if ([500, 502, 503, 529].includes(status) || /overloaded|high demand/i.test(text)) {
    base = `${label} مزدحم حالياً. أعد المحاولة بعد قليل.`;
  } else {
    base = `تعذر استخدام ${label}.`;
  }
  return Object.assign(new Error(detail ? `${base} (${detail})` : base), { status: status || 502 });
}

function authHeaders(kind, key) {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function listProviderModels(id, base, key) {
  const config = PROVIDERS[id];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(`${base}/models`, { headers: authHeaders(config.kind, key), signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    throw Object.assign(new Error(`تعذر الاتصال بـ ${config.label}: ${error.message}`), { status: 502 });
  }
  clearTimeout(timer);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status !== 401 && response.status !== 403 && STATIC_MODELS[id]) {
      return STATIC_MODELS[id].map((m) => ({ ...m, free: false }));
    }
    throw providerError(config.label, response.status, payload.error?.message || payload.message, id);
  }
  let models = (payload.data || payload.models || []).map((item) => ({
    id: item.id || item.name,
    name: item.display_name || item.name || item.id,
    context: item.context_length || null,
    free: Boolean(item.pricing && Number(item.pricing.prompt) === 0 && Number(item.pricing.completion) === 0) || /:free$/.test(item.id || '')
  })).filter((item) => item.id);
  if (id === 'openrouter') {
    const rank = (item) => (/qwen/i.test(item.id) ? 0 : /kimi|moonshot/i.test(item.id) ? 1 : /glm|z-ai/i.test(item.id) ? 2 : 3);
    models = models.filter((item) => item.free && (!item.context || item.context >= 32_000)).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  }
  if (!models.length && STATIC_MODELS[id]) {
    return STATIC_MODELS[id].map((m) => ({ ...m, free: false }));
  }
  return models.map(({ id: modelId, name, free }) => ({ id: modelId, name, free }));
}

async function callProvider(config, { base, key, model }, prompt, jsonMode) {
  const maxTokens = jsonMode ? 8192 : 4096;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { ...authHeaders('openai', key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: prompt.instructions }, { role: 'user', content: prompt.input }] }),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('انتهت مهلة الطلب. جرّب مرة أخرى.'), { status: 504 });
    }
    throw Object.assign(new Error(`تعذر الاتصال بـ ${config.label}: ${error.message}`), { status: 502 });
  }
  clearTimeout(timer);
  return response;
}

function extractProviderText(config, payload) {
  const choice = payload.choices?.[0];
  let content = choice?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((part) => part.text || '').join('');
  }
  const text = stripThinking(content);
  if (!text && choice?.finish_reason === 'length') {
    throw Object.assign(new Error('النموذج استهلك حد الإخراج في التفكير قبل ما يكتب الإجابة. جرّب سؤالاً أقصر أو موديلاً غير تفكيري.'), { status: 422 });
  }
  return text;
}

async function generateWithProvider(id, settings, prompt, jsonMode = false) {
  const config = PROVIDERS[id];
  if (config.needsKey && !settings.key) {
    throw Object.assign(new Error(`أدخل مفتاح ${config.label}.`), { status: 401 });
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await callProvider(config, settings, prompt, jsonMode);
    } catch (error) {
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = extractProviderText(config, payload);
      if (!text) throw Object.assign(new Error(`${config.label} لم يُرجع نصاً.`), { status: 502 });
      return text;
    }
    const message = payload.error?.message || payload.message || '';
    const busy = [502, 503, 529].includes(response.status) || /overloaded|high demand/i.test(message);
    if (busy && attempt < 2) {
      await sleep(GEMINI_RETRY_BASE_MS * 2 ** attempt);
      continue;
    }
    throw providerError(config.label, response.status, message, id);
  }
  throw Object.assign(new Error(`تعذر استخدام ${config.label}.`), { status: 502 });
}

// ── CORS / origin check ───────────────────────────────────────────────

function isPrivateIp(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

// ── Supabase Storage cleanup (server-only; service-role key never exposed) ──
let _supabaseServiceKeyWarned = false;
async function deleteSupabaseObject(bucketPath) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!serviceRoleKey || !supabaseUrl) {
    if (!_supabaseServiceKeyWarned) {
      _supabaseServiceKeyWarned = true;
      console.warn('SUPABASE_SERVICE_ROLE_KEY missing — uploaded objects will not be deleted automatically.');
    }
    return;
  }
  // bucketPath looks like "lectures/1700000000-abc.mp3"
  await fetch(`${supabaseUrl}/storage/v1/object/${bucketPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }
  });
}

// Daily cleanup: delete Storage objects older than 24h. Best-effort — returns
// { deleted: n } and never throws (called by the Vercel cron).
async function cleanupSupabaseStorage() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!serviceRoleKey || !supabaseUrl) return { deleted: 0, skipped: 'no service role key' };
  const bucket = 'lectures';
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const headers = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' };
  let deleted = 0;
  for (let page = 0; page < 10; page++) {
    const listResp = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers,
      body: JSON.stringify({ prefix: '', limit: 1000, offset: page * 1000, sortBy: { column: 'created_at', order: 'asc' } })
    });
    if (!listResp.ok) throw new Error(`list failed: HTTP ${listResp.status}`);
    const items = await listResp.json().catch(() => []);
    if (!items.length) break;
    const stale = items
      .filter((item) => { const ts = item.created_at || item.updated_at; return ts && new Date(ts).getTime() < cutoff; })
      .map((item) => item.name);
    if (stale.length) {
      const delResp = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
        method: 'DELETE', headers, body: JSON.stringify({ prefixes: stale })
      });
      if (delResp.ok) deleted += stale.length;
    }
    if (items.length < 1000) break;
  }
  return { deleted };
}

function checkLocalOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (HOST === '0.0.0.0' || process.env.ALLOW_ANY_ORIGIN === '1') return true;
  try {
    const url = new URL(origin);
    return isPrivateIp(url.hostname) || url.hostname === HOST;
  } catch {
    return false;
  }
}

// ── API routes ────────────────────────────────────────────────────────

async function handleApi(req, res, url) {
  // Cron cleanup — server-to-server (no Origin header), protected by CRON_SECRET.
  // Placed before checkLocalOrigin so the Vercel scheduler isn't blocked.
  if (req.method === 'GET' && url.pathname === '/api/cron/cleanup') {
    const auth = String(req.headers.authorization || '');
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) return json(res, 401, { error: 'غير مصرح.' });
    try {
      const result = await cleanupSupabaseStorage();
      return json(res, 200, result);
    } catch (error) {
      console.error('Cleanup failed:', error.message);
      return json(res, 200, { deleted: 0, error: error.message });
    }
  }
  if (!checkLocalOrigin(req)) return json(res, 403, { error: 'مصدر الطلب غير مسموح.' });
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const transcription = process.env.GROQ_API_KEY ? 'groq' : 'local-whisper';
    return json(res, 200, { ok: true, host: HOST, port: PORT, transcription });
  }
  // Public config — exposes Supabase URL + anon key to the client (safe, anon key is public).
  // The client uses these to upload large files directly to Supabase Storage (bypassing Vercel's 4.5MB body limit).
  if (req.method === 'GET' && url.pathname === '/api/config') {
    return json(res, 200, {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_ANON_KEY || ''
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/gemini/models') {
    const key = req.headers['x-gemini-key'];
    if (!key || String(key).length > 300) return json(res, 400, { error: 'أدخل مفتاح Gemini API.' });
    try { return json(res, 200, { models: await requestGeminiModels(String(key)) }); }
    catch (error) { return json(res, error.status || 502, { error: error.message }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/providers') {
    const list = Object.entries(PROVIDERS).map(([id, c]) => ({ id, label: c.label, short: c.short, needsKey: c.needsKey, base: c.base, keyUrl: c.keyUrl, note: c.note }));
    return json(res, 200, { providers: list });
  }
  if (req.method === 'POST' && url.pathname === '/api/provider/models') {
    const body = await readJson(req);
    const config = PROVIDERS[body.provider];
    if (!config) return json(res, 400, { error: 'مزوّد غير معروف.' });
    const key = String(req.headers['x-provider-key'] || '');
    if (config.needsKey && (!key || key.length > 400)) return json(res, 400, { error: `أدخل مفتاح ${config.label}.` });
    try {
      const base = resolveBase(config.base, body.baseUrl);
      return json(res, 200, { models: await listProviderModels(body.provider, base, key) });
    } catch (error) {
      return json(res, error.status || 502, { error: error.message });
    }
  }
  // ── File upload helpers: accept either raw body (local) or JSON with URL (Vercel) ──

  // Download a file from a URL to a temp path on disk.
  async function downloadToFile(url, extension) {
    // SSRF hardening: only https URLs inside our own Supabase public-storage
    // prefix. Anything else → 400 with an Arabic error.
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const allowedPrefix = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/` : '';
    let parsed;
    try { parsed = new URL(url); } catch {
      throw Object.assign(new Error('رابط الملف غير صالح.'), { status: 400 });
    }
    if (parsed.protocol !== 'https:') {
      throw Object.assign(new Error('الرابط لازم يبدأ بـ https.'), { status: 400 });
    }
    if (!allowedPrefix || !url.startsWith(allowedPrefix)) {
      throw Object.assign(new Error('الرابط خارج نطاق التخزين المسموح.'), { status: 400 });
    }
    const filePath = path.join(os.tmpdir(), `lecture-${crypto.randomUUID()}${extension}`);
    const response = await fetch(url);
    if (!response.ok) throw Object.assign(new Error(`تعذر تحميل الملف (HTTP ${response.status}).`), { status: 502 });
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(filePath, buffer);
    // Best-effort: delete the object now that we have it locally. Never fail
    // the job on delete errors — the file is already safe in /tmp.
    const bucketPath = decodeURIComponent(url.slice(allowedPrefix.length));
    await deleteSupabaseObject(bucketPath).catch((e) => console.warn('Supabase delete skipped:', e?.message || e));
    return filePath;
  }

  // Detect whether the request is a raw file upload or a JSON body with a URL.
  function isUrlRequest(req) {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    return ct.includes('application/json');
  }

  if (req.method === 'POST' && url.pathname === '/api/pdf') {
    let filePath;
    let tempFile = null;
    try {
      if (isUrlRequest(req)) {
        // Vercel mode: client uploaded to Supabase, sends us the URL.
        const body = await readJson(req);
        if (!body.url) return json(res, 400, { error: 'أدخل رابط الملف (url).' });
        tempFile = await downloadToFile(body.url, '.pdf');
        filePath = tempFile;
      } else {
        // Local mode: raw file upload.
        filePath = await writeUpload(req, '.pdf', MAX_PDF_BYTES);
        tempFile = filePath;
      }
      const job = createJob('pdf');
      job.label = 'استخراج نص PDF';
      runJob(job, async (report) => {
        report(20, 'تحليل صفحات PDF…');
        const result = await extractPdf(filePath);
        report(90, 'اكتمل استخراج النص.');
        await fsp.rm(filePath, { force: true }).catch(() => {});
        return result;
      }).catch(async (error) => {
        await fsp.rm(filePath, { force: true }).catch(() => {});
        console.error('PDF job failed:', error.message);
      });
      return json(res, 202, { jobId: job.id, status: job.status });
    } catch (error) {
      if (tempFile) await fsp.rm(tempFile, { force: true }).catch(() => {});
      return json(res, error.status || 422, { error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    let filePath;
    let tempFile = null;
    let ext = '.wav';
    try {
      if (isUrlRequest(req)) {
        // Vercel mode: client uploaded to Supabase, sends us the URL + filename.
        const body = await readJson(req);
        if (!body.url) return json(res, 400, { error: 'أدخل رابط الملف (url).' });
        const filename = String(body.filename || 'audio.wav').slice(0, 250);
        ext = path.extname(filename).toLowerCase() || '.wav';
        tempFile = await downloadToFile(body.url, ext);
        filePath = tempFile;
      } else {
        // Local mode: raw file upload.
        const suppliedName = String(req.headers['x-file-name'] || 'audio.wav').slice(0, 250);
        ext = path.extname(suppliedName).toLowerCase();
        filePath = await writeUpload(req, ext, MAX_AUDIO_BYTES);
        tempFile = filePath;
      }
      const allowed = new Set(['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.webm', '.flac', '.mpeg', '.mpga', '.aac', '.wma']);
      if (!allowed.has(ext)) return json(res, 415, { error: 'صيغة الصوت غير مدعومة. استخدم MP3 أو WAV أو M4A أو OGG.' });
      const job = createJob('transcribe');
      job.label = 'تفريغ الصوت';
      const useGroq = Boolean(process.env.GROQ_API_KEY);
      runJob(job, async (report) => {
        report(15, useGroq ? 'جارٍ التفريغ عبر Groq…' : 'جارٍ التفريغ محلياً…');
        let result;
        if (useGroq) {
          result = await transcribeGroq(filePath);
        } else {
          result = await runPython('transcribe_local.py', filePath);
        }
        report(95, 'اكتمل التفريغ.');
        await fsp.rm(filePath, { force: true }).catch(() => {});
        return result;
      }).catch(async (error) => {
        await fsp.rm(filePath, { force: true }).catch(() => {});
        console.error('Transcribe job failed:', error.message);
      });
      return json(res, 202, { jobId: job.id, status: job.status, provider: useGroq ? 'groq' : 'local' });
    } catch (error) {
      if (tempFile) await fsp.rm(tempFile, { force: true }).catch(() => {});
      return json(res, error.status || 422, { error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.slice('/api/jobs/'.length);
    const job = getJob(id);
    if (!job) return json(res, 404, { error: 'المهمة غير موجودة (قد تكون انتهت صلاحيتها).' });
    return json(res, 200, jobToJson(job));
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.slice('/api/jobs/'.length);
    const ok = deleteJob(id);
    return json(res, ok ? 200 : 404, { ok });
  }
  if (req.method === 'POST' && (url.pathname === '/api/chat' || url.pathname === '/api/analyze')) {
    const body = await readJson(req);
    const prompt = url.pathname === '/api/analyze' ? buildAnalysisPrompt(body) : buildLecturePrompt(body);
    const provider = body.provider;
    const model = String(body.model || '').slice(0, 150);
    try {
      let answer;
      if (provider === 'gemini') {
        const key = String(req.headers['x-gemini-key'] || '');
        if (!model) return json(res, 400, { error: 'اختر نموذج Gemini.' });
        answer = await generateWithGemini(key, model, prompt, url.pathname === '/api/analyze');
      } else if (PROVIDERS[provider]) {
        if (!model) return json(res, 400, { error: 'اختر النموذج.' });
        const config = PROVIDERS[provider];
        const base = resolveBase(config.base, body.baseUrl);
        const key = String(req.headers['x-provider-key'] || '');
        answer = await generateWithProvider(provider, { base, key, model }, prompt, url.pathname === '/api/analyze');
      } else {
        return json(res, 400, { error: 'اختر المزوّد.' });
      }
      if (url.pathname === '/api/analyze') return json(res, 200, parseModelJson(answer));
      return json(res, 200, { answer });
    } catch (error) {
      return json(res, error.status || 502, { error: error.message });
    }
  }
  return json(res, 404, { error: 'المسار غير موجود.' });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) return json(res, 403, { error: 'غير مسموح.' });
  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) return json(res, 404, { error: 'غير موجود.' });
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(resolved)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    fs.createReadStream(resolved).pipe(res);
  } catch { return json(res, 404, { error: 'غير موجود.' }); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method === 'GET') return await handleStatic(req, res, url);
      return json(res, 405, { error: 'طريقة الطلب غير مسموحة.' });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.message || 'حدث خطأ غير متوقع.' });
      else res.end();
    }
  });
}

export const _internals = { PROVIDERS, STATIC_MODELS, generateWithProvider, listProviderModels, resolveBase, stripThinking, createJob, getJob, jobToJson, runJob, isPrivateIp };

// Vercel serverless entry point — exported as default handler.
// On Vercel, the platform calls this for every request; we don't call .listen() ourselves.
export default async function handler(req, res) {
  const server = createServer();
  return server.emit('request', req, res);
}

// Local dev: start a real HTTP server when run directly (not on Vercel).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && !process.env.VERCEL) {
  const server = createServer();
  server.listen(PORT, HOST, () => console.log(`Vortex-Madar Lecture Studio running at http://${HOST}:${PORT}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
