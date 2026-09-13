import { config } from '../../config/index.js';
import { createDefaultStrategy } from './strategySchema.js';

export async function parseStrategyWithGemini(prompt) {
  if (!config.hasGemini) {
    return null;
  }

  const systemInstruction = `You are a financial quantitative strategy interpreter.
Convert the user's natural language trading strategy into a valid JSON strategy specification.

SCHEMA SPECIFICATION:
{
  "asset": "BTC", // Traded asset symbol (e.g. BTC, ETH, NVDA, AAPL, SPY)
  "signalAsset": "BTC", // Signal asset symbol (defaults to asset; different for multi-asset e.g. QQQ)
  "timeframe": "1d", // "1d", "1h", "4h", "1w"
  "period": "5y", // "1y", "3y", "5y"
  "direction": "long", // "long" or "short"
  "initialCapital": 10000,
  "positionSizePct": 100,
  "leverage": 1.0,
  "feePct": 0.1,
  "slippagePct": 0.05,
  "stopLossPct": null, // number or null
  "takeProfitPct": null, // number or null
  "maxHoldingBars": null, // integer number of bars or null
  "entryConditions": [
    // One or more rules:
    // { "indicator": "RSI", "period": 14, "operator": "<", "value": 30 }
    // { "indicator": "MA_CROSS", "fastType": "EMA", "fastPeriod": 20, "slowType": "EMA", "slowPeriod": 50, "operator": "crosses_above" }
    // { "indicator": "MA_FILTER", "type": "SMA", "period": 200, "operator": ">" }
    // { "indicator": "HIGH_DRAWDOWN", "lookbackBars": 30, "dropPct": 10, "operator": "drops_pct_from_high" }
    // { "indicator": "DAILY_CHANGE", "dropPct": 2, "operator": "daily_drop_pct" }
  ],
  "exitConditions": [
    // Rules for exiting trade:
    // { "indicator": "RSI", "period": 14, "operator": ">", "value": 70 }
    // { "indicator": "MA_CROSS", "fastType": "EMA", "fastPeriod": 20, "slowType": "EMA", "slowPeriod": 50, "operator": "crosses_below" }
    // { "indicator": "PROFIT_TARGET", "targetPct": 5.0, "operator": "rises_from_entry" }
  ],
  "unsupportedFeature": null // string explaining why if user asks for options chains, order book depth, etc.
}

RULES:
1. Return ONLY valid raw JSON without markdown code blocks.
2. If the user asks for historical options-chain, order-book depth, or real-time sentiment data, set "unsupportedFeature" to a concise explanation.
3. Keep default fees (0.1%) and slippage (0.05%) unless specified.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: `${systemInstruction}\n\nUSER STRATEGY:\n"${prompt}"` }] }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    const defaults = createDefaultStrategy(parsed.asset || 'BTC');
    const strategy = { ...defaults, ...parsed, rawPrompt: prompt };

    return {
      valid: strategy.unsupportedFeature ? false : (strategy.entryConditions?.length > 0),
      strategy,
      isUnsupported: Boolean(strategy.unsupportedFeature),
      error: strategy.unsupportedFeature || null
    };
  } catch (err) {
    return null;
  }
}
