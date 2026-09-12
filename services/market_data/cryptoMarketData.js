import { cache } from '../../cache/cacheManager.js';

/**
 * Fetches global crypto market metrics (BTC/ETH dominance, total market cap)
 */
export async function getGlobalCryptoMetrics() {
  const cacheKey = 'crypto:global_metrics';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      const btcDominance = data?.data?.market_cap_percentage?.btc;
      const ethDominance = data?.data?.market_cap_percentage?.eth;
      const totalMarketCap = data?.data?.total_market_cap?.usd;
      const totalVolume24h = data?.data?.total_volume?.usd;

      const metrics = {
        btcDominance: btcDominance ? parseFloat(btcDominance.toFixed(1)) : null,
        ethDominance: ethDominance ? parseFloat(ethDominance.toFixed(1)) : null,
        totalMarketCap,
        totalVolume24h
      };

      cache.set(cacheKey, metrics, 600); // 10 min cache
      return metrics;
    }
  } catch (err) {
    // Non-fatal, return nulls
  }

  return { btcDominance: null, ethDominance: null, totalMarketCap: null, totalVolume24h: null };
}

/**
 * Fetches real-time 24h ticker data from Binance Public API
 */
export async function getBinance24hTicker(baseSymbol) {
  const cleanSymbol = baseSymbol.toUpperCase().replace('-USD', '');
  const pair = `${cleanSymbol}USDT`;
  const cacheKey = `crypto:binance:${pair}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const d = await res.json();
      const ticker = {
        price: parseFloat(d.lastPrice),
        change24h: parseFloat(d.priceChangePercent),
        high24h: parseFloat(d.highPrice),
        low24h: parseFloat(d.lowPrice),
        volumeUSD: parseFloat(d.quoteVolume),
        volumeBase: parseFloat(d.volume),
        source: 'Binance'
      };
      cache.set(cacheKey, ticker, 30); // 30s cache
      return ticker;
    }
  } catch (err) {
    // Fall back to Yahoo Chart data
  }
  return null;
}
