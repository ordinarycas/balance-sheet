// 逐日明細（規格 §6.5）：自「起息日 + 1」至最後繳款日，每個日曆日一列。
// 日利息 ＝ 當期利息 ÷ 當期天數；同一期內逐日利息加總 ＝ 該期利息。
import { D, Decimal } from './decimal.js';
import { iso } from './dates.js';

/**
 * @param {object} sched buildSchedule() 的結果
 * @param {number} asOfDn 基準日日序號（用於「已過／今日／未來」狀態）
 * @returns {Array<object>}
 */
export function dailyRows(sched, asOfDn) {
  const out = [];
  const rows = sched.rows;
  if (!rows.length || Number.isNaN(sched.startDn)) return out;
  const fx = sched.fx;
  let idx = 0;
  let prevIdx = -1;
  let cum = new Decimal(0);

  for (let d = sched.startDn + 1; d <= sched.lastDueDn; d++) {
    while (idx < rows.length - 1 && rows[idx].dueDn < d) idx++;
    const r = rows[idx];
    const daily = r.days > 0 ? D(r.interest).div(r.days) : new Decimal(0);
    cum = idx === prevIdx ? cum.plus(daily) : daily;
    prevIdx = idx;
    const isDue = d === r.dueDn;
    const payInterest = isDue ? r.interest : 0;
    const payPrincipal = isDue ? r.principal : 0;
    const endBalance = isDue ? D(r.open).minus(r.principal).toNumber() : r.open;
    out.push({
      loanId: sched.loanId,
      loanName: sched.name,
      dn: d,
      date: iso(d),
      period: r.k,
      open: r.open,
      daily: daily.toNumber(),
      cumPeriod: cum.toNumber(),
      payInterest,
      payPrincipal,
      pay: D(payInterest).plus(payPrincipal).toNumber(),
      endBalance,
      status: d < asOfDn ? '已過' : d === asOfDn ? '今日' : '未來',
      currency: sched.currency,
      dailyTWD: daily.mul(fx).toNumber(),
      endBalanceTWD: D(endBalance).mul(fx).toNumber(),
    });
  }
  return out;
}

/** 逐日明細的列數（不實際展開，供 UI 與驗收使用）。 */
export function dailyRowCount(sched) {
  if (!sched.rows.length || Number.isNaN(sched.startDn)) return 0;
  return sched.lastDueDn - sched.startDn;
}
