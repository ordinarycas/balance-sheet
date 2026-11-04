// P01 總覽
import { h } from '../dom.js';
import { twd, pct, signCls } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { lineChart, legend } from '../components/chart.js';
import { button } from '../components/forms.js';
import { demoState } from '../../data/demo.js';
import { hasData } from '../../data/store.js';
import { countdownCards } from '../components/countdown.js';

function onboarding(app) {
  return h('div', { class: 'card' },
    h('h2', { text: '歡迎使用' }),
    h('p', null, '這是純靜態的個人財務試算工具：所有資料只存在這個瀏覽器的本機儲存空間，不會上傳到任何伺服器。你可以：'),
    h('div', { class: 'row' },
      button('載入示範資料（虛構）', () => app.commit((d) => Object.assign(d, demoState(app.asOf))), 'primary'),
      button('匯入我的 JSON 備份', () => app.navigate('data')),
      button('從空白開始（先新增借款）', () => app.navigate('loans'))),
    h('p', { class: 'note', text: '示範資料全為虛構，隨時可在「P12 資料匯入／匯出」清除。' }));
}

export default function render(app) {
  const m = app.model;
  const ov = m.overview;
  const root = h('div', null,
    h('h1', { text: '總覽' }),
    h('p', { class: 'sub', text: `基準日 ${app.asOf}；金額單位 NT$（美元借款以 ${app.usdTwd.toFixed(4)} 折算）` }));
  if (!hasData()) root.appendChild(onboarding(app));
  else root.appendChild(countdownCards(app));

  // 負債表
  const rows = [
    ...ov.loanRows.map((r) => ({ name: r.name, bal: r.balanceTWD, rate: r.annualRate, daily: r.dailyInterestTWD, month: r.monthEstimateTWD,
      next: r.nextDue, nextAmt: r.nextPaymentTWD, left: r.kind === 'interest_only_annual' ? '—' : r.remainingPeriods })),
    { name: ov.pledgeRow.name, bal: ov.pledgeRow.balanceTWD, rate: ov.pledgeRow.annualRate, daily: ov.pledgeRow.dailyInterestTWD, month: ov.pledgeRow.monthEstimateTWD, next: '依對帳單', nextAmt: null, left: '—' },
  ];
  const t = ov.totals;
  root.appendChild(section('負債表', dataTable({
    cols: [
      { label: '項目', get: (r) => r.name },
      { label: '本金餘額', get: (r) => r.bal, fmt: (v) => twd(v), num: true },
      { label: '年利率', get: (r) => r.rate, fmt: (v) => pct(v), num: true },
      { label: '今日日息', get: (r) => r.daily, fmt: (v) => twd(v, 2), num: true },
      { label: '當月預估利息', get: (r) => r.month, fmt: (v) => twd(v), num: true },
      { label: '下次繳款日', get: (r) => r.next ?? '已結清', center: true },
      { label: '下次繳款金額', get: (r) => r.nextAmt, fmt: (v) => (v === null ? '—' : twd(v)), num: true },
      { label: '剩餘期數', get: (r) => r.left, num: true },
    ],
    rows,
    foot: [{ cells: ['合計（利率為本金加權平均）', twd(t.balanceTWD), pct(t.annualRate), twd(t.dailyInterestTWD, 2), twd(t.monthEstimateTWD), '', '', ''] }],
  }), h('p', { class: 'note', text: '今日日息＝本金餘額 × 年利率 ÷ 計息天數；質押以加權年利率 ÷ 360 計。' })));

  // 質押與持股
  const p = m.pledge;
  root.appendChild(section('股票質押與持股', h('div', { class: 'grid' },
    kpi('質押股票現值', twd(p.totalValue)),
    kpi(`可借額度（成數依各檔設定）`, twd(p.totalLimit)),
    kpi('實際已借金額', twd(p.borrowed)),
    kpi('超出可借額度', twd(Math.max(p.overLimit, 0)) === '-' ? (p.overLimit < 0 ? `尚有 ${twd(-p.overLimit)}` : '-') : twd(p.overLimit), p.overLimit > 0 ? 'bad' : ''),
    kpi('目前借款成數', pct(p.ltvActual)),
    kpi('持股現值（未質押）', twd(m.holdings.totalValue)))));

  // 現金流
  const f = ov.flow;
  root.appendChild(section('現金流與損益', dataTable({
    cols: [{ label: '項目', get: (r) => r.label }, ...f.map((x, i) => ({ label: x.label, get: (r) => r.v[i], fmt: (v) => twd(v), num: true, cls: (v) => signCls(v) }))],
    rows: [
      { label: '信用卡', v: f.map((x) => x.card) },
      { label: '房租', v: f.map((x) => x.rent) },
      { label: '家裡支出', v: f.map((x) => x.home) },
      { label: '支出合計', v: f.map((x) => x.living) },
      { label: '信貸每月固定月繳', v: f.map(() => ov.fixedLoanMonthly) },
      { label: '含信貸月繳的月支出', v: f.map((x) => x.total) },
    ],
    foot: [{ cells: ['已實現損益累計', twd(m.pnl.total), ''] }],
  }), h('p', { class: 'note', text: '顯示基準日的前一個月與當月。支出為負數。' })));

  // 走勢圖
  if (ov.trend.length > 1) {
    root.appendChild(section('借款本金餘額走勢（月底，不含質押）',
      legend([{ cls: 's1', name: '本金餘額（NT$）' }]),
      lineChart({ labels: ov.trend.map((x) => x.key.slice(2)), monthKeys: ov.trend.map((x) => x.key), series: [{ name: '本金餘額', values: ov.trend.map((x) => x.balance), cls: 's1' }], tipFmt: (v) => twd(v) })));
  }
  return root;
}
