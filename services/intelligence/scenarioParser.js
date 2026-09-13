import { config } from '../../config/index.js';

const SYSTEM_INSTRUCTION = `You are an institutional quantitative macro analyst and structured prompt compiler.
Your task is to parse ANY arbitrary natural language market scenario into a strictly typed Scenario Specification.

SCHEMA:
{
  "scenarioType": "asset_shock" | "macro_event" | "conditional_scenario" | "relative_shock" | "historical_analogue",
  "shock": {
    "target": "BTC" | "GC=F" | "FED" | "ECB" | "BOJ" | "INFLATION" | "NVDA" | "SPY" | "QQQ" | "EUR" | string | null,
    "action": "price_drop" | "price_rise" | "rate_cut" | "rate_hike" | "policy_change" | "inflation_surprise" | string | null,
    "magnitude": number | null, // ONLY set if user explicitly requested a percentage or bps (e.g. 10 for 10%, 50 for 50bps). If NOT specified, MUST be null!
    "units": "percent" | "bps" | "points" | null, // null if no numerical magnitude
    "direction": "negative" | "positive" | "neutral" | null,
    "description": string // e.g. "BoJ unexpected policy change", "US inflation upside surprise", "Gold falls 10%"
  },
  "conditions": [
    // Pre-existing market state conditions described in prompt, e.g.:
    // { "asset": "BTC", "type": "moving_average", "value": "below_200dma", "description": "BTC trading below 200-day average" }
  ],
  "impactAssets": [
    // Standard symbols for assets whose reaction is being analyzed, e.g. ["BTC", "SPY", "QQQ"]
  ],
  "analysisRequested": {
    "sensitivity": boolean,
    "recoveryTime": boolean,
    "analogues": boolean
  }
}

CRITICAL RULES:
1. NO INVENTED NUMBERS:
   - If user asks "when the Bank of Japan unexpectedly changes policy", magnitude is NULL, units is NULL, target is "BOJ", action is "policy_change". NEVER invent a 20% shock!
   - If user asks "when US inflation surprises to the upside", magnitude is NULL, units is NULL, target is "INFLATION", action is "inflation_surprise". NEVER invent a 20% shock!
   - ONLY assign magnitude if user explicitly wrote a percentage ("10%", "down 25%") or bps ("50bps").
2. ENTITY INTEGRITY:
   - "gold" -> "GC=F"
   - "Bank of Japan" / "BoJ" -> target: "BOJ", scenarioType: "macro_event"
   - "inflation" / "cpi" -> target: "INFLATION"
   - "ECB" -> target: "ECB"
   - "Fed" -> target: "FED"
3. Return ONLY valid, raw JSON. No markdown backticks.`;

function sanitizeJson(text) {
  if (!text) return '';
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  return clean.trim();
}

/**
 * Standardizes common naming to Yahoo / Bot Symbols
 */
export function normalizeSymbol(raw) {
  if (!raw) return 'BTC';
  const s = raw.toUpperCase().trim();
  if (s === 'GOLD' || s === 'XAU') return 'GC=F';
  if (s === 'DOLLAR' || s === 'DXY' || s === 'USD') return 'DX-Y.NYB';
  if (s === 'EURO' || s === 'EUR') return 'EURUSD=X';
  if (s === 'NASDAQ' || s === 'TECH' || s === 'TECH STOCKS') return 'QQQ';
  if (s === 'S&P' || s === 'S&P 500' || s === 'STOCKS' || s === 'EQUITIES' || s === 'US STOCKS' || s === 'US EQUITIES') return 'SPY';
  if (s === 'BITCOIN') return 'BTC';
  if (s === 'ETHEREUM' || s === 'ETHER') return 'ETH';
  if (s === 'SOLANA') return 'SOL';
  if (s === 'NVIDIA') return 'NVDA';
  if (s === 'TESLA') return 'TSLA';
  if (s === 'BOJ' || s === 'BANK OF JAPAN') return 'BOJ';
  if (s === 'FED' || s === 'FEDERAL RESERVE') return 'FED';
  if (s === 'ECB') return 'ECB';
  if (s === 'INFLATION' || s === 'CPI') return 'INFLATION';
  return s;
}

