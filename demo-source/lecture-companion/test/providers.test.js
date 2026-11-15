import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLecturePrompt, buildAnalysisPrompt, parseModelJson } from '../src/providers.js';

test('lecture prompt contains both course sources and requests citations', () => {
  const prompt = buildLecturePrompt({
    question: 'اشرح الفكرة',
    pages: [{ page: 4, text: 'مفهوم الانحدار' }],
    segments: [{ start: 22, end: 28, text: 'الدكتور شرح الانحدار بمثال.' }]
  });
  assert.match(prompt.instructions, /لا تخترع/);
  assert.match(prompt.input, /PDF صفحة 4/);
  assert.match(prompt.input, /الصوت 00:22–00:28/);
  assert.match(prompt.input, /اشرح الفكرة/);
});

test('analysis prompt requests structured events and forbids unsupported slide assignments', () => {
  const prompt = buildAnalysisPrompt({
    pages: [{ page: 1, text: 'مقدمة' }],
    segments: [{ start: 5, end: 9, text: 'سؤال: ما هو التعلم؟' }]
  });
  assert.match(prompt.input, /"events"/);
  assert.match(prompt.input, /confidence/);
  assert.match(prompt.input, /PDF صفحة 1/);
});

test('parseModelJson handles plain JSON, code fences, and reasoning noise', () => {
  assert.deepEqual(parseModelJson('{"events":[]}'), { events: [] });
  assert.deepEqual(parseModelJson('```json\n{"events":[]}\n```'), { events: [] });
  // Reasoning model wrapped the JSON in a think block + commentary.
  const noisy = 'تفكير طويل```json\n{"summary":"ملخص","events":[{"page":1,"start":0,"end":5,"kind":"concept","title":"t","detail":"d","evidence":"e","confidence":0.9}]}\n```انتهى.';
  const parsed = parseModelJson(noisy);
  assert.equal(parsed.summary, 'ملخص');
  assert.equal(parsed.events.length, 1);
});

test('parseModelJson extracts JSON embedded in surrounding sentences as a last resort', () => {
  const surrounded = 'تمام، هذا هو التحليل: {"summary":"s","events":[]} — وأي تعديل قول لي.';
  const parsed = parseModelJson(surrounded);
  assert.equal(parsed.summary, 's');
  assert.deepEqual(parsed.events, []);
});

test('parseModelJson throws on malformed input', () => {
  assert.throws(() => parseModelJson('not json at all'), /SyntaxError|Unexpected/);
  assert.throws(() => parseModelJson('{"wrong":"shape"}'), /لا تطابق/);
  assert.throws(() => parseModelJson(''), /لا تطابق|Unexpected/);
});

test('parseModelJson filters out non-object events', () => {
  const parsed = parseModelJson('{"events":[1, "string", null, {"page":1,"start":0,"end":1,"kind":"concept","title":"t","detail":"d","evidence":"e","confidence":0.5}]}');
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].page, 1);
});
