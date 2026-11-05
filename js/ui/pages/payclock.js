// P18 薪資時鐘：把「月薪」代入利息時鐘——秒針每走一秒，就跳出這一秒累積的薪資。
// 月薪來源：P03 的月薪情境（稅後）、現行基本工資、或自訂金額。假設：月薪平均分攤到每一天；沒設定上下班時間就平均到整天的每一秒，設定後只分攤到上班時段（時段外不累積）；
// 每日＝月薪 ÷ 當月天數，所以整個月累積剛好等於月薪。實際發薪日、扣稅與勞健保以公司為準。
// 外殼與迴圈在 components/clock-page.js（與 P15 利息時鐘共用）。
import { h } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { kpi, section } from '../components/table.js';
import { choiceField, labeled } from '../components/forms.js';
import { buildClockPage, fmt5, fmt2, fmt4 } from '../components/clock-page.js';
import { interestPerSecond, payPerSecond, accruedWork, workWindow, inWindow, secondsToEarn, spanSeconds } from '../../core/clock.js';
import { WAGE } from '../../core/lifetime.js';
import { daysInMonth, todayTaipei } from '../../core/dates.js';

/** 可選的月薪來源：[代碼, 顯示文字, 金額]。 */
export function paySources(app) {
  const list = (app.state.salary?.scenarios ?? []).map((v, i) => [`s${Math.round(Number(v) || 0)}`, `P03 月薪情境 ${i + 1}：${twd(v)}`, Number(v) || 0]).filter((x) => x[2] > 0);
  list.push(['wage', `現行基本工資：${twd(WAGE.current.monthly)}（${WAGE.current.label}）`, WAGE.current.monthly]);
  list.push(['custom', '自訂月薪', Math.max(0, Number(app.prefs.payClockMonthly) || 0)]);
  return list;
}

