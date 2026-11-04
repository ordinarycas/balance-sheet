// 時鐘頁「利息堆」的純邏輯（無 DOM、無物理）：決定何時合併、誰被併入誰。
// 不變式：所有項目的數值加總，永遠等於「放進來的數值總和」（合併與淘汰都不會讓錢憑空增減）。
export class Pile {
  /** @param {number} cap 上限 0–100；0 ＝ 不堆積 */
  constructor(cap = 0) {
    this.cap = Pile.clampCap(cap);
    /** @type {{id:number, value:number, count:number}[]} 由舊到新 */
    this.items = [];
    this.nextId = 1;
  }

  static clampCap(n) {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), 100) : 0;
  }

  get size() { return this.items.length; }
  get total() { return this.items.reduce((a, x) => a + x.value, 0); }
  get(id) { return this.items.find((x) => x.id === id) ?? null; }

  /**
   * 放入一個新利息。超過上限時，最舊的一個淡出，其數值加到新的這個身上。
   * @returns {{item: object, evicted: object|null}} evicted＝被淘汰（已併入 item）的舊項目
   */
  add(value, count = 1) {
    const item = { id: this.nextId++, value, count };
    this.items.push(item);
    let evicted = null;
    if (this.cap > 0 && this.items.length > this.cap) {
      evicted = this.items.shift();
      item.value += evicted.value;
      item.count += evicted.count;
    }
    return { item, evicted };
  }

  /** 兩個項目碰撞時是否合併：只有「已達上限」才合併。 */
  canMerge() { return this.cap > 0 && this.items.length >= this.cap; }

  /**
   * 合併兩個項目；數值大的保留、另一個被併入。
   * @returns {{keep: object, drop: object}|null}
   */
  merge(idA, idB) {
    if (idA === idB) return null;
    const a = this.get(idA);
    const b = this.get(idB);
    if (!a || !b) return null;
    const [keep, drop] = a.value >= b.value ? [a, b] : [b, a];
    keep.value += drop.value;
    keep.count += drop.count;
    this.items = this.items.filter((x) => x !== drop);
    return { keep, drop };
  }

  /** 調整上限；若目前超過，由舊到新淘汰並併入最新的一個。回傳被淘汰的項目。 */
  setCap(cap) {
    this.cap = Pile.clampCap(cap);
    const out = [];
    while (this.cap > 0 && this.items.length > this.cap && this.items.length > 1) {
      const old = this.items.shift();
      const newest = this.items[this.items.length - 1];
      newest.value += old.value;
      newest.count += old.count;
      out.push({ item: newest, evicted: old });
    }
    return out;
  }

  clear() { this.items = []; }
  toValues() { return this.items.map((x) => x.value); }
}

/** 氣泡半徑（px）：基本 20，合併越多個越大，上限 36。 */
export function bubbleRadius(count) {
  return Math.min(36, 20 + 4 * Math.log2(Math.max(count, 1)));
}
