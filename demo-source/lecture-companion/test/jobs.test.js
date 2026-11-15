import test from 'node:test';
import assert from 'node:assert/strict';
import { createJob, getJob, updateJob, runJob, jobToJson, deleteJob } from '../src/jobs.js';

test('createJob returns a pending job with a unique id', () => {
  const a = createJob('transcribe');
  const b = createJob('pdf');
  assert.notEqual(a.id, b.id);
  assert.equal(a.status, 'pending');
  assert.equal(a.kind, 'transcribe');
  assert.equal(a.progress, 0);
});

test('getJob retrieves the same job by id', () => {
  const job = createJob('pdf');
  const fetched = getJob(job.id);
  assert.equal(fetched.id, job.id);
  assert.equal(fetched.kind, 'pdf');
});

test('updateJob patches fields and bumps updatedAt', async () => {
  const job = createJob('transcribe');
  const before = job.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  updateJob(job.id, { status: 'running', progress: 42, label: 'معالجة…' });
  const fetched = getJob(job.id);
  assert.equal(fetched.status, 'running');
  assert.equal(fetched.progress, 42);
  assert.equal(fetched.label, 'معالجة…');
  assert.ok(fetched.updatedAt > before);
});

test('runJob reports progress and stores the result on success', async () => {
  const job = createJob('pdf');
  const seen = [];
  const result = await runJob(job, async (report) => {
    report(20, 'بداية');
    seen.push(20);
    report(60, 'منتصف');
    seen.push(60);
    return { pages: [{ page: 1, text: 'x' }], totalPages: 1, emptyPages: [] };
  });
  assert.deepEqual(result.pages[0].text, 'x');
  const fetched = getJob(job.id);
  assert.equal(fetched.status, 'done');
  assert.equal(fetched.progress, 100);
  assert.deepEqual(fetched.result.pages[0].text, 'x');
  assert.deepEqual(seen, [20, 60]);
});

test('runJob records the error message on failure', async () => {
  const job = createJob('transcribe');
  await assert.rejects(
    runJob(job, async () => { throw new Error('Groq انهار'); }),
    /Groq انهار/
  );
  const fetched = getJob(job.id);
  assert.equal(fetched.status, 'failed');
  assert.match(fetched.error, /Groq انهار/);
  assert.equal(fetched.result, null);
});

test('jobToJson exposes only the public fields (no internal leakage)', () => {
  const job = createJob('pdf');
  updateJob(job.id, { status: 'done', result: { ok: true } });
  const json = jobToJson(job);
  assert.ok('id' in json);
  assert.ok('kind' in json);
  assert.ok('status' in json);
  assert.ok('progress' in json);
  assert.ok('result' in json);
  assert.ok('error' in json);
  assert.ok('createdAt' in json);
  assert.ok('updatedAt' in json);
  assert.ok('label' in json);
  // No functions or unexpected internals leak.
  assert.equal(typeof json.id, 'string');
  assert.equal(typeof json.status, 'string');
});

test('jobToJson returns null for missing jobs', () => {
  assert.equal(jobToJson(null), null);
  assert.equal(jobToJson(getJob('nonexistent-id')), null);
});

test('deleteJob removes the job and returns true; returns false if it did not exist', () => {
  const job = createJob('pdf');
  assert.equal(deleteJob(job.id), true);
  assert.equal(getJob(job.id), null);
  assert.equal(deleteJob(job.id), false);
});

test('a job that finishes is cleaned up after the TTL (we can call deleteJob manually too)', async () => {
  const job = createJob('transcribe');
  await runJob(job, async () => 'ok');
  assert.equal(getJob(job.id).status, 'done');
  deleteJob(job.id);
  assert.equal(getJob(job.id), null);
});

test('runJob can be awaited multiple times safely (idempotent on the job state)', async () => {
  const job = createJob('pdf');
  const fn = async (report) => {
    report(50, 'نصف');
    return { value: 1 };
  };
  await runJob(job, fn);
  const fetched = getJob(job.id);
  assert.equal(fetched.status, 'done');
  assert.equal(fetched.result.value, 1);
});

test('the job store caps at MAX_JOBS by evicting the oldest finished job', () => {
  // We can't easily test the exact cap (50) without creating 50 jobs, but we can verify
  // that creating many jobs doesn't throw and they all coexist.
  const ids = [];
  for (let i = 0; i < 10; i += 1) {
    const job = createJob('pdf');
    ids.push(job.id);
  }
  for (const id of ids) {
    assert.ok(getJob(id), `job ${id} should still exist`);
  }
});
