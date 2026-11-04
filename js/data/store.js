// 狀態儲存：單一來源（Single Source of Truth）。輸入資料存於 localStorage，變更時通知訂閱者。
import { validateObject } from './validate.js';
import { emptyState, SECTIONS } from './schema.js';
import { safeGet, safeSet, safeRemove } from './storage.js';

const KEY = 'pfs.state.v1';
const RESTORE_KEY = 'pfs.restore.v1';

let state = null;
let loadNote = null;
const subs = new Set();

function load() {
  const raw = safeGet(KEY);
  if (!raw) return emptyState();
  try {
    const res = validateObject(JSON.parse(raw));
    if (res.ok) return res.data;
    loadNote = '本機儲存的資料驗證失敗，已改用空白資料（原資料仍保留在瀏覽器中，未被覆寫，直到你下次編輯）。';
  } catch {
    loadNote = '本機儲存的資料無法解析，已改用空白資料。';
  }
  return emptyState();
}

export function getState() {
  if (!state) state = load();
  return state;
}

export function getLoadNote() { return loadNote; }

export function hasData() {
  const s = getState();
  return s.loans.length > 0 || s.pledge.stocks.length > 0 || s.holdings.length > 0
    || s.cards.entries.length > 0 || s.realizedPnl.length > 0;
}

function persist() {
  return safeSet(KEY, JSON.stringify(state));
}

function emit() {
  for (const fn of subs) { try { fn(state); } catch (e) { console.error(e); } }
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** 以 mutator 修改複本並寫入；回傳是否持久化成功。 */
export function update(mutator) {
  const draft = structuredClone(getState());
  mutator(draft);
  state = draft;
  const ok = persist();
  emit();
  return ok;
}

/** 以完整狀態取代（已通過驗證）。 */
export function replaceState(next) {
  state = next;
  loadNote = null;
  const ok = persist();
  emit();
  return ok;
}

// ---- 還原點 ----
export function saveRestorePoint() {
  safeSet(RESTORE_KEY, JSON.stringify(getState()));
}
export function hasRestorePoint() {
  return !!safeGet(RESTORE_KEY);
}
export function restore() {
  const raw = safeGet(RESTORE_KEY);
  if (!raw) return false;
  const res = validateObject(JSON.parse(raw));
  if (!res.ok) return false;
  replaceState(res.data);
  safeRemove(RESTORE_KEY);
  return true;
}

/**
 * 原子套用匯入：先建立還原點；全部合併完成且重新驗證通過才寫入。
 * @param {object} incoming 已驗證的完整資料
 * @param {'replace'|'merge'} mode
 * @param {string[]} sections merge 模式要取代的區塊
 */
export function applyImport(incoming, mode, sections = SECTIONS) {
  const current = getState();
  let next;
  if (mode === 'replace') next = structuredClone(incoming);
  else {
    next = structuredClone(current);
    for (const s of sections) next[s] = structuredClone(incoming[s]);
  }
  const check = validateObject(next);
  if (!check.ok) return { ok: false, errors: check.errors };
  saveRestorePoint();
  replaceState(check.data);
  return { ok: true };
}

export function clearAll() {
  safeRemove(KEY);
  safeRemove(RESTORE_KEY);
  state = emptyState();
  loadNote = null;
  emit();
}
