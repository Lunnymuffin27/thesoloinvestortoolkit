export function formatMoney(n) {
  const x = Number.isFinite(n) ? n : 0;
  return "$" + Math.round(x).toLocaleString();
}

export function formatPct(x) {
  if (!Number.isFinite(x)) return "-";
  return (x * 100).toFixed(2) + "%";
}
