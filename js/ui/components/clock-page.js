// 時鐘頁的共用外殼：圓形時鐘＋數位時間；秒針每走一秒，就跳出這一秒累積的金額（利息或薪資），可堆積、可用滑鼠／手指拖曳。
// P15 利息時鐘與 P18 薪資時鐘共用這裡，只差在數字來源、顏色與用字（cfg）。
// 不使用 style 屬性（CSP）：指針用 SVG transform 屬性，位置用 CSSOM。
import { h, svg } from '../dom.js';
import { rollingNumber } from './rolling.js';
import { createInterestPile } from './interest-pile.js';
import { enableSound, unlockSound, disableSound, soundSupported, soundReady, tick } from './tick-sound.js';
import { taipeiClock, handAngles, smallMoney } from '../../core/clock.js';
import { todayTaipei } from '../../core/dates.js';

const pad = (n) => String(n).padStart(2, '0');
/** 累積金額一律顯示到小數點第 5 位。 */
export const fmt2 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt4 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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

/**
 * @param {any} app
 * @param {{
 *   title:string, sub:string, noun:string, tone:'neg'|'pos', pileKey:string,
 *   perSecond:number, onDayChange?:(today:string)=>void,
 *   sign:'+'|'-',                         // 浮動數字前的正負號：利息 '-'、薪資 '+'
 *   todayTotal:(c:{secOfDay:number}, day:{y:number,m:number,d:number})=>number,  // 今天 00:00 起累積；堆的合計要等於它
 *   todayLabel?:string,  // 「今天累積」的標籤（堆積說明引用同一句，兩處文字才會一致）
 *   active?:(c:{secOfDay:number})=>boolean,  // 目前是否在累積時段（薪資時鐘的上班時間）；省略＝一直是
 *   inactive:Node|string|null,           // perSecond 為 0 時顯示的說明
 *   beforeControls?:Node|null,           // 控制項上方的額外區塊（例如月薪來源）
 *   counters:(c:{secOfDay:number}, day:{y:number,m:number,d:number})=>Record<string,number>,
 *   stats:(ctx:{counter:(key:string)=>any})=>Node[],  // perSecond > 0 時顯示的數字區塊
 * }} cfg
 */
