import { createGame, netWorth } from "./sim.js";

const $ = (id) => document.getElementById(id);

const ui = {
  modeSelect: $("modeSelect"),

  runTitle: $("runTitle"),
  yearBadge: $("yearBadge"),

  nw: $("nw"),
  cash: $("cash"),
  inv: $("inv"),
  debt: $("debt"),
  income: $("income"),
  expenses: $("expenses"),

  stressVal: $("stressVal"),
  burnVal: $("burnVal"),
  stressBar: $("stressBar"),
  burnBar: $("burnBar"),

  hand: $("hand"),
  selectedCount: $("selectedCount"),
  btnEndYear: $("btnEndYear"),
  btnSkip: $("btnSkip"),
  btnNewRun: $("btnNewRun"),
  btnReset: $("btnReset"),

  resultsTitle: $("resultsTitle"),
  eventText: $("eventText"),
  logList: $("logList"),

  chart: $("nwChart"),

  btnRules: $("btnRules"),
  rulesBody: $("rulesBody"),
  btnRulesDismiss: $("btnRulesDismiss"),
};

let game;
let currentHand = [];
let selected = new Set();

const RULES_SEEN_KEY = "fds_rules_seen_v1";

function openRules(open) {
  const isOpen = !!open;
  ui.btnRules.setAttribute("aria-expanded", String(isOpen));
  ui.rulesBody.hidden = !isOpen;
}

function markRulesSeen() {
  localStorage.setItem(RULES_SEEN_KEY, "1");
}


function money(n){
  const s = Math.round(n).toLocaleString();
  return `$${s}`;
}

const MODE_KEY = "fds_mode_v1";

function initialStateForMode(mode){
  if (mode === "starter_10k")  return { cash: 10000, invested: 0, debt: 0, income: 0, expenses: 0, stress: 15, burnout: 0 };
  if (mode === "starter_100k") return { cash: 100000, invested: 0, debt: 0, income: 0, expenses: 0, stress: 15, burnout: 0 };
  if (mode === "starter_1m")   return { cash: 1000000, invested: 0, debt: 0, income: 0, expenses: 0, stress: 15, burnout: 0 };

  // life mode default
  return { cash: 9000, debt: 15000, income: 54000, expenses: 38000, stress: 25, burnout: 0 };
}

function getRecommendations(state, hand){
  const ids = new Set(hand.map(c => c.id));
  const rec = [];

  // 1) Safety first
  if (state.cash < 3000 && ids.has("build_emergency_fund")) rec.push("build_emergency_fund");
  if (state.stress > 70 && ids.has("do_nothing")) rec.push("do_nothing");

  // 2) Debt pressure
  if (state.debt > 20000 && ids.has("pay_down_debt")) rec.push("pay_down_debt");
  if (state.debt > 12000 && state.discipline >= 0.55 && ids.has("debt_refi")) rec.push("debt_refi");

  // 3) Growth (only if not dying)
  if (rec.length < 2 && state.stress < 70 && ids.has("automate_savings")) rec.push("automate_savings");
  if (rec.length < 2 && state.cash > 7000 && ids.has("index_investing")) rec.push("index_investing");

  // ensure unique + max 2
  return Array.from(new Set(rec)).slice(0, 2);
}

function seedFromPrompt(){
  const seed = prompt("Enter a seed (any text). Same seed = repeatable run:", "RUN-001");
  return seed && seed.trim() ? seed.trim() : `RUN-${Math.floor(Math.random()*9999)}`;
}

function startNewRun(seed){
  const mode = ui.modeSelect.value || "life";
  localStorage.setItem(MODE_KEY, mode);

  game = createGame({
    seed,
    years: 15,
    initialState: initialStateForMode(mode)
  });

  selected.clear();
  ui.eventText.textContent = "—";
  ui.resultsTitle.textContent = "No year played yet";
  ui.logList.innerHTML = "";

  currentHand = game.getHand();
  render();

  const hasSeen = localStorage.getItem("fds_rules_seen_v1") === "1";
  openRules(!hasSeen);
}


function render(){
  const s = game.state;
  ui.runTitle.textContent = `Seed: ${game.seed}`;
  ui.yearBadge.textContent = `Year ${s.year}`;

  ui.nw.textContent = money(netWorth(s));
  ui.cash.textContent = money(s.cash);
  ui.inv.textContent = money(s.invested);
  ui.debt.textContent = money(s.debt);
  ui.income.textContent = money(s.income);
  ui.expenses.textContent = money(s.expenses);

  ui.stressVal.textContent = `${Math.round(s.stress)}`;
  ui.burnVal.textContent = `${Math.round(s.burnout)}`;

  ui.stressBar.style.width = `${Math.round(s.stress)}%`;
  ui.burnBar.style.width = `${Math.round(s.burnout)}%`;

  ui.selectedCount.textContent = `${selected.size}`;
  ui.btnEndYear.disabled = selected.size !== 2;

  renderHand();
  renderChart();
}

