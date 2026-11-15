// Transcribe audio via Groq Whisper API — pure Node.js (no Python needed).
// Replaces transcribe_groq.py for Vercel serverless deployment.
//
// Groq free tier: 25 MB per file, 7200 sec/hour, 28800 sec/day.
// Files larger than 25 MB are split into chunks using ffmpeg-static.

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — Groq's hard limit per request
const CHUNK_SECONDS = 300; // 5 minutes per chunk — keeps each chunk well under 25 MB

// ffmpeg-static gives us a bundled ffmpeg binary that works on Vercel.
let ffmpegPath = null;
async function getFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  try {
    const mod = await import('ffmpeg-static');
    ffmpegPath = mod.default || mod;
    return ffmpegPath;
  } catch {
    return null; // ffmpeg not available — we'll reject large files
  }
}

// Probe audio duration using ffprobe (comes with ffmpeg-static).
async function probeDuration(filePath, ffmpegBin) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-i', filePath, '-f', 'null', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('close', () => {
      // ffmpeg prints "Duration: 00:03:45.12" in stderr
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (m) {
        resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
      } else {
        resolve(0);
      }
    });
    proc.on('error', () => resolve(0));
  });
}

// Split a large audio file into <25 MB chunks using ffmpeg.
async function splitAudio(filePath, tmpDir, ffmpegBin) {
  const pattern = path.join(tmpDir, 'chunk_%03d.mp3');
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      '-y', '-i', filePath,
      '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
      '-ac', '1', '-ar', '16000', '-b:a', '32k',
      pattern
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error('تعذر تقسيم الملف الصوتي: ' + stderr.slice(-300)));
      else resolve();
    });
    proc.on('error', reject);
  });
  const files = await fs.readdir(tmpDir);
  return files.filter((f) => f.startsWith('chunk_')).sort().map((f) => path.join(tmpDir, f));
}

// Send one chunk to Groq, return its segments + detected language.
async function transcribeChunk(chunkPath, key, whisperModel) {
  const buffer = await fs.readFile(chunkPath);
  const filename = path.basename(chunkPath);

  const formData = new FormData();
  formData.append('file', new Blob([buffer]), filename);
  formData.append('model', whisperModel);
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');
  formData.append('language', 'ar');

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = payload.error?.message || JSON.stringify(payload);
    if (response.status === 429) {
      throw new Error(`حد Groq اليومي/الساعي اتخطب. جرّب بعد قليل. (${msg})`);
    }
    throw new Error(`Groq رفض الطلب (HTTP ${response.status}): ${msg}`);
  }

  return {
    language: payload.language || 'unknown',
    duration: payload.duration || 0,
    segments: (payload.segments || []).map((seg) => ({
      start: Number(seg.start || 0),
      end: Number(seg.end || 0),
      text: String(seg.text || '').trim()
    })).filter((seg) => seg.text)
  };
}

export async function transcribeGroq(filePath, { apiKey, model } = {}) {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY غير مضبوط على السيرفر.');

  const whisperModel = model || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
  const buffer = await fs.readFile(filePath);
  const fileSize = buffer.length;

  // If the file is small enough, transcribe directly (fast path).
  if (fileSize <= MAX_FILE_BYTES) {
    const result = await transcribeChunk(filePath, key, whisperModel);
    return {
      language: result.language,
      duration: Math.round(result.duration * 100) / 100,
      segments: result.segments,
      provider: 'groq'
    };
  }

  // File is > 25 MB — try to split with ffmpeg.
  const ffmpegBin = await getFfmpeg();
  if (!ffmpegBin) {
    throw new Error(`الملف ${(fileSize / 1024 / 1024).toFixed(1)} MB أكبر من حد Groq (25 MB)، ولا يمكن تقسيمه (ffmpeg غير متاح). اضغط الملف أو قلّله.`);
  }

  const tmpDir = fs.mkdtemp(path.join(os.tmpdir(), 'madar-chunks-'));
  let chunkFiles = [];
  try {
    chunkFiles = await splitAudio(filePath, tmpDir, ffmpegBin);
    if (!chunkFiles.length) throw new Error('تعذر تقسيم الملف الصوتي.');

    let allSegments = [];
    let language = 'unknown';
    let totalDuration = 0;
    let offset = 0;

    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkResult = await transcribeChunk(chunkFiles[i], key, whisperModel);
      if (chunkResult.language !== 'unknown') language = chunkResult.language;

      // Shift segment timestamps by the accumulated offset so they're continuous.
      for (const seg of chunkResult.segments) {
        allSegments.push({
          start: Math.round((seg.start + offset) * 100) / 100,
          end: Math.round((seg.end + offset) * 100) / 100,
          text: seg.text
        });
      }

      // Advance the offset by the chunk's duration.
      const chunkDur = await probeDuration(chunkFiles[i], ffmpegBin);
      offset += chunkDur || chunkResult.duration;
      totalDuration = offset;
    }

    return {
      language,
      duration: Math.round(totalDuration * 100) / 100,
      segments: allSegments,
      provider: 'groq'
    };
  } finally {
    // Clean up chunks.
    for (const f of chunkFiles) await fs.unlink(f).catch(() => {});
    await fs.rmdir(tmpDir).catch(() => {});
  }
}
