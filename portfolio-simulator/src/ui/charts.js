let chart;

const el = (id) => document.getElementById(id);

export function renderLineChart({ labels, datasets }) {
  const ctx = el("portfolioChart")?.getContext("2d");
  if (!ctx) return;

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      elements: { point: { radius: 0 } },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Year" } }
      }
    }
  });
}

export function buildLabels(years) {
  return Array.from({ length: years }, (_, i) => i + 1);
}