function renderHand(){
  ui.hand.innerHTML = "";

  const s = game.state;
  const recommended = new Set(getRecommendations(s, currentHand));

  currentHand.forEach(card => {
    const div = document.createElement("div");

    const color = card.ui?.color || "";
    div.className = `card ${color}` + (selected.has(card.id) ? " selected" : "");
    div.dataset.id = card.id;

    // Recommended ribbon
    if (recommended.has(card.id)) {
      const rib = document.createElement("div");
      rib.className = "ribbon";
      rib.textContent = "Recommended";
      div.appendChild(rib);
    }

    // rarity badge
    const rarity = document.createElement("div");
    rarity.className = "rarity";
    rarity.textContent = (card.rarity || "").toUpperCase();

    const head = document.createElement("div");
    head.className = "card-head";

    const icon = document.createElement("div");
    icon.className = "card-icon";
    icon.textContent = card.ui?.icon || "🃏";

    const body = document.createElement("div");
    body.className = "card-body";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = card.name;

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = card.desc || "—";

    body.appendChild(name);
    body.appendChild(desc);

    head.appendChild(icon);
    head.appendChild(body);

    const meta = document.createElement("div");
    meta.className = "meta";
    (card.tags || []).slice(0, 3).forEach(t => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = t;
      meta.appendChild(tag);
    });

    div.appendChild(rarity);
    div.appendChild(head);
    div.appendChild(meta);

    div.addEventListener("click", () => toggleSelect(card.id));
    ui.hand.appendChild(div);
  });
}

function toggleSelect(id){
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    if (selected.size >= 2) {
      // swap behavior: remove oldest selection
      const first = selected.values().next().value;
      selected.delete(first);
    }
    selected.add(id);
  }
  renderHand();
  ui.selectedCount.textContent = `${selected.size}`;
  ui.btnEndYear.disabled = selected.size !== 2;
}

function playYear(chosenIds){
  const snap = game.playYear(chosenIds);

  ui.resultsTitle.textContent = `Year ${snap.year} completed`;
  ui.eventText.textContent = snap.event ? `${snap.event.name}: ${snap.event.text}` : "No event this year.";

  ui.logList.innerHTML = "";
  snap.log.forEach(item => {
    const row = document.createElement("div");
    row.className = "log-item";

    const t = document.createElement("div");
    t.className = "log-title";
    t.textContent = item.title;

    const tx = document.createElement("div");
    tx.className = "log-text";
    tx.textContent = item.text;

    row.appendChild(t);
    row.appendChild(tx);
    ui.logList.appendChild(row);
  });

  // After the first completed year, consider the rules “seen”
  if (snap.year === 1) markRulesSeen();

  // deal next year
  currentHand = game.getHand();
  selected.clear();
  render();

  // to remove instructions after first hand
  const hasSeen = localStorage.getItem(RULES_SEEN_KEY) === "1";
  // Auto-open only on Year 1 and only if not dismissed before
  openRules(!hasSeen);


  // Ending checks (UI message only)
  const s = game.state;
  if (snap.netWorth < -50000) {
    alert("Ending: Bankruptcy spiral. Try a more stable run.");
  }
  if (s.stress >= 100 || s.burnout >= 100) {
    alert("Ending: Burnout collapse. Stability is a strategy.");
  }
}

function renderChart(){
  const ctx = ui.chart.getContext("2d");
  const w = ui.chart.width;
  const h = ui.chart.height;

  ctx.clearRect(0,0,w,h);

  const history = game.state.history;
  const points = history.map(x => x.netWorth);
  const currentNW = netWorth(game.state);
  const series = points.concat([currentNW]);

  if (series.length < 2) {
    // baseline line
    ctx.beginPath();
    ctx.moveTo(20, h/2);
    ctx.lineTo(w-20, h/2);
    ctx.stroke();
    return;
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = 20;

  const xStep = (w - pad*2) / (series.length - 1);
  const yScale = (h - pad*2) / (max - min || 1);

  // axes baseline
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // line
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = pad + i * xStep;
    const y = (h - pad) - (v - min) * yScale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineWidth = 2;
  ctx.stroke();

  // last point dot
  const lastX = pad + (series.length - 1) * xStep;
  const lastY = (h - pad) - (series[series.length - 1] - min) * yScale;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
}

ui.btnEndYear.addEventListener("click", () => {
  if (selected.size !== 2) return;
  playYear(Array.from(selected));
});

ui.btnSkip.addEventListener("click", () => {
  // force "do_nothing" + another best card if available
  const ids = currentHand.map(c => c.id);
  const first = "do_nothing";
  const second = ids.find(id => id !== "do_nothing") || "do_nothing";
  playYear([first, second]);
});

ui.btnNewRun.addEventListener("click", () => {
  startNewRun(seedFromPrompt());
});

ui.btnReset.addEventListener("click", () => {
  startNewRun(game?.seed || "RUN-001");
});

// ===== Rules Card Wiring =====
ui.btnRules.addEventListener("click", () => {
  const expanded = ui.btnRules.getAttribute("aria-expanded") === "true";
  openRules(!expanded);
});

ui.btnRulesDismiss.addEventListener("click", () => {
  markRulesSeen();
  openRules(false);
});

// Load saved mode
const savedMode = localStorage.getItem(MODE_KEY);
if (savedMode) ui.modeSelect.value = savedMode;

// Changing mode starts a new run (same seed)
ui.modeSelect.addEventListener("change", () => {
  startNewRun(game?.seed || "RUN-001");
});

// boot
startNewRun("RUN-001");
