import { InlineKeyboard } from 'grammy';

export function getScenarioKeyboard(asset, shockPct) {
  const keyboard = new InlineKeyboard();
  const absShock = Math.abs(shockPct);
  // Suggest a natural language backtest rule based on the scenario shock!
  const suggestedStrategy = `buy ${asset} whenever it drops ${absShock}% in a day and sell after 10 days`;
  
  keyboard
    .text(`🧪 Backtest This Dip Strategy`, `scen:bt:${asset}:${absShock}`)
    .row()
    .text(`📊 ${asset} Live Ticker`, `refresh:${asset}`)
    .text(`📰 Daily Brief`, 'brief:refresh');

  return keyboard;
}
