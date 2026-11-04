// 借款引擎（規格 §6.1–6.4、§6.7）：月付金、逐期攤還、餘額校正、保單年繳利息、目前狀況與利息成本。
// 所有函式皆為純函式，不依賴 DOM。金額在內部以 Decimal 運算，輸出為 number。
import { D, Decimal, round, pmt as pmtFn } from './decimal.js';
import { dn, iso, addMonths, eomonth, dayInMonthOf, daysInMonthOf } from './dates.js';
import { DEFAULT_ANNUAL_PERIODS } from './constants.js';

/** 解析繳款方式：`EOM`、`DAY_n`、`YEARLY`。 */
export function parseDueRule(rule) {
  if (rule === 'EOM') return { type: 'EOM' };
  if (rule === 'YEARLY') return { type: 'YEARLY' };
  const m = /^DAY_(\d{1,2})$/.exec(typeof rule === 'string' ? rule : '');
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) return { type: 'DAY', day };
  }
  return null;
}

/** 第 k 期（自 1 起）的繳款日序號。 */
export function dueDnOf(rule, firstDueDn, k) {
  const r = typeof rule === 'string' ? parseDueRule(rule) : rule;
  if (!r || Number.isNaN(firstDueDn)) return NaN;
  switch (r.type) {
    case 'EOM': return eomonth(firstDueDn, k - 1);
    case 'DAY': return dayInMonthOf(firstDueDn, k - 1, r.day);
    case 'YEARLY': return addMonths(firstDueDn, 12 * (k - 1)); // EDATE，由首期日起算
    default: return NaN;
  }
}

/** 借款的期數：攤還型用 periods；年繳利息型用 periods ?? 預設 7 年。 */
export function periodsOf(loan) {
  if (loan.kind === 'interest_only_annual') {
    return Number.isInteger(loan.periods) && loan.periods > 0 ? loan.periods : DEFAULT_ANNUAL_PERIODS;
  }
  return Number.isInteger(loan.periods) && loan.periods > 0 ? loan.periods : 0;
}

/** 只計算各期繳款日（供驗證與日曆使用，不計利息）。 */
export function dueDatesOf(loan) {
  const first = dn(loan.firstDueDate);
  const n = periodsOf(loan);
  const rule = loan.kind === 'interest_only_annual' ? 'YEARLY' : loan.dueRule;
  const out = [];
  for (let k = 1; k <= n; k++) out.push(dueDnOf(rule, first, k));
  return out;
}

/** 單期對 NT$ 的換算係數。 */
/** 以固定月付金還清 balance 所需的期數（無條件進位）；月付金不足以支付利息時回傳 null。 */
function nperFor(balance, payment, ratePerPeriod) {
  if (payment.lte(0)) return null;
  if (ratePerPeriod.isZero()) return Math.max(1, balance.div(payment).ceil().toNumber());
  const interest = balance.mul(ratePerPeriod);
  if (payment.lte(interest)) return null;
  const n = payment.div(payment.minus(interest)).ln().div(ratePerPeriod.plus(1).ln());
  return Math.max(1, n.ceil().toNumber());
}

/** 某日適用的年利率（原幣借款利率，number）。 */
export function rateAtDn(sched, d) {
  let r = sched.annualRate;
  for (const c of sched.rateChanges ?? []) if (c.dn <= d) r = c.rate;
  return r;
}

export function fxOf(loan, usdTwd) {
  return loan.currency === 'USD' ? usdTwd : 1;
}

/**
 * 建立某筆借款的逐期攤還表。
 * @param {object} loan  規格 §5.2 的 loans[] 元素
 * @param {{usdTwd:number, dayCountLoan:number}} opts
 */
