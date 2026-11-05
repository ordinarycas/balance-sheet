// 引擎：TradingView Lightweight Charts（Apache-2.0，預設）。Canvas 繪圖，列印時轉成圖片。
import { createChart, HistogramSeries, LineSeries, AreaSeries, ColorType, CrosshairMode } from '../../../../vendor/lightweight-charts.mjs';
import { h } from '../../dom.js';

const DAY = 86400;

function timesFor(labels, monthKeys) {
  const base = Date.UTC(2000, 0, 1) / 1000;
  return labels.map((_, i) => {
    const k = monthKeys?.[i];
    if (k && /^\d{4}-\d{2}$/.test(k)) return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1) / 1000;
    return base + i * DAY;
  });
}

export async function draw(wrap, container, spec, th) {
  const { labels, series, stacked, kind, yFmt, tipFmt, monthKeys } = spec;
  // 引擎自己會在圖裡放可聚焦的元素，role=img 底下不能有可聚焦的子元素（axe: nested-interactive），所以用 group
  container.setAttribute('role', 'group');
  container.setAttribute('aria-roledescription', '圖表');
  container.setAttribute('aria-label', spec.title || '圖表');
  const times = timesFor(labels, monthKeys);
  const labelOf = new Map(times.map((t, i) => [t, labels[i]]));
  const chart = createChart(container, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: th.muted, fontFamily: th.font, fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: th.line } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: (t) => labelOf.get(t) ?? '' },
    localization: { timeFormatter: (t) => labelOf.get(t) ?? '', priceFormatter: yFmt },
    crosshair: { mode: CrosshairMode.Magnet },
    handleScroll: false,
    handleScale: false,
  });
  const ro = new ResizeObserver(() => chart.timeScale().fitContent());
  ro.observe(container);

  const rows = new Map();
  times.forEach((t, i) => rows.set(t, series.map((s) => ({ name: s.name, text: tipFmt(s.values[i] ?? 0) }))));
  const common = { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'custom', formatter: yFmt, minMove: 1 } };

  if (kind === 'bar' && stacked) {
    const cum = series.map((_, k) => labels.map((__, i) => series.slice(0, k + 1).reduce((a, s) => a + (s.values[i] ?? 0), 0)));
    for (let k = series.length - 1; k >= 0; k--) {
      chart.addSeries(HistogramSeries, { ...common, color: th.colors[k] }).setData(times.map((t, i) => ({ time: t, value: cum[k][i] })));
    }
  } else if (kind === 'bar') {
    series.forEach((s, k) => {
      chart.addSeries(HistogramSeries, { ...common, color: th.colors[k] })
        .setData(times.map((t, i) => ({ time: t, value: s.values[i] ?? 0, color: (s.values[i] ?? 0) < 0 ? th.neg : th.colors[k] })));
    });
  } else {
    series.forEach((s, k) => {
      const c = th.colors[k];
      const ls = series.length === 1
        ? chart.addSeries(AreaSeries, { ...common, lineColor: c, topColor: `${c}66`, bottomColor: `${c}08`, lineWidth: 2 })
        : chart.addSeries(LineSeries, { ...common, color: c, lineWidth: 2 });
      ls.setData(times.map((t, i) => ({ time: t, value: s.values[i] ?? 0 })));
    });
  }

  const tip = h('div', { class: 'tvtip' });
  tip.style.display = 'none';
  wrap.appendChild(tip);
  chart.subscribeCrosshairMove((p) => {
    const r = p.time && p.point && p.point.x >= 0 ? rows.get(p.time) : null;
    if (!r) { tip.style.display = 'none'; return; }
    tip.replaceChildren(h('strong', { text: labelOf.get(p.time) ?? '' }), ...r.map((x) => h('div', { text: `${x.name}：${x.text}` })));
    tip.style.display = 'block';
    tip.style.left = `${Math.min(Math.max(p.point.x + 12, 4), Math.max(wrap.clientWidth - tip.offsetWidth - 4, 4))}px`;
    tip.style.top = '8px';
  });

  return {
    dispose() { ro.disconnect(); try { chart.remove(); } catch { /* 已移除 */ } },
    /** 列印前：以淺色文字轉成圖片 */
    snapshot(light) {
      chart.applyOptions({ layout: { textColor: light.muted }, grid: { horzLines: { color: light.line } } });
      const url = chart.takeScreenshot().toDataURL('image/png');
      chart.applyOptions({ layout: { textColor: th.muted }, grid: { horzLines: { color: th.line } } });
      return url;
    },
  };
}
