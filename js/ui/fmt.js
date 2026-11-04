// 顯示格式（對應 Excel 的數字格式）。
import { roundNum } from '../core/decimal.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function group(abs, dec) {
  return abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** "NT$"#,##0;"-NT$"#,##0;-  （零顯示為 -） */
export function twd(n, dec = 0) {
  if (!isNum(n)) return '—';
  const r = roundNum(n, dec);
  if (r === 0) return '-';
  return `${r < 0 ? '-' : ''}NT$${group(Math.abs(r), dec)}`;
}

export function usd(n, dec = 2) {
  if (!isNum(n)) return '—';
  const r = roundNum(n, dec);
  if (r === 0) return '-';
  return `${r < 0 ? '-' : ''}US$${group(Math.abs(r), dec)}`;
}

/** 依幣別格式化原幣金額。 */
export function money(n, currency, dec) {
  return currency === 'USD' ? usd(n, dec ?? 2) : twd(n, dec ?? 0);
}

/** #,##0.00;-#,##0.00;-  */
export function num(n, dec = 0) {
  if (!isNum(n)) return '—';
  const r = roundNum(n, dec);
  if (r === 0) return '-';
  return `${r < 0 ? '-' : ''}${group(Math.abs(r), dec)}`;
}

export function pct(n, dec = 2) {
  if (!isNum(n)) return '—';
  return `${(roundNum(n * 100, dec)).toFixed(dec)}%`;
}

export function dateOrDash(s) { return s || '—'; }

/** 圖表座標用的精簡數字（萬／億）。 */
/**
 * 圖表座標軸用的精簡數字：≥1 億「X億」、≥1 萬「X萬」，最多一位小數且去掉多餘的 .0（6萬、2.5萬、12億）。
 * 小於 1 萬以原數字顯示；小於 10 的非整數保留一位小數（避免 0.5 被四捨五入成 1，造成重複刻度）。
 */
export function compact(n) {
  if (!isNum(n)) return '';
  const a = Math.abs(n);
  const sign = n < 0 && a >= 0.05 ? '-' : '';
  const trim = (x) => String(Number(x.toFixed(1)));
  if (a >= 1e4 || Math.round(a) >= 1e4) {
    const w = trim(a / 1e4);
    if (a >= 1e8 || Number(w) >= 1e4) return `${sign}${trim(a / 1e8)}億`; // 9999.96 萬 → 1 億
    return `${sign}${w}萬`;
  }
  if (a < 10 && !Number.isInteger(a)) return `${sign}${trim(a)}`;
  return `${sign}${Math.round(a)}`;
}

export const signCls = (n) => (isNum(n) && roundNum(n, 2) < 0 ? 'neg' : '');
