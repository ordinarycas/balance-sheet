// 十進位運算工具（規格 §2.2）：金額一律以 Decimal 運算，禁止直接用二進位浮點數累加。
// ROUND 採「四捨五入、遠離零」（ROUND half away from zero），與 Excel ROUND 一致。
import Decimal from '../../vendor/decimal.mjs';

Decimal.set({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP, // decimal.js 的 ROUND_HALF_UP ＝ 遇到平手時遠離零
  toExpNeg: -40,
  toExpPos: 40,
});

export { Decimal };

/** 轉為 Decimal（number 以其最短十進位表示轉入，不展開二進位誤差）。 */
export function D(x) {
  return x instanceof Decimal ? x : new Decimal(x);
}

/** Excel ROUND：四捨五入、遠離零。回傳 Decimal。 */
export function round(x, digits = 0) {
  return D(x).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
}

/** 同 round，但回傳 number。 */
export function roundNum(x, digits = 0) {
  return round(x, digits).toNumber();
}

/** 以 Decimal 加總；回傳 Decimal。 */
export function sum(list) {
  let s = new Decimal(0);
  for (const v of list) s = s.plus(v ?? 0);
  return s;
}

/** 以 Decimal 加總；回傳 number。 */
export function sumNum(list) {
  return sum(list).toNumber();
}

/**
 * 等額月付金（PMT）：`P·r / (1 − (1+r)^−n)`，r 為「期利率」。
 * r = 0 時退化為 P / n。回傳 Decimal（未四捨五入）。
 */
export function pmt(ratePerPeriod, nper, principal) {
  const r = D(ratePerPeriod);
  const n = D(nper);
  const p = D(principal);
  if (n.lte(0)) return new Decimal(0);
  if (r.isZero()) return p.div(n);
  const f = r.plus(1).pow(n.neg());
  return p.mul(r).div(new Decimal(1).minus(f));
}

export const min = (a, b) => (D(a).lt(b) ? D(a) : D(b));
export const max = (a, b) => (D(a).gt(b) ? D(a) : D(b));
