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
  lines.push(`🎲 <b>SCENARIO ANALYSIS</b>`);
  lines.push(`<i>"${escapeHtml(scenario)}"</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // 1. Plain-English Takeaway (Quick Take & Meaning) if available
  if (explanation) {
    lines.push(markdownToTelegramHtml(explanation));
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  // 2. What the Data Shows (Deterministic Numerical Evidence)
  lines.push(`<b>WHAT THE DATA SHOWS (EVIDENCE)</b>`);
  let shockDesc = shock?.description;
  if (!shockDesc) {
    if (shock?.target && shock?.magnitude !== null && shock?.magnitude !== undefined) {
      shockDesc = `${shock.target} ${shock.direction === 'negative' ? '-' : '+'}${shock.magnitude}${shock.units === 'percent' ? '%' : (shock.units || '')}`;
    } else {
      shockDesc = `${shock?.target || 'Asset'} ${shock?.action || 'Event'}`;
    }
  }
  lines.push(`• <b>Event / Shock:</b> ${escapeHtml(shockDesc)}`);
  if (conditions && conditions.length > 0) {
    const formattedConds = conditions.map(c => typeof c === 'object' ? (c.description || `${c.asset} in ${c.value}`) : String(c));
    lines.push(`• <b>Conditions:</b> ${formattedConds.map(escapeHtml).join(', ')}`);
  }
  lines.push(`• <b>Historical Sample:</b> ${sampleSize} matching period${sampleSize === 1 ? '' : 's'}`);
  lines.push(`• <b>Methodology:</b> <code>${escapeHtml(methodology)}</code>`);

  if (sensitivityResults && sensitivityResults.length > 0) {
    lines.push(`\n<b>Calculated Empirical Sensitivities:</b>`);
    for (const item of sensitivityResults) {
      if (item.impliedSensitivityMovePct !== undefined) {
        const sign = item.impliedSensitivityMovePct >= 0 ? '+' : '';
        lines.push(`• <b>${escapeHtml(item.asset)}</b> (Beta: <code>${item.betaToShockAsset}</code>, Corr: <code>${item.correlation}</code>) ↳ Implied: <b>${sign}${item.impliedSensitivityMovePct}%</b>`);
      } else if (item.betaToBenchmark !== undefined) {
        lines.push(`• <b>${escapeHtml(item.asset)}</b> vs ${escapeHtml(item.benchmarkName)} (Beta: <code>${item.betaToBenchmark}</code>, Corr: <code>${item.correlation}</code>)`);
      }
    }
  }

  if (recoveryStats && recoveryStats.avgRecoveryTradingDays) {
    lines.push(`\n<b>Drawdown Recovery Metrics:</b>`);
    lines.push(`• Avg Recovery to Pre-Shock High: <b>${recoveryStats.avgRecoveryTradingDays} trading days</b>`);
    if (recoveryStats.minRecoveryDays && recoveryStats.maxRecoveryDays) {
      lines.push(`• Historical Range: <b>${recoveryStats.minRecoveryDays} — ${recoveryStats.maxRecoveryDays} days</b>`);
    }
  }

  // 3. Historical Precedents / Analogues
  if (historicalPrecedents && historicalPrecedents.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`<b>HISTORICAL PRECEDENTS & FORWARD PERFORMANCE</b>`);
    for (const prec of historicalPrecedents) {
      lines.push(`<b>📅 ${escapeHtml(prec.name)} (${prec.date})</b>`);
      if (prec.subsequentPerformance && Object.keys(prec.subsequentPerformance).length > 0) {
        const pLines = Object.entries(prec.subsequentPerformance).map(([ast, p]) => 
          `  • ${ast}: 1d: <code>${p.d1 >= 0 ? '+' : ''}${p.d1}%</code> | 7d: <code>${p.d7 >= 0 ? '+' : ''}${p.d7}%</code> | 30d: <code>${p.d30 >= 0 ? '+' : ''}${p.d30}%</code>`
        );
        lines.push(pLines.join('\n'));
      }
    }
  }

  if (confidenceWarning) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚠️ <b>Confidence & Sample Size Note:</b> <i>${escapeHtml(confidenceWarning)}</i>`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`⚠️ <i>Historical relationships are empirical sensitivities, not guarantees. Correlations shift during liquidity regimes. Not financial advice.</i>`);

  return lines.join('\n');
}
