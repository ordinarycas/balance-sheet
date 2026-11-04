// 應用程式進入點：載入狀態、計算模型、路由、行情／匯率更新。
import { getState, subscribe, getLoadNote, hasData } from './data/store.js';
import { BUILD_ID, BUILD_DATE } from './core/build.js';
import { APP_VERSION } from './core/constants.js';
import { canPrompt, isStandalone, onInstallChange, promptInstall } from './ui/install.js';
import { reminderBanner, runReminder } from './ui/reminder.js';
import { showError } from './ui/components/forms.js';
import { noteEdit, backupReminder, snoozeBackup } from './data/backup.js';
import { getPrefs, setPref } from './data/prefs.js';
import { fetchQuotes, fetchUsdTwd, clearQuoteCache } from './data/quotes.js';
import { computeModel } from './core/model.js';
import { todayTaipei } from './core/dates.js';
import { h, clear } from './ui/dom.js';
import { commit, setRenderHook, toast } from './ui/actions.js';
import { disposeCharts, chartsReady } from './ui/components/chart.js';
import { initBottomNav, updateBottomNav } from './ui/bottomnav.js';
import { checkForUpdate, applyUpdate, onUpdateState, state as updState } from './ui/update.js';

const ROUTES = [
  ['overview', 'P01 總覽', () => import('./ui/pages/overview.js')],
  ['charts', 'P13 圖表分析', () => import('./ui/pages/charts.js')],
  ['progress', 'P14 還款進度', () => import('./ui/pages/progress.js')],
  ['clock', 'P15 時鐘', () => import('./ui/pages/clock.js')],
  ['income', 'P16 收入網站資源', () => import('./ui/pages/income.js')],
  ['lifetime', 'P17 薪資收入與時間', () => import('./ui/pages/lifetime.js')],
  ['monthly', 'P02 每月支出', () => import('./ui/pages/monthly.js')],
  ['salary', 'P03 月薪情境', () => import('./ui/pages/salary.js')],
  ['calendar', 'P04 繳費日曆', () => import('./ui/pages/calendar.js')],
  ['loans', 'P05 借款', () => import('./ui/pages/loans.js')],
  ['schedule', 'P06 還款表', () => import('./ui/pages/schedule.js')],
  ['pledge', 'P07 股票質押', () => import('./ui/pages/pledge.js')],
  ['holdings', 'P08 持股與損益', () => import('./ui/pages/holdings.js')],
  ['expenses', 'P09 支出', () => import('./ui/pages/expenses.js')],
  ['settings', 'P10 設定', () => import('./ui/pages/settings.js')],
  ['help', 'P11 說明', () => import('./ui/pages/help.js')],
  ['data', 'P12 資料匯入／匯出', () => import('./ui/pages/data.js')],
];

export const app = {
  state: null,
  model: null,
  asOf: todayTaipei(),
  usdTwd: 32,
  fx: null,                 // {rate, source, date} | null
  fxStatus: 'idle',         // idle | loading | ok | fail
  quotes: {},               // code → {price, date, source}
  quoteInfo: { status: 'idle', fetchedAt: null, errors: [], missing: [], twse: null, finmind: null },
  prefs: getPrefs(),
  route: 'overview',
  commit,
  toast,
  navigate(name) { location.hash = `#/${name}`; },
  rerender: () => schedule(),
  print: printPage,
  refreshQuotes, refreshFx, setPref(k, v) { this.prefs = setPref(k, v); applyTheme(); schedule(); },
};

function stockCodes(state) {
  return [...state.pledge.stocks.map((s) => s.code), ...state.holdings.map((s) => s.code)].filter(Boolean);
}

function recompute() {
  const state = getState();
  app.state = state;
  app.prefs = getPrefs();
  app.asOf = state.settings.asOfDate || todayTaipei();
  app.usdTwd = app.prefs.autoFx && app.fx ? app.fx.rate : state.settings.usdTwdManual;
  try {
    app.model = computeModel(state, { asOf: app.asOf, usdTwd: app.usdTwd, quotes: app.quotes });
    app.modelError = null;
  } catch (e) {
    console.error(e);
    app.modelError = e;
  }
}

