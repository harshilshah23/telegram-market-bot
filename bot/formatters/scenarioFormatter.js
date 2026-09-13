import { escapeHtml } from './baseFormatter.js';

export function formatScenarioReport(data) {
  const { scenario, asset, shockPct, secondaryAsset, estimatedSecondaryShock, betaSecondary, correlationSecondary, historicalInstances, avgRecoveryDays, transmissionExplanation } = data;

  const lines = [];
  lines.push(`🎲 <b>SCENARIO SENSITIVITY ANALYSIS</b>`);
  lines.push(`<i>"${escapeHtml(scenario)}"</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  const sign = shockPct >= 0 ? '+' : '';
  lines.push(`<b>HYPOTHETICAL SHOCK</b>`);
  lines.push(`• Primary Asset: <b>${asset}</b>`);
  lines.push(`• Modeled Shock: <b>${sign}${shockPct}%</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`<b>HISTORICAL SENSITIVITY & TRANSMISSION</b>`);
  lines.push(`• Implied Move on ${secondaryAsset}: <b>${estimatedSecondaryShock >= 0 ? '+' : ''}${estimatedSecondaryShock}%</b>`);
  lines.push(`• Historical Beta (3Y): <b>${betaSecondary}</b>`);
  lines.push(`• Correlation (3Y): <b>${correlationSecondary}</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`<b>HISTORICAL PRECEDENTS & RECOVERY</b>`);
  lines.push(`• Past similar shock periods identified: <b>${historicalInstances}</b>`);
  lines.push(`• Average historical recovery time: <b>${avgRecoveryDays} days</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`<b>MECHANISM & CONTEXT</b>`);
  lines.push(transmissionExplanation);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`⚠️ <i>Historical relationships do not predict future results. Correlations shift during liquidity stress. Not financial advice.</i>`);

  return lines.join('\n');
}
