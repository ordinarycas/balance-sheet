// 堆疊面積圖與熱力圖用的資料整理（純函式，無 DOM）。數字全部來自使用者輸入的借款與支出。

/**
 * 把各筆借款的餘額走勢整理成堆疊面積圖的系列；超過 maxSeries 的合併成「其他借款」。
 * 以期初餘額由大到小排序（最大的在最下層，變化最容易讀）。
 * @param {{name:string}[]} debts
 * @param {number[][]} perDebt perDebt[i][k]＝第 i 筆在第 k 個時間點的餘額
 */
export function stackSeries(debts, perDebt, maxSeries = 7) {
  const items = debts.map((d, i) => ({ name: d.name, values: (perDebt[i] ?? []).map((v) => Math.max(Number(v) || 0, 0)) }))
    .filter((s) => s.values.some((v) => v > 0.5))
    .sort((a, b) => (b.values[0] ?? 0) - (a.values[0] ?? 0));
  if (items.length <= maxSeries) return items;
  const head = items.slice(0, maxSeries - 1);
  const rest = items.slice(maxSeries - 1);
  const n = Math.max(...rest.map((s) => s.values.length));
  const other = { name: '其他借款', values: Array.from({ length: n }, (_, k) => rest.reduce((a, s) => a + (s.values[k] ?? 0), 0)) };
  return [...head, other];
}

/** 每個時間點的合計。 */
export function stackTotals(series) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  return Array.from({ length: n }, (_, k) => series.reduce((a, s) => a + (s.values[k] ?? 0), 0));
}

/** 把最大值往上取成漂亮的刻度上限，回傳 { max, ticks }。 */
export function niceScale(maxValue, count = 4) {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };
  const raw = maxValue / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return { max, ticks };
}

/**
 * 每月支出熱力圖：列＝項目（信用卡／房租／家裡支出／各筆借款還款），欄＝月份。
 * 金額一律取正數（流出）；整列皆 0 的項目不列出。
 * @param {object} model computeModel() 結果
 */
export function spendHeatmap(model) {
  const t = model.monthly;
  const months = t.rows.map((r) => r.month);
  const defs = [
    ...t.cardIds.map((id) => ({ label: model.cardLabel(id), get: (r) => r.cards[id] })),
    { label: '房租（含電費）', get: (r) => r.rent },
    { label: '家裡支出', get: (r) => r.home },
    ...model.schedules.map((s, i) => ({ label: `${s.name || '借款'}（還款）`, get: (r) => r.loans[i]?.payment ?? 0, skip: !!s.error })),
  ];
  const rows = defs.filter((d) => !d.skip).map((d) => {
    const values = t.rows.map((r) => Math.abs(Number(d.get(r)) || 0));
    return { label: d.label, values, total: values.reduce((a, v) => a + v, 0) };
  }).filter((r) => r.total > 0);
  const colTotals = months.map((_, k) => rows.reduce((a, r) => a + r.values[k], 0));
  const max = Math.max(0, ...rows.flatMap((r) => r.values));
  return { months, rows, colTotals, max, grand: colTotals.reduce((a, v) => a + v, 0) };
}

/** 金額 → 0–5 的色階（0＝無支出；其餘依最大值等分）。 */
export function heatLevel(value, max) {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(5, 1 + Math.floor((value / max) * 5 - 1e-9));
}
