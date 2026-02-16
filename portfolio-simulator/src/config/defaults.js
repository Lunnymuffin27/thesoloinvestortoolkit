export const DEFAULTS = {
  horizonYears: 30,
  startBalance: 10000,
  monthlyContribution: 500,

  allocation: { stocks: 0.70, bonds: 0.20, cash: 0.10 },

  rebalance: { enabled: false, frequency: "annual" },

  inflation: { enabled: false, rate: 0.025 },

  fees: { enabled: false, annual: 0.002 },

  model: {
    // simple MVP model now; upgrade later to correlations/regimes
    stocks: { mean: 0.08, vol: 0.15 },
    bonds:  { mean: 0.04, vol: 0.06 },
    cash:   { mean: 0.02, vol: 0.01 }
  },

  monteCarlo: { enabled: false, runs: 300, seed: 12345 },

  // simulation resolution: "year" is fastest; "month" later
  timestep: "year"
};
