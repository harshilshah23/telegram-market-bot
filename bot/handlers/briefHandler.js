import { getDailyMarketBrief } from '../../services/intelligence/marketBriefService.js';
import { formatMarketBrief } from '../formatters/briefFormatter.js';
import { getBriefKeyboard } from '../keyboards/briefKeyboard.js';

export async function handleBriefCommand(ctx) {
  const statusMsg = await ctx.reply(
    '📡 <i>Compiling institutional market brief (BTC, ETH, S&P 500, Nasdaq, Gold, DXY)...</i>',
    { parse_mode: 'HTML' }
  );

  try {
    const briefData = await getDailyMarketBrief();
    const briefHtml = formatMarketBrief(briefData);
    const keyboard = getBriefKeyboard();

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      briefHtml,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true
      }
    );
  } catch (err) {
    console.error('Error handling /brief command:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      '⚠️ <i>Could not generate daily market brief at this moment. Please try again shortly.</i>',
      { parse_mode: 'HTML' }
    );
  }
}
