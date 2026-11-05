// 倒數計時卡片：「近期還款」與「下次發薪」。只有每秒更新文字，不會觸發頁面重繪。
import { h } from '../dom.js';
import { twd } from '../fmt.js';
import { todayTaipei, dn, iso } from '../../core/dates.js';
import { progressSummary, spanText } from '../../core/payoff.js';
import { nextRepayment, nextPayday, remaining, startOfDayMs, dueOn } from '../../core/countdown.js';

const pad = (n) => String(n).padStart(2, '0');
let timer = null;

function text(date, now) {
  const r = remaining(date, now);
  if (!r) return date <= todayTaipei() ? '就是今天' : '即將到期';
  return `${r.days} 天 ${pad(r.h)}:${pad(r.m)}:${pad(r.s)}`;
}

function tick() {
  const els = document.querySelectorAll('[data-cd]');
  if (!els.length) { clearInterval(timer); timer = null; return; }
  const now = Date.now();
  els.forEach((el) => {
    const t = text(el.dataset.cd, now);
    if (el.textContent !== t) el.textContent = t;
    const r = remaining(el.dataset.cd, now);
    const label = r ? `還有 ${r.days} 天` : '就是今天';
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label); // 只在「天」變化時更新，避免螢幕閱讀器每秒朗讀
  });
}

function card(title, date, main, sub, urgent) {
  const big = h('div', { class: 'cd-big', role: 'timer', 'data-cd': date });
  big.textContent = text(date, Date.now());
  const el = h('div', { class: `card cd${urgent ? ' soon' : ''}` },
    h('div', { class: 'l', text: title }), big,
    h('div', { class: 'cd-main', text: main }), sub ? h('div', { class: 'note', text: sub }) : null);
  if (!timer) timer = setInterval(tick, 1000);
  return el;
}

const daysLeft = (date) => Math.ceil((startOfDayMs(date) - Date.now()) / 86400000);

/** @param {object} app */
export function countdownCards(app) {
  const today = todayTaipei();
  const ev = nextRepayment(app.model.calendar.events, today);
  const payDate = nextPayday(today, app.state.settings.payDay);
  const due = ev ? dueOn(app.model.calendar.events, ev.date) : null; // 費用取自行事曆：那一天所有要繳的款項合計
  const repay = ev
    ? card('近期還款', ev.date, `${ev.date} ${ev.weekday}　${due.items.length > 1 ? `${ev.item} 等 ${due.items.length} 筆` : ev.item}`, `應繳合計 ${twd(due.total)}${due.items.length > 1 ? `（${due.items.map((x) => `${x.item} ${twd(x.amount)}`).join('、')}）` : ''}`, daysLeft(ev.date) <= 3)
    : h('div', { class: 'card cd' }, h('div', { class: 'l', text: '近期還款' }), h('div', { class: 'cd-main', text: '12 個月視窗內沒有應還款項' }));
  const pay = payDate
    ? card('下次發薪', payDate, `${payDate}　每月 ${app.state.settings.payDay} 日${app.state.settings.payDay > 28 ? '（無該日則月底）' : ''}`, null, false)
    : h('div', { class: 'card cd' }, h('div', { class: 'l', text: '下次發薪' }),
      h('div', { class: 'cd-main' }, '尚未設定發薪日：到 ', h('a', { href: '#/settings', text: 'P10 設定' }), ' 填入每月發薪日'));
  const ps = progressSummary(app.model);
  let free = null;
  if (ps.loans.length && ps.payoffDn !== null) {
    const date = iso(ps.payoffDn);
    free = date > today
      ? card('攤還型借款預計還清', date, `${date}（約 ${spanText(ps.payoffDn - dn(today))}）`, `已完成 ${(ps.progress * 100).toFixed(1)}%${ps.otherDebt ? '；不含保單與質押借款' : ''}`, false)
      : h('div', { class: 'card cd' }, h('div', { class: 'l', text: '攤還型借款' }), h('div', { class: 'cd-main', text: '已全部還清' }));
  }
  return h('div', { class: 'cdgrid' }, repay, pay, free);
}
