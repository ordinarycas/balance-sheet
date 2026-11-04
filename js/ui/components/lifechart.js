// P17 的圖表（自繪 SVG，不依賴圖表引擎）：人生時間軸、累積收入曲線、資源增減（瀑布）圖。
// 每張圖都有文字說明（aria-label）與可展開的數字表，不只靠顏色辨識。數字全部來自 core/lifetime.js 的計算結果。
import { h, svg } from '../dom.js';
import { twd, compact } from '../fmt.js';
import { dataTable } from './table.js';
import { niceScale } from '../../core/chartdata.js';

const W = 420;
const txt = (cls, attrs, s) => { const t = svg('text', { class: cls, ...attrs }); t.textContent = s; return t; };
const age1 = (v) => `${v.toFixed(1)} 歲`;

/** 一般學制與時期的「典型」年齡區間（概略；實際會因個人學歷、入學與服役等而不同）。 */
export const STAGES = [
  { name: '國中', from: 12, to: 15 },
  { name: '高中', from: 15, to: 18 },
  { name: '五專', from: 15, to: 20 },
  { name: '大學', from: 18, to: 22 },
  { name: '二技', from: 20, to: 22 },
  { name: '研究所', from: 22, to: 24 },
  { name: '30 歲前打工度假', from: 18, to: 30 },
  { name: '未成年受僱（需法定代理人同意書）', from: 15, to: 18 },
];

/**
 * 人生時間軸：一條橫條，依序是「已走過」「還在工作」「退休後」；下方的標籤高低錯開，再接著一排排的學制／時期區間。
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

  const bars = segs.map((s) => svg('rect', { class: s.cls, x: x(s.from).toFixed(1), y: 20, width: Math.max(x(s.to) - x(s.from), 1).toFixed(1), height: 30 }));
  const inner = segs.filter((s) => x(s.to) - x(s.from) > 52).map((s) => txt('lc-in', { x: ((x(s.from) + x(s.to)) / 2).toFixed(1), y: 39, 'text-anchor': 'middle' }, `${s.years.toFixed(1)} 年`));

  // 軸上的標籤：太近的交替放在上下兩層，文字不重疊
  const marks = [
    { a: 0, t: '0 歲', anchor: 'start' },
    { a: age, t: `今天 ${age.toFixed(0)} 歲`, anchor: age < end * 0.12 ? 'start' : 'middle' },
    ...(work > 0.05 && retireAge < end ? [{ a: retireAge, t: `退休 ${retireAge} 歲`, anchor: 'middle' }] : []),
    { a: end, t: `${end.toFixed(0)} 歲`, anchor: 'end' },
  ];
  const lastEnd = [-1e9, -1e9]; // 每一層上一個標籤的右緣
  const rowOf = (m) => {
    const w = m.t.length * 8 + 4;
    const left = m.anchor === 'start' ? x(m.a) : m.anchor === 'end' ? x(m.a) - w : x(m.a) - w / 2;
    const row = left > lastEnd[0] + 4 ? 0 : 1;
    lastEnd[row] = Math.max(lastEnd[row], left + w);
    return row;
  };
  const ticks = marks.map((m) => {
    const row = rowOf(m);
    return svg('g', null,
      svg('line', { class: 'lc-tick', x1: x(m.a).toFixed(1), x2: x(m.a).toFixed(1), y1: 14, y2: 56 + row * 12 }),
      txt('lc-axis', { x: x(m.a).toFixed(1), y: 66 + row * 12, 'text-anchor': m.anchor }, m.t));
  });

  // 學制／時期：每項一排，標籤放在區間右側（放不下就放左側），不與其他排重疊
  const LANE_Y = 96;
  const laneH = 17;
  const lanes = STAGES.filter((st) => st.from < end).map((st, i) => {
    const y = LANE_Y + i * laneH;
    const x1 = x(st.from);
    const x2 = x(Math.min(st.to, end));
    const w = st.name.length * 12.5 + 56;
    const right = x2 + 4 + w <= W - 4;
    const past = st.to <= age;
    return svg('g', { class: past ? 'lc-lane past' : 'lc-lane' },
      svg('rect', { class: 'lc-stage', x: x1.toFixed(1), y, width: Math.max(x2 - x1, 2).toFixed(1), height: 8, rx: 3 }),
      txt('lc-stg', { x: (right ? x2 + 4 : x1 - 4).toFixed(1), y: y + 8.5, 'text-anchor': right ? 'start' : 'end' }, `${st.name} ${st.from}–${st.to} 歲`));
  });
  const H = LANE_Y + lanes.length * laneH + 4;
  const label = `人生時間軸：現在 ${age1(age)}；${segs.map((s) => `${s.name} ${s.years.toFixed(1)} 年`).join('，')}；平均預期壽命到 ${age1(end)}。下方標出一般學制的典型年齡：${STAGES.map((st) => `${st.name} ${st.from} 到 ${st.to} 歲`).join('、')}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }, ...bars, ...inner, ...ticks, ...lanes);
  const legend = h('div', { class: 'legend' }, segs.map((s) => h('span', null, h('i', { class: `sw ${s.cls}` }), `${s.name} ${s.years.toFixed(1)} 年`)));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '人生時間軸（平均餘命，不是個人預測）' }), legend, pic,
    h('p', { class: 'note', text: '下方的學制與打工度假年齡是常見的概略區間，實際因個人學歷、入學時間與各國簽證規定而不同（打工度假多數國家為 18–30 歲）。灰色是已經過去的時期。' }));
}

/**
 * 累積收入曲線：從現在到退休，每月領固定月收入，累積值是一條斜線；退休後持平。
 * @param {{age:number, endAge:number, retireAge:number, monthly:number}} o
 */
