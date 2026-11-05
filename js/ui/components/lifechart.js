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
 * extra：額外的區間（例如育兒、35 歲以上生產風險），格式同 STAGES。
 * @param {{age:number, endAge:number, retireAge:number, extra?:{name:string,from:number,to:number}[]}} o
 */
export function lifeTimeline({ age, endAge, retireAge, extra = [] }) {
  const ALL = [...STAGES, ...extra];
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
  const lanes = ALL.filter((st) => st.from < end).map((st, i) => {
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
  const label = `人生時間軸：現在 ${age1(age)}；${segs.map((s) => `${s.name} ${s.years.toFixed(1)} 年`).join('，')}；平均預期壽命到 ${age1(end)}。下方標出一般學制的典型年齡：${ALL.map((st) => `${st.name} ${st.from} 到 ${st.to} 歲`).join('、')}`;
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }, ...bars, ...inner, ...ticks, ...lanes);
  const legend = h('div', { class: 'legend' }, segs.map((s) => h('span', null, h('i', { class: `sw ${s.cls}` }), `${s.name} ${s.years.toFixed(1)} 年`)));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '人生時間軸（平均餘命，不是個人預測）' }), legend, pic,
    h('p', { class: 'note', text: '下方的學制與打工度假年齡是常見的概略區間，實際因個人學歷、入學時間與各國簽證規定而不同（打工度假多數國家為 18–30 歲）。灰色是已經過去的時期。' }));
}

/**
 * 滑鼠移過／手指滑過：十字線、左側 Y 軸金額標籤、下方年齡標籤，以及列出各條線金額的提示框。
 * 只用 SVG 屬性與 CSS class（不使用 inline style，符合 CSP）。
 */
function hoverLayer({ M, W, H, x0, endAge, x, y, series }) {
  const g = svg('g', { class: 'lc-hover', visibility: 'hidden', 'pointer-events': 'none' });
  const vline = svg('line', { class: 'lc-cross', y1: M.t, y2: H - M.b });
  const hline = svg('line', { class: 'lc-cross', x1: M.l, x2: W - M.r });
  const yBox = svg('rect', { class: 'lc-tag', height: 16, rx: 3 });
  const yTxt = txt('lc-tagtxt', { 'text-anchor': 'start' }, '');
  const xBox = svg('rect', { class: 'lc-tag', height: 16, rx: 3 });
  const xTxt = txt('lc-tagtxt', { 'text-anchor': 'middle' }, '');
  const tipBox = svg('rect', { class: 'lc-tip', rx: 4 });
  const dots = series.map((sr) => svg('circle', { class: `lc-hdot ${sr.cls}`, r: 4 }));
  const lines = series.map(() => txt('lc-tiptxt', {}, ''));
  const head = txt('lc-tiptxt strong', {}, '');
  g.append(vline, hline, yBox, yTxt, xBox, xTxt, tipBox, head, ...lines, ...dots);
  const overlay = svg('rect', { class: 'lc-overlay', x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: 'transparent' });
  const move = (e) => {
    const svgEl = overlay.ownerSVGElement;
    const r = svgEl.getBoundingClientRect();
    if (!r.width) return;
    const px = ((e.clientX - r.left) * W) / r.width;
    let a = x0 + ((px - M.l) * (endAge - x0)) / (W - M.l - M.r);
    a = Math.min(Math.max(a, x0), endAge);
    const vals = series.map((sr) => sr.at(a));
    const cx = x(a);
    const main = vals[0];
    vline.setAttribute('x1', cx.toFixed(1)); vline.setAttribute('x2', cx.toFixed(1));
    hline.setAttribute('y1', y(main).toFixed(1)); hline.setAttribute('y2', y(main).toFixed(1));
    const yl = twd(main);
    yTxt.textContent = yl;
    const yw = yl.length * 7.5 + 10;
    yBox.setAttribute('width', yw); yBox.setAttribute('x', (M.l + 2).toFixed(1)); yBox.setAttribute('y', (y(main) - 8).toFixed(1));
    yTxt.setAttribute('x', (M.l + 7).toFixed(1)); yTxt.setAttribute('y', (y(main) + 4).toFixed(1));
    const xl = age1(a);
    xTxt.textContent = xl;
    const xw = 56;
    const bx = Math.min(Math.max(cx, M.l + xw / 2), W - M.r - xw / 2);
    xBox.setAttribute('width', xw); xBox.setAttribute('x', (bx - xw / 2).toFixed(1)); xBox.setAttribute('y', H - M.b + 1);
    xTxt.setAttribute('x', bx.toFixed(1)); xTxt.setAttribute('y', H - M.b + 13);
    dots.forEach((d, i) => { d.setAttribute('cx', cx.toFixed(1)); d.setAttribute('cy', y(vals[i]).toFixed(1)); });
    head.textContent = xl;
    lines.forEach((t, i) => { t.textContent = `${series[i].name}：${twd(vals[i])}`; });
    const wOf = (str) => [...str].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 13 : 7.5), 0);
    const tw = Math.max(...lines.map((t) => wOf(t.textContent)), 60) + 18;
    const th = 22 + lines.length * 16;
    const tx = Math.max(M.l + 2, cx + 12 + tw > W - M.r ? cx - 12 - tw : cx + 12);
    const ty = M.t + 4;
    tipBox.setAttribute('width', tw); tipBox.setAttribute('height', th); tipBox.setAttribute('x', tx.toFixed(1)); tipBox.setAttribute('y', ty);
    head.setAttribute('x', (tx + 8).toFixed(1)); head.setAttribute('y', ty + 15);
    lines.forEach((t, i) => { t.setAttribute('x', (tx + 8).toFixed(1)); t.setAttribute('y', ty + 31 + i * 16); });
    g.setAttribute('visibility', 'visible');
  };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerdown', (e) => {
    try { overlay.setPointerCapture(e.pointerId); } catch { /* 略過 */ }
    move(e);
  });
  // 長按／拖曳不要選取文字，也不要跳出系統選單（觸控長按會觸發 contextmenu）
  for (const ev of ['selectstart', 'contextmenu', 'dragstart']) overlay.addEventListener(ev, (e) => e.preventDefault());
  overlay.addEventListener('mousedown', (e) => e.preventDefault());
  overlay.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
  overlay.addEventListener('pointercancel', () => g.setAttribute('visibility', 'hidden'));
  return { g, overlay };
}