export function buildSchedule(loan, opts) {
  const dayCount = opts.dayCountLoan || 365;
  const fx = fxOf(loan, opts.usdTwd);
  const decimals = Number.isInteger(loan.decimals) ? loan.decimals : (loan.currency === 'USD' ? 2 : 0);
  const startDn = dn(loan.startDate);
  const firstDn = dn(loan.firstDueDate);
  const n = periodsOf(loan);
  const rate = D(loan.annualRate ?? 0);
  const principal = D(loan.principal ?? 0);

  const sched = {
    loanId: loan.id,
    name: loan.name,
    kind: loan.kind,
    currency: loan.currency,
    fx,
    decimals,
    principal: principal.toNumber(),
    annualRate: rate.toNumber(),
    startDn,
    periods: n,
    pmt: 0,
    annualInterest: 0,
    rows: [],
    firstDueDn: NaN,
    lastDueDn: NaN,
    calibration: null,
    rateChanges: [],       // [{dn, date, rate}]（依日期排序）：新利率自該日（含）起適用
    prepayTotal: 0,        // 提前還款總額（原幣）
    error: null,
  };

  if (Number.isNaN(startDn) || Number.isNaN(firstDn) || n <= 0) {
    sched.error = '起息日、首次繳款日或期數無效';
    return sched;
  }

  const rows = [];
  let cumInterest = new Decimal(0);
  let cumPrincipal = new Decimal(0);

  if (loan.kind === 'interest_only_annual') {
    // §6.4：annualInterest = round(principal × annualRate, decimals)；本金不攤還
    const annual = round(principal.mul(rate), decimals);
    sched.annualInterest = annual.toNumber();
    sched.pmt = sched.annualInterest;
    let prevDn = startDn;
    for (let k = 1; k <= n; k++) {
      const dueDn = dueDnOf('YEARLY', firstDn, k);
      const days = dueDn - prevDn;
      cumInterest = cumInterest.plus(annual);
      rows.push({
        k, dueDn, due: iso(dueDn), days,
        open: principal.toNumber(),
        interest: annual.toNumber(),
        principal: 0,
        payment: annual.toNumber(),
        close: principal.toNumber(),
        cumInterest: cumInterest.toNumber(),
        cumPrincipal: 0,
        calibrated: false,
      });
      prevDn = dueDn;
    }
  } else {
    // §6.1：pmt = round(PMT(rate/12, n, P), decimals)
    const payment0 = round(pmtFn(rate.div(12), n, principal), decimals);
    sched.pmt = payment0.toNumber();
    // 擴充：利率變動與提前還款（皆為選填；沒有時，下面的計算與原公式完全相同）
    const changes = (loan.rateChanges ?? []).map((c) => ({ dn: dn(c.date), date: c.date, rate: D(c.annualRate) }))
      .filter((c) => !Number.isNaN(c.dn)).sort((a, b) => a.dn - b.dn);
    sched.rateChanges = changes.map((c) => ({ dn: c.dn, date: c.date, rate: c.rate.toNumber() }));
    const prepays = new Map();
    for (const p of loan.prepayments ?? []) {
      const key = dn(p.date);
      if (Number.isNaN(key)) continue;
      const cur = prepays.get(key) ?? { amount: new Decimal(0), mode: p.mode };
      cur.amount = cur.amount.plus(p.amount);
      cur.mode = p.mode;
      prepays.set(key, cur);
    }
    const hasEvents = changes.length > 0 || prepays.size > 0;
    const rateAt = (d) => { let r = rate; for (const c of changes) if (c.dn <= d) r = c.rate; return r; };
    /** 期間 (prevDn, dueDn] 的利息：跨越利率變動日時，依各段天數分別計息後一次四捨五入。 */
    const interestOf = (open, prevDn, dueDn) => {
      if (!changes.length) return round(open.mul(rate).mul(dueDn - prevDn).div(dayCount), decimals);
      let cursor = prevDn + 1;
      let r = rateAt(cursor);
      let acc = new Decimal(0);
      for (const c of changes) {
        if (c.dn <= cursor || c.dn > dueDn) continue;
        acc = acc.plus(r.mul(c.dn - cursor));
        cursor = c.dn;
        r = c.rate;
      }
      acc = acc.plus(r.mul(dueDn + 1 - cursor));
      return round(open.mul(acc).div(dayCount), decimals);
    };
    let payment = payment0;
    let termEnd = n;           // 預計最後一期（縮短年限的提前還款會把它往前移）
    let absorbed = -Infinity;  // 已反映到月付金的利率變動日
    const cal = loan.calibration && loan.calibration.date
      ? { dn: dn(loan.calibration.date), balance: D(loan.calibration.balance) }
      : null;
    if (cal) sched.calibration = { date: loan.calibration.date, balance: cal.balance.toNumber() };

    let open = principal;
    let prevDn = startDn;
    for (let k = 1; k <= termEnd; k++) {
      const dueDn = dueDnOf(loan.dueRule, firstDn, k);
      if (Number.isNaN(dueDn)) { sched.error = '繳款方式無效'; return sched; }
      const days = dueDn - prevDn;
      let interest = interestOf(open, prevDn, dueDn);
      let principalPaid;
      let prepay = new Decimal(0);
      let calibrated = false;
      if (cal && dueDn === cal.dn) {
        // §6.3：以銀行帳面餘額校正，該期利息由月繳反推
        principalPaid = open.minus(cal.balance);
        interest = payment.minus(principalPaid);
        calibrated = true;
      } else if (k === termEnd) {
        principalPaid = open; // 末期結清全部餘額
      } else {
        principalPaid = payment.minus(interest);
        if (principalPaid.gt(open)) principalPaid = open; // 防止餘額為負
      }
      // 提前還款：在該期繳款日於正常本金之外多還一筆
      const pp = prepays.get(dueDn);
      if (pp && !calibrated && k < termEnd) {
        prepay = Decimal.min(pp.amount, open.minus(principalPaid));
        if (prepay.lt(0)) prepay = new Decimal(0);
        principalPaid = principalPaid.plus(prepay);
      }
      const pay = interest.plus(principalPaid);
      const close = open.minus(principalPaid);
      cumInterest = cumInterest.plus(interest);
      cumPrincipal = cumPrincipal.plus(principalPaid);
      rows.push({
        k, dueDn, due: iso(dueDn), days,
        open: open.toNumber(),
        interest: interest.toNumber(),
        principal: principalPaid.toNumber(),
        payment: pay.toNumber(),
        close: close.toNumber(),
        cumInterest: cumInterest.toNumber(),
        cumPrincipal: cumPrincipal.toNumber(),
        calibrated,
        prepay: prepay.toNumber(),
        rate: rateAt(dueDn).toNumber(),
      });
      if (prepay.gt(0)) sched.prepayTotal = D(sched.prepayTotal).plus(prepay).toNumber();
      open = close;
      prevDn = dueDn;
      if (open.lte(0)) break; // 提前還清
      if (hasEvents && k < termEnd) {
        // 利率變動：自下一期起，以新利率對剩餘本金與剩餘期數重算月付金
        const newest = changes.filter((c) => c.dn <= dueDn).reduce((m, c) => Math.max(m, c.dn), -Infinity);
        const rateChanged = newest > absorbed;
        if (rateChanged) absorbed = newest;
        const pp2 = prepays.get(dueDn);
        const nextRate = rateAt(dueDn + 1);
        if (pp2 && prepay.gt(0) && pp2.mode === 'shorten') {
          // 縮短年限：月付金不變，重新推算還需幾期
          const need = nperFor(open, payment, nextRate.div(12));
          if (need !== null) termEnd = Math.min(termEnd, k + need);
        }
        if (rateChanged || (pp2 && prepay.gt(0) && pp2.mode === 'reduce')) {
          payment = round(pmtFn(nextRate.div(12), termEnd - k, open), decimals);
        }
      }
    }
  }

  sched.rows = rows;
  sched.firstDueDn = rows[0].dueDn;
  sched.lastDueDn = rows[rows.length - 1].dueDn;
  return sched;
}

