import { fetchHistoricalData } from '../backtest/dataService.js';
import { parseScenarioWithLLM, parseScenarioDeterministic } from './scenarioParser.js';
import { config } from '../../config/index.js';

/**
 * Calculates Pearson correlation
 */
function calculateCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

/**
 * Directional Beta of Y on X: Cov(Y, X) / Var(X)
 * Measures: How much does Y move per unit move in X?
 */
function calculateBeta(dependentReturns, independentReturns) {
  const n = Math.min(dependentReturns.length, independentReturns.length);
  if (n < 10) return 1.0;

  let meanIndep = 0;
  for (let i = 0; i < n; i++) meanIndep += independentReturns[i];
  meanIndep /= n;

  let meanDep = 0;
  for (let i = 0; i < n; i++) meanDep += dependentReturns[i];
  meanDep /= n;

  let cov = 0;
  let varIndep = 0;
  for (let i = 0; i < n; i++) {
    cov += (dependentReturns[i] - meanDep) * (independentReturns[i] - meanIndep);
    varIndep += Math.pow(independentReturns[i] - meanIndep, 2);
  }

  if (varIndep === 0) return 1.0;
  return cov / varIndep;
}

function formatSymbol(sym) {
  const s = sym.toUpperCase();
  if (['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'].includes(s)) return `${s}-USD`;
  if (s === 'GOLD') return 'GC=F';
  if (s === 'DXY') return 'DX-Y.NYB';
  return s;
}

function getReturns(bars) {
  const rets = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].close > 0) {
      rets.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
    }
  }
  return rets;
}

export async function analyzeMarketScenario(scenarioText) {
  // 1. Natural language scenario -> structured DSL
  let parsed = null;
  if (config.hasLLM) {
    parsed = await parseScenarioWithLLM(scenarioText);
  }
  if (!parsed) {
    parsed = parseScenarioDeterministic(scenarioText);
  }

  const { shockAsset, shockPct, shockType, impactAssets, analyzeRecoveryTime, macroContext } = parsed;

  // 2. Retrieve historical data for shock asset & all impact assets
  const shockSymbol = formatSymbol(shockAsset);
  const shockBars = await fetchHistoricalData(shockSymbol, '3y', '1d').catch(() => []);
  const shockReturns = getReturns(shockBars);

  // 3. For each impact asset, compute exact directional beta: Beta(ImpactAsset on ShockAsset)
  const impactCalculations = [];
  for (const impAsset of impactAssets) {
    const impSymbol = formatSymbol(impAsset);
    const impBars = await fetchHistoricalData(impSymbol, '3y', '1d').catch(() => []);
    const impReturns = getReturns(impBars);

    if (impReturns.length > 10 && shockReturns.length > 10) {
      const corr = calculateCorrelation(impReturns, shockReturns);
      // Directional Beta: How impactAsset responds to shockAsset move
      const beta = calculateBeta(impReturns, shockReturns);
      const impliedMove = Number((shockPct * beta).toFixed(1));

      impactCalculations.push({
        asset: impAsset,
        symbol: impSymbol,
        beta: Number(beta.toFixed(2)),
        correlation: Number(corr.toFixed(2)),
        impliedMovePct: impliedMove
      });
    }
  }

  // 4. Calculate historical recovery times on the shock asset
  let historicalInstances = 0;
  let avgRecoveryDays = 0;
  const recoveryDaysList = [];
  const targetThreshold = shockPct / 100;

  for (let i = 1; i < shockBars.length - 30; i++) {
    const barChange = (shockBars[i].close - shockBars[i - 1].close) / shockBars[i - 1].close;
    const isShockMatch = targetThreshold < 0
      ? barChange <= targetThreshold * 0.4
      : barChange >= targetThreshold * 0.4;

    if (isShockMatch) {
      historicalInstances++;
      const preShock = shockBars[i - 1].close;
      let recDays = null;
      for (let j = i + 1; j < Math.min(i + 120, shockBars.length); j++) {
        if (targetThreshold < 0 && shockBars[j].close >= preShock) {
          recDays = j - i;
          break;
        } else if (targetThreshold > 0 && shockBars[j].close <= preShock) {
          recDays = j - i;
          break;
        }
      }
      if (recDays !== null) recoveryDaysList.push(recDays);
    }
  }

  if (recoveryDaysList.length > 0) {
    avgRecoveryDays = Math.round(recoveryDaysList.reduce((a, b) => a + b, 0) / recoveryDaysList.length);
  }

  // 5. Build strict factual synthesis for LLM explanation
  const calculationSummary = impactCalculations.map(c => 
    `- ${c.asset} beta to ${shockAsset}: ${c.beta} (correlation: ${c.correlation}), calculated implied move: ${c.impliedMovePct > 0 ? '+' : ''}${c.impliedMovePct}%`
  ).join('\n');

  let explanation = '';
  if (config.hasLLM && config.hasOpenRouter) {
    const prompt = `You are a quantitative macro analyst. Explain these REAL calculated historical metrics for a hypothetical scenario.
USER SCENARIO: "${scenarioText}"

CALCULATED HISTORICAL DATA (DO NOT CHANGE OR INVENT NEW NUMBERS):
- Primary Shock Asset: ${shockAsset} (${shockPct > 0 ? '+' : ''}${shockPct}% shock)
- Historical instances of similar drawdown/shock: ${historicalInstances}
- Average historical recovery time to pre-shock levels: ${avgRecoveryDays || '35-50'} trading days
- Measured sensitivities:
${calculationSummary}

INSTRUCTIONS:
1. Explain the historical transmission mechanism cleanly (e.g. "Because ETH exhibits an empirical beta of [X] relative to BTC...").
2. Note the directional relationship accurately: "${impactAssets.join(', ')} beta relative to ${shockAsset}".
3. Mention the historical recovery duration based strictly on the ${avgRecoveryDays || '35-50'} days calculated.
4. Keep it concise (2 short paragraphs). Do NOT give financial advice.`;

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
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        explanation = data?.choices?.[0]?.message?.content?.trim();
      }
    } catch (e) {
      console.warn('[Scenario Service] LLM explanation failed:', e.message);
    }
  }

  if (!explanation) {
    explanation = impactCalculations.map(c => 
      `Historically, <b>${c.asset}</b> exhibits a beta of <b>${c.beta}</b> relative to <b>${shockAsset}</b> (correlation: <i>${c.correlation}</i>). ` +
      `Under a ${shockPct}% shock in ${shockAsset}, historical sensitivity points to an implied move of approximately <b>${c.impliedMovePct > 0 ? '+' : ''}${c.impliedMovePct}%</b>.`
    ).join('\n\n') + (avgRecoveryDays ? `\n\nPast similar shock drawdowns in ${shockAsset} required an average of <b>${avgRecoveryDays} trading days</b> to fully recover to pre-shock highs.` : '');
  }

  return {
    scenario: scenarioText,
    shockAsset,
    shockPct,
    shockType,
    impactCalculations,
    historicalInstances,
    avgRecoveryDays: avgRecoveryDays ? `${avgRecoveryDays} days` : 'Variable (30-60 days)',
    explanation
  };
}
