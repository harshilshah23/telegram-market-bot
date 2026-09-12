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
    `• <code>/btc</code> — Bitcoin fast shortcut\n` +
    `• <code>/eth</code> — Ethereum fast shortcut\n` +
    `• <code>/help</code> — Detailed manual\n\n` +
    `Try sending <code>/ticker BTC</code> or <code>/ticker NVDA</code> right now!`;

  return ctx.reply(welcomeText, { parse_mode: 'HTML' });
}

export async function handleHelpCommand(ctx) {
  const helpText =
    `<b>📖 Market Intelligence Bot — Manual</b>\n\n` +
    `<b>Supported Asset Classes:</b>\n` +
    `• <b>Cryptocurrencies:</b> BTC, ETH, SOL, DOGE, XRP, BNB, etc.\n` +
    `• <b>US Equities:</b> NVDA, AAPL, MSFT, TSLA, MSTR, AMZN, GOOGL, etc.\n` +
    `• <b>ETFs:</b> SPY, QQQ, IWM, DIA, SMH, etc.\n` +
    `• <b>Indices:</b> S&P 500 (^GSPC), Nasdaq (^IXIC), Dow (^DJI), VIX\n` +
    `• <b>Commodities:</b> Gold (GC=F), Crude Oil (CL=F), Silver (SI=F)\n\n` +
    `<b>Smart Symbol Resolution:</b>\n` +
    `You can type ticker symbols or company names:\n` +
    `• <code>/ticker NVIDIA</code> → NVDA\n` +
    `• <code>/ticker Apple</code> → AAPL\n` +
    `• <code>/ticker Bitcoin</code> → BTC\n\n` +
    `<b>Shortcuts:</b>\n` +
    `• <code>/btc</code> — Instant Bitcoin brief\n` +
    `• <code>/eth</code> — Instant Ethereum brief\n\n` +
    `<b>Need assistance?</b> Just type <code>/ticker &lt;query&gt;</code> to begin.`;

  return ctx.reply(helpText, { parse_mode: 'HTML' });
}

export async function handleBtcShortcut(ctx) {
  return handleTickerCommand(ctx, 'BTC');
}

export async function handleEthShortcut(ctx) {
  return handleTickerCommand(ctx, 'ETH');
}
