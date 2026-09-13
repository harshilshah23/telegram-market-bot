import { createDefaultStrategy } from './strategySchema.js';

// Common assets recognition
const COMMON_ASSETS = [
  'BTC', 'BITCOIN', 'ETH', 'ETHEREUM', 'SOL', 'SOLANA',
  'NVDA', 'NVIDIA', 'TSLA', 'TESLA', 'AAPL', 'APPLE',
  'MSFT', 'MICROSOFT', 'AMZN', 'AMAZON', 'GOOGL', 'GOOGLE',
  'MSTR', 'QQQ', 'SPY', 'IWM', 'DIA', 'GLD', 'GOLD',
  'DOGE', 'XRP', 'BNB', 'ADA'
];

function normalizeSymbol(sym) {
  if (!sym) return 'BTC';
  const s = sym.toUpperCase().trim();
  if (s === 'BITCOIN') return 'BTC';
  if (s === 'ETHEREUM') return 'ETH';
  if (s === 'SOLANA') return 'SOL';
  if (s === 'NVIDIA') return 'NVDA';
  if (s === 'TESLA') return 'TSLA';
  if (s === 'APPLE') return 'AAPL';
  if (s === 'MICROSOFT') return 'MSFT';
  if (s === 'AMAZON') return 'AMZN';
  if (s === 'GOOGLE') return 'GOOGL';
  return s;
}

