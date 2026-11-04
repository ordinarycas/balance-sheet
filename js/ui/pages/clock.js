// P15 時鐘：圓形時鐘＋數位時間；秒針每走一秒，就跳出這一秒累積的利息。
// 數字來源：總覽的「今日日息」÷ 86,400 秒。這是每秒「累積」的利息，不是每秒要付的錢；假設利率與餘額不變。
// 跳出的利息可堆積（Matter.js 物理，上限 0–100；0＝原樣浮出後淡出）。不使用 style 屬性（CSP）：指針用 SVG transform 屬性，位置用 CSSOM。
import { h, svg } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { rollingNumber } from '../components/rolling.js';
import { createInterestPile } from '../components/interest-pile.js';
import { enableSound, disableSound, soundSupported, soundReady, tick } from '../components/tick-sound.js';
import { taipeiClock, handAngles, interestPerSecond, accruedToday, smallMoney } from '../../core/clock.js';
import { todayTaipei } from '../../core/dates.js';

const pad = (n) => String(n).padStart(2, '0');
/** 利息累積一律顯示到小數點第 5 位。 */
export const fmt5 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

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
  const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cap = reduce ? 0 : app.prefs.clockCap;

  const hourHand = svg('line', { class: 'clk-hand hour', x1: 100, y1: 108, x2: 100, y2: 56 });
  const minHand = svg('line', { class: 'clk-hand minute', x1: 100, y1: 110, x2: 100, y2: 32 });
  const secHand = svg('line', { class: 'clk-hand second', x1: 100, y1: 116, x2: 100, y2: 20 });
  const clock = svg('svg', { class: 'clk-svg', viewBox: '0 0 200 200', role: 'img', 'aria-label': '圓形時鐘（台北時間）' },
    ...face(), hourHand, minHand, secHand, svg('circle', { class: 'clk-pin', cx: 100, cy: 100, r: 4 }));
  const pops = h('div', { class: 'clk-pops', 'aria-hidden': 'true' });
  const dial = h('div', { class: 'clk-dial' }, clock, pops);
  const digital = h('div', { class: 'clk-digital', role: 'timer', 'aria-label': '數位時間（台北時間）' });
  const layer = h('div', { class: 'clk-phys', 'aria-hidden': 'true' });
  const stage = h('div', { class: `clk-stage${cap > 0 && popOn ? ' piling' : ''}` }, dial, digital, h('div', { class: 'clk-floor' }), layer);
  const pileInfo = h('p', { class: 'note clk-pileinfo', role: 'status' });

  const root = h('div', null,
    h('h1', { text: '時鐘' }),
    h('p', { class: 'sub', text: '台北時間。秒針每走一秒，就會跳出這一秒累積的利息，讓你看見「時間本身」的成本；它不是要你每秒付錢。' }),
    h('div', { class: 'clk-wrap' }, stage, pileInfo));

  // ---- 控制項（改設定會重新繪製此頁，堆在地上的利息會接續）----
  const popBox = h('input', { type: 'checkbox', checked: popOn, 'aria-label': '顯示每秒浮動的利息' });
  popBox.addEventListener('change', () => app.setPref('clockPop', popBox.checked));
  const soundBox = h('input', { type: 'checkbox', checked: !!app.prefs.clockSound, 'aria-label': '秒針滴答聲' });
  soundBox.disabled = !soundSupported();
  soundBox.addEventListener('change', () => {
    if (soundBox.checked) { enableSound(); tick(false); } else disableSound(); // 勾選本身就是使用者操作，可以啟動音訊
    app.setPref('clockSound', soundBox.checked);
  });
  const capIn = h('input', { type: 'number', class: 'in', min: 0, max: 100, step: 1, value: app.prefs.clockCap, 'aria-label': '利息堆積上限（0 到 100）' });
  capIn.addEventListener('change', () => {
    const v = Math.round(Number(capIn.value));
    if (!Number.isFinite(v) || v < 0 || v > 100) { capIn.value = app.prefs.clockCap; app.toast('請輸入 0 到 100 的整數'); return; }
    app.setPref('clockCap', v);
  });
  const gyroSupported = typeof window.DeviceOrientationEvent !== 'undefined';
  const gyroBox = h('input', { type: 'checkbox', checked: !!app.prefs.clockGyro, 'aria-label': '利息隨手機傾斜（陀螺儀）' });
  gyroBox.disabled = !gyroSupported;
  gyroBox.addEventListener('change', async () => {
    if (gyroBox.checked && typeof window.DeviceOrientationEvent?.requestPermission === 'function') { // iOS 需在使用者操作中授權
      try { if ((await window.DeviceOrientationEvent.requestPermission()) !== 'granted') { gyroBox.checked = false; app.toast('未取得動態感測器權限'); return; } } catch { gyroBox.checked = false; return; }
    }
    app.setPref('clockGyro', gyroBox.checked);
  });
  root.appendChild(h('div', { class: 'card no-print clk-controls' },
    h('label', { class: 'row clk-toggle' }, popBox, h('span', { text: '秒針旁顯示每秒浮動的利息' })),
    h('label', { class: 'row clk-toggle' }, soundBox, h('span', { text: soundSupported() ? '秒針滴答聲（純 JS 合成，預設關閉）' : '秒針滴答聲（此瀏覽器不支援）' })),
    h('label', { class: 'row clk-toggle' }, gyroBox, h('span', { text: gyroSupported ? '利息隨手機傾斜（陀螺儀，預設關閉；資料只在本機處理）' : '利息隨手機傾斜（此裝置不支援）' })),
    h('label', { class: 'row clk-toggle' }, capIn, h('span', { text: '堆積上限（0–100 顆；0＝不堆積，浮出後淡出）' })),
    h('p', { class: 'note', text: '跳出的利息會落到地上慢慢堆起來，台北時間每天重新開始。超過上限時，最舊的一顆淡出並把數字加到最新的一顆；已達上限時，兩顆碰撞就合併成一顆、數字相加。沒有開啟「減少動態效果」的裝置才會有堆積動畫。' })));

  const accrued = rollingNumber(fmt5(0), { animate: !reduce });

  if (!it.parts.length) {
    root.appendChild(h('p', { class: 'note', text: '目前沒有計息中的借款（日息為 0），所以時鐘不會浮出利息。到「P05 借款」或「P07 股票質押」新增後，這裡會自動出現。' }));
  } else {
    root.appendChild(section('利息累積',
      h('div', { class: 'grid' },
        kpi('每秒', `NT$ ${fmt5(it.perSecond)}`),
        kpi('每分鐘', `NT$ ${fmt5(it.perMinute)}`),
        kpi('每小時', `NT$ ${fmt5(it.perHour)}`),
        kpi('每日', `NT$ ${fmt5(it.daily)}`),
        h('div', { class: 'kpi' }, h('div', { class: 'l', text: '今天 00:00 起累積' }),
          h('div', { class: 'v' }, 'NT$ ', accrued.el, h('span', { class: 'sr-only', text: '（每秒更新）' })))),
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
      h('p', { class: 'note', text: '計算：總覽的「今日日息」（借款與股票質押各依自己設定的日數基準）÷ 86,400 秒。假設：利率與本金餘額不變；這是累積中的應計利息，實際扣款日與金額以還款表和對帳單為準。' })));
  }

  // ---- 迴圈：頁面離開（元素不在文件中）就自動停止 ----
  let lastSec = -1;
  let lastTs = performance.now();
  let lastAcc = 0;
  let day = todayTaipei();
  let pile = null;
  let initializing = false;
  let pileFailed = false;
  let flip = false;
  let resizeT = 0;

  const showPile = (p) => {
    pileInfo.textContent = cap > 0 && popOn && it.perSecond > 0
      ? `堆積中：${p.size} 顆，合計 NT$ ${fmt5(p.total)}（從你開啟頁面起累積；每日重新開始）`
      : '';
  };
  async function initPile() {
    if (pile || initializing || pileFailed || !(cap > 0) || !popOn || it.perSecond <= 0 || reduce) return;
    if (!stage.isConnected || !stage.clientWidth) return;
    initializing = true;
    try {
      pile = await createInterestPile({ stage, layer, dial, digital, cap, day, onChange: showPile });
      if (!stage.isConnected) { pile.dispose(); pile = null; } else applyGyro();
    } catch (e) {
      pileFailed = true;
      console.warn('利息堆（物理引擎）載入失敗，改用單純浮出', e);
      pileInfo.textContent = '物理引擎無法載入（可能離線且尚未快取），改用單純浮出。';
    } finally { initializing = false; }
  }
  // 陀螺儀：直拿手機時重力朝下；左右傾斜時朝傾斜方向；平放時重力變弱
  const onTilt = (e) => {
    if (!pile || e.beta == null || e.gamma == null) return;
    const rad = Math.PI / 180;
    pile.setGravity(Math.sin(e.gamma * rad), Math.max(0.15, Math.sin(e.beta * rad)));
  };
  function applyGyro() {
    window.removeEventListener('deviceorientation', onTilt);
    if (app.prefs.clockGyro && gyroSupported && pile) window.addEventListener('deviceorientation', onTilt);
  }
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (!clock.isConnected) { window.removeEventListener('resize', onResize); return; } pile?.dispose(); pile = null; initPile(); }, 300);
  };
  window.addEventListener('resize', onResize);
  // 重新整理後瀏覽器會要求再有一次操作才能出聲
  if (app.prefs.clockSound) window.addEventListener('pointerdown', () => enableSound(), { once: true });

  const floatPop = (secInt) => {
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

  const frame = (ts) => {
    if (!clock.isConnected) { window.removeEventListener('deviceorientation', onTilt); pile?.dispose(); pile = null; return; }
    const dt = ts - lastTs;
    lastTs = ts;
    const c = taipeiClock(Date.now());
    const secInt = Math.floor(c.sec);
    const ang = handAngles(reduce ? { ...c, sec: secInt } : c);
    hourHand.setAttribute('transform', `rotate(${ang.hour.toFixed(2)} 100 100)`);
    minHand.setAttribute('transform', `rotate(${ang.minute.toFixed(2)} 100 100)`);
    secHand.setAttribute('transform', `rotate(${ang.second.toFixed(2)} 100 100)`);
    if (!pile) initPile();
    pile?.step(dt);
    // 累積利息：每 100 毫秒更新一次，各位數字各自平順滾動
    if (it.daily > 0 && (ts - lastAcc > 100 || secInt !== lastSec)) {
      lastAcc = ts;
      accrued.set(fmt5(accruedToday(it.daily, c.secOfDay)));
    }
    if (secInt !== lastSec) {
      const first = lastSec === -1;
      lastSec = secInt;
      digital.textContent = `${pad(c.h)}:${pad(c.m)}:${pad(secInt)}`;
      if (!first) {
        if (soundBox.checked && soundReady()) { flip = !flip; tick(flip); }
        const today = todayTaipei();
        if (today !== day) { day = today; pile?.reset(today); }
        if (popOn && !reduce && it.perSecond > 0) {
          if (pile) pile.spawn(secInt * 6, it.perSecond);
          else if (cap === 0 || !initializing) floatPop(secInt);
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return root;
}
