import { formatCryptoBrief } from './cryptoFormatter.js';
import { formatEquityBrief } from './equityFormatter.js';
import { formatEtfBrief } from './etfFormatter.js';

/**
 * Main dispatcher to format any market brief based on asset type
 */
export function formatMarketBrief(data) {
  const type = data?.assetInfo?.type;

  if (type === 'crypto') {
    return formatCryptoBrief(data);
  } else if (type === 'equity') {
    return formatEquityBrief(data);
  } else {
    // ETF, Index, Commodity
    return formatEtfBrief(data);
  }
}
