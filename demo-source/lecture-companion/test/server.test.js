import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('local server exposes health status and the Arabic-first app shell', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/health`, { headers: { Origin: base } }).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.transcription, 'local-whisper');
  const htmlResponse = await fetch(base);
  const html = await htmlResponse.text();
  assert.equal(htmlResponse.status, 200);
  assert.match(html, /مدار/);
  assert.match(html, /ارفع تسجيل المحاضرة/);
});

test('server rejects cross-origin API requests', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, { headers: { Origin: 'https://example.invalid' } });
  assert.equal(response.status, 403);
});

test('server accepts any localhost port for same-origin checks (needed for tests and dev)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const otherPort = address.port === 3000 ? 3001 : 3000;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
    headers: { Origin: `http://127.0.0.1:${otherPort}` }
  });
  assert.equal(response.status, 200);
});

test('server accepts LAN private IPs (mobile on the same WiFi as the laptop)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  for (const hostname of ['192.168.1.100', '10.0.0.5', '172.16.0.20']) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { Origin: `http://${hostname}:3000` }
    });
    assert.equal(response.status, 200, `should accept LAN origin ${hostname}`);
  }
});

test('server still rejects non-private cross-origin requests (public hostname)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
    headers: { Origin: 'http://8.8.8.8:3000' }
  });
  assert.equal(response.status, 403);
});

test('providers endpoint exposes only the free providers (Gemini is separate, OpenRouter in list)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/providers`, { headers: { Origin: base } });
  const result = await response.json();
  assert.equal(response.status, 200);
  const ids = result.providers.map((p) => p.id);
  assert.ok(ids.includes('openrouter'), 'OpenRouter should be listed');
  // The paid/removed providers must NOT be present anymore.
  for (const id of ['zai', 'moonshot', 'dashscope', 'anthropic', 'ollama']) {
    assert.ok(!ids.includes(id), `provider ${id} should have been removed`);
  }
  const openrouter = result.providers.find((p) => p.id === 'openrouter');
  assert.equal(openrouter.needsKey, true);
  assert.match(openrouter.base, /openrouter\.ai/);
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
  const response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://random-frontend.example.com' } });
  assert.equal(response.status, 200);
});
