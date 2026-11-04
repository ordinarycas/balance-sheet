// P04 繳費日曆
import { h } from '../dom.js';
import { twd, signCls } from '../fmt.js';
import { dataTable, kpi } from '../components/table.js';
import { button } from '../components/forms.js';
import { downloadCsv } from '../csv.js';

const CATS = ['借款', '信用卡', '房租', '家裡支出', '股票質押'];
let hidden = new Set();

export default function render(app) {
  const cal = app.model.calendar;
  const shown = cal.events.filter((e) => !hidden.has(e.cat));
  // 篩選後重算「當日合計」只顯示在同日第一列
  let prev = null;
  const rows = shown.map((e) => ({ ...e, first: e.dn !== prev && (prev = e.dn, true) }));
  const totals = new Map();
  rows.forEach((e) => totals.set(e.dn, (totals.get(e.dn) ?? 0) + e.amount));

  const filters = h('div', { class: 'row no-print' }, h('span', { class: 'muted', text: '類別：' }),
    ...CATS.map((c) => {
      const box = h('input', { type: 'checkbox', checked: !hidden.has(c) });
      box.addEventListener('change', () => { if (box.checked) hidden.delete(c); else hidden.add(c); app.rerender(); });
      return h('label', null, box, ` ${c}　`);
    }),
    button('跳至今日', () => {
      const el = document.querySelector('tr.today') || document.querySelector('tr.cur');
      if (el) el.scrollIntoView({ block: 'center' }); else app.toast('視窗內沒有今天或本月的事件');
    }),
    button('列印', () => app.print()),
    button('匯出 CSV', () => downloadCsv('payment-calendar.csv', ['日期', '星期', '項目', '費用', '狀態', '備註'],
      shown.map((e) => [e.date, e.weekday, e.item, e.amount, e.status, e.note]))));

  const tbl = dataTable({
    cols: [
      { label: '日期', get: (e) => e.date, center: true },
      { label: '星期', get: (e) => e.weekday, center: true },
      { label: '項目', get: (e) => e.item },
      { label: '費用（NT$）', get: (e) => e.amount, fmt: (v) => twd(v), num: true, cls: signCls },
      { label: '當日合計', get: (e) => (e.first ? totals.get(e.dn) : null), fmt: (v) => (v === null ? '' : twd(v)), num: true, cls: signCls },
      { label: '狀態', get: (e) => e.status, center: true },
      { label: '備註', get: (e) => e.note, wrap: true },
    ],
    rows,
    rowClass: (e) => (e.status === '今日' ? 'today' : e.status === '已過' ? (e.inAsOfMonth ? 'past cur' : 'past') : e.inAsOfMonth ? 'cur' : ''),
    empty: '12 個月視窗內沒有應繳款項',
  });

  return h('div', null,
    h('h1', { text: '繳費日曆' }),
    h('p', { class: 'sub', text: `基準日 ${app.asOf}；顯示 ${app.model.months[0]} 起 12 個月。日期未填或金額為 0 的項目不列入。` }),
    h('div', { class: 'grid' }, kpi('未來 7 日應繳', twd(cal.next7)), kpi('本月剩餘應繳（基準日起至月底）', twd(cal.monthRest))),
    filters, tbl,
    h('p', { class: 'note', text: '淺藍底＝基準日所在月份；黃底粗體＝今日；灰字＝已過。網路費未填扣款日時預設列在每月底；質押利息需在「P07 股票質押」填入繳款日才會列入。' }));
}
