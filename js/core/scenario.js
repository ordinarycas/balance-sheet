// 資產負債快照與「收入情境」推演（純函式，無 DOM）。
//  · 資產＝質押股票現值＋未質押持股現值（本站不記錄現金、存款、不動產，詳見頁面說明）。
//  · 負債＝各筆借款本金餘額（美元已折算）＋股票質押已借金額。
//  · 收入情境沿用「月薪情境」的雪崩法模擬：income=0 代表完全沒有收入，所有必繳款都成為缺口。
import { simulate } from './salary.js';

const sumN = (a) => a.reduce((x, y) => x + y, 0);

/** @param {object} model computeModel() 結果 */
export function balanceSheet(model) {
  const pledged = model.pledge.totalValue;
  const unpledged = model.holdings.totalValue;
  const loans = model.overview.loanRows.map((r) => ({ name: r.name, value: r.balanceTWD })).filter((x) => x.value > 0);
  const loanTotal = sumN(loans.map((x) => x.value));
  const pledgeBorrowed = model.pledge.borrowed;
  const assets = pledged + unpledged;
  const liabilities = loanTotal + pledgeBorrowed;
  return {
    assets: { pledged, unpledged, total: assets },
    liabilities: { loans, loanTotal, pledgeBorrowed, total: liabilities },
    net: assets - liabilities,
    debtRatio: assets > 0 ? liabilities / assets : null,
  };
}

/**
 * 以固定月收入推演 horizon 個月（income=0 即「完全沒有收入」）。
 * balances／cumGap／cumInterest 都含「現在」這一點，長度 = horizon + 1。
 */
export function projectIncome(model, income, horizon = 60) {
  const sal = model.salary;
  const sim = simulate(income, sal.budget.fixed, sal.debts, sal.startMonth);
  const rows = sim.rows.slice(0, horizon);
  const start = sumN(sal.debts.map((d) => d.balance));
  let ci = 0;
  const cumInterest = [0, ...rows.map((r) => (ci += sumN(r.interest)))];
  return {
    income,
    months: ['現在', ...rows.map((r) => r.month)],
    balances: [start, ...rows.map((r) => r.closeTotal)],
    cumGap: [0, ...rows.map((r) => r.cumGap)],
    cumInterest,
    perDebt: sal.debts.map((d, i) => [d.balance, ...rows.map((r) => r.close[i])]),
    monthlySurplus: rows[0]?.surplus ?? 0,
    endDebt: rows.length ? rows[rows.length - 1].closeTotal : start,
    totalGap: rows.length ? rows[rows.length - 1].cumGap : 0,
    totalInterest: ci,
    allPaid: sim.allPaid,
    gapMonths: rows.filter((r) => r.gap > 0).length,
  };
}

/** 每月收入分配：生活固定支出／必繳還款／結餘（或缺口）。 */
export function monthlySplit(model, income) {
  const b = model.salary.budget;
  const left = income - b.fixed - b.mustTotal;
  return { income, living: b.fixed, must: b.mustTotal, surplus: Math.max(left, 0), gap: Math.max(-left, 0) };
}

/** 使用者設定的固定收入；未設定（≤0）時用第一個月薪情境。 */
export function effectiveIncome(model, saved) {
  if (saved > 0) return saved;
  return model.salary.scenarios[0]?.salary ?? 0;
}
