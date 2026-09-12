/**
 * News Deduplication & Filtering Service
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was',
  'were', 'be', 'been', 'with', 'by', 'about', 'as', 'into', 'after', 'will', 'why', 'what',
  'how', 'this', 'that', 'from', 'stock', 'shares', 'stocks', 'today', 'price', 'here', 'why'
]);

/**
 * Strips publisher suffix from title (e.g., "Nvidia Rallies 5% - Bloomberg" -> "Nvidia Rallies 5%")
 */
export function cleanTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\s*-\s*[A-Za-z0-9\s.,&]+$/, '') // remove trailing " - Source"
    .replace(/<[^>]*>/g, '') // remove any stray HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Tokenizes a string into meaningful word stems
 */
function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Computes Jaccard word similarity coefficient between two titles
 */
function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Formats relative time (e.g. "2h ago", "1d ago", "35m ago")
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return 'recently';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'recently';

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'just now';

  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 60) {
    return `${Math.max(1, diffMin)}m ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Aggressively deduplicates a list of news items, prioritizing freshest news
 */
export function deduplicateNews(articles, maxResults = 4) {
  // Sort freshest articles first
  const sorted = [...articles].sort((a, b) => {
    const timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return timeB - timeA;
  });

  const result = [];

  for (const article of sorted) {
    const cleaned = cleanTitle(article.title);
    if (!cleaned || cleaned.length < 10) continue;

    const tokens = tokenize(cleaned);
    let isDuplicate = false;

    for (const existing of result) {
      const sim = jaccardSimilarity(tokens, existing._tokens);
      if (sim > 0.45) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push({
        title: cleaned,
        source: article.source || 'News',
        link: article.link,
        time: formatRelativeTime(article.pubDate),
        rawDate: article.pubDate ? new Date(article.pubDate) : new Date(),
        _tokens: tokens
      });
    }

    if (result.length >= maxResults) {
      break;
    }
  }

  return result.map(({ _tokens, ...rest }) => rest);
}
