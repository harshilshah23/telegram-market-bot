import { getDailyMarketBrief } from '../services/intelligence/marketBriefService.js';
import { formatMarketBrief } from '../bot/formatters/briefFormatter.js';
import { answerMarketQuestion } from '../services/intelligence/qaService.js';
import { formatAskResponse } from '../bot/formatters/askFormatter.js';
import { analyzeMarketScenario } from '../services/intelligence/scenarioService.js';
import { formatScenarioReport } from '../bot/formatters/scenarioFormatter.js';

async function runTests() {
  console.log('=== 1. Testing /brief ===');
  const brief = await getDailyMarketBrief();
  console.log('Brief Assets fetched:', Object.keys(brief.quotes));
  console.log('Top Headlines count:', brief.topNews.length);
  console.log('Macro Events count:', brief.macroEvents.length);
  const formattedBrief = formatMarketBrief(brief);
  console.log('Formatted Brief preview:\n', formattedBrief.slice(0, 300) + '...\n');

  console.log('=== 2. Testing /scenario ===');
  const scenario1 = await analyzeMarketScenario('What happens if Bitcoin drops 20%?');
  console.log('Scenario 1 result:', {
    asset: scenario1.asset,
    shock: scenario1.shockPct,
    secondary: scenario1.secondaryAsset,
    estimatedSecondaryShock: scenario1.estimatedSecondaryShock,
    beta: scenario1.betaSecondary,
    instances: scenario1.historicalInstances
  });
  const scenarioReport = formatScenarioReport(scenario1);
  console.log('Scenario report preview:\n', scenarioReport.slice(0, 250) + '...\n');

  console.log('=== 3. Testing /ask ===');
  const askResult = await answerMarketQuestion('Why is Bitcoin down today?');
  console.log('Ask target asset:', askResult.asset?.name);
  console.log('Ask news count:', askResult.news?.length);
  console.log('Ask answer preview:\n', askResult.answer?.slice(0, 250) + '...\n');
  const askHtml = formatAskResponse(askResult);
  console.log('Ask HTML length:', askHtml.length);

  console.log('✅ ALL NEW INTELLIGENCE TESTS PASSED');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
