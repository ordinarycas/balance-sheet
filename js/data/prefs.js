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
  chartIncomeMode: 'fixed', // 圖表分析的收入情境：fixed（固定收入）| zero（完全沒有收入）
  chartIncome: 0,          // 固定月收入（NT$）；0＝沿用月薪情境第一筆
  chartHorizon: 60,        // 推演月數
  whatIfMonthly: 0,        // 還款進度頁：每月多還（NT$）試算
  whatIfLump: 0,           // 還款進度頁：下一期一次多還（NT$）試算
  goalExtraIncome: 0,      // 還款進度頁：想增加的月收入（NT$）試算
  bufferCash: 0,           // 還款進度頁：目前可動用的現金／存款（NT$，只存本機）
  bufferTargetMonths: 6,   // 預備金目標（月）
  extraIncomeLog: [],      // 額外收入紀錄 [{id,date,amount,pct}]（只存本機、不匯出）
  remindTone: 'neutral',   // 提醒語氣 neutral | encourage
  lifeSex: '',             // 薪資收入與時間：性別 male | female（只存本機、不匯出）
  lifeBirth: '',           // 生日 YYYY-MM-DD（只存本機、不匯出）
  lifeRetire: 65,          // 預計退休年齡
  lifeMonthly: 0,          // 自訂月收入
  lifeWage: 'current',     // current | proposed | custom
  lifeUseBS: false,        // 是否代入資產負債
  clockPop: true,          // 時鐘頁：秒針旁浮出每秒利息
  clockSound: false,       // 時鐘頁：秒針滴答聲（預設關閉）
  clockGyro: false,        // 時鐘頁：利息隨手機傾斜（陀螺儀），預設關閉
  clockCap: 30,            // 時鐘頁：利息堆積上限 0–100（0＝不堆積）
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
  if (!['fixed', 'zero'].includes(p.chartIncomeMode)) p.chartIncomeMode = 'fixed';
  if (![12, 24, 36, 60, 120].includes(p.chartHorizon)) p.chartHorizon = 60;
  for (const k of ['whatIfMonthly', 'whatIfLump', 'goalExtraIncome']) if (!Number.isFinite(p[k]) || p[k] < 0) p[k] = 0;
  if (!['male', 'female'].includes(p.lifeSex)) p.lifeSex = '';
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.lifeBirth)) p.lifeBirth = '';
  if (!['current', 'proposed', 'custom'].includes(p.lifeWage)) p.lifeWage = 'current';
  p.lifeRetire = Number.isFinite(p.lifeRetire) ? Math.min(Math.max(Math.round(p.lifeRetire), 40), 80) : 65;
  if (!Number.isFinite(p.lifeMonthly) || p.lifeMonthly < 0) p.lifeMonthly = 0;
  if (!['neutral', 'encourage'].includes(p.remindTone)) p.remindTone = 'neutral';
  if (!Number.isFinite(p.bufferCash) || p.bufferCash < 0) p.bufferCash = 0;
  if (!Number.isFinite(p.bufferTargetMonths) || p.bufferTargetMonths < 1 || p.bufferTargetMonths > 36) p.bufferTargetMonths = 6;
  p.extraIncomeLog = (Array.isArray(p.extraIncomeLog) ? p.extraIncomeLog : []).filter((e) => e && typeof e.id === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(e.date) && Number.isFinite(e.amount) && e.amount > 0 && Number.isFinite(e.pct) && e.pct >= 0 && e.pct <= 100).slice(0, 200);
  p.clockGyro = p.clockGyro === true;
  p.clockCap = Number.isFinite(p.clockCap) ? Math.min(Math.max(Math.round(p.clockCap), 0), 100) : 30;
  if (!Number.isFinite(p.chartIncome) || p.chartIncome < 0) p.chartIncome = 0;
  cache = p;
  return p;
}

export function setPref(key, value) {
  const p = { ...getPrefs(), [key]: value };
  cache = p;
  safeSet(KEY, JSON.stringify(p));
  return p;
}
