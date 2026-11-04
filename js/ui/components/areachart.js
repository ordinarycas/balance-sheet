// 堆疊面積圖（自繪 SVG，不依賴圖表引擎）：手機可讀、列印為向量。
// 互動：滑鼠／觸控在圖上移動，或用下方「月份」滑桿（可用方向鍵）查看該月各系列金額；
// 另附可展開的資料表，不只靠顏色辨識。
import { h, svg } from '../dom.js';
import { twd, compact } from '../fmt.js';
import { dataTable } from './table.js';
import { stackTotals, niceScale } from '../../core/chartdata.js';

const W = 420;
const H = 230;
const M = { l: 46, r: 10, t: 10, b: 24 };

/**
 * @param {{title:string, labels:string[], series:{name:string, values:number[]}[]}} o
 */
export function stackedArea({ title, labels, series }) {
  const n = labels.length;
  if (!series.length || n < 2) return h('p', { class: 'note', text: `${title}：目前沒有資料` });
  const totals = stackTotals(series);
  const { max, ticks } = niceScale(Math.max(...totals));
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (k) => M.l + (iw * k) / (n - 1);
  const y = (v) => M.t + ih - (ih * v) / max;

  // 由下往上累加
  const lower = new Array(n).fill(0);
  const areas = series.map((s, i) => {
    const top = s.values.map((v, k) => lower[k] + (v ?? 0));
    const d = `M${top.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('L')}L${lower.map((v, k) => `${x(n - 1 - k).toFixed(1)},${y(lower[n - 1 - k]).toFixed(1)}`).join('L')}Z`;
    for (let k = 0; k < n; k++) lower[k] = top[k];
    return svg('path', { class: `ar ar${i % 8}`, d });
  });

  const grid = ticks.map((t) => {
    const g = svg('g', null, svg('line', { class: 'ar-grid', x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
    const tx = svg('text', { class: 'ar-axis', x: M.l - 5, y: y(t) + 3.5, 'text-anchor': 'end' });
    tx.textContent = compact(t) || '0';
    g.appendChild(tx);
    return g;
  });
  const step = Math.max(1, Math.round((n - 1) / 5));
  const xl = [];
  for (let k = 0; k < n; k += step) {
    const tx = svg('text', { class: 'ar-axis', x: x(k), y: H - 7, 'text-anchor': k === 0 ? 'start' : k >= n - 1 ? 'end' : 'middle' });
    tx.textContent = labels[k];
    xl.push(tx);
  }

  const guide = svg('line', { class: 'ar-guide', x1: x(0), x2: x(0), y1: M.t, y2: M.t + ih });
  const dot = svg('circle', { class: 'ar-dot', cx: x(0), cy: y(totals[0]), r: 3 });
  const label = `${title}：${labels[0]} 合計 ${twd(totals[0])}，${labels[n - 1]} 合計 ${twd(totals[n - 1])}；${series.map((s) => s.name).join('、')}`;
  const pic = svg('svg', { class: 'ar-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    ...grid, ...areas, svg('line', { class: 'ar-base', x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }), ...xl, guide, dot);

  const readout = h('div', { class: 'ar-readout', 'aria-live': 'polite' });
  const slider = h('input', { type: 'range', class: 'ar-range no-print', min: 0, max: n - 1, step: 1, value: n - 1, 'aria-label': `${title}：選擇月份查看金額` });
  const show = (k) => {
    const i = Math.min(Math.max(k, 0), n - 1);
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(totals[i]));
    slider.value = String(i);
    readout.replaceChildren(
      h('strong', { text: `${labels[i]}　合計 ${twd(totals[i])}` }),
      h('ul', { class: 'ar-list' }, series.map((s, j) => h('li', null, h('i', { class: `sw sw${j % 8}` }), h('span', { text: s.name }), h('span', { class: 'dv', text: twd(s.values[i] ?? 0) })))));
  };
  slider.addEventListener('input', () => show(Number(slider.value)));
  const fromPointer = (e) => {
    const r = pic.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    show(Math.round(((px - M.l) / iw) * (n - 1)));
  };
  pic.addEventListener('pointermove', fromPointer);
  pic.addEventListener('pointerdown', fromPointer);
  show(n - 1);

  const legend = h('div', { class: 'legend' }, series.map((s, i) => h('span', null, h('i', { class: `sw sw${i % 8}` }), s.name)));
  const table = h('details', { class: 'ar-table no-print' },
    h('summary', { text: '以表格查看數字' }),
    dataTable({
      label: `${title}（數字）`,
      cols: [{ label: '月份', get: (r) => r.label }, ...series.map((s, j) => ({ label: s.name, get: (r) => r.values[j], fmt: (v) => twd(v), num: true })), { label: '合計', get: (r) => r.total, fmt: (v) => twd(v), num: true }],
      rows: labels.map((l, k) => ({ label: l, values: series.map((s) => s.values[k] ?? 0), total: totals[k] })),
    }));
  return h('figure', { class: 'ar-fig' }, h('figcaption', { text: title }), legend, pic, slider, readout, table);
}
