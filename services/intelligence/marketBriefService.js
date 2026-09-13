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
    const prompt = `You are a chief investment officer and plain-English market communicator.
Write an intelligent, layered daily market briefing for normal investors.
CRITICAL GOAL: Prioritize INTERPRETATION and NARRATIVE over merely repeating numbers.
The user wants to know: "So what does this actually mean today?"

VERIFIED MARKET DATA:
${marketSummary}
Detected Regime: ${regimeInfo.regime}
Significant Outliers (>1.5% move): ${regimeInfo.significantMoves.length > 0 ? JSON.stringify(regimeInfo.significantMoves) : 'None, markets are mostly flat/range-bound'}

VERIFIED RECENT HEADLINES:
${headlines || 'No major breaking developments.'}

VERIFIED UPCOMING MACRO EVENTS:
${catalysts}

CRITICAL RULES:
1. Ground every claim strictly in the real data above.
2. If markets or assets are flat (e.g. BTC ~0.0%), describe the consolidation honestly. E.g.: "Risk assets are modestly stronger today, but crypto isn't participating meaningfully. The bigger signal is the divergence between equities and crypto."
3. Distinguish between:
   - FACT: What the data directly shows.
   - INFERENCE: What that evidence reasonably suggests ("The data suggests...", "What stands out is...").
   - SPECULATION / CAVEAT: What to watch ("The important caveat is..."). Never present speculation as fact.
4. STRUCTURE YOUR OUTPUT EXACTLY LIKE THIS:
   **Quick Take**
   (1-2 clear, punchy sentences in plain English summarizing today's primary cross-asset theme)

   **What the Tape is Telling Us**
   (2-3 bullet points analyzing cross-asset divergence, leadership, or liquidity flows without financial jargon)

   **So What Does This Mean for Investors?**
   (1-2 grounded sentences on what the observed cross-asset price behavior actually indicates. NEVER provide generic fortune-cookie trading advice like 'chasing breakouts carries elevated false-start risk' or 'manage your risk'. Focus solely on what the cross-asset relationship implies)`;

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

  // Resilient deterministic interpretation fallback
  const spQ = quotes['^GSPC'];
  const btcQ = quotes['BTC-USD'];
  const dxyQ = quotes['DX-Y.NYB'];

  const lines = [];
  // 1. Quick Take
  if (spQ && btcQ && spQ.changePercent > 0.5 && Math.abs(btcQ.changePercent) < 0.4) {
    lines.push(`**Quick Take**\nEquities are moving higher today while Bitcoin is essentially flat (+${btcQ.changePercent.toFixed(2)}%). The primary observation is cross-asset divergence between traditional equities and crypto.`);
  } else if (regimeInfo.regime.includes('Consolidation')) {
    lines.push(`**Quick Take**\nMajor asset classes are trading within narrow intraday ranges, showing flat performance across both crypto and equity indices.`);
  } else {
    lines.push(`**Quick Take**\nMarkets are exhibiting a ${regimeInfo.regime.toLowerCase()} pattern based on today's cross-asset returns.`);
  }

  // 2. What the Tape is Telling Us
  lines.push(`\n**What the Tape is Telling Us**`);
  if (spQ && btcQ && Math.abs(spQ.changePercent - btcQ.changePercent) > 0.8) {
    lines.push(`• **Equity vs Crypto Divergence**: S&P 500 (${spQ.changePercent >= 0 ? '+' : ''}${spQ.changePercent.toFixed(2)}%) is advancing while Bitcoin (${btcQ.changePercent >= 0 ? '+' : ''}${btcQ.changePercent.toFixed(2)}%) remains unchanged, showing lack of co-movement today.`);
  } else {
    lines.push(`• **Compressed Daily Returns**: Key benchmark changes remain below 0.5%, indicating range-bound trading.`);
  }
  if (dxyQ) {
    lines.push(`• **US Dollar Index**: DXY is at ${dxyQ.price} (${dxyQ.changePercent >= 0 ? '+' : ''}${dxyQ.changePercent.toFixed(2)}%), indicating modest currency movement.`);
  }

  // 3. So What Does This Mean?
  lines.push(`\n**So What Does This Mean for Investors?**\n• The data suggests selective asset behavior rather than a broad market-wide trend. Without strong directional confirmation across multiple asset classes, historical precedent favors waiting for catalyst confirmation.`);

  return lines.join('\n');
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
