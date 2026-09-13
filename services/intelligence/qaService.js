import { resolveSymbol } from '../resolver/symbolResolver.js';
import { getYahooMarketQuote } from '../market_data/yahooMarketData.js';
import { getMarketNews } from '../news/newsAggregator.js';
import { getUpcomingMacroEvents } from '../events/macroEvents.js';
import { config } from '../../config/index.js';

export async function answerMarketQuestion(question) {
  // 1. Extract potential symbol or topic from question
  let asset = null;
  const qLower = question.toLowerCase();

  // Explicit priority keywords
  if (/\b(btc|bitcoin)\b/.test(qLower)) {
    asset = await resolveSymbol('BTC');
  } else if (/\b(eth|ethereum|ether)\b/.test(qLower)) {
    asset = await resolveSymbol('ETH');
  } else if (/\b(sol|solana)\b/.test(qLower)) {
    asset = await resolveSymbol('SOL');
  } else if (/\b(nvda|nvidia)\b/.test(qLower)) {
    asset = await resolveSymbol('NVDA');
  } else if (/\b(tsla|tesla)\b/.test(qLower)) {
    asset = await resolveSymbol('TSLA');
  } else if (/\b(aapl|apple)\b/.test(qLower)) {
    asset = await resolveSymbol('AAPL');
  } else if (/\b(spy|s&p|spx|stock market|stocks)\b/.test(qLower)) {
    asset = await resolveSymbol('SPY');
  } else if (/\b(qqq|nasdaq|tech stocks)\b/.test(qLower)) {
    asset = await resolveSymbol('QQQ');
  } else if (/\b(gold|xau)\b/.test(qLower)) {
    asset = await resolveSymbol('GOLD');
  } else {
    // Check other ticker words, skipping common English stopwords
    const STOP_WORDS = new Set(['WHY', 'WHAT', 'WHEN', 'WHERE', 'WHO', 'HOW', 'IS', 'ARE', 'WAS', 'WERE', 'DO', 'DOES', 'DID', 'THE', 'A', 'AN', 'IN', 'ON', 'AT', 'TO', 'FOR', 'WITH', 'BY', 'ABOUT', 'DOWN', 'UP', 'TODAY', 'THIS', 'WEEK', 'MONTH', 'YEAR', 'RIGHT', 'NOW', 'DROP', 'FALL', 'RALLY', 'HIGH', 'LOW']);
    const words = question.replace(/[?,.!]/g, ' ').split(/\s+/);
    for (const w of words) {
      const clean = w.trim().toUpperCase();
      if (clean.length >= 2 && clean.length <= 6 && !STOP_WORDS.has(clean)) {
        const res = await resolveSymbol(clean);
        if (res) {
          asset = res;
          break;
        }
      }
    }
  }

  let quote = null;
  let news = [];
  let catalysts = [];

  if (asset) {
    try {
      quote = await getYahooMarketQuote(asset.symbol);
    } catch (e) {
      console.warn('[QA Service] Failed to get quote for', asset.symbol);
    }

    try {
      news = await getMarketNews(asset, 4);
    } catch (e) {
      console.warn('[QA Service] Failed to get news for', asset.symbol);
    }
  } else {
    try {
      news = await getMarketNews({ symbol: 'SPY', name: 'Stock Market' }, 4);
    } catch (e) {}
  }

  catalysts = getUpcomingMacroEvents(new Date()).slice(0, 3);

  // 2. Build synthesis prompt
  const quoteText = quote && quote.price !== undefined
    ? `Price: $${quote.price} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}% today), 24h High: $${quote.dayHigh ?? 'N/A'}, 24h Low: $${quote.dayLow ?? 'N/A'}`
    : 'Real-time quote currently unavailable';

  const headlinesText = news.length > 0
    ? news.map((n, i) => `[${i + 1}] "${n.title}" — ${n.source}`).join('\n')
    : 'No recent headlines found.';

  const catalystsText = catalysts.length > 0
    ? catalysts.map(c => `- ${c.title} (${c.date?.toLocaleDateString ? c.date.toLocaleDateString() : ''})`).join('\n')
    : 'None scheduled.';

  const prompt = `You are an elite, objective Wall Street research analyst and market intelligence assistant.
Answer the user's question with institutional precision and factual grounding.

USER QUESTION: "${question}"

FACTUAL MARKET CONTEXT:
Target Asset: ${asset ? `${asset.name} (${asset.symbol})` : 'Broad Market'}
Live Market Quote: ${quoteText}

Verified Recent News Headlines:
${headlinesText}

Upcoming Macroeconomic Catalysts:
${catalystsText}

INSTRUCTIONS FOR YOUR ANSWER:
1. Ground your answer in the verified facts, numbers, and news provided above.
2. Structure your response clearly:
   - **Observed Facts & Performance:** State exactly what the price and data show.
   - **Drivers & Explanations:** Synthesize the most likely catalysts (cite source names e.g. "according to Bloomberg/Reuters").
   - **Uncertainty & Risks:** Explicitly distinguish known facts from market speculation or macro risks.
3. If the user asks whether a move is unusual, analyze based on typical daily volatility (e.g. BTC typical daily range is 2-4%, >5% is elevated).
4. STRICT COMPLIANCE: Do NOT give financial advice, do NOT predict guaranteed outcomes, do NOT tell the user to buy or sell.
5. Keep it concise, analytical, and professional (around 3 to 4 short paragraphs).`;

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
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (res.ok) {
        const data = await res.json();
        responseText = data?.choices?.[0]?.message?.content?.trim();
      }
    } catch (e) {
      console.warn('[QA Service] LLM call failed:', e.message);
    }
  }

  // Deterministic fallback if LLM times out or is unavailable
  if (!responseText) {
    const lines = [];
    if (asset && quote) {
      lines.push(`<b>Observed Facts:</b> ${asset.name} (${asset.symbol}) is trading at $${quote.price} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}% today).`);
    } else {
      lines.push(`<b>Market Overview:</b> Risk assets are responding to broad macroeconomic signals and liquidity conditions.`);
    }

    if (news.length > 0) {
      lines.push(`\n<b>Recent Headlines:</b>`);
      news.slice(0, 2).forEach(n => lines.push(`• ${n.title} (<i>${n.source}</i>)`));
    }

    if (catalysts.length > 0) {
      lines.push(`\n<b>Upcoming Catalysts:</b> Market participants are watching ${catalysts[0].title}.`);
    }

    lines.push(`\n<i>Note: Market moves are subject to intraday liquidity shifts and macroeconomic prints. This is informational analysis, not financial advice.</i>`);
    responseText = lines.join('\n');
  }

  return {
    question,
    asset,
    quote,
    news: news.slice(0, 3),
    answer: responseText
  };
}
