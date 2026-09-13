import { fetchHistoricalData, fetchHistoricalWindow } from '../backtest/dataService.js';
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
 * Uses fetchHistoricalWindow to ensure dates outside the 5-year default window return true performance
 */
async function calculatePostEventPerformance(eventDateStr, impactAssets) {
  const eventTs = Math.floor(new Date(eventDateStr).getTime() / 1000);
  const startTs = eventTs - 7 * 86400;
  const endTs = eventTs + 55 * 86400;
  const results = {};

  for (const asset of impactAssets) {
    const sym = formatSymbol(asset);
    const bars = await fetchHistoricalWindow(sym, startTs, endTs).catch(() => null);
    if (!bars || bars.length < 3) continue;

    // Find bar closest to event date
    let eventIdx = -1;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time >= eventTs) {
        eventIdx = i;
        break;
      }
    }

    if (eventIdx !== -1 && eventIdx < bars.length - 1) {
      const baseClose = bars[eventIdx].close;
      const d1Idx = Math.min(eventIdx + 1, bars.length - 1);
      const d7Idx = Math.min(eventIdx + 5, bars.length - 1);
      const d30Idx = Math.min(eventIdx + 22, bars.length - 1);

      const d1 = Number((((bars[d1Idx].close - baseClose) / baseClose) * 100).toFixed(2));
      const d7 = Number((((bars[d7Idx].close - baseClose) / baseClose) * 100).toFixed(2));
      const d30 = Number((((bars[d30Idx].close - baseClose) / baseClose) * 100).toFixed(2));
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

  // METHOD 1: MACRO EVENT (Fed, ECB, Central Bank Rate Decisions)
  if (scenarioType === 'macro_event' || shock.target === 'FED' || shock.target === 'ECB') {
    results.methodology = 'Authentic Historical Macro Event Windows & Empirical Sensitivities';
    
    // Select the authentic macro catalog based on central bank entity
    let relevantEvents = [];
    if (shock.target === 'ECB') {
      relevantEvents = HISTORICAL_MACRO_EVENTS['ECB_RATE_CUT'] || [];
    } else {
      relevantEvents = HISTORICAL_MACRO_EVENTS['FED_RATE_CUT'] || [];
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
  // METHOD 2: CONDITIONAL SCENARIO (Joint Multi-Condition Period Search)
  else if (scenarioType === 'conditional_scenario') {
    results.methodology = 'Joint Multi-Condition Historical Scan (Asset Shock & Benchmark Regime)';
    
    // Extract condition parameters
    const cond = conditions[0] || {};
    const condAsset = cond.asset || 'QQQ';
    const condTrend = cond.value || 'downtrend';
    const shockSym = formatSymbol(shock.target);
    const condSym = formatSymbol(condAsset);

    const [shockBars, condBars] = await Promise.all([
      fetchHistoricalData(shockSym, '5y', '1d').catch(() => []),
      fetchHistoricalData(condSym, '5y', '1d').catch(() => [])
    ]);

    if (shockBars && shockBars.length > 50 && condBars && condBars.length > 50) {
      // Calculate 50-day EMA on benchmark to establish trend regime
      const k = 2 / (50 + 1);
      let ema = condBars[0].close;
      const condMap = new Map();
      for (let i = 0; i < condBars.length; i++) {
        ema = condBars[i].close * k + ema * (1 - k);
        const isDowntrend = condBars[i].close < ema;
        condMap.set(condBars[i].date, { close: condBars[i].close, ema50: ema, isDowntrend });
      }

      // Search for joint conditions: Shock asset drop while benchmark condition is true
      // Group nearby dates into distinct clusters (separated by >= 15 trading days)
      const targetThreshold = (shock.magnitude || 15) / 100;
      let lastClusterIdx = -999;
      const matchingEvents = [];

      for (let i = 5; i < shockBars.length - 25; i++) {
        const condInfo = condMap.get(shockBars[i].date);
        if (!condInfo) continue;
        const trendMatches = condTrend === 'downtrend' ? condInfo.isDowntrend : !condInfo.isDowntrend;
        if (!trendMatches) continue;

        const rolling5dDrop = (shockBars[i].close - shockBars[i - 5].close) / shockBars[i - 5].close;
        const dailyDrop = (shockBars[i].close - shockBars[i - 1].close) / shockBars[i - 1].close;
        const isShockMatch = rolling5dDrop <= -targetThreshold || dailyDrop <= -(targetThreshold * 0.65);

        if (isShockMatch && i - lastClusterIdx >= 15) {
          lastClusterIdx = i;
          const evtDate = shockBars[i].date;
          const dropMag = rolling5dDrop <= -targetThreshold ? rolling5dDrop : dailyDrop;
          matchingEvents.push({
            date: evtDate,
            name: `${shock.target} ${Math.abs((dropMag * 100).toFixed(1))}% Drawdown (${condAsset} in ${condTrend})`,
            context: `${condAsset} was trading below its 50d EMA (${condInfo.close.toFixed(1)} vs ${condInfo.ema50.toFixed(1)}) as ${shock.target} dropped ${Math.abs((dropMag * 100).toFixed(1))}%`
          });
        }
      }

      results.sampleSize = matchingEvents.length;
      if (results.sampleSize < 4) {
        results.confidenceWarning = `Identified ${results.sampleSize} distinct historical period${results.sampleSize === 1 ? '' : 's'} where both conditions occurred simultaneously in the 5Y lookback.`;
      }

      // Calculate post-event forward returns for all matching periods
      for (const evt of matchingEvents) {
        const perf = await calculatePostEventPerformance(evt.date, [shock.target, ...impactAssets]);
        results.historicalPrecedents.push({
          name: evt.name,
          date: evt.date,
          context: evt.context,
          subsequentPerformance: perf
        });
      }

      // Calculate beta sensitivities between shock asset and impact assets
      const shockRets = getReturns(shockBars);
      for (const imp of impactAssets) {
        const impSym = formatSymbol(imp);
        const impBars = await fetchHistoricalData(impSym, '5y', '1d').catch(() => []);
        const impRets = getReturns(impBars);
        if (impRets.length > 10 && shockRets.length > 10) {
          const beta = calculateBeta(impRets, shockRets);
          const corr = calculateCorrelation(impRets, shockRets);
          results.sensitivityResults.push({
            asset: imp,
            betaToShockAsset: beta,
            correlation: corr,
            impliedSensitivityMovePct: Number((-(shock.magnitude || 15) * beta).toFixed(1))
          });
        }
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

  // LLM SYNTHESIS & PLAIN-ENGLISH TAKEAWAY OF DETERMINISTIC RESULTS
  let plainEnglishSynthesis = null;

  if (config.hasLLM && config.hasOpenRouter) {
    const prompt = `You are a senior investment strategist and plain-English market communicator.
Explain the following REAL calculated historical metrics for a hypothetical user scenario.
The user is NOT a quant. They want to know: "So what does this actually mean for a normal person?"

USER SCENARIO: "${scenarioText}"

STRUCTURED SCENARIO:
- Scenario Type: ${results.scenarioType}
- Shock: ${JSON.stringify(results.shock)}
- Conditions: ${JSON.stringify(results.conditions)}
- Methodology Used: ${results.methodology}
- Sample Size: ${results.sampleSize}
- Confidence Warning: ${results.confidenceWarning || 'None'}

DETERMINISTIC CALCULATED RESULTS (EVIDENCE - DO NOT ALTER NUMBERS):
${results.sensitivityResults.length > 0 ? 'Sensitivities:\n' + JSON.stringify(results.sensitivityResults, null, 2) : ''}
${results.historicalPrecedents.length > 0 ? 'Historical Occurrences Post-Event Performance:\n' + JSON.stringify(results.historicalPrecedents, null, 2) : ''}
${results.recoveryStats ? 'Recovery Statistics:\n' + JSON.stringify(results.recoveryStats, null, 2) : ''}

CRITICAL COMMUNICATION GUIDELINES:
1. Translate quantitative metrics (beta, correlation, recovery days) into intuitive takeaways.
   - e.g. Instead of just "Beta is 1.13, Corr 0.84", explain: "ETH has historically moved in the same direction as BTC during comparable selloffs, often with an amplified percentage move. That relationship is strong historically, but not a guaranteed outcome."
2. Ground all inferences strictly in the calculated numbers above. Never invent facts or unsupported narratives.
3. Distinguish clearly between:
   - FACT: What the data directly shows.
   - INFERENCE: What that evidence reasonably suggests ("Historically, this has tended to...", "The data suggests...", "What stands out is...").
   - SPECULATION / CAVEAT: What could happen or limitations ("The important caveat is...", "Historical relationships are empirical sensitivities, not guarantees").
4. STRUCTURE YOUR RESPONSE WITH THESE EXACT SECTIONS:
   **Quick Take**
   (1-2 clear, punchy sentences in normal human language summarizing the primary takeaway)

   **So What Does This Actually Mean?**
   (2-3 bullet points translating the data into practical insights: how the assets relate, what the recovery timeline looks like, and what the key dynamic is)

   **Key Caveats & Limitations**
   (1-2 sentences on sample size, shifting regimes, or why past moves aren't guarantees)`;

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
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 40) {
          plainEnglishSynthesis = text;
        }
      }
    } catch (e) {
      console.warn('[Scenario Service] LLM synthesis fallback:', e.message);
    }
  }

  // Resilient deterministic plain-English translation if LLM is unavailable
  if (!plainEnglishSynthesis) {
    const lines = [];
    const targetName = results.shock.target;
    const mag = results.shock.magnitude;
    const isNegative = results.shock.direction === 'negative';

    if (results.scenarioType === 'macro_event') {
      lines.push(`**Quick Take**\nHistorically, central bank rate reductions provide liquidity support over medium horizons, though immediate 1-to-7 day market reactions are frequently volatile depending on broader macro conditions.`);
      lines.push(`\n**So What Does This Actually Mean?**\n• Rate cuts reduce borrowing costs and tend to weaken the domestic currency, which historically aids risk appetite over 30-day windows.\n• In the verified historical instances recorded, immediate post-cut performance varied significantly based on whether the cut was preemptive easing or responding to systemic stress.`);
      lines.push(`\n**Key Caveats & Limitations**\n• With ${results.sampleSize} historical instances, outcomes should be viewed as illustrative precedent rather than statistical certainty.`);
    } else if (results.scenarioType === 'conditional_scenario') {
      lines.push(`**Quick Take**\nWhen ${targetName} suffers a sharp drop while benchmark equities are already in a confirmed downtrend, risk-off sentiment is already entrenched across markets.`);
      lines.push(`\n**So What Does This Actually Mean?**\n• The data shows ${results.sampleSize} matching periods where both conditions coincided. In these environments, broad liquidity is typically constrained.\n• Cross-asset sensitivity indicates correlated pressure across risk assets rather than isolated crypto volatility.`);
      lines.push(`\n**Key Caveats & Limitations**\n• Historical joint regimes reflect severe macro or credit stress; modern institutional participation may alter future transmission dynamics.`);
    } else {
      // Asset shock
      const topSens = results.sensitivityResults[0];
      const hasAmplified = results.sensitivityResults.some(r => Math.abs(r.betaToShockAsset || 0) > 1.0);
      lines.push(`**Quick Take**\nA ${mag}% drop in ${targetName} has historically transmitted direct directional pressure across correlated risk assets, with high-beta counterparts experiencing amplified moves.`);
      lines.push(`\n**So What Does This Actually Mean?**\n• Historical data indicates that when ${targetName} experiences a drawdown of this scale, correlated assets generally move in the same direction.`);
      if (hasAmplified) {
        lines.push(`• Assets with beta greater than 1.0 (such as higher-beta crypto) have historically suffered proportionately larger percentage drawdowns.`);
      }
      if (results.recoveryStats && results.recoveryStats.avgRecoveryTradingDays) {
        lines.push(`• Drawdown recovery has historically required approximately ${results.recoveryStats.avgRecoveryTradingDays} trading days to retest pre-shock price levels.`);
      }
      lines.push(`\n**Key Caveats & Limitations**\n• Correlations are historical empirical sensitivities, not forecasts. Correlations frequently shift during liquidity events.`);
    }

    plainEnglishSynthesis = lines.join('\n');
  }

  results.explanation = plainEnglishSynthesis;

  results.impactCalculations = results.sensitivityResults.map(r => ({
    asset: r.asset,
    beta: r.betaToShockAsset ?? r.betaToBenchmark,
    correlation: r.correlation,
    impliedMovePct: r.impliedSensitivityMovePct ?? 0
  }));

  return results;
}
