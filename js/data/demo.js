// 示範資料：全部為虛構，日期相對於「今天」產生，確保打開就有可看的內容。
import { dn, iso, eomonth, addMonths, monthKey, monthKeyAdd, dayInMonthOf } from '../core/dates.js';
import { emptyState } from './schema.js';

export function demoState(todayIso) {
  const t = dn(todayIso);
  const s = emptyState();
  const thisM = monthKey(t);
  const prevM = monthKeyAdd(thisM, -1);

  const startA = eomonth(t, -4);
  const startB = dayInMonthOf(t, -2, 15);
  const startC = addMonths(t, -3);

  s.settings.usdTwdManual = 32;
  s.loans = [
    { id: 'bank-a', name: '示範銀行 A', kind: 'amortizing', currency: 'TWD', principal: 600000, annualRate: 0.052, periods: 60,
      startDate: iso(startA), firstDueDate: iso(eomonth(startA, 1)), dueRule: 'EOM', decimals: 0, calibration: null },
    { id: 'bank-b', name: '示範銀行 B', kind: 'amortizing', currency: 'TWD', principal: 300000, annualRate: 0.045, periods: 36,
      startDate: iso(startB), firstDueDate: iso(dayInMonthOf(startB, 1, 15)), dueRule: 'DAY_15', decimals: 0, calibration: null },
    { id: 'policy', name: '示範人壽（保單借款）', kind: 'interest_only_annual', currency: 'USD', principal: 5000, annualRate: 0.038,
      startDate: iso(startC), firstDueDate: iso(addMonths(startC, 12)), dueRule: 'YEARLY', decimals: 2 },
  ];
  s.pledge = {
    borrowed: -250000, interestDay: null,
    stocks: [
      { code: 'TPE:0050', name: '示範 ETF 甲', shares: 2000, manualPrice: 150, ltv: 0.6, annualRate: 0.0625 },
      { code: 'TPE:006208', name: '示範 ETF 乙', shares: 1500, manualPrice: 100, ltv: 0.6, annualRate: 0.0625 },
    ],
  };
  s.holdings = [{ code: 'TPE:2330', name: '示範公司', shares: 100, manualPrice: 1000 }];
  s.realizedPnl = [
    { month: monthKeyAdd(thisM, -2), personal: 12000, father: 5000, mother: 0 },
    { month: prevM, personal: -8000, father: 0, mother: 3000 },
    { month: thisM, personal: 4000, father: 0, mother: 0 },
  ];
  s.cards = {
    payDay: { 'card-a': 21, 'card-b': 22 }, statementDay: { 'card-a': 21, 'card-b': 7 }, names: { 'card-a': '示範信用卡 A', 'card-b': '示範信用卡 B' },
    entries: [
      { month: prevM, card: 'card-a', item: '日常花費', amount: -9800 },
      { month: prevM, card: 'card-b', item: '旅遊', amount: -15200 },
      { month: thisM, card: 'card-a', item: '日常花費', amount: -4300 },
    ],
    fixedFees: [{ item: '訂閱服務', card: 'card-a', amount: -2400, start: prevM, end: null, cycle: 'yearly' }],
  };
  s.rent = { monthlyRent: -12000, dueDay: 5, electricity: { [prevM]: -650 } };
  s.home = {
    internetFee: -599, internetDay: 15,
    water: { [thisM]: { amount: -120, date: iso(dayInMonthOf(t, 0, 18)) } },
    electricity: { [thisM]: { amount: -900, date: iso(dayInMonthOf(t, 0, 20)) } },
  };
  s.salary = { scenarios: [40000, 50000, 60000, 70000, 80000], otherLiving: -5000 };
  return s;
}
