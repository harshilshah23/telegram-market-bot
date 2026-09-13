import { escapeHtml, markdownToTelegramHtml } from './baseFormatter.js';

export function formatScenarioReport(data) {
  const {
    scenario,
    scenarioType,
    shock,
    conditions,
    methodology,
    sampleSize,
    confidenceWarning,
    sensitivityResults,
    historicalPrecedents,
    recoveryStats,
    explanation
  } = data;

  const lines = [];
  lines.push(`🎲 <b>SCENARIO SENSITIVITY ANALYSIS</b>`);
  lines.push(`<i>"${escapeHtml(scenario)}"</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`<b>SCENARIO STRUCTURE & METHODOLOGY</b>`);
  lines.push(`• <b>Type:</b> <code>${escapeHtml(scenarioType || 'asset_shock')}</code>`);
  lines.push(`• <b>Event/Shock:</b> ${escapeHtml(shock?.description || `${shock?.target} ${shock?.magnitude}${shock?.units}`)}`);
  if (conditions && conditions.length > 0) {
    const formattedConds = conditions.map(c => typeof c === 'object' ? (c.description || `${c.asset} in ${c.value}`) : String(c));
    lines.push(`• <b>Conditions:</b> ${formattedConds.map(escapeHtml).join(', ')}`);
  }
  lines.push(`• <b>Analytical Method:</b> ${escapeHtml(methodology)}`);
  lines.push(`• <b>Historical Sample:</b> ${sampleSize} matching period${sampleSize === 1 ? '' : 's'}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  if (confidenceWarning) {
    lines.push(`⚠️ <b>Confidence Warning:</b> <i>${escapeHtml(confidenceWarning)}</i>`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  // 1. Direct Sensitivity Output
  if (sensitivityResults && sensitivityResults.length > 0) {
    lines.push(`<b>HISTORICAL SENSITIVITIES (BETA & SENSITIVITY)</b>`);
    for (const item of sensitivityResults) {
      if (item.impliedSensitivityMovePct !== undefined) {
        const sign = item.impliedSensitivityMovePct >= 0 ? '+' : '';
        lines.push(`• <b>${escapeHtml(item.asset)}</b> (Beta to ${escapeHtml(shock.target)}: <code>${item.betaToShockAsset}</code>, Corr: <code>${item.correlation}</code>)`);
        lines.push(`  ↳ Calculated Sensitivity Implied Move: <b>${sign}${item.impliedSensitivityMovePct}%</b>`);
      } else if (item.betaToBenchmark !== undefined) {
        lines.push(`• <b>${escapeHtml(item.asset)}</b> vs ${escapeHtml(item.benchmarkName)} (Beta: <code>${item.betaToBenchmark}</code>, Corr: <code>${item.correlation}</code>)`);
      }
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  // 2. Historical Precedents / Analogues
  if (historicalPrecedents && historicalPrecedents.length > 0) {
    lines.push(`<b>GENUINE HISTORICAL PRECEDENTS</b>`);
    for (const prec of historicalPrecedents) {
      lines.push(`<b>📅 ${escapeHtml(prec.name)} (${prec.date})</b>`);
      if (prec.subsequentPerformance && Object.keys(prec.subsequentPerformance).length > 0) {
        const pLines = Object.entries(prec.subsequentPerformance).map(([ast, p]) => 
          `  • ${ast}: 1d: <code>${p.d1 >= 0 ? '+' : ''}${p.d1}%</code> | 7d: <code>${p.d7 >= 0 ? '+' : ''}${p.d7}%</code> | 30d: <code>${p.d30 >= 0 ? '+' : ''}${p.d30}%</code>`
        );
        lines.push(pLines.join('\n'));
      }
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  // 3. Drawdown Recovery Statistics
  if (recoveryStats && recoveryStats.avgRecoveryTradingDays) {
    lines.push(`<b>HISTORICAL DRAWDOWN RECOVERY</b>`);
    lines.push(`• Average Time to Recover Pre-Shock High: <b>${recoveryStats.avgRecoveryTradingDays} trading days</b>`);
    if (recoveryStats.minRecoveryDays && recoveryStats.maxRecoveryDays) {
      lines.push(`• Historical Range: <b>${recoveryStats.minRecoveryDays} — ${recoveryStats.maxRecoveryDays} days</b>`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (explanation) {
    lines.push(`<b>CONTEXT & TRANSMISSION</b>`);
    lines.push(markdownToTelegramHtml(explanation));
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`⚠️ <i>Historical relationships are empirical sensitivities, not forecasts. Correlations shift during regime changes. Not financial advice.</i>`);

  return lines.join('\n');
}
