// 熱力圖（自繪 HTML 表格）：列＝項目、欄＝月份，色階＋格內數字（不只靠顏色），
// 表格語意讓螢幕閱讀器可逐格閱讀；手機可左右捲動。
import { h } from '../dom.js';
import { twd, compact } from '../fmt.js';
import { heatLevel } from '../../core/chartdata.js';

/**
 * @param {{title:string, months:string[], rows:{label:string, values:number[], total:number}[], colTotals:number[], max:number, grand:number}} o
 */
export function heatmap({ title, months, rows, colTotals, max, grand }) {
  if (!rows.length) return h('p', { class: 'note', text: `${title}：目前沒有資料` });
  const mLabel = (m) => `${+m.slice(5, 7)}月`;
  const head = h('thead', null, h('tr', null,
    h('th', { scope: 'col', class: 'hm-row', text: '項目' }),
    months.map((m, i) => h('th', { scope: 'col', class: 'n', title: m, text: i === 0 || m.endsWith('-01') ? `${m.slice(2, 4)}/${mLabel(m)}` : mLabel(m) })),
    h('th', { scope: 'col', class: 'n', text: '合計' })));
  const body = h('tbody', null, rows.map((r) => h('tr', null,
    h('th', { scope: 'row', class: 'hm-row', text: r.label }),
    r.values.map((v, k) => h('td', { class: `n hm hm${heatLevel(v, max)}`, title: `${r.label} ${months[k]}：${twd(v)}` }, v > 0 ? compact(v) : '·')),
    h('td', { class: 'n hm-tot', text: compact(r.total) }))));
  const foot = h('tfoot', null, h('tr', { class: 'total' },
    h('th', { scope: 'row', class: 'hm-row', text: '每月合計' }),
    colTotals.map((v) => h('td', { class: 'n', text: compact(v) })),
    h('td', { class: 'n', text: compact(grand) })));
  const scale = h('div', { class: 'hm-scale', 'aria-hidden': 'true' },
    h('span', { text: '少' }), [1, 2, 3, 4, 5].map((l) => h('i', { class: `hm${l}` })), h('span', { text: `多（單格最大 ${twd(max)}）` }));
  return h('figure', { class: 'hm-fig' },
    h('figcaption', { text: title }),
    h('div', { class: 'tablewrap', tabindex: '0', role: 'region', 'aria-label': `${title}（可左右捲動）` }, h('table', { class: 'heat' }, head, body, foot)),
    scale);
}

/**
 * 每月日期熱力圖：1–31 日排成月曆格（每列 7 天），顏色＝未來 12 個月落在該日的應繳金額合計，格內另有金額與筆數。
 * @param {{title:string, d:ReturnType<typeof import('../../core/chartdata.js').payDayDensity>}} o
 */
export function dayHeatmap({ title, d }) {
  if (!d.total) return h('p', { class: 'note', text: `${title}：目前沒有應繳款項` });
  const cell = (c) => {
    const lvl = heatLevel(c.total, d.max);
    const label = c.total > 0 ? `每月 ${c.day} 日：${d.months} 個月合計 ${twd(c.total)}，共 ${c.count} 筆（${c.items.join('、')}）` : `每月 ${c.day} 日：沒有應繳款項`;
    return h('td', { class: `hm hm${lvl} hm-day`, title: label },
      h('span', { class: 'sr-only', text: label }),
      h('span', { class: 'hd', 'aria-hidden': 'true', text: String(c.day) }),
      h('span', { class: 'hv', 'aria-hidden': 'true', text: c.total > 0 ? compact(c.total) : '' }),
      h('span', { class: 'hc', 'aria-hidden': 'true', text: c.count ? `${c.count} 筆` : '' }));
  };
  const weeks = [];
  for (let i = 0; i < 31; i += 7) {
    const row = d.days.slice(i, i + 7).map(cell);
    while (row.length < 7) row.push(h('td', { class: 'hm-empty', 'aria-hidden': 'true' }));
    weeks.push(h('tr', null, row));
  }
  const top = d.top.length
    ? h('p', null, '最集中的日子：', d.top.map((c, i) => h('span', null, i ? '；' : '', h('strong', { text: `${c.day} 日` }), `（${twd(c.total)}，${c.count} 筆）`)))
    : null;
  return h('figure', { class: 'hm-fig' },
    h('figcaption', { text: title }),
    top,
    h('div', { class: 'tablewrap', tabindex: '0', role: 'region', 'aria-label': `${title}（可左右捲動）` },
      h('table', { class: 'heat dayheat', 'aria-label': title }, h('tbody', null, weeks))),
    h('div', { class: 'hm-scale', 'aria-hidden': 'true' },
      h('span', { text: '少' }), [1, 2, 3, 4, 5].map((l) => h('i', { class: `hm${l}` })), h('span', { text: `多（單日最大 ${twd(d.max)}）` })));
}
