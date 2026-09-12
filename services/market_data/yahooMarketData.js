import { cache } from '../../cache/cacheManager.js';

let cachedCrumb = null;
let cachedCookie = null;
let crumbExpiry = 0;

/**
 * Safely fetches Yahoo crumb & cookie for optional metadata enrichment.
 * Gracefully returns null if blocked, ensuring zero hard dependency.
 */
async function getCrumbAndCookie() {
  if (cachedCrumb && cachedCookie && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  try {
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(3000)
    });

    const setCookie = cookieRes.headers.get('set-cookie');
    if (!setCookie) return null;

    const cookie = setCookie.split(';')[0];
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookie
      },
      signal: AbortSignal.timeout(3000)
    });

    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('<html')) return null;

    cachedCrumb = crumb;
    cachedCookie = cookie;
    crumbExpiry = Date.now() + 12 * 3600 * 1000; // 12 hours
    return { crumb, cookie };
  } catch (e) {
    return null;
  }
}

/**
 * Primary Market Quote fetcher using Yahoo Finance Chart API (v8).
 * 100% free, zero authentication required, fast and resilient.
 */
export async function getYahooMarketQuote(symbol) {
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(chartUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`Chart API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.meta) {
      throw new Error(`No chart result for ${symbol}`);
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice ?? meta.chartPreviousClose;
    const prevClose = meta.chartPreviousClose ?? currentPrice;
    const changePercent = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const changeUSD = currentPrice - prevClose;

    const baseQuote = {
      symbol: meta.symbol || symbol,
      name: meta.longName || meta.shortName || meta.symbol || symbol,
      currency: meta.currency || 'USD',
      price: currentPrice,
      prevClose: prevClose,
      changePercent: parseFloat(changePercent.toFixed(2)),
      changeUSD: parseFloat(changeUSD.toFixed(2)),
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      instrumentType: (meta.instrumentType || 'EQUITY').toUpperCase(),
      exchange: meta.exchangeName || '',
      marketCap: null,
      earningsDate: null
    };

    // Optional enrichment: Try to fetch marketCap and calendarEvents via crumb
    try {
      const auth = await getCrumbAndCookie();
      if (auth) {
        const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,calendarEvents&crumb=${encodeURIComponent(auth.crumb)}`;
        const sumRes = await fetch(summaryUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': auth.cookie
          },
          signal: AbortSignal.timeout(3000)
        });

        if (sumRes.ok) {
          const sumData = await sumRes.json();
          const summary = sumData?.quoteSummary?.result?.[0];
          if (summary) {
            if (summary.summaryDetail?.marketCap?.raw) {
              baseQuote.marketCap = summary.summaryDetail.marketCap.raw;
            }
            const earningsDates = summary.calendarEvents?.earnings?.earningsDate;
            if (Array.isArray(earningsDates) && earningsDates.length > 0) {
              baseQuote.earningsDate = earningsDates[0].fmt || null;
            }
          }
        }
      }
    } catch {
      // Enrichment failed, proceed with base quote
    }

    cache.set(cacheKey, baseQuote, 45); // 45 seconds cache
    return baseQuote;
  } catch (err) {
    console.error(`Error fetching Yahoo quote for ${symbol}:`, err.message);
    return null;
  }
}
