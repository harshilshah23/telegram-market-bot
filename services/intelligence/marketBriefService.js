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

async function generateBriefEditorial(quotes, topNews, macroEvents) {
  if (config.hasLLM) {
    const marketSummary = BRIEF_ASSETS.map(a => {
      const q = quotes[a.symbol];
      if (!q) return `${a.label}: N/A`;
      return `${a.label}: $${q.price} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent?.toFixed(2)}%)`;
    }).join(', ');

    const headlines = topNews.slice(0, 4).map(n => `- ${n.title} (${n.source})`).join('\n');
    const catalysts = macroEvents.slice(0, 3).map(e => `- ${e.title}`).join('\n');

    const prompt = `You are a chief market strategist at an institutional desk.
Analyze today's market overview:
PRICES & PERFORMANCE: ${marketSummary}

TOP HEADLINES:
${headlines || 'No major headlines.'}

UPCOMING CATALYSTS:
${catalysts || 'None scheduled.'}

TASK:
Provide:
1. WHAT MATTERS TODAY (2-3 concise sentences explaining the dominant theme driving risk appetite across crypto, equities, and commodities).
2. KEY WATCH LEVELS (2 bullet points on critical support/resistance or pivot levels to monitor).

STRICT RULES:
- Ground in facts, neutral institutional tone.
- Do NOT give financial advice. No hype. Keep it concise.`;

    try {
      if (config.hasOpenRouter) {
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
            temperature: 0.2
          }),
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content?.trim();
          if (text && text.length > 30) return text;
        }
      }
    } catch (e) {
      console.warn('[Brief Service] LLM brief fallback:', e.message);
    }
  }

  const btcQ = quotes['BTC-USD'];
  const spQ = quotes['^GSPC'];
  const dxyQ = quotes['DX-Y.NYB'];

  let theme = 'Markets are consolidating with selective risk flows across equities and digital assets.';
  if (btcQ && spQ) {
    if (btcQ.changePercent > 1 && spQ.changePercent > 0.5) {
      theme = 'Broad risk-on sentiment is prevailing across equities and digital assets, supported by constructive macro flows.';
    } else if (btcQ.changePercent < -1 && spQ.changePercent < -0.5) {
      theme = 'Risk-off sentiment is pressuring equities and crypto assets, with capital showing defensiveness.';
    } else if (dxyQ && dxyQ.changePercent > 0.3) {
      theme = 'US Dollar strength is creating headwinds across risk assets and commodities, keeping intraday momentum subdued.';
    }
  }

  const btcPrice = btcQ?.price ? `$${Math.round(btcQ.price).toLocaleString('en-US')}` : 'Key pivots';
  const spPrice = spQ?.price ? `$${Math.round(spQ.price).toLocaleString('en-US')}` : '50 EMA';

  return `<b>WHAT MATTERS TODAY</b>\n${theme}\n\n<b>KEY WATCH LEVELS</b>\n• BTC: Monitoring immediate support at ${btcPrice} with intraday momentum indicators.\n• S&P 500: Watching ${spPrice} as the short-term technical benchmark.`;
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
        getMarketNews({ symbol: 'BTC', name: 'Bitcoin' }, 3),
        getMarketNews({ symbol: 'SPY', name: 'Stock Market' }, 3)
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

  const editorial = await generateBriefEditorial(quotes, topNews, macroEvents);

  const result = {
    timestamp: new Date().toUTCString(),
    quotes,
    topNews,
    macroEvents,
    editorial
  };

  cache.set(cacheKey, result, 120);
  return result;
}
