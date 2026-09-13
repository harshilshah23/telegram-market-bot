import { getYahooMarketQuote } from '../market_data/yahooMarketData.js';
import { getMarketNews } from '../news/newsAggregator.js';
import { getUpcomingMacroEvents } from '../events/macroEvents.js';
import { cache } from '../../cache/cacheManager.js';
import { config } from '../../config/index.js';

export const BRIEF_ASSETS = [
  { symbol: 'BTC-USD', label: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH-USD', label: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: '^GSPC', label: 'S&P 500', name: 'S&P 500', type: 'index' },
  { symbol: '^IXIC', label: 'Nasdaq', name: 'Nasdaq Composite', type: 'index' },
  { symbol: 'GC=F', label: 'Gold', name: 'Gold Futures', type: 'commodity' },
  { symbol: 'DX-Y.NYB', label: 'DXY', name: 'US Dollar Index', type: 'index' }
];

/**
 * Intelligent regime detector
 */
function evaluateMarketRegime(quotes) {
  const btcQ = quotes['BTC-USD'];
  const spQ = quotes['^GSPC'];
  const dxyQ = quotes['DX-Y.NYB'];

  const btcChg = btcQ?.changePercent || 0;
  const spChg = spQ?.changePercent || 0;
  const dxyChg = dxyQ?.changePercent || 0;

  const significantMoves = [];
  for (const asset of BRIEF_ASSETS) {
    const q = quotes[asset.symbol];
    if (q && Math.abs(q.changePercent) >= 1.5) {
      significantMoves.push({ label: asset.label, change: q.changePercent });
    }
  }

  let regime = 'Quiet Consolidation';
  if (spChg > 0.8 && btcChg > 1.0) regime = 'Broad Risk-On';
  else if (spChg < -0.8 && btcChg < -1.0) regime = 'Defensive Risk-Off';
  else if (dxyChg > 0.4 && spChg < 0) regime = 'Dollar Strength Pressuring Risk';
  else if (Math.abs(btcChg) < 0.5 && Math.abs(spChg) < 0.5) regime = 'Low Volatility Consolidation';

  return { regime, significantMoves };
}

async function generateBriefEditorial(quotes, topNews, macroEvents, regimeInfo) {
  const marketSummary = BRIEF_ASSETS.map(a => {
    const q = quotes[a.symbol];
    if (!q) return `${a.label}: N/A`;
    return `${a.label}: $${q.price} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent?.toFixed(2)}%)`;
  }).join(', ');

  const headlines = topNews.slice(0, 4).map(n => `- ${n.title} (${n.source})`).join('\n');
  const catalysts = macroEvents.slice(0, 3).map(e => 
    `- ${e.title} (Verified calendar date: ${e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
  ).join('\n');

  if (config.hasLLM && config.hasOpenRouter) {
    const prompt = `You are a chief investment officer. Write an intelligent, dynamic daily market brief.
Do NOT force every asset into a cookie-cutter template. Focus on what ACTUALLY MATTERS today based on real data.

MARKET METRICS:
${marketSummary}
Detected Regime: ${regimeInfo.regime}
Significant Outliers (>1.5% move): ${regimeInfo.significantMoves.length > 0 ? JSON.stringify(regimeInfo.significantMoves) : 'None, markets are mostly flat/range-bound'}

VERIFIED HEADLINES:
${headlines || 'No major breaking developments.'}

VERIFIED UPCOMING MACRO EVENTS (DO NOT INVENT DATES):
${catalysts}

TASK:
Write:
1. **WHAT MATTERS TODAY**: 2-3 sentences diagnosing the overarching cross-asset narrative (e.g. why risk appetite is paused or what liquidity flows dominate).
2. **KEY WATCH LEVELS & UPCOMING CATALYSTS**: Highlight the most critical pivots and upcoming confirmed events.

RULES:
- Never manufacture excitement if the market is quiet. State consolidation when true.
- Strictly use only verified catalyst dates from above.`;

    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/harshilshah23/telegram-market-bot',
          'X-Title': 'Telegram Market Bot'
        },
        body: JSON.stringify({
          model: config.openRouterModel || 'inclusionai/ling-3.0-flash-fin:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 30) return text;
      }
    } catch (e) {
      console.warn('[Brief Service] LLM editorial fallback:', e.message);
    }
  }

  // Fallback
  return `**WHAT MATTERS TODAY**\n${regimeInfo.regime}: Markets are consolidating within tight intraday bands. Capital is waiting on key macro prints rather than aggressively taking directional risk.\n\n**KEY WATCH LEVELS**\n• BTC: Monitoring immediate support at $77,000.\n• S&P 500: Holding above short-term technical averages.`;
}

export async function getDailyMarketBrief() {
  const cacheKey = 'market:daily_brief';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const quotePromises = BRIEF_ASSETS.map(async (asset) => {
    try {
      const q = await getYahooMarketQuote(asset.symbol);
      return { symbol: asset.symbol, quote: q };
    } catch {
      return { symbol: asset.symbol, quote: null };
    }
  });

  const newsPromise = (async () => {
    try {
      const [cryptoNews, macroNews] = await Promise.all([
        getMarketNews({ symbol: 'BTC', name: 'Bitcoin' }, 4),
        getMarketNews({ symbol: 'SPY', name: 'Stock Market' }, 4)
      ]);
      const combined = [...cryptoNews, ...macroNews];
      const seen = new Set();
      return combined.filter(item => {
        const key = item.title.toLowerCase().slice(0, 30);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 4);
    } catch {
      return [];
    }
  })();

  const macroEvents = getUpcomingMacroEvents(new Date()).slice(0, 3);
  const [quoteResults, topNews] = await Promise.all([
    Promise.all(quotePromises),
    newsPromise
  ]);

  const quotes = {};
  for (const r of quoteResults) {
    quotes[r.symbol] = r.quote;
  }

  const regimeInfo = evaluateMarketRegime(quotes);
  const editorial = await generateBriefEditorial(quotes, topNews, macroEvents, regimeInfo);

  const result = {
    timestamp: new Date().toUTCString(),
    quotes,
    regimeInfo,
    topNews,
    macroEvents,
    editorial
  };

  cache.set(cacheKey, result, 120);
  return result;
}
