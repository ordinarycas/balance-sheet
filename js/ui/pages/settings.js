// P10 設定
import { h } from '../dom.js';
import { section } from '../components/table.js';
import { cardIds } from '../../core/expenses.js';
import { numField, textField, dateField, labeled, button, choiceField } from '../components/forms.js';
import { ENGINES } from '../components/chart.js';
import { BUILD_ID, BUILD_DATE } from '../../core/build.js';
import { APP_VERSION } from '../../core/constants.js';
import { checkForUpdate, applyUpdate, lastCheckText, state as updState } from '../update.js';
import { installState, promptInstall } from '../install.js';
import { enable, permission, disable } from '../reminder.js';

function toggle(app, key, label, hint) {
  const box = h('input', { type: 'checkbox', checked: !!app.prefs[key] });
  box.addEventListener('change', () => {
    app.setPref(key, box.checked);
    // 只有「開啟」才會連線；關閉時 refresh 只會清掉已抓到的資料，不發出請求
    if (key === 'autoQuotes' || (key === 'finmind' && box.checked)) app.refreshQuotes(true);
    if (key === 'autoFx') app.refreshFx();
  });
  return h('div', { class: 'toggle' }, h('label', null, box, h('span', { text: label })), hint ? h('p', { class: 'note', text: hint }) : null);
}

export default function render(app) {
  const st = app.state;
  const fx = app.fx;
  const root = h('div', null, h('h1', { text: '設定' }));

  root.appendChild(section('全域參數', h('div', { class: 'formgrid' },
    labeled('查詢基準日', dateField({ value: st.settings.asOfDate ?? '', nullable: true, mutate: (d, v) => { d.settings.asOfDate = v; } }), '留空＝使用今天（台北時間）'),
    labeled('信貸／保單計息天數基準', numField({ value: st.settings.dayCountLoan, int: true, min: 1, max: 366, mutate: (d, v) => { d.settings.dayCountLoan = v; } }), '預設 365'),
    labeled('股票質押計息天數基準', numField({ value: st.settings.dayCountPledge, int: true, min: 1, max: 366, mutate: (d, v) => { d.settings.dayCountPledge = v; } }), '預設 360'),
    labeled('每月發薪日', numField({ value: st.settings.payDay ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { d.settings.payDay = v; } }), '用於「下次發薪」倒數；31 日遇到沒有該日的月份取月底'),
    labeled('USD/TWD 匯率（手動備援）', numField({ value: st.settings.usdTwdManual, min: 0, step: '0.0001', mutate: (d, v) => { d.settings.usdTwdManual = v; } }), '自動匯率取不到時使用')),
  h('div', { class: 'row' }, h('span', null, `目前採用匯率：${app.usdTwd.toFixed(4)}（${app.prefs.autoFx && fx ? `自動，${fx.source}${fx.date ? ` ${fx.date}` : ''}` : '手動'}）`),
    app.fxStatus === 'fail' ? h('span', { class: 'pill warn', text: '自動匯率暫時無法取得，使用手動' }) : null,
    button('重新取得匯率', () => app.refreshFx(), '', app.prefs.autoFx ? '重新向公開匯率服務取得' : '自動匯率已關閉；到下方「網路服務」開啟後才能使用', !app.prefs.autoFx))));

  root.appendChild(section('名稱設定（戶頭、卡片、借款）', namesBlock(app)));

  root.appendChild(section('安裝成手機 App', installBlock(app)));

  root.appendChild(section('繳費提醒', remindBlock(app)));

  root.appendChild(section('網路服務（皆可關閉）',
    toggle(app, 'autoQuotes', '自動取得股價', '向證交所下載「全市場最近收盤價」一個檔案，不會送出你的持股或代號。非即時。'),
    toggle(app, 'finmind', '證交所查無時，改用 FinMind 查詢上櫃股票', '會把「查無的股票代號」送到 api.finmindtrade.com，可能洩漏你持有該檔；預設關閉。'),
    toggle(app, 'autoFx', '自動取得 USD/TWD 匯率', '向 open.er-api.com，失敗再向 cdn.jsdelivr.net 取得公開匯率；只在有美元借款時才查詢。'),
    toggle(app, 'autoUpdate', '自動檢查網站更新', '向本網站自己的伺服器取得一個小檔（版本代號），不含任何你的資料。關閉後只有按「檢查更新」才會連線；已安裝的離線版本也不會在背景檢查。'),
    h('p', { class: 'note', text: '三個「自動」開關關閉後，本站不會自己連線；你主動按「檢查更新」時才會向本網站伺服器確認版本。載入頁面本身（含本站的程式檔與圖表引擎）是從本網站伺服器下載，這不在開關範圍內。你的財務資料（借款、持股、明細）絕不會被送出，上述請求只含公開資訊的查詢。' })));

  root.appendChild(section('外觀', h('div', { class: 'formgrid appearance' },
    labeled('主題', choiceField({ value: app.prefs.theme, options: [['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']], onChange: (v) => { app.setPref('theme', v); } })),
    labeled('圖表引擎', choiceField({ value: app.prefs.chartLib, options: ENGINES, onChange: (v) => { app.setPref('chartLib', v); } }))),
    h('p', { class: 'note', text: '各引擎皆從本站載入、不連外；選用時才下載。Lightweight Charts／Chart.js 以 Canvas 繪製，列印時自動轉為圖片；D3.js／ApexCharts 為 SVG，列印為向量。未提供 Nivo：它依賴 React，需要建置工具鏈，與本站「零建置、純靜態」的設計衝突。' })));

  root.appendChild(section('版本與更新', h('div', { class: 'row' },
    h('span', null, `版本 ${APP_VERSION}　·　更新於 ${BUILD_DATE}　·　${BUILD_ID}`),
    button(updState.checking ? '檢查中…' : '檢查更新', () => checkForUpdate(), '', '向伺服器確認有沒有新版本'),
    h('span', { class: 'note', text: updState.available ? `有新版本（${updState.remote?.date}）` : lastCheckText() }),
    updState.available ? button('立即更新', () => applyUpdate(), 'primary') : null), h('p', { class: 'note', text: '更新日期＝網站內容最後一次變動的日期；安裝為 App 或離線使用時，有新版本會在頁面頂端提示重新整理。' })));

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
    } else { await disable(); app.toast('已關閉繳費提醒'); }
    app.rerender();
  });
  return h('div', null,
    h('div', { class: 'toggle' }, h('label', null, box, h('span', { text: '明天有要繳的費用時提醒我' })), h('p', null, h('span', { class: 'pill', text: PERM_ZH[permission()] }))),
    labeled('提醒語氣', choiceField({ label: '提醒語氣', value: app.prefs.remindTone, options: [['neutral', '中性（預設）：只列出項目與金額'], ['encourage', '鼓勵：標題加一句平和的話']], onChange: (v) => { app.setPref('remindTone', v); } })),
    h('ul', { class: 'plain note' },
      h('li', { text: '開啟或回到本網站時檢查：頁面頂端顯示橫幅，已允許通知則同時送出系統通知（每天一次）。' }),
      h('li', { text: '網站完全關閉時無法保證準時通知：只有 Android 已安裝的 Chrome／Edge 會在背景盡力檢查，時間不固定；iPhone 需先「加入主畫面」（iOS 16.4 以上）才有通知。' }),
      h('li', { text: '要可靠的關閉後提醒，請到「P04 繳費日曆」匯出 .ics 行事曆檔，交給手機行事曆提醒。' }),
      h('li', { text: '所有判斷都在你的裝置上進行，沒有伺服器，繳費資料不會送出。' })));
}