export default function render(app) {
  const srcs = paySources(app);
  const first = srcs.find((s) => s[0].startsWith('s'))?.[0] ?? 'wage';
  const chosen = srcs.some((s) => s[0] === app.prefs.payClockSrc) ? app.prefs.payClockSrc : first;
  const monthly = srcs.find((s) => s[0] === chosen)?.[2] ?? 0;
  const [y, m] = todayTaipei().split('-').map(Number);
  const pay0 = payPerSecond(monthly, daysInMonth(y, m));
  const win = workWindow(app.prefs.payStart, app.prefs.payEnd); // null＝整天
  // 有上下班時間：每日薪資只分攤到上班時段；沒有：分攤到整天
  const rate = (p) => { const s = win ? p.daily / win.workSec : p.daily / 86400; return { perSecond: s, perMinute: s * 60, perHour: s * 3600 }; };
  const pay = { ...pay0, ...rate(pay0) };

  const ov = app.model.overview;
  const it = interestPerSecond([
    ...ov.loanRows.map((r) => ({ name: r.name, bal: r.balanceTWD, rate: r.annualRate, daily: r.dailyInterestTWD })),
    { name: ov.pledgeRow.name, bal: ov.pledgeRow.balanceTWD, rate: ov.pledgeRow.annualRate, daily: ov.pledgeRow.dailyInterestTWD },
  ]);

  const custom = h('input', { type: 'number', class: 'in', min: 0, step: 1000, value: app.prefs.payClockMonthly || '', placeholder: '例如 40000', 'aria-label': '自訂月薪（NT$，稅後）' });
  custom.addEventListener('change', () => {
    const v = custom.value === '' ? 0 : Number(custom.value);
    if (!Number.isFinite(v) || v < 0 || v > 10000000) { custom.value = app.prefs.payClockMonthly || ''; app.toast('請輸入 0 到 10,000,000 的金額'); return; }
    app.setPref('payClockMonthly', Math.round(v));
  });
  const timeIn = (key, label) => {
    const el = h('input', { type: 'time', class: 'in', value: app.prefs[key], 'aria-label': label });
    el.addEventListener('change', () => {
      const other = key === 'payStart' ? app.prefs.payEnd : app.prefs.payStart;
      const a = key === 'payStart' ? el.value : other;
      const b = key === 'payStart' ? other : el.value;
      if (el.value && a && b && b <= a) { el.value = app.prefs[key]; app.toast('下班時間要晚於上班時間（同一天內）'); return; }
      app.setPref(key, el.value);
    });
    return el;
  };
  const picker = h('div', { class: 'card no-print lifeform' }, h('div', { class: 'incomebar' },
    labeled('月薪來源', choiceField({ label: '月薪來源', value: chosen, options: srcs.map((s) => [s[0], s[1]]), onChange: (v) => app.setPref('payClockSrc', v) })),
    chosen === 'custom' ? labeled('自訂月薪（NT$，稅後）', custom) : null,
    labeled('上班時間', timeIn('payStart', '上班時間')),
    labeled('下班時間', timeIn('payEnd', '下班時間')),
    h('span', { class: 'note', text: win ? `只在 ${app.prefs.payStart}–${app.prefs.payEnd} 累積薪資（共 ${(win.workSec / 3600).toFixed(1)} 小時）；時段外不浮出。` : '沒有設定上下班時間：薪資平均分攤到整天。' }),
    h('span', { class: 'note', text: monthly > 0 ? `目前代入月薪 ${twd(monthly)}；本月共 ${pay.days} 天。` : '尚未代入月薪。' })));

  const todayLabel = win ? `今天 00:00 起累積（只算上班時段 ${app.prefs.payStart}–${app.prefs.payEnd}）` : '今天 00:00 起累積';
  return buildClockPage(app, {
    todayLabel,
    fmtAcc: fmt2, // 「薪資累積」卡片只顯示小數兩位（浮出的氣泡與堆積仍是 5 位）
    title: '薪資時鐘',
    sub: '台北時間。把月薪代入時鐘：秒針每走一秒，就會跳出這一秒累積的薪資，讓你看見「時間本身」的價值；它不是每秒入帳的現金。',
    noun: '薪資',
    sign: '+',
    todayTotal: (c) => accruedWork(pay.daily, win, c.secOfDay),
    active: (c) => inWindow(win, c.secOfDay),
    tone: 'pos',
    pileKey: 'pfs.clock.pay.pile.v1',
    perSecond: pay.perSecond,
    onDayChange: (today) => { if (+today.slice(5, 7) !== m) app.rerender(); }, // 跨月：天數不同，整頁重算
    beforeControls: picker,
    inactive: '尚未設定月薪，所以時鐘不會浮出薪資。可以在上方選擇「現行基本工資」或輸入自訂月薪；也可以到「P03 月薪情境」填入稅後月薪，這裡會自動出現。',
    counters: (c, day) => {
      const p = payPerSecond(monthly, daysInMonth(day.y, day.m));
      const t = accruedWork(p.daily, win, c.secOfDay);
      return { today: t, month: p.daily * (day.d - 1) + t };
    },
    stats: ({ counter }) => [
      section('薪資累積',
        h('div', { class: 'grid clk-accrued-grid' },
          kpi('每秒', `NT$ ${fmt4(pay.perSecond)}`),
          kpi('每分鐘', `NT$ ${fmt4(pay.perMinute)}`),
          kpi('每小時', `NT$ ${fmt2(pay.perHour)}`),
          kpi('每四小時', `NT$ ${fmt2(pay.perHour * 4)}`),
          kpi('每日', `NT$ ${fmt2(pay.daily)}`),
          h('div', { class: 'kpi' }, h('div', { class: 'l', text: todayLabel }),
            h('div', { class: 'v' }, 'NT$ ', counter('today').el, h('span', { class: 'sr-only', text: '（每秒更新）' }))),
          h('div', { class: 'kpi' }, h('div', { class: 'l', text: `本月 1 日起累積（月底＝月薪 ${twd(pay.monthly)}）` }),
            h('div', { class: 'v' }, 'NT$ ', counter('month').el, h('span', { class: 'sr-only', text: '（每秒更新）' })))),
        h('p', { class: 'note', text: `計算：月薪 ${twd(pay.monthly)} ÷ 本月 ${pay.days} 天 ＝ 每日；每日再${win ? `平均分攤到上班時段（${(win.workSec / 3600).toFixed(1)} 小時）的每一秒` : '÷ 86,400 秒'}。假設：月薪平均分攤到每一天（不論週末或休假）${win ? '，每天只在上班時段累積' : '、每一秒（不論上班或休息）'}；實際發薪日、扣稅與勞健保以公司為準。這是把月薪換成「時間」的對照，不是即時入帳。` })),
      it.perSecond > 0 ? section('對照：利息時鐘',
        h('div', { class: 'grid' },
          kpi('一天累積的薪資', `NT$ ${fmt5(pay.daily)}`, 'good'),
          kpi('一天累積的利息', `NT$ ${fmt5(it.daily)}`),
          kpi(win ? '賺到一天的利息，大約需要（上班時間）' : '賺到一天的利息，大約需要', spanSeconds(secondsToEarn(it.daily, pay.perSecond))),
          kpi('一天的利息約占一天的薪資', pay.daily > 0 ? pct(it.daily / pay.daily, 1) : '—')),
        h('p', { class: 'note', text: '利息取自「P15 利息時鐘」（總覽的今日日息）。假設：薪資與利息都平均分攤到每一秒、利率與餘額不變；這只是把兩個數字放在同一把時間尺上比較，實際收支請以 P03、P05 為準。' })) : null,
    ].filter(Boolean),
  });
}
