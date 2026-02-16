import { DEFAULTS } from "./src/config/defaults.js";
import { createStore } from "./src/ui/state.js";
import { readConfigFromUI, onRunClicked, onSaveRun, onClearRuns } from "./src/ui/bindings.js";
import { validateInputs } from "./src/core/validation.js";

import { runSinglePath, runMonteCarloBands } from "./src/engine/simulator.js";
import { computePathMetrics } from "./src/analytics/metrics.js";
import { computeBands } from "./src/analytics/distribution.js";

import { renderSummary, renderSinglePathChart, renderBandsChart } from "./src/ui/render.js";

// Optional: keep your existing compare code later; for now we store runs in memory
const store = createStore({
  config: structuredClone(DEFAULTS),
  result: null,
  bands: null,
  compare: [] // saved runs (future: includes metrics + bands)
});

function run() {
  const base = store.getState().config;
  const config = readConfigFromUI(base);

  const errors = validateInputs(config);
  const allocationErrorEl = document.getElementById("allocationError");
  if (allocationErrorEl) allocationErrorEl.textContent = errors[0] ?? "";
  if (errors.length) return;

  // SINGLE PATH (always)
  const path = runSinglePath(config);
  const metrics = computePathMetrics(config, path);

  store.dispatch({ type: "SET_CONFIG", payload: config });
  store.dispatch({ type: "SET_RESULT", payload: { path, metrics } });

  renderSummary(metrics);

  // If Monte Carlo is enabled, render bands; else render path
  if (config.monteCarlo.enabled) {
    const mc = runMonteCarloBands(config);
    const bands = computeBands(mc.yearlyBuckets);
    store.dispatch({ type: "SET_BANDS", payload: bands });
    renderBandsChart(bands);
  } else {
    store.dispatch({ type: "SET_BANDS", payload: null });
    renderSinglePathChart(path);
  }
}

// Hooks
onRunClicked(run);

// These are placeholders so your compare UI buttons still do something.
// Later we’ll upgrade compare to save bands/metrics and overlay properly.
onSaveRun(() => {
  const state = store.getState();
  if (!state.result) return;
  const next = [...state.compare, state.result].slice(-3);
  store.dispatch({ type: "SET_COMPARE", payload: next });
});

onClearRuns(() => {
  store.dispatch({ type: "SET_COMPARE", payload: [] });
});

// initial run (optional)
// run();
