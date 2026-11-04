// 圖表分派層：各頁面維持 barChart／lineChart／legend 的呼叫介面，實際繪圖由選定的引擎負責。
//   lw      TradingView Lightweight Charts（預設，Apache-2.0）
//   chartjs Chart.js 4（MIT）
//   d3      D3.js 7（ISC，自繪 SVG）
//   apex    ApexCharts 4.7（MIT）
// 未提供 Nivo：它建立在 React 之上，需要建置工具鏈，與本專案「零建置、純靜態」的取捨衝突。
// 所有引擎都從 site/vendor/ 本地載入（無 CDN），並且只在被選用時才下載。
import { h } from '../dom.js';
import { compact } from '../fmt.js';
import { getPrefs } from '../../data/prefs.js';

export const ENGINES = [
  ['lw', 'Lightweight Charts'],
  ['chartjs', 'Chart.js'],
  ['d3', 'D3.js'],
  ['apex', 'ApexCharts'],
];
const LOADERS = {
  lw: () => import('./charts/lw.js'),
  chartjs: () => import('./charts/chartjs.js'),
  d3: () => import('./charts/d3.js'),
  apex: () => import('./charts/apex.js'),
};

const live = [];       // { wrap, container, handle }
let pending = [];      // 本輪繪圖的 Promise
let gen = 0;           // 每次 disposeCharts() 遞增，丟棄過期的非同步繪圖

/** 換頁或重繪前呼叫，釋放圖表資源。 */
export function disposeCharts() {
  gen++;
  pending = [];
  while (live.length) { try { live.pop().handle?.dispose(); } catch { /* 已移除 */ } }
}

/** 等待目前頁面上所有圖表完成繪製（列印、測試用）。 */
export function chartsReady() { return Promise.allSettled(pending); }

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function theme() {
  const bg = css('--panel');
  const lum = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return 1; const n = parseInt(m[1], 16); return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000; };
  return {
    muted: css('--muted') || '#888', line: css('--line') || '#ddd', font: css('--font'), neg: css('--neg') || '#b42318',
    colors: ['--c1', '--c2', '--c3', '--c4', '--c5'].map((v) => css(v) || '#888'),
    dark: lum(bg) < 0.5,
  };
}
const LIGHT = { muted: '#5d6676', line: '#dfe3ea' };
const CLS_INDEX = { s1: 0, s2: 1, s3: 2, s4: 3, s5: 4 };

export function legend(items) {
  const cur = getPrefs().chartLib;
  const sel = h('select', { class: 'chart-engine no-print', 'aria-label': '圖表引擎', title: '切換圖表引擎（也可在「P10 設定」變更）' },
    ENGINES.map(([k, name]) => h('option', { value: k, selected: k === cur, text: name })));
  sel.addEventListener('change', () => document.dispatchEvent(new CustomEvent('pfs:setpref', { detail: { key: 'chartLib', value: sel.value } })));
  return h('div', { class: 'legend' }, items.map((it) => h('span', null, h('i', { class: it.cls }), it.name)), sel);
}

function make(kind, opts) {
  const { labels, series, stacked = false, height = kind === 'bar' ? 260 : 240, yFmt = compact, tipFmt = (v) => String(Math.round(v)), monthKeys, title } = opts;
  const container = h('div', { class: 'tvchart' });
  container.style.height = `${height}px`;
  const img = h('img', { class: 'chart-print', alt: title || '圖表' });
  const wrap = h('div', { class: 'tvwrap' }, container, img);
  const th = theme();
  const spec = {
    kind, labels, stacked, height, yFmt, tipFmt, monthKeys, title,
    series: series.map((s) => ({ ...s, colorIdx: CLS_INDEX[s.cls] ?? 0 })),
  };
  th.colors = spec.series.map((s) => th.colors[s.colorIdx]);

  const myGen = gen;
  const entry = { wrap, container, img, handle: null };
  const run = async () => {
    let id = getPrefs().chartLib;
    if (!LOADERS[id]) id = 'lw';
    let handle;
    try {
      handle = await (await LOADERS[id]()).draw(wrap, container, spec, th);
    } catch (e) {
      console.error(e);
      if (id === 'lw') return;
      container.replaceChildren();
      wrap.appendChild(h('div', { class: 'muted small', text: `圖表引擎載入失敗，已改用預設引擎（${e.message || e}）` }));
      handle = await (await LOADERS.lw()).draw(wrap, container, spec, th);
    }
    if (myGen !== gen) { handle?.dispose(); return; }
    entry.handle = handle;
  };
  live.push(entry);
  pending.push(run());
  return wrap;
}

/** 長條圖。series: [{name, values, cls}]；stacked 時由下往上堆疊。 */
export const barChart = (opts) => make('bar', opts);
/** 折線（面積）圖。 */
export const lineChart = (opts) => make('line', opts);

// ---- 列印：Canvas 引擎轉成圖片（以淺色文字），SVG 引擎等比縮放 ----
window.addEventListener('beforeprint', () => {
  for (const e of live) {
    const hd = e.handle;
    if (!hd) continue;
    try {
      if (hd.snapshot) { e.img.src = hd.snapshot(LIGHT); e.wrap.classList.add('snap'); }
      hd.beforePrint?.();
    } catch (err) { console.warn('列印前處理圖表失敗', err); }
  }
});
window.addEventListener('afterprint', () => {
  for (const e of live) {
    e.wrap.classList.remove('snap');
    e.img.removeAttribute('src');
    try { e.handle?.afterPrint?.(); } catch { /* 忽略 */ }
  }
});
