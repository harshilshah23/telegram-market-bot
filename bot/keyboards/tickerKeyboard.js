import { InlineKeyboard } from 'grammy';

export function getTickerKeyboard(symbol, type = 'equity') {
  const cleanSymbol = symbol.toUpperCase();
  const webUrl = type === 'crypto'
    ? `https://coinmarketcap.com/currencies/${cleanSymbol.replace('-USD', '').toLowerCase()}`
    : `https://finance.yahoo.com/quote/${encodeURIComponent(cleanSymbol)}`;

  return new InlineKeyboard()
    .text('🔄 Refresh', `refresh:${cleanSymbol}`)
    .url('📊 Web Terminal', webUrl)
    .row()
    .text('❓ Help', 'action:help');
}
