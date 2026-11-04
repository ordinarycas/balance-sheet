// P10 設定
import { h } from '../dom.js';
import { section } from '../components/table.js';
import { numField, dateField, labeled, button, choiceField } from '../components/forms.js';
import { ENGINES } from '../components/chart.js';
import { enable, permission, unregisterBackground } from '../reminder.js';

function toggle(app, key, label, hint) {
  const box = h('input', { type: 'checkbox', checked: !!app.prefs[key] });
  box.addEventListener('change', () => {
    app.setPref(key, box.checked);
    if (key === 'autoQuotes' || key === 'finmind') app.refreshQuotes(true);
    if (key === 'autoFx') app.refreshFx();
  });
  return h('div', { class: 'row' }, h('label', null, box, ` ${label}`), hint ? h('span', { class: 'note', text: hint }) : null);
}

export default function render(app) {
  const st = app.state;
  const fx = app.fx;
  const root = h('div', null, h('h1', { text: '設定' }));

  root.appendChild(section('全域參數', h('div', { class: 'formgrid' },
    labeled('查詢基準日', dateField({ value: st.settings.asOfDate ?? '', nullable: true, mutate: (d, v) => { d.settings.asOfDate = v; } }), '留空＝使用今天（台北時間）'),
    labeled('信貸／保單計息天數基準', numField({ value: st.settings.dayCountLoan, int: true, min: 1, max: 366, mutate: (d, v) => { d.settings.dayCountLoan = v; } }), '預設 365'),
    labeled('股票質押計息天數基準', numField({ value: st.settings.dayCountPledge, int: true, min: 1, max: 366, mutate: (d, v) => { d.settings.dayCountPledge = v; } }), '預設 360'),
    labeled('USD/TWD 匯率（手動備援）', numField({ value: st.settings.usdTwdManual, min: 0, step: '0.0001', mutate: (d, v) => { d.settings.usdTwdManual = v; } }), '自動匯率取不到時使用')),
  h('div', { class: 'row' }, h('span', null, `目前採用匯率：${app.usdTwd.toFixed(4)}（${app.prefs.autoFx && fx ? `自動，${fx.source}${fx.date ? ` ${fx.date}` : ''}` : '手動'}）`),
    app.fxStatus === 'fail' ? h('span', { class: 'pill warn', text: '自動匯率暫時無法取得，使用手動' }) : null,
    button('重新取得匯率', () => app.refreshFx()))));

  root.appendChild(section('繳費提醒', remindBlock(app)));

  root.appendChild(section('網路服務（皆可關閉；關閉後完全不發出任何網路請求）',
    toggle(app, 'autoQuotes', '自動取得股價', '向證交所下載「全市場最近收盤價」一個檔案，不會送出你的持股或代號。非即時。'),
    toggle(app, 'finmind', '證交所查無時，改用 FinMind 查詢上櫃股票', '會把「查無的股票代號」送到 api.finmindtrade.com，可能洩漏你持有該檔；預設關閉。'),
    toggle(app, 'autoFx', '自動取得 USD/TWD 匯率', '向 open.er-api.com，失敗再向 cdn.jsdelivr.net 取得公開匯率；只在有美元借款時才查詢。'),
    h('p', { class: 'note', text: '你的財務資料（借款、持股、明細）絕不會被送出。上述請求只含公開資訊的查詢。' })));

  root.appendChild(section('外觀', h('div', { class: 'row' },
    labeled('主題', choiceField({ value: app.prefs.theme, options: [['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']], onChange: (v) => { app.setPref('theme', v); } })),
    labeled('圖表引擎', choiceField({ value: app.prefs.chartLib, options: ENGINES, onChange: (v) => { app.setPref('chartLib', v); } }), '各引擎皆從本站載入、不連外；選用時才下載。')),
    h('p', { class: 'note', text: 'Lightweight Charts／Chart.js 以 Canvas 繪製，列印時自動轉為圖片；D3.js／ApexCharts 為 SVG，列印為向量。未提供 Nivo：它依賴 React，需要建置工具鏈，與本站「零建置、純靜態」的設計衝突。' })));

  root.appendChild(section('資料', h('p', null, '匯出入、Excel 與清除本機資料都集中在 ', h('a', { href: '#/data', text: 'P12 資料匯入／匯出' }), '。')));
  return root;
}

const PERM_ZH = { granted: '已允許通知', denied: '通知已被瀏覽器封鎖（請到瀏覽器的網站設定改為允許）', default: '尚未要求通知權限', unsupported: '此瀏覽器不支援通知（仍會顯示頁內橫幅）' };

function remindBlock(app) {
  const box = h('input', { type: 'checkbox', checked: !!app.prefs.remindTomorrow });
  box.addEventListener('change', async () => {
    app.setPref('remindTomorrow', box.checked);
    if (box.checked) {
      const p = await enable(app);
      app.toast(p === 'granted' ? '已開啟：明天有應繳項目時會提醒你' : `已開啟頁內橫幅提醒；${PERM_ZH[p] ?? ''}`);
    } else { await unregisterBackground(); }
    app.rerender();
  });
  return h('div', null,
    h('div', { class: 'row' }, h('label', null, box, ' 明天有要繳的費用時提醒我'), h('span', { class: 'pill', text: PERM_ZH[permission()] })),
    h('ul', { class: 'plain note' },
      h('li', { text: '開啟或回到本網站時檢查：頁面頂端顯示橫幅，已允許通知則同時送出系統通知（每天一次）。' }),
      h('li', { text: '網站完全關閉時無法保證準時通知：只有 Android 已安裝的 Chrome／Edge 會在背景盡力檢查，時間不固定；iPhone 需先「加入主畫面」（iOS 16.4 以上）才有通知。' }),
      h('li', { text: '要可靠的關閉後提醒，請到「P04 繳費日曆」匯出 .ics 行事曆檔，交給手機行事曆提醒。' }),
      h('li', { text: '所有判斷都在你的裝置上進行，沒有伺服器，繳費資料不會送出。' })));
}
