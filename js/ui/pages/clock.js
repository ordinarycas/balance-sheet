// P15 利息時鐘：圓形時鐘＋數位時間；秒針每走一秒，就跳出這一秒累積的利息。
// 數字來源：總覽的「今日日息」÷ 86,400 秒。這是每秒「累積」的利息，不是每秒要付的錢；假設利率與餘額不變。
// 跳出的利息可堆積（Matter.js 物理，上限 0–100；0＝原樣浮出後淡出）。外殼與迴圈在 components/clock-page.js（與 P18 薪資時鐘共用）。
import { h } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { buildClockPage, fmt5 } from '../components/clock-page.js';
import { interestPerSecond, accruedToday } from '../../core/clock.js';

export { fmt5 };

export default function render(app) {
  const ov = app.model.overview;
  const rows = [
    ...ov.loanRows.map((r) => ({ name: r.name, bal: r.balanceTWD, rate: r.annualRate, daily: r.dailyInterestTWD })),
    { name: ov.pledgeRow.name, bal: ov.pledgeRow.balanceTWD, rate: ov.pledgeRow.annualRate, daily: ov.pledgeRow.dailyInterestTWD },
  ];
  const it = interestPerSecond(rows);

  return buildClockPage(app, {
    title: '利息時鐘',
    sub: '台北時間。秒針每走一秒，就會跳出這一秒累積的利息，讓你看見「時間本身」的成本；它不是要你每秒付錢。',
    noun: '利息',
    sign: '-',
    todayTotal: (c) => accruedToday(it.daily, c.secOfDay),
    tone: 'neg',
    pileKey: 'pfs.clock.pile.v1',
    perSecond: it.perSecond,
    inactive: '目前沒有計息中的借款（日息為 0），所以時鐘不會浮出利息。到「P05 借款」或「P07 股票質押」新增後，這裡會自動出現。',
    counters: (c) => ({ today: accruedToday(it.daily, c.secOfDay) }),
    stats: ({ counter }) => [section('利息累積',
      h('div', { class: 'grid clk-accrued-grid' },
        kpi('每秒', `NT$ ${fmt5(it.perSecond)}`),
        kpi('每分鐘', `NT$ ${fmt5(it.perMinute)}`),
        kpi('每小時', `NT$ ${fmt5(it.perHour)}`),
        kpi('每四小時', `NT$ ${fmt5(it.perHour * 4)}`),
        kpi('每日', `NT$ ${fmt5(it.daily)}`),
        h('div', { class: 'kpi' }, h('div', { class: 'l', text: '今天 00:00 起累積' }),
          h('div', { class: 'v' }, 'NT$ ', counter('today').el, h('span', { class: 'sr-only', text: '（每秒更新）' })))),
      dataTable({
        label: '各筆借款的每秒利息',
        cols: [
          { label: '借款', get: (r) => r.name },
          { label: '本金餘額', get: (r) => r.balanceTWD, fmt: (v) => twd(v), num: true },
          { label: '年利率', get: (r) => r.annualRate, fmt: (v) => pct(v, 3), num: true },
          { label: '每日利息', get: (r) => r.daily, fmt: (v) => `NT$ ${fmt5(v)}`, num: true },
          { label: '每秒利息（NT$）', get: (r) => r.perSecond, fmt: (v) => fmt5(v), num: true },
        ],
        rows: it.parts,
      }),
      h('p', { class: 'note', text: '計算：總覽的「今日日息」（借款與股票質押各依自己設定的日數基準）÷ 86,400 秒。假設：利率與本金餘額不變；這是累積中的應計利息，實際扣款日與金額以還款表和對帳單為準。' }))],
  });
}
