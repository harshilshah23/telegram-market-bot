import { getMarketIntelligence } from '../../services/marketOrchestrator.js';
import { runBacktestWorkflow } from '../../services/backtest/backtestOrchestrator.js';
import { formatBacktestResult, formatRobustnessReport } from '../formatters/backtestFormatter.js';
import { getResultsKeyboard } from '../keyboards/backtestKeyboard.js';
import { escapeHtml } from '../formatters/baseFormatter.js';
import { cache } from '../../cache/cacheManager.js';

export async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // 1. Existing /ticker refresh handler (Untouched)
  if (data.startsWith('refresh:')) {
    const symbol = data.replace('refresh:', '');
    await ctx.answerCallbackQuery({ text: `Refreshing ${symbol}...` });

    cache.del(`quote:${symbol.toUpperCase()}`);
    cache.del(`crypto:binance:${symbol.toUpperCase()}USDT`);

    try {
      const result = await getMarketIntelligence(symbol);
      if (result.success) {
        await ctx.editMessageText(result.html, {
          parse_mode: 'HTML',
          reply_markup: result.keyboard,
          disable_web_page_preview: true
        });
      }
    } catch (err) {
      console.error('Error refreshing brief:', err);
    }
    return;
  }

  // 2. Existing action:help handler (Untouched)
  if (data === 'action:help') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💡 <b>Quick Guide:</b>\n\n' +
      '• <b>Market Intelligence:</b> <code>/ticker &lt;symbol&gt;</code> (e.g. <code>/ticker NVDA</code> or <code>/ticker BTC</code>)\n' +
      '• <b>Natural Backtesting:</b> <code>/backtest &lt;strategy in English&gt;</code>\n' +
      '  <i>Example:</i> <code>/backtest BTC buy when RSI &lt; 30 and sell when RSI &gt; 70</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 3. /backtest RUN action
  if (data.startsWith('bt:run:')) {
    const strategyId = data.replace('bt:run:', '');
    const strategy = cache.get(`bt_strat:${strategyId}`);

    if (!strategy) {
      await ctx.answerCallbackQuery({ text: 'Strategy session expired. Please send /backtest again.' });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Running simulation on real market data...' });
    await ctx.editMessageText(
      `⏳ <b>Simulating ${escapeHtml(strategy.asset)} historical trades...</b>\n\n` +
      `<i>Calculating indicators, next-bar execution, fees & slippage...</i>`,
      { parse_mode: 'HTML' }
    );

    try {
      const result = await runBacktestWorkflow(strategy);

      if (!result.success) {
        return ctx.editMessageText(
          `❌ <b>Backtest Simulation Error</b>\n\n${escapeHtml(result.error)}`,
          { parse_mode: 'HTML' }
        );
      }

      // Cache backtest result for interactive tabs (drawdown, robustness, trades)
      cache.set(`bt_res:${strategyId}`, result, 1800);

      const summaryHtml = formatBacktestResult(result);
      const keyboard = getResultsKeyboard(strategyId);

      // Send equity curve chart as photo, or edit message with summary if image fails
      if (result.chartUrl) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.replyWithPhoto(result.chartUrl, {
          caption: summaryHtml,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        await ctx.editMessageText(summaryHtml, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } catch (err) {
      console.error('Error running backtest execution:', err);
      await ctx.editMessageText(
        `⚠️ <i>Failed to complete backtest simulation. Please check your parameters and try again.</i>`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

  // 4. /backtest DRAWDOWN tab
  if (data.startsWith('bt:dd:')) {
    const strategyId = data.replace('bt:dd:', '');
    const result = cache.get(`bt_res:${strategyId}`);
    if (!result) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Re-run /backtest.' });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Rendering Drawdown Chart...' });
    if (result.drawdownChartUrl) {
      await ctx.replyWithPhoto(result.drawdownChartUrl, {
        caption: `📉 <b>${escapeHtml(result.strategy.asset)} Underwater Drawdown</b>\nMax Drawdown: <b>-${result.metrics.maxDrawdownPct}%</b>`,
        parse_mode: 'HTML'
      });
    }
    return;
  }

  // 5. /backtest ROBUSTNESS tab (Monte Carlo 500x)
  if (data.startsWith('bt:rob:')) {
    const strategyId = data.replace('bt:rob:', '');
    const result = cache.get(`bt_res:${strategyId}`);
    if (!result) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Re-run /backtest.' });
      return;
    }

    await ctx.answerCallbackQuery();
    const robHtml = formatRobustnessReport(result.metrics);
    await ctx.reply(robHtml, { parse_mode: 'HTML' });
    return;
  }

  // 6. /backtest TRADES LOG tab
  if (data.startsWith('bt:trades:')) {
    const strategyId = data.replace('bt:trades:', '');
    const result = cache.get(`bt_res:${strategyId}`);
    if (!result) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Re-run /backtest.' });
      return;
    }

    await ctx.answerCallbackQuery();
    const trades = result.trades || [];
    if (trades.length === 0) {
      await ctx.reply('<i>No trades were triggered by this strategy.</i>', { parse_mode: 'HTML' });
      return;
    }

    const lastTrades = trades.slice(-8).reverse();
    const tradeLines = lastTrades.map((t, idx) => {
      const pnlSign = t.pnl >= 0 ? '+' : '';
      const emoji = t.pnl >= 0 ? '🟢' : '🔴';
      return `${emoji} <b>#${trades.length - idx}</b> [${t.entryDate} → ${t.exitDate}]\n` +
        `   In: <code>$${t.entryPrice.toFixed(2)}</code> | Out: <code>$${t.exitPrice.toFixed(2)}</code> (${pnlSign}${t.returnPct.toFixed(2)}%)\n` +
        `   <i>Reason: ${escapeHtml(t.exitReason)} · Held ${t.holdingBars} bars</i>`;
    }).join('\n\n');

    await ctx.reply(
      `📋 <b>Recent Trades Log (${trades.length} Total Trades)</b>\n\n${tradeLines}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 7. /backtest EQUITY CURVE re-display
  if (data.startsWith('bt:eq:')) {
    const strategyId = data.replace('bt:eq:', '');
    const result = cache.get(`bt_res:${strategyId}`);
    if (!result) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Re-run /backtest.' });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Sending Equity Curve...' });
    if (result.chartUrl) {
      await ctx.replyWithPhoto(result.chartUrl, {
        caption: `📈 <b>${escapeHtml(result.strategy.asset)} Strategy vs Buy & Hold</b>\nReturn: <b>${result.metrics.totalReturnPct}%</b> vs Buy & Hold: <b>${result.metrics.buyHoldReturnPct}%</b>`,
        parse_mode: 'HTML'
      });
    }
    return;
  }

  // 8. /backtest EDIT
  if (data.startsWith('bt:edit:')) {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '✏️ <b>To edit your strategy:</b>\n\n' +
      'Simply send a modified <code>/backtest &lt;your new rules&gt;</code> command!\n' +
      '<i>Example:</i> Change your parameters, indicators, or add a stop-loss / take-profit.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 9. /brief refresh
  if (data === 'brief:refresh') {
    await ctx.answerCallbackQuery({ text: 'Refreshing Global Market Brief...' });
    try {
      cache.del('market:daily_brief');
      const { getDailyMarketBrief } = await import('../../services/intelligence/marketBriefService.js');
      const { formatMarketBrief } = await import('../formatters/briefFormatter.js');
      const { getBriefKeyboard } = await import('../keyboards/briefKeyboard.js');

      const briefData = await getDailyMarketBrief();
      const html = formatMarketBrief(briefData);
      const keyboard = getBriefKeyboard();

      await ctx.editMessageText(html, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('Error in brief:refresh callback:', err);
    }
    return;
  }

  // 10. /brief view specific asset
  if (data.startsWith('brief:view:')) {
    const symbol = data.replace('brief:view:', '');
    await ctx.answerCallbackQuery({ text: `Loading ${symbol}...` });
    try {
      const result = await getMarketIntelligence(symbol);
      if (result.success) {
        await ctx.reply(result.html, {
          parse_mode: 'HTML',
          reply_markup: result.keyboard,
          disable_web_page_preview: true
        });
      }
    } catch (err) {
      console.error('Error in brief:view callback:', err);
    }
    return;
  }

  // 11. /scenario backtest bridge
  if (data.startsWith('scen:bt:')) {
    const parts = data.split(':');
    const asset = parts[2] || 'BTC';
    const shockPct = parts[3] || '10';
    await ctx.answerCallbackQuery();
    const strategyPrompt = `buy ${asset} whenever it drops ${shockPct}% from its 30 day high and sell when it recovers`;
    await ctx.reply(
      `🧪 <b>Triggering Backtest for Scenario:</b>\n<code>/backtest ${escapeHtml(strategyPrompt)}</code>\n\n<i>Simulating rule...</i>`,
      { parse_mode: 'HTML' }
    );
    const { handleBacktestCommand } = await import('./backtestHandler.js');
    ctx.match = strategyPrompt;
    return handleBacktestCommand(ctx);
  }

  // 12. /ask backtest bridge
  if (data.startsWith('ask:backtest:')) {
    const asset = data.replace('ask:backtest:', '');
    await ctx.answerCallbackQuery();
    const strategyPrompt = `${asset} buy when RSI is below 30 and sell when RSI goes above 70`;
    await ctx.reply(
      `🧪 <b>Running Mean-Reversion Backtest:</b>\n<code>/backtest ${escapeHtml(strategyPrompt)}</code>`,
      { parse_mode: 'HTML' }
    );
    const { handleBacktestCommand } = await import('./backtestHandler.js');
    ctx.match = strategyPrompt;
    return handleBacktestCommand(ctx);
  }
}
