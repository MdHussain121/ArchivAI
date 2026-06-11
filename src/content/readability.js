export function estimateReadTime(text, wordsPerMinute = 200) {
  const words = (text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

export function extractTitle(doc) {
  return doc.title || '';
}

export function extractDescription(doc) {
  const og = doc.querySelector('meta[property="og:description"]');
  if (og) return og.getAttribute('content');
  const meta = doc.querySelector('meta[name="description"]');
  return meta?.getAttribute('content') || '';
}
