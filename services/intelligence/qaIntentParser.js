import { config } from '../../config/index.js';

const INTENT_SYSTEM_INSTRUCTION = `You are an elite financial question intent parser.
Analyze the user's natural language market question and extract a structured research intent.

SCHEMA:
{
  "queryType": "price_movement" | "outperformance_comparison" | "macro_risk" | "catalyst_check" | "general_market",
  // - "price_movement": Questions like "Why is BTC moving/dropping/rising today?"
  // - "outperformance_comparison": Questions comparing relative performance like "Is ETH outperforming BTC?", "How is tech doing vs energy?"
  // - "macro_risk": Questions about macro headwinds, fed meetings, inflation risks
  // - "catalyst_check": Questions about what to watch, upcoming earnings, dates

  "primaryAsset": "BTC", // Symbol of main asset asked about (e.g. "BTC", "NVDA", "ETH", "SPY") or null
  "comparisonAsset": null, // Symbol of second asset if a comparison is made (e.g. "ETH" vs "BTC"), or null
  "timeframe": "1d", // "1d", "1w", "1m", "ytd"
  "userAssumption": "Asset made a significant move", // What the user assumes in the question, or null
  "topics": ["volatility", "fed"] // Array of relevant topic tags
}

RULES:
1. Map names to symbols (Bitcoin -> "BTC", Ethereum -> "ETH", Nvidia -> "NVDA", S&P 500 / stocks / market -> "SPY", Nasdaq -> "QQQ").
2. Return ONLY raw JSON without markdown code fences.`;

function sanitizeJson(text) {
  if (!text) return '';
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  return clean.trim();
}

export async function parseQuestionIntent(question) {
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
          messages: [
            { role: 'system', content: INTENT_SYSTEM_INSTRUCTION },
            { role: 'user', content: `QUESTION: "${question}"` }
          ],
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content;
        const parsed = JSON.parse(sanitizeJson(raw));
        if (parsed.queryType) return parsed;
      }
    } catch (err) {
      console.warn('[QA Intent Parser] LLM intent parse fallback:', err.message);
    }
  }

  // Deterministic fallback
  const qLower = question.toLowerCase();
  let queryType = 'general_market';
  let primaryAsset = 'SPY';
  let comparisonAsset = null;

  if (/outperform|better than|vs|beating|versus/.test(qLower)) {
    queryType = 'outperformance_comparison';
    if (/eth/.test(qLower) && /btc|bitcoin/.test(qLower)) {
      primaryAsset = 'ETH';
      comparisonAsset = 'BTC';
    }
  } else if (/(why|how comes?|what explains?).*(moving|falling|dropping|crashing|dumping|tanking|down|up|rallying|surging|pumping|soaring|bleeding)/.test(qLower) || /(dumping|crashing|tanking|plunging|pumping|surging|rallying)/.test(qLower)) {
    queryType = 'price_movement';
  } else if (/risk|threat|headwind|danger|downside/.test(qLower)) {
    queryType = 'macro_risk';
  } else if (/watch|catalyst|calendar|event|upcoming/.test(qLower)) {
    queryType = 'catalyst_check';
  }

  if (!comparisonAsset) {
    if (/\b(btc|bitcoin)\b/.test(qLower)) primaryAsset = 'BTC';
    else if (/\b(eth|ethereum)\b/.test(qLower)) primaryAsset = 'ETH';
    else if (/\b(nvda|nvidia)\b/.test(qLower)) primaryAsset = 'NVDA';
    else if (/\b(tsla|tesla)\b/.test(qLower)) primaryAsset = 'TSLA';
    else if (/\b(aapl|apple)\b/.test(qLower)) primaryAsset = 'AAPL';
    else if (/\b(qqq|nasdaq)\b/.test(qLower)) primaryAsset = 'QQQ';
    else if (/\b(gold|xau)\b/.test(qLower)) primaryAsset = 'GOLD';
    else primaryAsset = 'SPY';
  }

  return {
    queryType,
    primaryAsset,
    comparisonAsset,
    timeframe: '1d',
    userAssumption: /why.*(moving|falling|dropping|crashing|down|up)/.test(qLower) ? 'Asset made significant directional move' : null,
    topics: []
  };
}
