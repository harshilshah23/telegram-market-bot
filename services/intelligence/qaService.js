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

  const isCausalMechanism = queryType === 'causal_mechanism';

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

  const prompt = `You are a senior market analyst and plain-English financial communicator.
Answer the user's market question with objective, grounded market intelligence.
The user wants an answer in normal human language first, followed by clear supporting evidence.

USER QUESTION: "${question}"
PARSED RESEARCH INTENT: ${JSON.stringify(intent)}

VERIFIED REAL-TIME MARKET DATA:
- ${quoteSummary}
${compQuoteSummary ? `- ${compQuoteSummary}` : ''}

VERIFIED RECENT NEWS HEADLINES:
${headlinesSummary}

VERIFIED UPCOMING MACRO CATALYSTS:
${catalystsSummary}

${falsePremiseWarning ? `CRITICAL PREMISE NOTICE:\n${falsePremiseWarning}\nYou MUST begin your Quick Take by explicitly addressing this premise correction.` : ''}

CRITICAL RULES:
1. Answer the user's actual question directly in the very first sentence.
${isCausalMechanism ? `   - For questions asking "why would X matter for Y" or "how does X affect Y":
     FIRST explain the structural economic transmission mechanism clearly (e.g. why the US dollar index impacts dollar-denominated assets, global USD liquidity, and risk appetite).
     THEN evaluate whether current market moves reflect that relationship or diverge from it.` : ''}
2. Distinguish clearly between:
   - FACT: What the real-time data directly shows (e.g. BTC is at $77,270, up +0.03%).
   - INFERENCE: What that evidence reasonably suggests ("The data suggests...", "What stands out is...").
   - SPECULATION / CAVEAT: What could happen or limitations ("The important caveat is..."). Never present speculation as fact.
3. NEVER invent unmeasured market claims:
   - If volume was not retrieved/measured, DO NOT claim "volume is compressed" or "liquidity is thin".
   - If volatility was not calculated, DO NOT claim "volatility is compressed".
   - If markets are flat, state flat consolidation directly based on the reported percentage.
4. STRUCTURE YOUR RESPONSE WITH THESE EXACT SECTIONS:
   **Quick Take**
   (1-2 plain-English sentences answering the user's question directly with zero jargon)

   **What the Data Shows**
   (Bullet points summarizing current prices, verified performance numbers, and relevant verified headlines)

   **So What Does This Mean?**
   (2-3 grounded inference points translating what the consolidation, move, transmission mechanism, or catalyst means for an investor)

   **Key Catalysts to Watch**
   (Bullet points of upcoming confirmed macro events with verified calendar dates)`;

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
    // 1. Quick Take
    if (isCausalMechanism) {
      const compName = comparisonAsset?.name || 'the US Dollar';
      lines.push(`**Quick Take**\nA stronger ${compName} historically tightens global liquidity and increases the cost of capital, which typically creates headwind pressure on dollar-denominated risk assets like ${primaryAsset.name}.`);
    } else if (falsePremiseWarning) {
      lines.push(`**Quick Take**\n${falsePremiseWarning}`);
    } else if (isEssentiallyFlat) {
      lines.push(`**Quick Take**\n${primaryAsset.symbol} is essentially flat today, trading in a tight consolidation range without a dominant directional driver.`);
    } else {
      const dir = primaryQuote?.changePercent >= 0 ? 'higher' : 'lower';
      lines.push(`**Quick Take**\n${primaryAsset.symbol} is moving ${dir} by ${primaryQuote?.changePercent?.toFixed(2)}% over the past 24 hours.`);
    }

    // 2. What the Data Shows
    lines.push(`\n**What the Data Shows**`);
    lines.push(`• ${quoteSummary}`);
    if (compQuoteSummary) lines.push(`• ${compQuoteSummary}`);
    if (filteredNews.length > 0) {
      filteredNews.forEach(n => lines.push(`• Headline: "${n.title}" (*${n.source}*)`));
    } else {
      lines.push(`• No breaking single fundamental catalyst reported in recent news flow.`);
    }

    // 3. So What Does This Mean?
    lines.push(`\n**So What Does This Mean?**`);
    if (isCausalMechanism) {
      lines.push(`• **Denominator Effect**: Because ${primaryAsset.symbol} is priced primarily in USD, a strengthening dollar mechanically requires more non-dollar purchasing power to buy the same unit.`);
      lines.push(`• **Global Liquidity Regime**: Dollar strength often reflects tighter Fed policy or global safe-haven flight, conditions that historically reduce risk appetite for volatile assets.`);
      lines.push(`• **Live Context**: Look at whether ${primaryAsset.symbol} and ${comparisonAsset?.symbol || 'DXY'} are currently moving inversely or whether crypto-specific catalysts are dominating macro correlation.`);
    } else if (isEssentiallyFlat) {
      lines.push(`• The data indicates price consolidation rather than an active directional trend.`);
      lines.push(`• Without a breaking fundamental news catalyst, trading reflects routine balance between buyers and sellers.`);
    } else {
      lines.push(`• The recorded price change reflects measurable directional momentum, supported by recent headline flow.`);
    }

    // 4. Catalysts to Watch
    if (catalysts.length > 0) {
      lines.push(`\n**Key Catalysts to Watch**`);
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
