import { normalizeAllocation } from "../core/validation.js";

const el = (id) => document.getElementById(id);

export function readConfigFromUI(baseConfig) {
  const startBalance = parseFloat(el("startingBalance")?.value ?? baseConfig.startBalance);
  const monthlyContribution = parseFloat(el("monthlyContribution")?.value ?? baseConfig.monthlyContribution);
  const horizonYears = parseInt(el("years")?.value ?? baseConfig.horizonYears, 10);

  // Your UI stores allocation as % integers in hidden inputs
  const sPct = parseInt(el("stocks")?.value ?? 70, 10);
  const bPct = parseInt(el("bonds")?.value ?? 20, 10);
  const cPct = parseInt(el("cash")?.value ?? 10, 10);

  const allocation = normalizeAllocation({
    stocks: sPct / 100,
    bonds: bPct / 100,
    cash: cPct / 100
  });

  // Optional controls (if you add later)
  const mcEnabled = baseConfig.monteCarlo.enabled;
  const mcRuns = baseConfig.monteCarlo.runs;
  const mcSeed = baseConfig.monteCarlo.seed;

  return {
    ...baseConfig,
    startBalance,
    monthlyContribution,
    horizonYears,
    allocation,
    monteCarlo: { ...baseConfig.monteCarlo, enabled: mcEnabled, runs: mcRuns, seed: mcSeed }
  };
}

export function onRunClicked(fn) {
  el("runSimulation")?.addEventListener("click", fn);
}

export function onSaveRun(fn) {
  el("saveRun")?.addEventListener("click", fn);
}

export function onClearRuns(fn) {
  el("clearRuns")?.addEventListener("click", fn);
}
