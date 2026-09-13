import { resolveSymbol } from '../resolver/symbolResolver.js';
import { getYahooMarketQuote } from '../market_data/yahooMarketData.js';
import { getMarketNews } from '../news/newsAggregator.js';
import { getUpcomingMacroEvents } from '../events/macroEvents.js';
import { parseQuestionIntent } from './qaIntentParser.js';
import { config } from '../../config/index.js';

const LOW_QUALITY_SOURCES = new Set([
  '24/7 wall st.', '247wallst', 'ambcrypto', 'cryptopotato', 'coingape', 'pluang'
]);

function rankAndFilterNews(articles, question, assetSymbol) {
  const qTerms = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);

  const scored = articles.map(art => {
    let score = 0;
    const titleLower = (art.title || '').toLowerCase();
    const sourceLower = (art.source || '').toLowerCase();

    if (sourceLower.includes('reuters') || sourceLower.includes('bloomberg') || sourceLower.includes('wsj') || sourceLower.includes('financial times') || sourceLower.includes('cnbc') || sourceLower.includes('yahoo finance') || sourceLower.includes('coindesk')) {
      score += 6;
    }

    for (const lq of LOW_QUALITY_SOURCES) {
      if (sourceLower.includes(lq)) {
        score -= 5;
        break;
      }
    }

    if (titleLower.includes('quantum') || titleLower.includes('expose') || titleLower.includes('scam') || titleLower.includes('hack')) {
      score -= 8;
    }

    if (assetSymbol && titleLower.includes(assetSymbol.toLowerCase())) {
      score += 4;
    }

    for (const term of qTerms) {
      if (titleLower.includes(term)) score += 3;
    }

    if (art.time && (art.time.includes('m ago') || art.time.includes('1h') || art.time.includes('2h') || art.time.includes('3h') || art.time.includes('4h'))) {
      score += 2;
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
  // 1. Dynamic intent extraction
  const intent = await parseQuestionIntent(question);
  const { queryType, primaryAsset: primarySym, comparisonAsset: compSym } = intent;

  const primaryAsset = await resolveSymbol(primarySym || 'BTC');
  const comparisonAsset = compSym ? await resolveSymbol(compSym) : null;

  // 2. Fetch live market quotes
  let primaryQuote = null;
  let compQuote = null;

  if (primaryAsset) {
    primaryQuote = await getYahooMarketQuote(primaryAsset.symbol).catch(() => null);
  }
  if (comparisonAsset) {
    compQuote = await getYahooMarketQuote(comparisonAsset.symbol).catch(() => null);
  }

  // 3. News fetch & relevance filtering
  let rawNews = [];
  if (primaryAsset) {
    rawNews = await getMarketNews(primaryAsset, 8).catch(() => []);
  } else {
    rawNews = await getMarketNews({ symbol: 'SPY', name: 'Stock Market' }, 8).catch(() => []);
  }
  const filteredNews = rankAndFilterNews(rawNews, question, primaryAsset?.symbol);

  // 4. Macro Catalysts
  const catalysts = getUpcomingMacroEvents(new Date()).slice(0, 3);

  // 5. Evaluate Premise
  let falsePremiseWarning = null;
  const isEssentiallyFlat = primaryQuote && Math.abs(primaryQuote.changePercent) < 0.4;

  if (queryType === 'price_movement' && isEssentiallyFlat) {
    falsePremiseWarning = `${primaryAsset.symbol} is essentially flat today (${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}%), so there is not a meaningful directional move to explain. The important story is current consolidation and the catalysts that could break it.`;
  } else if (queryType === 'outperformance_comparison' && primaryQuote && compQuote) {
    const diff = primaryQuote.changePercent - compQuote.changePercent;
    if (diff < 0) {
      falsePremiseWarning = `${primaryAsset.name} is NOT outperforming ${comparisonAsset.name} today. In fact, ${primaryAsset.symbol} is at ${primaryQuote.changePercent.toFixed(2)}% vs ${comparisonAsset.symbol} at ${compQuote.changePercent.toFixed(2)}% (underperforming by ${Math.abs(diff).toFixed(2)}%).`;
    }
  }

  // 6. Build institutional synthesis prompt
  const quoteSummary = primaryQuote
    ? `${primaryAsset.name} (${primaryAsset.symbol}): Price $${primaryQuote.price}, 24h Change: ${primaryQuote.changePercent >= 0 ? '+' : ''}${primaryQuote.changePercent.toFixed(2)}% (Range: $${primaryQuote.dayLow ?? 'N/A'} - $${primaryQuote.dayHigh ?? 'N/A'})`
    : 'Quote unavailable';

  const compQuoteSummary = compQuote
    ? `${comparisonAsset.name} (${comparisonAsset.symbol}): Price $${compQuote.price}, 24h Change: ${compQuote.changePercent >= 0 ? '+' : ''}${compQuote.changePercent.toFixed(2)}%`
    : '';

  const headlinesSummary = filteredNews.length > 0
    ? filteredNews.map((n, i) => `[${i + 1}] "${n.title}" (${n.source}, ${n.time})`).join('\n')
    : 'No verified recent headlines.';

  const catalystsSummary = catalysts.map(c => 
    `- ${c.title} (Verified calendar date: ${c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
  ).join('\n');

  const prompt = `You are an institutional Wall Street research analyst.
Answer the user's market question with objective, grounded market intelligence.

USER QUESTION: "${question}"
PARSED RESEARCH INTENT: ${JSON.stringify(intent)}

VERIFIED REAL-TIME MARKET DATA:
- ${quoteSummary}
${compQuoteSummary ? `- ${compQuoteSummary}` : ''}

VERIFIED RECENT NEWS HEADLINES:
${headlinesSummary}

VERIFIED UPCOMING MACRO CATALYSTS:
${catalystsSummary}

${falsePremiseWarning ? `CRITICAL PREMISE NOTICE:\n${falsePremiseWarning}\nYou MUST begin your response by explicitly stating this premise correction.` : ''}

INSTRUCTIONS:
1. Clearly distinguish between:
   - **Observed Market Facts:** (State real-time prices, percentage moves, and relative performance accurately).
   - **Supported Explanations vs Speculation:** (Cite news sources directly if they explain market sentiment; if there is no verified single catalyst, state that explicitly).
   - **Key Catalysts to Watch:** (List top scheduled events using strictly the verified calendar dates above).
2. NEVER invent a reason for a move if the market is quiet or flat.
3. NEVER fabricate event dates or percentages.
4. Keep it concise, analytical, institutional. No financial advice.`;

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
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        responseText = data?.choices?.[0]?.message?.content?.trim();
      }
    } catch (e) {
      console.warn('[QA Service] LLM synthesis failed:', e.message);
    }
  }

  if (!responseText) {
    const lines = [];
    if (falsePremiseWarning) {
      lines.push(`**Premise Check:** ${falsePremiseWarning}\n`);
    }
    lines.push(`**Observed Market Facts:** ${quoteSummary}`);
    if (compQuoteSummary) lines.push(compQuoteSummary);

    if (filteredNews.length > 0) {
      lines.push(`\n**Supported Explanations:**`);
      filteredNews.forEach(n => lines.push(`• ${n.title} (*${n.source}*)`));
    } else {
      lines.push(`\n**Supported Explanations:** Price action reflects consolidation with no single breaking fundamental catalyst.`);
    }

    if (catalysts.length > 0) {
      lines.push(`\n**Upcoming Catalysts to Watch:**`);
      catalysts.forEach(c => lines.push(`• ${c.title} (*${c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}*)`));
    }

    responseText = lines.join('\n');
  }

  return {
    question,
    intent,
    asset: primaryAsset,
    comparisonAsset,
    quote: primaryQuote,
    comparisonQuote: compQuote,
    news: filteredNews,
    catalysts,
    answer: responseText
  };
}
