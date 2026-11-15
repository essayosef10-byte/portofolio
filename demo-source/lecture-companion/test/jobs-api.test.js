import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, _internals } from '../server.js';

test('health endpoint reports groq provider when GROQ_API_KEY is set', async (t) => {
  const original = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'gsk_test_key';
  t.after(() => {
    if (original === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original;
  });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/health`, { headers: { Origin: base } });
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.transcription, 'groq');
});

test('health endpoint reports local-whisper when GROQ_API_KEY is not set', async (t) => {
  // Ensure GROQ_API_KEY is not set for this test.
  const originalEnv = { ...process.env };
  delete process.env.GROQ_API_KEY;
  t.after(() => { Object.assign(process.env, originalEnv); });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/health`, { headers: { Origin: base } });
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.transcription, 'local-whisper');
});

test('/api/pdf returns 202 with a jobId immediately (background job started)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Send a tiny PDF-like blob — the job will fail because there's no Python script
  // actually present, but the important thing is we get a jobId back immediately.
  const response = await fetch(`${base}/api/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf', Origin: base },
    body: Buffer.from('%PDF-1.4 test')
  });
  const data = await response.json();
  assert.equal(response.status, 202);
  assert.ok(data.jobId, 'should return a jobId');
  // The job starts in pending, then quickly transitions to running.
  // Either is acceptable — what matters is we got a jobId without waiting for the work.
  assert.ok(['pending', 'running'].includes(data.status), `unexpected status: ${data.status}`);
});

test('/api/transcribe rejects unsupported formats before creating a job', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': 'file.txt', Origin: base },
    body: 'not audio'
  });
  const data = await response.json();
  assert.equal(response.status, 415);
  assert.match(data.error, /صيغة الصوت غير مدعومة/);
});

test('/api/transcribe returns 202 with a jobId for valid audio format', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'x-file-name': 'test.wav', Origin: base },
    body: Buffer.from('fake audio bytes')
  });
  const data = await response.json();
  assert.equal(response.status, 202);
  assert.ok(data.jobId);
  assert.ok(['local', 'groq'].includes(data.provider));
});

test('GET /api/jobs/:id returns the job status by id', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Create a transcribe job.
  const start = await fetch(`${base}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'x-file-name': 'test.wav', Origin: base },
    body: Buffer.from('fake')
  }).then((r) => r.json());
  // Poll once (the job will be pending/running/failed since there's no Python).
  const response = await fetch(`${base}/api/jobs/${start.jobId}`, { headers: { Origin: base } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(['pending', 'running', 'done', 'failed'].includes(data.status));
  assert.equal(data.id, start.jobId);
});

test('GET /api/jobs/:id returns 404 for a missing job', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/jobs/nonexistent-id`, { headers: { Origin: base } });
  assert.equal(response.status, 404);
});

test('DELETE /api/jobs/:id removes the job', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const start = await fetch(`${base}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'x-file-name': 'test.wav', Origin: base },
    body: Buffer.from('fake')
  }).then((r) => r.json());
  const del = await fetch(`${base}/api/jobs/${start.jobId}`, { method: 'DELETE', headers: { Origin: base } });
  const delData = await del.json();
  assert.equal(del.status, 200);
  assert.equal(delData.ok, true);
  // Subsequent GET should 404.
  const get = await fetch(`${base}/api/jobs/${start.jobId}`, { headers: { Origin: base } });
  assert.equal(get.status, 404);
});

test('checkLocalOrigin is relaxed when ALLOW_ANY_ORIGIN=1 (deployed mode)', async (t) => {
  const original = process.env.ALLOW_ANY_ORIGIN;
  process.env.ALLOW_ANY_ORIGIN = '1';
  t.after(() => {
    if (original === undefined) delete process.env.ALLOW_ANY_ORIGIN;
    else process.env.ALLOW_ANY_ORIGIN = original;
  });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Any origin should now be accepted (the app is meant to be public).
  const response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://random-frontend.example.com' } });
  assert.equal(response.status, 200);
});

test('checkLocalOrigin still rejects public IPs in local dev mode (HOST=127.0.0.1)', async (t) => {
  const originalHost = process.env.HOST;
  delete process.env.HOST;
  t.after(() => { if (originalHost !== undefined) process.env.HOST = originalHost; });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // A public IP origin should be rejected in local mode.
  const response = await fetch(`${base}/api/health`, { headers: { Origin: 'http://8.8.8.8:3000' } });
  assert.equal(response.status, 403);
});
