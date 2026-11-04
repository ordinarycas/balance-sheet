// 股票質押、持股與已實現損益（規格 §6.9、§6.10）。
import { D, Decimal, sum } from './decimal.js';
import { daysInMonthOf } from './dates.js';

/** 採用股價：行情服務可得且 > 0 時用行情，否則用手動備援。 */
export function resolvePrice(item, quotes) {
  const q = quotes ? quotes[item.code] : null;
  if (q && Number.isFinite(q.price) && q.price > 0) {
    return { price: q.price, auto: q.price, source: '行情服務' };
  }
  const manual = Number.isFinite(item.manualPrice) ? item.manualPrice : 0;
  return { price: manual, auto: null, source: '手動輸入' };
}

/** 持股現值表。 */
export function computeHoldings(list, quotes) {
  const rows = (list || []).map((h) => {
    const p = resolvePrice(h, quotes);
    const value = D(h.shares || 0).mul(p.price);
    return { code: h.code, name: h.name, shares: h.shares || 0, auto: p.auto, manual: h.manualPrice ?? null, price: p.price, source: p.source, value: value.toNumber() };
  });
  return { rows, totalValue: sum(rows.map((r) => r.value)).toNumber() };
}

/**
 * 股票質押。`borrowed` 可為正或負（內部取絕對值 B）。
 * @param {object} pledge
 * @param {object} quotes code → {price}
 * @param {number} asOfDn
 * @param {number} dayCountPledge
 */
export function computePledge(pledge, quotes, asOfDn, dayCountPledge = 360) {
  const B = D(pledge?.borrowed ?? 0).abs();
  const rows = (pledge?.stocks || []).map((s) => {
    const p = resolvePrice(s, quotes);
    const value = D(s.shares || 0).mul(p.price);
    const limit = value.mul(s.ltv ?? 0);
    const dailyIfFull = limit.mul(s.annualRate ?? 0).div(dayCountPledge);
    return {
      code: s.code, name: s.name, shares: s.shares || 0,
      auto: p.auto, manual: s.manualPrice ?? null, price: p.price, source: p.source,
      value: value.toNumber(), ltv: s.ltv ?? 0, limit: limit.toNumber(),
      annualRate: s.annualRate ?? 0, dailyIfFull: dailyIfFull.toNumber(),
      _limit: limit, _value: value,
    };
  });
  const totalValue = sum(rows.map((r) => r._value));
  const totalLimit = sum(rows.map((r) => r._limit));
  const weighted = totalLimit.isZero()
    ? new Decimal(0)
    : sum(rows.map((r) => r._limit.mul(r.annualRate))).div(totalLimit);
  const daily = B.mul(weighted).div(dayCountPledge);
  const out = {
    rows: rows.map(({ _limit, _value, ...r }) => r),
    borrowed: B.toNumber(),
    totalValue: totalValue.toNumber(),
    totalLimit: totalLimit.toNumber(),
    overLimit: B.minus(totalLimit).toNumber(),
    ltvActual: totalValue.isZero() ? 0 : B.div(totalValue).toNumber(),
    weightedRate: weighted.toNumber(),
    totalDailyIfFull: sum(rows.map((r) => r.dailyIfFull)).toNumber(),
    dailyInterest: daily.toNumber(),
    monthEstimate: daily.mul(daysInMonthOf(asOfDn)).toNumber(),
    yearEstimate: daily.mul(365).toNumber(),
    interestDay: pledge?.interestDay ?? null,
  };
  return out;
}

/** 已實現損益：逐月三戶頭加總與累計。 */
export function computePnl(list) {
  const sorted = [...(list || [])].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  let cum = new Decimal(0);
  const rows = sorted.map((r) => {
    const total = D(r.personal || 0).plus(r.father || 0).plus(r.mother || 0);
    cum = cum.plus(total);
    return { month: r.month, personal: r.personal || 0, father: r.father || 0, mother: r.mother || 0, total: total.toNumber(), cumulative: cum.toNumber() };
  });
  return {
    rows,
    personal: sum(rows.map((r) => r.personal)).toNumber(),
    father: sum(rows.map((r) => r.father)).toNumber(),
    mother: sum(rows.map((r) => r.mother)).toNumber(),
    total: cum.toNumber(),
  };
}
