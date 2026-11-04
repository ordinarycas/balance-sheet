// 繳費提醒（Notification API）：
//  · 開啟／回到 App 時，若明天有應繳項目，顯示頁內橫幅，並在已授權時送出系統通知（每天一次）。
//  · 支援時（Android 已安裝的 Chrome／Edge）另註冊 Periodic Background Sync，讓 Service Worker 在背景盡力檢查。
//  · 全程在本機執行；寫入快取的快照只含接下來 14 天的日期、項目、金額，不離開此瀏覽器。
import { h } from './dom.js';
import { todayTaipei } from '../core/dates.js';
import { dueOn, tomorrowOf, describeDue, snapshot } from '../data/reminders.js';
import { setPref } from '../data/prefs.js';

export const SNAPSHOT_CACHE = 'reminders-data';
export const SNAPSHOT_URL = './__reminders.json';

export const supported = () => typeof Notification !== 'undefined';
export const permission = () => (supported() ? Notification.permission : 'unsupported');

/** 使用者按下開啟時呼叫（必須在點擊事件中，iOS 才允許要求權限）。回傳 granted／denied／default／unsupported。 */
export async function enable(app) {
  if (!supported()) return 'unsupported';
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p === 'granted') await registerBackground();
  syncSnapshot(app);
  return p;
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
}

async function registerBackground() {
  const reg = await registration();
  if (!reg || !('periodicSync' in reg)) return false;
  try { await reg.periodicSync.register('pfs-remind', { minInterval: 12 * 3600 * 1000 }); return true; } catch { return false; }
}

/** 取消勾選＝完全關閉：停止背景檢查、刪除本機快照、關掉已顯示的通知、清除今日已通知記錄。 */
export async function disable() {
  await unregisterBackground();
  const reg = await registration();
  try { (await reg?.getNotifications?.() ?? []).filter((n) => String(n.tag).startsWith('pfs-due-')).forEach((n) => n.close()); } catch { /* 略過 */ }
  setPref('remindNotifiedDay', '');
  setPref('remindSeenDay', '');
}

export async function unregisterBackground() {
  const reg = await registration();
  try { await reg?.periodicSync?.unregister('pfs-remind'); } catch { /* 不支援即略過 */ }
  try { await caches.delete(SNAPSHOT_CACHE); } catch { /* 略過 */ }
}

/** 把接下來 14 天的應繳快照寫進快取，供 Service Worker 背景使用。 */
export async function syncSnapshot(app) {
  if (!app.prefs.remindTomorrow || !('caches' in window)) return;
  try {
    const c = await caches.open(SNAPSHOT_CACHE);
    await c.put(SNAPSHOT_URL, new Response(JSON.stringify({ today: todayTaipei(), items: snapshot(app.model.calendar.events, todayTaipei()), tone: app.prefs.remindTone }), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* 私密模式等情況略過 */ }
}

export function tomorrowDue(app) {
  if (!app.model) return [];
  return dueOn(app.model.calendar.events, tomorrowOf(todayTaipei()));
}

async function show(title, body, tag) {
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'zh-Hant' };
  const reg = await registration();
  if (reg?.showNotification) { await reg.showNotification(title, opts); return; }
  new Notification(title, opts); // 沒有 Service Worker（例如本機開發）時
}

/** 每次重繪後呼叫：同步快照、必要時送出今天的系統通知。 */
export async function runReminder(app) {
  if (!app.prefs.remindTomorrow || app.modelError) return;
  syncSnapshot(app);
  const today = todayTaipei();
  const list = tomorrowDue(app);
  if (!list.length || app.prefs.remindNotifiedDay === today || permission() !== 'granted') return;
  setPref('remindNotifiedDay', today); // 先記錄再送，避免重繪時重複
  const { title, body } = describeDue(list, app.prefs.remindTone);
  try { await show(title, body, `pfs-due-${tomorrowOf(today)}`); } catch (e) { console.warn('通知失敗', e); }
}

/** 頁內橫幅（不依賴通知權限，是最可靠的提醒）；可「知道了」關閉到明天。 */
export function reminderBanner(app, rerender) {
  if (!app.prefs.remindTomorrow) return null;
  const today = todayTaipei();
  if (app.prefs.remindSeenDay === today) return null;
  const list = tomorrowDue(app);
  if (!list.length) return null;
  const { title, body } = describeDue(list, app.prefs.remindTone);
  return h('div', { class: 'banner no-print', role: 'status' },
    h('strong', { text: `${title}　` }), h('span', { text: body.replace(/\n/g, '；') }), '　',
    h('a', { href: '#/calendar', text: '看繳費日曆' }), '　',
    h('button', { type: 'button', class: 'small', text: '知道了', onClick: () => { setPref('remindSeenDay', today); rerender(); } }));
}
