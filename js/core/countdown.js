// 倒數計時所需的純函式：下一筆還款、下一個發薪日。日期一律以台北時間的 YYYY-MM-DD 表示。
import { dn, iso, firstOfMonth, dayInMonthOf } from './dates.js';

/** 算「還款」的類別：借款、信用卡帳單、股票質押利息（房租、水電網路不算）。 */
export const REPAY_CATS = ['借款', '信用卡', '股票質押'];

/** 今天（含）以後第一筆應繳的還款；events 需已依日期排序。 */
export function nextRepayment(events, today) {
  return events.find((e) => e.date >= today && e.amount < 0 && REPAY_CATS.includes(e.cat)) ?? null;
}

/** 下一個發薪日（今天含）。payDay 為 1–31；當月沒有該日（如 31 日）時取月底。 */
export function nextPayday(today, payDay) {
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) return null;
  const m0 = firstOfMonth(dn(today));
  const thisMonth = dayInMonthOf(m0, 0, payDay);
  return iso(thisMonth >= dn(today) ? thisMonth : dayInMonthOf(m0, 1, payDay));
}

/** 目標日 00:00（台北）的毫秒時間戳。 */
export const startOfDayMs = (date) => Date.parse(`${date}T00:00:00+08:00`);

/** 距離目標日的剩餘時間；已到當天或更早回傳 null。 */
export function remaining(date, nowMs) {
  const ms = startOfDayMs(date) - nowMs;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
