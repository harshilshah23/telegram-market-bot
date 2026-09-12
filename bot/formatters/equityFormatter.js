import {
  escapeHtml,
  formatPrice,
  formatPercent,
  formatLargeNumber,
  getAssetEmoji,
  formatTechnicalAnalysisSection
} from './baseFormatter.js';

export function formatEquityBrief(data) {
  const { quote, assetInfo, news = [], upcomingEvents = [], whatMatters, ta } = data;

  const symbol = assetInfo.symbol;
  const name = assetInfo.name || symbol;
  const emoji = getAssetEmoji('equity', symbol);

  const priceStr = formatPrice(quote.price, quote.currency);
  const changeStr = `${formatPercent(quote.changePercent)} 1D`;

  // Market metrics
  const marketLines = [];
  if (quote.dayHigh !== null) marketLines.push(`Day High: <code>${formatPrice(quote.dayHigh)}</code>`);
  if (quote.dayLow !== null) marketLines.push(`Day Low: <code>${formatPrice(quote.dayLow)}</code>`);
  if (quote.volume) {
    const volFormatted = formatLargeNumber(quote.volume);
    if (volFormatted) marketLines.push(`Volume: <code>${volFormatted}</code>`);
  }
  if (quote.marketCap) {
    const mcapFormatted = formatLargeNumber(quote.marketCap);
    if (mcapFormatted) marketLines.push(`Market Cap: <code>${mcapFormatted}</code>`);
  }
  if (quote.fiftyTwoWeekHigh !== null && quote.fiftyTwoWeekLow !== null) {
    marketLines.push(`52w Range: <code>${formatPrice(quote.fiftyTwoWeekLow)} - ${formatPrice(quote.fiftyTwoWeekHigh)}</code>`);
  }

  // News section
  let newsSection = '';
  if (news.length > 0) {
    const newsItems = news.slice(0, 3).map(n => {
      const titleEscaped = escapeHtml(n.title);
      const sourceEscaped = escapeHtml(n.source);
      const timeEscaped = escapeHtml(n.time);
      const linkEscaped = n.link ? `<a href="${escapeHtml(n.link)}">${titleEscaped}</a>` : titleEscaped;
      return `• ${linkEscaped}\n  <i>${sourceEscaped} · ${timeEscaped}</i>`;
    }).join('\n\n');
    newsSection = `\n\n<b>📰 LATEST</b>\n${newsItems}`;
  } else {
    newsSection = '\n\n<b>📰 LATEST</b>\n<i>No recent relevant news found.</i>';
  }

  // Upcoming catalysts / earnings
  let upcomingSection = '';
  if (upcomingEvents.length > 0) {
    const eventItems = upcomingEvents.map(e => `• ${escapeHtml(e.title)}`).join('\n');
    upcomingSection = `\n\n<b>📅 UPCOMING</b>\n${eventItems}`;
  }

  // What matters
  const editorial = whatMatters?.text || 'Trading reflects current liquidity conditions and broader sector momentum.';
  const whatMattersSection = `\n\n<b>⚡ WHAT MATTERS</b>\n${escapeHtml(editorial)}`;

  // Header
  const header = `<b>${emoji} ${escapeHtml(symbol)} — ${escapeHtml(name)}</b>\n<code>${priceStr}</code> <code>${changeStr}</code>`;
  const marketBlock = marketLines.length > 0 ? `\n\n<b>📊 MARKET</b>\n${marketLines.join('\n')}` : '';
  const taSection = formatTechnicalAnalysisSection(ta);

  return `${header}${marketBlock}${taSection}${newsSection}${upcomingSection}${whatMattersSection}`;
}