/**
 * 累積收入曲線：從現在到退休，每月領固定月收入，累積值是一條斜線；退休後持平。
 * @param {{age:number, endAge:number, retireAge:number, monthly:number}} o
 */
export function incomeCurve({ age, endAge, retireAge, monthly, startAge = 0, baseMonthly = 0, baseFrom = 18 }) {
  const M = { l: 48, r: 12, t: 14, b: 32 };
  const H = 240;
  const stop = Math.max(Math.min(retireAge, endAge), age);
  const total = monthly * 12 * (stop - age);
  if (!(total > 0) || endAge - age < 0.1) return h('p', { class: 'note', text: '累積收入曲線：目前沒有可畫的收入（月收入為 0 或已過退休年齡）。' });
  const cum = (a, from, m) => m * 12 * Math.max(Math.min(a, stop) - from, 0);
  const useBase = baseMonthly > 0 && baseFrom < stop;
  const base = useBase ? cum(stop, baseFrom, baseMonthly) : 0;
  const late = startAge > age && startAge < stop ? cum(stop, startAge, monthly) : null;
  const x0 = useBase ? Math.min(age, baseFrom) : age;
  const { max, ticks } = niceScale(Math.max(total, base));
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (a) => M.l + (iw * (a - x0)) / (endAge - x0);
  const y = (v) => M.t + ih - (ih * v) / max;
  const P = (pts) => `M${pts.map(([a, v]) => `${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('L')}`;
  const mainPts = [[age, 0], [stop, total], [endAge, total]];
  const area = `${P(mainPts)}L${x(endAge).toFixed(1)},${y(0).toFixed(1)}Z`;
  const grid = ticks.map((t) => svg('g', null,
    svg('line', { class: 'lc-grid', x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }),
    txt('lc-axis', { x: M.l - 5, y: y(t) + 3.5, 'text-anchor': 'end' }, compact(t) || '0')));

  // X 軸：每 1 歲一個小刻度，每 5 歲一個長刻度與直線，標籤每 5（跨度大時每 10）歲
  const span = endAge - x0;
  const labelStep = span > 45 ? 10 : 5;
  const xAxis = [];
  for (let a = Math.ceil(x0); a <= endAge; a++) {
    const major = a % 5 === 0;
    xAxis.push(svg('line', { class: major ? 'lc-xtick major' : 'lc-xtick', x1: x(a).toFixed(1), x2: x(a).toFixed(1), y1: y(0), y2: y(0) + (major ? 6 : 3) }));
    if (major) xAxis.push(svg('line', { class: 'lc-vgrid', x1: x(a).toFixed(1), x2: x(a).toFixed(1), y1: M.t, y2: y(0) }));
    if (a % labelStep === 0) xAxis.push(txt('lc-axis', { x: x(a).toFixed(1), y: H - 14, 'text-anchor': 'middle' }, String(a)));
  }
  xAxis.push(txt('lc-axis', { x: W - M.r, y: H - 2, 'text-anchor': 'end' }, '年齡（歲）；每小格 1 歲'));

  const today = age > x0 + 0.5 ? svg('g', null,
    svg('line', { class: 'lc-today', x1: x(age).toFixed(1), x2: x(age).toFixed(1), y1: M.t, y2: y(0) }),
    txt('lc-axis', { x: (x(age) + 3).toFixed(1), y: M.t + 9, 'text-anchor': 'start' }, '今天')) : null;

  const baseLine = useBase ? svg('path', { class: 'lc-line base', d: P([[baseFrom, 0], [stop, base], [endAge, base]]) }) : null;
  const lateLine = late === null ? null : svg('path', { class: 'lc-line late', d: P([[age, 0], [startAge, 0], [stop, late], [endAge, late]]) });
  const dot = svg('circle', { class: 'lc-dot', cx: x(stop).toFixed(1), cy: y(total).toFixed(1), r: 4 });
  const nearEnd = stop > endAge - (endAge - x0) * 0.3;
  const note = txt('lc-in2', { x: Math.min(x(stop), W - M.r - 4).toFixed(1), y: (y(total) - 8).toFixed(1), 'text-anchor': nearEnd ? 'end' : 'middle' }, twd(total));
  const baseNote = useBase && Math.abs(y(base) - y(total)) > 16 ? txt('lc-in2 base', { x: Math.min(x(stop), W - M.r - 4).toFixed(1), y: (y(base) - 8).toFixed(1), 'text-anchor': nearEnd ? 'end' : 'middle' }, twd(base)) : null;

  const label = `累積收入曲線：從 ${age1(age)} 開始月收入 ${twd(monthly)}，到 ${age1(stop)} 累積 ${twd(total)}`
    + (useBase ? `；對照：從 ${baseFrom} 歲就領基本工資 ${twd(baseMonthly)}，到 ${age1(stop)} 累積 ${twd(base)}` : '')
    + (late !== null ? `；從 ${startAge} 歲才開始則累積 ${twd(late)}` : '') + `；橫軸為年齡，每 1 歲一小格，到 ${age1(endAge)}`;
  const hover = hoverLayer({
    M, W, H, x0, endAge, x, y, iw,
    series: [
      { name: '從現在開始', cls: 'main', at: (a) => cum(a, age, monthly) },
      ...(useBase ? [{ name: `${baseFrom} 歲起基本工資`, cls: 'base', at: (a) => cum(a, baseFrom, baseMonthly) }] : []),
      ...(late !== null ? [{ name: `${startAge} 歲才開始`, cls: 'late', at: (a) => cum(a, startAge, monthly) }] : []),
    ],
  });
  const pic = svg('svg', { class: 'lc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    ...grid, svg('path', { class: 'lc-area', d: area }), baseLine, svg('path', { class: 'lc-line', d: P(mainPts) }), lateLine,
    svg('line', { class: 'lc-base', x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }), ...xAxis, today, dot, note, baseNote, hover.g, hover.overlay);

  const legend = h('div', { class: 'legend' },
    h('span', null, h('i', { class: 'sw sw0' }), `從現在開始（月收入 ${twd(monthly)}）`),
    useBase ? h('span', null, h('i', { class: 'sw lc-base-sw' }), `對照：${baseFrom} 歲起領基本工資 ${twd(baseMonthly)}（點線）`) : null,
    late === null ? null : h('span', null, h('i', { class: 'sw lc-late-sw' }), `從 ${startAge} 歲才開始（虛線）`));

  const ages = [];
  for (let a = Math.ceil(x0 / 5) * 5; a < stop; a += 5) ages.push(a);
  ages.push(stop);
  const rows = ages.map((a) => ({ a, now: cum(a, age, monthly), base: useBase ? cum(a, baseFrom, baseMonthly) : null, late: late === null ? null : cum(a, startAge, monthly) }));
  const cols = [{ label: '年齡', get: (r) => age1(r.a) }, { label: '從現在開始', get: (r) => r.now, fmt: (v) => twd(v), num: true }];
  if (useBase) cols.push({ label: `${baseFrom} 歲起基本工資`, get: (r) => r.base, fmt: (v) => twd(v), num: true });
  if (late !== null) cols.push({ label: `${startAge} 歲才開始`, get: (r) => r.late, fmt: (v) => twd(v), num: true });
  const table = h('details', { class: 'ar-table no-print' }, h('summary', { text: '以表格查看數字' }), dataTable({ label: '累積收入（數字）', cols, rows }));
  return h('figure', { class: 'lc-fig' }, h('figcaption', { text: '累積收入曲線（月收入固定、不含調薪與通膨）' }), legend, pic, table);
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
