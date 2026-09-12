import { cache } from '../../cache/cacheManager.js';

/**
 * Calculates Exponential Moving Average (EMA)
 */
function calcEMA(prices, period) {
  if (!Array.isArray(prices) || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * k + ema;
  }
  return ema;
}

/**
 * Calculates Relative Strength Index (RSI 14)
 */
function calcRSI(prices, period = 14) {
  if (!Array.isArray(prices) || prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Evaluates bias from price, EMA, and RSI
 */
function evaluateBias(lastPrice, ema20, rsi) {
  const rsiVal = rsi !== null ? parseFloat(rsi.toFixed(1)) : null;

  if (rsiVal === null && ema20 === null) {
    return { bias: 'Neutral', emoji: '⚪', label: 'Consolidating' };
  }

  const isAboveEma = ema20 !== null ? lastPrice >= ema20 : null;

  if ((rsiVal !== null && rsiVal >= 60) || (isAboveEma === true && (rsiVal === null || rsiVal >= 52))) {
    const note = isAboveEma ? '> 20 EMA' : 'Momentum up';
    return {
      bias: 'Bullish',
      emoji: '🟢',
      rsi: rsiVal,
      note
    };
  } else if ((rsiVal !== null && rsiVal <= 40) || (isAboveEma === false && (rsiVal === null || rsiVal <= 48))) {
    const note = isAboveEma === false ? '< 20 EMA' : 'Easing';
    return {
      bias: 'Bearish',
      emoji: '🔴',
      rsi: rsiVal,
      note
    };
  } else {
    return {
      bias: 'Neutral',
      emoji: '⚪',
      rsi: rsiVal,
      note: 'Range-bound'
    };
  }
}

/**
 * Fetches Crypto candles from Binance
 */
async function fetchBinanceKlines(pair, interval) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=50`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map(k => parseFloat(k[4])); // index 4 is close price
  } catch {
    return null;
  }
}

/**
 * Fetches Equity / ETF candles from Yahoo Finance Chart API
 */
async function fetchYahooCloses(symbol, interval, range) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return null;
    return closes.filter(c => typeof c === 'number' && !isNaN(c));
  } catch {
    return null;
  }
}

/**
 * Computes Technical Analysis metrics across 1h, 4h, 24h, 1w timeframes
 */
export async function getTechnicalAnalysis(assetInfo) {
  const symbol = assetInfo.symbol;
  const cacheKey = `ta:${symbol.toUpperCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const isCrypto = assetInfo.type === 'crypto';
  const binancePair = isCrypto ? `${(assetInfo.baseSymbol || symbol).replace('-USD', '').toUpperCase()}USDT` : null;

  const taResult = {
    '1h': null,
    '4h': null,
    '24h': null,
    '1w': null
  };

  try {
    if (isCrypto && binancePair) {
      // Concurrently fetch Binance intervals
      const [k1h, k4h, k1d, k1w] = await Promise.all([
        fetchBinanceKlines(binancePair, '1h'),
        fetchBinanceKlines(binancePair, '4h'),
        fetchBinanceKlines(binancePair, '1d'),
        fetchBinanceKlines(binancePair, '1w')
      ]);

      if (k1h && k1h.length >= 15) {
        const last = k1h[k1h.length - 1];
        taResult['1h'] = evaluateBias(last, calcEMA(k1h, 20), calcRSI(k1h, 14));
      }
      if (k4h && k4h.length >= 15) {
        const last = k4h[k4h.length - 1];
        taResult['4h'] = evaluateBias(last, calcEMA(k4h, 20), calcRSI(k4h, 14));
      }
      if (k1d && k1d.length >= 15) {
        const last = k1d[k1d.length - 1];
        taResult['24h'] = evaluateBias(last, calcEMA(k1d, 20), calcRSI(k1d, 14));
      }
      if (k1w && k1w.length >= 15) {
        const last = k1w[k1w.length - 1];
        taResult['1w'] = evaluateBias(last, calcEMA(k1w, 20), calcRSI(k1w, 14));
      }
    } else {
      // Equities, ETFs, Indices via Yahoo Chart
      const [c1h, c1d, c1w] = await Promise.all([
        fetchYahooCloses(symbol, '1h', '5d'),
        fetchYahooCloses(symbol, '1d', '3mo'),
        fetchYahooCloses(symbol, '1wk', '1y')
      ]);

      if (c1h && c1h.length >= 15) {
        const last = c1h[c1h.length - 1];
        taResult['1h'] = evaluateBias(last, calcEMA(c1h, 20), calcRSI(c1h, 14));
        // Synthesize 4h from 1h closes if available
        const c4h = c1h.filter((_, i) => i % 4 === 0);
        if (c4h.length >= 10) {
          taResult['4h'] = evaluateBias(last, calcEMA(c4h, 10), calcRSI(c4h, 8));
        }
      }

      if (c1d && c1d.length >= 15) {
        const last = c1d[c1d.length - 1];
        taResult['24h'] = evaluateBias(last, calcEMA(c1d, 20), calcRSI(c1d, 14));
      }

      if (c1w && c1w.length >= 15) {
        const last = c1w[c1w.length - 1];
        taResult['1w'] = evaluateBias(last, calcEMA(c1w, 20), calcRSI(c1w, 14));
      }
    }
  } catch (err) {
    // Non-fatal
  }

  cache.set(cacheKey, taResult, 60); // 60s cache
  return taResult;
}
