/**
 * Strategy Schema definition and validation utilities
 */

export function createDefaultStrategy(asset = 'BTC') {
  return {
    rawPrompt: '',
    asset: asset.toUpperCase(),
    signalAsset: asset.toUpperCase(),
    timeframe: '1d',
    period: '5y',
    direction: 'long', // 'long' or 'short'
    initialCapital: 10000,
    positionSizePct: 100, // 100%
    leverage: 1.0,
    feePct: 0.1, // 0.1% per trade
    slippagePct: 0.05, // 0.05% slippage
    stopLossPct: null,
    takeProfitPct: null,
    maxHoldingBars: null,
    entryConditions: [],
    exitConditions: [],
    unsupportedFeature: null
  };
}

export function validateStrategy(strategy) {
  if (!strategy || typeof strategy !== 'object') {
    return { valid: false, error: 'Strategy specification is invalid or empty.' };
  }

  if (strategy.unsupportedFeature) {
    return {
      valid: false,
      isUnsupported: true,
      error: strategy.unsupportedFeature
    };
  }

  if (!strategy.asset) {
    return { valid: false, error: 'Traded asset is missing.' };
  }

  if (!Array.isArray(strategy.entryConditions) || strategy.entryConditions.length === 0) {
    return { valid: false, error: 'No valid entry condition found in strategy.' };
  }

  return { valid: true };
}
