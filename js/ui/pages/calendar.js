// P04 繳費日曆
import { h } from '../dom.js';
import { twd, signCls } from '../fmt.js';
import { dataTable, kpi } from '../components/table.js';
import { button, deleteButton, showError, clearError } from '../components/forms.js';
import { countdownCards } from '../components/countdown.js';
import { dn as toDn, weekdayISO, isValidISODate } from '../../core/dates.js';
import { downloadCsv } from '../csv.js';
import { downloadBlob } from '../../data/io-json.js';
import { buildIcs } from '../../data/reminders.js';
import { todayTaipei, stampTaipei } from '../../core/dates.js';

const CATS = ['借款', '信用卡', '房租', '家裡支出', '股票質押', '自訂'];
let hidden = new Set();
const draft = { date: '', item: '', type: 'expense', amount: '', note: '' };

/** 新增單筆自訂活動的表單（欄位內容只在送出時才寫入資料）。 */
function eventForm(app) {
  const mk = (tag, attrs, key) => {
    const el = h(tag, { class: 'in', ...attrs });
    el.value = draft[key];
    el.addEventListener('input', () => { draft[key] = el.value; clearError(el); });
    return el;
  };
  const date = mk('input', { type: 'date', 'aria-label': '活動日期' }, 'date');
  const item = mk('input', { type: 'text', maxLength: 60, placeholder: '例如：保險費、牙醫、生日聚餐', 'aria-label': '活動名稱' }, 'item');
  const type = h('select', { class: 'in', 'aria-label': '類型' }, h('option', { value: 'expense', text: '應繳費用（支出）' }), h('option', { value: 'income', text: '收入' }));
  type.value = draft.type;
  type.addEventListener('change', () => { draft.type = type.value; });
  const amount = mk('input', { type: 'number', min: 0, step: 1, placeholder: '0（沒有金額可留空）', 'aria-label': '金額' }, 'amount');
  const note = mk('input', { type: 'text', maxLength: 200, placeholder: '選填', 'aria-label': '備註' }, 'note');
  const submit = () => {
    let ok = true;
    for (const el of [date, item, amount]) clearError(el);
    if (!isValidISODate(draft.date)) { showError(date, ['請選擇日期']); ok = false; }
    if (!draft.item.trim()) { showError(item, ['請輸入活動名稱']); ok = false; }
    const n = draft.amount === '' ? 0 : Number(draft.amount);
    if (!Number.isFinite(n) || n < 0) { showError(amount, ['金額請輸入 0 或以上的數字']); ok = false; }
    if (!ok) return;
    const signed = draft.type === 'expense' ? -n : n;
    const inWindow = app.model.months.includes(draft.date.slice(0, 7));
    const id = `ev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const added = app.commit((d) => { d.events.push({ id, date: draft.date, item: draft.item.trim(), amount: signed, note: draft.note.trim() }); }, { onError: (msgs) => showError(item, msgs) });
    if (!added) return;
    Object.assign(draft, { item: '', amount: '', note: '' });
    app.toast(inWindow ? '已新增活動' : '已新增，但該日期不在目前顯示的 12 個月視窗內');
  };
  const box = h('details', { class: 'card no-print evform', open: !!draft.date || undefined },
    h('summary', { text: '＋ 新增單筆行事曆活動' }),
    h('div', { class: 'formgrid' },
      h('label', { class: 'field' }, h('span', { text: '日期（也可點下方表格的日期帶入）' }), date),
      h('label', { class: 'field' }, h('span', { text: '活動名稱' }), item),
      h('label', { class: 'field' }, h('span', { text: '類型' }), type),
      h('label', { class: 'field' }, h('span', { text: '金額（NT$）' }), amount),
      h('label', { class: 'field' }, h('span', { text: '備註' }), note)),
    h('div', { class: 'row' }, button('新增活動', submit, 'primary')),
    h('p', { class: 'note', text: '自訂活動會顯示在下方日曆、列入 .ics 匯出與「明天要繳」提醒，也會包含在 JSON 備份。' }));
  box.pick = (d) => { draft.date = d; date.value = d; box.open = true; clearError(date); item.focus(); box.scrollIntoView({ block: 'center' }); };
  return box;
}

export default function render(app) {
  const cal = app.model.calendar;
  const shown = cal.events.filter((e) => !hidden.has(e.cat));
  // 篩選後重算「當日合計」只顯示在同日第一列
  let prev = null;
  const rows = shown.map((e) => ({ ...e, first: e.dn !== prev && (prev = e.dn, true) }));
  // 本週（週一～週日，以基準日為準）加底色；今天起最近的一筆（含今天）字體加粗
  const asOfDn = toDn(app.asOf);
  const weekStart = asOfDn - (weekdayISO(asOfDn) - 1);
  const nextIdx = rows.findIndex((e) => e.dn >= asOfDn);
  rows.forEach((e, i) => { e.thisWeek = e.dn >= weekStart && e.dn <= weekStart + 6; e.isNext = i === nextIdx; });
  const form = eventForm(app);
  const totals = new Map();
  rows.forEach((e) => totals.set(e.dn, (totals.get(e.dn) ?? 0) + e.amount));

  const chips = h('div', { class: 'chips no-print', role: 'group', 'aria-label': '類別篩選' },
    ...CATS.map((cat) => {
      const box = h('input', { type: 'checkbox', checked: !hidden.has(cat) });
      box.addEventListener('change', () => { if (box.checked) hidden.delete(cat); else hidden.add(cat); app.rerender(); });
      return h('label', { class: 'chip' }, box, h('span', { text: cat }));
    }));
  const filters = h('div', { class: 'row actions no-print' },
    button('跳至今日', () => {
      const el = document.querySelector('tr.today') || document.querySelector('tr.cur');
      if (el) el.scrollIntoView({ block: 'center' }); else app.toast('視窗內沒有今天或本月的事件');
    }),
    button('列印', () => app.print()),
    button('匯出行事曆 .ics', () => {
      const n = shown.filter((e) => e.amount < 0 && e.date >= todayTaipei()).length;
      if (!n) { app.toast('沒有今天以後的應繳項目可匯出'); return; }
      const t = new Date().toISOString().replace(/[-:]|.d+/g, '');
      downloadBlob(new Blob([buildIcs(shown, { today: todayTaipei(), stamp: t })], { type: 'text/calendar;charset=utf-8' }), `payment-reminders-${stampTaipei().slice(0, 8)}.ics`);
      app.toast(`已匯出 ${n} 筆，匯入行事曆後會在前一天早上 9 點提醒`);
    }),
    button('匯出 CSV', () => downloadCsv('payment-calendar.csv', ['日期', '星期', '項目', '費用', '狀態', '備註'],
      shown.map((e) => [e.date, e.weekday, e.item, e.amount, e.status, e.note]))));

  const tbl = dataTable({
    cols: [
      { label: '日期', get: (e) => e.date, center: true, fmt: (v) => h('button', { type: 'button', class: 'linklike', text: v, title: '在這一天新增活動', onClick: () => form.pick(v) }) },
      { label: '星期', get: (e) => e.weekday, center: true },
      { label: '項目', get: (e) => e.item },
      { label: '費用（NT$）', get: (e) => e.amount, fmt: (v) => twd(v), num: true, cls: signCls },
      { label: '當日合計', get: (e) => (e.first ? totals.get(e.dn) : null), fmt: (v) => (v === null ? '' : twd(v)), num: true, cls: signCls },
      { label: '狀態', get: (e) => e.status, center: true },
      { label: '備註', get: (e) => e.note, wrap: true },
      { label: '', get: (e) => e.eventId ?? '', fmt: (v) => (v ? deleteButton(() => { if (confirm('刪除這個自訂活動？')) app.commit((d) => { d.events = d.events.filter((x) => x.id !== v); }); }) : '') },
    ],
    rows,
    rowClass: (e) => `${e.status === '今日' ? 'today' : e.status === '已過' ? (e.inAsOfMonth ? 'past cur' : 'past') : e.inAsOfMonth ? 'cur' : ''}${e.thisWeek ? ' week' : ''}${e.isNext ? ' nextev' : ''}`,
    empty: '12 個月視窗內沒有應繳款項',
  });

  return h('div', null,
    h('h1', { text: '繳費日曆' }),
    h('p', { class: 'sub', text: `基準日 ${app.asOf}；顯示 ${app.model.months[0]} 起 12 個月。日期未填或金額為 0 的項目不列入。` }),
    countdownCards(app),
    h('div', { class: 'grid' }, kpi('未來 7 日應繳', twd(cal.next7)), kpi('本月剩餘應繳（基準日起至月底）', twd(cal.monthRest))),
    chips, filters, form, tbl,
    h('p', { class: 'note', text: '「匯出行事曆 .ics」：匯入手機或電腦的行事曆後，由系統在每筆應繳日的前一天早上 9 點提醒，不必開啟本網站。匯出後若資料有變動，請重新匯出；匯出檔含繳費項目與金額，請勿公開分享。' }),
    h('p', { class: 'note', text: '淺藍底＝基準日所在月份；綠底＝本週；黃底粗體＝今日；左側粗線加粗字＝最近一筆；灰字＝已過。網路費未填扣款日時預設列在每月底；質押利息需在「P07 股票質押」填入繳款日才會列入。' }));
}
