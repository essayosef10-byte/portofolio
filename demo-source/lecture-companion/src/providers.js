import { buildEvidenceContext } from './lecture.js';

const MAX_CONTEXT_CHARS = 120_000;

function contextFor({ pages = [], segments = [] }) {
  const full = buildEvidenceContext({ pages, segments });
  return full.length > MAX_CONTEXT_CHARS
    ? `${full.slice(0, MAX_CONTEXT_CHARS)}\n[تم اختصار السياق بسبب حد طول الطلب؛ اسأل عن جزء محدد.]`
    : full;
}

const baseInstructions = [
  'أنت مساعد مذاكرة لمحاضرة. أجب باللغة العربية الواضحة ما لم يطلب المستخدم غير ذلك.',
  'اعتمد حصراً على نص المحاضرة الصوتي وصفحات PDF المرفقة في السياق؛ لا تخترع أو تنسب معلومة إلى الدكتور دون دليل.',
  'ميّز بوضوح بين ما ورد في المحاضرة وبين الشرح الإضافي الذي تقدمه أنت.',
  'عند الاستشهاد، استخدم [صفحة N] لصفحة PDF و[وقت MM:SS] أو [وقت H:MM:SS] للمقطع الصوتي. إذا لم يوجد دليل، قل ذلك صراحة.',
  'إذا كان ربط المقطع بسلايد غير مؤكد، اذكر عدم اليقين بدلاً من الجزم.'
].join('\n');

export function buildLecturePrompt({ question, pages = [], segments = [], history = [] }) {
  const recentHistory = history.slice(-8).map((item) => `${item.role === 'assistant' ? 'المساعد' : 'الطالب'}: ${item.content}`).join('\n');
  const input = [
    'مصادر المحاضرة:',
    contextFor({ pages, segments }) || '[لا يوجد نص مصدر بعد]',
    recentHistory ? `\nسياق الأسئلة السابقة:\n${recentHistory}` : '',
    `\nسؤال الطالب:\n${String(question || '').trim()}`
  ].filter(Boolean).join('\n');
  return { instructions: baseInstructions, input };
}

export function buildAnalysisPrompt({ pages = [], segments = [] }) {
  const input = [
    'حلّل المحاضرة واربط المقاطع الصوتية بصفحات PDF عند وجود دليل نصي واضح. أعد JSON صالحاً فقط بالشكل التالي:',
    '{"summary":"ملخص عربي","events":[{"page":1,"start":0,"end":12,"kind":"concept|question|extra_explanation|example|transition|uncertain","title":"عنوان قصير","detail":"ما قاله المحاضر","evidence":"اقتباس قصير من الصوت","confidence":0.0}]}',
    'استعمل أرقام الصفحات كما هي في المصدر، والثواني كما هي في المقطع الصوتي. لا تنشئ أحداثاً أو أسئلة لم ترد. إذا لم يمكن ربط حدث بصفحة محددة، استخدم page:null وconfidence أقل من 0.5. اجعل confidence بين 0 و1.',
    'مصادر المحاضرة:',
    contextFor({ pages, segments }) || '[لا يوجد نص مصدر بعد]'
  ].join('\n\n');
  return { instructions: baseInstructions, input };
}

export function parseModelJson(text) {
  // Reasoning models (Kimi, GLM, Qwen...) may add think blocks or a sentence around the JSON.
  const source = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    // Last resort: extract the first {...} block.
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start === -1 || end <= start) throw error;
    parsed = JSON.parse(source.slice(start, end + 1));
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) {
    throw new Error('استجابة التحليل لا تطابق البنية المطلوبة.');
  }
  parsed.events = parsed.events.filter((event) => event && typeof event === 'object');
  return parsed;
}
