// 月薪情境與雪崩法模擬（規格 §6.13）。支出以正數運算，結果中的結餘為「收入 − 支出」。
import { D, Decimal, sum } from './decimal.js';
import { monthKeyAdd } from './dates.js';
import { SIM_MONTHS } from './constants.js';
import { feeActive } from './expenses.js';

/**
 * 攤還型借款「基準日之後」每期的計畫：{month, rate, pmt(NT$，常態月付金，不含提前還款), prepay(NT$，已登記的提前還款)}。
 * 取自攤還表，所以已登記的利率變更與提前還款（含重算後的月付金）都會反映在模擬裡。
 */
function planOf(s, paid) {
  const rows = s.rows;
  const regular = (i) => {
    // 末期的 payment 是「結清餘額」，不是常態月付金，改用前一期；只剩一期時用原月付金
    if (i < rows.length - 1) return D(rows[i].payment).minus(rows[i].prepay ?? 0);
    return i > 0 ? D(rows[i - 1].payment).minus(rows[i - 1].prepay ?? 0) : D(s.pmt);
  };
  const plan = [];
  for (let i = paid; i < rows.length; i++) {
    plan.push({
      month: rows[i].due.slice(0, 7),
      rate: rows[i].rate ?? s.annualRate,
      pmt: regular(i).mul(s.fx).toNumber(),
      prepay: D(rows[i].prepay ?? 0).mul(s.fx).toNumber(),
    });
  }
  return plan;
}

/**
 * 組出債務清單（雪崩順序：年利率高→低；同利率質押優先，再依原順序）。
 * 每筆：{id,name,type,rate(基準日適用利率),balance(NT$),pmt(NT$，僅攤還型，基準日之後的現行月付金),plan}
 */
export function buildDebts(schedules, statuses, pledgeCalc) {
  const debts = [];
  if (pledgeCalc && pledgeCalc.borrowed > 0) {
    debts.push({ id: 'pledge', name: pledgeCalc.accountName || '股票質押', type: 'pledge', rate: pledgeCalc.weightedRate, balance: pledgeCalc.borrowed, pmt: 0, order: -1 });
  }
  schedules.forEach((s, i) => {
    const st = statuses[i];
    if (s.error || !s.rows.length) return;
    const amort = s.kind !== 'interest_only_annual';
    const plan = amort ? planOf(s, st.paidPeriods) : [];
    debts.push({
      id: s.loanId, name: s.name,
      type: amort ? 'amortizing' : 'interest_only',
      rate: st.annualRate ?? s.annualRate, balance: st.balanceTWD,
      pmt: amort ? (plan.length ? plan[0].pmt : D(s.pmt).mul(s.fx).toNumber()) : 0,
      plan,
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
  // 固定費用只算「已經開始、尚未結束」的；年繳費用平均攤到每個月，所以只看起訖月，不看繳費月
  const fees = (state.cards?.fixedFees || []).filter((f) => (!f.start || f.start <= asOfMonth) && (!f.end || f.end >= asOfMonth));
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

/**
 * 單一月薪情境的 120 個月模擬。
 * 每月利息 ＝ 期初餘額 × 當月適用年利率 ÷ 12（簡化：不是依實際天數）；
 * 攤還型借款每月的利率、常態月付金與「已登記的提前還款」取自攤還表的計畫（debt.plan），沒有計畫的月份沿用上一期。
 */
export function simulate(salary, fixed, debts, startMonth) {
  const sal = D(salary);
  const fix = D(fixed);
  const bal = debts.map((d) => D(d.balance));
  const plans = debts.map((d) => new Map((d.plan ?? []).map((p) => [p.month, p])));
  const cur = debts.map((d) => ({ rate: d.rate, pmt: d.pmt, prepay: 0 }));
  const rows = [];
  let cumGap = new Decimal(0);
  let intTotal = new Decimal(0);
  for (let t = 1; t <= SIM_MONTHS; t++) {
    const month = monthKeyAdd(startMonth, t - 1);
    debts.forEach((d, i) => {
      const p = plans[i].get(month);
      if (p) cur[i] = { rate: p.rate, pmt: p.pmt, prepay: p.prepay };
      else cur[i] = { ...cur[i], prepay: 0 };
    });
    const open = bal.map((b) => b);
    const interest = debts.map((d, i) => open[i].mul(cur[i].rate).div(12));
    const req = debts.map((d, i) => {
      if (d.type !== 'amortizing') return new Decimal(0);
      if (open[i].lte(0)) return new Decimal(0);
      const p = D(cur[i].pmt).minus(interest[i]);
      // 已登記的提前還款是計畫內的支出，和月付金一樣算「必繳」
      return Decimal.min(open[i], Decimal.max(p, 0).plus(cur[i].prepay));
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
