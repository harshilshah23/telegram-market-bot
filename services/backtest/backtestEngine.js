import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateRollingHigh,
  calculateATR
} from './indicators.js';

/**
 * Precalculates indicators for bars
 */
function prepareIndicatorsForBars(bars, conditions, assetSymbol) {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const cache = {};

  for (const cond of conditions) {
    // If condition specifies an asset and it doesn't match this bar set, skip
    if (cond.asset && cond.asset.toUpperCase() !== assetSymbol.toUpperCase()) {
      continue;
    }

    if (cond.indicator === 'RSI') {
      const period = cond.period || 14;
      const key = `RSI_${period}`;
      if (!cache[key]) cache[key] = calculateRSI(closes, period);
    } else if (cond.indicator === 'MA_CROSS') {
      const fKey = `${cond.fastType}_${cond.fastPeriod}`;
      const sKey = `${cond.slowType}_${cond.slowPeriod}`;
      if (!cache[fKey]) {
        cache[fKey] = cond.fastType === 'EMA' ? calculateEMA(closes, cond.fastPeriod) : calculateSMA(closes, cond.fastPeriod);
      }
      if (!cache[sKey]) {
        cache[sKey] = cond.slowType === 'EMA' ? calculateEMA(closes, cond.slowPeriod) : calculateSMA(closes, cond.slowPeriod);
      }
    } else if (cond.indicator === 'MA_FILTER') {
      const key = `${cond.type || 'SMA'}_${cond.period}`;
      if (!cache[key]) {
        cache[key] = cond.type === 'EMA' ? calculateEMA(closes, cond.period) : calculateSMA(closes, cond.period);
      }
    } else if (cond.indicator === 'HIGH_DRAWDOWN' || cond.indicator === 'RECOVER_HIGH') {
      const lookback = cond.lookbackBars || 30;
      const key = `HIGH_${lookback}`;
      if (!cache[key]) cache[key] = calculateRollingHigh(highs, lookback);
    }
  }

  return { closes, highs, lows, cache };
}

/**
 * Evaluates entry or exit condition on bar index i
 */
function evaluateCondition(cond, i, bars, cache, position) {
  const close = bars[i].close;

  if (cond.indicator === 'RSI') {
    const period = cond.period || 14;
    const rsi = cache[`RSI_${period}`]?.[i];
    if (rsi === null || rsi === undefined) return false;
    if (cond.operator === '<' || cond.operator === 'below') return rsi < cond.value;
    if (cond.operator === '>' || cond.operator === 'above') return rsi > cond.value;
  }

  if (cond.indicator === 'MA_CROSS') {
    if (i < 1) return false;
    const fKey = `${cond.fastType}_${cond.fastPeriod}`;
    const sKey = `${cond.slowType}_${cond.slowPeriod}`;
    const currFast = cache[fKey]?.[i];
    const prevFast = cache[fKey]?.[i - 1];
    const currSlow = cache[sKey]?.[i];
    const prevSlow = cache[sKey]?.[i - 1];

    if (currFast === null || prevFast === null || currSlow === null || prevSlow === null) return false;

    if (cond.operator === 'crosses_above') {
      return prevFast <= prevSlow && currFast > currSlow;
    }
    if (cond.operator === 'crosses_below') {
      return prevFast >= prevSlow && currFast < currSlow;
    }
  }

  if (cond.indicator === 'MA_FILTER') {
    const key = `${cond.type || 'SMA'}_${cond.period}`;
    const ma = cache[key]?.[i];
    if (ma === null || ma === undefined) return false;
    if (cond.operator === '>') return close > ma;
    if (cond.operator === '<') return close < ma;
  }

  if (cond.indicator === 'HIGH_DRAWDOWN') {
    const lookback = cond.lookbackBars || 30;
    const high = cache[`HIGH_${lookback}`]?.[i];
    if (high === null || high === undefined || high <= 0) return false;
    const ddPct = ((high - close) / high) * 100;
    return ddPct >= cond.dropPct;
  }

  if (cond.indicator === 'DAILY_CHANGE') {
    if (i < 1) return false;
    const prevClose = bars[i - 1].close;
    const changePct = ((close - prevClose) / prevClose) * 100;
    if (cond.operator === 'daily_drop_pct') {
      return changePct <= -Math.abs(cond.dropPct);
    }
    if (cond.operator === 'daily_rise_pct') {
      return changePct >= Math.abs(cond.dropPct || cond.risePct);
    }
  }

  if (cond.indicator === 'PROFIT_TARGET' && position) {
    const targetPct = cond.targetPct || 5.0;
    const gainPct = ((close - position.entryPrice) / position.entryPrice) * 100;
    return gainPct >= targetPct;
  }

  if (cond.indicator === 'RECOVER_HIGH' && position) {
    const lookback = cond.lookbackBars || 30;
    const high = cache[`HIGH_${lookback}`]?.[i];
    return close >= high * 0.99;
  }

  return false;
}

