// 手動檢查網站更新。
//  1. 直接向伺服器取最新的 build.js（繞過 Service Worker 與瀏覽器快取），比對版本代號；
//     這在沒有 Service Worker 的環境（HTTP、本機、隱私模式）也能運作。
//  2. 有 Service Worker 時一併要求它檢查新版本。
//  發現新版後由頁面頂端的橫幅提示「立即更新」。
import { BUILD_ID } from '../core/build.js';
import { toast } from './actions.js';

export const state = { checking: false, lastCheckAt: 0, available: false, remote: null };
const listeners = new Set();
export const onUpdateState = (f) => { listeners.add(f); };
const emit = () => listeners.forEach((f) => f());

/** @returns {Promise<'latest'|'available'|'error'>} */
export async function checkForUpdate({ quiet = false } = {}) {
  if (state.checking) return 'latest';
  state.checking = true; emit();
  let result = 'error';
  try {
    const res = await fetch(`js/core/build.js?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const id = /BUILD_ID = '([^']+)'/.exec(text)?.[1];
    const date = /BUILD_DATE = '([^']+)'/.exec(text)?.[1];
    if (!id) throw new Error('無法辨識版本');
    state.remote = { id, date };
    state.available = id !== BUILD_ID;
    result = state.available ? 'available' : 'latest';
    try { (await navigator.serviceWorker?.getRegistration())?.update().catch(() => {}); } catch { /* 沒有 Service Worker */ }
  } catch (e) {
    console.warn('檢查更新失敗', e);
  } finally {
    state.checking = false;
    state.lastCheckAt = Date.now();
    emit();
  }
  if (!quiet) {
    toast(result === 'available' ? `有新版本（${state.remote.date}），請按頁面頂端的「立即更新」`
      : result === 'latest' ? '已是最新版本' : '檢查失敗，請確認網路連線後再試', result === 'error' ? 'error' : 'info');
  }
  return result;
}

/** 套用更新：清掉本站的離線快取後重新載入，確保拿到的是新檔（資料在 localStorage，不受影響）。 */
export async function applyUpdate() {
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* 略過 */ }
  try { for (const k of await caches.keys()) if (k.startsWith('pfs-')) await caches.delete(k); } catch { /* 略過 */ }
  location.reload();
}

export const lastCheckText = () => (state.lastCheckAt ? `上次檢查 ${new Date(state.lastCheckAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}` : '尚未檢查');
