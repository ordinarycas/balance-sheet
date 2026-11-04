// 月度與年度彙總（規格 §6.6）：全部借款折合 NT$。
import { D, Decimal } from './decimal.js';
import { iso, monthKey, monthKeyAdd, monthKeyDiff, monthKeyToDn, eomonth, monthKeyYear, ymd } from './dates.js';

/**
 * @param {Array<object>} schedules buildSchedule() 結果陣列（順序＝借款順序）
 * @returns {{months:Array<object>, years:Array<object>}}
 */
export function aggregate(schedules) {
  const live = schedules.filter((s) => s.rows.length);
  if (!live.length) return { months: [], years: [] };

  // 月份範圍：自「最早首期繳款日所在月」至「最晚末期繳款日所在月」
  let firstKey = null;
  let lastKey = null;
  for (const s of live) {
    const a = monthKey(s.firstDueDn);
    const b = monthKey(s.lastDueDn);
    if (firstKey === null || a < firstKey) firstKey = a;
    if (lastKey === null || b > lastKey) lastKey = b;
  }
  const count = monthKeyDiff(firstKey, lastKey) + 1;

  // 先把每筆借款的繳款依月份歸戶
  const perLoanByMonth = schedules.map(() => new Map());
  schedules.forEach((s, i) => {
    for (const r of s.rows) {
      const key = monthKey(r.dueDn);
      const cur = perLoanByMonth[i].get(key) ?? { interest: new Decimal(0), principal: new Decimal(0) };
      cur.interest = cur.interest.plus(D(r.interest).mul(s.fx));
      cur.principal = cur.principal.plus(D(r.principal).mul(s.fx));
      perLoanByMonth[i].set(key, cur);
    }
  });

  const months = [];
  for (let i = 0; i < count; i++) {
    const key = monthKeyAdd(firstKey, i);
    const monthEnd = eomonth(monthKeyToDn(key), 0);
    const byLoan = schedules.map((s, li) => {
      const cur = perLoanByMonth[li].get(key);
      const interest = cur ? cur.interest : new Decimal(0);
      const principal = cur ? cur.principal : new Decimal(0);
      return { interest: interest.toNumber(), principal: principal.toNumber(), payment: interest.plus(principal).toNumber() };
    });
    let interest = new Decimal(0);
    let principal = new Decimal(0);
    for (const b of byLoan) { interest = interest.plus(b.interest); principal = principal.plus(b.principal); }

    // 月底本金餘額：各借款「最後一個 ≤ 月底的繳款日」之期末本金；尚未開始＝0；首期繳款前＝全額本金
    let balance = new Decimal(0);
    for (const s of schedules) {
      if (!s.rows.length) continue;
      if (monthEnd < s.startDn) continue;
      let last = null;
      for (const r of s.rows) { if (r.dueDn <= monthEnd) last = r; else break; }
      balance = balance.plus(D(last ? last.close : s.principal).mul(s.fx));
    }

    months.push({
      key,
      year: monthKeyYear(key),
      byLoan,
      interest: interest.toNumber(),
      principal: principal.toNumber(),
      payment: interest.plus(principal).toNumber(),
      endBalance: balance.toNumber(),
    });
  }

  // 年度彙總
  const years = [];
  const y0 = months[0].year;
  const y1 = months[months.length - 1].year;
  for (let y = y0; y <= y1; y++) {
    const ms = months.filter((m) => m.year === y);
    const byLoan = schedules.map((_, li) => {
      let interest = new Decimal(0);
      let principal = new Decimal(0);
      for (const m of ms) { interest = interest.plus(m.byLoan[li].interest); principal = principal.plus(m.byLoan[li].principal); }
      return { interest: interest.toNumber(), principal: principal.toNumber() };
    });
    let interest = new Decimal(0);
    let principal = new Decimal(0);
    for (const b of byLoan) { interest = interest.plus(b.interest); principal = principal.plus(b.principal); }
    // 年底餘額：取該年 12 月；若彙總表在 12 月前結束，取表中最後一個月
    const dec = months.filter((m) => m.key <= `${y}-12`);
    const endBalance = dec.length ? dec[dec.length - 1].endBalance : 0;
    years.push({
      year: y,
      byLoan,
      interest: interest.toNumber(),
      principal: principal.toNumber(),
      payment: interest.plus(principal).toNumber(),
      endBalance,
    });
  }
  return { months, years };
}
