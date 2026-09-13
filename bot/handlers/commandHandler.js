import { handleTickerCommand } from './tickerHandler.js';

export async function handleStartCommand(ctx) {
  const welcomeText =
    `<b>🌐 Welcome to Market Intelligence Bot</b>\n\n` +
    `<i>"Ask any ticker. Get the story."</i>\n\n` +
    `Your lightweight market-intelligence terminal inside Telegram. Get real-time price action, curated news, upcoming catalysts, and synthesized editorial context in seconds.\n\n` +
    `<b>⚡ Quick Commands:</b>\n` +
    `• <code>/brief</code> — Global Market Brief (BTC, ETH, S&P 500, Nasdaq, Gold, DXY)\n` +
    `• <code>/ask Why is Bitcoin down today?</code> — Market Intelligence Q&A\n` +
    `• <code>/scenario What happens if Bitcoin drops 20%?</code> — Cross-asset sensitivity & shocks\n` +
    `• <code>/ticker NVDA</code> — Equities & ETFs\n` +
    `• <code>/ticker BTC</code> — Cryptocurrencies\n` +
    `• <code>/backtest BTC buy when RSI &lt; 30 and sell when RSI &gt; 70</code> — Backtest in natural English\n` +
    `• <code>/btc</code> or <code>/eth</code> — Instant crypto shortcuts\n` +
    `• <code>/help</code> — Detailed manual\n\n` +
    `Try sending <code>/brief</code> or <code>/ask Why is Bitcoin down today?</code> right now!`;

  return ctx.reply(welcomeText, { parse_mode: 'HTML' });
}

export async function handleHelpCommand(ctx) {
  const helpText =
    `<b>📖 Market Intelligence Bot — Manual</b>\n\n` +
    `<b>Daily Market Brief:</b>\n` +
    `• <code>/brief</code> — Macro overview, What Matters Today, upcoming catalysts & watch levels\n\n` +
    `<b>Market Intelligence Q&A:</b>\n` +
    `• <code>/ask &lt;question in plain English&gt;</code> — Objective analysis grounded in quotes, news & catalysts\n` +
    `  <i>Examples:</i> <code>/ask Why is Bitcoin down today?</code>, <code>/ask What's driving NVDA?</code>\n\n` +
    `<b>Scenario Sensitivity Analysis:</b>\n` +
    `• <code>/scenario &lt;hypothetical shock&gt;</code> — Historical cross-asset transmission & recovery speeds\n` +
    `  <i>Example:</i> <code>/scenario What happens if BTC drops 20%?</code>\n\n` +
    `<b>Market Intelligence Tickers:</b>\n` +
    `• <code>/ticker &lt;symbol or company&gt;</code> — Full market brief, technicals & news\n` +
    `• <code>/btc</code> or <code>/eth</code> — Instant crypto shortcuts\n\n` +
    `<b>Natural Language Backtesting:</b>\n` +
    `• <code>/backtest &lt;strategy description in English&gt;</code>\n` +
    `  <i>Examples:</i>\n` +
    `  • <code>/backtest BTC buy when RSI is below 30 and sell when RSI goes above 70</code>\n` +
    `  • <code>/backtest ETH when 20 EMA crosses above 50 EMA, exit when crosses below</code>\n` +
    `  • <code>/backtest buy BTC whenever QQQ drops 2% in a day and sell when BTC rises 5%</code>\n\n` +
    `<b>Supported Assets:</b> Cryptos, US Equities, ETFs, Indices, Commodities.`;

  return ctx.reply(helpText, { parse_mode: 'HTML' });
}

export async function handleBtcShortcut(ctx) {
  return handleTickerCommand(ctx, 'BTC');
}

export async function handleEthShortcut(ctx) {
  return handleTickerCommand(ctx, 'ETH');
}
