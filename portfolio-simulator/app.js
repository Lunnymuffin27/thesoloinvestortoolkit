let chart;

const el = (id) => document.getElementById(id);

// ----------------------
// Compare mode state
// ----------------------
const runs = []; // up to 3 saved runs
const runColors = [
  "rgba(43,76,126,.85)",   // deep blue
  "rgba(107,79,42,.80)",   // brown
  "rgba(176,0,32,.70)"     // burgundy
];

let lastSimulation = null; // holds most recent run data

// ----------------------
// INIT UI
// ----------------------
wireRange("yearsRange", "yearsValue", (v) => {
  el("years").value = v; // hidden number input used by simulation
});

wireAllocation("stocksRange", "stocksVal", "stocks", "stocks");
wireAllocation("bondsRange", "bondsVal", "bonds", "bonds");
wireAllocation("cashRange", "cashVal", "cash", "cash");

updateAllocationUI();
updateStrategyAndRisk();

document.querySelectorAll(".chip[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
});

el("runSimulation").addEventListener("click", runSimulation);
el("saveRun")?.addEventListener("click", saveCurrentRun);
el("clearRuns")?.addEventListener("click", clearRuns);

renderCompareSummary();
// ----------------------
// UI HELPERS
// ----------------------
function wireRange(rangeId, outId, onChange) {
  const range = el(rangeId);
  const out = el(outId);

  range.addEventListener("input", () => {
    const v = parseInt(range.value, 10);
    out.textContent = v;
    onChange(v);
  });
}

function wireAllocation(rangeId, outId, hiddenId, key) {
  const range = el(rangeId);
  const out = el(outId);
  const hidden = el(hiddenId);

  range.addEventListener("input", () => {
    const v = clampInt(range.value, 0, 100);
    setAllocation(key, v);

    // sync UI for all 3 after auto-balance
    syncAllocationInputs();

    updateAllocationUI();
    updateStrategyAndRisk();

    // If you already have compare lines visible, keep them visible while tweaking UI
    // (The chart updates only after clicking Run Simulation)
  });

  // initialize output text
  out.textContent = hidden.value;
}

function setAllocation(changedKey, newValue) {
  // Auto-balance rule (simple + predictable):
  // - User changes one slider
  // - We keep the "second" asset as-is if possible
  // - We adjust the "third" asset to be the remainder
  // - If remainder < 0, we reduce the second asset until remainder is 0
  let s = getInt("stocks");
  let b = getInt("bonds");
  let c = getInt("cash");

  if (changedKey === "stocks") {
    s = newValue;
    c = 100 - s - b;
    if (c < 0) {
      c = 0;
      b = 100 - s;
    }
  }

  if (changedKey === "bonds") {
    b = newValue;
    c = 100 - s - b;
    if (c < 0) {
      c = 0;
      s = 100 - b;
    }
  }

  if (changedKey === "cash") {
    c = newValue;
    b = Math.min(b, 100 - c);
    s = 100 - b - c;
    if (s < 0) {
      s = 0;
      b = 100 - c;
    }
  }

  // clamp safety
  s = clampInt(s, 0, 100);
  b = clampInt(b, 0, 100);
  c = clampInt(100 - s - b, 0, 100);

  el("stocks").value = s;
  el("bonds").value = b;
  el("cash").value = c;
}

function syncAllocationInputs() {
  const s = getInt("stocks");
  const b = getInt("bonds");
  const c = getInt("cash");

  setRange("stocksRange", "stocksVal", "stocks", s);
  setRange("bondsRange", "bondsVal", "bonds", b);
  setRange("cashRange", "cashVal", "cash", c);
}

function updateAllocationUI() {
  const stocks = getInt("stocks");
  const bonds  = getInt("bonds");
  const cash   = getInt("cash");
  const total  = stocks + bonds + cash;

  el("allocTotal").textContent = total;

  el("barStocks").style.width = `${stocks}%`;
  el("barBonds").style.width  = `${bonds}%`;
  el("barCash").style.width   = `${cash}%`;

  // With auto-balance, total should always be 100
  el("allocationError").textContent = (total === 100) ? "" : "Allocation must equal 100%.";

  el("strategyBadge").textContent = generateStrategyLabel(stocks);
}

