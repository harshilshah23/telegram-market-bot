import { answerMarketQuestion } from '../../services/intelligence/qaService.js';
import { formatAskResponse } from '../formatters/askFormatter.js';
import { getAskKeyboard } from '../keyboards/askKeyboard.js';
import { escapeHtml } from '../formatters/baseFormatter.js';

export async function handleAskCommand(ctx) {
  let question = typeof ctx.match === 'string' ? ctx.match.trim() : '';

  if (!question) {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    if (parts.length > 1) {
      question = parts.slice(1).join(' ').trim();
    }
  }

  if (!question) {
    return ctx.reply(
      '💬 <b>Market Intelligence Q&A</b>\n\n' +
      'Ask any market question in plain English.\n\n' +
      '<b>Examples:</b>\n' +
      '• <code>/ask Why is Bitcoin down today?</code>\n' +
      '• <code>/ask What is driving NVDA right now?</code>\n' +
      '• <code>/ask Is the current BTC move unusual compared to the last year?</code>\n' +
      '• <code>/ask What are the biggest macro risks for crypto this week?</code>',
      { parse_mode: 'HTML' }
    );
  }

  const statusMsg = await ctx.reply(
    `🔍 <i>Analyzing market data, news & catalysts for:</i>\n"<code>${escapeHtml(question)}</code>"...`,
    { parse_mode: 'HTML' }
  );

  try {
    const data = await answerMarketQuestion(question);
    const html = formatAskResponse(data);
    const keyboard = getAskKeyboard(data.asset);

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      html,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true
      }
    );
  } catch (err) {
    console.error('Error handling /ask command:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      '⚠️ <i>Could not complete analysis. Please try rephrasing your question.</i>',
      { parse_mode: 'HTML' }
    );
  }
}
