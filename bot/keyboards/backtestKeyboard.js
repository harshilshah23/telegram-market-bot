import { InlineKeyboard } from 'grammy';

export function getConfirmationKeyboard(strategyId) {
  return new InlineKeyboard()
    .text('▶ RUN', `bt:run:${strategyId}`)
    .text('✏️ EDIT', `bt:edit:${strategyId}`);
}

export function getResultsKeyboard(strategyId) {
  return new InlineKeyboard()
    .text('📉 DRAWDOWN', `bt:dd:${strategyId}`)
    .text('🔬 ROBUSTNESS', `bt:rob:${strategyId}`)
    .row()
    .text('📋 TRADES LOG', `bt:trades:${strategyId}`)
    .text('📈 EQUITY CURVE', `bt:eq:${strategyId}`);
}
