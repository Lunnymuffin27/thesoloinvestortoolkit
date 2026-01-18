
// =============================
// Detect if running inside an iframe (embed mode)
try {
  if (window.self !== window.top) {
    document.body.classList.add("is-embedded");
  }
} catch (e) {
  // If cross-origin blocks access, assume embedded
  document.body.classList.add("is-embedded");
}

// =============================
// Compound Interest Calculator
// (Table + Chart + Tooltip + CSV)
// =============================

// Globals
let CHART_STATE = null; // stored chart geometry + series data for hover
let LAST_ROWS = [];    // last computed year-by-year rows for CSV
let hoverInstalled = false;

const CHART_COLORS = {
  invested: "#6B7280",   // slate/gray
  balance: "#2563EB",    // blue
  begin: "#16A34A",      // green
  end: "#F59E0B",        // amber
  axis: "#111827",       // near-black
  grid: "#E5E7EB",       // light gray
  bg: "#FFFFFF"
};

const MILESTONES = [
  { value: 100_000, label: "$100k" },
  { value: 250_000, label: "$250k" },
  { value: 500_000, label: "$500k" },
  { value: 1_000_000, label: "$1M" },
];


let HOVER_INDEX = null; // which year index is hovered (for crosshair + dots)


// ---------- Formatting ----------
function formatMoney(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatCompactMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toFixed(0);
}

function formatSignedMoney(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function formatSignedPercent(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}


// ---------- UI Helpers ----------
function getTiming() {
  return document.querySelector('input[name="timing"]:checked')?.value || "begin";
}

function updateTimingNote() {
  const noteEl = document.getElementById("timingNote");
  if (!noteEl) return;

  const timing = getTiming();
  noteEl.textContent =
    timing === "begin"
      ? "Beginning of month usually ends slightly higher because contributions earn interest sooner."
      : "End of month is more conservative: contributions start earning interest after they’re added.";
}

function getInputs() {
  return {
    P: Number(document.getElementById("principal").value || 0),
    PMT: Number(document.getElementById("monthly").value || 0),
    rAnnual: Number(document.getElementById("rate").value || 0) / 100,
    years: Number(document.getElementById("years").value || 0),
  };
}

function setInputs({ P, PMT, rate, years }) {
  document.getElementById("principal").value = P;
  document.getElementById("monthly").value = PMT;
  document.getElementById("rate").value = rate;
  document.getElementById("years").value = years;
}

function bindPresets() {
  document.querySelectorAll(".presetBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const P = Number(btn.dataset.p);
      const PMT = Number(btn.dataset.pmt);
      const rate = Number(btn.dataset.rate);
      const years = Number(btn.dataset.years);

      setInputs({ P, PMT, rate, years });
      updateTimingNote();
      calculate();
    });
  });
}

//-------- Milestone Helper --------
function computeMilestones(rows) {
  const thresholds = [100000, 250000, 500000, 1000000];

  const hits = thresholds
    .map((t) => {
      const r = rows.find((x) => x.endBalance >= t);
      return r ? { label: `${formatMoney(t)} reached`, year: r.year } : null;
    })
    .filter(Boolean);

  const snowball = rows.find((r) => r.yearInterest >= r.yearContrib);
  const snowballHit = snowball
    ? { label: "Snowball moment (annual interest ≥ annual contributions)", year: snowball.year }
    : null;

  return { hits, snowballHit };
}

//-------- Milestone Detect on chart --------
function findChartMilestones(series) {
  // We label milestones based on the primary balance series (not invested)
  const balanceSeries = series.find(s => s.name.includes("Balance"));
  if (!balanceSeries) return [];

  return MILESTONES.map((m) => {
    const idx = balanceSeries.values.findIndex(v => v.value >= m.value);
    if (idx === -1) return null;

    return {
      index: idx,
      year: balanceSeries.values[idx].year,
      value: m.value,
      label: m.label,
    };
  }).filter(Boolean);
}


// ---------- Core Calculation (Simulation) ----------
function runScenario({ P, PMT, rAnnual, years, timing }) {
  const n = 12;
  const rMonthly = rAnnual / n;

  let balance = P;
  let invested = P;

  const rows = [];
  const chartPoints = []; // yearly: {year, balance, invested}

  for (let year = 1; year <= years; year++) {
    const startBalance = balance;
    let yearContrib = 0;

    for (let m = 0; m < 12; m++) {
      if (timing === "begin") {
        // Contribute, then interest
        balance += PMT;
        invested += PMT;
        yearContrib += PMT;

        balance *= (1 + rMonthly);
      } else {
        // Interest, then contribute
        balance *= (1 + rMonthly);

        balance += PMT;
        invested += PMT;
        yearContrib += PMT;
      }
    }

    const endBalance = balance;
    const yearInterest = endBalance - startBalance - yearContrib;

    rows.push({
      year,
      startBalance,
      yearContrib,
      yearInterest,
      endBalance,
    });

    chartPoints.push({
      year,
      balance: endBalance,
      invested,
    });
  }

  return {
    total: balance,
    invested,
    interest: balance - invested,
    rows,
    chartPoints,
  };
}

