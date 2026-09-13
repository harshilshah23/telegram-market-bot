import { escapeHtml, markdownToTelegramHtml } from './baseFormatter.js';
import { BRIEF_ASSETS } from '../../services/intelligence/marketBriefService.js';

export function formatMarketBrief(briefData) {
  const { quotes, topNews, macroEvents, editorial } = briefData;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const lines = [];
  lines.push(`📰 <b>GLOBAL MARKET BRIEF</b> — <i>${dateStr}</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`<b>MARKET OVERVIEW</b>`);

  for (const asset of BRIEF_ASSETS) {
    const q = quotes[asset.symbol];
    if (!q || q.price === undefined) {
      lines.push(`• <b>${asset.label}:</b> <i>Data unavailable</i>`);
      continue;
    }
    const sign = q.changePercent >= 0 ? '+' : '';
    const arrow = q.changePercent >= 0 ? '🟢' : '🔴';
    const priceStr = q.price >= 1000
      ? `$${Number(q.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${Number(q.price).toFixed(2)}`;
    lines.push(`• <b>${asset.label}:</b> ${priceStr} (${arrow} ${sign}${q.changePercent.toFixed(2)}%)`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  if (editorial) {
    lines.push(markdownToTelegramHtml(editorial));
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (macroEvents && macroEvents.length > 0) {
    lines.push(`<b>UPCOMING CATALYSTS</b>`);
    for (const evt of macroEvents.slice(0, 3)) {
      const evtDate = evt.date instanceof Date ? evt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      lines.push(`• <b>${escapeHtml(evt.title)}</b> ${evtDate ? `(<i>${evtDate}</i>)` : ''}`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (topNews && topNews.length > 0) {
    lines.push(`<b>TOP HEADLINES</b>`);
    for (const item of topNews.slice(0, 3)) {
      const safeTitle = escapeHtml(item.title);
      const safeSource = escapeHtml(item.source);
      if (item.link) {
        lines.push(`• <a href="${item.link}">${safeTitle}</a> (<i>${safeSource}</i>)`);
      } else {
        lines.push(`• ${safeTitle} (<i>${safeSource}</i>)`);
      }
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`<i>Tap /ticker for deep asset intel or /ask for market questions.</i>`);
  return lines.join('\n');
}
