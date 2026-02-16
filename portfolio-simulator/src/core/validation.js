import { clamp } from "./math.js";

export function normalizeAllocation(a) {
  // a: {stocks,bonds,cash} in decimals (0..1)
  const s = clamp(a.stocks ?? 0, 0, 1);
  const b = clamp(a.bonds ?? 0, 0, 1);
  const c = clamp(a.cash ?? 0, 0, 1);
  const total = s + b + c;
  if (total === 0) return { stocks: 1, bonds: 0, cash: 0 };
  return { stocks: s / total, bonds: b / total, cash: c / total };
}

export function validateInputs(cfg) {
  const errors = [];

  if (!(cfg.horizonYears >= 1 && cfg.horizonYears <= 50)) errors.push("Years must be between 1 and 50.");
  if (!(cfg.startBalance >= 0)) errors.push("Starting balance must be 0 or more.");
  if (!(cfg.monthlyContribution >= 0)) errors.push("Monthly contribution must be 0 or more.");

  const a = cfg.allocation;
  const total = (a.stocks + a.bonds + a.cash);
  // allow tiny float error
  if (Math.abs(total - 1) > 1e-6) errors.push("Allocation must equal 100%.");

  return errors;
}
