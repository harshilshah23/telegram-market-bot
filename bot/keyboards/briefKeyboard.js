import { InlineKeyboard } from 'grammy';

export function getBriefKeyboard() {
  return new InlineKeyboard()
    .text('🔄 Refresh Brief', 'brief:refresh')
    .row()
    .text('₿ BTC Intel', 'brief:view:BTC')
    .text('Ξ ETH Intel', 'brief:view:ETH')
    .row()
    .text('📈 S&P 500', 'brief:view:SPY')
    .text('⚡ Nasdaq', 'brief:view:QQQ');
}