async function refreshQuotes(force = false) {
  const codes = stockCodes(getState());
  if (!codes.length) { app.quotes = {}; app.quoteInfo = { status: 'idle', fetchedAt: null, errors: [], missing: [], twse: null, finmind: null }; schedule(); return; }
  if (force) clearQuoteCache();
  app.quoteInfo = { ...app.quoteInfo, status: 'loading' };
  schedule();
  try {
    const r = await fetchQuotes(codes, { finmind: getPrefs().finmind, force });
    app.quotes = r.quotes;
    app.quoteInfo = { status: r.twse === 'ok' || Object.keys(r.quotes).length ? 'ok' : 'fail', fetchedAt: r.fetchedAt, errors: r.errors, missing: r.missing, twse: r.twse, finmind: r.finmind };
  } catch (e) {
    app.quoteInfo = { status: 'fail', fetchedAt: null, errors: [String(e.message || e)], missing: codes, twse: 'fail', finmind: null };
  }
  schedule();
}

async function refreshFx() {
  const hasUsd = getState().loans.some((l) => l.currency === 'USD');
  if (!hasUsd) { app.fx = null; app.fxStatus = 'idle'; schedule(); return; }
  app.fxStatus = 'loading';
  schedule();
  const fx = await fetchUsdTwd();
  app.fx = fx;
  app.fxStatus = fx ? 'ok' : 'fail';
  schedule();
}

function applyTheme() {
  const t = getPrefs().theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---- 渲染 ----
// 重繪排程：
//  1. 用 setTimeout(0)（而非 microtask）：Tab 切換欄位時，change 事件在焦點真正移到下一欄「之前」觸發，
//     延到下一個 task 再重繪，才能知道使用者要去哪個欄位並還原焦點。
//  2. 指標按下期間不重繪：否則在 mousedown 與 click 之間換掉 DOM，會讓按鈕的 click 被吞掉。
let wanted = false;
let timer = null;
let pointerDownAt = 0;
const pointerHeld = () => pointerDownAt && Date.now() - pointerDownAt < 3000;
function flush() {
  timer = null;
  if (!wanted) return;
  if (pointerHeld()) return; // 等 pointerup 後再補
  wanted = false;
  render();
}
function schedule() {
  wanted = true;
  if (!timer) timer = setTimeout(flush, 0);
}
document.addEventListener('pointerdown', () => { pointerDownAt = Date.now(); }, true);
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(ev, () => { pointerDownAt = 0; if (wanted && !timer) timer = setTimeout(flush, 0); }, true);
}
window.addEventListener('blur', () => { pointerDownAt = 0; });
setRenderHook(schedule);

function routeFromHash() {
  const m = /^#\/([a-z]+)/.exec(location.hash);
  return m && ROUTES.some((r) => r[0] === m[1]) ? m[1] : 'overview';
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  ROUTES.forEach(([key, label], i) => {
    if (key === 'settings') nav.appendChild(h('div', { class: 'sep' }));
    nav.appendChild(h('a', { href: `#/${key}`, 'aria-current': key === app.route ? 'page' : null }, label));
  });
  updateBottomNav(app.route);
}

