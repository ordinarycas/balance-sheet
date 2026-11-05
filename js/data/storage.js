// localStorage 的安全包裝：私密模式、停用儲存或配額已滿時退回記憶體，不丟例外。
const mem = new Map();
let usingMemory = false;   // 曾經退回記憶體（不會自動復原）
let lastFailed = false;    // 最近一次寫入是否失敗（成功寫入後恢復）
const failListeners = new Set();

/** 寫入從成功變成失敗（或第一次失敗）時呼叫，讓畫面通知使用者資料沒有存下。 */
export function onStorageFailure(fn) { failListeners.add(fn); }

function ls() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function safeGet(key) {
  const s = ls();
  if (s) {
    try { return s.getItem(key); } catch { /* fallthrough */ }
  }
  return mem.has(key) ? mem.get(key) : null;
}

/** @returns {boolean} 是否寫入了持久儲存 */
export function safeSet(key, value) {
  const s = ls();
  if (s) {
    try { s.setItem(key, value); mem.delete(key); lastFailed = false; return true; } catch { /* fallthrough */ }
  }
  usingMemory = true;
  mem.set(key, value);
  if (!lastFailed) { lastFailed = true; failListeners.forEach((f) => { try { f(); } catch { /* 略過 */ } }); }
  return false;
}

export function safeRemove(key) {
  mem.delete(key);
  const s = ls();
  if (s) { try { s.removeItem(key); } catch { /* ignore */ } }
}

/** 目前資料是否「沒有」存進瀏覽器（隱私模式、停用儲存或空間已滿）。成功寫入後會恢復為 false。 */
export function isMemoryOnly() {
  return lastFailed || !ls();
}

/** 是否曾經退回記憶體（測試用）。 */
export const everFellBack = () => usingMemory;
