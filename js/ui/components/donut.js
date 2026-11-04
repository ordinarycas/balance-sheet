// 比例圖（甜甜圈／比例條）：自繪 SVG／HTML，不依賴圖表引擎，手機可讀、列印為向量；
// 附文字圖例與百分比，不只靠顏色辨識。
import { h, svg } from '../dom.js';
import { twd } from '../fmt.js';

const R = 40;
const C = 2 * Math.PI * R;
const pctText = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

function legendList(data, total) {
  return h('ul', { class: 'donut-list' }, data.map((s, i) => h('li', null,
    h('i', { class: `sw sw${s.idx ?? i % 8}` }), h('span', { class: 'dl', text: s.label }),
    h('span', { class: 'dv', text: `${twd(s.value)}　${pctText(s.value, total)}` }))));
}

/** @param {{title:string, slices:Array<{label:string,value:number}>, center?:string}} o */
export function donut({ title, slices, center }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);
  if (!total) return h('p', { class: 'note', text: `${title}：目前沒有資料` });
  let acc = 0;
  const rings = data.map((s, i) => {
    const len = (s.value / total) * C;
    const c = svg('circle', { class: `dn dn${i % 8}`, cx: 60, cy: 60, r: R, fill: 'none', 'stroke-width': 22, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -acc });
    acc += len;
    return c;
  });
  const label = `${title}：${data.map((s) => `${s.label} ${pctText(s.value, total)}`).join('、')}`;
  const c1 = svg('text', { class: 'donut-c1', x: 60, y: 58, 'text-anchor': 'middle' });
  c1.textContent = center ?? twd(total);
  const c2 = svg('text', { class: 'donut-c2', x: 60, y: 70, 'text-anchor': 'middle' });
  c2.textContent = '合計';
  const pic = svg('svg', { class: 'donut-svg', viewBox: '0 0 120 120', role: 'img', 'aria-label': label },
    svg('g', { transform: 'rotate(-90 60 60)' }, ...rings), c1, c2);
  return h('figure', { class: 'donut' }, h('figcaption', { text: title }), h('div', { class: 'donut-body' }, pic, legendList(data, total)));
}

/** 單條 100% 堆疊比例條。parts: [{label, value, idx}]（idx 決定顏色 0–7）。 */
export function ratioBar({ title, parts }) {
  const data = parts.filter((p) => p.value > 0);
  const total = data.reduce((a, p) => a + p.value, 0);
  if (!total) return h('p', { class: 'note', text: `${title}：目前沒有資料` });
  const bar = h('div', { class: 'ratiobar', role: 'img', 'aria-label': `${title}：${data.map((p) => `${p.label} ${pctText(p.value, total)}`).join('、')}` },
    data.map((p, i) => { const seg = h('span', { class: `seg sw${p.idx ?? i % 8}` }); seg.style.width = `${(p.value / total) * 100}%`; return seg; }));
  return h('figure', { class: 'donut' }, h('figcaption', { text: title }), bar, legendList(data, total));
}
