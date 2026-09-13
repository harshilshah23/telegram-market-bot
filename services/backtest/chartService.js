/**
 * QuickChart visual generator for equity curves and drawdowns
 */

export function generateEquityCurveChartUrl(equityCurve, symbol, strategyName) {
  if (!equityCurve || equityCurve.length === 0) return null;

  // Sample down to ~60 points for responsive rendering and lightweight URLs
  const step = Math.max(1, Math.floor(equityCurve.length / 60));
  const sampled = [];
  for (let i = 0; i < equityCurve.length; i += step) {
    sampled.push(equityCurve[i]);
  }
  if (sampled[sampled.length - 1] !== equityCurve[equityCurve.length - 1]) {
    sampled.push(equityCurve[equityCurve.length - 1]);
  }

  const labels = sampled.map(p => {
    const parts = p.date.split('-');
    return `${parts[1]}/${parts[0].slice(2)}`; // MM/YY
  });

  const initialCapital = sampled[0].equity;
  const initialClose = sampled[0].close;

  const strategyValues = sampled.map(p => Math.round((p.equity / initialCapital) * 100));
  const benchmarkValues = sampled.map(p => Math.round((p.close / initialClose) * 100));

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Strategy',
          data: strategyValues,
          borderColor: '#00e676', // vibrant green
          backgroundColor: 'rgba(0, 230, 118, 0.1)',
          fill: true,
          pointRadius: 0,
          borderWidth: 2.5
        },
        {
          label: `${symbol} Buy & Hold`,
          data: benchmarkValues,
          borderColor: '#2979ff', // bright blue
          backgroundColor: 'transparent',
          fill: false,
          pointRadius: 0,
          borderWidth: 1.8,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: `${symbol} — Backtest Equity Curve (Base: 100)`,
        fontColor: '#ffffff',
        fontSize: 16
      },
      legend: {
        labels: { fontColor: '#e0e0e0', fontSize: 12 }
      },
      scales: {
        xAxes: [{
          ticks: { fontColor: '#9e9e9e', maxTicksLimit: 8 },
          gridLines: { color: 'rgba(255, 255, 255, 0.08)' }
        }],
        yAxes: [{
          ticks: { fontColor: '#9e9e9e' },
          gridLines: { color: 'rgba(255, 255, 255, 0.08)' }
        }]
      }
    }
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=650&h=360&bkg=%231a1a24`;
}

export function generateDrawdownChartUrl(equityCurve, symbol) {
  if (!equityCurve || equityCurve.length === 0) return null;

  const step = Math.max(1, Math.floor(equityCurve.length / 60));
  const sampled = [];
  let peak = equityCurve[0].equity;

  for (let i = 0; i < equityCurve.length; i += step) {
    const eq = equityCurve[i].equity;
    if (eq > peak) peak = eq;
    const dd = -parseFloat((((peak - eq) / peak) * 100).toFixed(1));
    sampled.push({ date: equityCurve[i].date, dd });
  }

  const labels = sampled.map(p => {
    const parts = p.date.split('-');
    return `${parts[1]}/${parts[0].slice(2)}`;
  });

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Drawdown %',
          data: sampled.map(p => p.dd),
          borderColor: '#ff1744',
          backgroundColor: 'rgba(255, 23, 68, 0.25)',
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: `${symbol} — Historical Drawdown (%)`,
        fontColor: '#ffffff',
        fontSize: 16
      },
      legend: { display: false },
      scales: {
        xAxes: [{ ticks: { fontColor: '#9e9e9e', maxTicksLimit: 8 }, gridLines: { color: 'rgba(255,255,255,0.08)' } }],
        yAxes: [{ ticks: { fontColor: '#9e9e9e' }, gridLines: { color: 'rgba(255,255,255,0.08)' } }]
      }
    }
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=650&h=360&bkg=%231a1a24`;
}
