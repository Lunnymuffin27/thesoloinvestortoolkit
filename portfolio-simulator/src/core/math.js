export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s2 = 0;
  for (const x of arr) s2 += (x - m) ** 2;
  return Math.sqrt(s2 / (arr.length - 1));
}

export function percentile(sortedArr, p) {
  // sortedArr must be sorted ascending
  if (!sortedArr.length) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const w = idx - lo;
  return sortedArr[lo] * (1 - w) + sortedArr[hi] * w;
}
