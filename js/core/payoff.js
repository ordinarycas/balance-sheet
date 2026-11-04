// 還款動力相關的計算（純函式，無 DOM）。所有數字都來自使用者自己輸入的借款與支出資料，
// 試算的前提（利率不變、照現有還款表、收入固定）由呼叫端在畫面上標明為「假設」。
import { buildSchedule } from './loan.js';
import { simulate } from './salary.js';
import { dn, monthKey, monthKeyAdd, monthKeyDiff } from './dates.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
export const MILESTONES = [0.25, 0.5, 0.75, 1];

const live = (model) => model.schedules.map((s, i) => ({ s, st: model.statuses[i] })).filter((x) => !x.s.error && x.s.rows.length);

/** 各筆攤還型借款與整體的還款進度。 */
export function progressSummary(model) {
  const all = live(model);
  const am = all.filter((x) => x.s.kind === 'amortizing');
  const loans = am.map(({ s, st }) => ({
    id: s.loanId, name: s.name, progress: st.progress, settled: st.settled,
    paidTWD: st.cumPrincipal * s.fx, remainingTWD: st.balanceTWD,
    remainingPeriods: st.remainingPeriods, payoffDn: s.lastDueDn, payoffDate: s.rows[s.rows.length - 1].due,
  }));
  const totalTWD = sum(am.map(({ s }) => s.principal * s.fx));
  const remainingTWD = sum(am.map(({ st }) => st.balanceTWD));
  const progress = totalTWD > 0 ? Math.min(Math.max(1 - remainingTWD / totalTWD, 0), 1) : 0;
  const reached = MILESTONES.filter((m) => progress + 1e-9 >= m).pop() ?? 0;
  const next = MILESTONES.find((m) => m > progress + 1e-9) ?? null;
  const payoffDn = loans.length ? Math.max(...loans.map((l) => l.payoffDn)) : null;
  const interestOnly = all.filter((x) => x.s.kind !== 'amortizing').map(({ s, st }) => ({ name: s.name, balanceTWD: st.balanceTWD }));
  return {
    loans, totalTWD, remainingTWD, paidTWD: totalTWD - remainingTWD, progress, reached, next,
    nextTargetTWD: next === null ? null : totalTWD * next - (totalTWD - remainingTWD),
    payoffDn, interestOnly, pledgeBorrowed: model.pledge.borrowed,
    otherDebt: interestOnly.length > 0 || model.pledge.borrowed > 0,
  };
}

