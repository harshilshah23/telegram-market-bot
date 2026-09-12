/**
 * Base formatting utilities for Telegram HTML output
 */

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPrice(price, currency = 'USD') {
  if (price === null || price === undefined || isNaN(price)) {
    return 'Price unavailable';
  }

  const prefix = currency === 'USD' ? '$' : `${currency} `;

  if (price >= 1000) {
    return `${prefix}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (price >= 1) {
    return `${prefix}${price.toFixed(2)}`;
  } else if (price >= 0.01) {
    return `${prefix}${price.toFixed(4)}`;
  } else {
    return `${prefix}${price.toFixed(6)}`;
  }
}

export function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00%';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function formatLargeNumber(val) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return null;
  const abs = Math.abs(val);
  if (abs >= 1e12) {
    return `$${(val / 1e12).toFixed(2)}T`;
  } else if (abs >= 1e9) {
    return `$${(val / 1e9).toFixed(2)}B`;
  } else if (abs >= 1e6) {
    return `$${(val / 1e6).toFixed(2)}M`;
  } else if (abs >= 1e3) {
    return `$${(val / 1e3).toFixed(1)}K`;
  }
  return `$${val.toFixed(0)}`;
}

export function getAssetEmoji(type, symbol = '') {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return '₿';
  if (sym.includes('ETH')) return 'Ξ';
  if (sym.includes('SOL')) return '◎';
  if (type === 'crypto') return '🪙';
  if (type === 'etf') return '🧺';
  if (type === 'index') return '📈';
  if (type === 'commodity') return '🛢️';
  return '🏢';
}

export function formatTechnicalAnalysisSection(ta) {
  if (!ta) return '';

  const tfLabels = [
    { key: '1h', label: '1H' },
    { key: '4h', label: '4H' },
    { key: '24h', label: '24H' },
    { key: '1w', label: '1W' }
  ];

  const lines = [];
  for (const { key, label } of tfLabels) {
    const item = ta[key];
    if (!item) continue;
    const noteEscaped = escapeHtml(item.note || '');
    const rsiPart = item.rsi !== null ? `RSI ${item.rsi}` : '';
    const details = [rsiPart, noteEscaped].filter(Boolean).join(' · ');
    const detailStr = details ? ` (${details})` : '';
    lines.push(`• <b>${label}:</b> ${item.emoji} <code>${escapeHtml(item.bias)}</code>${detailStr}`);
  }

  if (lines.length === 0) return '';
  return `\n\n<b>📐 TECHNICALS (EMA / RSI)</b>\n${lines.join('\n')}`;
}
