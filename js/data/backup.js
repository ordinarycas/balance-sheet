// 備份提醒：資料只存在瀏覽器，清除快取或換裝置就會消失。
// 只在本機記錄「上次備份時間／備份後的修改次數／暫停提醒到何時」，不含任何財務內容。
import { getPrefs, setPref } from './prefs.js';

const DAY = 86400000;
export const THRESHOLD_EDITS_FIRST = 5;   // 從未備份：修改達此次數就提醒
export const THRESHOLD_DAYS = 30;          // 備份過：超過此天數且之後又修改過才提醒
export const SNOOZE_DAYS = 7;

/** 資料有變動時呼叫（不觸發重繪）。 */
export function noteEdit() {
  setPref('editsSinceBackup', getPrefs().editsSinceBackup + 1);
}

/** 匯出 JSON／Excel 成功後呼叫。 */
export function markBackup(now = Date.now()) {
  setPref('lastBackupAt', now);
  setPref('editsSinceBackup', 0);
  setPref('backupSnoozeUntil', 0);
}

export function snoozeBackup(now = Date.now()) {
  setPref('backupSnoozeUntil', now + SNOOZE_DAYS * DAY);
}

/** @returns {string|null} 需要提醒時回傳訊息，否則 null */
export function backupReminder(hasData, now = Date.now(), prefs = getPrefs()) {
  if (!hasData || now < prefs.backupSnoozeUntil) return null;
  const edits = prefs.editsSinceBackup;
  if (!prefs.lastBackupAt) {
    return edits >= THRESHOLD_EDITS_FIRST ? `你已修改資料 ${edits} 次，但還沒有備份過。資料只存在這個瀏覽器，清除網站資料就會消失。` : null;
  }
  const days = Math.floor((now - prefs.lastBackupAt) / DAY);
  return days >= THRESHOLD_DAYS && edits > 0 ? `上次備份在 ${days} 天前，之後已修改 ${edits} 次。` : null;
}
