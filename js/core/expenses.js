// 每月支出（規格 §6.11）：信用卡、房租、家裡支出與借款還款。支出一律為負數。
import { D, Decimal, sum } from './decimal.js';
import { monthKey, monthKeyAdd, monthKeyDiff } from './dates.js';
import { KNOWN_CARD_LABELS } from './constants.js';
import { WINDOW_MONTHS } from './constants.js';

/** 固定費用在月份 m 是否入帳。 */
export function feeActive(fee, m) {
  if (!fee.start || m < fee.start) return false;
  if (fee.end && m > fee.end) return false;
  if (fee.cycle === 'yearly') return m.slice(5, 7) === fee.start.slice(5, 7);
  return true;
}

/** 所有出現過的卡別代號（payDay 的順序優先）。 */
export function cardIds(cards) {
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  Object.keys(cards?.payDay || {}).forEach(add);
  Object.keys(cards?.statementDay || {}).forEach(add);
  (cards?.entries || []).forEach((e) => add(e.card));
  (cards?.fixedFees || []).forEach((f) => add(f.card));
  return ids;
}

export function cardLabel(cards, id) {
  return cards?.names?.[id] || KNOWN_CARD_LABELS[id] || id;
}

/** 某卡某月的帳期支出（逐筆 + 固定費用）。 */
export function cardMonthAmount(cards, id, m) {
  let s = sum((cards?.entries || []).filter((e) => e.card === id && e.month === m).map((e) => e.amount));
  for (const f of cards?.fixedFees || []) {
    if (f.card === id && feeActive(f, m)) s = s.plus(f.amount);
  }
  return s.toNumber();
}

export function rentMonthAmount(rent, m) {
  const e = rent?.electricity?.[m] ?? 0;
  return D(rent?.monthlyRent ?? 0).plus(e).toNumber();
}

export function homeMonthParts(home, m) {
  const internet = home?.internetFee ?? 0;
  const water = home?.water?.[m]?.amount ?? 0;
  const elec = home?.electricity?.[m]?.amount ?? 0;
  return { internet, water, electricity: elec, total: D(internet).plus(water).plus(elec).toNumber() };
}

/** 視窗起始月：使用者指定 settings.monthStart，否則為基準日前一個月。 */
export function windowStart(settings, asOfMonth) {
  return settings?.monthStart || monthKeyAdd(asOfMonth, -1);
}

export function windowMonths(start, n = WINDOW_MONTHS) {
  return Array.from({ length: n }, (_, i) => monthKeyAdd(start, i));
}

/**
 * 逐月支出表。
 * @param {object} state
 * @param {Array} schedules buildSchedule() 結果
 * @param {string[]} months
 */
export function monthlyTable(state, schedules, months) {
  const ids = cardIds(state.cards);
  const rows = months.map((m) => {
    const cards = {};
    for (const id of ids) cards[id] = cardMonthAmount(state.cards, id, m);
    const cardTotal = sum(Object.values(cards));
    const rent = rentMonthAmount(state.rent, m);
    const home = homeMonthParts(state.home, m).total;
    const living = cardTotal.plus(rent).plus(home);
    const loans = schedules.map((s) => {
      let pay = new Decimal(0);
      let interest = new Decimal(0);
      for (const r of s.rows) {
        if (monthKey(r.dueDn) === m) {
          pay = pay.plus(D(r.payment).mul(s.fx));
          interest = interest.plus(D(r.interest).mul(s.fx));
        }
      }
      return { payment: pay.neg().toNumber(), interest: interest.neg().toNumber() };
    });
    const loanTotal = sum(loans.map((l) => l.payment));
    const loanInterest = sum(loans.map((l) => l.interest));
    return {
      month: m,
      label: `${+m.slice(5, 7)}月`,
      cards,
      cardTotal: cardTotal.toNumber(),
      rent,
      home,
      living: living.toNumber(),
      loans,
      loanTotal: loanTotal.toNumber(),
      total: living.plus(loanTotal).toNumber(),
      loanInterest: loanInterest.toNumber(),
    };
  });
  const n = rows.length || 1;
  const col = (f) => sum(rows.map(f));
  const totals = {
    cards: Object.fromEntries(ids.map((id) => [id, col((r) => r.cards[id]).toNumber()])),
    cardTotal: col((r) => r.cardTotal).toNumber(),
    rent: col((r) => r.rent).toNumber(),
    home: col((r) => r.home).toNumber(),
    living: col((r) => r.living).toNumber(),
    loans: schedules.map((_, i) => col((r) => r.loans[i].payment).toNumber()),
    loanTotal: col((r) => r.loanTotal).toNumber(),
    total: col((r) => r.total).toNumber(),
    loanInterest: col((r) => r.loanInterest).toNumber(),
  };
  const avg = {
    cards: Object.fromEntries(ids.map((id) => [id, D(totals.cards[id]).div(n).toNumber()])),
    cardTotal: D(totals.cardTotal).div(n).toNumber(),
    rent: D(totals.rent).div(n).toNumber(),
    home: D(totals.home).div(n).toNumber(),
    living: D(totals.living).div(n).toNumber(),
    loans: totals.loans.map((v) => D(v).div(n).toNumber()),
    loanTotal: D(totals.loanTotal).div(n).toNumber(),
    total: D(totals.total).div(n).toNumber(),
    loanInterest: D(totals.loanInterest).div(n).toNumber(),
  };
  return { cardIds: ids, rows, totals, avg };
}

export { monthKeyDiff };
