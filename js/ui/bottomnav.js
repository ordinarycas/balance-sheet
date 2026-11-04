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
export function initBottomNav(routes, { onCheckUpdate } = {}) {
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

  const grip = h('div', { class: 'sheet-grip', role: 'separator', 'aria-orientation': 'horizontal', tabindex: '0', 'aria-label': '拖曳調整面板高度（也可用上下方向鍵）', title: '拖曳調整高度；雙擊切換' }, h('span'));
  sheet = h('dialog', { class: 'sheet', 'aria-label': '更多功能' }, grip,
    h('div', { class: 'sheet-head' }, h('strong', { text: '更多功能' }),
      h('button', { type: 'button', class: 'small', text: '關閉', onclick: () => sheet.close() })),
    ...GROUPS.map(([title, keys]) => h('div', { class: 'sheet-group' },
      h('div', { class: 'sheet-title', text: title }),
      h('div', { class: 'sheet-links' }, keys.map((k) => {
        const a = h('a', { href: `#/${k}`, text: label.get(k) ?? k });
        routeLinks.set(k, a);
        return a;
      })))));
  if (onCheckUpdate) sheet.appendChild(h('div', { class: 'sheet-group' }, h('button', { type: 'button', class: 'sheet-update', text: '檢查網站更新', onclick: () => onCheckUpdate() })));
  document.body.appendChild(sheet);
  enableResize(sheet, grip);

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

// ---- 面板高度可拖曳（往上拉變高、往下拉變矮；拉得很矮就收起）。高度記在本機，下次沿用。 ----
const H_KEY = 'pfs.sheetHeight';
const MIN_H = 160;
const maxH = () => Math.round(window.innerHeight * 0.92);
const clampH = (v) => Math.min(maxH(), Math.max(MIN_H, Math.round(v)));

function enableResize(dlg, grip) {
  const apply = (px) => { dlg.style.height = px ? `${clampH(px)}px` : ''; grip.setAttribute('aria-valuenow', String(px ? clampH(px) : Math.round(dlg.getBoundingClientRect().height))); };
  const save = (px) => { try { if (px) localStorage.setItem(H_KEY, String(clampH(px))); else localStorage.removeItem(H_KEY); } catch { /* 隱私模式略過 */ } };
  let saved = 0;
  try { saved = Number(localStorage.getItem(H_KEY)) || 0; } catch { /* 略過 */ }
  const restore = () => { apply(saved); };
  new MutationObserver(() => { if (dlg.open) restore(); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });

  let startY = 0; let startH = 0; let dragging = false;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; startH = dlg.getBoundingClientRect().height;
    grip.setPointerCapture(e.pointerId); dlg.classList.add('resizing'); e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => { if (dragging) apply(startH + (startY - e.clientY)); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; dlg.classList.remove('resizing');
    const h = startH + (startY - e.clientY);
    if (h < MIN_H - 40) { dlg.close(); apply(saved); return; } // 拖到很矮＝收起
    saved = clampH(h); save(saved); apply(saved);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => { const cur = dlg.getBoundingClientRect().height; saved = cur < maxH() - 20 ? maxH() : 0; save(saved); apply(saved); });
  grip.addEventListener('keydown', (e) => {
    const cur = dlg.getBoundingClientRect().height;
    const next = e.key === 'ArrowUp' ? cur + 40 : e.key === 'ArrowDown' ? cur - 40 : e.key === 'Home' ? MIN_H : e.key === 'End' ? maxH() : null;
    if (next === null) return;
    e.preventDefault(); saved = clampH(next); save(saved); apply(saved);
  });
  window.addEventListener('resize', () => { if (dlg.open && saved) apply(saved); });
}
