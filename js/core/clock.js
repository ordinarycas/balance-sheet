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
