// P03 月薪情境與雪崩法模擬
import { h } from '../dom.js';
import { twd } from '../fmt.js';
import { dataTable, section } from '../components/table.js';
import { barChart, legend } from '../components/chart.js';
import { numField, labeled, button, deleteButton, choiceField } from '../components/forms.js';
import { virtualTable } from '../components/vtable.js';

let detailIdx = 0;

const METHOD = {
  pledge: '結餘優先償還質押借款本金（可部分還款）',
  amortizing: '超出月付金的結餘直接還本（月付金不變，期數縮短）',
  interest_only: '最後清償（年繳利息型，本金不攤還）',
};

export default function render(app) {
  const sal = app.model.salary;
  const st = app.state;
  const sc = sal.scenarios;
  const root = h('div', null,
    h('h1', { text: '月薪情境' }),
    h('p', { class: 'sub', text: '以不同稅後月薪試算每月結餘，並用「雪崩法」（利率高者優先）模擬最長 120 個月的提前還款。' }));

  // 輸入
  const inputs = h('div', { class: 'card no-print' },
    h('div', { class: 'row' },
      ...st.salary.scenarios.map((v, i) => h('div', { class: 'row' },
        labeled(`情境 ${i + 1} 月薪`, numField({ value: v, min: 0, mutate: (d, x) => { d.salary.scenarios[i] = x; } })),
        st.salary.scenarios.length > 1 ? deleteButton(() => app.commit((d) => { d.salary.scenarios.splice(i, 1); }), '移除情境') : null)),
      st.salary.scenarios.length < 8 ? button('＋ 新增情境', () => app.commit((d) => { d.salary.scenarios.push(Math.max(...d.salary.scenarios, 30000) + 5000); })) : null),
    h('div', { class: 'row' }, labeled('其他生活開銷（每月，負數）', numField({ value: st.salary.otherLiving, max: 0, mutate: (d, x) => { d.salary.otherLiving = x; } }), '例如餐費、交通；預設 0')));
  root.appendChild(inputs);

  // 表一
  const b = sal.budget;
  const head = ['項目', ...sc.map((s) => twd(s.salary))];
  const money = (v) => twd(-v);
  const lines = [
    ...b.items.map((it) => [it.label, ...sc.map(() => money(it.amount))]),
    ...b.must.map((it) => [it.label, ...sc.map(() => money(it.amount))]),
  ];
  const t1cols = head.map((label, i) => ({ label: i === 0 ? '項目' : `月薪 ${label}`, get: (r) => r[i], num: i > 0 }));
  root.appendChild(section('表一　各情境每月收支與結餘', dataTable({
    cols: t1cols,
    rows: lines,
    foot: [
      { cells: ['每月支出合計', ...sc.map(() => money(b.total))] },
      { cells: ['每月結餘', ...sc.map((s) => twd(s.balance))], cls: (v, c, i) => (i > 0 ? (sc[i - 1].balance < 0 ? 'bad' : 'good') : '') },
      { cells: ['支出占月薪比', ...sc.map((s) => (s.salary ? `${(s.ratio * 100).toFixed(1)}%` : '—'))] },
    ],
  }), h('p', { class: 'note', text: '必繳款：質押與保單以「餘額 × 年利率 ÷ 12」概算月息；攤還型借款用月付金。年繳固定費用按月攤提。' })));

  root.appendChild(section('各情境每月結餘', legend([{ cls: 's3', name: '每月結餘（負值為缺口）' }]),
    barChart({ labels: sc.map((s) => twd(s.salary).replace('NT$', '')), series: [{ name: '每月結餘', values: sc.map((s) => s.balance), cls: 's3' }], tipFmt: (v) => twd(v) })));

  // 表二
  root.appendChild(section('表二　雪崩法順位（依年利率高→低）', dataTable({
    cols: [
      { label: '順位', get: (_, i) => i + 1, center: true },
      { label: '債務', get: (d) => d.name },
      { label: '目前餘額', get: (d) => d.balance, fmt: (v) => twd(v), num: true },
      { label: '年利率', get: (d) => d.rate, fmt: (v) => `${(v * 100).toFixed(2)}%`, num: true },
      { label: '提前還款方式', get: (d) => METHOD[d.type], wrap: true },
    ],
    rows: sal.debts,
    empty: '目前沒有債務',
  }), h('p', { class: 'note', text: '順位由程式依目前利率自動排序；利率相同時質押優先。' })));

  // 表三
  const res = (label, f, cls) => ({ label, f, cls });
  const monthOr = (m) => m ?? '120個月內未還清';
  const rows3 = [
    res('首月可提前還款額', (s) => twd(s.firstExtra)),
    res('缺口月數', (s) => String(s.gapMonths)),
    res('累計缺口', (s) => twd(s.cumGap)),
    ...sal.debts.map((d, k) => res(`${d.name}還清月份`, (s) => monthOr(s.payoff[k]))),
    res('全部債務還清月份', (s) => monthOr(s.allPaid)),
    res('模擬期間利息合計', (s) => twd(s.interestTotal)),
    res('120個月後剩餘債務', (s) => twd(s.remaining)),
    res('還款狀態', (s) => s.status, 'wrap'),
  ];
  root.appendChild(section('表三　模擬結果', dataTable({
    cols: [{ label: '項目', get: (r) => r.label }, ...sc.map((s, i) => ({ label: `月薪 ${twd(s.salary)}`, get: (r) => r.f(sc[i]), num: true, wrap: true, cls: (v, r) => (r.cls ?? '') }))],
    rows: rows3,
  }), h('p', { class: 'note', text: '還清月份＝期末餘額首次低於 1 元的月份；缺口不增加債務，另計累計。基準日當月為第 1 個月。' })));

  // 明細
  if (sc.length) {
    if (detailIdx >= sc.length) detailIdx = 0;
    const s = sc[detailIdx];
    const d = sal.debts;
    const cols = [
      { label: '月份', width: '80px' }, { label: '月序', width: '50px', num: true },
      { label: '必繳合計', width: '100px', num: true }, { label: '結餘', width: '100px', num: true },
      { label: '可提前還款', width: '100px', num: true }, { label: '缺口', width: '90px', num: true },
      ...d.map((x) => ({ label: `${x.name}期末`, width: '120px', num: true })),
      { label: '總期末餘額', width: '120px', num: true },
    ];
    const vt = virtualTable({
      cols, count: s.rows.length, height: 420,
      getRow: (i) => {
        const r = s.rows[i];
        return { cells: [r.month, String(r.t), twd(r.must), twd(r.surplus), twd(r.avail), twd(r.gap), ...r.close.map((c) => twd(c)), twd(r.closeTotal)] };
      },
    });
    root.appendChild(h('details', { class: 'no-print' }, h('summary', { text: '逐月模擬明細（120 個月）' }),
      h('div', { class: 'row' }, labeled('情境', choiceField({ value: detailIdx, options: sc.map((x, i) => [i, `月薪 ${twd(x.salary)}`]), onChange: (v) => { detailIdx = Number(v); app.rerender(); } }))),
      vt));
  }
  return root;
}
