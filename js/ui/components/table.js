// 資料表元件。cols: [{label, get(row,i), fmt?(v,row), num?, cls?(v,row), wrap?}]
import { h } from '../dom.js';

/** 可橫向捲動的表格外框：可用鍵盤聚焦後以方向鍵捲動（a11y：scrollable-region-focusable）。 */
function tableWrap(table, label) {
  return h('div', { class: 'tablewrap', tabindex: '0', role: 'region', 'aria-label': `${label}（可左右捲動）` }, table);
}

export function dataTable({ cols, rows, foot = [], rowClass, empty = '尚無資料', label = '資料表' }) {
  const thead = h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.num ? 'n' : '', text: c.label }))));
  const cell = (c, row, i) => {
    const v = c.get(row, i);
    const shown = c.fmt ? c.fmt(v, row) : v;
    const cls = [c.num ? 'n' : '', c.center ? 'c' : '', c.wrap ? 'wrap' : '', c.cls ? c.cls(v, row) : ''].filter(Boolean).join(' ');
    return h('td', { class: cls }, shown instanceof Node ? shown : shown ?? '');
  };
  const tbody = h('tbody', null, rows.length
    ? rows.map((r, i) => h('tr', { class: rowClass ? rowClass(r, i) : '' }, cols.map((c) => cell(c, r, i))))
    : h('tr', null, h('td', { colSpan: cols.length, class: 'c muted', text: empty })));
  const tfoot = foot.length
    ? h('tfoot', null, foot.map((f) => h('tr', { class: 'total' }, cols.map((c, i) => {
      const v = f.get ? f.get(c, i) : (f.cells ? f.cells[i] : '');
      const cls = [c.num ? 'n' : '', f.cls ? f.cls(v, c, i) : ''].filter(Boolean).join(' ');
      return h('td', { class: cls }, v instanceof Node ? v : v ?? '');
    }))))
    : null;
  return tableWrap(h('table', null, thead, tbody, tfoot), label);
}

export function kpi(label, value, cls = '') {
  return h('div', { class: `kpi ${cls}` }, h('div', { class: 'l', text: label }), h('div', { class: 'v', text: value }));
}

export function section(title, ...kids) {
  return h('section', null, h('h2', { text: title }), kids);
}

export function tabs(items, active, onSelect) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(([key, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': key === active ? 'true' : 'false', onClick: () => onSelect(key),
  }, label)));
}

/**
 * 可編輯表格：headers 為標題陣列；rows 為「儲存格陣列」（字串或 Node）的陣列。
 * numCols：靠右對齊的欄位索引。foot：合計列（儲存格陣列）。
 */
/** 表格內的輸入欄沒有自己的 <label>：以「欄位標題（第 N 列）」補上可存取名稱。 */
function nameControl(c, header, rowNo) {
  if (!(c instanceof Element)) return c;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName) && !c.hasAttribute('aria-label') && c.type !== 'hidden') {
    c.setAttribute('aria-label', header ? `${header}（第 ${rowNo} 列）` : `第 ${rowNo} 列`);
  }
  return c;
}

export function gridTable({ headers, rows, numCols = [], foot = null, rowClass, empty = '尚無資料', label = '資料表' }) {
  const isNum = (i) => numCols.includes(i);
  const body = rows.length
    ? rows.map((r, ri) => h('tr', { class: rowClass ? rowClass(ri) : '' }, r.map((c, i) => h('td', { class: isNum(i) ? 'n' : '' }, c instanceof Node ? nameControl(c, headers[i], ri + 1) : c ?? ''))))
    : [h('tr', null, h('td', { colSpan: headers.length, class: 'c muted', text: empty }))];
  return tableWrap(h('table', null,
    h('thead', null, h('tr', null, headers.map((t, i) => h('th', { class: isNum(i) ? 'n' : '', text: t })))),
    h('tbody', null, body),
    foot ? h('tfoot', null, h('tr', { class: 'total' }, foot.map((c, i) => h('td', { class: isNum(i) ? 'n' : '' }, c instanceof Node ? c : c ?? '')))) : null), label);
}
