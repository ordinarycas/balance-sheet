// 安裝為 App（PWA）：集中處理 beforeinstallprompt，讓頂欄按鈕與設定頁共用同一份狀態。
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

export const onInstallChange = (f) => { listeners.add(f); };
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferred;

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
window.addEventListener('appinstalled', () => { deferred = null; emit(); });

/** 必須在使用者點擊中呼叫。回傳 accepted／dismissed／unavailable。 */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const d = deferred;
  deferred = null;
  d.prompt();
  const { outcome } = await d.userChoice;
  emit();
  return outcome;
}

/** installed／prompt（可一鍵安裝）／ios（手動加入主畫面）／manual（用瀏覽器選單） */
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}
