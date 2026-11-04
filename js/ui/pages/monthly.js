// P02 每月支出
import { h } from '../dom.js';
import { twd, signCls } from '../fmt.js';
import { dataTable, section, tabs } from '../components/table.js';
import { barChart, lineChart, legend } from '../components/chart.js';
import { monthField, labeled, button } from '../components/forms.js';
import { cardLabel } from '../../core/expenses.js';
import { monthKeyAdd } from '../../core/dates.js';

// 圖表檢視（模組層級，重繪後保留）：stack 堆疊 / group 並排 / total 當月總支出折線
let view = 'stack';
const VIEWS = [['stack', '堆疊'], ['group', '並排'], ['total', '總支出折線']];

export default function render(app) {
  const m = app.model;
  const mt = m.monthly;
  const st = app.state;
  const asOfMonth = m.asOfMonth;
  const cols = [
    { label: '月份', get: (r) => r.month, center: true },
    { label: '月標籤', get: (r) => r.label, center: true },
    ...mt.cardIds.map((id) => ({ label: cardLabel(st.cards, id), get: (r) => r.cards[id], fmt: (v) => twd(v), num: true, cls: signCls })),
    { label: '房租', get: (r) => r.rent, fmt: (v) => twd(v), num: true, cls: signCls },
    { label: '家裡支出', get: (r) => r.home, fmt: (v) => twd(v), num: true, cls: signCls },
    { label: '生活支出小計', get: (r) => r.living, fmt: (v) => twd(v), num: true, cls: signCls },
    ...m.schedules.map((s, i) => ({ label: `${s.name}${s.kind === 'interest_only_annual' ? '年繳利息' : '月繳'}`, get: (r) => r.loans[i].payment, fmt: (v) => twd(v), num: true, cls: signCls })),
    { label: '借款還款小計', get: (r) => r.loanTotal, fmt: (v) => twd(v), num: true, cls: signCls },
    { label: '當月總支出', get: (r) => r.total, fmt: (v) => twd(v), num: true, cls: signCls },
    { label: '其中借款利息', get: (r) => r.loanInterest, fmt: (v) => twd(v), num: true, cls: signCls },
  ];
  const sumRow = (label, t) => {
    const cells = [label, ''];
    mt.cardIds.forEach((id) => cells.push(twd(t.cards[id])));
    cells.push(twd(t.rent), twd(t.home), twd(t.living));
    t.loans.forEach((v) => cells.push(twd(v)));
    cells.push(twd(t.loanTotal), twd(t.total), twd(t.loanInterest));
    return { cells };
  };
  const startInput = monthField({ value: st.settings.monthStart ?? m.startMonth, mutate: (d, v) => { d.settings.monthStart = v; } });
  const root = h('div', null,
    h('h1', { text: '每月支出' }),
    h('p', { class: 'sub', text: '生活支出（信用卡、房租、家裡支出）＋ 借款還款 ＝ 當月總支出。支出為負數。' }),
    h('div', { class: 'row no-print' },
      button('◀ 前一月', () => app.commit((d) => { d.settings.monthStart = monthKeyAdd(st.settings.monthStart ?? m.startMonth, -1); }), '', '起始月份往前一個月'),
      labeled('起始月份', startInput, '預設為基準日前一個月'),
      button('後一月 ▶', () => app.commit((d) => { d.settings.monthStart = monthKeyAdd(st.settings.monthStart ?? m.startMonth, 1); }), '', '起始月份往後一個月'),
      st.settings.monthStart ? h('button', { type: 'button', onClick: () => app.commit((d) => { d.settings.monthStart = null; }) }, '恢復預設') : null),
    dataTable({ cols, rows: mt.rows, rowClass: (r) => (r.month === asOfMonth ? 'cur' : ''), foot: [sumRow('12個月合計', mt.totals), sumRow('月平均', mt.avg)] }),
    h('p', { class: 'note', text: '借款還款：保單年繳利息只在繳款月出現，美元以目前匯率折算 NT$。淺藍底為基準日所在月份。' }));
  const labels = mt.rows.map((r) => r.label);
  const monthKeys = mt.rows.map((r) => r.month);
  const two = [
    { name: '生活支出', values: mt.rows.map((r) => -r.living), cls: 's1' },
    { name: '借款還款', values: mt.rows.map((r) => -r.loanTotal), cls: 's2' },
  ];
  const switcher = tabs(VIEWS, view, (k) => { view = k; app.rerender(); });
  const chart = view === 'total'
    ? lineChart({ labels, monthKeys, series: [{ name: '當月總支出', values: mt.rows.map((r) => -r.total), cls: 's5' }], tipFmt: (v) => twd(v), title: '每月總支出折線圖' })
    : barChart({ labels, monthKeys, stacked: view === 'stack', series: two, tipFmt: (v) => twd(v), title: '生活支出與借款還款長條圖' });
  root.appendChild(section('生活支出 vs 借款還款', switcher, legend(view === 'total' ? [{ cls: 's5', name: '當月總支出' }] : [{ cls: 's1', name: '生活支出' }, { cls: 's2', name: '借款還款' }]), chart));
  return root;
}
