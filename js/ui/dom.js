// DOM 小工具。所有文字一律走 textContent／文字節點，絕不使用 innerHTML（匯入資料視為不受信任）。
const SVG_NS = 'http://www.w3.org/2000/svg';

function appendKids(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

const PROPS = new Set(['value', 'checked', 'disabled', 'type', 'selected', 'readOnly', 'multiple', 'min', 'max', 'step', 'placeholder', 'id', 'name', 'title', 'colSpan', 'rowSpan', 'htmlFor', 'accept']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') Object.assign(el.style, v); // CSSOM：不違反 style-src 'self'
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendKids(el, kids);
  return el;
}

export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else el.setAttribute(k, String(v));
    }
  }
  appendKids(el, kids);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
