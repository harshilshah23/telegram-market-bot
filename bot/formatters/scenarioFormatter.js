import { escapeHtml, markdownToTelegramHtml } from './baseFormatter.js';

export function formatScenarioReport(data) {
  const { scenario, shockAsset, shockPct, impactCalculations, historicalInstances, avgRecoveryDays, explanation } = data;

  const lines = [];
  lines.push(`🎲 <b>SCENARIO SENSITIVITY ANALYSIS</b>`);
  lines.push(`<i>"${escapeHtml(scenario)}"</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  const sign = shockPct >= 0 ? '+' : '';
  lines.push(`<b>HYPOTHETICAL SHOCK</b>`);
  lines.push(`• Primary Shock Asset: <b>${escapeHtml(shockAsset)}</b>`);
  lines.push(`• Modeled Shock: <b>${sign}${shockPct}%</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  if (impactCalculations && impactCalculations.length > 0) {
    lines.push(`<b>HISTORICAL SENSITIVITY & TRANSMISSION</b>`);
    for (const item of impactCalculations) {
      const impSign = item.impliedMovePct >= 0 ? '+' : '';
      lines.push(`• <b>${escapeHtml(item.asset)}</b> (Beta to ${escapeHtml(shockAsset)}: <code>${item.beta}</code>, Corr: <code>${item.correlation}</code>)`);
      lines.push(`  ↳ Implied Sensitivity Move: <b>${impSign}${item.impliedMovePct}%</b>`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`<b>HISTORICAL PRECEDENTS & RECOVERY</b>`);
  lines.push(`• Past similar shock periods identified: <b>${historicalInstances}</b>`);
  lines.push(`• Average historical recovery time: <b>${escapeHtml(String(avgRecoveryDays))}</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  if (explanation) {
    lines.push(`<b>MECHANISM & CONTEXT</b>`);
    lines.push(markdownToTelegramHtml(explanation));
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`⚠️ <i>Historical relationships do not predict future results. Correlations shift during liquidity stress. Not financial advice.</i>`);

  return lines.join('\n');
}
