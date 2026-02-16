import { mulberry32, randn } from "../core/rng.js";
import { createPortfolio, applyContribution, applyFees, applyReturn } from "./portfolio.js";

function drawAssetReturn(rand, model) {
  // model: {mean, vol} annual
  const z = randn(rand);
  return model.mean + model.vol * z;
}

export function runSinglePath(config) {
  const rand = mulberry32(config.monteCarlo.seed);

  const portfolio = createPortfolio(config.startBalance, config.allocation);

  const years = config.horizonYears;
  const contribAnnual = config.monthlyContribution * 12;

  const valueSeries = [];
  const returnSeries = [];
  const contribSeries = [];
  let contribTotal = 0;

  for (let y = 1; y <= years; y++) {
    // 1) contributions
    applyContribution(portfolio, contribAnnual);
    contribTotal += contribAnnual;

    // 2) generate asset returns
    const rStocks = drawAssetReturn(rand, config.model.stocks);
    const rBonds  = drawAssetReturn(rand, config.model.bonds);
    const rCash   = drawAssetReturn(rand, config.model.cash);

    const a = config.allocation;
    const weighted =
      a.stocks * rStocks +
      a.bonds  * rBonds +
      a.cash   * rCash;

    // 3) fees (optional)
    if (config.fees.enabled) applyFees(portfolio, config.fees.annual);

    // 4) apply return
    applyReturn(portfolio, weighted);

    valueSeries.push(portfolio.value);
    returnSeries.push(weighted);
    contribSeries.push(contribTotal);
  }

  return {
    seed: config.monteCarlo.seed,
    years,
    series: {
      value: valueSeries,
      returns: returnSeries,
      contributions: contribSeries
    }
  };
}

export function runMonteCarloBands(config) {
  // memory-light: store finals + per-year distribution slices
  const runs = config.monteCarlo.runs;
  const years = config.horizonYears;

  // Each year we collect all values across runs to compute percentiles
  const yearlyBuckets = Array.from({ length: years }, () => []);

  const finals = [];

  for (let i = 0; i < runs; i++) {
    const seed = (config.monteCarlo.seed + i * 1013904223) >>> 0; // deterministic seed stream
    const path = runSinglePath({ ...config, monteCarlo: { ...config.monteCarlo, seed } });

    for (let y = 0; y < years; y++) yearlyBuckets[y].push(path.series.value[y]);
    finals.push(path.series.value[years - 1]);
  }

  // sort buckets for percentile extraction
  for (let y = 0; y < years; y++) yearlyBuckets[y].sort((a, b) => a - b);
  finals.sort((a, b) => a - b);

  return { runs, years, yearlyBuckets, finals };
}
