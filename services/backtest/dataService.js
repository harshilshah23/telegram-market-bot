import { cache } from '../../cache/cacheManager.js';

function formatYahooSymbol(symbol) {
  const s = symbol.toUpperCase().trim();
  if (['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'BNB', 'ADA'].includes(s)) {
    return `${s}-USD`;
  }
  return s;
}

export async function fetchHistoricalData(symbol, period = '5y', interval = '1d') {
  const yahooSym = formatYahooSymbol(symbol);
  const cacheKey = `hist:${yahooSym}:${period}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance historical HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) {
      throw new Error(`No historical bars returned for ${symbol}`);
    }

    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote || !quote.close) {
      throw new Error(`Missing quote indicators for ${symbol}`);
    }

    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i] || 0;

      // Filter out null or NaN bars
      if (typeof close === 'number' && !isNaN(close) && close > 0) {
        bars.push({
          time: timestamps[i],
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: typeof open === 'number' && !isNaN(open) ? open : close,
          high: typeof high === 'number' && !isNaN(high) ? high : close,
          low: typeof low === 'number' && !isNaN(low) ? low : close,
          close: close,
          volume: volume
        });
      }
    }

    if (bars.length < 30) {
      throw new Error(`Insufficient historical data for ${symbol} (${bars.length} bars)`);
    }

    cache.set(cacheKey, bars, 3600); // 1 hour cache
    return bars;
  } catch (err) {
    console.error(`Historical data fetch error for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Fetches historical bars for a specific date window using period1 & period2
 */
export async function fetchHistoricalWindow(symbol, startTs, endTs, interval = '1d') {
  const yahooSym = formatYahooSymbol(symbol);
  const cacheKey = `hist_win:${yahooSym}:${startTs}:${endTs}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?period1=${startTs}&period2=${endTs}&interval=${encodeURIComponent(interval)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance window HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) return null;

    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote || !quote.close) return null;

    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i] || 0;

      if (typeof close === 'number' && !isNaN(close) && close > 0) {
        bars.push({
          time: timestamps[i],
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: typeof open === 'number' && !isNaN(open) ? open : close,
          high: typeof high === 'number' && !isNaN(high) ? high : close,
          low: typeof low === 'number' && !isNaN(low) ? low : close,
          close: close,
          volume: volume
        });
      }
    }

    cache.set(cacheKey, bars, 86400); // 24 hour cache for historical static windows
    return bars;
  } catch (err) {
    console.error(`Historical window fetch error for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Synchronizes bars for multi-asset strategies (e.g. QQQ signal + BTC traded)
 * Ensures every bar index i represents the exact same trading day
 */
export async function fetchMultiAssetData(tradedSymbol, signalSymbol, period = '5y', interval = '1d') {
  if (tradedSymbol.toUpperCase() === signalSymbol.toUpperCase()) {
    const bars = await fetchHistoricalData(tradedSymbol, period, interval);
    if (!bars) return null;
    return { tradedBars: bars, signalBars: bars };
  }

  const [tradedBars, signalBars] = await Promise.all([
    fetchHistoricalData(tradedSymbol, period, interval),
    fetchHistoricalData(signalSymbol, period, interval)
  ]);

  if (!tradedBars || !signalBars) return null;

  // Build map of signal bars by date string
  const signalMap = new Map();
  for (const b of signalBars) {
    signalMap.set(b.date, b);
  }

  const alignedTraded = [];
  const alignedSignal = [];

  for (const tb of tradedBars) {
    if (signalMap.has(tb.date)) {
      alignedTraded.push(tb);
      alignedSignal.push(signalMap.get(tb.date));
    }
  }

  if (alignedTraded.length < 30) {
    return null;
  }

  return {
    tradedBars: alignedTraded,
    signalBars: alignedSignal
  };
}
