import { getMarketIntelligence } from '../services/marketOrchestrator.js';

const TEST_CASES = [
  'BTC',
  'ETH',
  'NVDA',
  'MSTR',
  'AAPL',
  'TSLA',
  'SPY',
  'NVIDIA',
  'Bitcoin'
];

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Telegram Market Intelligence Bot Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  for (const query of TEST_CASES) {
    console.log(`\n----------------------------------------------------`);
    console.log(`🔍 Testing Query: "/ticker ${query}"`);
    console.log(`----------------------------------------------------`);

    try {
      const startTime = Date.now();
      const result = await getMarketIntelligence(query);
      const elapsed = Date.now() - startTime;

      if (!result.success) {
        console.error(`❌ FAILED: Could not resolve/fetch for "${query}". Error: ${result.error}`);
        failed++;
        continue;
      }

      const { assetInfo, quote, news, upcomingEvents, whatMatters, html } = result;

      console.log(`⏱️ Latency: ${elapsed}ms`);
      console.log(`🎯 Resolved: ${assetInfo.originalQuery} -> ${assetInfo.symbol} (${assetInfo.name}) [Type: ${assetInfo.type}]`);
      console.log(`💰 Price: ${quote.price} ${quote.currency} | 24h Change: ${quote.changePercent}%`);
      console.log(`📊 High: ${quote.dayHigh} | Low: ${quote.dayLow} | Volume: ${quote.volume}`);
      console.log(`📰 News Count: ${news.length} deduplicated stories`);
      if (news[0]) {
        console.log(`   Sample: "${news[0].title}" (${news[0].source} · ${news[0].time})`);
      }
      console.log(`📅 Catalysts: ${upcomingEvents.length} event(s)`);
      if (upcomingEvents[0]) {
        console.log(`   Sample: ${upcomingEvents[0].title}`);
      }
      console.log(`⚡ What Matters (${whatMatters.source}):`);
      console.log(`   "${whatMatters.text}"`);

      // Basic sanity validations
      if (quote.price <= 0) throw new Error('Price must be greater than 0');
      if (!html || html.length < 50) throw new Error('HTML response must not be empty');
      if (!html.includes('WHAT MATTERS')) throw new Error('HTML must contain WHAT MATTERS section');

      console.log(`✅ TEST PASSED for "${query}"`);
      passed++;
    } catch (err) {
      console.error(`❌ EXCEPTION for "${query}":`, err.message);
      failed++;
    }
  }

  // Test Error Handling on unknown ticker
  console.log(`\n----------------------------------------------------`);
  console.log(`🔍 Testing Error Handling: Unknown Ticker "XYZ99INVALID"`);
  console.log(`----------------------------------------------------`);
  try {
    const errorResult = await getMarketIntelligence('XYZ99INVALID');
    if (!errorResult.success) {
      console.log(`✅ Gracefully handled unknown ticker: error = "${errorResult.error}"`);
      passed++;
    } else {
      console.error(`❌ Expected error for unknown ticker, but got success`);
      failed++;
    }
  } catch (err) {
    console.error(`❌ Unexpected crash on invalid ticker:`, err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