export function incomeCurve({ age, endAge, retireAge, monthly, startAge = 0 }) {
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
  const late = startAge > age && startAge < stop ? monthly * 12 * (stop - startAge) : null;
  const lateLine = late === null ? null : svg('path', { class: 'lc-line late', d: `M${x(age).toFixed(1)},${y(0).toFixed(1)}L${x(startAge).toFixed(1)},${y(0).toFixed(1)}L${x(stop).toFixed(1)},${y(late).toFixed(1)}L${x(endAge).toFixed(1)},${y(late).toFixed(1)}` });
  const dot = svg('circle', { class: 'lc-dot', cx: x(stop).toFixed(1), cy: y(total).toFixed(1), r: 4 });
  const note = txt('lc-in2', { x: Math.min(x(stop), W - M.r - 4).toFixed(1), y: (y(total) - 8).toFixed(1), 'text-anchor': stop > endAge - (endAge - age) * 0.3 ? 'end' : 'middle' }, twd(total));
  const label = `累積收入曲線：從 ${age1(age)} 到 ${age1(stop)}，月收入 ${twd(monthly)}，累積到 ${twd(total)}，之後持平到 ${age1(endAge)}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    ...grid, svg('path', { class: 'lc-area', d: area }), svg('path', { class: 'lc-line', d: line }), lateLine,
    svg('line', { class: 'lc-base', x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }), ...xl, dot, note);
  const rows = [age, age + (stop - age) / 4, age + (stop - age) / 2, age + ((stop - age) * 3) / 4, stop].map((a) => ({ a, v: monthly * 12 * (a - age) }));
  const table = h('details', { class: 'ar-table no-print' }, h('summary', { text: '以表格查看數字' }),
    dataTable({ label: '累積收入（數字）', cols: [{ label: '年齡', get: (r) => age1(r.a) }, { label: '累積收入', get: (r) => r.v, fmt: (v) => twd(v), num: true }], rows }));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '累積收入曲線（月收入固定、不含調薪與通膨）' }), late === null ? null : h('div', { class: 'legend' }, h('span', null, h('i', { class: 'sw sw0' }), '從現在開始'), h('span', null, h('i', { class: 'sw lc-late-sw' }), `從 ${startAge} 歲才開始（虛線）`)), pic, table);
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
