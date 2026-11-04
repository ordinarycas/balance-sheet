// 「里程表」式數字：只有變動的那一位數，舊數字往下掉出去、新數字從上方落入。
// 只改文字與 class；動畫在 style.css（CSP：不使用 style 屬性）。給螢幕閱讀器的文字由呼叫端另外提供（這裡一律 aria-hidden）。
import { h } from '../dom.js';

const isDigit = (c) => c >= '0' && c <= '9';

/**
 * @param {string} text 初始文字，例如 '12.34567'
 * @param {{animate?: boolean}} [opt] animate=false 時直接換字（減少動態效果）
 */
export function rollingNumber(text, { animate = true } = {}) {
  const el = h('span', { class: 'rn', 'aria-hidden': 'true' });
  let cur = '';

  const slot = (ch) => h('span', { class: isDigit(ch) ? 'rd' : 'rs' }, h('span', { class: 'rv', text: ch }));
  const build = (t) => { el.replaceChildren(...[...t].map(slot)); cur = t; el.dataset.text = t; };

  function set(t) {
    if (t === cur) return;
    if (!animate || t.length !== cur.length) { build(t); return; }
    [...t].forEach((ch, i) => {
      if (ch === cur[i]) return;
      const s = el.children[i];
      if (!isDigit(ch) || !isDigit(cur[i])) { s.className = isDigit(ch) ? 'rd' : 'rs'; s.replaceChildren(h('span', { class: 'rv', text: ch })); return; }
      s.querySelectorAll('.rv.out').forEach((x) => x.remove()); // 連續變動時先收掉上一個動畫的殘留
      const old = s.lastElementChild;
      old.classList.remove('in');
      old.classList.add('out');
      const fresh = h('span', { class: 'rv in', text: ch });
      s.appendChild(fresh);
      setTimeout(() => { old.remove(); fresh.classList.remove('in'); }, 260);
    });
    cur = t;
    el.dataset.text = t;
  }
  build(text);
  return { el, set, get text() { return cur; } };
}
