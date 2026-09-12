import { XMLParser } from 'fast-xml-parser';
import { cache } from '../../cache/cacheManager.js';
import { config } from '../../config/index.js';
import { deduplicateNews } from './newsDeduplicator.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

/**
 * Parses RSS XML into standard article objects
 */
function parseRssFeed(xmlText, defaultSource = 'Google News') {
  try {
    const parsed = xmlParser.parse(xmlText);
    const channel = parsed?.rss?.channel;
    if (!channel || !channel.item) return [];

    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    return items.map(item => {
      let sourceName = defaultSource;
      if (typeof item.source === 'string') {
        sourceName = item.source;
      } else if (item.source && item.source['#text']) {
        sourceName = item.source['#text'];
      } else if (item.title && item.title.includes(' - ')) {
        const parts = item.title.split(' - ');
        sourceName = parts[parts.length - 1].trim();
      }

      return {
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate || '',
        source: sourceName
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Aggregates fresh, relevant news from free public RSS feeds
 */
export async function getMarketNews(assetInfo, maxArticles = 4) {
  const query = assetInfo.name && assetInfo.name !== assetInfo.symbol
    ? `${assetInfo.name} ${assetInfo.symbol}`
    : assetInfo.symbol;

  const cacheKey = `news:${assetInfo.symbol.toUpperCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const rawArticles = [];

  // 1. NewsAPI (if configured) for premium real-time structured headlines
  if (config.newsApiKey) {
    try {
      const newsApiQuery = assetInfo.type === 'crypto'
        ? (assetInfo.name || assetInfo.baseSymbol || assetInfo.symbol)
        : (assetInfo.name || assetInfo.symbol);

      const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(newsApiQuery)}&language=en&sortBy=publishedAt&pageSize=8&apiKey=${encodeURIComponent(config.newsApiKey)}`;
      const res = await fetch(newsApiUrl, {
        headers: { 'User-Agent': 'MarketIntelBot/1.0' },
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.articles)) {
          for (const a of data.articles) {
            if (a.title && a.url) {
              rawArticles.push({
                title: a.title,
                link: a.url,
                pubDate: a.publishedAt,
                source: a.source?.name || 'NewsAPI'
              });
            }
          }
        }
      }
    } catch (err) {
      // Non-fatal, fall through to RSS
    }
  }

  // 2. Google News RSS Feed (broadest coverage, real-time)
  try {
    const searchQuery = assetInfo.type === 'crypto'
      ? `${assetInfo.baseSymbol || assetInfo.symbol} crypto market`
      : `${assetInfo.symbol} stock`;

    const gNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(gNewsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const xml = await res.text();
      const parsed = parseRssFeed(xml, 'Google News');
      rawArticles.push(...parsed);
    }
  } catch (err) {
    // Non-fatal
  }

  // 3. Yahoo Finance RSS Feed for Equities and ETFs
  if (assetInfo.type === 'equity' || assetInfo.type === 'etf') {
    try {
      const yRssUrl = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(assetInfo.symbol)}`;
      const res = await fetch(yRssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (res.ok) {
        const xml = await res.text();
        const parsed = parseRssFeed(xml, 'Yahoo Finance');
        rawArticles.push(...parsed);
      }
    } catch (err) {
      // Non-fatal
    }
  }

  // Deduplicate and select top articles
  const deduplicated = deduplicateNews(rawArticles, maxArticles);

  cache.set(cacheKey, deduplicated, config.newsCacheTtlSeconds);
  return deduplicated;
}
