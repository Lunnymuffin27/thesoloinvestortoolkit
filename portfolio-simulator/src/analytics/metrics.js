import { mean, stdev } from "../core/math.js";

export function computeMaxDrawdown(valueSeries) {
  let peak = -Infinity;
  let maxDD = 0; // negative
  for (const v of valueSeries) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak; // <= 0
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD; // e.g. -0.32
}

export function computeCAGR(startValue, endValue, years) {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

export function computePathMetrics(config, path) {
  const values = path.series.value;
  const rets = path.series.returns;

  const finalValue = values[values.length - 1];
  const contributions = config.monthlyContribution * 12 * config.horizonYears;
  const gains = finalValue - contributions;

  const bestYear = Math.max(...rets);
  const worstYear = Math.min(...rets);

  const maxDD = computeMaxDrawdown(values);
  const vol = stdev(rets);
  const avgReturn = mean(rets);

  // Sharpe-lite: (avg - rf) / vol
  const rf = config.model.cash.mean; // use cash mean as proxy risk-free
  const sharpeLite = vol > 0 ? (avgReturn - rf) / vol : 0;

  const cagr = computeCAGR(config.startBalance + contributions, finalValue, config.horizonYears);

  return {
    finalValue,
    contributions,
    gains,
    bestYear,
    worstYear,
    maxDrawdown: maxDD,
    volatility: vol,
    avgReturn,
    sharpeLite,
    cagr
  };
}
