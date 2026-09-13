import { InlineKeyboard } from 'grammy';

export function getScenarioKeyboard(asset = 'BTC', shockPct = null) {
  const keyboard = new InlineKeyboard();
  const absShock = typeof shockPct === 'number' && !isNaN(shockPct) ? Math.abs(shockPct) : 10;
  
  keyboard
    .text(`🧪 Backtest This Dip Strategy`, `scen:bt:${asset}:${absShock}`)
    .row()
    .text(`📊 ${asset} Live Ticker`, `refresh:${asset}`)
    .text(`📰 Daily Brief`, 'brief:refresh');

  return keyboard;
}
