// P04 繳費日曆
import { h } from '../dom.js';
import { twd, signCls } from '../fmt.js';
import { dataTable, kpi } from '../components/table.js';
import { button, deleteButton } from '../components/forms.js';
import { countdownCards } from '../components/countdown.js';
import { dn as toDn, weekdayISO } from '../../core/dates.js';
import { downloadCsv } from '../csv.js';
import { downloadBlob } from '../../data/io-json.js';
import { buildIcs } from '../../data/reminders.js';
import { todayTaipei, stampTaipei } from '../../core/dates.js';

const CATS = ['借款', '信用卡', '房租', '家裡支出', '股票質押', '自訂'];
let hidden = new Set();

/** 單筆 .ics：不受「今天以後」限制（使用者明確點選的那一筆）。 */
function exportOne(e, app) {
  const ics = buildIcs([e], { today: e.date, stamp: new Date().toISOString().replace(/[-:]|\.\d+/g, '') });
  if (!ics.includes('BEGIN:VEVENT')) { app.toast('這一筆是收入，沒有可提醒的內容'); return; }
  const safe = e.item.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30);
  downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${e.date}-${safe}.ics`);
  app.toast(`已匯出 ${e.date} ${e.item}，匯入行事曆後會在前一天早上 9 點提醒`);
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
  const totals = new Map();
  rows.forEach((e) => totals.set(e.dn, (totals.get(e.dn) ?? 0) + e.amount));

  const chips = h('div', { class: 'chips no-print', role: 'group', 'aria-label': '類別篩選' },
    ...CATS.filter((cat) => cat !== '自訂' || cal.events.some((e) => e.custom)).map((cat) => {
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
      const t = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
      downloadBlob(new Blob([buildIcs(shown, { today: todayTaipei(), stamp: t })], { type: 'text/calendar;charset=utf-8' }), `payment-reminders-${stampTaipei().slice(0, 8)}.ics`);
      app.toast(`已匯出 ${n} 筆，匯入行事曆後會在前一天早上 9 點提醒`);
    }),
    button('匯出 CSV', () => downloadCsv('payment-calendar.csv', ['日期', '星期', '項目', '費用', '狀態', '備註'],
      shown.map((e) => [e.date, e.weekday, e.item, e.amount, e.status, e.note]))));

  const tbl = dataTable({
    cols: [
      { label: '日期', get: (e) => e.date, center: true, fmt: (v, e) => h('button', { type: 'button', class: 'linklike', text: v, title: '匯出這一筆的 .ics', 'aria-label': `匯出 ${v} ${e.item} 的 .ics`, onClick: () => exportOne(e, app) }) },
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
    chips, filters, tbl,
    h('p', { class: 'note', text: '「匯出行事曆 .ics」匯出全部；點表格中的日期則只匯出該筆。匯入手機或電腦的行事曆後，由系統在每筆應繳日的前一天早上 9 點提醒，不必開啟本網站。匯出後若資料有變動，請重新匯出；匯出檔含繳費項目與金額，請勿公開分享。' }),
    h('p', { class: 'note', text: '淺藍底＝基準日所在月份；綠底＝本週；黃底粗體＝今日；左側粗線加粗字＝最近一筆；灰字＝已過。網路費未填扣款日時預設列在每月底；質押利息需在「P07 股票質押」填入繳款日才會列入。' }));
}
