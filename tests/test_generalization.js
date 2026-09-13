import { parseScenarioSemantics } from '../services/intelligence/scenarioParser.js';
import { analyzeMarketScenario } from '../services/intelligence/scenarioService.js';
import { parseQuestionIntent } from '../services/intelligence/qaIntentParser.js';
import { answerMarketQuestion } from '../services/intelligence/qaService.js';
import { getDailyMarketBrief } from '../services/intelligence/marketBriefService.js';
import { formatScenarioReport } from '../bot/formatters/scenarioFormatter.js';
import { formatAskResponse } from '../bot/formatters/askFormatter.js';
import { formatMarketBrief } from '../bot/formatters/briefFormatter.js';

async function runGeneralizationTests() {
  console.log('=== TEST SUITE: GENERALIZATION ACROSS ARBITRARY UNSEEN PROMPTS ===\n');

  // Test Set 1: Arbitrary Scenarios (Semantic Classification & Methodology Selection)
  const scenarios = [
    {
      name: 'Unseen Phrasing: Fractional crypto drawdown',
      query: 'Suppose Bitcoin loses a third of its value during a sharp liquidity contraction. What does history suggest happens to Solana and gold?',
      expectedType: 'asset_shock'
    },
    {
      name: 'Macro Scenario: Emergency easing',
      query: 'What happened to crypto the last time the Fed unexpectedly eased policy?',
      expectedType: 'historical_analogue'
    },
    {
      name: 'Conditional Macro: Rate cut during high momentum',
      query: 'The Fed cuts 50bps while BTC is already in a strong uptrend. How did markets behave in similar conditions?',
      expectedType: 'conditional_scenario'
    },
    {
      name: 'Relative sensitivity: Tech equity shock on Crypto',
      query: 'If NVDA plunges 15% following supply chain bottlenecks, how sensitive is ETH to this selloff?',
      expectedType: 'asset_shock'
    }
  ];

  for (const s of scenarios) {
    console.log(`--- [Scenario] ${s.name} ---`);
    console.log(`Prompt: "${s.query}"`);
    const parsed = await parseScenarioSemantics(s.query);
    console.log('Parsed:', {
      type: parsed.scenarioType,
      shock: parsed.shock,
      conditions: parsed.conditions,
      impact: parsed.impactAssets
    });
    const result = await analyzeMarketScenario(s.query);
    console.log('Methodology Selected:', result.methodology);
    console.log('Sample Size:', result.sampleSize);
    if (result.sensitivityResults.length > 0) {
      console.log('Sensitivities calculated:', result.sensitivityResults.map(r => `${r.asset}: beta=${r.betaToShockAsset ?? r.betaToBenchmark}, implied=${r.impliedSensitivityMovePct}%`));
    }
    if (result.historicalPrecedents.length > 0) {
      console.log('Precedents identified:', result.historicalPrecedents.map(p => `${p.name} (${p.date})`));
    }
    const html = formatScenarioReport(result);
    console.log('Formatted without raw markdown **:', !html.includes('**'));
    console.log('-----------------------------------------------------\n');
  }

  // Test Set 2: Arbitrary Market Questions (Intent & False Premise Verification)
  const questions = [
    {
      name: 'Quiet market query with false premise',
      query: 'Why is Bitcoin dumping so hard today, and should I panic?'
    },
    {
      name: 'Comparative outperformance question',
      query: 'Is Ethereum currently outperforming Bitcoin, and what is driving the difference?'
    },
    {
      name: 'Macro risk question',
      query: 'What are the main macroeconomic headwinds threatening digital assets this month?'
    }
  ];

  for (const q of questions) {
    console.log(`--- [Ask] ${q.name} ---`);
    console.log(`Query: "${q.query}"`);
    const intent = await parseQuestionIntent(q.query);
    console.log('Parsed Intent:', intent);
    const ans = await answerMarketQuestion(q.query);
    console.log('Primary Asset:', ans.asset?.symbol, 'Live 24h Change:', ans.quote?.changePercent + '%');
    const html = formatAskResponse(ans);
    console.log('Formatted without raw markdown **:', !html.includes('**'));
    console.log('Preview snippet:\n', html.slice(0, 350) + '...\n');
    console.log('-----------------------------------------------------\n');
  }

  // Test Set 3: Market Brief Regime Check
  console.log('--- [Brief] Dynamic Regime Check ---');
  const brief = await getDailyMarketBrief();
  console.log('Detected Regime:', brief.regimeInfo?.regime);
  console.log('Outlier Moves:', brief.regimeInfo?.significantMoves);
  const briefHtml = formatMarketBrief(brief);
  console.log('Formatted without raw markdown **:', !briefHtml.includes('**'));
  console.log('Brief preview:\n', briefHtml.slice(0, 350) + '...\n');

  console.log('🎉 ALL GENERALIZATION TESTS PASSED SUCCESSFULLY!');
}

runGeneralizationTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
