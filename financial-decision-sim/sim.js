/* sim.js
   Financial Decision Simulator (Game-Like) — CONSOLIDATED ENGINE

   ✅ Includes:
   - Seeded RNG
   - State model + net worth
   - Card Pool + unlocks + cooldown/exhaust
   - drawHand() (rarity + state-aware bias)
   - Events (weighted) with card-flag wiring
   - Year step (2 cards/year) + runSimulation()

   Usage:
   - const game = createGame({ seed:"RUN-001" });
   - game.startRun();
   - const hand = game.getHand(); // 6–8 cards
   - game.playYear(["index_investing","pay_down_debt"]);
   - repeat...

   Or headless:
   - runSimulation({ seed, years, policy })
*/

///////////////////////////////
// 1) Seeded RNG (Mulberry32) //
///////////////////////////////
export function createRng(seed = Date.now()) {
  let s = typeof seed === "string" ? hashStringToInt(seed) : (seed >>> 0);
  return function rng() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function randInt(rng, min, maxInclusive) {
  const r = rng();
  return Math.floor(r * (maxInclusive - min + 1)) + min;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function sumUniformNoise(rng) {
  return (rng() + rng() + rng() + rng() - 2) / 2; // ~[-1, 1]
}

///////////////////////////////
// 2) State + helpers         //
///////////////////////////////
function addLog(state, entry) {
  state.log.push(entry);
}
function getFlag(state, key, fallback = 0) {
  return state?.flags && typeof state.flags[key] !== "undefined" ? state.flags[key] : fallback;
}

export function createInitialState(config = {}) {
  const {
    year = 1,
    cash = 8000,
    invested = 0,
    debt = 12000,
    income = 52000,
    expenses = 36000,
    stress = 25,      // 0..100
    risk = 0.45,      // 0..1
    discipline = 0.50,// 0..1
    burnout = 0,      // 0..100
    rentalUnits = 0,
    sideHustleLevel = 0,
  } = config;

  return {
    year,
    cash,
    invested,
    debt,
    income,
    expenses,
    stress,
    risk,
    discipline,
    burnout,
    rentalUnits,
    sideHustleLevel,

    flags: {
      laidOff: false,
      medicalDebt: 0,

      // card-driven flags
      emergencyFundBuff: 0, // 0..3 (shield stacks)
      autoInvest: 0,        // 0..5
      refiLevel: 0,         // 0..2
      insuranceLevel: 0,    // 0..2
      regretDrag: 0,        // 0..3
      careerMomentum: 0,    // 0..5
      propertyExposure: 0,  // 0..5
      businessLevel: 0,     // 0..5
    },

    runMeta: null, // created by ensureRunMeta()

    history: [],
    log: [],
  };
}

export function netWorth(state) {
  const rentalEquity = (state.rentalUnits || 0) * 15000; // simplified equity proxy
  const medicalDebt = state.flags?.medicalDebt || 0;
  return state.cash + state.invested + rentalEquity - state.debt - medicalDebt;
}

///////////////////////////////
// 3) Run meta (unlock/cd)    //
///////////////////////////////
function ensureRunMeta(state) {
  if (!state.runMeta) {
    state.runMeta = {
      unlocked: new Set(),
      exhausted: new Set(),
      cooldowns: new Map(),
    };
  }
  // normalize after serialization
  if (!(state.runMeta.unlocked instanceof Set)) state.runMeta.unlocked = new Set(state.runMeta.unlocked || []);
  if (!(state.runMeta.exhausted instanceof Set)) state.runMeta.exhausted = new Set(state.runMeta.exhausted || []);
  if (!(state.runMeta.cooldowns instanceof Map)) state.runMeta.cooldowns = new Map(Object.entries(state.runMeta.cooldowns || {}));
  return state.runMeta;
}

function tickCooldowns(state) {
  const meta = ensureRunMeta(state);
  for (const [id, yrs] of meta.cooldowns.entries()) {
    const next = yrs - 1;
    if (next <= 0) meta.cooldowns.delete(id);
    else meta.cooldowns.set(id, next);
  }
}

function unlockCards(state, ids) {
  const meta = ensureRunMeta(state);
  ids.forEach((id) => meta.unlocked.add(id));
}

///////////////////////////////
// 4) Cards (pool + draw)     //
///////////////////////////////
const RARITY = { common: "common", uncommon: "uncommon", rare: "rare", legendary: "legendary" };
const CARD_TYPE = { money: "money", career: "career", lifestyle: "lifestyle", ownership: "ownership", defense: "defense", wildcard: "wildcard" };

const CARDS = [
  // ===== COMMON (10) =====
  {
    id: "index_investing",
    name: "Index Investing",
    type: CARD_TYPE.money,
    rarity: RARITY.common,
    tags: ["investing", "compounding"],
    requires: (s) => s.cash >= 500,
    apply: (s) => {
      const amount = Math.min(s.cash, 6000);
      if (amount <= 0) return { ok: false, reason: "No cash to invest." };
      s.cash -= amount;
      s.invested += amount;
      s.discipline = clamp(s.discipline + 0.02, 0, 1);
      s.stress = clamp(s.stress - 2, 0, 100);
      return { ok: true, text: `Invested $${amount.toFixed(0)} into broad markets.` };
    },
  },
  {
    id: "pay_down_debt",
    name: "Pay Down Debt",
    type: CARD_TYPE.money,
    rarity: RARITY.common,
    tags: ["debt", "stability"],
    requires: (s) => s.debt > 0 && s.cash >= 300,
    apply: (s) => {
      const amount = Math.min(s.cash, 5000, s.debt);
      if (amount <= 0) return { ok: false, reason: "No debt (or no cash)." };
      s.cash -= amount;
      s.debt -= amount;
      s.stress = clamp(s.stress - 6, 0, 100);
      s.discipline = clamp(s.discipline + 0.01, 0, 1);
      return { ok: true, text: `Paid $${amount.toFixed(0)} toward debt.` };
    },
  },
  {
    id: "build_emergency_fund",
    name: "Build Emergency Fund",
    type: CARD_TYPE.defense,
    rarity: RARITY.common,
    tags: ["stability", "defense"],
    requires: () => true,
    apply: (s) => {
      s.stress = clamp(s.stress - 4, 0, 100);
      s.discipline = clamp(s.discipline + 0.02, 0, 1);
      s.flags.emergencyFundBuff = clamp(getFlag(s, "emergencyFundBuff", 0) + 1, 0, 3);
      return { ok: true, text: "Liquidity prioritized. Shocks hit softer." };
    },
  },
  {
    id: "reduce_lifestyle",
    name: "Reduce Lifestyle",
    type: CARD_TYPE.lifestyle,
    rarity: RARITY.common,
    tags: ["expenses", "discipline", "stability"],
    requires: (s) => s.expenses > 0,
    apply: (s, rng) => {
      const cut = Math.floor(s.expenses * (0.03 + rng() * 0.04)); // 3–7%
      s.expenses = Math.max(0, s.expenses - cut);
      s.stress = clamp(s.stress - 5, 0, 100);
      s.discipline = clamp(s.discipline + 0.02, 0, 1);
      return { ok: true, text: `Expenses -$${cut.toFixed(0)}/yr.` };
    },
  },
  {
    id: "negotiate_bills",
    name: "Negotiate Bills",
    type: CARD_TYPE.lifestyle,
    rarity: RARITY.common,
    tags: ["expenses", "defense"],
    requires: (s) => s.expenses > 0,
    apply: (s, rng) => {
      const cut = Math.floor(600 + rng() * 1400);
      s.expenses = Math.max(0, s.expenses - cut);
      s.discipline = clamp(s.discipline + 0.015, 0, 1);
      s.stress = clamp(s.stress - 2, 0, 100);
      return { ok: true, text: `Bills reduced. Expenses -$${cut.toFixed(0)}/yr.` };
    },
  },
  {
    id: "skill_sprint",
    name: "Skill Sprint",
    type: CARD_TYPE.career,
    rarity: RARITY.common,
    tags: ["career", "growth", "stress"],
    requires: (s) => s.burnout < 95,
    apply: (s, rng) => {
      s.flags.careerMomentum = clamp(getFlag(s, "careerMomentum", 0) + 1, 0, 5);
      s.discipline = clamp(s.discipline + 0.03, 0, 1);
      s.stress = clamp(s.stress + 5, 0, 100);
      s.burnout = clamp(s.burnout + 6, 0, 100);

      if (rng() < 0.25) {
        const bump = Math.floor(1200 + rng() * 2400);
        s.income += bump;
        return { ok: true, text: `Upskill payoff. Income +$${bump}/yr.` };
      }
      return { ok: true, text: "Upskilled hard. Momentum increased." };
    },
  },
  {
    id: "side_hustle",
    name: "Side Hustle",
    type: CARD_TYPE.career,
    rarity: RARITY.common,
    tags: ["hustle", "income", "burnout"],
    requires: (s) => s.cash >= (800 + (s.sideHustleLevel || 0) * 500),
    apply: (s, rng) => {
      const lvl = s.sideHustleLevel || 0;
      const cost = 800 + lvl * 500;
      if (s.cash < cost) return { ok: false, reason: "Not enough cash for startup costs." };

      s.cash -= cost;
      s.sideHustleLevel = lvl + 1;

      const bump = Math.floor((900 + rng() * 2000) * (1 + 0.35 * s.sideHustleLevel));
      s.income += bump;

      s.stress = clamp(s.stress + (6 + lvl * 2), 0, 100);
      s.burnout = clamp(s.burnout + 8, 0, 100);

      return { ok: true, text: `Hustle leveled up. Income +$${bump}/yr.` };
    },
  },
  {
    id: "automate_savings",
    name: "Automate Savings",
    type: CARD_TYPE.money,
    rarity: RARITY.common,
    tags: ["investing", "system", "discipline"],
    requires: () => true,
    apply: (s) => {
      s.flags.autoInvest = clamp(getFlag(s, "autoInvest", 0) + 1, 0, 5);
      s.discipline = clamp(s.discipline + 0.02, 0, 1);
      s.stress = clamp(s.stress - 1, 0, 100);
      return { ok: true, text: "Saving system installed. Auto-invest will trigger yearly." };
    },
  },
  {
    id: "overtime_push",
    name: "Overtime Push",
    type: CARD_TYPE.career,
    rarity: RARITY.common,
    tags: ["income", "stress", "burnout"],
    cooldownYears: 1,
    requires: (s) => s.burnout < 92,
    apply: (s, rng) => {
      const bonus = Math.floor(1200 + rng() * 4200);
      s.cash += bonus;
      s.stress = clamp(s.stress + 7, 0, 100);
      s.burnout = clamp(s.burnout + 9, 0, 100);
      return { ok: true, text: `Overtime paid. Cash +$${bonus}.` };
    },
  },
  {
    id: "do_nothing",
    name: "Do Nothing",
    type: CARD_TYPE.lifestyle,
    rarity: RARITY.common,
    tags: ["recovery", "stability"],
    requires: () => true,
    apply: (s) => {
      s.stress = clamp(s.stress - 3, 0, 100);
      s.burnout = clamp(s.burnout - 5, 0, 100);
      return { ok: true, text: "You recovered. Stress eased." };
    },
  },

  // ===== UNCOMMON (6) =====
  {
    id: "career_move",
    name: "Career Move",
    type: CARD_TYPE.career,
    rarity: RARITY.uncommon,
    tags: ["income", "volatility"],
    cooldownYears: 2,
    requires: (s) => s.burnout < 95,
    apply: (s, rng) => {
      const momentum = getFlag(s, "careerMomentum", 0);
      const successP = clamp(0.66 + (s.discipline - 0.5) * 0.25 - (s.stress / 100) * 0.18 + momentum * 0.03, 0.30, 0.90);

      if (rng() < successP) {
        const bump = Math.floor(4000 + rng() * 14000);
        s.income += bump;
        s.stress = clamp(s.stress + 4, 0, 100);
        return { ok: true, text: `You leveled up. Income +$${bump}/yr.` };
      } else {
        const hit = Math.floor(6000 + rng() * 14000);
        s.income = Math.max(0, s.income - hit);
        s.stress = clamp(s.stress + 14, 0, 100);
        s.flags.laidOff = true;
        return { ok: true, text: "The move backfired. Income destabilized this year." };
      }
    },
  },
  {
    id: "debt_refi",
    name: "Debt Refi",
    type: CARD_TYPE.money,
    rarity: RARITY.uncommon,
    tags: ["debt", "stability"],
    cooldownYears: 3,
    requires: (s) => s.debt > 8000 && s.discipline >= 0.55,
    apply: (s, rng) => {
      s.flags.refiLevel = clamp(getFlag(s, "refiLevel", 0) + 1, 0, 2);

      const fee = Math.floor(400 + rng() * 900);
      if (s.cash >= fee) s.cash -= fee;
      else {
        s.debt += (fee - s.cash) * 1.1;
        s.cash = 0;
      }

      s.stress = clamp(s.stress - 6, 0, 100);
      return { ok: true, text: `Refinanced debt. APR reduced (fee $${fee}).` };
    },
  },
  {
    id: "start_business",
    name: "Start Business",
    type: CARD_TYPE.career,
    rarity: RARITY.uncommon,
    tags: ["income", "high-upside", "burnout"],
    cooldownYears: 2,
    requires: (s) => s.cash >= 2500 && s.burnout < 85,
    apply: (s, rng) => {
      const seedCost = Math.floor(2000 + rng() * 4000);
      if (s.cash < seedCost) return { ok: false, reason: "Not enough cash to start." };
      s.cash -= seedCost;

      s.flags.businessLevel = clamp(getFlag(s, "businessLevel", 0) + 1, 0, 5);
      const level = getFlag(s, "businessLevel", 0);
      const bump = Math.floor((2500 + level * 1800) * (1 + sumUniformNoise(rng) * 0.9));
      s.income = Math.max(0, s.income + bump);

      s.stress = clamp(s.stress + (10 + level * 2), 0, 100);
      s.burnout = clamp(s.burnout + 14, 0, 100);

      return { ok: true, text: `Business push. Income change: ${bump >= 0 ? "+" : ""}$${bump}/yr.` };
    },
  },
  {
    id: "buy_rental",
    name: "Buy Rental",
    type: CARD_TYPE.ownership,
    rarity: RARITY.uncommon,
    tags: ["ownership", "leverage", "income"],
    cooldownYears: 2,
    requires: (s) => s.cash >= 12000,
    apply: (s, rng) => {
      const down = 12000;
      s.cash -= down;

      const addedDebt = Math.floor(60000 + rng() * 20000);
      s.debt += addedDebt;
      s.rentalUnits = (s.rentalUnits || 0) + 1;

      const cashflow = Math.floor(800 + rng() * 2800);
      s.income += cashflow;

      s.stress = clamp(s.stress + 10, 0, 100);
      s.risk = clamp(s.risk + 0.06, 0, 1);

      s.flags.propertyExposure = clamp(getFlag(s, "propertyExposure", 0) + 1, 0, 5);

      return { ok: true, text: `Rental acquired. Income +$${cashflow}/yr, debt +$${addedDebt}.` };
    },
  },
  {
    id: "house_hack",
    name: "House Hack",
    type: CARD_TYPE.ownership,
    rarity: RARITY.uncommon,
    tags: ["ownership", "stability", "income"],
    cooldownYears: 2,
    requires: (s) => s.cash >= 8000 && s.stress <= 85,
    apply: (s, rng) => {
      const cost = Math.floor(8000 + rng() * 4000);
      if (s.cash < cost) return { ok: false, reason: "Not enough cash to house hack." };
      s.cash -= cost;

      const addedDebt = Math.floor(25000 + rng() * 15000);
      s.debt += addedDebt;

      const expenseDrop = Math.floor(1200 + rng() * 2400);
      s.expenses = Math.max(0, s.expenses - expenseDrop);

      s.stress = clamp(s.stress + 4, 0, 100);
      s.risk = clamp(s.risk + 0.03, 0, 1);

      return { ok: true, text: `House hack. Expenses -$${expenseDrop}/yr, debt +$${addedDebt}.` };
    },
  },
  {
    id: "insurance_upgrade",
    name: "Insurance Upgrade",
    type: CARD_TYPE.defense,
    rarity: RARITY.uncommon,
    tags: ["defense", "medical", "stability"],
    cooldownYears: 3,
    requires: (s) => s.expenses > 0,
    apply: (s, rng) => {
      const added = Math.floor(300 + rng() * 900);
      s.expenses += added;

      s.flags.insuranceLevel = clamp(getFlag(s, "insuranceLevel", 0) + 1, 0, 2);
      s.stress = clamp(s.stress - 2, 0, 100);

      return { ok: true, text: `Coverage upgraded. Expenses +$${added}/yr, medical hits reduced.` };
    },
  },

  // ===== RARE (2) =====
  {
    id: "panic_sell",
    name: "Panic Sell",
    type: CARD_TYPE.wildcard,
    rarity: RARITY.rare,
    tags: ["investing", "fear", "cash"],
    exhaust: true,
    requires: (s) => s.invested > 1000,
    apply: (s) => {
      const liquidated = Math.floor(s.invested * 0.95);
      s.invested -= liquidated;
      s.cash += liquidated;

      s.flags.regretDrag = clamp(getFlag(s, "regretDrag", 0) + 1, 0, 3);
      s.stress = clamp(s.stress - 6, 0, 100);
      s.discipline = clamp(s.discipline - 0.03, 0, 1);

      return { ok: true, text: `You sold in fear. Cash +$${liquidated}. Regret drag increased.` };
    },
  },
  {
    id: "windfall_opportunity",
    name: "Windfall Opportunity",
    type: CARD_TYPE.wildcard,
    rarity: RARITY.rare,
    tags: ["luck", "cash", "momentum"],
    exhaust: true,
    requires: () => true,
    apply: (s, rng) => {
      const base = 1200 + rng() * 3000;
      const bonus = Math.floor(base * (1 + s.discipline * 2.2));
      s.cash += bonus;
      s.stress = clamp(s.stress - 4, 0, 100);
      return { ok: true, text: `Opportunity hit. Cash +$${bonus}.` };
    },
  },
];

function initDefaultUnlocks(state) {
  const starter = CARDS.map(c => c.id); // all included in this build
  unlockCards(state, starter);
}

function isCardPlayable(state, card) {
  const meta = ensureRunMeta(state);
  if (!meta.unlocked.has(card.id)) return false;
  if (meta.exhausted.has(card.id)) return false;
  if (meta.cooldowns.has(card.id)) return false;
  if (typeof card.requires === "function" && !card.requires(state)) return false;
  return true;
}

function situationalBiasWeight(state, card) {
  let w = 1.0;
  const stress = state.stress;
  const burnout = state.burnout;
  const debt = state.debt;
  const cash = state.cash;

  const hasTag = (t) => (card.tags || []).includes(t);

  if (stress > 70) {
    if (card.type === CARD_TYPE.defense) w *= 1.7;
    if (hasTag("recovery")) w *= 1.6;
  }
  if (debt > 20000) {
    if (hasTag("debt")) w *= 1.8;
    if (hasTag("leverage")) w *= 0.75;
  }
  if (cash < 3000) {
    if (hasTag("expenses") || hasTag("stability") || card.type === CARD_TYPE.defense) w *= 1.6;
    if (hasTag("ownership")) w *= 0.4;
  }
  if (burnout > 75) {
    if (hasTag("burnout") || hasTag("hustle")) w *= 0.55;
    if (hasTag("recovery") || card.id === "do_nothing") w *= 1.5;
  }
  if (state.invested > 15000 && card.id === "panic_sell") w *= 1.15;

  return w;
}

function pickWeighted(rng, items) {
  const pool = items.filter(x => x.w > 0);
  const total = pool.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const it of pool) {
    roll -= it.w;
    if (roll <= 0) return it.item;
  }
  return pool[pool.length - 1].item;
}

export function drawHand(state, rng, opts = {}) {
  const {
    commons = 4,
    uncommons = 2,
    includeRareChance = 0.28,
    includeWildChance = 0.30,
    maxHand = 8,
  } = opts;

  const unlocked = CARDS.filter(c => isCardPlayable(state, c));
  const byRarity = {
    [RARITY.common]: unlocked.filter(c => c.rarity === RARITY.common),
    [RARITY.uncommon]: unlocked.filter(c => c.rarity === RARITY.uncommon),
    [RARITY.rare]: unlocked.filter(c => c.rarity === RARITY.rare),
    [RARITY.legendary]: unlocked.filter(c => c.rarity === RARITY.legendary),
  };

  const hand = [];
  const used = new Set();

  const drawFrom = (pool, n) => {
    for (let i = 0; i < n; i++) {
      const candidates = pool.filter(c => !used.has(c.id));
      if (!candidates.length) return;
      const picked = pickWeighted(rng, candidates.map(card => ({
        item: card,
        w: 1.0 * situationalBiasWeight(state, card),
      })));
      if (!picked) return;
      used.add(picked.id);
      hand.push(picked);
      if (hand.length >= maxHand) return;
    }
  };

  drawFrom(byRarity[RARITY.common], commons);
  drawFrom(byRarity[RARITY.uncommon], uncommons);

  if (rng() < includeRareChance) drawFrom(byRarity[RARITY.rare], 1);
  if (rng() < includeWildChance) {
    const wildPool = unlocked.filter(c => c.type === CARD_TYPE.wildcard && !used.has(c.id));
    drawFrom(wildPool, 1);
  }

  if (hand.length < Math.min(maxHand, 6)) {
    drawFrom(byRarity[RARITY.common], Math.min(2, Math.min(maxHand, 6) - hand.length));
  }

  return hand;
}

export function applyCard(state, rng, cardId) {
  ensureRunMeta(state);
  const card = CARDS.find(c => c.id === cardId);
  if (!card) return { ok: false, reason: "Unknown card." };
  if (!isCardPlayable(state, card)) return { ok: false, reason: "Card not playable (cooldown/exhaust/requirements)." };

  const res = card.apply(state, rng);

  if (res.ok) {
    if (card.exhaust) state.runMeta.exhausted.add(card.id);
    if (card.cooldownYears && card.cooldownYears > 0) state.runMeta.cooldowns.set(card.id, card.cooldownYears);
  }
  return { card, ...res };
}

///////////////////////////////
// 5) Card-flag wiring in sim //
///////////////////////////////
function applyShockBuffer(state, rawAmount) {
  const buff = getFlag(state, "emergencyFundBuff", 0); // 0..3
  if (buff <= 0) return rawAmount;
  const reduced = Math.floor(rawAmount * (1 - buff * 0.07)); // up to -21%
  return Math.max(0, reduced);
}

function applyAutoInvest(state) {
  const level = getFlag(state, "autoInvest", 0); // 0..5
  if (level <= 0) return;

  const target = Math.floor(state.income * (0.01 + 0.01 * level)); // 2%..6% income
  const amount = Math.min(state.cash, clamp(target, 200, 2500));

  if (amount > 0) {
    state.cash -= amount;
    state.invested += amount;
    state.discipline = clamp(state.discipline + 0.01, 0, 1);
    state.stress = clamp(state.stress - 1, 0, 100);

    addLog(state, { type: "system", title: "Auto-Invest", text: `System invested $${amount.toFixed(0)}.` });
  }
}

///////////////////////////////
// 6) Economy                 //
///////////////////////////////
function applyYearlyCashflow(state) {
  const delta = state.income - state.expenses;
  state.cash += delta;

  if (state.cash < 0) {
    const shortfall = Math.abs(state.cash);
    state.cash = 0;
    const buffered = applyShockBuffer(state, shortfall);
    state.debt += buffered * 1.05;
    state.stress = clamp(state.stress + 10, 0, 100);
    addLog(state, {
      type: "system",
      title: "Cash Shortfall",
      text: `Expenses exceeded income. $${buffered.toFixed(0)} rolled into debt.`,
    });
  }
}

function applyDebtInterest(state) {
  const baseAPR = 0.10;
  const stressAPR = (state.stress / 100) * 0.06; // up to +6%
  const cashPenalty = state.cash < 2000 ? 0.03 : 0;

  const refiLevel = getFlag(state, "refiLevel", 0); // 0..2
  const refiDiscount = refiLevel === 0 ? 0 : (refiLevel === 1 ? 0.03 : 0.05);

  let apr = baseAPR + stressAPR + cashPenalty - refiDiscount;
  apr = clamp(apr, 0.02, 0.30);

  const interest = state.debt * apr;
  state.debt += interest;

  addLog(state, {
    type: "system",
    title: "Debt Interest",
    text: `Debt grew by $${interest.toFixed(0)} (APR ${(apr * 100).toFixed(1)}%).`,
  });
}

function applyMarketReturn(state, rng) {
  const base = 0.07;
  const volatility = 0.18;
  const noise = (rng() + rng() + rng() + rng() - 2) / 2;
  let r = base + noise * volatility;

  const behaviorDrag = (state.stress / 100) * 0.03;
  const regretDrag = getFlag(state, "regretDrag", 0) * 0.012; // -1.2% per stack

  r -= (behaviorDrag + regretDrag);
  r = clamp(r, -0.45, 0.45);

  const gain = state.invested * r;
  state.invested += gain;

  addLog(state, {
    type: "market",
    title: "Market Return",
    text: `Investments ${(r >= 0 ? "grew" : "fell")} by ${(r * 100).toFixed(1)}% ($${gain.toFixed(0)}).`,
    meta: { returnRate: r },
  });

  return r;
}

///////////////////////////////
// 7) Events (weighted)       //
///////////////////////////////
const EVENTS = [
  {
    id: "market_crash",
    name: "Market Crash",
    weight: (s) => 6 + s.risk * 6,
    apply: (s) => {
      const drop = 0.22;
      const loss = s.invested * drop;
      s.invested -= loss;
      s.stress = clamp(s.stress + 10, 0, 100);
      return `Investments dropped ~${Math.round(drop * 100)}% (-$${loss.toFixed(0)}).`;
    },
  },
  {
    id: "medical_bill",
    name: "Medical Bill",
    weight: (s) => {
      const ef = getFlag(s, "emergencyFundBuff", 0);
      const base = 5 + (s.cash < 4000 ? 6 : 0);
      return Math.max(0, base - ef * 2);
    },
    apply: (s) => {
      const insuranceLevel = getFlag(s, "insuranceLevel", 0); // 0..2
      const emergencyBuff = getFlag(s, "emergencyFundBuff", 0); // 0..3

      let bill = 1800 + Math.floor((s.stress / 100) * 2500);

      const insuranceMult = insuranceLevel === 0 ? 1.0 : (insuranceLevel === 1 ? 0.75 : 0.55);
      bill = Math.floor(bill * insuranceMult);

      bill = Math.floor(bill * (1.0 - 0.08 * emergencyBuff)); // up to -24%
      bill = Math.max(0, bill);

      if (s.cash >= bill) {
        s.cash -= bill;
      } else {
        const remain = bill - s.cash;
        s.cash = 0;

        const debtPenalty = insuranceLevel === 0 ? 1.15 : (insuranceLevel === 1 ? 1.08 : 1.03);
        s.flags.medicalDebt = (s.flags.medicalDebt || 0) + remain * debtPenalty;
      }

      s.stress = clamp(s.stress + 8 - insuranceLevel * 2, 0, 100);
      return `You were hit with a $${bill.toFixed(0)} medical bill.`;
    },
  },
  {
    id: "layoff",
    name: "Layoff",
    weight: (s) => 4 + (s.stress > 70 ? 5 : 0) - getFlag(s, "careerMomentum", 0) * 0.5,
    apply: (s) => {
      s.flags.laidOff = true;
      s.stress = clamp(s.stress + 14, 0, 100);
      return "Income shock: you lost job momentum. This year takes a hit.";
    },
  },
  {
    id: "boring_year",
    name: "Boring Stable Year",
    weight: (s) => {
      const d = s.discipline;
      return 10 + (s.cash > 8000 ? 2 : 0) + (d > 0.65 ? 2 : 0);
    },
    apply: (s) => {
      s.stress = clamp(s.stress - 6, 0, 100);
      s.burnout = clamp(s.burnout - 6, 0, 100);
      return "No drama. Compounding had space to work.";
    },
  },
  {
    id: "lucky_break",
    name: "Lucky Break",
    weight: (s) => 4 + (s.discipline > 0.6 ? 2 : 0),
    apply: (s) => {
      const bonus = 1200 + Math.floor(s.discipline * 8000);
      s.cash += bonus;
      s.stress = clamp(s.stress - 4, 0, 100);
      return `A lucky break dropped $${bonus.toFixed(0)} in your lap.`;
    },
  },
  {
    id: "rental_repair",
    name: "Rental Repair",
    weight: (s) => {
      const exposure = getFlag(s, "propertyExposure", 0);
      const units = s.rentalUnits || 0;
      return units > 0 ? (4 + units * 3 + exposure * 1.5) : 0;
    },
    apply: (s) => {
      const raw = 900 + (s.rentalUnits || 0) * 700;
      const cost = applyShockBuffer(s, raw);

      if (s.cash >= cost) s.cash -= cost;
      else {
        s.debt += (cost - s.cash) * 1.10;
        s.cash = 0;
      }
      s.stress = clamp(s.stress + 6, 0, 100);
      return `Repair costs came due: $${cost.toFixed(0)}.`;
    },
  },
];

function pickWeightedEvent(state, rng) {
  const pool = EVENTS
    .map((e) => ({ e, w: Math.max(0, e.weight(state)) }))
    .filter((x) => x.w > 0);

  const total = pool.reduce((sum, x) => sum + x.w, 0);
  if (total <= 0) return null;

  let roll = rng() * total;
  for (const item of pool) {
    roll -= item.w;
    if (roll <= 0) return item.e;
  }
  return pool[pool.length - 1].e;
}

function applyEventForYear(state, rng) {
  const event = pickWeightedEvent(state, rng);
  if (!event) return null;

  const text = event.apply(state, rng);
  addLog(state, { type: "event", title: event.name, text, meta: { id: event.id } });

  return { id: event.id, name: event.name, text };
}

///////////////////////////////
// 8) Stress/Burnout drift    //
///////////////////////////////
function resolveLayoffFlag(state) {
  if (!state.flags.laidOff) return;
  const cut = 0.45;
  state.income = Math.floor(state.income * (1 - cut));
  addLog(state, { type: "system", title: "Income Disruption", text: `Layoff impact: income reduced by ${Math.round(cut * 100)}% this year.` });
  state.flags.laidOff = false;
}

function updateStressAndBurnout(state) {
  const hustleLoad = (state.sideHustleLevel || 0) * 2 + (state.rentalUnits || 0) * 2;

  state.burnout = clamp(
    state.burnout + (state.stress > 60 ? 4 : 1) + hustleLoad - (state.stress < 30 ? 2 : 0),
    0,
    100
  );

  const fragility =
    (state.cash < 3000 ? 6 : 0) +
    (state.debt > 25000 ? 6 : 0) +
    ((state.flags.medicalDebt || 0) > 0 ? 4 : 0);

  state.stress = clamp(state.stress + fragility - (state.discipline > 0.65 ? 2 : 0), 0, 100);

  if (state.burnout > 80) {
    state.expenses = Math.floor(state.expenses * 1.04);
    state.discipline = clamp(state.discipline - 0.03, 0, 1);
    addLog(state, { type: "system", title: "Burnout Spiral", text: "Burnout triggered spending creep and reduced discipline." });
  }
}

///////////////////////////////
// 9) Step Year + Run         //
///////////////////////////////
export function stepYear(state, rng, chosenCardIds = []) {
  ensureRunMeta(state);
  state.log = [];

  // cool-downs tick at start of year
  tickCooldowns(state);

  // Play up to 2 cards
  const picks = chosenCardIds.slice(0, 2);
  const cardResults = [];
  for (const id of picks) {
    const res = applyCard(state, rng, id);
    cardResults.push(res);

    addLog(state, {
      type: "card",
      title: res.card?.name || "Unknown Card",
      text: res.ok ? res.text : `Failed: ${res.reason}`,
      meta: { id },
    });
  }

  // Event
  const eventResult = applyEventForYear(state, rng);

  // Layoff effect
  resolveLayoffFlag(state);

  // Cashflow
  applyYearlyCashflow(state);

  // Auto-Invest (from Automate Savings)
  applyAutoInvest(state);

  // Debt interest (refi-aware)
  applyDebtInterest(state);

  // Market return (regretDrag-aware)
  const marketR = applyMarketReturn(state, rng);

  // Drift
  updateStressAndBurnout(state);

  // Snapshot
  const snapshot = {
    year: state.year,
    cash: Math.round(state.cash),
    invested: Math.round(state.invested),
    debt: Math.round(state.debt),
    income: Math.round(state.income),
    expenses: Math.round(state.expenses),
    stress: Math.round(state.stress),
    burnout: Math.round(state.burnout),
    rentalUnits: state.rentalUnits || 0,
    sideHustleLevel: state.sideHustleLevel || 0,
    netWorth: Math.round(netWorth(state)),
    marketReturn: marketR,
    chosenCardIds: picks,
    cardResults,
    event: eventResult,
    flags: { ...state.flags },
    log: state.log.slice(),
  };

  state.history.push(snapshot);
  state.year += 1;

  return snapshot;
}

export function runSimulation({ seed = "solo-investor", years = 10, initialState = {}, policy } = {}) {
  const rng = createRng(seed);
  const state = createInitialState(initialState);
  ensureRunMeta(state);
  initDefaultUnlocks(state);

  for (let i = 0; i < years; i++) {
    const hand = drawHand(state, rng);
    const chosen = typeof policy === "function"
      ? policy({ state, hand })
      : [hand[0]?.id, hand[1]?.id].filter(Boolean);

    stepYear(state, rng, chosen);

    // Endings (hard stops for MVP)
    if (netWorth(state) < -50000) break;          // bankruptcy-ish
    if (state.stress >= 100 || state.burnout >= 100) break; // burnout collapse
  }

  return {
    seed,
    final: state.history[state.history.length - 1] || null,
    history: state.history,
  };
}

///////////////////////////////
// 10) Tiny "Game" wrapper    //
///////////////////////////////
export function createGame({ seed = "RUN-001", years = 15, initialState = {} } = {}) {
  const rng = createRng(seed);
  const state = createInitialState(initialState);
  ensureRunMeta(state);
  initDefaultUnlocks(state);

  let currentHand = drawHand(state, rng);

  return {
    seed,
    state,
    getHand() {
      return currentHand;
    },
    playYear(chosenCardIds) {
      const snap = stepYear(state, rng, chosenCardIds);
      currentHand = drawHand(state, rng);
      return snap;
    },
    restart(newSeed = seed) {
      const rng2 = createRng(newSeed);
      const state2 = createInitialState(initialState);
      ensureRunMeta(state2);
      initDefaultUnlocks(state2);
      return createGame({ seed: newSeed, years, initialState });
    },
  };
}
