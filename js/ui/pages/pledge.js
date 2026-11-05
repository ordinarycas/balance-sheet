// P07 股票質押
import { h } from '../dom.js';
import { twd, pct, num } from '../fmt.js';
import { gridTable, kpi, section } from '../components/table.js';
import { numField, textField, labeled, button, deleteButton } from '../components/forms.js';

export function quoteStatus(app) {
  const q = app.quoteInfo;
  const when = q.fetchedAt ? new Date(q.fetchedAt).toLocaleTimeString('zh-TW', { hour12: false }) : null;
  let text;
  if (!app.prefs.autoQuotes) text = '自動行情已關閉，使用手動股價。可到「P10 設定」開啟。';
  else if (q.status === 'loading') text = '行情更新中…';
  else if (q.status === 'ok') text = `行情已更新（${when}）：證交所最近收盤價，非即時。${q.missing.length ? `查無：${q.missing.join('、')}，改用手動股價。` : ''}`;
  else if (q.status === 'fail') text = `行情服務暫時無法使用，已改用手動股價。${q.errors[0] ? `（${q.errors[0]}）` : ''}`;
  else text = '尚未取得行情。';
  return h('div', { class: `banner ${q.status === 'ok' && !q.missing.length ? 'info' : ''} no-print` }, text, ' ',
    button('重新整理', () => app.refreshQuotes(true), 'small', app.prefs.autoQuotes ? '重新向證交所取得最近收盤價' : '自動行情已關閉，無法重新整理', !app.prefs.autoQuotes));
}

export default function render(app) {
  const p = app.model.pledge;
  const st = app.state;
  const root = h('div', null, h('h1', { text: '股票質押' }),
    h('p', { class: 'sub', text: '股價優先採用行情服務的最近收盤價，取不到時用手動備援。藍字黃底可編輯。' }), quoteStatus(app));

  const rows = p.rows.map((r, i) => {
    const s = st.pledge.stocks[i];
    const mk = (fn) => (d, v) => fn(d.pledge.stocks[i], v);
    return [
      textField({ value: s.code, max: 30, mutate: mk((x, v) => { x.code = v; }) }),
      textField({ value: s.name, mutate: mk((x, v) => { x.name = v; }) }),
      numField({ value: s.shares, int: true, min: 0, mutate: mk((x, v) => { x.shares = v; }) }),
      r.auto === null ? '—' : num(r.auto, 2),
      numField({ value: s.manualPrice, min: 0, mutate: mk((x, v) => { x.manualPrice = v; }) }),
      num(r.price, 2),
      r.source,
      twd(r.value),
      numField({ value: s.ltv, min: 0, max: 1, step: '0.01', mutate: mk((x, v) => { x.ltv = v; }) }),
      twd(r.limit),
      numField({ value: Number((s.annualRate * 100).toPrecision(12)), min: 0, max: 99.99, step: '0.001', mutate: mk((x, v) => { x.annualRate = Number((v / 100).toPrecision(12)); }) }),
      twd(r.dailyIfFull, 2),
      deleteButton(() => app.commit((d) => { d.pledge.stocks.splice(i, 1); })),
    ];
  });
  root.appendChild(section('質押標的', gridTable({
    headers: ['代號', '股票名稱', '股數', '股價(自動)', '股價(手動備援)', '採用股價', '價格來源', '現值', '借款成數', '可借額度', '年利率(%)', '日息(若全額動用)', ''],
    numCols: [2, 3, 4, 5, 7, 8, 9, 10, 11], rows,
    foot: ['總額', '', '', '', '', '', '', twd(p.totalValue), '', twd(p.totalLimit), '', twd(p.totalDailyIfFull, 2), ''],
    empty: '尚未新增質押標的',
  }), h('div', { class: 'row' }, button('＋ 新增標的', () => app.commit((d) => {
    d.pledge.stocks.push({ code: `TPE:${String(1000 + d.pledge.stocks.length)}`, name: '', shares: 0, manualPrice: 0, ltv: 0.6, annualRate: 0.0645 });
  }), 'primary')), h('p', { class: 'note', text: '代號格式如 TPE:0050（上市）或 TPEX:6488（上櫃）。' })));

  root.appendChild(section('質押借款狀況', h('div', { class: 'row' },
    labeled('實際已借金額（負數）', numField({ value: st.pledge.borrowed, mutate: (d, v) => { d.pledge.borrowed = v; } }), '輸入負數或正數皆可，內部取絕對值'),
    labeled('利息繳款日（選填，1–31）', numField({ value: st.pledge.interestDay ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { d.pledge.interestDay = v; } }), '填入後才會列入繳費日曆')),
  h('div', { class: 'grid' },
    kpi('目前可借額度合計', twd(p.totalLimit)),
    kpi('超出可借額度', p.overLimit > 0 ? twd(p.overLimit) : '無（尚有額度）', p.overLimit > 0 ? 'bad' : 'good'),
    kpi('目前借款成數', pct(p.ltvActual)),
    kpi('加權年利率', pct(p.weightedRate)),
    kpi('日息（已借金額 × 加權利率 ÷ 360）', twd(p.dailyInterest, 2)),
    kpi('當月預估利息', twd(p.monthEstimate, 2)),
    kpi('年息估算（日息 × 365）', twd(p.yearEstimate)))));
  return root;
}
