import { runBacktestWorkflow } from '../services/backtest/backtestOrchestrator.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing /backtest Execution Engine & Parsers');
  console.log('====================================================\n');

  const testCases = [
    {
      name: '1. RSI Mean Reversion',
      prompt: 'BTC buy when RSI is below 30 and sell when RSI goes above 70'
    },
    {
      name: '2. EMA Crossover',
      prompt: 'ETH when the 20 EMA crosses above the 50 EMA, exit when it crosses below'
    },
    {
      name: '3. Drawdown from High',
      prompt: 'buy BTC whenever it drops 10% from its 30 day high and sell when it recovers'
    },
    {
      name: '4. Percentage Momentum & Time Exit',
      prompt: 'buy NVDA whenever it drops 5% in a day and sell after 5 days'
    },
    {
      name: '5. Multi-Asset Strategy',
      prompt: 'buy BTC whenever QQQ drops more than 2% in a day and sell when BTC rises 5%'
    },
    {
      name: '6. Stop Loss & Take Profit',
      prompt: 'buy TSLA when RSI < 35, stop loss 5%, take profit 10%'
    },
    {
      name: '7. Time-based Exit',
      prompt: 'buy SPY when RSI is below 30, exit after 10 days'
    },
    {
      name: '8. Leveraged Strategy',
      prompt: 'BTC 20 EMA crosses above 50 EMA, leverage 2x, exit when crosses below'
    },
    {
      name: '9. Complex Multi-Condition',
      prompt: 'buy BTC when above 200 SMA and RSI < 35, exit when RSI > 65'
    },
    {
      name: '10. Unsupported Data Handling',
      prompt: 'buy AAPL when 0DTE implied volatility skew is positive and order book depth exceeds 500k'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`----------------------------------------------------`);
    console.log(`🔍 Case: ${tc.name}`);
    console.log(`Prompt: "${tc.prompt}"`);

    try {
      const start = Date.now();
      const res = await runBacktestWorkflow(tc.prompt);
      const elapsed = Date.now() - start;

      if (tc.name.includes('Unsupported')) {
        if (!res.success && res.isUnsupported) {
          console.log(`✅ Correctly identified unsupported data requirement: "${res.error}"`);
          passed++;
        } else {
          console.error(`❌ Expected failure for unsupported data, but got:`, res);
          failed++;
        }
        continue;
      }

      if (!res.success) {
        console.error(`❌ FAILED: ${res.error}`);
        failed++;
        continue;
      }

      const m = res.metrics;
      console.log(`⏱️ Duration: ${elapsed}ms`);
      console.log(`📊 Asset: ${res.strategy.asset} | Trades: ${m.totalTrades} | Win Rate: ${m.winRatePct}%`);
      console.log(`💰 Return: ${m.totalReturnPct}% (CAGR: ${m.cagr}%) vs Buy & Hold: ${m.buyHoldReturnPct}%`);
      console.log(`📉 Max DD: -${m.maxDrawdownPct}% | Sharpe: ${m.sharpe} | Profit Factor: ${m.profitFactor}`);
      console.log(`🎲 Monte Carlo 95% DD: -${m.monteCarlo.p95Drawdown}% | Median Return: ${m.monteCarlo.medianReturn}%`);
      console.log(`🖼️ Chart URL: ${res.chartUrl?.slice(0, 60)}...`);

      if (typeof m.totalReturnPct !== 'number' || isNaN(m.totalReturnPct)) {
        throw new Error('Invalid total return calculation');
      }

      console.log(`✅ PASSED`);
      passed++;
    } catch (err) {
      console.error(`❌ EXCEPTION:`, err.message);
      failed++;
    }
  }

  console.log('\n====================================================');
  console.log(`📊 Summary: ${passed} Passed, ${failed} Failed out of ${testCases.length}`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
