// 結構遷移（V5）：每個函式把 vN 轉成 vN+1。目前最新為 v2（v1 → v2 見下方）；日後新增時在此登錄。
import { SCHEMA_VERSION } from '../core/constants.js';

/** MIGRATIONS[n] 把 schemaVersion n 的資料轉為 n+1。 */
export const MIGRATIONS = {
  // v1 → v2：借款新增選填的 rateChanges（利率變動）與 prepayments（提前還款）；舊檔以空陣列補上。
  1: (d) => {
    if (Array.isArray(d.loans)) for (const l of d.loans) if (l && typeof l === 'object') { l.rateChanges ??= []; l.prepayments ??= []; }
    d.schemaVersion = 2;
    return d;
  },
};

export function migrate(data) {
  let d = data;
  while (d.schemaVersion < SCHEMA_VERSION) {
    const fn = MIGRATIONS[d.schemaVersion];
    if (!fn) throw new Error(`缺少 v${d.schemaVersion} → v${d.schemaVersion + 1} 的遷移函式`);
    d = fn(d);
  }
  return d;
}
