import { cache } from '../../cache/cacheManager.js';

// Pre-mapped high-frequency symbols, cryptocurrencies, indices, and commodities
const STATIC_ALIASES = {
  // Cryptos
  'BTC': { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', baseSymbol: 'BTC' },
  'BITCOIN': { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', baseSymbol: 'BTC' },
  'ETH': { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', baseSymbol: 'ETH' },
  'ETHEREUM': { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', baseSymbol: 'ETH' },
  'SOL': { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', baseSymbol: 'SOL' },
  'SOLANA': { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', baseSymbol: 'SOL' },
  'DOGE': { symbol: 'DOGE-USD', name: 'Dogecoin', type: 'crypto', baseSymbol: 'DOGE' },
  'DOGECOIN': { symbol: 'DOGE-USD', name: 'Dogecoin', type: 'crypto', baseSymbol: 'DOGE' },
  'XRP': { symbol: 'XRP-USD', name: 'XRP', type: 'crypto', baseSymbol: 'XRP' },
  'RIPPLE': { symbol: 'XRP-USD', name: 'XRP', type: 'crypto', baseSymbol: 'XRP' },
  'BNB': { symbol: 'BNB-USD', name: 'BNB', type: 'crypto', baseSymbol: 'BNB' },
  'ADA': { symbol: 'ADA-USD', name: 'Cardano', type: 'crypto', baseSymbol: 'ADA' },
  'CARDANO': { symbol: 'ADA-USD', name: 'Cardano', type: 'crypto', baseSymbol: 'ADA' },

  // Common Company Names
  'NVIDIA': { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'equity' },
  'TESLA': { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'equity' },
  'APPLE': { symbol: 'AAPL', name: 'Apple Inc.', type: 'equity' },
  'MICROSOFT': { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'equity' },
  'AMAZON': { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'equity' },
  'GOOGLE': { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'equity' },

  // Commodities
  'GOLD': { symbol: 'GC=F', name: 'Gold Futures', type: 'commodity' },
  'XAU': { symbol: 'GC=F', name: 'Gold Futures', type: 'commodity' },
  'SILVER': { symbol: 'SI=F', name: 'Silver Futures', type: 'commodity' },
  'XAG': { symbol: 'SI=F', name: 'Silver Futures', type: 'commodity' },
  'OIL': { symbol: 'CL=F', name: 'Crude Oil (WTI)', type: 'commodity' },
  'CRUDE': { symbol: 'CL=F', name: 'Crude Oil (WTI)', type: 'commodity' },
  'WTI': { symbol: 'CL=F', name: 'Crude Oil (WTI)', type: 'commodity' },
  'BRENT': { symbol: 'BZ=F', name: 'Brent Crude', type: 'commodity' },
  'NATGAS': { symbol: 'NG=F', name: 'Natural Gas', type: 'commodity' },

  // Indices
  'SPX': { symbol: '^GSPC', name: 'S&P 500', type: 'index' },
  'S&P 500': { symbol: '^GSPC', name: 'S&P 500', type: 'index' },
  'S&P500': { symbol: '^GSPC', name: 'S&P 500', type: 'index' },
  'S&P': { symbol: '^GSPC', name: 'S&P 500', type: 'index' },
  'NDX': { symbol: '^IXIC', name: 'Nasdaq Composite', type: 'index' },
  'NASDAQ': { symbol: '^IXIC', name: 'Nasdaq Composite', type: 'index' },
  'DOW': { symbol: '^DJI', name: 'Dow Jones Industrial Average', type: 'index' },
  'DJI': { symbol: '^DJI', name: 'Dow Jones Industrial Average', type: 'index' },
  'VIX': { symbol: '^VIX', name: 'CBOE Volatility Index', type: 'index' },
  'RUT': { symbol: '^RUT', name: 'Russell 2000', type: 'index' },
  'RUSSELL': { symbol: '^RUT', name: 'Russell 2000', type: 'index' }
};

/**
 * Normalizes Yahoo quoteType to unified asset type
 */
function mapAssetType(quoteType, symbol) {
  if (!quoteType) return 'equity';
  const t = quoteType.toUpperCase();
  if (t === 'CRYPTOCURRENCY' || symbol.endsWith('-USD')) return 'crypto';
  if (t === 'ETF') return 'etf';
  if (t === 'INDEX') return 'index';
  if (t === 'FUTURE' || t === 'COMMODITY') return 'commodity';
  return 'equity';
}

/**
 * Dynamically resolves any user query (ticker, company name, crypto, commodity, index)
 */
export async function resolveSymbol(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { resolved: false, reason: 'empty_query' };
  }

  const cleanQuery = rawQuery.trim();
  const normalizedKey = cleanQuery.toUpperCase();

  // 1. Check in-memory cache
  const cacheKey = `resolver:${normalizedKey}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 2. Check Static Aliases
  if (STATIC_ALIASES[normalizedKey]) {
    const asset = {
      ...STATIC_ALIASES[normalizedKey],
      originalQuery: cleanQuery,
      resolved: true,
      confidence: 1.0
    };
    cache.set(cacheKey, asset, 86400); // cache for 24h
    return asset;
  }

  // 3. Query Yahoo Finance Search API
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}&quotesCount=8&newsCount=0`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`Search HTTP ${res.status}`);
    }

    const data = await res.json();
    const quotes = (data.quotes || []).filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'INDEX' || q.quoteType === 'FUTURE'));

    if (quotes.length === 0) {
      return {
        resolved: false,
        query: cleanQuery,
        reason: 'not_found'
      };
    }

    // Exact symbol match check
    const exactSymbolMatch = quotes.find(q => q.symbol.toUpperCase() === normalizedKey || q.symbol.toUpperCase() === `${normalizedKey}-USD`);
    const topQuote = exactSymbolMatch || quotes[0];

    const mappedType = mapAssetType(topQuote.quoteType, topQuote.symbol);
    const resolvedAsset = {
      resolved: true,
      symbol: topQuote.symbol,
      name: topQuote.longname || topQuote.shortname || topQuote.symbol,
      exchange: topQuote.exchange || topQuote.exchDisp || '',
      type: mappedType,
      originalQuery: cleanQuery,
      baseSymbol: topQuote.symbol.replace('-USD', ''),
      confidence: exactSymbolMatch ? 1.0 : 0.85,
      otherMatches: quotes.slice(1, 4).map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: mapAssetType(q.quoteType, q.symbol)
      }))
    };

    cache.set(cacheKey, resolvedAsset, 3600); // 1 hour cache
    return resolvedAsset;
  } catch (err) {
    // Fallback: If network search fails, try as raw uppercase symbol
    return {
      resolved: true,
      symbol: normalizedKey,
      name: normalizedKey,
      type: normalizedKey.includes('-USD') ? 'crypto' : 'equity',
      originalQuery: cleanQuery,
      confidence: 0.5,
      fallback: true
    };
  }
}
