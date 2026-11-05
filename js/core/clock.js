// 時鐘頁用的純函式（無 DOM）：台北時間拆解、每秒利息。
// 每秒利息＝總覽的「今日日息」÷ 86,400 秒；它是每秒「累積」的利息，不是每秒要付的錢（實際扣款依還款表）。
const DAY_S = 86400;
const TZ_OFFSET_S = 8 * 3600; // Asia/Taipei 無日光節約時間

/** 台北時間的時、分、秒（秒含小數，供秒針平滑轉動）與當日已過秒數。 */
export function taipeiClock(ms) {
  const s = (((ms / 1000 + TZ_OFFSET_S) % DAY_S) + DAY_S) % DAY_S;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { h, m, sec, secOfDay: s };
}

/** 秒針、分針、時針角度（度，12 點方向為 0，順時針）。 */
export function handAngles({ h, m, sec }) {
  return { second: sec * 6, minute: (m + sec / 60) * 6, hour: ((h % 12) + m / 60 + sec / 3600) * 30 };
}

/**
 * 依總覽的負債列算出每秒利息。
 * @param {{name:string, bal:number, rate:number, daily:number}[]} rows
 */
export function interestPerSecond(rows) {
  const parts = rows
    .filter((r) => Number.isFinite(r.daily) && r.daily > 0)
    .map((r) => ({ name: r.name, balanceTWD: r.bal, annualRate: r.rate, daily: r.daily, perSecond: r.daily / DAY_S }));
  const daily = parts.reduce((a, p) => a + p.daily, 0);
  return { parts, daily, perSecond: daily / DAY_S, perMinute: daily / 1440, perHour: daily / 24 };
}

/** 今天（台北時間 00:00 起）到現在累積的利息。 */
export function accruedToday(daily, secOfDay) {
  return (daily * secOfDay) / DAY_S;
}

/** 小額金額：至少顯示到有效數字，避免 0.0003 顯示成 0.00。 */
export function smallMoney(v) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ---- 薪資時鐘：把月薪代入（假設：月薪平均分攤到每一天、每一秒；實際發薪日以公司為準）----

/** 月薪 → 每日／每秒／每分鐘／每小時。每日＝月薪 ÷ 當月天數，所以整個月累積剛好等於月薪。 */
export function payPerSecond(monthly, daysInMonth) {
  const m = Number.isFinite(monthly) && monthly > 0 ? monthly : 0;
  const days = Number.isFinite(daysInMonth) && daysInMonth >= 28 ? Math.round(daysInMonth) : 30;
  const daily = m / days;
  return { monthly: m, days, daily, perSecond: daily / DAY_S, perMinute: daily / 1440, perHour: daily / 24 };
}

/** 本月 1 日 00:00（台北時間）起累積；dayOfMonth 從 1 起算。 */
export function accruedMonth(daily, dayOfMonth, secOfDay) {
  return daily * (Math.max(dayOfMonth, 1) - 1) + accruedToday(daily, secOfDay);
}

/** 賺到 amount 元要多少秒；每秒收入為 0 時回傳 null。 */
export function secondsToEarn(amount, perSecond) {
  return perSecond > 0 && Number.isFinite(amount) && amount >= 0 ? amount / perSecond : null;
}

/** 把秒數說成「約 N 秒／分鐘／小時」。 */
export function spanSeconds(s) {
  if (s === null || !Number.isFinite(s)) return '—';
  if (s < 90) return `約 ${Math.max(1, Math.round(s))} 秒`;
  if (s < 5400) return `約 ${Math.round(s / 60)} 分鐘`;
  return `約 ${(s / 3600).toFixed(1)} 小時`;
}

// ---- 上下班時間：有設定時，薪資只在上班時段累積（同一天內，下班時間需晚於上班時間）----

/** 'HH:MM' → 當天第幾秒；格式不對回傳 null。 */
export function hhmmToSec(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s ?? ''));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
}

/** 上下班時間 → {startSec,endSec,workSec}；沒設定或不合理（下班不晚於上班）回傳 null＝整天。 */
export function workWindow(startStr, endStr) {
  const a = hhmmToSec(startStr);
  const b = hhmmToSec(endStr);
  return a !== null && b !== null && b > a ? { startSec: a, endSec: b, workSec: b - a } : null;
}

/** 今天（00:00 起）已經在上班時段內累積的薪資。win 為 null 時＝整天平均。 */
export function accruedWork(daily, win, secOfDay) {
  if (!win) return accruedToday(daily, secOfDay);
  const worked = Math.min(Math.max(secOfDay - win.startSec, 0), win.workSec);
  return (daily * worked) / win.workSec;
}

/** 現在是否在上班時段內（沒設定＝一直是）。 */
export function inWindow(win, secOfDay) {
  return !win || (secOfDay >= win.startSec && secOfDay < win.endSec);
}
