import { InlineKeyboard } from 'grammy';

export function getAskKeyboard(asset) {
  const keyboard = new InlineKeyboard();
  if (asset && asset.symbol) {
    const cleanSym = asset.symbol.replace('-USD', '').replace('^', '');
    keyboard
      .text(`📊 ${cleanSym} Ticker`, `refresh:${cleanSym}`)
      .text(`🧪 Backtest ${cleanSym}`, `ask:backtest:${cleanSym}`)
      .row();
  }
  keyboard.text('📰 Daily Brief', 'brief:refresh');
  return keyboard;
}
