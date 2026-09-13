import { config } from '../../config/index.js';

const SYSTEM_INSTRUCTION = `You are an expert quantitative macroeconomist and market strategist.
Your job is to read an arbitrary natural language hypothetical scenario and extract a structured representation.
Do NOT convert one type of scenario into another (e.g. NEVER turn a rate cut into an equity rise proxy).
Identify the true nature of the question and the analytical requirements.

SCHEMA:
{
  "scenarioType": "asset_shock" | "macro_event" | "conditional_scenario" | "relative_shock" | "historical_analogue",
  "shock": {
    "target": "BTC",
    "action": "price_drop",
    "magnitude": 20.0,
    "direction": "negative",
    "units": "percent",
    "description": "Bitcoin drops 20%"
  },
  "conditions": [],
  "impactAssets": ["ETH", "QQQ"],
  "timeHorizon": "medium",
  "analysisRequested": {
    "sensitivity": true,
    "recoveryTime": false,
    "analogues": false
  }
}
Return ONLY valid raw JSON.`;

function sanitizeJson(text) {
  if (!text) return '';
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.slice(7);
  else if (clean.startsWith('```')) clean = clean.slice(3);
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  return clean.trim();
}

export async function parseScenarioSemantics(scenarioText) {
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
        if (parsed.scenarioType && parsed.shock) {
          return parsed;
        }
      }
    } catch (err) {
      // Gracefully fall back to deterministic NLP parser
    }
  }

  return parseScenarioDeterministic(scenarioText);
}

