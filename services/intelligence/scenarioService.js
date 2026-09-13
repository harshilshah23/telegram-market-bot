import { fetchHistoricalData } from '../backtest/dataService.js';
import { parseScenarioSemantics } from './scenarioParser.js';
import { HISTORICAL_MACRO_EVENTS } from './historicalEventsCatalog.js';
import { config } from '../../config/index.js';

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
  return den === 0 ? 0 : Number((num / den).toFixed(2));
}

function calculateBeta(dependentReturns, independentReturns) {
  const n = Math.min(dependentReturns.length, independentReturns.length);
  if (n < 10) return 1.0;
  let meanIndep = 0, meanDep = 0;
  for (let i = 0; i < n; i++) {
    meanIndep += independentReturns[i];
    meanDep += dependentReturns[i];
  }
  meanIndep /= n;
  meanDep /= n;
  let cov = 0, varIndep = 0;
  for (let i = 0; i < n; i++) {
    cov += (dependentReturns[i] - meanDep) * (independentReturns[i] - meanIndep);
    varIndep += Math.pow(independentReturns[i] - meanIndep, 2);
  }
  return varIndep === 0 ? 1.0 : Number((cov / varIndep).toFixed(2));
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

/**
 * Calculates actual subsequent performance across impact assets following a historical event date
 */
async function calculatePostEventPerformance(eventDateStr, impactAssets) {
  const targetTs = Math.floor(new Date(eventDateStr).getTime() / 1000);
  const results = {};

  for (const asset of impactAssets) {
    const sym = formatSymbol(asset);
    const bars = await fetchHistoricalData(sym, '5y', '1d').catch(() => []);
    if (!bars || bars.length === 0) continue;

    // Find bar closest to event date
    let eventIdx = -1;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time >= targetTs) {
        eventIdx = i;
        break;
      }
    }

    if (eventIdx !== -1 && eventIdx + 30 < bars.length) {
      const baseClose = bars[eventIdx].close;
      const d1 = Number((((bars[eventIdx + 1]?.close - baseClose) / baseClose) * 100).toFixed(2));
      const d7 = Number((((bars[eventIdx + 5]?.close - baseClose) / baseClose) * 100).toFixed(2));
      const d30 = Number((((bars[eventIdx + 22]?.close - baseClose) / baseClose) * 100).toFixed(2));
      results[asset] = { d1, d7, d30 };
    }
  }

  return results;
}

