// localStorage 的安全包裝：私密模式、停用儲存或配額已滿時退回記憶體，不丟例外。
const mem = new Map();
let usingMemory = false;

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
    try { s.setItem(key, value); mem.delete(key); return true; } catch { /* fallthrough */ }
  }
  usingMemory = true;
  mem.set(key, value);
  return false;
}

export function safeRemove(key) {
  mem.delete(key);
  const s = ls();
  if (s) { try { s.removeItem(key); } catch { /* ignore */ } }
}

export function isMemoryOnly() {
  return usingMemory || !ls();
}
