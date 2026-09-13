import { config } from '../../config/index.js';

const SYSTEM_INSTRUCTION = `You are an institutional quantitative macro analyst and structured prompt compiler.
Your task is to parse ANY arbitrary natural language market scenario into a strictly typed Scenario Specification.

SCHEMA:
{
  "scenarioType": "asset_shock" | "macro_event" | "conditional_scenario" | "relative_shock" | "historical_analogue",
  "shock": {
    "target": "BTC" | "GC=F" | "FED" | "ECB" | "NVDA" | "SPY" | "QQQ" | "EUR" | string,
    "action": "price_drop" | "price_rise" | "rate_cut" | "rate_hike" | "inflation_shock" | "policy_easing",
    "magnitude": number, // e.g. 10 for 10%, 50 for 50bps, 0.5 for 50bps
    "units": "percent" | "bps" | "points",
    "direction": "negative" | "positive",
    "description": string // e.g. "Gold falls 10%", "ECB cuts rates by 50bps"
  },
  "conditions": [
    // Pre-existing market state conditions described in prompt, e.g.:
    // { "asset": "QQQ", "type": "trend", "value": "downtrend" }
  ],
  "impactAssets": [
    // Standard symbols for assets whose reaction is being analyzed, e.g. ["DX-Y.NYB", "QQQ", "BTC", "ETH", "GC=F", "EURUSD=X"]
  ],
  "analysisRequested": {
    "sensitivity": boolean,
    "recoveryTime": boolean,
    "analogues": boolean
  }
}

CRITICAL RULES:
1. ENTITY INTEGRITY:
   - "gold" -> "GC=F" (Commodity Gold). NEVER substitute BTC or equities!
   - "dollar" / "dxy" -> "DX-Y.NYB"
   - "nasdaq" / "tech" -> "QQQ"
   - "euro" -> "EURUSD=X"
   - "ECB" -> target: "ECB", units: "bps". NEVER turn ECB into BTC or equities!
   - "Fed" -> target: "FED", units: "bps".
2. UNIT INTEGRITY:
   - "50bps" / "50 basis points" -> magnitude: 50, units: "bps". NEVER treat as 50% price change.
   - "10%" / "drops 10%" -> magnitude: 10, units: "percent".
3. SCENARIO CLASSIFICATION:
   - "ECB cuts rates by 50bps" -> "macro_event" (target: "ECB", action: "rate_cut").
   - "Bitcoin falls 15% while the Nasdaq is already in a strong downtrend" -> "conditional_scenario" (target: "BTC", magnitude: 15, units: "percent", conditions: [{"asset": "QQQ", "type": "trend", "value": "downtrend"}]).
   - "If gold suddenly drops 10%, what tends to happen to the dollar, Nasdaq and Bitcoin?" -> "asset_shock" (target: "GC=F", magnitude: 10, units: "percent", impactAssets: ["DX-Y.NYB", "QQQ", "BTC"]).
4. Return ONLY valid, raw JSON. No markdown backticks.`;

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
  if (s === 'S&P' || s === 'S&P 500' || s === 'STOCKS' || s === 'EQUITIES') return 'SPY';
  if (s === 'BITCOIN') return 'BTC';
  if (s === 'ETHEREUM' || s === 'ETHER') return 'ETH';
  if (s === 'SOLANA') return 'SOL';
  if (s === 'NVIDIA') return 'NVDA';
  if (s === 'TESLA') return 'TSLA';
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
 * Universal deterministic parser that accurately respects entities, units, and conditions
 */
