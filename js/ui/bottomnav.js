// 手機底部導覽列（≤860px 顯示）：常用 4 頁 + 「更多」底部面板。
// 桌機版側邊選單仍由 app.js 維護；兩者共用同一份 ROUTES。
import { h, svg } from './dom.js';

// 24×24 線條圖示（stroke 取 currentColor，可隨主題變色）
const ICONS = {
  overview: ['M3 12 12 4l9 8', 'M5 10v10h5v-6h4v6h5V10'],
  monthly: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  loans: ['M3 7h18v10H3z', 'M12 9.5v5', 'M9.5 12h5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
};

function icon(name) {
  return svg('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...ICONS[name].map((d) => svg('path', { d })));
}

const PRIMARY = [['overview', '總覽'], ['monthly', '每月'], ['calendar', '日曆'], ['loans', '借款']];
const GROUPS = [
  ['分析', ['charts', 'salary', 'schedule']],
  ['資產', ['pledge', 'holdings', 'expenses']],
  ['系統', ['settings', 'help', 'data']],
];

let bar = null;
let sheet = null;
let moreBtn = null;
let routeLinks = new Map();

/** @param {Array<[string,string,Function]>} routes */
export function initBottomNav(routes) {
  const label = new Map(routes.map((r) => [r[0], r[1]]));
  bar = document.getElementById('bottomnav');
  if (!bar) return;
  bar.replaceChildren();
  routeLinks = new Map();

  for (const [key, text] of PRIMARY) {
    const a = h('a', { href: `#/${key}` }, icon(key), h('span', { text }));
    routeLinks.set(key, a);
    bar.appendChild(a);
  }
  moreBtn = h('button', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': '更多功能' }, icon('more'), h('span', { text: '更多' }));
  bar.appendChild(moreBtn);

  sheet = h('dialog', { class: 'sheet', 'aria-label': '更多功能' },
    h('div', { class: 'sheet-head' }, h('strong', { text: '更多功能' }),
      h('button', { type: 'button', class: 'small', text: '關閉', onclick: () => sheet.close() })),
    ...GROUPS.map(([title, keys]) => h('div', { class: 'sheet-group' },
      h('div', { class: 'sheet-title', text: title }),
      h('div', { class: 'sheet-links' }, keys.map((k) => {
        const a = h('a', { href: `#/${k}`, text: label.get(k) ?? k });
        routeLinks.set(k, a);
        return a;
      })))));
  document.body.appendChild(sheet);

  moreBtn.addEventListener('click', () => { if (!sheet.open) sheet.showModal(); });
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('a')) sheet.close(); }); // 點背景或連結即關閉
}

export function updateBottomNav(route) {
  if (!bar) return;
  for (const [k, a] of routeLinks) {
    if (k === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const inMore = !PRIMARY.some(([k]) => k === route);
  if (inMore) moreBtn.setAttribute('aria-current', 'page'); else moreBtn.removeAttribute('aria-current');
}
