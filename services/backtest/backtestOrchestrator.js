import { parseStrategy } from './strategyParser.js';
import { fetchMultiAssetData } from './dataService.js';
import { executeBacktest } from './backtestEngine.js';
import { calculatePerformanceMetrics } from './analyticsService.js';
import { generateEquityCurveChartUrl, generateDrawdownChartUrl } from './chartService.js';

export async function runBacktestWorkflow(promptOrStrategy) {
  let strategy = null;

  if (typeof promptOrStrategy === 'string') {
    const parseResult = await parseStrategy(promptOrStrategy);
    if (!parseResult.valid) {
      return {
        success: false,
        error: parseResult.error || 'Unable to parse strategy.',
        isUnsupported: parseResult.isUnsupported
      };
    }
    strategy = parseResult.strategy;
  } else {
    strategy = promptOrStrategy;
  }

  // 1. Fetch Historical Data
  const data = await fetchMultiAssetData(
    strategy.asset,
    strategy.signalAsset || strategy.asset,
    strategy.period || '5y',
    strategy.timeframe || '1d'
  );

  if (!data || !data.tradedBars || data.tradedBars.length < 30) {
    return {
      success: false,
      error: `Could not retrieve sufficient historical market data for ${strategy.asset}.`
    };
  }

  // 2. Execute Simulation
  const backtestResult = executeBacktest(strategy, data.tradedBars, data.signalBars);

  // 3. Compute Metrics
  const metrics = calculatePerformanceMetrics(backtestResult, data.tradedBars);

  // 4. Generate Visual Charts
  const chartUrl = generateEquityCurveChartUrl(backtestResult.equityCurve, strategy.asset, strategy.rawPrompt);
  const drawdownChartUrl = generateDrawdownChartUrl(backtestResult.equityCurve, strategy.asset);

  return {
    success: true,
    strategy,
    metrics,
    chartUrl,
    drawdownChartUrl,
    trades: backtestResult.trades,
    equityCurve: backtestResult.equityCurve
  };
}