export function buildClockPage(app, cfg) {
  const { noun } = cfg;
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
    h('h1', { text: cfg.title }),
    h('p', { class: 'sub', text: cfg.sub }),
    h('div', { class: `clk-wrap${cfg.tone === 'pos' ? ' clk-tone-pos' : ''}` }, stage, pileInfo));
  if (cfg.beforeControls) root.appendChild(cfg.beforeControls);

  // ---- 控制項（改設定會重新繪製此頁，堆在地上的金額會接續）----
  const popBox = h('input', { type: 'checkbox', checked: popOn, 'aria-label': `顯示每秒浮動的${noun}` });
  popBox.addEventListener('change', () => app.setPref('clockPop', popBox.checked));
  const soundBox = h('input', { type: 'checkbox', checked: !!app.prefs.clockSound, 'aria-label': '秒針滴答聲' });
  soundBox.disabled = !soundSupported();
  soundBox.addEventListener('change', () => {
    if (soundBox.checked) unlockSound().then((ok) => { if (ok) tick(false); }); else disableSound(); // 勾選本身就是使用者操作，可以啟動音訊；不必重新整理
    app.setPref('clockSound', soundBox.checked);
  });
  const capIn = h('input', { type: 'number', class: 'in', min: 0, max: 100, step: 1, value: app.prefs.clockCap, 'aria-label': `${noun}堆積上限（0 到 100）` });
  capIn.addEventListener('change', () => {
    const v = Math.round(Number(capIn.value));
    if (!Number.isFinite(v) || v < 0 || v > 100) { capIn.value = app.prefs.clockCap; app.toast('請輸入 0 到 100 的整數'); return; }
    app.setPref('clockCap', v);
  });
  const gyroSupported = typeof window.DeviceOrientationEvent !== 'undefined';
  const gyroBox = h('input', { type: 'checkbox', checked: !!app.prefs.clockGyro, 'aria-label': `${noun}隨手機傾斜（陀螺儀）` });
  gyroBox.disabled = !gyroSupported;
  gyroBox.addEventListener('change', async () => {
    if (gyroBox.checked && typeof window.DeviceOrientationEvent?.requestPermission === 'function') { // iOS 需在使用者操作中授權
      try { if ((await window.DeviceOrientationEvent.requestPermission()) !== 'granted') { gyroBox.checked = false; app.toast('未取得動態感測器權限'); return; } } catch { gyroBox.checked = false; return; }
    }
    app.setPref('clockGyro', gyroBox.checked);
  });
  root.appendChild(h('div', { class: 'card no-print clk-controls' },
    h('label', { class: 'row clk-toggle' }, popBox, h('span', { text: `秒針旁顯示每秒浮動的${noun}` })),
    h('label', { class: 'row clk-toggle' }, soundBox, h('span', { text: soundSupported() ? '秒針滴答聲（純 JS 合成，預設關閉）' : '秒針滴答聲（此瀏覽器不支援）' })),
    h('label', { class: 'row clk-toggle' }, gyroBox, h('span', { text: gyroSupported ? `${noun}隨手機傾斜（陀螺儀，預設關閉；資料只在本機處理）` : `${noun}隨手機傾斜（此裝置不支援）` })),
    h('label', { class: 'row clk-toggle' }, capIn, h('span', { text: `堆積上限（0–100 顆；0＝不堆積，浮出後淡出）` })),
    h('p', { class: 'note', text: `跳出的${noun}會落到地上慢慢堆起來，台北時間每天重新開始。超過上限時，最舊的一顆淡出並把數字加到最新的一顆；已達上限時，兩顆碰撞就合併成一顆、數字相加。也可以用滑鼠或手指按住一顆拖動；把它壓在另一顆身上、持續一下（兩顆會亮起外框），就能手動合併，不受上限限制。沒有開啟「減少動態效果」的裝置才會有堆積動畫。` })));

  // ---- 里程表數字 ----
  const counters = new Map();
  const ctx = {
    counter(key) {
      if (!counters.has(key)) counters.set(key, rollingNumber((cfg.fmtAcc ?? fmt5)(0), { animate: !reduce }));
      return counters.get(key);
    },
  };

  if (!(cfg.perSecond > 0)) {
    if (cfg.inactive) root.appendChild(typeof cfg.inactive === 'string' ? h('p', { class: 'note', text: cfg.inactive }) : cfg.inactive);
  } else {
    for (const n of cfg.stats(ctx)) root.appendChild(n);
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
    pileInfo.textContent = cap > 0 && popOn && cfg.perSecond > 0
      ? `堆積中：${p.size} 顆，合計 NT$ ${fmt5(p.total)}（等於「${cfg.todayLabel ?? '今天 00:00 起累積'}」，包含你不在頁面時累積的；每天 00:00 重新開始）`
      : '';
  };
  async function initPile() {
    if (pile || initializing || pileFailed || !(cap > 0) || !popOn || !(cfg.perSecond > 0) || reduce) return;
    if (!stage.isConnected || !stage.clientWidth) return;
    initializing = true;
    try {
      pile = await createInterestPile({ stage, layer, dial, digital, cap, day, onChange: showPile, storageKey: cfg.pileKey, prefix: cfg.sign, catchUp: nowTotal });
      if (!stage.isConnected) { pile.dispose(); pile = null; } else applyGyro();
    } catch (e) {
      pileFailed = true;
      console.warn('堆積（物理引擎）載入失敗，改用單純浮出', e);
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
  if (app.prefs.clockSound && !soundReady()) {
    const arm = () => { unlockSound().then((ok) => { if (ok) for (const ev of ARM) window.removeEventListener(ev, arm, true); }); };
    const ARM = ['pointerdown', 'keydown', 'touchend', 'click'];
    for (const ev of ARM) window.addEventListener(ev, arm, true);
  }

  const ymd = () => { const [y, m, d] = todayTaipei().split('-').map(Number); return { y, m, d }; };
  const nowTotal = () => cfg.todayTotal(taipeiClock(Date.now()), ymd());

  const floatPop = (secInt) => {
    const a = (secInt * 6 * Math.PI) / 180;
    const el = h('span', { class: 'clk-pop', text: `${cfg.sign}${smallMoney(cfg.perSecond)}` });
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
    // 累積金額：每 100 毫秒更新一次，各位數字各自平順滾動
    if (counters.size && (ts - lastAcc > 100 || secInt !== lastSec)) {
      lastAcc = ts;
      const vals = cfg.counters(c, ymd());
      for (const [k, r] of counters) if (k in vals) r.set((cfg.fmtAcc ?? fmt5)(vals[k]));
    }
    if (secInt !== lastSec) {
      const first = lastSec === -1;
      lastSec = secInt;
      digital.textContent = `${pad(c.h)}:${pad(c.m)}:${pad(secInt)}`;
      if (!first) {
        if (soundBox.checked && soundReady()) { flip = !flip; tick(flip); }
        const today = todayTaipei();
        if (today !== day) { day = today; pile?.reset(today); cfg.onDayChange?.(today); }
        if (popOn && !reduce && cfg.perSecond > 0 && (!cfg.active || cfg.active(c))) {
          if (pile && !pile.ready) { /* 還原中：差額會在下一秒補上 */ }
          else if (pile) {
            // 堆的合計要等於「今天起累積」：如果落後（分頁在背景、電腦睡眠）就把差額一次補上
            const gap = nowTotal() - pile.total;
            pile.spawn(secInt * 6, gap > cfg.perSecond * 2.5 ? gap : cfg.perSecond);
          }
          else if (cap === 0 || !initializing) floatPop(secInt);
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return root;
}