function isDark() {
  const t = getPrefs().theme;
  return t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function renderTop() {
  const meta = document.getElementById('top-meta');
  const parts = [`基準日 ${app.asOf}`];
  if (getState().loans.some((l) => l.currency === 'USD')) {
    parts.push(`USD/TWD ${app.usdTwd.toFixed(4)}（${app.prefs.autoFx && app.fx ? '自動' : '手動'}）`);
  }
  if (app.quoteInfo.status === 'loading') parts.push('行情更新中…');
  const tt = document.getElementById('theme-toggle');
  if (tt) { const dark = isDark(); tt.textContent = dark ? '☀ 淺色' : '☾ 深色'; tt.setAttribute('aria-label', dark ? '切換為淺色主題' : '切換為深色主題'); }
  else if (app.quoteInfo.status === 'ok') parts.push(`行情 ${Object.keys(app.quotes).length} 檔`);
  meta.textContent = parts.join('　·　');
}

// 重繪時保留：焦點與游標位置、<details> 展開狀態、尚未送出的 textarea 內容
const FOCUSABLE = 'input,select,textarea,button,a[href],summary';
let renderedRoute = null;
function captureUiState(main) {
  const ae = document.activeElement;
  let focus = null;
  if (ae && main.contains(ae)) {
    const idx = [...main.querySelectorAll(FOCUSABLE)].indexOf(ae);
    if (idx >= 0) focus = { idx, tag: ae.tagName, type: ae.type, ss: ae.selectionStart ?? null, se: ae.selectionEnd ?? null };
  }
  // 就地錯誤：重繪（例如行情稍後才回來）不能把使用者還沒改正的錯誤吃掉
  const invalid = [];
  [...main.querySelectorAll(FOCUSABLE)].forEach((el, idx) => {
    if (el.getAttribute('aria-invalid') !== 'true') return;
    const msg = document.getElementById(el.getAttribute('aria-describedby') || '')?.textContent;
    if (msg) invalid.push({ idx, tag: el.tagName, type: el.type, value: el.value, msg });
  });
  return {
    focus,
    invalid,
    details: [...main.querySelectorAll('details')].map((d) => d.open),
    areas: [...main.querySelectorAll('textarea')].map((t) => t.value),
  };
}
function restoreUiState(main, keep) {
  const ds = main.querySelectorAll('details');
  if (ds.length === keep.details.length) ds.forEach((d, i) => { d.open = keep.details[i]; });
  const ts = main.querySelectorAll('textarea');
  if (ts.length === keep.areas.length) ts.forEach((t, i) => { if (keep.areas[i] && !t.value) t.value = keep.areas[i]; });
  const all = [...main.querySelectorAll(FOCUSABLE)];
  for (const v of keep.invalid) {
    const el = all[v.idx];
    if (el && el.tagName === v.tag && el.type === v.type) { el.value = v.value; showError(el, [v.msg]); }
  }
  const f = keep.focus;
  if (!f) return;
  const el = [...main.querySelectorAll(FOCUSABLE)][f.idx];
  if (el && el.tagName === f.tag && el.type === f.type) {
    el.focus({ preventScroll: true });
    try { if (f.ss !== null) el.setSelectionRange(f.ss, f.se); } catch { /* number／date 欄位不支援 */ }
  }
}

function backupBanner(msg) {
  return h('div', { class: 'banner no-print', role: 'status' }, h('span', { text: `${msg} ` }),
    h('a', { href: '#/data', text: '前往備份' }), '　',
    h('button', { type: 'button', class: 'small', text: '7 天後再提醒', onClick: () => { snoozeBackup(); schedule(); } }));
}

let renderToken = 0;
let lastRender = Promise.resolve();
function render() { lastRender = doRender(); return lastRender; }
async function doRender() {
  const token = ++renderToken;
  recompute();
  app.route = routeFromHash();
  renderNav();
  renderTop();
  const main = document.getElementById('main');
  const y = window.scrollY;
  disposeCharts();
  const sameRoute = app.route === renderedRoute;
  let node;
  try {
    if (app.modelError) throw app.modelError;
    const mod = await ROUTES.find((r) => r[0] === app.route)[2]();
    if (token !== renderToken) return;
    node = mod.default(app);
  } catch (e) {
    console.error(e);
    node = h('div', { class: 'banner error' }, `頁面發生錯誤：${e.message || e}。可前往「P12 資料匯入／匯出」還原或清除本機資料。`);
  }
  const note = getLoadNote();
  const reminder = app.route === 'data' ? null : backupReminder(hasData());
  const keep = sameRoute ? captureUiState(main) : null;
  const upd = app.updateReady || updState.available ? h('div', { class: 'banner no-print', role: 'status' }, h('strong', { text: '網站已有新版本。' }), ' 按下「立即更新」即可套用（你的資料不會受影響）。　',
    h('button', { type: 'button', class: 'small', text: '立即更新', onClick: () => applyUpdate() })) : null;
  const due = app.route === 'data' ? null : reminderBanner(app, schedule);
  main.replaceChildren(...(note ? [h('div', { class: 'banner' }, note)] : []), ...(upd ? [upd] : []), ...(due ? [due] : []), ...(reminder ? [backupBanner(reminder)] : []), node);
  renderedRoute = app.route;
  if (keep) restoreUiState(main, keep);
  document.title = `${ROUTES.find((r) => r[0] === app.route)[1].replace(/^P\d+ /, '')} - 個人資產負債表`;
  window.scrollTo(0, y);
  main.appendChild(h('p', { class: 'build-info no-print' }, `版本 ${APP_VERSION}　·　更新於 ${BUILD_DATE}　·　${BUILD_ID}　`, h('button', { type: 'button', class: 'linklike', text: updState.checking ? '檢查中…' : '檢查更新', disabled: updState.checking, onClick: () => checkForUpdate() })));
  runReminder(app);
}

// 列印：先切成淺色並重繪（圖表也用淺色），等圖表畫完再開列印對話框，結束後還原主題
async function printPage() {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = 'light';
  await render();
  await chartsReady();
  await new Promise((r) => requestAnimationFrame(() => r()));
  const restore = () => { if (prev) root.dataset.theme = prev; else delete root.dataset.theme; applyTheme(); schedule(); };
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
}

// 「跳到主要內容」：不能讓 #main 變成網址 hash（會被路由當成未知頁面而跳回總覽），改成直接移動焦點
document.querySelector('a.skip')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });

