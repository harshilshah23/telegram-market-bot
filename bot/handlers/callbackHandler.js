import { getMarketIntelligence } from '../../services/marketOrchestrator.js';
import { cache } from '../../cache/cacheManager.js';

export async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data.startsWith('refresh:')) {
    const symbol = data.replace('refresh:', '');
    await ctx.answerCallbackQuery({ text: `Refreshing ${symbol}...` });

    // Invalidate cached quote to force fresh fetch
    cache.del(`quote:${symbol.toUpperCase()}`);
    cache.del(`crypto:binance:${symbol.toUpperCase()}USDT`);

    try {
      const result = await getMarketIntelligence(symbol);
      if (result.success) {
        await ctx.editMessageText(result.html, {
          parse_mode: 'HTML',
          reply_markup: result.keyboard,
          disable_web_page_preview: true
        });
      }
    } catch (err) {
      console.error('Error refreshing brief:', err);
    }
  } else if (data === 'action:help') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💡 <b>Quick Guide:</b>\n\n' +
      'Use <code>/ticker &lt;symbol&gt;</code> to analyze any stock, ETF, crypto, or commodity.\n' +
      'Example: <code>/ticker NVDA</code> or <code>/ticker BTC</code>',
      { parse_mode: 'HTML' }
    );
  }
}
