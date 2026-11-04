// 里程表式數字：每一位數是一條 0–9 的直條，用 CSS transition 平順地往下滾動（新數字從上方滑入）。
// 只改 style.transform（CSSOM，不違反 CSP）；給螢幕閱讀器的文字由呼叫端另外提供（這裡一律 aria-hidden）。
import { h } from '../dom.js';

const isDigit = (c) => c >= '0' && c <= '9';
const LH = 1.25; // 每格高度（em）
// 直條由上到下：0（輔助，供 9→0 進位時向下滾）, 9, 8, …, 1, 0
const ORDER = ['0', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'];
const idx = (d) => (d === 0 ? 10 : 10 - d);
const at = (i) => `translateY(${(-i * LH).toFixed(3)}em)`;

/**
 * @param {string} text 初始文字，例如 '12.34567'
 * @param {{animate?: boolean}} [opt] animate=false 時直接換字（減少動態效果）
 */
export function rollingNumber(text, { animate = true } = {}) {
  const el = h('span', { class: 'rn', 'aria-hidden': 'true' });
  let cur = '';

  function slot(ch) {
    if (!isDigit(ch)) return h('span', { class: 'rs', text: ch });
    const col = h('span', { class: 'col' }, ORDER.map((c) => h('span', { text: c })));
    col.style.transform = at(idx(Number(ch)));
    return h('span', { class: 'rd' }, col);
  }
  const build = (t) => { el.replaceChildren(...[...t].map(slot)); cur = t; el.dataset.text = t; };

  function roll(col, from, to) {
    if (to > from || !animate) { // 數字變大：往下滾；不動畫時直接跳
      col.style.transition = animate ? '' : 'none';
      col.style.transform = at(idx(to));
      return;
    }
    if (to === 0 && from === 9) { // 9 → 0：先滾到輔助的 0，結束後悄悄換成底部的 0
      col.style.transition = '';
      col.style.transform = at(0);
      col.addEventListener('transitionend', () => {
        col.style.transition = 'none';
        col.style.transform = at(idx(0));
        void col.offsetWidth;
        col.style.transition = '';
      }, { once: true });
      return;
    }
    col.style.transition = 'none'; // 其他往回的情況（例如換日歸零）直接跳
    col.style.transform = at(idx(to));
    void col.offsetWidth;
    col.style.transition = '';
  }

  function set(t) {
    if (t === cur) return;
    if (t.length !== cur.length) { build(t); return; }
    [...t].forEach((ch, i) => {
      if (ch === cur[i]) return;
      const s = el.children[i];
      if (isDigit(ch) && isDigit(cur[i]) && s.firstChild?.classList.contains('col')) roll(s.firstChild, Number(cur[i]), Number(ch));
      else s.replaceWith(slot(ch));
    });
    cur = t;
    el.dataset.text = t;
  }
  build(text);
  return { el, set, get text() { return cur; } };
}
