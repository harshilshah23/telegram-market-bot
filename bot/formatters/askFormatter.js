import { escapeHtml } from './baseFormatter.js';

export function formatAskResponse(data) {
  const { question, asset, news, answer } = data;

  const lines = [];
  lines.push(`💬 <b>MARKET INTELLIGENCE Q&A</b>`);
  lines.push(`❓ <i>"${escapeHtml(question)}"</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Answer body (may contain basic HTML or Markdown from LLM, ensure standard paragraph separation)
  let cleanAnswer = answer
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>');
  lines.push(cleanAnswer);

  if (news && news.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`<b>RELEVANT SOURCES & NEWS</b>`);
    for (const n of news) {
      const safeTitle = escapeHtml(n.title);
      const safeSource = escapeHtml(n.source);
      if (n.link) {
        lines.push(`• <a href="${n.link}">${safeTitle}</a> (<i>${safeSource}</i>)`);
      } else {
        lines.push(`• ${safeTitle} (<i>${safeSource}</i>)`);
      }
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`⚠️ <i>Informational analysis grounded in publicly observed market data and news. Not financial advice.</i>`);

  return lines.join('\n');
}
