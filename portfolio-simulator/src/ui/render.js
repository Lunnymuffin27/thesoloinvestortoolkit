import { formatMoney, formatPct } from "../core/money.js";
import { buildLabels, renderLineChart } from "./charts.js";

const el = (id) => document.getElementById(id);

export function renderSummary(metrics) {
  // existing IDs from your UI
  el("finalValue").textContent = formatMoney(metrics.finalValue);
  el("totalContributions").textContent = formatMoney(metrics.contributions);
  el("totalGains").textContent = formatMoney(metrics.gains);

  el("bestYear").textContent = formatPct(metrics.bestYear);
  el("worstYear").textContent = formatPct(metrics.worstYear);

  // optional: add these fields to UI later if you want
  // el("maxDrawdown").textContent = formatPct(metrics.maxDrawdown);
  // el("volatility").textContent = formatPct(metrics.volatility);
}

export function renderSinglePathChart(path) {
  const years = path.years;
  const labels = buildLabels(years);

  renderLineChart({
    labels,
    datasets: [
      {
        label: "Current Run",
        data: path.series.value,
        borderWidth: 3,
        tension: 0.25,
        borderColor: "rgba(31,30,28,.85)"
      }
    ]
  });
}

export function renderBandsChart(bands) {
  const years = bands.p50.length;
  const labels = buildLabels(years);

  renderLineChart({
    labels,
    datasets: [
      {
        label: "P10",
        data: bands.p10,
        borderWidth: 2,
        tension: 0.25,
        borderColor: "rgba(176,0,32,.55)"
      },
      {
        label: "P50 (Median)",
        data: bands.p50,
        borderWidth: 3,
        tension: 0.25,
        borderColor: "rgba(31,30,28,.85)"
      },
      {
        label: "P90",
        data: bands.p90,
        borderWidth: 2,
        tension: 0.25,
        borderColor: "rgba(43,76,126,.60)"
      }
    ]
  });
}