function updateStrategyAndRisk() {
  const stocks = getInt("stocks");

  const riskScore = clampInt(stocks, 0, 100);
  el("riskFill").style.width = `${riskScore}%`;

  let label = "Low";
  if (riskScore >= 70) label = "High";
  else if (riskScore >= 40) label = "Medium";

  el("riskLabel").textContent = label;
  el("strategyBadge").textContent = generateStrategyLabel(stocks);
}

function applyPreset(name) {
  let s=70,b=20,c=10;
  if (name === "aggressive") { s=90; b=10; c=0; }
  if (name === "balanced") { s=70; b=20; c=10; }
  if (name === "conservative") { s=40; b=40; c=20; }

  el("stocks").value = s;
  el("bonds").value = b;
  el("cash").value = c;

  syncAllocationInputs();
  updateAllocationUI();
  updateStrategyAndRisk();
}

function setRange(rangeId, outId, hiddenId, value) {
  el(rangeId).value = value;
  el(outId).textContent = value;
  el(hiddenId).value = value;
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getInt(id) {
  return clampInt(el(id).value, 0, 100);
}

// ----------------------
// SIMULATION (single run)
// ----------------------
function runSimulation() {
  const startingBalance = parseFloat(el("startingBalance").value);
  const monthlyContribution = parseFloat(el("monthlyContribution").value);
  const years = parseInt(el("years").value, 10);

  const stocks = getInt("stocks");
  const bonds  = getInt("bonds");
  const cash   = getInt("cash");

  // Auto-balance should keep this valid, but keep guard anyway.
  if (stocks + bonds + cash !== 100) {
    el("allocationError").textContent = "Allocation must equal 100%.";
    return;
  }
  el("allocationError").textContent = "";

  let portfolio = startingBalance;
  let history = [];
  let totalContributions = 0;

  let bestYear = -Infinity;
  let worstYear = Infinity;

  for (let year = 1; year <= years; year++) {
    totalContributions += monthlyContribution * 12;
    portfolio += monthlyContribution * 12;

    const stockReturn = 0.08 + (Math.random() - 0.5) * 0.15;
    const bondReturn  = 0.04 + (Math.random() - 0.5) * 0.06;
    const cashReturn  = 0.02 + (Math.random() - 0.5) * 0.01;

    const weightedReturn =
      (stocks / 100) * stockReturn +
      (bonds / 100) * bondReturn +
      (cash / 100) * cashReturn;

    portfolio *= (1 + weightedReturn);

    bestYear = Math.max(bestYear, weightedReturn);
    worstYear = Math.min(worstYear, weightedReturn);

    history.push(portfolio);
  }

  updateSummary(portfolio, totalContributions, bestYear, worstYear, stocks);

  // Store last run so "Save Run" works
  lastSimulation = {
    years,
    history,
    finalValue: portfolio,
    startingBalance,
    monthlyContribution,
    allocation: { stocks, bonds, cash },
    label: generateStrategyLabel(stocks),
    bestYear,
    worstYear
  };

  // Render chart with comparison overlays (if any)
  renderComparisonChart(history);
}

function updateSummary(finalValue, contributions, bestYear, worstYear, stocks) {
  el("finalValue").textContent = "$" + finalValue.toFixed(0);
  el("totalContributions").textContent = "$" + contributions.toFixed(0);
  el("totalGains").textContent = "$" + (finalValue - contributions).toFixed(0);
  el("bestYear").textContent = (bestYear * 100).toFixed(2) + "%";
  el("worstYear").textContent = (worstYear * 100).toFixed(2) + "%";
  el("strategyLabel").textContent = generateStrategyLabel(stocks);
}

function generateStrategyLabel(stocks) {
  if (stocks >= 80) return "Aggressive Growth";
  if (stocks >= 60) return "Growth Builder";
  if (stocks >= 40) return "Balanced Builder";
  if (stocks >= 20) return "Conservative";
  return "Capital Preservation";
}

// ----------------------
// COMPARE MODE
// ----------------------
function saveCurrentRun() {
  if (!lastSimulation) return;

  if (runs.length >= 3) runs.shift();

  const alloc = lastSimulation.allocation;
  const name = `${lastSimulation.label}`;
  const desc = `${alloc.stocks}/${alloc.bonds}/${alloc.cash} • ${lastSimulation.years}y • $${lastSimulation.monthlyContribution}/mo`;

  const contributions = lastSimulation.monthlyContribution * 12 * lastSimulation.years;
  const finalValue = lastSimulation.finalValue;
  const gains = finalValue - contributions;

  runs.push({
    id: cryptoId(),
    name,
    desc,
    years: lastSimulation.years,
    history: lastSimulation.history.slice(),
    allocation: { ...alloc },
    contributions,
    finalValue,
    gains,
    bestYear: lastSimulation.bestYear,
    worstYear: lastSimulation.worstYear,
    color: runColors[runs.length % runColors.length]
  });

  renderRunList();
  renderCompareSummary();
  renderComparisonChart(lastSimulation.history);
}

function clearRuns() {
  runs.length = 0;
  renderRunList();
  renderCompareSummary();
  if (lastSimulation) renderComparisonChart(lastSimulation.history);
}

function removeRun(id) {
  const idx = runs.findIndex(r => r.id === id);
  if (idx >= 0) runs.splice(idx, 1);
  renderRunList();
  renderCompareSummary();
  if (lastSimulation) renderComparisonChart(lastSimulation.history);
}

function renderRunList() {
  const list = el("runList");
  if (!list) return;

  if (runs.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = runs.map(r => `
    <div class="run-item">
      <div class="run-meta">
        <span class="dot" style="background:${r.color}"></span>
        <div>
          <div class="run-name">${escapeHtml(r.name)}</div>
          <div class="run-desc">${escapeHtml(r.desc)}</div>
        </div>
      </div>
      <button class="run-remove" data-id="${r.id}">Remove</button>
    </div>
  `).join("");

  list.querySelectorAll(".run-remove").forEach(btn => {
    btn.addEventListener("click", () => removeRun(btn.dataset.id));
  });
}

// Compare summary
function renderCompareSummary() {
  const wrap = el("compareSummaryWrap");
  const table = el("compareSummaryTable");
  if (!wrap || !table) return;

  if (runs.length === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";

  const tbody = table.querySelector("tbody");
  tbody.innerHTML = runs.map((r, i) => {
    const a = r.allocation;
    return `
      <tr>
        <td>
          <span class="run-badge">
            <span class="run-dot" style="background:${r.color}"></span>
            ${escapeHtml(r.name)} ${i + 1}
          </span>
        </td>
        <td class="mono">${a.stocks}/${a.bonds}/${a.cash}</td>
        <td>${r.years}</td>
        <td>$${Math.round(r.finalValue).toLocaleString()}</td>
        <td>$${Math.round(r.contributions).toLocaleString()}</td>
        <td>$${Math.round(r.gains).toLocaleString()}</td>
        <td>${formatPct(r.bestYear)}</td>
        <td>${formatPct(r.worstYear)}</td>
      </tr>
    `;
  }).join("");
}

// Chart that overlays saved runs + current run
function renderComparisonChart(currentHistory) {
  const ctx = el("portfolioChart").getContext("2d");
  if (chart) chart.destroy();

  const maxLen = Math.max(
    currentHistory.length,
    ...runs.map(r => r.history.length)
  );

  const labels = Array.from({ length: maxLen }, (_, i) => i + 1);

  const datasets = [];

  // Saved runs first
  runs.forEach((r, i) => {
    datasets.push({
      label: `Saved: ${r.name} (${i+1})`,
      data: r.history,
      borderWidth: 2,
      tension: 0.3,
      borderColor: r.color,
      pointRadius: 0
    });
  });

  // Current run on top
  datasets.push({
    label: "Current Run",
    data: currentHistory,
    borderWidth: 3,
    tension: 0.3,
    borderColor: "rgba(31,30,28,.85)",
    pointRadius: 0
  });

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Year" } },
        y: { ticks: { callback: (v) => "$" + v } }
      }
    }
  });
}
function formatPct(x) {
  if (typeof x !== "number" || !isFinite(x)) return "-";
  return (x * 100).toFixed(2) + "%";
}

// tiny helpers
function cryptoId() {
  // works in modern browsers
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(16).slice(2);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
