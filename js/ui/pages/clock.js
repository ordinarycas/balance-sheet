// P15 時鐘：圓形時鐘＋數位時間；秒針每走一秒，就在秒針旁浮出這一秒累積的利息。
// 數字來源：總覽的「今日日息」÷ 86,400 秒。這是每秒「累積」的利息，不是每秒要付的錢；假設利率與餘額不變。
// 不使用 style 屬性（CSP）：指針用 SVG transform 屬性，浮動數字的位置用 CSSOM，動畫在 style.css。
import { h, svg } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { taipeiClock, handAngles, interestPerSecond, accruedToday, smallMoney } from '../../core/clock.js';

const pad = (n) => String(n).padStart(2, '0');

function face() {
  const kids = [svg('circle', { class: 'clk-face', cx: 100, cy: 100, r: 96 })];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    kids.push(svg('line', { class: major ? 'clk-tick major' : 'clk-tick', x1: 100, y1: major ? 10 : 8, x2: 100, y2: major ? 20 : 14, transform: `rotate(${i * 6} 100 100)` }));
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 * Math.PI) / 180;
    const t = svg('text', { class: 'clk-num', x: (100 + 68 * Math.sin(a)).toFixed(2), y: (100 - 68 * Math.cos(a) + 5).toFixed(2), 'text-anchor': 'middle' });
    t.textContent = String(n);
    kids.push(t);
  }
  return kids;
}

export default function render(app) {
  const ov = app.model.overview;
  const rows = [
    ...ov.loanRows.map((r) => ({ name: r.name, bal: r.balanceTWD, rate: r.annualRate, daily: r.dailyInterestTWD })),
    { name: ov.pledgeRow.name, bal: ov.pledgeRow.balanceTWD, rate: ov.pledgeRow.annualRate, daily: ov.pledgeRow.dailyInterestTWD },
  ];
  const it = interestPerSecond(rows);
  const popOn = app.prefs.clockPop !== false;

  const hourHand = svg('line', { class: 'clk-hand hour', x1: 100, y1: 108, x2: 100, y2: 56 });
  const minHand = svg('line', { class: 'clk-hand minute', x1: 100, y1: 110, x2: 100, y2: 32 });
  const secHand = svg('line', { class: 'clk-hand second', x1: 100, y1: 116, x2: 100, y2: 20 });
  const clock = svg('svg', { class: 'clk-svg', viewBox: '0 0 200 200', role: 'img', 'aria-label': '圓形時鐘（台北時間）' },
    ...face(), hourHand, minHand, secHand, svg('circle', { class: 'clk-pin', cx: 100, cy: 100, r: 4 }));
  const pops = h('div', { class: 'clk-pops', 'aria-hidden': 'true' });
  const digital = h('div', { class: 'clk-digital', role: 'timer', 'aria-label': '數位時間（台北時間）' });
  const accrued = h('span', { text: '' });
  const root = h('div', null,
    h('h1', { text: '時鐘' }),
    h('p', { class: 'sub', text: '台北時間。秒針每走一秒，就會浮出這一秒累積的利息，讓你看見「時間本身」的成本；它不是要你每秒付錢。' }),
    h('div', { class: 'clk-wrap' }, h('div', { class: 'clk-dial' }, clock, pops), digital));

  const popBox = h('input', { type: 'checkbox', checked: popOn, 'aria-label': '顯示每秒浮動的利息' });
  popBox.addEventListener('change', () => app.setPref('clockPop', popBox.checked));
  root.appendChild(h('label', { class: 'row no-print clk-toggle' }, popBox, h('span', { text: '秒針旁顯示每秒浮動的利息' })));

  if (!it.parts.length) {
    root.appendChild(h('p', { class: 'note', text: '目前沒有計息中的借款（日息為 0），所以時鐘不會浮出利息。到「P05 借款」或「P07 股票質押」新增後，這裡會自動出現。' }));
  } else {
    root.appendChild(section('利息累積',
      h('div', { class: 'grid' },
        kpi('每秒', `NT$ ${smallMoney(it.perSecond)}`),
        kpi('每分鐘', `NT$ ${smallMoney(it.perMinute)}`),
        kpi('每小時', `NT$ ${smallMoney(it.perHour)}`),
        kpi('每日', twd(it.daily)),
        h('div', { class: 'kpi' }, h('div', { class: 'l', text: '今天 00:00 起累積' }), h('div', { class: 'v' }, 'NT$ ', accrued))),
      dataTable({
        label: '各筆借款的每秒利息',
        cols: [
          { label: '借款', get: (r) => r.name },
          { label: '本金餘額', get: (r) => r.balanceTWD, fmt: (v) => twd(v), num: true },
          { label: '年利率', get: (r) => r.annualRate, fmt: (v) => pct(v, 3), num: true },
          { label: '每日利息', get: (r) => r.daily, fmt: (v) => twd(v), num: true },
          { label: '每秒利息（NT$）', get: (r) => r.perSecond, fmt: (v) => smallMoney(v), num: true },
        ],
        rows: it.parts,
      }),
      h('p', { class: 'note', text: '計算：總覽的「今日日息」（借款與股票質押各依自己設定的日數基準）÷ 86,400 秒。假設：利率與本金餘額不變；這是累積中的應計利息，實際扣款日與金額以還款表和對帳單為準。' })));
  }

  // ---- 時鐘迴圈：頁面離開（元素不在文件中）就自動停止 ----
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let lastSec = -1;
  const spawn = (secInt) => {
    if (!popBox.checked || reduce || it.perSecond <= 0) return;
    const a = (secInt * 6 * Math.PI) / 180;
    const el = h('span', { class: 'clk-pop', text: `+${smallMoney(it.perSecond)}` });
    el.style.left = `${(50 + 30 * Math.sin(a)).toFixed(2)}%`;
    el.style.top = `${(50 - 30 * Math.cos(a)).toFixed(2)}%`;
    pops.appendChild(el);
    const drop = () => el.remove();
    el.addEventListener('animationend', drop, { once: true });
    setTimeout(drop, 1800);
    while (pops.childElementCount > 6) pops.firstElementChild.remove();
  };
  const frame = () => {
    if (!clock.isConnected) return;
    const c = taipeiClock(Date.now());
    const secInt = Math.floor(c.sec);
    const ang = handAngles(reduce ? { ...c, sec: secInt } : c);
    hourHand.setAttribute('transform', `rotate(${ang.hour.toFixed(2)} 100 100)`);
    minHand.setAttribute('transform', `rotate(${ang.minute.toFixed(2)} 100 100)`);
    secHand.setAttribute('transform', `rotate(${ang.second.toFixed(2)} 100 100)`);
    if (secInt !== lastSec) {
      const first = lastSec === -1;
      lastSec = secInt;
      digital.textContent = `${pad(c.h)}:${pad(c.m)}:${pad(secInt)}`;
      accrued.textContent = smallMoney(accruedToday(it.daily, c.secOfDay));
      if (!first) spawn(secInt);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return root;
}
