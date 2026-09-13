import { resolveSymbol } from '../resolver/symbolResolver.js';
import { getYahooMarketQuote } from '../market_data/yahooMarketData.js';
import { getMarketNews } from '../news/newsAggregator.js';
import { getUpcomingMacroEvents } from '../events/macroEvents.js';
import { config } from '../../config/index.js';

// Lower-quality sources or speculative clickbait to deprioritize
const LOW_QUALITY_SOURCES = new Set([
  '24/7 wall st.', '247wallst', 'ambcrypto', 'cryptopotato', 'coingape', 'pluang'
]);

/**
 * Filter and rank news articles by relevance to the specific question and credibility
 */
function rankAndFilterNews(articles, question, assetSymbol) {
  const qTerms = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);

  const scored = articles.map(art => {
    let score = 0;
    const titleLower = (art.title || '').toLowerCase();
    const sourceLower = (art.source || '').toLowerCase();

    // Credible source bonus
    if (sourceLower.includes('reuters') || sourceLower.includes('bloomberg') || sourceLower.includes('wsj') || sourceLower.includes('financial times') || sourceLower.includes('cnbc') || sourceLower.includes('yahoo finance') || sourceLower.includes('coindesk')) {
      score += 5;
    }

    // Penalize low quality or clickbait sources
    for (const lq of LOW_QUALITY_SOURCES) {
      if (sourceLower.includes(lq)) {
        score -= 4;
        break;
      }
    }

    // Penalize irrelevant speculative themes (e.g. quantum computing wallets for intraday moves)
    if (titleLower.includes('quantum') || titleLower.includes('expose') || titleLower.includes('scam') || titleLower.includes('hack')) {
      score -= 6;
    }

    // Asset symbol match
    if (assetSymbol && titleLower.includes(assetSymbol.toLowerCase())) {
      score += 3;
    }

    // Question keywords match
    for (const term of qTerms) {
      if (titleLower.includes(term)) score += 2;
    }

    // Recency bonus: within 6 hours
    if (art.time && (art.time.includes('m ago') || art.time.includes('1h') || art.time.includes('2h') || art.time.includes('3h') || art.time.includes('4h'))) {
      score += 3;
    }

    return { article: art, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.article)
    .slice(0, 3);
}

export async function answerMarketQuestion(question) {
  const qLower = question.toLowerCase();

  // 1. Detect multi-asset comparison (e.g. "Is Ethereum outperforming Bitcoin?")
  let primaryAsset = null;
  let comparisonAsset = null;

  if (/\beth(ereum)?\b/.test(qLower) && /\bbtc|bitcoin\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('ETH');
    comparisonAsset = await resolveSymbol('BTC');
  } else if (/\b(btc|bitcoin)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('BTC');
  } else if (/\b(eth|ethereum|ether)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('ETH');
  } else if (/\b(sol|solana)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('SOL');
  } else if (/\b(nvda|nvidia)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('NVDA');
  } else if (/\b(tsla|tesla)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('TSLA');
  } else if (/\b(aapl|apple)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('AAPL');
  } else if (/\b(spy|s&p|spx|stock market|stocks)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('SPY');
  } else if (/\b(qqq|nasdaq|tech stocks)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('QQQ');
  } else if (/\b(gold|xau)\b/.test(qLower)) {
    primaryAsset = await resolveSymbol('GOLD');
  } else {
    const STOP_WORDS = new Set(['WHY', 'WHAT', 'WHEN', 'WHERE', 'WHO', 'HOW', 'IS', 'ARE', 'WAS', 'WERE', 'DO', 'DOES', 'DID', 'THE', 'A', 'AN', 'IN', 'ON', 'AT', 'TO', 'FOR', 'WITH', 'BY', 'ABOUT', 'DOWN', 'UP', 'TODAY', 'THIS', 'WEEK', 'MONTH', 'YEAR', 'RIGHT', 'NOW', 'DROP', 'FALL', 'RALLY', 'HIGH', 'LOW']);
    const words = question.replace(/[?,.!]/g, ' ').split(/\s+/);
    for (const w of words) {
      const clean = w.trim().toUpperCase();
      if (clean.length >= 2 && clean.length <= 6 && !STOP_WORDS.has(clean)) {
        const res = await resolveSymbol(clean);
        if (res) {
          primaryAsset = res;
          break;
        }
      }
    }
  }

  // 2. Fetch live quotes
  let primaryQuote = null;
  let comparisonQuote = null;

  if (primaryAsset) {
    try {
      primaryQuote = await getYahooMarketQuote(primaryAsset.symbol);
    } catch {}
  }
  if (comparisonAsset) {
    try {
      comparisonQuote = await getYahooMarketQuote(comparisonAsset.symbol);
    } catch {}
  }

  // 3. News fetch & quality filtering
  let rawNews = [];
  if (primaryAsset) {
    rawNews = await getMarketNews(primaryAsset, 8).catch(() => []);
  } else {
    rawNews = await getMarketNews({ symbol: 'SPY', name: 'Stock Market' }, 8).catch(() => []);
  }
  const filteredNews = rankAndFilterNews(rawNews, question, primaryAsset?.symbol);

  // 4. Macro Catalysts
  const catalysts = getUpcomingMacroEvents(new Date()).slice(0, 3);

  // 5. Evaluate False Premise (e.g. user asks "Why is X moving/crashing/surging today?" when it's flat)
  const isEssentiallyFlat = primaryQuote && Math.abs(primaryQuote.changePercent) < 0.4;
  const userAssumesBigMove = /(why.*(moving|falling|dropping|crashing|surging|pumping|soaring|tanking|dumping)|big move)/.test(qLower);

  // 6. Build LLM Grounding Context
  const quoteText = primaryQuote && primaryQuote.price !== undefined
    ? `${primaryAsset.name} (${primaryAsset.symbol}): Price $${primaryQuote.price}, 24h Change ${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}% (24h Range: $${primaryQuote.dayLow ?? 'N/A'} - $${primaryQuote.dayHigh ?? 'N/A'})`
    : 'Live quote unavailable';

  const compQuoteText = comparisonQuote && comparisonQuote.price !== undefined
    ? `${comparisonAsset.name} (${comparisonAsset.symbol}): Price $${comparisonQuote.price}, 24h Change ${comparisonQuote.changePercent >= 0 ? '+' : ''}${comparisonQuote.changePercent.toFixed(2)}%`
    : '';

  const headlinesText = filteredNews.length > 0
    ? filteredNews.map((n, i) => `[${i + 1}] "${n.title}" (${n.source}, ${n.time || 'recent'})`).join('\n')
    : 'No directly relevant news headlines identified.';

  const catalystsText = catalysts.map(c => 
    `- ${c.title} (Verified scheduled date: ${c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
  ).join('\n');

  const prompt = `You are a Wall Street research analyst and market intelligence assistant.
Answer the user's question with institutional accuracy and factual grounding.

USER QUESTION: "${question}"

VERIFIED REAL-TIME MARKET DATA:
- ${quoteText}
${compQuoteText ? `- ${compQuoteText}` : ''}

VERIFIED RECENT NEWS HEADLINES:
${headlinesText}

VERIFIED UPCOMING MACROECONOMIC CATALYSTS:
${catalystsText}

CRITICAL INSTRUCTIONS:
1. FALSE-PREMISE CHECK:
   ${isEssentiallyFlat && userAssumesBigMove ? `CRITICAL: The user is asking why the asset is moving or dropping, but the verified data shows ${primaryAsset.name} is ESSENTIALLY FLAT today (${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}%).
   You MUST state clearly at the very beginning: "${primaryAsset.symbol} is essentially flat today, so there is not a meaningful directional move to explain. The important story is current consolidation and the upcoming catalysts that could break it."
   DO NOT manufacture a causal narrative or blame loosely related news for a move that did not happen!` : 'Explain the actual performance based strictly on the verified numbers.'}

2. STRUCTURE YOUR RESPONSE:
   - **Observed Market Facts:** State real-time price, exact % move, and whether the asset is flat, outperforming, or consolidating.
   - **Supported Explanations vs Uncertainty:** If headlines support an explanation, state it citing the source (e.g. "according to [Source]"). If headlines are weak or speculative, state explicitly: "There is no verified single catalyst driving today's price action."
   - **Key Catalysts to Watch:** Detail the top upcoming watch items (use ONLY the verified catalyst dates provided above).

3. STRICT COMPLIANCE:
   - Do NOT invent macro event dates. Use strictly the verified dates given.
   - Do NOT give financial advice. No hype.`;

  let responseText = null;

  if (config.hasLLM && config.hasOpenRouter) {
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
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const data = await res.json();
        responseText = data?.choices?.[0]?.message?.content?.trim();
      }
    } catch (e) {
      console.warn('[QA Service] LLM call failed:', e.message);
    }
  }

  // Deterministic fallback
  if (!responseText) {
    const lines = [];
    if (isEssentiallyFlat && userAssumesBigMove) {
      lines.push(`**Observed Market Facts:** ${primaryAsset?.name || 'The asset'} is essentially flat today (${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}%), so there is no meaningful directional move to explain. The market is consolidating in a narrow range.`);
    } else if (primaryAsset && primaryQuote) {
      lines.push(`**Observed Market Facts:** ${primaryAsset.name} (${primaryAsset.symbol}) is trading at $${primaryQuote.price} (${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}%).`);
    }

    if (filteredNews.length > 0) {
      lines.push(`\n**Supported Context:** Market attention is centered on recent developments:`);
      filteredNews.slice(0, 2).forEach(n => lines.push(`• ${n.title} (*${n.source}*)`));
    } else {
      lines.push(`\n**Supported Context:** There is currently no single breaking fundamental catalyst; price action reflects consolidation.`);
    }

    if (catalysts.length > 0) {
      lines.push(`\n**Upcoming Catalysts to Watch:**`);
      catalysts.forEach(c => lines.push(`• ${c.title} (*${c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}*)`));
    }

    responseText = lines.join('\n');
  }

  return {
    question,
    asset: primaryAsset,
    comparisonAsset,
    quote: primaryQuote,
    comparisonQuote,
    news: filteredNews,
    catalysts,
    answer: responseText
  };
}
