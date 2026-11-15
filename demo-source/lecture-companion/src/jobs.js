// Background job queue for long-running tasks (transcription, PDF extraction).
//
// The student uploads a file, gets a task ID back immediately, then polls
// /api/jobs/:id until status is "done" or "failed". This way a mobile browser
// that loses the connection mid-task can pick up where it left off — the work
// keeps running on the server even if the phone screen goes to sleep.

import crypto from 'node:crypto';

// In-memory store. For a single-instance deployment this is enough. If you ever
// scale to multiple instances, swap this for Redis or a shared DB.
const jobs = new Map();
const MAX_JOBS = 50; // protect against unbounded memory growth on a small server

// Auto-clean finished jobs older than 1 hour so the map doesn't grow forever.
const FINISHED_TTL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === 'done' || job.status === 'failed') && now - job.updatedAt > FINISHED_TTL_MS) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref?.();

export function createJob(kind) {
  // If we hit the cap, evict the oldest finished job to make room.
  if (jobs.size >= MAX_JOBS) {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, job] of jobs) {
      if ((job.status === 'done' || job.status === 'failed') && job.updatedAt < oldestTime) {
        oldestTime = job.updatedAt;
        oldestId = id;
      }
    }
    if (oldestId) jobs.delete(oldestId);
  }
  const id = crypto.randomUUID();
  const job = {
    id,
    kind, // 'transcribe' | 'pdf' | 'analyze'
    status: 'pending', // 'pending' | 'running' | 'done' | 'failed'
    progress: 0, // 0-100
    label: '',
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function deleteJob(id) {
  return jobs.delete(id);
}

// Run an async function inside a job wrapper. Updates status + progress + result/error.
// The function receives a `report` callback to update progress.
export async function runJob(job, fn) {
  updateJob(job.id, { status: 'running', progress: 5 });
  const report = (progress, label) => updateJob(job.id, { progress, label: label || job.label });
  try {
    report(10, job.label);
    const result = await fn(report);
    updateJob(job.id, { status: 'done', progress: 100, result });
    return result;
  } catch (error) {
    updateJob(job.id, { status: 'failed', error: error.message || String(error) });
    throw error;
  }
}

// Convenience: serialize a job for the API response (never expose internal fields).
export function jobToJson(job) {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    label: job.label,
    error: job.error,
    result: job.result,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
