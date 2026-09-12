import { getMarketIntelligence } from '../../services/marketOrchestrator.js';
import { escapeHtml } from '../formatters/baseFormatter.js';

export async function handleTickerCommand(ctx, explicitQuery = null) {
  let query = typeof explicitQuery === 'string' && explicitQuery.trim().length > 0
    ? explicitQuery.trim()
    : null;

  // 1. Try Grammy's ctx.match (text passed after /ticker)
  if (!query && typeof ctx.match === 'string' && ctx.match.trim().length > 0) {
    query = ctx.match.trim();
  }

  // 2. Fallback: Parse from full message text
  if (!query) {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    if (parts.length > 1) {
      query = parts.slice(1).join(' ').trim();
    }
  }

  if (!query) {
    return ctx.reply(
      '💡 <b>Usage:</b> <code>/ticker &lt;symbol or company name&gt;</code>\n\n' +
      '<b>Examples:</b>\n' +
      '• <code>/ticker NVDA</code>\n' +
      '• <code>/ticker BTC</code>\n' +
      '• <code>/ticker Tesla</code>\n' +
      '• <code>/ticker Apple</code>\n' +
      '• <code>/ticker SPY</code>\n' +
      '• <code>/btc</code> or <code>/eth</code>',
      { parse_mode: 'HTML' }
    );
  }

  // Send temporary loading indicator
  const statusMsg = await ctx.reply(
    `🔍 <i>Fetching market intelligence for <b>${escapeHtml(query)}</b>...</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    const result = await getMarketIntelligence(query);

    if (!result.success) {
      let errorText = '';
      if (result.error === 'market_data_unavailable') {
        errorText = `⚠️ <i>Market data is temporarily unavailable for</i> <code>${escapeHtml(query)}</code>. <i>Please try again in a moment.</i>`;
      } else {
        errorText = `❌ <i>I couldn't confidently identify</i> <code>${escapeHtml(query)}</code>.\n\n` +
          `Try entering a valid ticker symbol (e.g. <code>NVDA</code>, <code>BTC</code>, <code>SPY</code>) or company name (e.g. <code>NVIDIA</code>, <code>Apple</code>).`;

        if (result.otherMatches && result.otherMatches.length > 0) {
          errorText += '\n\n<b>Did you mean:</b>\n' +
            result.otherMatches.map(m => `• <code>/ticker ${escapeHtml(m.symbol)}</code> (${escapeHtml(m.name)})`).join('\n');
        }
      }

      return ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        errorText,
        { parse_mode: 'HTML' }
      );
    }

    // Render formatted market brief
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      result.html,
      {
        parse_mode: 'HTML',
        reply_markup: result.keyboard,
        disable_web_page_preview: true
      }
    );
  } catch (err) {
    console.error(`Error processing /ticker for ${query}:`, err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `⚠️ <i>Unable to retrieve market intelligence for <b>${escapeHtml(query)}</b> right now. Please try again shortly.</i>`,
      { parse_mode: 'HTML' }
    );
  }
}
