/**
 * High-Grade Deterministic Market Intelligence Synthesizer
 * Generates concise, professional, market-aware editorial summaries
 * without any external AI API dependency. Zero cost, 100% reliable.
 */

export function synthesizeDeterministicBrief(data) {
  const { quote, assetInfo, news = [], globalCrypto, upcomingEvents = [] } = data;
  const change = quote?.changePercent ?? 0;
  const absChange = Math.abs(change);
  const symbol = assetInfo?.baseSymbol || assetInfo?.symbol || 'The asset';
  const name = assetInfo?.name || symbol;
  const assetType = assetInfo?.type || 'equity';

  // 1. Characterize directional momentum
  let actionVerb = 'consolidating';
  let directionDesc = 'trading flat';
  if (change >= 4.0) {
    actionVerb = 'surging';
    directionDesc = `extending strong upside with a +${change}% advance`;
  } else if (change >= 1.2) {
    actionVerb = 'firming';
    directionDesc = `moving higher by +${change}%`;
  } else if (change > -1.2) {
    actionVerb = 'range-bound';
    directionDesc = `holding relatively flat (${change >= 0 ? '+' : ''}${change}%)`;
  } else if (change > -4.0) {
    actionVerb = 'pulling back';
    directionDesc = `easing lower by ${change}%`;
  } else {
    actionVerb = 'under heavy pressure';
    directionDesc = `sliding sharply with a ${change}% drawdown`;
  }

  // 2. Analyze range context
  let rangeContext = '';
  if (quote?.dayHigh && quote?.dayLow && quote.dayHigh > quote.dayLow) {
    const rangeSpan = quote.dayHigh - quote.dayLow;
    const posInRange = (quote.price - quote.dayLow) / rangeSpan;
    if (posInRange > 0.8) {
      rangeContext = 'and holding near the upper boundary of its session range';
    } else if (posInRange < 0.2) {
      rangeContext = 'and pressing against its intraday lows';
    }
  }

  // 3. Extract dominant news themes
  let newsContext = '';
  if (news.length > 0) {
    const allTitles = news.map(n => n.title.toLowerCase()).join(' ');
    if (allTitles.includes('earning') || allTitles.includes('revenue') || allTitles.includes('profit')) {
      newsContext = 'Earnings sentiment and corporate execution remain the central focus for market participants.';
    } else if (allTitles.includes('ai') || allTitles.includes('chip') || allTitles.includes('gpu') || allTitles.includes('datacenter')) {
      newsContext = 'Broader technology momentum and enterprise AI infrastructure demand continue to underpin trading flow.';
    } else if (allTitles.includes('fed') || allTitles.includes('inflation') || allTitles.includes('rate') || allTitles.includes('cut')) {
      newsContext = 'Macro rate expectations and Federal Reserve policy signals are dictating the current risk appetite.';
    } else if (allTitles.includes('etf') || allTitles.includes('inflow') || allTitles.includes('institutional')) {
      newsContext = 'Institutional flows and custodial volume continue to drive liquidity conditions.';
    } else if (allTitles.includes('investigation') || allTitles.includes('sec') || allTitles.includes('probe') || allTitles.includes('lawsuit')) {
      newsContext = 'Regulatory scrutiny and legal developments are injecting near-term headline volatility.';
    }
  }

  // 4. Catalysts & Next Horizon
  let catalystContext = '';
  if (upcomingEvents.length > 0) {
    catalystContext = `The primary near-term focal point is ${upcomingEvents[0].title}.`;
  } else if (quote?.earningsDate) {
    catalystContext = `Market attention is shifting toward the upcoming earnings report scheduled for ${quote.earningsDate}.`;
  } else if (assetType === 'crypto') {
    catalystContext = 'Traders are closely watching whether spot volume confirms current momentum amid evolving macro liquidity.';
  } else {
    catalystContext = 'Market focus remains anchored on broader index direction and upcoming macro data releases.';
  }

  // 5. Asset-specific color & Technical Momentum
  let assetColor = '';
  if (data.ta?.['24h']?.bias && data.ta?.['1h']?.bias) {
    if (data.ta['24h'].bias === 'Bullish' && data.ta['1h'].bias === 'Bullish') {
      assetColor = 'Short-term momentum remains constructive with price holding above key hourly and daily exponential moving averages.';
    } else if (data.ta['24h'].bias === 'Bearish' || data.ta['1h'].bias === 'Bearish') {
      assetColor = 'Technical momentum signals caution as price navigates resistance near short-term moving averages.';
    }
  }

  if (!assetColor && assetType === 'crypto' && globalCrypto?.btcDominance) {
    if (globalCrypto.btcDominance > 56) {
      assetColor = `Bitcoin dominance remains elevated at ${globalCrypto.btcDominance}%, reflecting continued market preference for primary liquidity.`;
    }
  }

  // Assemble coherent 2-3 sentence narrative
  const sentence1 = `${symbol} is ${actionVerb}, ${directionDesc} ${rangeContext}`
    .trim()
    .replace(/\s+/g, ' ')
    .replace(' ,', ',') + '.';
  const sentence2 = newsContext || assetColor || `Broader market participation and sector rotations are shaping current order flow.`;
  const sentence3 = catalystContext;

  return `${sentence1} ${sentence2} ${sentence3}`;
}