export function parseScenarioDeterministic(scenarioText) {
  const text = scenarioText.toLowerCase();

  let scenarioType = 'asset_shock';
  let target = 'BTC';
  let action = 'price_drop';
  let magnitude = 20.0;
  let direction = 'negative';
  let units = 'percent';
  const conditions = [];
  const impactAssets = [];
  let sensitivity = true;
  let recoveryTime = false;
  let analogues = false;

  // 1. Check for specific historical event / analogue query
  if (/last time|past precedent|historical analogue|what happened when|how did.*react the last time/.test(text)) {
    scenarioType = 'historical_analogue';
    analogues = true;
  }

  // 2. Identify Macro shocks vs Asset shocks
  if (/fed\b.*(cut|easing|ease|lowered|rate cut)/.test(text) || /rate cut/.test(text)) {
    target = 'FED';
    action = 'rate_cut';
    units = 'bps';
    magnitude = 50;
    direction = 'negative';
    if (!analogues) scenarioType = 'macro_event';
  } else if (/fed\b.*(hike|hiking|tightening|raised|rate hike)/.test(text) || /rate hike/.test(text)) {
    target = 'FED';
    action = 'rate_hike';
    units = 'bps';
    magnitude = 25;
    direction = 'positive';
    if (!analogues) scenarioType = 'macro_event';
  } else if (/cpi|inflation/.test(text) && /hot|surprise|jump|spike/.test(text)) {
    target = 'CPI';
    action = 'inflation_surprise';
    units = 'points';
    magnitude = 0.5;
    direction = 'positive';
    if (!analogues) scenarioType = 'macro_event';
  }

  // 3. Conditional qualifiers (e.g. "while already in a strong uptrend")
  if (/while|already in|during|if.*and/.test(text)) {
    if (/uptrend|bull|rally|momentum/.test(text)) {
      conditions.push('Asset or market in strong uptrend');
      if (scenarioType !== 'historical_analogue') scenarioType = 'conditional_scenario';
    } else if (/downtrend|bear|recession|contraction/.test(text)) {
      conditions.push('Liquidity contraction or macro stress');
      if (scenarioType !== 'historical_analogue') scenarioType = 'conditional_scenario';
    }
  }

  // 4. Magnitude and units parsing (fractions, percentages, bps)
  const pctMatch = text.match(/(-?\d+(\.\d+)?)\s*%/);
  if (pctMatch) {
    magnitude = parseFloat(pctMatch[1]);
    units = 'percent';
  } else if (/a third|one third|1\/3/.test(text)) {
    magnitude = 33.3;
    units = 'percent';
  } else if (/one fifth|a fifth|1\/5/.test(text)) {
    magnitude = 20.0;
    units = 'percent';
  } else if (/half|50%/.test(text)) {
    magnitude = 50.0;
    units = 'percent';
  } else if (/quarter|25%/.test(text)) {
    magnitude = 25.0;
    units = 'percent';
  } else if (/(\d+)\s*bps|(\d+)\s*basis/.test(text)) {
    const m = text.match(/(\d+)\s*(bps|basis)/);
    magnitude = m ? parseInt(m[1], 10) : 50;
    units = 'bps';
  }

  // Direction
  if (/(fall|drop|crash|down|lose|loss|drawdown|plunge|slump|decline|sink|tumble|cut)/.test(text)) {
    direction = 'negative';
    action = action.includes('rate') ? action : 'price_drop';
  } else if (/(rise|rally|pump|up|gain|surge|climb|spike|soar|hike)/.test(text)) {
    direction = 'positive';
    action = action.includes('rate') ? action : 'price_rise';
  }

  // 5. Target Asset Identification (if not macro FED/CPI)
  if (target !== 'FED' && target !== 'CPI') {
    // Who is receiving the shock verb?
    const btcShock = /(bitcoin|btc).*(loses|drops|falls|crashes|plunges|drawdown|drops)/.test(text) || /(if|suppose|assume)\s*(bitcoin|btc)/.test(text);
    const ethShock = /(ethereum|eth).*(loses|drops|falls|crashes|plunges|drawdown)/.test(text) || /(if|suppose|assume)\s*(ethereum|eth)/.test(text);
    const nvdaShock = /(nvidia|nvda).*(loses|drops|falls|crashes|plunges|drawdown)/.test(text) || /(if|suppose|assume)\s*(nvidia|nvda)/.test(text);
    const solShock = /(solana|sol).*(loses|drops|falls|crashes|plunges|drawdown)/.test(text) || /(if|suppose|assume)\s*(solana|sol)/.test(text);
    const spyShock = /(s&p|spy).*(loses|drops|falls|crashes|plunges|drawdown)/.test(text) || /(if|suppose|assume)\s*(s&p|spy)/.test(text);

    if (nvdaShock) target = 'NVDA';
    else if (ethShock) target = 'ETH';
    else if (solShock) target = 'SOL';
    else if (spyShock) target = 'SPY';
    else if (btcShock) target = 'BTC';
    else target = 'BTC'; // default to BTC if crypto shock
  }

  // 6. Impact Assets Identification (assets whose reaction is asked)
  if (/ethereum|eth\b/.test(text) && target !== 'ETH') impactAssets.push('ETH');
  if (/solana|sol\b/.test(text) && target !== 'SOL') impactAssets.push('SOL');
  if (/nasdaq|qqq|tech/.test(text) && target !== 'QQQ') impactAssets.push('QQQ');
  if (/bitcoin|btc\b/.test(text) && target !== 'BTC') impactAssets.push('BTC');
  if (/dollar|dxy|greenback|usd/.test(text) && target !== 'DX-Y.NYB') impactAssets.push('DX-Y.NYB');
  if (/gold|xau/.test(text) && target !== 'GC=F') impactAssets.push('GC=F');
  if (/s&p|spy|stock market/.test(text) && target !== 'SPY') impactAssets.push('SPY');

  if (impactAssets.length === 0) {
    impactAssets.push(target === 'BTC' ? 'ETH' : 'BTC');
  }

  // If two assets are directly compared in an asset shock, label relative_shock
  if (scenarioType === 'asset_shock' && impactAssets.length === 1 && !analogues) {
    scenarioType = 'relative_shock';
  }

  if (/recovery|recover|bounce|how long|time/.test(text)) {
    recoveryTime = true;
  }

  return {
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
}
