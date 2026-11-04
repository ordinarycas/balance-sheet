// P17 的圖表（自繪 SVG，不依賴圖表引擎）：人生時間軸、累積收入曲線、資源增減（瀑布）圖。
// 每張圖都有文字說明（aria-label）與可展開的數字表，不只靠顏色辨識。數字全部來自 core/lifetime.js 的計算結果。
import { h, svg } from '../dom.js';
import { twd, compact } from '../fmt.js';
import { dataTable } from './table.js';
import { niceScale } from '../../core/chartdata.js';

const W = 420;
const txt = (cls, attrs, s) => { const t = svg('text', { class: cls, ...attrs }); t.textContent = s; return t; };
const age1 = (v) => `${v.toFixed(1)} 歲`;

/**
 * 人生時間軸：一條橫條，依序是「已走過」「還在工作」「退休後」。
 * @param {{age:number, endAge:number, retireAge:number}} o
 */
export function lifeTimeline({ age, endAge, retireAge }) {
  const L = 12;
  const iw = W - L * 2;
  const end = Math.max(endAge, age + 0.1);
  const x = (a) => L + (iw * a) / end;
  const work = Math.max(Math.min(retireAge, end) - age, 0);
  const segs = [
    { cls: 'lc-past', name: '已走過', from: 0, to: age, years: age },
    { cls: 'lc-work', name: '退休前的工作期', from: age, to: age + work, years: work },
    { cls: 'lc-rest', name: '退休後', from: age + work, to: end, years: Math.max(end - age - work, 0) },
  ].filter((s) => s.years > 0.05);

  const bars = segs.map((s) => svg('rect', { class: s.cls, x: x(s.from).toFixed(1), y: 34, width: Math.max(x(s.to) - x(s.from), 1).toFixed(1), height: 30 }));
  const inner = segs.filter((s) => x(s.to) - x(s.from) > 52).map((s) => txt('lc-in', { x: ((x(s.from) + x(s.to)) / 2).toFixed(1), y: 53, 'text-anchor': 'middle' }, `${s.years.toFixed(1)} 年`));
  const marks = [
    { a: 0, t: '0 歲', anchor: 'start' },
    { a: age, t: `今天 ${age.toFixed(0)}`, anchor: age < end * 0.12 ? 'start' : 'middle' },
    ...(work > 0.05 && retireAge < end ? [{ a: retireAge, t: `退休 ${retireAge}`, anchor: 'middle' }] : []),
    { a: end, t: `${end.toFixed(0)} 歲`, anchor: 'end' },
  ];
  const ticks = marks.map((m) => svg('g', null,
    svg('line', { class: 'lc-tick', x1: x(m.a).toFixed(1), x2: x(m.a).toFixed(1), y1: 28, y2: 70 }),
    txt('lc-axis', { x: x(m.a).toFixed(1), y: 82, 'text-anchor': m.anchor }, m.t)));
  // 勞基法：15 歲起可受僱（童工）、18 歲起不受未成年工限制；只標在已經走過或還沒走到的位置，避免和其他標籤重疊
  const near = (a) => marks.some((m) => Math.abs(x(m.a) - x(a)) < 34);
  const legal = [15, 18].filter((a) => a < end && !near(a));
  const ageTicks = legal.map((a) => svg('g', null,
    svg('line', { class: 'lc-tick', x1: x(a).toFixed(1), x2: x(a).toFixed(1), y1: 64, y2: 72 }),
    txt('lc-axis lc-law', { x: x(a).toFixed(1), y: 94, 'text-anchor': 'middle' }, a === 15 ? '15 歲可受僱' : '18 歲成年')));
  const label = `人生時間軸：現在 ${age1(age)}；${segs.map((s) => `${s.name} ${s.years.toFixed(1)} 年`).join('，')}；平均預期壽命到 ${age1(end)}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} 104`, role: 'img', 'aria-label': label }, ...bars, ...inner, ...ticks, ...ageTicks);
  const legend = h('div', { class: 'legend' }, segs.map((s) => h('span', null, h('i', { class: `sw ${s.cls}` }), `${s.name} ${s.years.toFixed(1)} 年`)));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '人生時間軸（平均餘命，不是個人預測）' }), legend, pic);
}

/**
 * 累積收入曲線：從現在到退休，每月領固定月收入，累積值是一條斜線；退休後持平。
 * @param {{age:number, endAge:number, retireAge:number, monthly:number}} o
 */
