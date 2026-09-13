import { config } from '../../config/index.js';

const SYSTEM_INSTRUCTION = `You are an expert quantitative market scenario parser.
Convert the user's natural language hypothetical market scenario into a strictly structured JSON specification.

SCHEMA:
{
  "shockAsset": "BTC", // Symbol of the primary asset receiving the hypothetical shock (e.g. "BTC", "ETH", "NVDA", "SPY", "QQQ")
  "shockPct": -20.0, // Numerical percentage shock (e.g. -20 for 20% drop/crash/fall, 10 for 10% rally, 50 for +50%, -0.5 for -50bps)
  "shockType": "price_drop", // "price_drop", "price_rise", "rate_cut", "rate_hike"
  "impactAssets": ["ETH", "QQQ"], // Array of symbols for other assets whose reaction/sensitivity is requested (e.g. ["ETH", "QQQ", "GOLD", "DXY", "SPY"])
  "analyzeRecoveryTime": true, // Boolean: true if user asks about recovery time, bounce back, historical precedent duration
  "macroContext": null // String if special macro condition mentioned (e.g. "50bps rate cut during strong uptrend"), or null
}

RULES:
1. "shockAsset" is STRICTLY the asset that suffers or experiences the initial shock.
   Example: "If Bitcoin falls 20%, what happens to Ethereum and Nasdaq?" -> shockAsset: "BTC", shockPct: -20, impactAssets: ["ETH", "QQQ"].
   Example: "Assume BTC loses one fifth of its value - how does ETH usually react?" -> shockAsset: "BTC", shockPct: -20, impactAssets: ["ETH"].
   Example: "The Fed unexpectedly cuts rates by 50 basis points while Bitcoin is already in a strong uptrend. How have similar historical situations affected Bitcoin, Nasdaq, the dollar and gold?" -> shockAsset: "SPY", shockPct: 2.5, shockType: "rate_cut", impactAssets: ["BTC", "QQQ", "DX-Y.NYB", "GC=F"], macroContext: "50bps rate cut during strong uptrend".
2. Convert fractional language: "one fifth" -> -20%, "one third" -> -33.3%, "half" -> -50%, "50 basis points" / "50bps" -> rate cut context.
3. Map full asset names to symbols:
   - Bitcoin / BTC -> "BTC"
   - Ethereum / Ether / ETH -> "ETH"
   - Nasdaq / QQQ / tech -> "QQQ"
   - S&P 500 / S&P / SPY / stock market -> "SPY"
   - Dollar / DXY / USD -> "DX-Y.NYB"
   - Gold / XAU -> "GC=F"
   - Nvidia / NVDA -> "NVDA"
   - Tesla / TSLA -> "TSLA"
   - Apple / AAPL -> "AAPL"
4. Return ONLY valid raw JSON without backticks or markdown fences.`;

function sanitizeJson(text) {
  if (!text) return '';
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  return clean.trim();
}

export async function parseScenarioWithLLM(scenarioText) {
  if (!config.hasLLM) return null;

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
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: `USER SCENARIO:\n"${scenarioText}"` }
          ],
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content;
        const clean = sanitizeJson(raw);
        const parsed = JSON.parse(clean);
        if (parsed.shockAsset && typeof parsed.shockPct === 'number') {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[Scenario LLM Parser] LLM parse failed, falling back to deterministic parser:', err.message);
  }

  return null;
}

export function parseScenarioDeterministic(scenarioText) {
  const text = scenarioText.toLowerCase();

  let shockAsset = 'BTC';
  let shockPct = -20;
  let shockType = 'price_drop';
  const impactAssets = [];
  let analyzeRecoveryTime = false;
  let macroContext = null;

  // 1. Identify shock asset by analyzing who receives the shock action (falls, drops, crashes, loses, down)
  const isBtcShock = /bitcoin|btc/.test(text) && /(fall|drop|crash|down|lose|loss|drawdown|dip|shock|decline)/.test(text);
  const isEthShock = /ethereum|eth\b/.test(text) && /(fall|drop|crash|down|lose|loss|drawdown|dip|shock|decline)/.test(text) && !isBtcShock;
  const isNvdaShock = /nvidia|nvda/.test(text) && /(fall|drop|crash|down|lose|loss|drawdown|dip|shock|decline)/.test(text);

  if (isBtcShock) {
    shockAsset = 'BTC';
  } else if (isEthShock) {
    shockAsset = 'ETH';
  } else if (isNvdaShock) {
    shockAsset = 'NVDA';
  } else if (/fed\b.*(cut|cuts|rate)/.test(text) || /rate cut/.test(text)) {
    shockAsset = 'SPY';
    shockPct = 2.5;
    shockType = 'rate_cut';
    macroContext = 'Fed 50bps rate cut';
  } else if (/fed\b.*(hike|hikes)/.test(text) || /rate hike/.test(text)) {
    shockAsset = 'SPY';
    shockPct = -2.5;
    shockType = 'rate_hike';
    macroContext = 'Fed rate hike';
  }

  // 2. Extract percentage or fraction
  const matchPct = text.match(/(-?\d+(\.\d+)?)\s*%/);
  if (matchPct) {
    let val = parseFloat(matchPct[1]);
    if (/(fall|drop|crash|down|lose|loss|drawdown|cut)/.test(text)) {
      val = -Math.abs(val);
    } else if (/(rise|rally|pump|up|gain)/.test(text)) {
      val = Math.abs(val);
    }
    shockPct = val;
  } else if (/one fifth/.test(text)) {
    shockPct = -20;
  } else if (/one third/.test(text)) {
    shockPct = -33.3;
  } else if (/half/.test(text)) {
    shockPct = -50;
  } else if (/quarter/.test(text)) {
    shockPct = -25;
  }

  // 3. Find impact assets (assets mentioned that are NOT the shock asset)
  if (/ethereum|eth\b/.test(text) && shockAsset !== 'ETH') impactAssets.push('ETH');
  if (/nasdaq|qqq/.test(text) && shockAsset !== 'QQQ') impactAssets.push('QQQ');
  if (/s&p|spy|stock market/.test(text) && shockAsset !== 'SPY') impactAssets.push('SPY');
  if (/bitcoin|btc\b/.test(text) && shockAsset !== 'BTC') impactAssets.push('BTC');
  if (/dollar|dxy|greenback/.test(text)) impactAssets.push('DX-Y.NYB');
  if (/gold|xau/.test(text)) impactAssets.push('GC=F');

  if (impactAssets.length === 0) {
    // Default logical pairing
    impactAssets.push(shockAsset === 'BTC' ? 'ETH' : 'BTC');
  }

  if (/recovery|recover|bounce|time|duration|days/.test(text)) {
    analyzeRecoveryTime = true;
  }

  return {
    shockAsset,
    shockPct,
    shockType,
    impactAssets,
    analyzeRecoveryTime,
    macroContext
  };
}
