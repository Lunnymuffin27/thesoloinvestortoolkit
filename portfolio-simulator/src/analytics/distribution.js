import { percentile } from "../core/math.js";

export function computeBands(yearlyBuckets) {
  // yearlyBuckets[y] is sorted
  const p10 = [];
  const p50 = [];
  const p90 = [];

  for (const bucket of yearlyBuckets) {
    p10.push(percentile(bucket, 0.10));
    p50.push(percentile(bucket, 0.50));
    p90.push(percentile(bucket, 0.90));
  }

  return { p10, p50, p90 };
}

export function histogram(sortedArr, binCount = 20) {
  if (!sortedArr.length) return { bins: [], counts: [] };
  const min = sortedArr[0];
  const max = sortedArr[sortedArr.length - 1];
  if (min === max) return { bins: [min], counts: [sortedArr.length] };

  const width = (max - min) / binCount;
  const counts = Array(binCount).fill(0);
  const bins = Array.from({ length: binCount }, (_, i) => min + i * width);

  for (const x of sortedArr) {
    const idx = Math.min(binCount - 1, Math.floor((x - min) / width));
    counts[idx]++;
  }
  return { bins, counts };
}
