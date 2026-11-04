// P08 持股與損益
import { h } from '../dom.js';
import { twd, num } from '../fmt.js';
import { gridTable, section } from '../components/table.js';
import { numField, textField, monthField, button, deleteButton } from '../components/forms.js';
import { quoteStatus } from './pledge.js';
import { monthKeyAdd } from '../../core/dates.js';

export default function render(app) {
  const m = app.model;
  const st = app.state;
  const root = h('div', null, h('h1', { text: '持股與損益' }),
    h('p', { class: 'sub', text: '未質押的持股現值，以及三個戶頭逐月的已實現損益。' }), quoteStatus(app));

  const rows = m.holdings.rows.map((r, i) => {
    const s = st.holdings[i];
    const mk = (fn) => (d, v) => fn(d.holdings[i], v);
    return [
      textField({ value: s.code, max: 30, mutate: mk((x, v) => { x.code = v; }) }),
      textField({ value: s.name, mutate: mk((x, v) => { x.name = v; }) }),
      numField({ value: s.shares, int: true, min: 0, mutate: mk((x, v) => { x.shares = v; }) }),
      r.auto === null ? '—' : num(r.auto, 2),
      numField({ value: s.manualPrice, min: 0, mutate: mk((x, v) => { x.manualPrice = v; }) }),
      num(r.price, 2), r.source, twd(r.value),
      deleteButton(() => app.commit((d) => { d.holdings.splice(i, 1); })),
    ];
  });
  root.appendChild(section('現有持股', gridTable({
    headers: ['代號', '股票名稱', '股數', '股價(自動)', '股價(手動備援)', '採用股價', '價格來源', '現值', ''],
    numCols: [2, 3, 4, 5, 7], rows, foot: ['總額', '', '', '', '', '', '', twd(m.holdings.totalValue), ''], empty: '尚未新增持股',
  }), h('div', { class: 'row' }, button('＋ 新增持股', () => app.commit((d) => { d.holdings.push({ code: `TPE:${2000 + d.holdings.length}`, name: '', shares: 0, manualPrice: 0 }); }), 'primary'))));

  const pr = m.pnl.rows;
  const prows = pr.map((r) => {
    const idx = () => st.realizedPnl.findIndex((x) => x.month === r.month);
    const mk = (key) => (d, v) => { d.realizedPnl[idx()][key] = v; };
    return [
      monthField({ value: r.month, mutate: (d, v) => { d.realizedPnl[idx()].month = v; } }),
      numField({ value: r.personal, mutate: mk('personal') }), numField({ value: r.father, mutate: mk('father') }), numField({ value: r.mother, mutate: mk('mother') }),
      twd(r.total), twd(r.cumulative),
      deleteButton(() => app.commit((d) => { d.realizedPnl.splice(idx(), 1); })),
    ];
  });
  root.appendChild(section('已實現損益', gridTable({
    headers: ['月份', '個人戶頭', '爸爸戶頭', '媽媽戶頭', '損益總額', '累計', ''],
    numCols: [1, 2, 3, 4, 5], rows: prows,
    foot: ['總額', twd(m.pnl.personal), twd(m.pnl.father), twd(m.pnl.mother), twd(m.pnl.total), '', ''], empty: '尚未輸入損益',
  }), h('div', { class: 'row' }, button('＋ 新增月份', () => app.commit((d) => {
    const last = d.realizedPnl.map((x) => x.month).sort().at(-1);
    let mo = last ? monthKeyAdd(last, 1) : app.asOf.slice(0, 7);
    while (d.realizedPnl.some((x) => x.month === mo)) mo = monthKeyAdd(mo, 1);
    d.realizedPnl.push({ month: mo, personal: 0, father: 0, mother: 0 });
  }), 'primary')), h('p', { class: 'note', text: '損益總額＝三個戶頭相加；損失請輸入負數。' })));
  return root;
}
