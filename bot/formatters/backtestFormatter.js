import { escapeHtml } from '../formatters/baseFormatter.js';

export function formatConfirmationCard(strategy) {
  const asset = escapeHtml(strategy.asset);
  const signalAsset = strategy.signalAsset && strategy.signalAsset !== strategy.asset
    ? ` · <i>Signal:</i> <code>${escapeHtml(strategy.signalAsset)}</code>`
    : '';
  const tf = escapeHtml(strategy.timeframe.toUpperCase());
  const period = escapeHtml(strategy.period.toUpperCase());

  // Format entry rules
  const entryLines = strategy.entryConditions.map(c => {
    const assetPrefix = c.asset ? `[${c.asset}] ` : '';
    if (c.indicator === 'RSI') return `${assetPrefix}RSI (${c.period || 14}) ${c.operator} ${c.value}`;
    if (c.indicator === 'MA_CROSS') return `${assetPrefix}${c.fastPeriod} ${c.fastType} crosses above ${c.slowPeriod} ${c.slowType}`;
    if (c.indicator === 'MA_FILTER') return `${assetPrefix}Price ${c.operator} ${c.period} ${c.type}`;
    if (c.indicator === 'HIGH_DRAWDOWN') return `${assetPrefix}Drops ${c.dropPct}% from ${c.lookbackBars}D High`;
    if (c.indicator === 'DAILY_CHANGE') return `${assetPrefix}Daily Drop ≥ ${c.dropPct}%`;
    return JSON.stringify(c);
  }).map(l => `• <code>${escapeHtml(l)}</code>`).join('\n');

  // Format exit rules
  const exitLines = (strategy.exitConditions || []).map(c => {
    const assetPrefix = c.asset ? `[${c.asset}] ` : '';
    if (c.indicator === 'RSI') return `${assetPrefix}RSI (${c.period || 14}) ${c.operator} ${c.value}`;
    if (c.indicator === 'MA_CROSS') return `${assetPrefix}${c.fastPeriod} ${c.fastType} crosses below ${c.slowPeriod} ${c.slowType}`;
    if (c.indicator === 'PROFIT_TARGET') return `Gain ≥ +${c.targetPct}% from entry`;
    if (c.indicator === 'RECOVER_HIGH') return `Recovers to ${c.lookbackBars}D High`;
    return JSON.stringify(c);
  });

  if (strategy.takeProfitPct) {
    exitLines.push(`Take Profit at +${strategy.takeProfitPct}%`);
  }
  if (strategy.stopLossPct) {
    exitLines.push(`Stop Loss at -${strategy.stopLossPct}%`);
  }
  if (strategy.maxHoldingBars) {
    exitLines.push(`Max Holding Period: ${strategy.maxHoldingBars} trading days`);
  }

  const exitFormatted = exitLines.length > 0
    ? exitLines.map(l => `• <code>${escapeHtml(l)}</code>`).join('\n')
    : '• <i>Default opposite signal or stop</i>';

  const leverageStr = strategy.leverage > 1.0 ? ` (${strategy.leverage}x Leverage)` : '';
  const positionStr = `${strategy.positionSizePct}% Available Capital${leverageStr}`;

  return `<b>🧪 BACKTEST STRATEGY SPECIFICATION</b>\n\n` +
    `<b>Traded Asset:</b> <code>${asset}</code> · <b>Timeframe:</b> <code>${tf}</code> · <code>${period}</code>${signalAsset}\n\n` +
    `<b>🟢 ENTRY RULES (All must be satisfied):</b>\n${entryLines}\n\n` +
    `<b>🔴 EXIT RULES (Whichever occurs first):</b>\n${exitFormatted}\n\n` +
    `<b>💼 POSITION:</b> <code>${escapeHtml(positionStr)}</code>\n` +
    `<b>💸 EXECUTION:</b> <code>Next-bar open · ${strategy.feePct}% fees · ${strategy.slippagePct}% slippage</code>\n\n` +
    `<i>Tap <b>RUN</b> below to execute this simulation on real historical data.</i>`;
}

export function formatBacktestResult(result) {
  const { strategy, metrics } = result;
  const retSign = metrics.totalReturnPct >= 0 ? '+' : '';
  const cagrSign = metrics.cagr >= 0 ? '+' : '';
  const bhSign = metrics.buyHoldReturnPct >= 0 ? '+' : '';

  const retEmoji = metrics.totalReturnPct >= 0 ? '🟢' : '🔴';
  const pfEmoji = metrics.profitFactor >= 1.0 ? '✅' : '⚠️';

  return `<b>🧪 BACKTEST COMPLETE</b>\n\n` +
    `<b>${escapeHtml(strategy.asset)} — ${escapeHtml(strategy.timeframe.toUpperCase())} · ${escapeHtml(strategy.period.toUpperCase())}</b>\n\n` +
    `<b>📈 PERFORMANCE</b>\n` +
    `Return: ${retEmoji} <b>${retSign}${metrics.totalReturnPct}%</b>\n` +
    `CAGR: <b>${cagrSign}${metrics.cagr}%</b>\n` +
    `Sharpe: <b>${metrics.sharpe}</b> · Sortino: <b>${metrics.sortino}</b>\n` +
    `Max DD: <b>-${metrics.maxDrawdownPct}%</b> · Calmar: <b>${metrics.calmar}</b>\n` +
    `Annual Volatility: <b>${metrics.annualVolPct}%</b>\n\n` +
    `<b>⚖️ VS BUY & HOLD</b>\n` +
    `Strategy: <b>${retSign}${metrics.totalReturnPct}%</b>\n` +
    `${escapeHtml(strategy.asset)}: <b>${bhSign}${metrics.buyHoldReturnPct}%</b>\n\n` +
    `<b>📊 TRADES</b>\n` +
    `Total Trades: <b>${metrics.totalTrades}</b> · Win Rate: <b>${metrics.winRatePct}%</b>\n` +
    `Profit Factor: ${pfEmoji} <b>${metrics.profitFactor}</b> · Expectancy: <b>${metrics.expectancy}%</b>\n` +
    `Avg Win: <b>+${metrics.avgWinPct}%</b> · Avg Loss: <b>${metrics.avgLossPct}%</b>\n` +
    `Avg Holding: <b>${metrics.avgHoldingBars} bars</b>`;
}

export function formatRobustnessReport(metrics) {
  const mc = metrics.monteCarlo;
  return `<b>🔬 ROBUSTNESS & MONTE CARLO (500x Resampling)</b>\n\n` +
    `• <b>Median Expected Return:</b> <code>${mc.medianReturn}%</code>\n` +
    `• <b>Worst 5% Drawdown (VaR 95):</b> <code>-${mc.p95Drawdown}%</code>\n` +
    `• <b>5th - 95th Return Range:</b> <code>${mc.p5Return}%</code> to <code>${mc.p95Return}%</code>\n\n` +
    `<i>Monte Carlo randomly resamples trade sequences to test whether profitability relied on lucky order distribution.</i>`;
}