export async function parseScenarioSemantics(scenarioText) {
  // 1. Try LLM if available and not rate limited
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
        if (parsed.scenarioType && parsed.shock && parsed.shock.target) {
          // Normalize targets and impact symbols
          parsed.shock.target = normalizeSymbol(parsed.shock.target);
          if (Array.isArray(parsed.impactAssets)) {
            parsed.impactAssets = parsed.impactAssets.map(normalizeSymbol);
          }
          console.log('[Scenario Semantic Parser] LLM Successfully parsed scenario:', JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch (err) {
      // Non-fatal, fall back
    }
  }

  // 2. High-Accuracy General Semantic NLP Parser (Zero LLM reliance fallback)
  return parseScenarioDeterministic(scenarioText);
}

/**
 * Universal deterministic parser that accurately respects entities, units, conditions,
 * and NEVER manufactures default shocks when no numerical shock is requested.
 */
export function parseScenarioDeterministic(scenarioText) {
  const text = scenarioText.toLowerCase();

  let scenarioType = 'asset_shock';
  let target = null;
  let action = null;
  let magnitude = null; // NEVER default to 20 or any other number!
  let direction = null;
  let units = null;
  const conditions = [];
  const impactAssets = [];
  let sensitivity = false;
  let recoveryTime = false;
  let analogues = false;

  // A. Detect Units and Explicit Numerical Magnitude ONLY if present in prompt
  const bpsMatch = text.match(/(\d+(\.\d+)?)\s*(bps|basis\s*points?)/);
  const pctMatch = text.match(/(-?\d+(\.\d+)?)\s*%/);
  const fractionThird = /a third|one third|1\/3/.test(text);
  const fractionFifth = /one fifth|a fifth|1\/5/.test(text);
  const fractionQuarter = /a quarter|one quarter|1\/4/.test(text);
  const fractionHalf = /half|50%/.test(text);

  if (bpsMatch) {
    magnitude = parseFloat(bpsMatch[1]);
    units = 'bps';
  } else if (pctMatch) {
    magnitude = Math.abs(parseFloat(pctMatch[1]));
    units = 'percent';
  } else if (fractionThird) {
    magnitude = 33.3;
    units = 'percent';
  } else if (fractionFifth) {
    magnitude = 20.0;
    units = 'percent';
  } else if (fractionQuarter) {
    magnitude = 25.0;
    units = 'percent';
  } else if (fractionHalf) {
    magnitude = 50.0;
    units = 'percent';
  }

  // B. Detect Direction & Action
  const isDrop = /(fall|drop|crash|down|lose|loses|loss|drawdown|plunge|slump|decline|sink|tumble|cut|hammered|dump|bleed|crush|crushed)/.test(text);
  const isRise = /(rise|rally|pump|up|gain|surge|climb|spike|soar|hike|boost)/.test(text);

  if (isDrop) {
    direction = 'negative';
    action = units === 'bps' ? 'rate_cut' : 'price_drop';
  } else if (isRise) {
    direction = 'positive';
    action = units === 'bps' ? 'rate_hike' : 'price_rise';
  }

  // C. Detect Macro Entities & Events (Bank of Japan, Fed, ECB, Inflation)
  const isBoj = /\b(boj|bank of japan|japan|yen|jgb)\b/.test(text);
  const isEcb = /\becb\b|european central bank/.test(text);
  const isFed = /\bfed\b|federal reserve|fomc|powell/.test(text);
  const isInflation = /\b(inflation|cpi|consumer price index|ppi)\b/.test(text);

  if (isBoj) {
    target = 'BOJ';
    scenarioType = 'macro_event';
    action = action || 'policy_change';
  } else if (isEcb) {
    target = 'ECB';
    scenarioType = 'macro_event';
    action = action || (units === 'bps' ? (direction === 'positive' ? 'rate_hike' : 'rate_cut') : 'policy_easing');
  } else if (isFed && (units === 'bps' || /rate|cut|hike|ease|easing|policy/.test(text))) {
    target = 'FED';
    scenarioType = 'macro_event';
    action = action || (units === 'bps' ? (direction === 'positive' ? 'rate_hike' : 'rate_cut') : 'rate_cut');
  } else if (isInflation) {
    target = 'INFLATION';
    scenarioType = 'macro_event';
    action = /upside|hot|surge|higher|spike|accelerat/.test(text) ? 'inflation_upside_surprise' : 'inflation_event';
  }

  // D. Detect Conditions (e.g. "while BTC is trading below its 200-day average", "while Nasdaq in downtrend")
  let textWithoutCondition = text;
  const condMatch = text.match(/(?:while|during|with|when.*is|if.*is)\s+([^.?!]+)/);
  if (condMatch) {
    const conditionText = condMatch[1].trim();
    let condAsset = 'BTC';
    if (/nasdaq|qqq|tech/.test(conditionText)) condAsset = 'QQQ';
    else if (/btc|bitcoin/.test(conditionText)) condAsset = 'BTC';
    else if (/s&p|spy|stocks/.test(conditionText)) condAsset = 'SPY';

    if (/below.*200|under.*200|200.*dma|200.*average|200.*sma|200.*ema/.test(conditionText)) {
      conditions.push({
        asset: condAsset,
        type: 'moving_average',
        value: 'below_200dma',
        description: `${condAsset} below 200-day average`
      });
      scenarioType = 'conditional_scenario';
    } else if (/above.*200|over.*200/.test(conditionText)) {
      conditions.push({
        asset: condAsset,
        type: 'moving_average',
        value: 'above_200dma',
        description: `${condAsset} above 200-day average`
      });
      scenarioType = 'conditional_scenario';
    } else if (/downtrend|bear|falling|slump|stress|contraction/.test(conditionText)) {
      conditions.push({
        asset: condAsset,
        type: 'trend',
        value: 'downtrend',
        description: `${condAsset} in downtrend`
      });
      scenarioType = 'conditional_scenario';
    } else if (/uptrend|bull|rally|momentum/.test(conditionText)) {
      conditions.push({
        asset: condAsset,
        type: 'trend',
        value: 'uptrend',
        description: `${condAsset} in uptrend`
      });
      scenarioType = 'conditional_scenario';
    }

    textWithoutCondition = text.replace(condMatch[0], '');
  }

  // E. Detect Asset Shock Targets (Only if not a Macro Event)
  if (!target) {
    if (/\b(silver|xag)\b/.test(text)) {
      target = 'SI=F';
    } else if (/\b(oil|crude|wti|brent)\b/.test(text)) {
      target = 'CL=F';
    } else if (/(gold|xau).*(drop|fall|crash|plunge|down|lose|loses|decline|sink)/.test(text) || /(if|suppose|assume)\s*(gold|xau)/.test(text)) {
      target = 'GC=F';
    } else if (/(btc|bitcoin).*(drop|fall|crash|plunge|down|lose|loses|decline|hammered|dump)/.test(text) || /(if|suppose|assume|let's say)\s*(btc|bitcoin)/.test(text)) {
      target = 'BTC';
    } else if (/(eth|ethereum).*(drop|fall|crash|plunge|down|lose|loses|decline)/.test(text) || /(if|suppose|assume)\s*(eth|ethereum)/.test(text)) {
      target = 'ETH';
    } else if (/(sol|solana).*(drop|fall|crash|plunge|down|lose|loses|decline)/.test(text) || /(if|suppose|assume)\s*(sol|solana)/.test(text)) {
      target = 'SOL';
    } else if (/(nvda|nvidia).*(drop|fall|crash|plunge|down|lose|loses|decline)/.test(text) || /(if|suppose|assume)\s*(nvda|nvidia)/.test(text)) {
      target = 'NVDA';
    } else if (/(nasdaq|qqq|tech).*(drop|fall|crash|plunge|down|lose|loses|decline)/.test(text) || /(if|suppose|assume)\s*(nasdaq|qqq)/.test(text)) {
      target = 'QQQ';
    } else if (/(s&p|spy|stocks?).*(drop|fall|crash|plunge|down|lose|loses|decline)/.test(text) || /(if|suppose|assume)\s*(s&p|spy)/.test(text)) {
      target = 'SPY';
    } else {
      // If prompt specifically asks about an asset without an explicit shock
      if (text.includes('gold')) target = 'GC=F';
      else if (text.includes('silver')) target = 'SI=F';
      else if (text.includes('oil')) target = 'CL=F';
      else if (text.includes('eth')) target = 'ETH';
      else if (text.includes('sol')) target = 'SOL';
      else if (text.includes('nvda')) target = 'NVDA';
      else if (text.includes('btc') || text.includes('bitcoin')) target = 'BTC';
      else target = 'SPY';
    }
  }

  // F. Detect Impact Assets (assets whose reaction is requested)
  const candidateAssets = [
    { key: 'dollar', sym: 'DX-Y.NYB', regex: /\b(dollar|dxy|usd|greenback)\b/ },
    { key: 'euro', sym: 'EURUSD=X', regex: /\b(euro|eur)\b/ },
    { key: 'gold', sym: 'GC=F', regex: /\b(gold|xau)\b/ },
    { key: 'silver', sym: 'SI=F', regex: /\b(silver|xag)\b/ },
    { key: 'oil', sym: 'CL=F', regex: /\b(oil|crude|wti|brent)\b/ },
    { key: 'energy', sym: 'XLE', regex: /\b(energy|energy stocks|oil stocks|xle)\b/ },
    { key: 'nasdaq', sym: 'QQQ', regex: /\b(nasdaq|tech|tech stocks|qqq)\b/ },
    { key: 'stocks', sym: 'SPY', regex: /\b(stocks|equities|s&p|spy|us stocks|us equities|spx|equitie|equitiess)\b/ },
    { key: 'bitcoin', sym: 'BTC', regex: /\b(bitcoin|btc|crypto)\b/ },
    { key: 'ethereum', sym: 'ETH', regex: /\b(ethereum|eth)\b/ },
    { key: 'solana', sym: 'SOL', regex: /\b(solana|sol)\b/ }
  ];

  for (const cand of candidateAssets) {
    if (cand.regex.test(textWithoutCondition)) {
      if (cand.sym !== target && !impactAssets.includes(cand.sym)) {
        impactAssets.push(cand.sym);
      }
    }
  }

  if (impactAssets.length === 0) {
    if (scenarioType === 'conditional_scenario' || scenarioType === 'macro_event') {
      impactAssets.push('BTC', 'SPY', 'QQQ');
    } else {
      impactAssets.push(target === 'BTC' ? 'ETH' : 'BTC');
    }
  }

  // G. Analytical Mode Routing
  if (/recovery|recover|bounce|how long/.test(text)) {
    recoveryTime = true;
  }
  if (/last time|history|analogue|precedent|what happened when|what has happened/.test(text) || !magnitude) {
    analogues = true;
  }
  if (magnitude !== null) {
    sensitivity = true;
  }

  // Build strictly typed description (no invented percentages!)
  let shockDescription = '';
  if (target === 'BOJ') {
    shockDescription = 'Bank of Japan Unexpected Policy Change';
  } else if (target === 'INFLATION') {
    shockDescription = action === 'inflation_upside_surprise' ? 'US Inflation Upside Surprise' : 'US Inflation Event';
  } else if (magnitude !== null) {
    shockDescription = `${target} ${direction === 'negative' ? '-' : '+'}${magnitude}${units === 'percent' ? '%' : units}`;
  } else {
    shockDescription = `${target} ${action || 'Event'}`;
  }

  const result = {
    scenarioType,
    shock: {
      target,
      action,
      magnitude, // null if no numerical shock
      direction,
      units, // null if no numerical shock
      description: shockDescription
    },
    conditions,
    impactAssets,
    timeHorizon: 'medium',
    analysisRequested: {
      sensitivity,
      recoveryTime,
      analogues
    }
  };

  console.log('[Scenario Deterministic Parser] Parsed scenario:', JSON.stringify(result));
  return result;
}