// ---------- Rendering: Results + Table ----------
function renderResults({ total, invested, interest, rows }) {
  const resultEl = document.getElementById("result");
  if (!resultEl) return;

  const { hits, snowballHit } = computeMilestones(rows);

  const milestoneItems = [
    ...hits.map((m) => `<li><strong>${m.label}</strong>: Year ${m.year}</li>`),
    snowballHit ? `<li><strong>${snowballHit.label}</strong>: Year ${snowballHit.year}</li>` : "",
  ].filter(Boolean).join("");

  resultEl.innerHTML = `
    <div style="display:grid;gap:10px;">
      <div>
        <strong>Final Balance:</strong> ${formatMoney(total)}<br>
        <strong>Total Invested:</strong> ${formatMoney(invested)}<br>
        <strong>Total Interest:</strong> ${formatMoney(interest)}
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.12); padding-top:10px;">
        <strong>Milestones</strong>
        ${
          milestoneItems
            ? `<ul style="margin:8px 0 0; padding-left:18px; color: rgba(255,255,255,0.86);">
                 ${milestoneItems}
               </ul>`
            : `<div style="margin-top:8px; color: rgba(255,255,255,0.68);">
                 Increase years/rate/contributions to reach milestones.
               </div>`
        }
      </div>
    </div>
  `;
}


