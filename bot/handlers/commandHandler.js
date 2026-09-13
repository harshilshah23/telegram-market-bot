import { handleTickerCommand } from './tickerHandler.js';

export async function handleStartCommand(ctx) {
  const welcomeText =
    `<b>🌐 Welcome to Market Intelligence Bot</b>\n\n` +
    `<i>"Ask any ticker. Get the story."</i>\n\n` +
    `Your lightweight market-intelligence terminal inside Telegram. Get real-time price action, curated news, upcoming catalysts, and synthesized editorial context in seconds.\n\n` +
    `<b>⚡ Quick Commands:</b>\n` +
    `• <code>/ticker NVDA</code> — Equities & ETFs\n` +
    `• <code>/ticker BTC</code> — Cryptocurrencies\n` +
    `• <code>/ticker Tesla</code> — Resolves company names\n` +
    `• <code>/ticker SPY</code> — Major index ETFs\n` +
    `• <code>/ticker Gold</code> — Commodities\n` +
    `• <code>/backtest BTC buy when RSI &lt; 30 and sell when RSI &gt; 70</code> — Natural Language Backtest\n` +
    `• <code>/btc</code> — Bitcoin fast shortcut\n` +
    `• <code>/eth</code> — Ethereum fast shortcut\n` +
    `• <code>/help</code> — Detailed manual\n\n` +
    `Try sending <code>/ticker BTC</code> or <code>/backtest BTC buy when RSI &lt; 30</code> right now!`;

  return ctx.reply(welcomeText, { parse_mode: 'HTML' });
}

export async function handleHelpCommand(ctx) {
  const helpText =
    `<b>📖 Market Intelligence Bot — Manual</b>\n\n` +
    `<b>Market Intelligence:</b>\n` +
    `• <code>/ticker &lt;symbol or company&gt;</code> — Full market brief, technicals & news\n` +
    `• <code>/btc</code> or <code>/eth</code> — Instant crypto shortcuts\n\n` +
    `<b>Natural Language Backtesting:</b>\n` +
    `• <code>/backtest &lt;strategy description in English&gt;</code>\n` +
    `  <i>Examples:</i>\n` +
    `  • <code>/backtest BTC buy when RSI is below 30 and sell when RSI goes above 70</code>\n` +
    `  • <code>/backtest ETH when 20 EMA crosses above 50 EMA, exit when crosses below</code>\n` +
    `  • <code>/backtest buy BTC whenever QQQ drops 2% in a day and sell when BTC rises 5%</code>\n` +
    `  • <code>/backtest buy NVDA whenever it drops 5% in a day and sell after 5 days</code>\n\n` +
    `<b>Supported Assets:</b> Cryptos, US Equities, ETFs, Indices, Commodities.`;

  return ctx.reply(helpText, { parse_mode: 'HTML' });
}

export async function handleBtcShortcut(ctx) {
  return handleTickerCommand(ctx, 'BTC');
}

export async function handleEthShortcut(ctx) {
  return handleTickerCommand(ctx, 'ETH');
}
