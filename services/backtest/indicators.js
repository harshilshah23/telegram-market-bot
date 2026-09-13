/**
 * Indicators calculation library for backtesting
 */

export function calculateSMA(values, period) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function calculateEMA(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  result[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * k + ema;
    result[i] = ema;
  }
  return result;
}

export function calculateRSI(values, period = 14) {
  const result = new Array(values.length).fill(null);
  if (values.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }

  return result;
}

export function calculateRollingHigh(values, period) {
  const result = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    let max = values[start];
    for (let j = start + 1; j <= i; j++) {
      if (values[j] > max) max = values[j];
    }
    result[i] = max;
  }
  return result;
}

export function calculateATR(highs, lows, closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  const tr = new Array(closes.length).fill(0);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atr;

  for (let i = period; i < closes.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }

  return result;
}