const IOS_STEPS = ['用 Safari 開啟本網站（其他瀏覽器在 iPhone 上無法安裝）', '點下方的「分享」按鈕（方框加向上箭頭）', '選「加入主畫面」，再按「新增」'];
const MANUAL_STEPS = ['Android Chrome：點右上角「⋮」→「安裝應用程式」（或「加到主畫面」）', 'Edge：點「⋯」→「應用程式」→「將此網站安裝為應用程式」', '桌機 Chrome／Edge：網址列右側的安裝圖示'];

function installBlock(app) {
  const st = installState();
  if (st === 'installed') return h('p', null, h('span', { class: 'pill ok', text: '已安裝' }), ' 你正在以 App 模式使用。');
  const kids = [];
  if (st === 'prompt') {
    kids.push(h('p', { class: 'note', text: '安裝後會出現在主畫面，全螢幕開啟、可離線使用；資料仍只存在這支手機的瀏覽器儲存空間。' }),
      button('安裝 App', async () => { const r = await promptInstall(); if (r === 'accepted') app.toast('已安裝，可從主畫面開啟'); app.rerender(); }, 'primary'));
  } else {
    const ios = st === 'ios';
    kids.push(h('p', { class: 'note', text: ios ? 'iPhone／iPad 沒有安裝按鈕，請照下面步驟加入主畫面：' : '此瀏覽器目前沒有提供一鍵安裝，請用瀏覽器選單：' }),
      h('ol', { class: 'steps' }, ...(ios ? IOS_STEPS : MANUAL_STEPS).map((x) => h('li', { text: x }))),
      h('p', { class: 'note', text: '需要 HTTPS 網址（例如 GitHub Pages）才能安裝；用電腦本機網址（localhost）測試時不會出現。已安裝過或剛拒絕過，瀏覽器可能暫時不再提示。' }));
  }
  return h('div', null, ...kids);
}

/** 自訂各戶頭的顯示名稱：信用卡（卡別代號）、借款、股票質押帳戶。名稱只在這個瀏覽器的資料裡，會一併出現在圖表、日曆與匯出檔。 */
function namesBlock(app) {
  const st = app.state;
  const ids = cardIds(st.cards);
  const rows = [];
  ids.forEach((id) => rows.push(labeled(`信用卡／戶頭（代號 ${id}）`, textField({
    value: st.cards.names[id] ?? '', max: 40, placeholder: id,
    mutate: (d, v) => { if (v) d.cards.names[id] = v; else delete d.cards.names[id]; },
  }))));
  st.loans.forEach((l, i) => rows.push(labeled(`借款 ${i + 1}`, textField({ value: l.name, max: 40, placeholder: '借款名稱', mutate: (d, v) => { d.loans[i].name = v; } }))));
  rows.push(labeled('股票質押帳戶', textField({ value: st.pledge.accountName ?? '', max: 40, placeholder: '股票質押', mutate: (d, v) => { d.pledge.accountName = v; } })));
  return h('div', null,
    h('div', { class: 'formgrid names' }, ...rows),
    h('p', { class: 'note', text: ids.length ? '清空欄位會還原成預設名稱（卡片顯示代號）。' : '還沒有信用卡；到「P09 支出」新增後，這裡就能改名稱。' }));
}