export async function analyzeMarketScenario(scenarioText) {
  // 1. Semantic scenario understanding
  const parsed = await parseScenarioSemantics(scenarioText);
  const { scenarioType, shock, conditions = [], impactAssets = [], analysisRequested = {} } = parsed;

  const results = {
    scenario: scenarioText,
    scenarioType,
    shock,
    conditions,
    impactAssets,
    // Backward-compatible aliases for keyboards and older callers
    asset: shock?.target || 'BTC',
    shockAsset: shock?.target || 'BTC',
    shockPct: (shock?.direction === 'negative' ? -1 : 1) * (shock?.magnitude || 20),
    methodology: '',
    sampleSize: 0,
    confidenceWarning: null,
    sensitivityResults: [],
    historicalPrecedents: [],
    recoveryStats: null,
    explanation: ''
  };

  // METHOD 1: MACRO EVENT / CONDITIONAL / HISTORICAL ANALOGUE
  if (scenarioType === 'macro_event' || scenarioType === 'conditional_scenario' || scenarioType === 'historical_analogue' || shock.target === 'FED') {
    results.methodology = 'Historical Event Window & Post-Event Performance Calculation';
    
    // Fetch real occurrences from catalog
    let relevantEvents = HISTORICAL_MACRO_EVENTS['FED_RATE_CUT_50BPS'] || [];

    // If conditional (e.g. while already in an uptrend)
    if (conditions.some(c => c.toLowerCase().includes('uptrend'))) {
      relevantEvents = relevantEvents.filter(e => e.btcTrend === 'uptrend');
    }

    results.sampleSize = relevantEvents.length;
    if (results.sampleSize < 3) {
      results.confidenceWarning = `Small historical sample size (${results.sampleSize} matching occurrence${results.sampleSize === 1 ? '' : 's'}). Historical outcomes should be treated as illustrative case studies, not statistical certainties.`;
    }

    // Calculate real returns post-event for all occurrences with data
    for (const evt of relevantEvents) {
      const perf = await calculatePostEventPerformance(evt.date, impactAssets);
      results.historicalPrecedents.push({
        name: evt.name,
        date: evt.date,
        context: evt.context,
        subsequentPerformance: perf
      });
    }

    // Also calculate standard 3-year asset sensitivities to S&P 500 / Macro benchmark
    const macroBars = await fetchHistoricalData('^GSPC', '3y', '1d').catch(() => []);
    const macroRets = getReturns(macroBars);

    for (const imp of impactAssets) {
      const impSym = formatSymbol(imp);
      const impBars = await fetchHistoricalData(impSym, '3y', '1d').catch(() => []);
      const impRets = getReturns(impBars);
      if (impRets.length > 10 && macroRets.length > 10) {
        const beta = calculateBeta(impRets, macroRets);
        const corr = calculateCorrelation(impRets, macroRets);
        results.sensitivityResults.push({
          asset: imp,
          betaToBenchmark: beta,
          benchmarkName: 'S&P 500 (^GSPC)',
          correlation: corr
        });
      }
    }
  } 
  // METHOD 2: DIRECT ASSET PRICE SHOCK / RELATIVE SHOCK
  else {
    results.methodology = 'Directional Empirical Sensitivity & Drawdown Recovery Analysis';
    const shockSym = formatSymbol(shock.target);
    const shockBars = await fetchHistoricalData(shockSym, '5y', '1d').catch(() => []);
    const shockRets = getReturns(shockBars);

    // Calculate directional beta for each impact asset
    for (const imp of impactAssets) {
      const impSym = formatSymbol(imp);
      const impBars = await fetchHistoricalData(impSym, '5y', '1d').catch(() => []);
      const impRets = getReturns(impBars);

      if (impRets.length > 10 && shockRets.length > 10) {
        const beta = calculateBeta(impRets, shockRets);
        const corr = calculateCorrelation(impRets, shockRets);
        const magnitude = shock.magnitude || 20;
        const sign = shock.direction === 'negative' ? -1 : 1;
        const impliedMove = Number(((sign * magnitude) * beta).toFixed(1));

        results.sensitivityResults.push({
          asset: imp,
          betaToShockAsset: beta,
          correlation: corr,
          impliedSensitivityMovePct: impliedMove
        });
      }
    }

    // Calculate genuine historical drawdown recovery times
    const targetThreshold = (shock.direction === 'negative' ? -1 : 1) * ((shock.magnitude || 20) / 100);
    const recoveryDaysList = [];
    let occurrences = 0;

    for (let i = 1; i < shockBars.length - 30; i++) {
      const barChange = (shockBars[i].close - shockBars[i - 1].close) / shockBars[i - 1].close;
      const isMatch = targetThreshold < 0 ? barChange <= targetThreshold * 0.4 : barChange >= targetThreshold * 0.4;
      if (isMatch) {
        occurrences++;
        const preShock = shockBars[i - 1].close;
        let recDays = null;
        for (let j = i + 1; j < Math.min(i + 150, shockBars.length); j++) {
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

    results.sampleSize = occurrences;
    if (occurrences < 4) {
      results.confidenceWarning = `Sample size is limited to ${occurrences} historical instances of comparable magnitude in the 5Y lookback.`;
    }

    const avgRecovery = recoveryDaysList.length > 0 
      ? Math.round(recoveryDaysList.reduce((a, b) => a + b, 0) / recoveryDaysList.length)
      : null;

    results.recoveryStats = {
      occurrences,
      avgRecoveryTradingDays: avgRecovery,
      minRecoveryDays: recoveryDaysList.length > 0 ? Math.min(...recoveryDaysList) : null,
      maxRecoveryDays: recoveryDaysList.length > 0 ? Math.max(...recoveryDaysList) : null
    };
  }

  // LLM SYNTHESIS OF DETERMINISTIC RESULTS
  if (config.hasLLM && config.hasOpenRouter) {
    const prompt = `You are a quantitative macro strategist. Explain the following REAL calculated historical metrics for a hypothetical user scenario.
USER SCENARIO: "${scenarioText}"

STRUCTURED SCENARIO:
- Scenario Type: ${results.scenarioType}
- Shock: ${JSON.stringify(results.shock)}
- Conditions: ${JSON.stringify(results.conditions)}
- Methodology Used: ${results.methodology}
- Sample Size: ${results.sampleSize}
- Confidence Warning: ${results.confidenceWarning || 'Sufficient sample size'}

DETERMINISTIC CALCULATED RESULTS (DO NOT ALTER ANY NUMBERS):
${results.sensitivityResults.length > 0 ? 'Sensitivities:\n' + JSON.stringify(results.sensitivityResults, null, 2) : ''}
${results.historicalPrecedents.length > 0 ? 'Historical Occurrences Post-Event Performance:\n' + JSON.stringify(results.historicalPrecedents, null, 2) : ''}
${results.recoveryStats ? 'Recovery Statistics:\n' + JSON.stringify(results.recoveryStats, null, 2) : ''}

INSTRUCTIONS:
1. Explain what actually occurred or what the calculated sensitivity indicates.
2. If this is a macro event (e.g. Fed cut), cite the specific historical occurrences and their real 1-day/7-day/30-day performance.
3. If this is an asset shock, explain the directional sensitivity and recovery duration strictly based on calculated values.
4. Mention the confidence warning if sample size is small.
5. Keep it institutional, objective, concise (2 to 3 paragraphs). No financial advice.`;

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
        results.explanation = data?.choices?.[0]?.message?.content?.trim();
      }
    } catch (e) {
      console.warn('[Scenario Service] LLM synthesis fallback:', e.message);
    }
  }

  results.impactCalculations = results.sensitivityResults.map(r => ({
    asset: r.asset,
    beta: r.betaToShockAsset ?? r.betaToBenchmark,
    correlation: r.correlation,
    impliedMovePct: r.impliedSensitivityMovePct ?? 0
  }));

  return results;
}
