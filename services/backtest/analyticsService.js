/**
 * Analytics and Performance Metrics Calculation Engine
 */

export function calculatePerformanceMetrics(backtestResult, tradedBars) {
  const { initialCapital, finalCapital, trades, equityCurve } = backtestResult;

  const totalReturnPct = ((finalCapital - initialCapital) / initialCapital) * 100;
  const nBars = equityCurve.length;
  const nYears = Math.max(0.5, nBars / 252); // ~252 trading days per year
  const cagr = ((Math.pow(finalCapital / initialCapital, 1 / nYears) - 1) * 100);

  // Buy & Hold Benchmark
  let buyHoldReturnPct = 0;
  if (equityCurve.length > 1) {
    const firstClose = equityCurve[0].close;
    const lastClose = equityCurve[equityCurve.length - 1].close;
    buyHoldReturnPct = ((lastClose - firstClose) / firstClose) * 100;
  }

  // Daily Returns & Drawdown calculation
  const dailyReturns = [];
  let peak = initialCapital;
  let maxDrawdownPct = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    const eq = equityCurve[i].equity;
    if (eq > peak) {
      peak = eq;
    }
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDrawdownPct) {
      maxDrawdownPct = dd;
    }
    if (i > 0) {
      const prevEq = equityCurve[i - 1].equity;
      dailyReturns.push((eq - prevEq) / prevEq);
    }
  }

  // Sharpe & Sortino
  const riskFreeDaily = 0.02 / 252; // 2% annual risk-free rate
  let meanReturn = 0;
  let sumSqDev = 0;
  let sumDownsideSq = 0;

  if (dailyReturns.length > 0) {
    meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    for (const r of dailyReturns) {
      sumSqDev += Math.pow(r - meanReturn, 2);
      if (r < riskFreeDaily) {
        sumDownsideSq += Math.pow(r - riskFreeDaily, 2);
      }
    }
  }

  const dailyVol = dailyReturns.length > 1 ? Math.sqrt(sumSqDev / (dailyReturns.length - 1)) : 0;
  const annualVolPct = dailyVol * Math.sqrt(252) * 100;

  const downsideDev = dailyReturns.length > 1 ? Math.sqrt(sumDownsideSq / (dailyReturns.length - 1)) : 0;
  const annualDownsideVol = downsideDev * Math.sqrt(252);

  const sharpe = annualVolPct > 0 ? ((cagr - 2.0) / annualVolPct) : 0;
  const sortino = annualDownsideVol > 0 ? ((cagr - 2.0) / (annualDownsideVol * 100)) : 0;
  const calmar = maxDrawdownPct > 0 ? (cagr / maxDrawdownPct) : 0;

  // Trade Statistics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);

  const winRatePct = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWinPct = winningTrades.length > 0 ? winningTrades.reduce((a, b) => a + b.returnPct, 0) / winningTrades.length : 0;
  const avgLossPct = losingTrades.length > 0 ? losingTrades.reduce((a, b) => a + b.returnPct, 0) / losingTrades.length : 0;

  const grossProfit = winningTrades.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((a, b) => a + b.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

  const expectancy = trades.length > 0 ? trades.reduce((a, b) => a + b.returnPct, 0) / trades.length : 0;
  const avgHoldingBars = trades.length > 0 ? trades.reduce((a, b) => a + b.holdingBars, 0) / trades.length : 0;

  const largestWinPct = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.returnPct)) : 0;
  const largestLossPct = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.returnPct)) : 0;

  // Robustness: Monte Carlo Trade Resampling (500 iterations)
  const monteCarlo = runMonteCarloSimulation(trades, initialCapital, 500);

  return {
    initialCapital,
    finalCapital: parseFloat(finalCapital.toFixed(2)),
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    cagr: parseFloat(cagr.toFixed(2)),
    buyHoldReturnPct: parseFloat(buyHoldReturnPct.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    annualVolPct: parseFloat(annualVolPct.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    sortino: parseFloat(sortino.toFixed(2)),
    calmar: parseFloat(calmar.toFixed(2)),
    totalTrades: trades.length,
    winRatePct: parseFloat(winRatePct.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgWinPct: parseFloat(avgWinPct.toFixed(2)),
    avgLossPct: parseFloat(avgLossPct.toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    avgHoldingBars: parseFloat(avgHoldingBars.toFixed(1)),
    largestWinPct: parseFloat(largestWinPct.toFixed(2)),
    largestLossPct: parseFloat(largestLossPct.toFixed(2)),
    monteCarlo
  };
}

function runMonteCarloSimulation(trades, initialCapital, iterations = 500) {
  if (!trades || trades.length < 5) {
    return {
      p5Return: 0,
      medianReturn: 0,
      p95Return: 0,
      p95Drawdown: 0
    };
  }

  const returns = trades.map(t => t.returnPct / 100);
  const simReturns = [];
  const simDrawdowns = [];

  for (let s = 0; s < iterations; s++) {
    let cap = initialCapital;
    let peak = cap;
    let maxDd = 0;

    for (let t = 0; t < returns.length; t++) {
      const randIndex = Math.floor(Math.random() * returns.length);
      const r = returns[randIndex];
      cap = cap * (1 + r);
      if (cap > peak) peak = cap;
      const dd = ((peak - cap) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }

    const totalRet = ((cap - initialCapital) / initialCapital) * 100;
    simReturns.push(totalRet);
    simDrawdowns.push(maxDd);
  }

  simReturns.sort((a, b) => a - b);
  simDrawdowns.sort((a, b) => a - b);

  const p5Index = Math.floor(iterations * 0.05);
  const medIndex = Math.floor(iterations * 0.5);
  const p95Index = Math.floor(iterations * 0.95);

  return {
    p5Return: parseFloat(simReturns[p5Index].toFixed(1)),
    medianReturn: parseFloat(simReturns[medIndex].toFixed(1)),
    p95Return: parseFloat(simReturns[p95Index].toFixed(1)),
    p95Drawdown: parseFloat(simDrawdowns[p95Index].toFixed(1))
  };
}
