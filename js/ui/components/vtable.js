// 虛擬捲動表格（Virtual Scrolling）：只渲染可視範圍，數千列也流暢。
import { h } from '../dom.js';

/**
 * @param {{cols:Array<{label:string,width:string,num?:boolean}>, count:number, getRow:(i:number)=>{cells:string[], cls?:string}, height?:number, rowH?:number}} o
 * @returns {HTMLElement & {scrollToRow:(i:number)=>void}}
 */
export function virtualTable({ cols, count, getRow, height = 480, rowH = 28, label = '資料表' }) {
  const template = cols.map((c) => c.width).join(' ');
  const head = h('div', { class: 'vt-head', role: 'row', 'aria-rowindex': '1', style: { gridTemplateColumns: template } },
    cols.map((c) => h('span', { class: c.num ? 'n' : '', role: 'columnheader', text: c.label })));
  const body = h('div', { class: 'vt-body', style: { position: 'relative', height: `${count * rowH}px` } });
  // tabindex=0：鍵盤可聚焦後用方向鍵／PageUp／PageDown／Home／End 捲動；虛擬列只存在可視範圍，所以用 aria-rowindex／rowcount 告知真實位置
  const box = h('div', { class: 'vt', tabindex: '0', style: { height: `${height}px` }, role: 'table', 'aria-label': `${label}（共 ${count} 列，方向鍵與 PageUp／PageDown 可捲動）`, 'aria-rowcount': String(count + 1), 'aria-colcount': String(cols.length) }, head, body);

  let raf = 0;
  const draw = () => {
    raf = 0;
    const top = Math.max(box.scrollTop - 32, 0);
    const first = Math.max(Math.floor(top / rowH) - 6, 0);
    const last = Math.min(Math.ceil((top + height) / rowH) + 6, count);
    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      const r = getRow(i);
      const row = h('div', { class: `vt-row ${r.cls || ''}`, role: 'row', 'aria-rowindex': String(i + 2), style: { top: `${i * rowH}px`, gridTemplateColumns: template } },
        cols.map((c, k) => h('span', { class: c.num ? 'n' : '', role: 'cell', text: r.cells[k] ?? '' })));
      frag.appendChild(row);
    }
    body.replaceChildren(frag);
  };
  box.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(draw); }, { passive: true });
  box.scrollToRow = (i) => { box.scrollTop = Math.max(i * rowH - height / 2 + 32, 0); draw(); };
  draw();
  return box;
}