export function parseStrategyDeterministic(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Empty strategy text provided.' };
  }

  const text = prompt.trim();
  const lower = text.toLowerCase();

  // 1. Detect unsupported features (options chains, orderbook depth, sentiment scraping)
  if (lower.includes('options chain') || lower.includes('implied volatility skew') || lower.includes('order book depth') || lower.includes('orderbook')) {
    return {
      valid: false,
      isUnsupported: true,
      error: 'Historical options-chain and order-book depth data are not supported by the free data feeds. Please specify technical indicators (RSI, EMA, SMA, ATR), price action, or multi-asset triggers.'
    };
  }

  // 2. Identify Traded Asset & Signal Asset
  let tradedAsset = null;
  let signalAsset = null;

  // Check multi-asset pattern: e.g. "buy BTC whenever QQQ drops"
  const multiAssetMatch = text.match(/buy\s+([A-Za-z]+)\s+(?:when|whenever|if)\s+([A-Za-z]+)/i);
  if (multiAssetMatch && COMMON_ASSETS.includes(multiAssetMatch[2].toUpperCase())) {
    tradedAsset = normalizeSymbol(multiAssetMatch[1]);
    signalAsset = normalizeSymbol(multiAssetMatch[2]);
  } else {
    // Find first mentioned common asset
    const words = text.split(/[\s,;.!?]+/);
    for (const w of words) {
      const up = w.toUpperCase();
      if (COMMON_ASSETS.includes(up)) {
        tradedAsset = normalizeSymbol(up);
        signalAsset = tradedAsset;
        break;
      }
    }
  }

  if (!tradedAsset) {
    tradedAsset = 'BTC'; // default
    signalAsset = 'BTC';
  }

  const strategy = createDefaultStrategy(tradedAsset);
  strategy.signalAsset = signalAsset;
  strategy.rawPrompt = prompt;

  // 3. Detect Timeframe (default: 1d)
  if (lower.includes('1h') || lower.includes('1 hour') || lower.includes('hourly')) {
    strategy.timeframe = '1h';
  } else if (lower.includes('4h') || lower.includes('4 hour')) {
    strategy.timeframe = '4h';
  } else if (lower.includes('1w') || lower.includes('1 week') || lower.includes('weekly')) {
    strategy.timeframe = '1w';
  } else {
    strategy.timeframe = '1d';
  }

  // 4. Detect Leverage (e.g., "leverage 2x", "2x leverage", "3x")
  const leverageMatch = text.match(/(?:leverage\s*(\d+(?:\.\d+)?)\s*x?|(\d+(?:\.\d+)?)\s*x\s*leverage)/i);
  if (leverageMatch) {
    strategy.leverage = parseFloat(leverageMatch[1] || leverageMatch[2]) || 1.0;
  }

  // 5. Detect Stop Loss & Take Profit
  const slMatch = text.match(/(?:stop\s*loss|sl)\s*(?:of|at|is)?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (slMatch) {
    strategy.stopLossPct = parseFloat(slMatch[1]);
  }

  const tpMatch = text.match(/(?:take\s*profit|tp)\s*(?:of|at|is)?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (tpMatch) {
    strategy.takeProfitPct = parseFloat(tpMatch[1]);
  }

  // 6. Detect Holding Period (e.g. "sell after 5 days", "hold for 10 bars")
  const holdMatch = text.match(/(?:sell|exit|close)\s+after\s+(\d+)\s+(days|bars|hours)/i);
  if (holdMatch) {
    strategy.maxHoldingBars = parseInt(holdMatch[1], 10);
  }

  // 7. Extract Entry & Exit Conditions
  // A) RSI rules
  const rsiBuyMatch = text.match(/rsi\s*(?:is\s*)?(?:below|<|less than)\s*(\d+)/i);
  if (rsiBuyMatch) {
    strategy.entryConditions.push({
      indicator: 'RSI',
      period: 14,
      operator: '<',
      value: parseFloat(rsiBuyMatch[1])
    });
  }

  const rsiSellMatch = text.match(/rsi\s*(?:goes\s*above|>|crosses\s*above|greater than)\s*(\d+)/i);
  if (rsiSellMatch) {
    strategy.exitConditions.push({
      indicator: 'RSI',
      period: 14,
      operator: '>',
      value: parseFloat(rsiSellMatch[1])
    });
  }

  // B) Moving Average Crossovers (e.g., "20 EMA crosses above 50 EMA", "exit when crosses below")
  const crossBuyMatch = text.match(/(\d+)\s*(?:day\s*)?(ema|sma)\s*crosses\s*above\s*(\d+)\s*(?:day\s*)?(ema|sma)/i);
  if (crossBuyMatch) {
    const fastPeriod = parseInt(crossBuyMatch[1], 10);
    const fastType = crossBuyMatch[2].toUpperCase();
    const slowPeriod = parseInt(crossBuyMatch[3], 10);
    const slowType = crossBuyMatch[4].toUpperCase();

    strategy.entryConditions.push({
      indicator: 'MA_CROSS',
      fastType,
      fastPeriod,
      slowType,
      slowPeriod,
      operator: 'crosses_above'
    });

    if (lower.includes('crosses below') || lower.includes('cross below')) {
      strategy.exitConditions.push({
        indicator: 'MA_CROSS',
        fastType,
        fastPeriod,
        slowType,
        slowPeriod,
        operator: 'crosses_below'
      });
    }
  }

  // C) Trend filter (e.g. "above the 200-day moving average" or "above 200 SMA")
  const trendMatch = text.match(/above\s*(?:the\s*)?(\d+)(?:-day)?\s*(?:moving\s*average|sma|ema)/i);
  if (trendMatch) {
    strategy.entryConditions.push({
      indicator: 'MA_FILTER',
      type: 'SMA',
      period: parseInt(trendMatch[1], 10),
      operator: '>'
    });
  }

  // D) Drawdown from N-day High (e.g. "drops 10% from its 30 day high", "sell when it recovers")
  const highDdMatch = text.match(/drops?\s*(\d+(?:\.\d+)?)\s*%\s*from\s*(?:its\s*)?(\d+)\s*(?:day|bar)?\s*high/i);
  if (highDdMatch) {
    const dropPct = parseFloat(highDdMatch[1]);
    const lookback = parseInt(highDdMatch[2], 10);
    strategy.entryConditions.push({
      indicator: 'HIGH_DRAWDOWN',
      lookbackBars: lookback,
      dropPct: dropPct,
      operator: 'drops_pct_from_high'
    });

    if (lower.includes('recovers') || lower.includes('recover')) {
      strategy.exitConditions.push({
        indicator: 'RECOVER_HIGH',
        lookbackBars: lookback,
        operator: 'recovers_to_high'
      });
    }
  }

  // E) Daily percentage drop/spike (e.g. "drops more than 2% in a day", "drops 5% in a day")
  const dayDropMatch = text.match(/drops?\s*(?:more than\s*)?(\d+(?:\.\d+)?)\s*%\s*in\s*a\s*day/i);
  if (dayDropMatch) {
    strategy.entryConditions.push({
      indicator: 'DAILY_CHANGE',
      dropPct: parseFloat(dayDropMatch[1]),
      operator: 'daily_drop_pct'
    });
  }

  // F) Profit target exit (e.g. "sell when BTC rises 5%", "sell when rises 5%")
  const riseExitMatch = text.match(/(?:sell|exit)\s+when\s+(?:[a-zA-Z]+\s+)?rises\s*(\d+(?:\.\d+)?)\s*%/i);
  if (riseExitMatch) {
    strategy.exitConditions.push({
      indicator: 'PROFIT_TARGET',
      targetPct: parseFloat(riseExitMatch[1]),
      operator: 'rises_from_entry'
    });
  }

  // Default exit fallback if entry exists but exit not specified:
  // e.g. opposite condition or default 5% target / 10 bars
  if (strategy.entryConditions.length > 0 && strategy.exitConditions.length === 0 && !strategy.maxHoldingBars && !strategy.takeProfitPct) {
    const firstEntry = strategy.entryConditions[0];
    if (firstEntry.indicator === 'RSI') {
      strategy.exitConditions.push({ indicator: 'RSI', period: 14, operator: '>', value: 70 });
    } else if (firstEntry.indicator === 'HIGH_DRAWDOWN') {
      strategy.exitConditions.push({ indicator: 'PROFIT_TARGET', targetPct: 5.0 });
    } else {
      strategy.maxHoldingBars = 10;
    }
  }

  return {
    valid: strategy.entryConditions.length > 0,
    strategy,
    error: strategy.entryConditions.length === 0 ? 'Could not extract valid entry conditions from the strategy.' : null
  };
}
