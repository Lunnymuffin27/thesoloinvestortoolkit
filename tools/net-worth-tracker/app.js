/* ============================================================
   Solo Investor — Net Worth Tracker (Clean v2)
   - Assets + Liabilities line items (+ Categories)
   - Totals + Category breakdown
   - LocalStorage persistence
   - Snapshots + Chart.js (updates only on snapshot changes)
   ============================================================ */

   const STORAGE_KEY = "solo_investor_networth_v2";

   const ASSET_CATEGORIES = ["Cash", "Investments", "Retirement", "Real Estate", "Business", "Other"];
   const LIABILITY_CATEGORIES = ["Credit Card", "Student Loan", "Auto Loan", "Mortgage", "Personal Loan", "Other Debt"];
   
   /* -------------------- DOM -------------------- */
   const $ = (id) => document.getElementById(id);
   
   const els = {
     assetsList: $("assetsList"),
     liabilitiesList: $("liabilitiesList"),
     addAssetBtn: $("addAssetBtn"),
     addLiabilityBtn: $("addLiabilityBtn"),
   
     totalAssets: $("totalAssets"),
     totalLiabilities: $("totalLiabilities"),
     sumAssets: $("sumAssets"),
     sumLiabilities: $("sumLiabilities"),
     netWorth: $("netWorth"),
   
     assetBreakdown: $("assetBreakdown"),
     liabilityBreakdown: $("liabilityBreakdown"),

     snapshotDate: $("snapshotDate"),
     useTodayBtn: $("useTodayBtn"),
   
     saveSnapshotBtn: $("saveSnapshotBtn"),
     exportCsvBtn: $("exportCsvBtn"),
     resetBtn: $("resetBtn"),
     clearSnapshotsBtn: $("clearSnapshotsBtn"),
     snapshotsList: $("snapshotsList"),
   
     chartCanvas: $("netWorthChart"),
   };
   
   /* -------------------- Utils -------------------- */
   const uid = () => `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
   
   const toNumber = (v) => {
     const n = Number(v);
     return Number.isFinite(n) ? n : 0;
   };
   
   const formatCurrency = (v) =>
     new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
       toNumber(v)
     );
   
     
   const todayISO = () => {
     const d = new Date();
     const yyyy = d.getFullYear();
     const mm = String(d.getMonth() + 1).padStart(2, "0");
     const dd = String(d.getDate()).padStart(2, "0");
     return `${yyyy}-${mm}-${dd}`;
   };
   
   function setSnapshotDate(dateStr) {
     if (els.snapshotDate) els.snapshotDate.value = dateStr;
    }
    
   function getSnapshotDate() {
    const v = els.snapshotDate?.value;
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayISO();
   }
  

   const debounce = (fn, delay = 250) => {
     let t;
     return (...args) => {
       clearTimeout(t);
       t = setTimeout(() => fn(...args), delay);
     };
   };
   
   /* -------------------- State -------------------- */
   const defaultState = () => ({
     assets: [
       { id: uid(), name: "Checking", category: "Cash", amount: 0 },
       { id: uid(), name: "Brokerage", category: "Investments", amount: 0 },
     ],
     liabilities: [{ id: uid(), name: "Credit Card", category: "Credit Card", amount: 0 }],
     snapshots: [], // {id,date,assetsTotal,liabilitiesTotal,netWorth}
   });
   
   function normalizeLoadedState(parsed) {
     // Ensure arrays exist
     const safe = {
       assets: Array.isArray(parsed?.assets) ? parsed.assets : [],
       liabilities: Array.isArray(parsed?.liabilities) ? parsed.liabilities : [],
       snapshots: Array.isArray(parsed?.snapshots) ? parsed.snapshots : [],
     };
   
     // Backward compatible defaults
     safe.assets = safe.assets.map((a) => ({
       id: a.id || uid(),
       name: a.name ?? "",
       amount: toNumber(a.amount),
       category: a.category || "Other",
     }));
   
     safe.liabilities = safe.liabilities.map((l) => ({
       id: l.id || uid(),
       name: l.name ?? "",
       amount: toNumber(l.amount),
       category: l.category || "Other Debt",
     }));
   
     // Sort snapshots and coerce numbers
     safe.snapshots = safe.snapshots
       .map((s) => ({
         id: s.id || uid(),
         date: s.date || todayISO(),
         assetsTotal: toNumber(s.assetsTotal),
         liabilitiesTotal: toNumber(s.liabilitiesTotal),
         netWorth: toNumber(s.netWorth),
       }))
       .sort((a, b) => String(a.date).localeCompare(String(b.date)));
   
     return safe;
   }
   
   function loadState() {
     try {
       const raw = localStorage.getItem(STORAGE_KEY);
       if (!raw) return null;
       return normalizeLoadedState(JSON.parse(raw));
     } catch {
       return null;
     }
   }
   
   let state = loadState() || defaultState();
   
   function saveState() {
     localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
   }
   
   const saveStateDebounced = debounce(saveState, 250);
   
   /* -------------------- Calculations -------------------- */
   const sumAmounts = (items) => items.reduce((acc, item) => acc + toNumber(item.amount), 0);
   
   function totals() {
     const assetsTotal = sumAmounts(state.assets);
     const liabilitiesTotal = sumAmounts(state.liabilities);
     return { assetsTotal, liabilitiesTotal, netWorth: assetsTotal - liabilitiesTotal };
   }
   
   function groupTotals(items) {
     const map = new Map();
     items.forEach((item) => {
       const cat = item.category || "Other";
       map.set(cat, (map.get(cat) || 0) + toNumber(item.amount));
     });
     return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
   }
   
   /* -------------------- Render: Line Items -------------------- */
   function styledSelect() {
     const s = document.createElement("select");
     s.style.width = "100%";
     s.style.padding = "10px 11px";
     s.style.borderRadius = "12px";
     s.style.border = "1px solid rgba(42,34,48,1)";
     s.style.background = "rgba(12,11,18,.85)";
     s.style.color = "var(--text)";
     return s;
   }
   
   function makeRow(item, type) {
     const row = document.createElement("div");
     row.className = "row";
   
     const name = document.createElement("input");
     name.type = "text";
     name.value = item.name ?? "";
     name.placeholder = type === "asset" ? "Asset name" : "Liability name";
     name.addEventListener("input", (e) => {
       item.name = e.target.value;
       saveStateDebounced();
     });
   
     const categories = type === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
     const category = styledSelect();
     categories.forEach((c) => {
       const opt = document.createElement("option");
       opt.value = c;
       opt.textContent = c;
       category.appendChild(opt);
     });
     category.value = item.category || categories[categories.length - 1];
     category.addEventListener("change", (e) => {
       item.category = e.target.value;
       saveState();
       renderBreakdowns();
     });
   
     const amount = document.createElement("input");
     amount.type = "number";
     amount.step = "1";
     amount.inputMode = "numeric";
     amount.value = toNumber(item.amount);
     amount.placeholder = "0";
     amount.addEventListener("input", (e) => {
       item.amount = toNumber(e.target.value);
       renderTotals();
       renderBreakdowns();
       saveStateDebounced();
     });
   
     const del = document.createElement("button");
     del.className = "iconBtn";
     del.textContent = "✕";
     del.title = "Remove";
     del.addEventListener("click", () => {
       if (type === "asset") state.assets = state.assets.filter((x) => x.id !== item.id);
       else state.liabilities = state.liabilities.filter((x) => x.id !== item.id);
       saveState();
       renderAll();
     });
   
     row.append(name, category, amount, del);
     return row;
   }
   
   function renderLists() {
     els.assetsList.innerHTML = "";
     els.liabilitiesList.innerHTML = "";
   
     state.assets.forEach((a) => els.assetsList.appendChild(makeRow(a, "asset")));
     state.liabilities.forEach((l) => els.liabilitiesList.appendChild(makeRow(l, "liability")));
   }
   
   /* -------------------- Render: Totals + Breakdown -------------------- */
   function renderTotals() {
     const { assetsTotal, liabilitiesTotal, netWorth } = totals();
   
     els.totalAssets.textContent = formatCurrency(assetsTotal);
     els.totalLiabilities.textContent = formatCurrency(liabilitiesTotal);
   
     els.sumAssets.textContent = formatCurrency(assetsTotal);
     els.sumLiabilities.textContent = formatCurrency(liabilitiesTotal);
     els.netWorth.textContent = formatCurrency(netWorth);
   
     els.netWorth.style.color = netWorth >= 0 ? "var(--good)" : "var(--bad)";
   }
   
   function renderBreakdowns() {
     if (els.assetBreakdown) {
       els.assetBreakdown.innerHTML = "";
       groupTotals(state.assets).forEach(([cat, total]) => {
         const r = document.createElement("div");
         r.className = "breakdownRow";
         r.innerHTML = `<span>${cat}</span><strong>${formatCurrency(total)}</strong>`;
         els.assetBreakdown.appendChild(r);
       });
     }
   
     if (els.liabilityBreakdown) {
       els.liabilityBreakdown.innerHTML = "";
       groupTotals(state.liabilities).forEach(([cat, total]) => {
         const r = document.createElement("div");
         r.className = "breakdownRow";
         r.innerHTML = `<span>${cat}</span><strong>${formatCurrency(total)}</strong>`;
         els.liabilityBreakdown.appendChild(r);
       });
     }
   }
   
   /* -------------------- Snapshots -------------------- */
   function upsertSnapshotForSelectedDate() {
      const date = getSnapshotDate();
      const { assetsTotal, liabilitiesTotal, netWorth } = totals();
    
      const existing = state.snapshots.find((s) => s.date === date);
      if (existing) {
        existing.assetsTotal = assetsTotal;
        existing.liabilitiesTotal = liabilitiesTotal;
        existing.netWorth = netWorth;
      } else {
        state.snapshots.push({ id: uid(), date, assetsTotal, liabilitiesTotal, netWorth });
      }
    
      state.snapshots.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      saveState();
      renderSnapshots();
      renderChart(); // chart updates only on snapshot changes
   }
  
   
   function deleteSnapshot(id) {
     state.snapshots = state.snapshots.filter((s) => s.id !== id);
     saveState();
     renderSnapshots();
     renderChart();
   }
   
   function clearSnapshots() {
     state.snapshots = [];
     saveState();
     renderSnapshots();
     renderChart();
   }
   
   function renderSnapshots() {
     els.snapshotsList.innerHTML = "";
   
     if (!state.snapshots.length) {
       const empty = document.createElement("div");
       empty.className = "snapshotItem";
       empty.textContent = "No snapshots yet. Click “Save Snapshot”.";
       els.snapshotsList.appendChild(empty);
       return;
     }
   
     [...state.snapshots].reverse().forEach((s) => {
       const item = document.createElement("div");
       item.className = "snapshotItem";
       item.title = "Click to delete this snapshot";
       item.style.cursor = "pointer";
       item.innerHTML = `<span>${s.date}</span><strong>${formatCurrency(s.netWorth)}</strong>`;
       item.addEventListener("click", () => deleteSnapshot(s.id));
       els.snapshotsList.appendChild(item);
     });
   }
   
   /* -------------------- Chart.js -------------------- */
   let chart = null;
   
   function applyChartDefaults() {
     if (!window.Chart) return;
     Chart.defaults.color = "#c7bda8";
     Chart.defaults.borderColor = "rgba(42,34,48,1)";
     Chart.defaults.font.family =
       "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
   }
   
   function renderChart() {
     if (!els.chartCanvas || !window.Chart) return;
   
     // No snapshots: destroy to avoid idle work
     if (!state.snapshots.length) {
       if (chart) {
         chart.destroy();
         chart = null;
       }
       return;
     }
   
     const labels = state.snapshots.map((s) => s.date);
     const data = state.snapshots.map((s) => s.netWorth);
   
     if (!chart) {
       applyChartDefaults();
       chart = new Chart(els.chartCanvas, {
         type: "line",
         data: {
           labels,
           datasets: [
             {
               label: "Net Worth",
               data,
               tension: 0.25,
               borderWidth: 2,
               borderColor: "#c7a25a",
               pointRadius: 3,
               pointBackgroundColor: "#c7a25a",
               fill: false,
             },
           ],
         },
         options: {
           responsive: true,
           maintainAspectRatio: false,
           plugins: {
             legend: { labels: { color: "#c7bda8", font: { size: 12 } } },
             tooltip: {
               backgroundColor: "rgba(12,11,18,.95)",
               borderColor: "rgba(199,162,90,.85)",
               borderWidth: 1,
               titleColor: "#efe7d8",
               bodyColor: "#efe7d8",
               callbacks: {
                 label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
               },
             },
           },
           scales: {
             x: { grid: { color: "rgba(42,34,48,.45)" }, ticks: { color: "#a99f8d" } },
             y: {
               grid: { color: "rgba(42,34,48,.45)" },
               ticks: { color: "#a99f8d", callback: (v) => formatCurrency(v) },
             },
           },
         },
       });
       return;
     }
   
     // Update existing chart
     chart.data.labels = labels;
     chart.data.datasets[0].data = data;
     chart.update("none"); // less animation / lower CPU
   }
   
   function csvEscape(value) {
    const s = String(value ?? "");
    // Escape quotes by doubling them. Wrap in quotes if needed.
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
    }
    
    function toCsvLine(arr) {
      return arr.map(csvEscape).join(",");
    }
    
    function buildNetWorthCsv() {
      const lines = [];
      const now = new Date();
    
      // Header / metadata
      lines.push(toCsvLine(["Solo Investor Net Worth Tracker Export"]));
      lines.push(toCsvLine(["Exported At", now.toISOString()]));
      lines.push(""); // blank line

      const { assetsTotal, liabilitiesTotal, netWorth } = totals();
      lines.push(toCsvLine(["CURRENT TOTALS"]));
      lines.push(toCsvLine(["Assets Total", assetsTotal]));
      lines.push(toCsvLine(["Liabilities Total", liabilitiesTotal]));
      lines.push(toCsvLine(["Net Worth", netWorth]));
      lines.push("");

    
      // Assets section
      lines.push(toCsvLine(["ASSETS"]));
      lines.push(toCsvLine(["Name", "Category", "Amount"]));
      state.assets.forEach((a) => {
        lines.push(toCsvLine([a.name, a.category, toNumber(a.amount)]));
      });
      lines.push("");
    
      // Liabilities section
      lines.push(toCsvLine(["LIABILITIES"]));
      lines.push(toCsvLine(["Name", "Category", "Amount"]));
      state.liabilities.forEach((l) => {
        lines.push(toCsvLine([l.name, l.category, toNumber(l.amount)]));
      });
      lines.push("");
    
      // Snapshots section
      lines.push(toCsvLine(["SNAPSHOTS"]));
      lines.push(toCsvLine(["Date", "Assets Total", "Liabilities Total", "Net Worth"]));
      state.snapshots.forEach((s) => {
        lines.push(toCsvLine([s.date, toNumber(s.assetsTotal), toNumber(s.liabilitiesTotal), toNumber(s.netWorth)]));
      });
    
      return lines.join("\n");
    }
    
    function downloadCsv(filename, content) {
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
    
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    
      URL.revokeObjectURL(url);
    }
    
    function exportCsv() {
      const csv = buildNetWorthCsv();
      const filename = `solo-investor-net-worth-${todayISO()}.csv`;
      downloadCsv(filename, csv);
    }  

   /* -------------------- Events -------------------- */
   function wireEvents() {
     els.addAssetBtn.addEventListener("click", () => {
       state.assets.push({ id: uid(), name: "", category: "Other", amount: 0 });
       saveState();
       renderAll();
     });
   
     els.addLiabilityBtn.addEventListener("click", () => {
       state.liabilities.push({ id: uid(), name: "", category: "Other Debt", amount: 0 });
       saveState();
       renderAll();
     });
   
     els.saveSnapshotBtn.addEventListener("click", upsertSnapshotForSelectedDate);
     els.useTodayBtn.addEventListener("click", () => setSnapshotDate(todayISO()));
     els.clearSnapshotsBtn.addEventListener("click", clearSnapshots);

     els.exportCsvBtn.addEventListener("click", exportCsv);
   
     els.resetBtn.addEventListener("click", () => {
       localStorage.removeItem(STORAGE_KEY);
       state = defaultState();
       saveState();
   
       if (chart) {
         chart.destroy();
         chart = null;
       }
       renderAll();
     });
   }
   
   /* -------------------- Boot -------------------- */
   function renderAll() {
     renderLists();
     renderTotals();
     renderBreakdowns();
     renderSnapshots();
     renderChart();
   }
   
   wireEvents();
   renderAll();
   saveState();

   setSnapshotDate(todayISO());

   
