import { answerMarketQuestion } from '../services/intelligence/qaService.js';
import { formatAskResponse } from '../bot/formatters/askFormatter.js';
import { analyzeMarketScenario } from '../services/intelligence/scenarioService.js';
import { formatScenarioReport } from '../bot/formatters/scenarioFormatter.js';
import { getDailyMarketBrief } from '../services/intelligence/marketBriefService.js';
import { formatMarketBrief } from '../bot/formatters/briefFormatter.js';

async function runQA() {
  console.log('====================================================');
  console.log('TEST 1: /ask False-Premise Handling');
  console.log('Query: "Why is Bitcoin moving today, and what are the 3 biggest things I should be watching?"');
  console.log('====================================================');
  const t1 = await answerMarketQuestion('Why is Bitcoin moving today, and what are the 3 biggest things I should be watching?');
  const h1 = formatAskResponse(t1);
  console.log('Price & Change:', t1.quote?.price, t1.quote?.changePercent + '%');
  console.log('Selected News Count:', t1.news.length);
  t1.news.forEach(n => console.log('  Source:', n.source, '| Title:', n.title));
  console.log('\nResponse Output (HTML rendered preview):\n');
  console.log(h1);
  console.log('Contains raw markdown **: ', h1.includes('**'));

  console.log('\n====================================================');
  console.log('TEST 2: /ask Outperformance Comparison');
  console.log('Query: "Is Ethereum currently outperforming Bitcoin, and what is driving the difference?"');
  console.log('====================================================');
  const t2 = await answerMarketQuestion('Is Ethereum currently outperforming Bitcoin, and what is driving the difference?');
  const h2 = formatAskResponse(t2);
  console.log('Primary Asset:', t2.asset?.name, '| Comparison Asset:', t2.comparisonAsset?.name);
  console.log('ETH Change:', t2.quote?.changePercent + '%', '| BTC Change:', t2.comparisonQuote?.changePercent + '%');
  console.log('\nResponse Output (HTML rendered preview):\n');
  console.log(h2);
  console.log('Contains raw markdown **: ', h2.includes('**'));

  console.log('\n====================================================');
  console.log('TEST 3: /scenario Multi-Asset Directional Sensitivity');
  console.log('Query: "Bitcoin falls 20% from its current price. What historically tends to happen to Ethereum, Nasdaq and Bitcoin\'s recovery time?"');
  console.log('====================================================');
  const t3 = await analyzeMarketScenario("Bitcoin falls 20% from its current price. What historically tends to happen to Ethereum, Nasdaq and Bitcoin's recovery time?");
  console.log('Shock Asset:', t3.shockAsset, '| Shock %:', t3.shockPct);
  console.log('Calculated Impact Sensitivities:');
  t3.impactCalculations.forEach(c => console.log(`  ${c.asset} -> Beta: ${c.beta}, Corr: ${c.correlation}, Implied: ${c.impliedMovePct}%`));
  console.log('Recovery Time:', t3.avgRecoveryDays);
  const h3 = formatScenarioReport(t3);
  console.log('\nFormatted Scenario Report:\n');
  console.log(h3);
  console.log('Contains raw markdown **: ', h3.includes('**'));

  console.log('\n====================================================');
  console.log('TEST 4: /scenario Macro Shock Scenario');
  console.log('Query: "The Fed unexpectedly cuts rates by 50 basis points while Bitcoin is already in a strong uptrend. How have similar historical situations affected Bitcoin, Nasdaq, the dollar and gold?"');
  console.log('====================================================');
  const t4 = await analyzeMarketScenario("The Fed unexpectedly cuts rates by 50 basis points while Bitcoin is already in a strong uptrend. How have similar historical situations affected Bitcoin, Nasdaq, the dollar and gold?");
  console.log('Shock Asset:', t4.shockAsset, '| Shock %:', t4.shockPct);
  console.log('Calculated Impact Sensitivities:');
  t4.impactCalculations.forEach(c => console.log(`  ${c.asset} -> Beta: ${c.beta}, Corr: ${c.correlation}, Implied: ${c.impliedMovePct}%`));
  const h4 = formatScenarioReport(t4);
  console.log('\nFormatted Scenario Report (snippet):\n');
  console.log(h4.slice(0, 500) + '...\n');

  console.log('\n====================================================');
  console.log('TEST 5: /brief');
  console.log('====================================================');
  const t5 = await getDailyMarketBrief();
  const h5 = formatMarketBrief(t5);
  console.log('Brief Assets:', Object.keys(t5.quotes));
  console.log('Brief snippet:\n', h5.slice(0, 400) + '...\n');

  console.log('🎉 ALL 5 USER TESTS COMPLETED!');
}

runQA().catch(err => {
  console.error('QA Error:', err);
  process.exit(1);
});
