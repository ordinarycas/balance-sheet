// 總模型：由輸入狀態與（可選的）行情，一次算出所有頁面需要的衍生資料。
import { D, sum } from './decimal.js';
import { dn, monthKey, monthKeyAdd, eomonth, iso } from './dates.js';
import { buildSchedule, loanStatus } from './loan.js';
import { dailyRows, dailyRowCount } from './daily.js';
import { aggregate } from './aggregate.js';
import { computePledge, computeHoldings, computePnl } from './pledge.js';
import { windowStart, windowMonths, monthlyTable, cardIds, cardLabel, cardMonthAmount, rentMonthAmount, homeMonthParts } from './expenses.js';
import { buildCalendar } from './calendar.js';
import { computeSalary } from './salary.js';

/**
 * @param {object} state 通過驗證的輸入資料（規格 §5.2）
 * @param {{asOf:string, usdTwd:number, quotes?:object}} ctx asOf 為 YYYY-MM-DD
 */
export function computeModel(state, ctx) {
  const settings = state.settings || {};
  const asOfDn = dn(ctx.asOf);
  const asOfMonth = monthKey(asOfDn);
  const usdTwd = ctx.usdTwd;
  const dayCountLoan = settings.dayCountLoan || 365;
  const dayCountPledge = settings.dayCountPledge || 360;
  const quotes = ctx.quotes || {};

  const schedules = (state.loans || []).map((l) => buildSchedule(l, { usdTwd, dayCountLoan }));
  const statuses = schedules.map((s) => loanStatus(s, asOfDn, dayCountLoan));
  const agg = aggregate(schedules);
  const pledge = { ...computePledge(state.pledge, quotes, asOfDn, dayCountPledge), accountName: state.pledge?.accountName || '' };
  const holdings = computeHoldings(state.holdings, quotes);
  const pnl = computePnl(state.realizedPnl);

  const startMonth = windowStart(settings, asOfMonth);
  const months = windowMonths(startMonth);
  const monthly = monthlyTable(state, schedules, months);
  const calendar = buildCalendar(state, schedules, pledge, months, asOfDn);
  const salary = computeSalary(state, schedules, statuses, pledge, asOfMonth);

  // ---- 總覽 ----
  const loanRows = statuses.filter((_, i) => !schedules[i].error);
  const pledgeRow = {
    name: `${state.pledge?.accountName || '股票質押'}（已借）`, balanceTWD: pledge.borrowed, annualRate: pledge.weightedRate,
    dailyInterestTWD: pledge.dailyInterest, monthEstimateTWD: pledge.monthEstimate,
  };
  const totalBalance = sum([...loanRows.map((r) => r.balanceTWD), pledge.borrowed]);
  const totals = {
    balanceTWD: totalBalance.toNumber(),
    annualRate: totalBalance.isZero() ? 0
      : sum([...loanRows.map((r) => D(r.balanceTWD).mul(r.annualRate)), D(pledge.borrowed).mul(pledge.weightedRate)]).div(totalBalance).toNumber(),
    dailyInterestTWD: sum([...loanRows.map((r) => r.dailyInterestTWD), pledge.dailyInterest]).toNumber(),
    monthEstimateTWD: sum([...loanRows.map((r) => r.monthEstimateTWD), pledge.monthEstimate]).toNumber(),
  };
  const fixedLoanMonthly = sum(
    schedules.filter((s) => !s.error && s.kind === 'amortizing').map((s) => D(s.pmt).mul(s.fx)),
  ).neg().toNumber();
  const flowMonths = [monthKeyAdd(asOfMonth, -1), asOfMonth];
  const flow = flowMonths.map((m) => {
    const card = sum(cardIds(state.cards).map((id) => cardMonthAmount(state.cards, id, m))).toNumber();
    const rent = rentMonthAmount(state.rent, m);
    const home = homeMonthParts(state.home, m).total;
    const living = D(card).plus(rent).plus(home).toNumber();
    return { month: m, label: `${+m.slice(5, 7)}月`, card, rent, home, living, total: D(living).plus(fixedLoanMonthly).toNumber() };
  });

  // 借款本金餘額走勢（月底，自基準日當月起，不含質押）
  const trend = agg.months.filter((m) => m.key >= asOfMonth).map((m) => ({ key: m.key, balance: m.endBalance }));

  return {
    asOf: ctx.asOf, asOfDn, asOfMonth, usdTwd, dayCountLoan, dayCountPledge,
    schedules, statuses, aggregate: agg, pledge, holdings, pnl,
    startMonth, months, monthly, calendar, salary,
    overview: { loanRows, pledgeRow, totals, fixedLoanMonthly, flow, trend },
    /** 逐日明細（量大，按需計算）。 */
    daily(loanIndex) { return dailyRows(schedules[loanIndex], asOfDn); },
    dailyCount(loanIndex) { return dailyRowCount(schedules[loanIndex]); },
    cardLabel: (id) => cardLabel(state.cards, id),
    helpers: { eomonth, iso },
  };
}