export function parseScenarioDeterministic(scenarioText) {
  const text = scenarioText.toLowerCase();

  let scenarioType = 'asset_shock';
  let target = null;
  let action = 'price_drop';
  let magnitude = 20.0;
  let direction = 'negative';
  let units = 'percent';
  const conditions = [];
  const impactAssets = [];
  let sensitivity = true;
  let recoveryTime = false;
  let analogues = false;

  // A. Detect Units and Magnitude
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
  const isDrop = /(fall|drop|crash|down|lose|loss|drawdown|plunge|slump|decline|sink|tumble|cut|hammered|dump|bleed)/.test(text);
  const isRise = /(rise|rally|pump|up|gain|surge|climb|spike|soar|hike|boost)/.test(text);

  if (isDrop) {
    direction = 'negative';
    action = units === 'bps' ? 'rate_cut' : 'price_drop';
  } else if (isRise) {
    direction = 'positive';
    action = units === 'bps' ? 'rate_hike' : 'price_rise';
  }

  // C. Detect Macro Central Banks
  const isEcb = /\becb\b|european central bank/.test(text);
  const isFed = /\bfed\b|federal reserve|fomc|powell/.test(text);

  if (isEcb) {
    target = 'ECB';
    scenarioType = 'macro_event';
    if (units !== 'percent') units = 'bps';
  } else if (isFed && (units === 'bps' || /rate|cut|hike|ease|easing|policy/.test(text))) {
    target = 'FED';
    scenarioType = 'macro_event';
    if (units !== 'percent') units = 'bps';
  }

  // D. Detect Asset Shocks (if not Central Bank)
  if (!target) {
    // Check which asset is directly linked to the shock verb or clause
    // e.g. "If gold suddenly drops", "Bitcoin falls 15%", "NVDA plunges", "BTC gets hammered"
    if (/(gold|xau).*(drop|fall|crash|plunge|down|lose|decline|sink)/.test(text) || /(if|suppose|assume)\s*(gold|xau)/.test(text)) {
      target = 'GC=F';
    } else if (/(btc|bitcoin).*(drop|fall|crash|plunge|down|lose|decline|hammered|dump)/.test(text) || /(if|suppose|assume|let's say)\s*(btc|bitcoin)/.test(text)) {
      target = 'BTC';
    } else if (/(eth|ethereum).*(drop|fall|crash|plunge|down|lose|decline)/.test(text) || /(if|suppose|assume)\s*(eth|ethereum)/.test(text)) {
      target = 'ETH';
    } else if (/(sol|solana).*(drop|fall|crash|plunge|down|lose|decline)/.test(text) || /(if|suppose|assume)\s*(sol|solana)/.test(text)) {
      target = 'SOL';
    } else if (/(nvda|nvidia).*(drop|fall|crash|plunge|down|lose|decline)/.test(text) || /(if|suppose|assume)\s*(nvda|nvidia)/.test(text)) {
      target = 'NVDA';
    } else if (/(nasdaq|qqq|tech).*(drop|fall|crash|plunge|down|lose|decline)/.test(text) || /(if|suppose|assume)\s*(nasdaq|qqq)/.test(text)) {
      target = 'QQQ';
    } else if (/(s&p|spy|stocks?).*(drop|fall|crash|plunge|down|lose|decline)/.test(text) || /(if|suppose|assume)\s*(s&p|spy)/.test(text)) {
      target = 'SPY';
    } else {
      // Default entity extraction fallback
      if (text.includes('gold')) target = 'GC=F';
      else if (text.includes('eth')) target = 'ETH';
      else if (text.includes('sol')) target = 'SOL';
      else if (text.includes('nvda')) target = 'NVDA';
      else target = 'BTC';
    }
  }

  // E. Detect Conditions (e.g. "while the Nasdaq is already in a strong downtrend")
  let textWithoutCondition = text;
  const condMatch = text.match(/(?:while|during|with)\s+([^.?!]+)/);
  if (condMatch) {
    const conditionText = condMatch[1].trim();
    let condAsset = 'QQQ';
    if (/nasdaq|qqq|tech/.test(conditionText)) condAsset = 'QQQ';
    else if (/btc|bitcoin/.test(conditionText)) condAsset = 'BTC';
    else if (/s&p|spy|stocks/.test(conditionText)) condAsset = 'SPY';

    if (/downtrend|bear|falling|slump|stress|contraction/.test(conditionText)) {
      conditions.push({ asset: condAsset, type: 'trend', value: 'downtrend', description: `${condAsset} in downtrend` });
      scenarioType = 'conditional_scenario';
    } else if (/uptrend|bull|rally|momentum/.test(conditionText)) {
      conditions.push({ asset: condAsset, type: 'trend', value: 'uptrend', description: `${condAsset} in uptrend` });
      scenarioType = 'conditional_scenario';
    }

    // Strip out the condition clause from text so condition assets aren't wrongly parsed as impact assets
    textWithoutCondition = text.replace(condMatch[0], '');
  }

  // F. Detect Impact Assets (assets whose reaction is requested)
  // Ensure the target itself is NOT accidentally added to impactAssets
  const candidateAssets = [
    { key: 'dollar', sym: 'DX-Y.NYB', regex: /\b(dollar|dxy|usd|greenback)\b/ },
    { key: 'euro', sym: 'EURUSD=X', regex: /\b(euro|eur)\b/ },
    { key: 'gold', sym: 'GC=F', regex: /\b(gold|xau)\b/ },
    { key: 'nasdaq', sym: 'QQQ', regex: /\b(nasdaq|tech|tech stocks|qqq)\b/ },
    { key: 'stocks', sym: 'SPY', regex: /\b(stocks|equities|s&p|spy)\b/ },
    { key: 'bitcoin', sym: 'BTC', regex: /\b(bitcoin|btc|crypto)\b/ },
    { key: 'ethereum', sym: 'ETH', regex: /\b(ethereum|eth)\b/ },
    { key: 'solana', sym: 'SOL', regex: /\b(solana|sol)\b/ }
  ];

  for (const cand of candidateAssets) {
    if (cand.regex.test(textWithoutCondition)) {
      // Do not add if it is the shock target
      if (cand.sym !== target) {
        if (!impactAssets.includes(cand.sym)) {
          impactAssets.push(cand.sym);
        }
      }
    }
  }

  if (impactAssets.length === 0) {
    // If conditional scenario, default impact assets to benchmark & crypto
    if (scenarioType === 'conditional_scenario') {
      impactAssets.push('QQQ', 'SPY', target === 'BTC' ? 'ETH' : 'BTC');
    } else {
      impactAssets.push(target === 'BTC' ? 'ETH' : 'BTC');
    }
  }

  // G. Check for Historical Analogue or Recovery Time
  if (/last time|history|analogue|precedent|what happened when/.test(text)) {
    if (scenarioType !== 'conditional_scenario' && scenarioType !== 'macro_event') {
      scenarioType = 'historical_analogue';
    }
    analogues = true;
  }

  if (/recovery|recover|bounce|how long/.test(text)) {
    recoveryTime = true;
  }

  if (scenarioType === 'asset_shock' && impactAssets.length === 1 && !conditions.length && !analogues) {
    scenarioType = 'relative_shock';
  }

  const result = {
    scenarioType,
    shock: {
      target,
      action,
      magnitude,
      direction,
      units,
      description: `${target} ${direction === 'negative' ? '-' : '+'}${magnitude}${units === 'percent' ? '%' : units}`
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
