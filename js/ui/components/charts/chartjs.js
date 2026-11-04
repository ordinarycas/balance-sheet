// 引擎：Chart.js 4（MIT，本地 UMD）。Canvas 繪圖，觸控 tooltip（index 模式），列印時轉成圖片。
import { loadScript } from './loader.js';

export async function draw(wrap, container, spec, th) {
  await loadScript('chart.umd.min.js');
  const Chart = globalThis.Chart;
  const { labels, series, stacked, kind, yFmt, tipFmt } = spec;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', spec.title || '圖表');
  container.appendChild(canvas);

  const single = series.length === 1;
  const datasets = series.map((s, k) => {
    const c = th.colors[k];
    if (kind === 'bar') {
      return { label: s.name, data: s.values, backgroundColor: stacked ? c : s.values.map((v) => (v < 0 ? th.neg : c)), borderWidth: 0, maxBarThickness: 48 };
    }
    return { label: s.name, data: s.values, borderColor: c, backgroundColor: `${c}33`, fill: single, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.2 };
  });
  const chart = new Chart(canvas, {
    type: kind === 'bar' ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: kind === 'bar' && stacked, grid: { display: false }, ticks: { color: th.muted, font: { family: th.font, size: 11 }, autoSkip: true, maxRotation: 0 } },
        y: { stacked: kind === 'bar' && stacked, grid: { color: th.line }, border: { display: false }, ticks: { color: th.muted, font: { family: th.font, size: 11 }, callback: (v) => yFmt(v) } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}：${tipFmt(c.parsed.y ?? 0)}` } },
      },
    },
  });
  return {
    dispose() { chart.destroy(); },
    snapshot(light) {
      for (const k of ['x', 'y']) chart.options.scales[k].ticks.color = light.muted;
      chart.options.scales.y.grid.color = light.line;
      chart.update('none');
      const url = chart.toBase64Image('image/png', 1);
      for (const k of ['x', 'y']) chart.options.scales[k].ticks.color = th.muted;
      chart.options.scales.y.grid.color = th.line;
      chart.update('none');
      return url;
    },
  };
}
