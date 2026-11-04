// 使用者偏好（僅存本機 localStorage，不屬於 JSON 匯出結構）。
import { safeGet, safeSet } from './storage.js';

const KEY = 'pfs.prefs.v1';

export const DEFAULT_PREFS = {
  autoQuotes: true,        // 開啟時自動向公開行情服務取得最近收盤價
  finmind: false,          // 證交所查無時，改向 FinMind 逐檔查詢（會送出股票代號）
  autoFx: true,            // 自動取得 USD/TWD 匯率
  hideExportWarning: false,
  lastBackupAt: 0,         // 上次匯出備份時間（毫秒）
  editsSinceBackup: 0,     // 備份後的修改次數
  backupSnoozeUntil: 0,    // 暫停備份提醒到何時（毫秒）
  remindTomorrow: false,   // 明天有應繳項目時提醒（橫幅＋系統通知）
  remindNotifiedDay: '',   // 最近一次送出系統通知的日期（每天一次）
  remindSeenDay: '',       // 最近一次按「知道了」的日期
  chartLib: 'lw',         // 圖表引擎：lw | chartjs | d3 | apex
  theme: 'light',          // light（預設）| dark | auto（跟隨系統）
};

let cache = null;

export function getPrefs() {
  if (cache) return cache;
  let saved = {};
  try { saved = JSON.parse(safeGet(KEY) || '{}') || {}; } catch { saved = {}; }
  const p = { ...DEFAULT_PREFS };
  for (const k of Object.keys(DEFAULT_PREFS)) {
    if (typeof saved[k] === typeof DEFAULT_PREFS[k]) p[k] = saved[k];
  }
  if (!['auto', 'light', 'dark'].includes(p.theme)) p.theme = 'auto';
  if (!['lw', 'chartjs', 'd3', 'apex'].includes(p.chartLib)) p.chartLib = 'lw';
  cache = p;
  return p;
}

export function setPref(key, value) {
  const p = { ...getPrefs(), [key]: value };
  cache = p;
  safeSet(KEY, JSON.stringify(p));
  return p;
}