export function incomeCurve({ age, endAge, retireAge, monthly }) {
  const M = { l: 48, r: 12, t: 12, b: 26 };
  const H = 220;
  const stop = Math.max(Math.min(retireAge, endAge), age);
  const total = monthly * 12 * (stop - age);
  if (!(total > 0) || endAge - age < 0.1) return h('p', { class: 'note', text: '累積收入曲線：目前沒有可畫的收入（月收入為 0 或已過退休年齡）。' });
  const { max, ticks } = niceScale(total);
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (a) => M.l + (iw * (a - age)) / (endAge - age);
  const y = (v) => M.t + ih - (ih * v) / max;
  const area = `M${x(age).toFixed(1)},${y(0).toFixed(1)}L${x(stop).toFixed(1)},${y(total).toFixed(1)}L${x(endAge).toFixed(1)},${y(total).toFixed(1)}L${x(endAge).toFixed(1)},${y(0).toFixed(1)}Z`;
  const line = `M${x(age).toFixed(1)},${y(0).toFixed(1)}L${x(stop).toFixed(1)},${y(total).toFixed(1)}L${x(endAge).toFixed(1)},${y(total).toFixed(1)}`;
  const grid = ticks.map((t) => svg('g', null,
    svg('line', { class: 'lc-grid', x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }),
    txt('lc-axis', { x: M.l - 5, y: y(t) + 3.5, 'text-anchor': 'end' }, compact(t) || '0')));
  const xs = [{ a: age, anchor: 'start' }, ...(stop > age + 1 && stop < endAge - 1 ? [{ a: stop, anchor: 'middle' }] : []), { a: endAge, anchor: 'end' }];
  const xl = xs.map((p) => txt('lc-axis', { x: x(p.a).toFixed(1), y: H - 8, 'text-anchor': p.anchor }, `${p.a.toFixed(0)} 歲`));
  const dot = svg('circle', { class: 'lc-dot', cx: x(stop).toFixed(1), cy: y(total).toFixed(1), r: 4 });
  const note = txt('lc-in2', { x: Math.min(x(stop), W - M.r - 4).toFixed(1), y: (y(total) - 8).toFixed(1), 'text-anchor': stop > endAge - (endAge - age) * 0.3 ? 'end' : 'middle' }, twd(total));
  const label = `累積收入曲線：從 ${age1(age)} 到 ${age1(stop)}，月收入 ${twd(monthly)}，累積到 ${twd(total)}，之後持平到 ${age1(endAge)}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    ...grid, svg('path', { class: 'lc-area', d: area }), svg('path', { class: 'lc-line', d: line }),
    svg('line', { class: 'lc-base', x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }), ...xl, dot, note);
  const rows = [age, age + (stop - age) / 4, age + (stop - age) / 2, age + ((stop - age) * 3) / 4, stop].map((a) => ({ a, v: monthly * 12 * (a - age) }));
  const table = h('details', { class: 'ar-table no-print' }, h('summary', { text: '以表格查看數字' }),
    dataTable({ label: '累積收入（數字）', cols: [{ label: '年齡', get: (r) => age1(r.a) }, { label: '累積收入', get: (r) => r.v, fmt: (v) => twd(v), num: true }], rows }));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '累積收入曲線（月收入固定、不含調薪與通膨）' }), pic, table);
}

/**
 * 資源增減（瀑布）圖：人生最低收入 ＋ 股票資產 － 借款 ＝ 還清後總資源 －（餘命內固定支出）。
 * @param {{label:string, from:number, to:number, kind:'pos'|'neg'|'sum'}[]} steps
 */
export function waterfall(steps, title = '資源增減圖') {
  const M = { l: 12, r: 12 };
  const rowH = 44;
  const H = steps.length * rowH + 8;
  const lo = Math.min(0, ...steps.flatMap((s) => [s.from, s.to]));
  const hi = Math.max(0, ...steps.flatMap((s) => [s.from, s.to]));
  const span = hi - lo || 1;
  const iw = W - M.l - M.r;
  const x = (v) => M.l + (iw * (v - lo)) / span;
  const kids = [svg('line', { class: 'lc-base', x1: x(0).toFixed(1), x2: x(0).toFixed(1), y1: 0, y2: H })];
  steps.forEach((s, i) => {
    const top = i * rowH + 6;
    const a = Math.min(s.from, s.to);
    const b = Math.max(s.from, s.to);
    const delta = s.to - s.from;
    kids.push(txt('lc-lab', { x: M.l, y: top + 11 }, s.label));
    kids.push(svg('rect', { class: `lc-wf ${s.kind === 'sum' ? (s.to < 0 ? 'lc-neg' : 'lc-sumbar') : delta < 0 ? 'lc-neg' : 'lc-pos'}`, x: x(a).toFixed(1), y: top + 17, width: Math.max(x(b) - x(a), 1.5).toFixed(1), height: 18 }));
    const right = x(b) + 6 > W - 110;
    kids.push(txt('lc-val', { x: (right ? x(a) - 6 : x(b) + 6).toFixed(1), y: top + 30, 'text-anchor': right ? 'end' : 'start' }, s.kind === 'sum' ? twd(s.to) : `${delta < 0 ? '－' : '＋'}${twd(Math.abs(delta))}`));
  });
  const label = `${title}：${steps.map((s) => `${s.label} ${twd(s.to - s.from)}`).join('；')}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }, ...kids);
  const table = h('details', { class: 'ar-table no-print' }, h('summary', { text: '以表格查看數字' }),
    dataTable({ label: `${title}（數字）`, cols: [{ label: '項目', get: (r) => r.label }, { label: '金額', get: (r) => (r.kind === 'sum' ? r.to : r.to - r.from), fmt: (v) => twd(v), num: true }], rows: steps }));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: title }), pic, table);
}
