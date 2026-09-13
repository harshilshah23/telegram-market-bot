import { fetchHistoricalData } from '../backtest/dataService.js';
import { resolveSymbol } from '../resolver/symbolResolver.js';
import { config } from '../../config/index.js';

/**
 * Calculates correlation between two return arrays
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
 * Calculates Beta: Cov(Asset, Benchmark) / Var(Benchmark)
 */
function calculateBeta(assetReturns, benchmarkReturns) {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < 10) return 1.0;

  let meanB = 0;
  for (let i = 0; i < n; i++) meanB += benchmarkReturns[i];
  meanB /= n;

  let meanA = 0;
  for (let i = 0; i < n; i++) meanA += assetReturns[i];
  meanA /= n;

  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (assetReturns[i] - meanA) * (benchmarkReturns[i] - meanB);
    varB += Math.pow(benchmarkReturns[i] - meanB, 2);
  }

  if (varB === 0) return 1.0;
  return cov / varB;
}

/**
 * Parses user scenario input into structured shock
 */
function parseScenarioInput(scenarioText) {
  const text = scenarioText.toLowerCase();

  let asset = 'BTC';
  let shockPct = -20; // default -20%
  let shockType = 'drop';

  if (text.includes('eth') || text.includes('ethereum')) asset = 'ETH';
  else if (text.includes('nvda') || text.includes('nvidia')) asset = 'NVDA';
  else if (text.includes('spy') || text.includes('s&p')) asset = 'SPY';
  else if (text.includes('qqq') || text.includes('nasdaq')) asset = 'QQQ';
  else if (text.includes('btc') || text.includes('bitcoin')) asset = 'BTC';

  // Extract percentage
  const matchPct = text.match(/(-?\d+(\.\d+)?)\s*%/);
  if (matchPct) {
    let val = parseFloat(matchPct[1]);
    if (text.includes('drop') || text.includes('fall') || text.includes('crash') || text.includes('down') || text.includes('cut')) {
      val = -Math.abs(val);
    } else if (text.includes('rise') || text.includes('rally') || text.includes('pump') || text.includes('up') || text.includes('hike')) {
      val = Math.abs(val);
    }
    shockPct = val;
  } else if (text.includes('rate cut') || text.includes('fed cuts')) {
    asset = 'SPY';
    shockPct = 2.5; // Fed cut typically positive for risk
    shockType = 'macro_rate_cut';
  } else if (text.includes('rate hike') || text.includes('fed hikes')) {
    asset = 'SPY';
    shockPct = -2.5;
    shockType = 'macro_rate_hike';
  }

  return { asset, shockPct, shockType, original: scenarioText };
}

export async function analyzeMarketScenario(scenarioText) {
  const parsed = parseScenarioInput(scenarioText);

  // Benchmarks to compare against
  const isCrypto = ['BTC', 'ETH', 'SOL'].includes(parsed.asset);
  const primarySymbol = isCrypto ? `${parsed.asset}-USD` : parsed.asset;
  const secondarySymbol = parsed.asset === 'BTC' ? 'ETH-USD' : (isCrypto ? 'BTC-USD' : 'QQQ');
  const macroSymbol = '^GSPC'; // S&P 500

  // Fetch 3-year historical bars to calculate empirical beta and drawdowns
  const [primaryBars, secondaryBars, macroBars] = await Promise.all([
    fetchHistoricalData(primarySymbol, '3y', '1d').catch(() => []),
    fetchHistoricalData(secondarySymbol, '3y', '1d').catch(() => []),
    fetchHistoricalData(macroSymbol, '3y', '1d').catch(() => [])
  ]);

  // Compute returns
  const getReturns = (bars) => {
    const rets = [];
    for (let i = 1; i < bars.length; i++) {
      if (bars[i - 1].close > 0) {
        rets.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
      }
    }
    return rets;
  };

  const primaryRets = getReturns(primaryBars);
  const secondaryRets = getReturns(secondaryBars);
  const macroRets = getReturns(macroBars);

  // Compute correlation & beta
  const corrSecondary = calculateCorrelation(secondaryRets, primaryRets);
  const betaSecondary = calculateBeta(secondaryRets, primaryRets);
  const betaMacro = calculateBeta(primaryRets, macroRets);

  // Find historical instances of similar shock (e.g. daily moves or multi-day moves >= shock)
  const targetThreshold = parsed.shockPct / 100;
  let historicalOccurrences = 0;
  let avgRecoveryDays = 0;
  const recoveryDaysList = [];

  for (let i = 1; i < primaryBars.length - 30; i++) {
    const barChange = (primaryBars[i].close - primaryBars[i - 1].close) / primaryBars[i - 1].close;
    const isShockMatch = targetThreshold < 0
      ? barChange <= targetThreshold * 0.5 // e.g. severe drop
      : barChange >= targetThreshold * 0.5;

    if (isShockMatch) {
      historicalOccurrences++;
      // Check recovery to pre-shock level
      const preShock = primaryBars[i - 1].close;
      let recDays = null;
      for (let j = i + 1; j < Math.min(i + 90, primaryBars.length); j++) {
        if (targetThreshold < 0 && primaryBars[j].close >= preShock) {
          recDays = j - i;
          break;
        } else if (targetThreshold > 0 && primaryBars[j].close <= preShock) {
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

  // Calculate estimated impact on secondary asset
  const estimatedSecondaryShock = (parsed.shockPct * betaSecondary).toFixed(1);

  // Institutional explanation
  const secName = secondarySymbol.replace('-USD', '').replace('^', '');
  const transmissionExplanation =
    `Historically, ${secName} exhibits a beta of <b>${betaSecondary.toFixed(2)}</b> (correlation: <i>${corrSecondary.toFixed(2)}</i>) relative to ${parsed.asset}. ` +
    `If ${parsed.asset} experiences a ${parsed.shockPct > 0 ? '+' : ''}${parsed.shockPct}% shock, history suggests ${secName} could see an implied sensitivity move of approximately <b>${estimatedSecondaryShock > 0 ? '+' : ''}${estimatedSecondaryShock}%</b>.`;

  return {
    scenario: scenarioText,
    asset: parsed.asset,
    shockPct: parsed.shockPct,
    secondaryAsset: secName,
    betaSecondary: Number(betaSecondary.toFixed(2)),
    correlationSecondary: Number(corrSecondary.toFixed(2)),
    estimatedSecondaryShock: Number(estimatedSecondaryShock),
    historicalInstances: historicalOccurrences,
    avgRecoveryDays: avgRecoveryDays || 'Variable (30-60d)',
    transmissionExplanation
  };
}
