import { resolveSymbol } from './resolver/symbolResolver.js';
import { getYahooMarketQuote } from './market_data/yahooMarketData.js';
import { getBinance24hTicker, getGlobalCryptoMetrics } from './market_data/cryptoMarketData.js';
import { getMarketNews } from './news/newsAggregator.js';
import { getRelevantUpcomingEvents } from './events/macroEvents.js';
import { generateWhatMatters } from './intelligence/intelligenceEngine.js';
import { getTechnicalAnalysis } from './ta/technicalAnalysis.js';
import { formatMarketBrief } from '../bot/formatters/index.js';
import { getTickerKeyboard } from '../bot/keyboards/tickerKeyboard.js';

/**
 * Unified Market Intelligence Orchestrator
 * Coordinates resolution, quote, news, catalysts, editorial synthesis, and formatting.
 */
export async function getMarketIntelligence(rawQuery) {
  // 1. Resolve Symbol & Asset Type
  const assetInfo = await resolveSymbol(rawQuery);
  if (!assetInfo || !assetInfo.resolved) {
    return {
      success: false,
      error: assetInfo?.reason || 'not_found',
      query: rawQuery,
      otherMatches: assetInfo?.otherMatches || []
    };
  }

  // 2. Concurrently fetch Quote, News, Technicals, and Auxiliary Data
  const isCrypto = assetInfo.type === 'crypto';

  const [yahooQuote, binanceTicker, globalCrypto, news, ta] = await Promise.all([
    getYahooMarketQuote(assetInfo.symbol),
    isCrypto ? getBinance24hTicker(assetInfo.baseSymbol || assetInfo.symbol) : Promise.resolve(null),
    isCrypto ? getGlobalCryptoMetrics() : Promise.resolve(null),
    getMarketNews(assetInfo, 4),
    getTechnicalAnalysis(assetInfo)
  ]);

  if (!yahooQuote && !binanceTicker) {
    return {
      success: false,
      error: 'market_data_unavailable',
      symbol: assetInfo.symbol,
      name: assetInfo.name
    };
  }

  // Build unified quote object
  let quote = yahooQuote;

  if (isCrypto) {
    if (!quote && binanceTicker) {
      quote = {
        symbol: assetInfo.symbol,
        name: assetInfo.name,
        currency: 'USD',
        price: binanceTicker.price,
        changePercent: binanceTicker.change24h,
        dayHigh: binanceTicker.high24h,
        dayLow: binanceTicker.low24h,
        volume: binanceTicker.volumeUSD,
        marketCap: null,
        earningsDate: null
      };
    } else if (quote && binanceTicker) {
      // Use latest real-time price & volume from Binance
      quote.price = binanceTicker.price;
      quote.changePercent = binanceTicker.change24h;
      quote.dayHigh = binanceTicker.high24h;
      quote.dayLow = binanceTicker.low24h;
      quote.volume = binanceTicker.volumeUSD;
    }
  }

  // 3. Upcoming Events & Catalysts
  const upcomingEvents = getRelevantUpcomingEvents(assetInfo.type, quote);

  // 4. Synthesize "What Matters"
  const whatMatters = await generateWhatMatters({
    quote,
    assetInfo,
    news,
    globalCrypto,
    upcomingEvents,
    ta
  });

  // 5. Assemble and Format
  const fullData = {
    quote,
    assetInfo,
    news,
    globalCrypto,
    upcomingEvents,
    whatMatters,
    ta
  };

  const html = formatMarketBrief(fullData);
  const keyboard = getTickerKeyboard(assetInfo.symbol, assetInfo.type);

  return {
    success: true,
    assetInfo,
    quote,
    news,
    upcomingEvents,
    whatMatters,
    html,
    keyboard
  };
}
