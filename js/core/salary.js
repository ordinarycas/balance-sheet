// 月薪情境與雪崩法模擬（規格 §6.13）。支出以正數運算，結果中的結餘為「收入 − 支出」。
import { D, Decimal, sum } from './decimal.js';
import { monthKeyAdd } from './dates.js';
import { SIM_MONTHS } from './constants.js';
import { feeActive } from './expenses.js';

/**
 * 組出債務清單（雪崩順序：年利率高→低；同利率質押優先，再依原順序）。
 * 每筆：{id,name,type,rate,balance(NT$),pmt(NT$，僅攤還型)}
 */
export function buildDebts(schedules, statuses, pledgeCalc) {
  const debts = [];
  if (pledgeCalc && pledgeCalc.borrowed > 0) {
    debts.push({ id: 'pledge', name: pledgeCalc.accountName || '股票質押', type: 'pledge', rate: pledgeCalc.weightedRate, balance: pledgeCalc.borrowed, pmt: 0, order: -1 });
  }
  schedules.forEach((s, i) => {
    const st = statuses[i];
    if (s.error || !s.rows.length) return;
    debts.push({
      id: s.loanId, name: s.name,
      type: s.kind === 'interest_only_annual' ? 'interest_only' : 'amortizing',
      rate: s.annualRate, balance: st.balanceTWD,
      pmt: s.kind === 'interest_only_annual' ? 0 : D(s.pmt).mul(s.fx).toNumber(),
      annualInterestTWD: s.kind === 'interest_only_annual' ? D(s.annualInterest).mul(s.fx).toNumber() : 0,
      order: i,
    });
  });
  debts.sort((a, b) => b.rate - a.rate || a.order - b.order);
  return debts;
}

/** 表一：每月固定生活支出與必繳款（月薪無關的部分）。 */
export function buildBudget(state, debts, asOfMonth) {
  const items = [];
  const rent = Math.abs(state.rent?.monthlyRent ?? 0);
  items.push({ label: '房租', amount: rent });
  items.push({ label: '網路費', amount: Math.abs(state.home?.internetFee ?? 0) });
  const fees = (state.cards?.fixedFees || []).filter((f) => !f.end || f.end >= asOfMonth);
  for (const f of fees) {
    const abs = Math.abs(f.amount);
    items.push({ label: f.cycle === 'yearly' ? `${f.item}（年繳÷12）` : f.item, amount: f.cycle === 'yearly' ? D(abs).div(12).toNumber() : abs });
  }
  items.push({ label: '其他生活開銷', amount: Math.abs(state.salary?.otherLiving ?? 0) });
  const fixed = sum(items.map((x) => x.amount));
  const must = [];
  for (const d of debts) {
    if (d.type === 'pledge') must.push({ id: d.id, label: `${d.name}利息（月）`, amount: D(d.balance).mul(d.rate).div(12).toNumber() });
    else if (d.type === 'interest_only') must.push({ id: d.id, label: `${d.name}利息（月攤）`, amount: D(d.annualInterestTWD).div(12).toNumber() });
    else must.push({ id: d.id, label: `${d.name}月繳`, amount: d.pmt });
  }
  const mustTotal = sum(must.map((x) => x.amount));
  return { items, fixed: fixed.toNumber(), must, mustTotal: mustTotal.toNumber(), total: fixed.plus(mustTotal).toNumber() };
}

/** 單一月薪情境的 120 個月模擬。 */
export function simulate(salary, fixed, debts, startMonth) {
  const sal = D(salary);
  const fix = D(fixed);
  const bal = debts.map((d) => D(d.balance));
  const rows = [];
  let cumGap = new Decimal(0);
  let intTotal = new Decimal(0);
  for (let t = 1; t <= SIM_MONTHS; t++) {
    const open = bal.map((b) => b);
    const interest = debts.map((d, i) => open[i].mul(d.rate).div(12));
    const req = debts.map((d, i) => {
      if (d.type !== 'amortizing') return new Decimal(0);
      if (open[i].lte(0)) return new Decimal(0);
      const p = D(d.pmt).minus(interest[i]);
      return Decimal.min(open[i], Decimal.max(p, 0));
    });
    const must = sum(interest).plus(sum(req));
    const surplus = sal.minus(fix).minus(must);
    const gap = surplus.lt(0) ? surplus.neg() : new Decimal(0);
    let extra = surplus.gt(0) ? surplus : new Decimal(0);
    const avail = extra;
    const prepay = debts.map((d, i) => {
      const room = open[i].minus(req[i]);
      const x = Decimal.min(extra, Decimal.max(room, 0));
      extra = extra.minus(x);
      return x;
    });
    const close = debts.map((d, i) => open[i].minus(req[i]).minus(prepay[i]));
    close.forEach((c, i) => { bal[i] = c; });
    cumGap = cumGap.plus(gap);
    intTotal = intTotal.plus(sum(interest));
    rows.push({
      t, month: monthKeyAdd(startMonth, t - 1),
      open: open.map((x) => x.toNumber()),
      interest: interest.map((x) => x.toNumber()),
      req: req.map((x) => x.toNumber()),
      must: must.toNumber(),
      fixed: fix.toNumber(),
      surplus: surplus.toNumber(),
      avail: avail.toNumber(),
      gap: gap.toNumber(),
      prepay: prepay.map((x) => x.toNumber()),
      close: close.map((x) => x.toNumber()),
      closeTotal: sum(close).toNumber(),
      cumGap: cumGap.toNumber(),
    });
  }

  const payoffMonth = (series) => {
    const c = series.filter((v) => v >= 1).length;
    return c + 1 > SIM_MONTHS ? null : monthKeyAdd(startMonth, c);
  };
  const gapMonths = rows.filter((r) => r.gap > 0).length;
  const allPaid = payoffMonth(rows.map((r) => r.closeTotal));
  const status = (gapMonths === 0 ? '全程有結餘，可提前還款' : `有缺口 ${gapMonths} 個月，需補足資金；`)
    + (gapMonths === 0 ? (allPaid ? '，120個月內全數還清' : '，120個月內未還清')
      : (allPaid ? '120個月內全數還清' : '120個月內未還清'));
  return {
    salary,
    rows,
    firstExtra: rows[0].avail,
    gapMonths,
    cumGap: rows[rows.length - 1].cumGap,
    payoff: debts.map((d, i) => payoffMonth(rows.map((r) => r.close[i]))),
    allPaid,
    interestTotal: intTotal.toNumber(),
    remaining: rows[rows.length - 1].closeTotal,
    status,
  };
}

export function computeSalary(state, schedules, statuses, pledgeCalc, asOfMonth) {
  const debts = buildDebts(schedules, statuses, pledgeCalc);
  const budget = buildBudget(state, debts, asOfMonth);
  const scenarios = (state.salary?.scenarios || []).map((s) => {
    const sim = simulate(s, budget.fixed, debts, asOfMonth);
    return {
      ...sim,
      balance: D(s).minus(budget.total).toNumber(),
      ratio: s ? D(budget.total).div(s).toNumber() : 0,
    };
  });
  return { debts, budget, scenarios, startMonth: asOfMonth, feeActive };
}