document.addEventListener('pfs:setpref', (e) => app.setPref(e.detail.key, e.detail.value));

let lastRoute = null;
window.addEventListener('hashchange', () => {
  const r = routeFromHash();
  if (r !== lastRoute) { lastRoute = r; window.scrollTo(0, 0); document.getElementById('main').focus(); }
  render();
});

let lastCodes = '';
let lastHasUsd = null;
subscribe((s) => {
  noteEdit();
  // 股票代號或幣別改變時，重新取得行情／匯率
  const codes = stockCodes(s).join(',');
  if (codes !== lastCodes) { lastCodes = codes; if (getPrefs().autoQuotes) refreshQuotes(); }
  const hasUsd = s.loans.some((l) => l.currency === 'USD');
  if (hasUsd !== lastHasUsd) { lastHasUsd = hasUsd; if (hasUsd && getPrefs().autoFx) refreshFx(); }
  schedule();
});

// 離線支援（PWA）：只在 HTTPS 註冊；本機開發（localhost）預設不註冊，避免舊快取干擾，要測試請加 ?sw=1
if ('serviceWorker' in navigator) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ((location.protocol === 'https:' && !local) || (local && new URLSearchParams(location.search).has('sw'))) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { app.updateReady = true; schedule(); } });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      app.swReg = reg;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('Service Worker 註冊失敗', e));
  }
}

// 回到前景時重新檢查（跨日後才打開 App 也會提醒）
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });

// 安裝為 App：頂欄按鈕只在「可安裝」時顯示（Chromium 系）；iOS 與其他瀏覽器請到「P10 設定」看步驟
{
  const btn = document.getElementById('install-app');
  const sync = () => { if (btn) btn.hidden = !canPrompt() || isStandalone(); };
  onInstallChange(() => { sync(); schedule(); });
  sync();
  btn?.addEventListener('click', async () => { const r = await promptInstall(); if (r === 'accepted') toast('已安裝，可從主畫面開啟'); });
}

applyTheme();
initBottomNav(ROUTES, { onCheckUpdate: () => checkForUpdate() });
onUpdateState(() => schedule());
// 回到前景時靜默檢查一次（最多每 30 分鐘一次），發現新版就顯示橫幅
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - updState.lastCheckAt > 30 * 60 * 1000) checkForUpdate({ quiet: true }); });
checkForUpdate({ quiet: true });
document.getElementById('theme-toggle')?.addEventListener('click', () => app.setPref('theme', isDark() ? 'light' : 'dark'));
// 「自動」主題：系統深淺色改變時即時重繪（含圖表）
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getPrefs().theme === 'auto') schedule(); });
lastRoute = routeFromHash();
{
  const s = getState();
  lastCodes = stockCodes(s).join(',');
  lastHasUsd = s.loans.some((l) => l.currency === 'USD');
}
render();
if (getPrefs().autoQuotes) refreshQuotes();
if (getPrefs().autoFx) refreshFx();