/**
 * §6.7 目前狀況與 §7.5 利息成本（以基準日計算）。金額欄位 `*TWD` 皆已折 NT$。
 */
export function loanStatus(sched, asOfDn, dayCountLoan = 365) {
  const rows = sched.rows;
  const n = rows.length;
  const fx = sched.fx;
  let paid = 0;
  while (paid < n && rows[paid].dueDn <= asOfDn) paid++;

  const isAnnual = sched.kind === 'interest_only_annual';
  const balance = paid === 0 ? sched.principal : rows[paid - 1].close;
  const balanceTWD = D(balance).mul(fx);
  const curRate = rateAtDn(sched, asOfDn);
  const dailyTWD = balanceTWD.mul(curRate).div(dayCountLoan);
  const lastDn = paid === 0 ? sched.startDn : rows[paid - 1].dueDn;
  const accruedTWD = dailyTWD.mul(Math.max(asOfDn - lastDn, 0));
  const next = paid < n ? rows[paid] : null;

  const horizon = addMonths(asOfDn, 12);
  let next12Interest = new Decimal(0);
  let next12Principal = new Decimal(0);
  let remainingInterest = new Decimal(0);
  for (const r of rows) {
    if (r.dueDn <= asOfDn) continue;
    const it = D(r.interest).mul(fx);
    remainingInterest = remainingInterest.plus(it);
    if (r.dueDn <= horizon) {
      next12Interest = next12Interest.plus(it);
      next12Principal = next12Principal.plus(D(r.principal).mul(fx));
    }
  }

  const cumInterest = paid === 0 ? 0 : rows[paid - 1].cumInterest;
  const cumPrincipal = paid === 0 ? 0 : rows[paid - 1].cumPrincipal;

  return {
    loanId: sched.loanId,
    name: sched.name,
    kind: sched.kind,
    currency: sched.currency,
    fx,
    annualRate: curRate,                   // 基準日當日適用的年利率
    baseRate: sched.annualRate,
    paidPeriods: paid,
    remainingPeriods: isAnnual ? null : n - paid,
    totalPeriods: n,
    balance,                               // 原幣
    balanceTWD: balanceTWD.toNumber(),
    dailyInterestTWD: dailyTWD.toNumber(), // 今日日息
    monthEstimateTWD: dailyTWD.mul(daysInMonthOf(asOfDn)).toNumber(),
    accruedTWD: accruedTWD.toNumber(),     // 本期已計未繳利息
    nextDueDn: next ? next.dueDn : null,
    nextDue: next ? next.due : null,
    nextPayment: next ? next.payment : 0,  // 原幣
    nextPaymentTWD: next ? D(next.payment).mul(fx).toNumber() : 0,
    daysToNext: next ? next.dueDn - asOfDn : null,
    settled: !isAnnual && paid >= n,
    cumInterest, cumPrincipal,             // 原幣
    progress: sched.principal === 0 ? 0 : cumPrincipal / sched.principal,
    next12InterestTWD: next12Interest.toNumber(),
    next12PrincipalTWD: next12Principal.toNumber(),
    remainingInterestTWD: remainingInterest.toNumber(),
  };
}