/** 年月文字：距離某日還有多久（以 30.4375 天／月概算到「年、個月」）。 */
export function spanText(days) {
  if (days <= 0) return '今天或已過';
  const months = Math.round(days / 30.4375);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} 年` : '', m || !y ? `${m} 個月` : ''].filter(Boolean).join(' ');
}

/**
 * 「多還一點」試算：對單一攤還型借款，從下一個繳款日起每月多還 monthly（NT$），或下一期一次多還 lump（NT$）。
 * 採「縮短年限、月付金不變」。回傳與現有還款表的差異。
 */
export function whatIfExtra(model, state, loanId, { monthly = 0, lump = 0 }) {
  const loan = state.loans.find((l) => l.id === loanId);
  const sched = model.schedules.find((s) => s.loanId === loanId);
  if (!loan || !sched || sched.error || sched.kind !== 'amortizing') return null;
  const asOfDn = model.asOfDn;
  const fx = sched.fx;
  const future = sched.rows.filter((r) => r.dueDn > asOfDn);
  if (!future.length) return null;
  const pre = [...(loan.prepayments ?? [])];
  if (lump > 0) pre.push({ date: future[0].due, amount: lump / fx, mode: 'shorten' });
  if (monthly > 0) for (const r of future) pre.push({ date: r.due, amount: monthly / fx, mode: 'shorten' });
  const alt = buildSchedule({ ...loan, prepayments: pre }, { usdTwd: model.usdTwd, dayCountLoan: model.dayCountLoan });
  if (alt.error) return null;
  const after = (sc) => sc.rows.filter((r) => r.dueDn > asOfDn);
  const a = after(sched);
  const b = after(alt);
  const interest = (rows) => sum(rows.map((r) => r.interest)) * fx;
  const extraPaid = sum(b.map((r) => r.prepay ?? 0)) * fx - sum(a.map((r) => r.prepay ?? 0)) * fx;
  return {
    name: sched.name,
    baseEnd: a[a.length - 1].due, newEnd: b.length ? b[b.length - 1].due : sched.rows[0].due,
    basePeriods: a.length, newPeriods: b.length, periodsSaved: a.length - b.length,
    baseInterest: interest(a), newInterest: interest(b), interestSaved: interest(a) - interest(b),
    extraPaid,
    daysEarlier: a[a.length - 1].dueDn - (b.length ? b[b.length - 1].dueDn : a[a.length - 1].dueDn),
  };
}

const firstCleared = (sim, debts) => {
  const m = sim.payoff.filter((p, i) => p && debts[i].balance >= 1).sort();
  return m[0] ?? null;
};

/** 雪崩法（利率高者先）與雪球法（餘額小者先）的比較。income＝每月收入（NT$）。 */
export function strategyCompare(model, income) {
  const sal = model.salary;
  const mk = (debts) => {
    const sim = simulate(income, sal.budget.fixed, debts, sal.startMonth);
    return { interest: sim.interestTotal, allPaid: sim.allPaid, firstCleared: firstCleared(sim, debts), order: debts.map((d) => d.name), remaining: sim.remaining };
  };
  const avalanche = mk(sal.debts);
  const snowball = mk(sal.debts.slice().sort((a, b) => a.balance - b.balance));
  return { avalanche, snowball, interestDiff: snowball.interest - avalanche.interest, startMonth: sal.startMonth };
}

/** 月收入再增加 extra 之後，全數還清的時間與利息差異（雪崩法模擬，最長 120 個月）。 */
export function incomeGoal(model, income, extra) {
  const sal = model.salary;
  const run = (v) => simulate(v, sal.budget.fixed, sal.debts, sal.startMonth);
  const a = run(income);
  const b = run(income + extra);
  return {
    now: { allPaid: a.allPaid, interest: a.interestTotal, gapMonths: a.gapMonths, firstExtra: a.firstExtra },
    goal: { allPaid: b.allPaid, interest: b.interestTotal, gapMonths: b.gapMonths, firstExtra: b.firstExtra },
    monthsEarlier: a.allPaid && b.allPaid ? monthKeyDiff(b.allPaid, a.allPaid) : null,
    newlyPayable: !a.allPaid && !!b.allPaid,
    interestSaved: a.interestTotal - b.interestTotal,
  };
}

/** 某個月份各借款的已排定繳款：本金、利息、提前還款（皆 NT$）。 */
export function loanFlowOfMonth(model, key) {
  let principal = 0; let interest = 0; let prepay = 0;
  for (const s of model.schedules) {
    if (s.error) continue;
    for (const r of s.rows) {
      if (monthKey(r.dueDn) !== key) continue;
      principal += r.principal * s.fx; interest += r.interest * s.fx; prepay += (r.prepay ?? 0) * s.fx;
    }
  }
  return { principal, interest, prepay };
}

/** 上個月回顧。income 未知（null）時不估算結餘。 */
export function monthlyReview(model, income) {
  const prev = model.overview.flow[0]; // 基準日的前一個月
  const loan = loanFlowOfMonth(model, prev.month);
  const living = -prev.living; // flow 的支出為負
  const out = living + loan.principal + loan.interest;
  return { month: prev.month, ...loan, living, card: -prev.card, rent: -prev.rent, home: -prev.home, outflow: out, income, balance: income ? income - out : null };
}

/** 低調的小進展（只列事實；沒有就回傳空陣列，不顯示任何「失敗」訊息）。 */
export function smallWins(model, income) {
  const wins = [];
  const cur = monthKey(model.asOfDn);
  const prev = monthKeyAdd(cur, -1);
  const c = loanFlowOfMonth(model, cur);
  const p = loanFlowOfMonth(model, prev);
  if (income > 0) {
    const need = model.salary.budget.total;
    if (income >= need) wins.push(`以月收入 ${Math.round(income).toLocaleString('en-US')} 計，每月固定支出與必繳款都有付得起（結餘 ${Math.round(income - need).toLocaleString('en-US')}）`);
  }
  if (c.prepay > 0) wins.push(`本月有提前還款 ${Math.round(c.prepay).toLocaleString('en-US')} 元`);
  if (p.interest > 0 && c.interest > 0 && c.interest < p.interest - 0.5) wins.push(`本月預定利息 ${Math.round(c.interest).toLocaleString('en-US')} 元，比上月少 ${Math.round(p.interest - c.interest).toLocaleString('en-US')} 元`);
  return wins;
}

export { dn };

// ---- 解鎖的現金流、已走過的路、緩衝月數、額外收入分配 ----

/** 每還清一筆攤還型借款，每月多出多少可用現金（月付金 × 匯率，沿用還款表）。 */
export function unlockTimeline(model) {
  const items = live(model)
    .filter(({ s, st }) => s.kind === 'amortizing' && !st.settled && s.rows.some((r) => r.dueDn > model.asOfDn))
    .map(({ s }) => ({ name: s.name, date: s.rows[s.rows.length - 1].due, dn: s.lastDueDn, monthly: s.pmt * s.fx }))
    .sort((a, b) => a.dn - b.dn || a.name.localeCompare(b.name));
  let cum = 0;
  const steps = items.map((x) => ({ ...x, cumulative: (cum += x.monthly) }));
  return { steps, totalMonthly: cum };
}

/** 基準日（含）以前已繳的本金（含提前還款）與利息，依月份累計；金額折成新台幣。 */
export function pastPath(model) {
  const byMonth = new Map();
  for (const s of model.schedules) {
    if (s.error) continue;
    for (const r of s.rows) {
      if (r.dueDn > model.asOfDn) continue;
      const k = monthKey(r.dueDn);
      const e = byMonth.get(k) ?? { principal: 0, interest: 0 };
      e.principal += ((r.principal ?? 0) + (r.prepay ?? 0)) * s.fx;
      e.interest += (r.interest ?? 0) * s.fx;
      byMonth.set(k, e);
    }
  }
  const keys = [...byMonth.keys()].sort();
  if (!keys.length) return { months: [], cumPrincipal: [], cumInterest: [], totalPrincipal: 0, totalInterest: 0 };
  const months = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = monthKeyAdd(k, 1)) months.push(k);
  let p = 0;
  let i = 0;
  const cumPrincipal = [];
  const cumInterest = [];
  for (const k of months) { const e = byMonth.get(k); p += e?.principal ?? 0; i += e?.interest ?? 0; cumPrincipal.push(p); cumInterest.push(i); }
  return { months, cumPrincipal, cumInterest, totalPrincipal: p, totalInterest: i };
}

/** 現有可動用資金可支撐幾個月的支出（生活固定支出＋必繳還款）。 */
export function bufferStatus(model, cash, targetMonths) {
  const spend = model.salary.budget.fixed + model.salary.budget.mustTotal;
  const months = spend > 0 ? Math.max(cash, 0) / spend : null;
  const target = Math.max(Number(targetMonths) || 0, 0);
  return { spend, months, target, progress: months === null || target <= 0 ? 0 : Math.min(months / target, 1), targetAmount: spend * target };
}

/** 金額相當於幾小時的基本工資。 */
export const hoursOfWage = (amount, hourly) => (hourly > 0 ? Math.max(amount, 0) / hourly : 0);

/** 額外收入紀錄 → 使用者選擇要拿去提前還款的總額。 */
export function extraIncomePlan(log) {
  const total = log.reduce((a, e) => a + e.amount, 0);
  const prepay = log.reduce((a, e) => a + (e.amount * e.pct) / 100, 0);
  return { total, prepay, keep: total - prepay };
}
