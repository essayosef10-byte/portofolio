export function formatTimestamp(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(remainder)}`;
}

export function normalizePages(pages = []) {
  return pages
    .map((item, index) => ({
      page: Math.max(1, Number(item.page) || index + 1),
      text: String(item.text || '').replace(/\s+/g, ' ').trim()
    }))
    .filter((item) => item.text)
    .sort((a, b) => a.page - b.page);
}

export function buildEvidenceContext({ segments = [], pages = [] } = {}) {
  const audio = segments
    .filter((segment) => String(segment.text || '').trim())
    .map((segment) => {
      const start = formatTimestamp(segment.start);
      const end = formatTimestamp(segment.end ?? segment.start);
      return `[الصوت ${start}–${end}] ${String(segment.text).trim()}`;
    });
  const pdf = normalizePages(pages)
    .map(({ page, text }) => `[PDF صفحة ${page}] ${text}`);
  return [...pdf, ...audio].join('\n');
}