/**
 * Runs the historical backtest simulation with ZERO LOOKAHEAD BIAS
 * Signal on Bar t close -> Execution on Bar t+1 Open with slippage and fees.
 */
export function executeBacktest(strategy, tradedBars, signalBars) {
  const allConditions = [...(strategy.entryConditions || []), ...(strategy.exitConditions || [])];

  const tradedData = prepareIndicatorsForBars(tradedBars, allConditions, strategy.asset);
  const signalData = prepareIndicatorsForBars(signalBars, allConditions, strategy.signalAsset || strategy.asset);

  const initialCapital = strategy.initialCapital || 10000;
  const feeFraction = (strategy.feePct || 0.1) / 100;
  const slippageFraction = (strategy.slippagePct || 0.05) / 100;
  const leverage = strategy.leverage || 1.0;

  let cash = initialCapital;
  let position = null;
  const trades = [];
  const equityCurve = [];

  const nBars = Math.min(tradedBars.length, signalBars.length);
  const startIndex = 20; // Warmup period

  let pendingSignal = null;

  for (let i = startIndex; i < nBars; i++) {
    const tradedBar = tradedBars[i];

    // 1. EXECUTE PENDING ORDER AT CURRENT BAR OPEN
    if (pendingSignal) {
      if (pendingSignal.type === 'BUY' && !position) {
        const executionPrice = tradedBar.open * (1 + slippageFraction);
        const positionSizeFraction = (strategy.positionSizePct || 100) / 100;
        const capitalToInvest = cash * positionSizeFraction;
        const fee = capitalToInvest * feeFraction;
        const actualCapital = (capitalToInvest - fee) * leverage;
        const units = actualCapital / executionPrice;

        cash -= capitalToInvest;
        position = {
          entryPrice: executionPrice,
          entryBarIndex: i,
          entryDate: tradedBar.date,
          units,
          investedCapital: capitalToInvest,
          feePaid: fee,
          direction: strategy.direction || 'long'
        };
      } else if (pendingSignal.type === 'SELL' && position) {
        const executionPrice = tradedBar.open * (1 - slippageFraction);
        const grossReturn = position.units * executionPrice;
        const fee = grossReturn * feeFraction;
        const netCash = grossReturn - fee;

        const pnl = netCash - position.investedCapital;
        const returnPct = (pnl / position.investedCapital) * 100;

        cash += netCash;
        trades.push({
          entryDate: position.entryDate,
          exitDate: tradedBar.date,
          entryPrice: position.entryPrice,
          exitPrice: executionPrice,
          pnl,
          returnPct,
          holdingBars: i - position.entryBarIndex,
          exitReason: pendingSignal.reason || 'Signal'
        });
        position = null;
      }
      pendingSignal = null;
    }

    // 2. CHECK INTRADAY STOP LOSS / TAKE PROFIT
    if (position) {
      if (strategy.stopLossPct) {
        const slPrice = position.entryPrice * (1 - strategy.stopLossPct / 100);
        if (tradedBar.low <= slPrice) {
          const exitPrice = Math.min(tradedBar.open, slPrice) * (1 - slippageFraction);
          const grossReturn = position.units * exitPrice;
          const fee = grossReturn * feeFraction;
          const netCash = grossReturn - fee;
          const pnl = netCash - position.investedCapital;
          const returnPct = (pnl / position.investedCapital) * 100;

          cash += netCash;
          trades.push({
            entryDate: position.entryDate,
            exitDate: tradedBar.date,
            entryPrice: position.entryPrice,
            exitPrice,
            pnl,
            returnPct,
            holdingBars: i - position.entryBarIndex,
            exitReason: 'Stop Loss'
          });
          position = null;
        }
      }

      if (position && strategy.takeProfitPct) {
        const tpPrice = position.entryPrice * (1 + strategy.takeProfitPct / 100);
        if (tradedBar.high >= tpPrice) {
          const exitPrice = Math.max(tradedBar.open, tpPrice) * (1 - slippageFraction);
          const grossReturn = position.units * exitPrice;
          const fee = grossReturn * feeFraction;
          const netCash = grossReturn - fee;
          const pnl = netCash - position.investedCapital;
          const returnPct = (pnl / position.investedCapital) * 100;

          cash += netCash;
          trades.push({
            entryDate: position.entryDate,
            exitDate: tradedBar.date,
            entryPrice: position.entryPrice,
            exitPrice,
            pnl,
            returnPct,
            holdingBars: i - position.entryBarIndex,
            exitReason: 'Take Profit'
          });
          position = null;
        }
      }

      if (position && strategy.maxHoldingBars) {
        if (i - position.entryBarIndex >= strategy.maxHoldingBars) {
          pendingSignal = { type: 'SELL', reason: `Held ${strategy.maxHoldingBars} bars` };
        }
      }
    }

    // 3. RECORD MARK-TO-MARKET PORTFOLIO VALUE
    const currentPositionValue = position ? position.units * tradedBar.close : 0;
    const currentEquity = cash + currentPositionValue;
    equityCurve.push({
      date: tradedBar.date,
      equity: currentEquity,
      close: tradedBar.close
    });

    // 4. EVALUATE STRATEGY CONDITIONS ON BAR CLOSE
    if (!pendingSignal) {
      if (!position) {
        let entryTriggered = strategy.entryConditions.length > 0;
        for (const cond of strategy.entryConditions) {
          // Route to appropriate bar data (traded asset vs signal asset)
          const isTraded = cond.asset ? (cond.asset.toUpperCase() === strategy.asset.toUpperCase()) : false;
          const targetBars = isTraded ? tradedBars : signalBars;
          const targetCache = isTraded ? tradedData.cache : signalData.cache;

          if (!evaluateCondition(cond, i, targetBars, targetCache, null)) {
            entryTriggered = false;
            break;
          }
        }
        if (entryTriggered) {
          pendingSignal = { type: 'BUY', reason: 'Entry rules met' };
        }
      } else {
        let exitTriggered = false;
        for (const cond of strategy.exitConditions) {
          const isTraded = cond.asset ? (cond.asset.toUpperCase() === strategy.asset.toUpperCase()) : false;
          const targetBars = isTraded ? tradedBars : signalBars;
          const targetCache = isTraded ? tradedData.cache : signalData.cache;

          if (evaluateCondition(cond, i, targetBars, targetCache, position)) {
            exitTriggered = true;
            break;
          }
        }
        if (exitTriggered) {
          pendingSignal = { type: 'SELL', reason: 'Exit rules met' };
        }
      }
    }
  }

  // Close any open position at final bar
  if (position) {
    const finalBar = tradedBars[nBars - 1];
    const exitPrice = finalBar.close * (1 - slippageFraction);
    const grossReturn = position.units * exitPrice;
    const fee = grossReturn * feeFraction;
    const netCash = grossReturn - fee;
    const pnl = netCash - position.investedCapital;
    const returnPct = (pnl / position.investedCapital) * 100;

    cash += netCash;
    trades.push({
      entryDate: position.entryDate,
      exitDate: finalBar.date,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      returnPct,
      holdingBars: nBars - 1 - position.entryBarIndex,
      exitReason: 'End of Test'
    });
  }

  return {
    initialCapital,
    finalCapital: cash,
    trades,
    equityCurve
  };
}