function renderTable(rows) {
  const tableEl = document.getElementById("table");
  if (!tableEl) return;

  const tableHtml = `
    <h2>Year-by-Year Breakdown</h2>
    <table border="1" cellpadding="8" cellspacing="0">
      <thead>
        <tr>
          <th>Year</th>
          <th>Starting Balance</th>
          <th>Contributions</th>
          <th>Interest Earned</th>
          <th>Ending Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${r.year}</td>
            <td>${formatMoney(r.startBalance)}</td>
            <td>${formatMoney(r.yearContrib)}</td>
            <td>${formatMoney(r.yearInterest)}</td>
            <td>${formatMoney(r.endBalance)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
  tableEl.innerHTML = tableHtml;
}

// ---------- Chart Wrapper Functions ----------
function renderChartSingle(points) {
  renderMultiLineChart({
    titleLeft: "Invested vs Balance",
    series: [
      {
        name: "Invested",
        color: CHART_COLORS.invested,
        values: points.map((p) => ({ year: p.year, value: p.invested })),
      },
      {
        name: "Balance",
        color: CHART_COLORS.balance,
        values: points.map((p) => ({ year: p.year, value: p.balance })),
      },
    ],
  });
}

function renderChartCompare({ investedPoints, beginBalancePoints, endBalancePoints }) {
  renderMultiLineChart({
    titleLeft: "Compare Contribution Timing",
    series: [
      { name: "Invested", color: CHART_COLORS.invested, values: investedPoints },
      { name: "Balance (Begin)", color: CHART_COLORS.begin, values: beginBalancePoints },
      { name: "Balance (End)", color: CHART_COLORS.end, values: endBalancePoints },
    ],
  });
}


// ---------- Chart Renderer (Canvas, Multi-Line) ----------
function renderMultiLineChart({ titleLeft, series }) {
  const canvas = document.getElementById("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!series || series.length === 0) return;

  const pad = { left: 62, right: 20, top: 34, bottom: 52 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;

  const pointsCount = series[0].values.length;
  if (pointsCount < 2) return;

  // Background fill
  ctx.fillStyle = CHART_COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Max among all series
  let maxVal = 0;
  for (const s of series) for (const p of s.values) maxVal = Math.max(maxVal, p.value);
  if (maxVal <= 0) maxVal = 1;

  const xForIndex = (i) => pad.left + (i / (pointsCount - 1)) * w;
  const yForValue = (v) => pad.top + (1 - v / maxVal) * h;

  // Title
  ctx.fillStyle = CHART_COLORS.axis;
  ctx.font = "13px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(titleLeft || "", pad.left, 20);

  // Gridlines + Y labels
  const yTicks = 5;
  ctx.font = "12px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let t = 0; t <= yTicks; t++) {
    const value = (maxVal * t) / yTicks;
    const y = yForValue(value);

    // gridline
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();

    // label
    ctx.fillStyle = CHART_COLORS.axis;
    ctx.fillText(formatCompactMoney(value), pad.left - 10, y);
  }

  // X grid ticks + labels
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const step = Math.max(1, Math.floor(pointsCount / 6));
  for (let i = 0; i < pointsCount; i += step) {
    const x = xForIndex(i);

    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + h);
    ctx.stroke();

    ctx.fillStyle = CHART_COLORS.axis;
    ctx.fillText(String(series[0].values[i].year), x, pad.top + h + 10);
  }
  // last label
  {
    const i = pointsCount - 1;
    ctx.fillStyle = CHART_COLORS.axis;
    ctx.fillText(String(series[0].values[i].year), xForIndex(i), pad.top + h + 10);
  }

  // Axes (stronger)
  ctx.strokeStyle = CHART_COLORS.axis;
  ctx.lineWidth = 1.5;

  // Y axis
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.stroke();

  // X axis
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + h);
  ctx.lineTo(pad.left + w, pad.top + h);
  ctx.stroke();

  // Lines
  ctx.lineWidth = 2.5;
  series.forEach((s) => {
    ctx.strokeStyle = s.color || CHART_COLORS.balance;
    ctx.beginPath();
    s.values.forEach((p, i) => {
      const x = xForIndex(i);
      const y = yForValue(p.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Hover crosshair + dots
  if (HOVER_INDEX !== null) {
    const i = HOVER_INDEX;

    // Crosshair line
    const x = pad.left + (i / (pointsCount - 1)) * w;

    ctx.strokeStyle = "rgba(17, 24, 39, 0.35)"; // subtle dark line
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + h);
    ctx.stroke();

    // Dots at each series value
    series.forEach((s) => {
      const p = s.values[i];
      const y = pad.top + (1 - p.value / maxVal) * h;

      // Outer ring
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.fillStyle = s.color || "#2563EB";
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }  

  // Legend with swatches
  let lx = pad.left;
  const ly = canvas.height - 14;

  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  series.forEach((s) => {
    const color = s.color || CHART_COLORS.balance;

    // swatch
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 10, 10, 10);

    // label
    ctx.fillStyle = CHART_COLORS.axis;
    ctx.fillText(s.name, lx + 14, ly);

    lx += 14 + ctx.measureText(s.name).width + 18;
  });

    // ---- Milestone markers ----
    const milestones = findChartMilestones(series);

    milestones.forEach((m) => {
      const x = pad.left + (m.index / (pointsCount - 1)) * w;
      const y = pad.top + (1 - m.value / maxVal) * h;
  
      // Vertical dashed line
      ctx.strokeStyle = "rgba(37, 99, 235, 0.35)"; // blue, subtle
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + h);
      ctx.stroke();
      ctx.setLineDash([]);
  
      // Marker dot
      ctx.beginPath();
      ctx.fillStyle = "#2563EB";
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
  
      // Label background
      const labelText = `${m.label} • Yr ${m.year}`;
      ctx.font = "11px Arial";
      const textWidth = ctx.measureText(labelText).width;
  
      const labelX = Math.min(x + 6, pad.left + w - textWidth - 6);
      const labelY = Math.max(y - 14, pad.top + 12);
  
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(labelX - 4, labelY - 12, textWidth + 8, 16);
  
      // Label text
      ctx.fillStyle = "#111827";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, labelX, labelY - 4);
    });
  

  // Save for hover
  CHART_STATE = { titleLeft, pad, w, h, pointsCount, series, maxVal };
  installChartHover();
}


// ---------- Hover Tooltip ----------
function installChartHover() {
  if (hoverInstalled) return;
  hoverInstalled = true;

  const canvas = document.getElementById("chart");
  const tooltip = document.getElementById("chartTooltip");
  if (!canvas || !tooltip) return;

  function hideTip() {
    tooltip.style.display = "none";
    HOVER_INDEX = null;
    // re-draw without hover markers
    if (CHART_STATE?.series) {
      renderMultiLineChart({ titleLeft: CHART_STATE.titleLeft, series: CHART_STATE.series });
    }
  }

  canvas.addEventListener("mouseleave", hideTip);

  canvas.addEventListener("mousemove", (e) => {
    if (!CHART_STATE) return;

    const rect = canvas.getBoundingClientRect();

    // Mouse coords in canvas space
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const { pad, w, h, pointsCount, series } = CHART_STATE;

    const inside =
      x >= pad.left && x <= pad.left + w &&
      y >= pad.top && y <= pad.top + h;

    if (!inside) return hideTip();

    // Nearest index based on x
    const t = (x - pad.left) / w;
    const i = Math.max(0, Math.min(pointsCount - 1, Math.round(t * (pointsCount - 1))));

    HOVER_INDEX = i;

    const year = series[0].values[i].year;

const lines = series.map((s) => {
  const current = s.values[i].value;

  if (i === 0) {
    return `
      <div style="margin-bottom:6px;">
        <strong>${s.name}:</strong> ${formatMoney(current)}
        <div style="opacity:0.85;">Δ: —</div>
      </div>
    `;
  }

  const prev = s.values[i - 1].value;
  const delta = current - prev;

  // Percent change (only when prev is meaningful)
  let pctHtml = "";
  if (prev > 0) {
    const pct = (delta / prev) * 100;
    pctHtml = `<span style="opacity:0.85;"> (${formatSignedPercent(pct)})</span>`;
  }

  return `
    <div style="margin-bottom:6px;">
      <strong>${s.name}:</strong> ${formatMoney(current)}
      <div style="opacity:0.85;">Δ: ${formatSignedMoney(delta)}${pctHtml}</div>
    </div>
  `;
}).join("");

tooltip.innerHTML = `
  <div style="margin-bottom:8px;">
    <strong>Year ${year}</strong>
    ${i > 0 ? `<div style="opacity:0.85;">vs Year ${series[0].values[i - 1].year}</div>` : ""}
  </div>
  ${lines}
`;


    tooltip.innerHTML = `<div style="margin-bottom:6px;"><strong>Year ${year}</strong></div>${lines}`;
    tooltip.style.display = "block";

    // Position tooltip in CSS pixels
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    tooltip.style.left = `${cssX}px`;
    tooltip.style.top = `${cssY}px`;

    // Re-render chart to draw crosshair + dots
    renderMultiLineChart({ titleLeft: CHART_STATE.titleLeft, series: CHART_STATE.series });
  });
}


// ---------- CSV Download ----------
function rowsToCSV(rows) {
  const headers = ["Year", "Starting Balance", "Contributions", "Interest Earned", "Ending Balance"];
  const lines = [headers.join(",")];

  for (const r of rows) {
    lines.push(
      [
        r.year,
        r.startBalance.toFixed(2),
        r.yearContrib.toFixed(2),
        r.yearInterest.toFixed(2),
        r.endBalance.toFixed(2),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function downloadCSV() {
  if (!LAST_ROWS || LAST_ROWS.length === 0) return;

  const csv = rowsToCSV(LAST_ROWS);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "compound-interest-breakdown.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// ---------- Main ----------
function calculate() {
  const { P, PMT, rAnnual, years } = getInputs();
  const timing = getTiming();
  const compareMode = document.getElementById("compareMode")?.checked || false;

  // Primary scenario (based on selected timing)
  const primary = runScenario({ P, PMT, rAnnual, years, timing });

  // Save for CSV
  LAST_ROWS = primary.rows;

  // Render
  renderResults({ ...primary, rows: primary.rows });
  renderTable(primary.rows);

  if (!compareMode) {
    renderChartSingle(primary.chartPoints);
  } else {
    const begin = runScenario({ P, PMT, rAnnual, years, timing: "begin" });
    const end = runScenario({ P, PMT, rAnnual, years, timing: "end" });

    renderChartCompare({
      investedPoints: primary.chartPoints.map((p) => ({ year: p.year, value: p.invested })),
      beginBalancePoints: begin.chartPoints.map((p) => ({ year: p.year, value: p.balance })),
      endBalancePoints: end.chartPoints.map((p) => ({ year: p.year, value: p.balance })),
    });
  }
}

// ---------- Event Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // Note + initial calc
  updateTimingNote();
  calculate();
  bindPresets();

  // Inputs auto recalc
  ["principal", "monthly", "rate", "years"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", calculate);
  });

  // Timing + compare
  document.addEventListener("change", (e) => {
    if (e.target.name === "timing") {
      updateTimingNote();
      calculate();
    }
    if (e.target.id === "compareMode") {
      calculate();
    }
  });

  // CSV button
  const csvBtn = document.getElementById("csvBtn");
  if (csvBtn) csvBtn.addEventListener("click", downloadCSV);
});

//-------- Milestone Helper --------
function computeMilestones(rows) {
  const thresholds = [100000, 250000, 500000, 1000000];

  const hits = thresholds
    .map((t) => {
      const r = rows.find((x) => x.endBalance >= t);
      return r ? { label: `${formatMoney(t)} reached`, year: r.year } : null;
    })
    .filter(Boolean);

  const snowball = rows.find((r) => r.yearInterest >= r.yearContrib);
  const snowballHit = snowball
    ? { label: "Snowball moment (annual interest ≥ annual contributions)", year: snowball.year }
    : null;

  return { hits, snowballHit };
}

//-------- Milestone Detect on chart --------
function findChartMilestones(series) {
  // We label milestones based on the primary balance series (not invested)
  const balanceSeries = series.find(s => s.name.includes("Balance"));
  if (!balanceSeries) return [];

  return MILESTONES.map((m) => {
    const idx = balanceSeries.values.findIndex(v => v.value >= m.value);
    if (idx === -1) return null;

    return {
      index: idx,
      year: balanceSeries.values[idx].year,
      value: m.value,
      label: m.label,
    };
  }).filter(Boolean);
}
