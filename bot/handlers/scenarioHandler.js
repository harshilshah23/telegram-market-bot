import { analyzeMarketScenario } from '../../services/intelligence/scenarioService.js';
import { formatScenarioReport } from '../formatters/scenarioFormatter.js';
import { getScenarioKeyboard } from '../keyboards/scenarioKeyboard.js';
import { escapeHtml } from '../formatters/baseFormatter.js';

export async function handleScenarioCommand(ctx) {
  let scenario = typeof ctx.match === 'string' ? ctx.match.trim() : '';

  if (!scenario) {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    if (parts.length > 1) {
      scenario = parts.slice(1).join(' ').trim();
    }
  }

  if (!scenario) {
    return ctx.reply(
      '🎲 <b>Market Scenario Analysis</b>\n\n' +
      'Explore hypothetical shocks, cross-asset transmission, and historical recovery dynamics.\n\n' +
      '<b>Examples:</b>\n' +
      '• <code>/scenario What happens if Bitcoin drops 20%?</code>\n' +
      '• <code>/scenario If ETH crashes 15%, how does BTC react?</code>\n' +
      '• <code>/scenario What happens if NVDA drops 10%?</code>\n' +
      '• <code>/scenario If the Fed cuts rates 50bps, how does the market behave?</code>',
      { parse_mode: 'HTML' }
    );
  }

  const statusMsg = await ctx.reply(
    `⏳ <i>Modeling scenario & historical transmission for:</i>\n"<code>${escapeHtml(scenario)}</code>"...`,
    { parse_mode: 'HTML' }
  );

  try {
    const result = await analyzeMarketScenario(scenario);
    const html = formatScenarioReport(result);
    const keyboard = getScenarioKeyboard(result.asset, result.shockPct);

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
    console.error('Error handling /scenario command:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      '⚠️ <i>Could not complete scenario analysis. Please specify a clear shock (e.g. "/scenario What happens if BTC drops 20%?").</i>',
      { parse_mode: 'HTML' }
    );
  }
}
