import { parseStrategy } from '../../services/backtest/strategyParser.js';
import { runBacktestWorkflow } from '../../services/backtest/backtestOrchestrator.js';
import { formatConfirmationCard, formatBacktestResult } from '../formatters/backtestFormatter.js';
import { getConfirmationKeyboard, getResultsKeyboard } from '../keyboards/backtestKeyboard.js';
import { escapeHtml } from '../formatters/baseFormatter.js';
import { cache } from '../../cache/cacheManager.js';

export async function handleBacktestCommand(ctx) {
  let prompt = typeof ctx.match === 'string' ? ctx.match.trim() : '';

  if (!prompt) {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    if (parts.length > 1) {
      prompt = parts.slice(1).join(' ').trim();
    }
  }

  if (!prompt) {
    return ctx.reply(
      '🧪 <b>Natural-Language Backtesting Terminal</b>\n\n' +
      'Tell me any trading idea or strategy in natural English, and I will backtest it on real historical data.\n\n' +
      '<b>Examples:</b>\n' +
      '• <code>/backtest BTC buy when RSI is below 30 and sell when RSI goes above 70</code>\n' +
      '• <code>/backtest ETH when the 20 EMA crosses above the 50 EMA, exit when it crosses below</code>\n' +
      '• <code>/backtest buy BTC whenever it drops 10% from its 30 day high and sell when it recovers</code>\n' +
      '• <code>/backtest buy NVDA whenever it drops 5% in a day and sell after 5 days</code>\n' +
      '• <code>/backtest buy BTC whenever QQQ drops more than 2% in a day and sell when BTC rises 5%</code>\n' +
      '• <code>/backtest buy TSLA when RSI &lt; 35, stop loss 5%, take profit 10%</code>\n' +
      '• <code>/backtest BTC 20 EMA crosses above 50 EMA, leverage 2x, exit when crosses below</code>',
      { parse_mode: 'HTML' }
    );
  }

  // Temporary interpretation message
  const statusMsg = await ctx.reply(
    `🧠 <i>Interpreting strategy:</i>\n"<code>${escapeHtml(prompt)}</code>"...`,
    { parse_mode: 'HTML' }
  );

  try {
    const parseResult = await parseStrategy(prompt);

    if (!parseResult.valid) {
      const errorMsg = parseResult.isUnsupported
        ? `⚠️ <b>Data Limitation Notice</b>\n\n${escapeHtml(parseResult.error)}`
        : `❌ <i>I could not extract clear trading rules from your description.</i>\n\n${escapeHtml(parseResult.error || '')}\n\n` +
          `Try specifying entry conditions (e.g. <code>RSI &lt; 30</code>, <code>20 EMA crosses 50 EMA</code>) and exits.`;

      return ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        errorMsg,
        { parse_mode: 'HTML' }
      );
    }

    const strategy = parseResult.strategy;
    const strategyId = `strat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cache.set(`bt_strat:${strategyId}`, strategy, 1800); // 30 minutes cache

    const confirmationText = formatConfirmationCard(strategy);
    const keyboard = getConfirmationKeyboard(strategyId);

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      confirmationText,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
  } catch (err) {
    console.error('Error handling /backtest:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `⚠️ <i>An error occurred while interpreting your strategy. Please rephrase or try again.</i>`,
      { parse_mode: 'HTML' }
    );
  }
}
