import { config } from '../../config/index.js';
import { createDefaultStrategy } from './strategySchema.js';

const SYSTEM_INSTRUCTION = `You are an expert quantitative trading strategy interpreter.
Convert the user's natural language trading strategy into a valid JSON strategy specification matching the schema below.

SCHEMA:
{
  "asset": "BTC", // Traded asset symbol (e.g. BTC, ETH, NVDA, AAPL, SPY, TSLA, etc.)
  "signalAsset": "QQQ", // Signal asset symbol (defaults to asset; different for multi-asset strategies e.g. "buy BTC when QQQ falls 2%")
  "timeframe": "1d", // "1d" (default), "1h", "4h", "1w"
  "period": "5y", // "1y", "3y", "5y" (default 5y)
  "direction": "long", // "long" (default) or "short"
  "initialCapital": 10000,
  "positionSizePct": 50, // Capital % allocated per trade (e.g. 50% = 50, 100% = 100)
  "leverage": 1.0, // Leverage multiplier (default 1.0)
  "feePct": 0.1, // Fee % per trade (default 0.1)
  "slippagePct": 0.05, // Slippage % (default 0.05)
  "stopLossPct": 4.0, // Stop loss % from entry (e.g. 4.0 for 4% stop) or null
  "takeProfitPct": 8.0, // Take profit % from entry (e.g. 8.0 for 8% profit) or null
  "maxHoldingBars": 10, // Maximum holding period in trading days/bars, or null
  "entryConditions": [
    // Array of entry conditions that must ALL be satisfied (AND logic).
    // Supported condition types:
    // 1. Daily percentage change (on signalAsset or traded asset):
    //    { "indicator": "DAILY_CHANGE", "asset": "QQQ", "dropPct": 2.0, "operator": "daily_drop_pct" }
    // 2. Moving average trend filter:
    //    { "indicator": "MA_FILTER", "asset": "BTC", "type": "EMA", "period": 200, "operator": ">" }
    // 3. RSI threshold:
    //    { "indicator": "RSI", "asset": "BTC", "period": 14, "operator": "<", "value": 30 }
    // 4. Moving average crossover:
    //    { "indicator": "MA_CROSS", "asset": "BTC", "fastType": "EMA", "fastPeriod": 20, "slowType": "EMA", "slowPeriod": 50, "operator": "crosses_above" }
    // 5. Drawdown from rolling high:
    //    { "indicator": "HIGH_DRAWDOWN", "asset": "BTC", "lookbackBars": 30, "dropPct": 10.0, "operator": "drops_pct_from_high" }
  ],
  "exitConditions": [
    // Array of exit condition rules (whichever triggers first, in addition to stopLossPct/takeProfitPct/maxHoldingBars):
    // { "indicator": "RSI", "asset": "BTC", "period": 14, "operator": ">", "value": 70 }
    // { "indicator": "MA_CROSS", "asset": "BTC", "fastType": "EMA", "fastPeriod": 20, "slowType": "EMA", "slowPeriod": 50, "operator": "crosses_below" }
    // { "indicator": "PROFIT_TARGET", "targetPct": 8.0, "operator": "rises_from_entry" }
    // { "indicator": "RECOVER_HIGH", "lookbackBars": 30, "operator": "recovers_to_high" }
  ],
  "unsupportedFeature": null // String explaining why if the strategy requires options chain, 0DTE implied vol, or order book depth data.
}

CRITICAL RULES:
1. Return ONLY valid, raw JSON. Do not include markdown code block syntax like \`\`\`json or backticks.
2. If the user specifies "only enter if BTC is above its 200 day EMA", add an entryCondition with indicator="MA_FILTER", asset="BTC", type="EMA", period=200, operator=">".
3. If the user specifies "buy BTC whenever QQQ falls 2% in a day", signalAsset is "QQQ", asset is "BTC", and add entryCondition with indicator="DAILY_CHANGE", asset="QQQ", dropPct=2.0.
4. If the user asks for unavailable data (e.g. 0DTE options, order-book depth, tick data), set unsupportedFeature with a clear explanation.
5. Extract positionSizePct correctly (e.g. "use 50% of capital" -> positionSizePct = 50).
6. Extract takeProfitPct (e.g. "take profit at 8%" -> 8.0) and stopLossPct (e.g. "stop loss at 4%" -> 4.0).
7. Extract maxHoldingBars (e.g. "exit after 10 trading days" -> 10).`;

function sanitizeJsonResponse(text) {
  if (!text) return '';
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  return clean.trim();
}

async function callOpenRouter(prompt) {
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
      model: 'meta-llama/llama-3.3-70b-instruct',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: `USER STRATEGY:\n"${prompt}"` }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUSER STRATEGY:\n"${prompt}"` }] }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

export async function parseStrategyWithLLM(prompt) {
  if (!config.hasLLM) {
    console.log('[Backtest LLM Parser] Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.');
    return null;
  }

  let rawText = null;
  let provider = '';

  // 1. Try OpenRouter if configured
  if (config.hasOpenRouter) {
    try {
      console.log(`[Backtest LLM Parser] Invoking OpenRouter (Gemini Flash) for prompt: "${prompt}"...`);
      rawText = await callOpenRouter(prompt);
      provider = 'OpenRouter';
    } catch (err) {
      console.warn(`[Backtest LLM Parser] OpenRouter call failed: ${err.message}`);
    }
  }

  // 2. Try direct Gemini API if configured & OpenRouter didn't return
  if (!rawText && config.hasGemini) {
    try {
      console.log(`[Backtest LLM Parser] Invoking Direct Gemini API for prompt: "${prompt}"...`);
      rawText = await callGemini(prompt);
      provider = 'Gemini';
    } catch (err) {
      console.warn(`[Backtest LLM Parser] Direct Gemini call failed: ${err.message}`);
    }
  }

  if (!rawText) return null;

  try {
    const cleanJson = sanitizeJsonResponse(rawText);
    console.log(`[Backtest LLM Parser] Raw JSON from ${provider}:`, cleanJson);
    const parsed = JSON.parse(cleanJson);
    const defaults = createDefaultStrategy(parsed.asset || 'BTC');
    const strategy = { ...defaults, ...parsed, rawPrompt: prompt };

    return {
      source: provider.toLowerCase(),
      valid: strategy.unsupportedFeature ? false : (strategy.entryConditions?.length > 0),
      strategy,
      isUnsupported: Boolean(strategy.unsupportedFeature),
      error: strategy.unsupportedFeature || null
    };
  } catch (err) {
    console.warn(`[Backtest LLM Parser] Failed to parse JSON from ${provider}: ${err.message}`);
    return null;
  }
}
