// P13 圖表分析：資產負債、比例、餘額走勢，並可套用「固定月收入」或「完全沒有收入」情境比較。
import { h } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { barChart, lineChart, legend } from '../components/chart.js';
import { choiceField, labeled, button } from '../components/forms.js';
import { donut, ratioBar } from '../components/donut.js';
import { balanceSheet, projectIncome, monthlySplit, effectiveIncome } from '../../core/scenario.js';

const HORIZONS = [[12, '12 個月'], [24, '24 個月'], [36, '36 個月'], [60, '60 個月'], [120, '120 個月']];

function incomeControls(app, income, saved) {
  const amt = h('input', { type: 'number', class: 'in', min: 0, step: 1000, value: income, 'aria-label': '固定月收入（NT$）', disabled: app.prefs.chartIncomeMode === 'zero' });
  amt.addEventListener('change', () => {
    const v = Number(amt.value);
    if (!Number.isFinite(v) || v < 0) { amt.value = income; app.toast('請輸入 0 或以上的金額'); return; }
    app.setPref('chartIncome', Math.round(v));
  });
  const quick = app.model.salary.scenarios.map((s) => button(`套用月薪情境 ${twd(s.salary)}`, () => { app.setPref('chartIncomeMode', 'fixed'); app.setPref('chartIncome', s.salary); }, 'small'));
  return h('div', { class: 'card no-print' },
    h('div', { class: 'incomebar' },
      labeled('收入情境', choiceField({
        label: '收入情境', value: app.prefs.chartIncomeMode,
        options: [['fixed', '套用固定月收入'], ['zero', '完全沒有收入（0）']],
        onChange: (v) => app.setPref('chartIncomeMode', v),
      })),
      labeled('固定月收入（NT$，稅後）', amt, saved > 0 ? '' : '未設定時沿用「月薪情境」第一筆'),
      labeled('推演期間', choiceField({ label: '推演期間', value: app.prefs.chartHorizon, options: HORIZONS, onChange: (v) => app.setPref('chartHorizon', Number(v)) }))),
    quick.length ? h('div', { class: 'quick' }, ...quick) : null,
    h('p', { class: 'note', text: '「完全沒有收入」會把所有生活支出與必繳款視為缺口，用來看最壞情況需要多少資金。此設定只存在你的瀏覽器，不屬於匯出的資料。' }));
}

export default function render(app) {
  const m = app.model;
  const bs = balanceSheet(m);
  const saved = app.prefs.chartIncome;
  const fixedIncome = effectiveIncome(m, saved);
  const mode = app.prefs.chartIncomeMode;
  const chosen = mode === 'zero' ? 0 : fixedIncome;
  const horizon = app.prefs.chartHorizon;
  const zero = projectIncome(m, 0, horizon);
  const fixed = projectIncome(m, fixedIncome, horizon);
  const cur = mode === 'zero' ? zero : fixed;
  const split = monthlySplit(m, chosen);
  const root = h('div', null,
    h('h1', { text: '圖表分析' }),
    h('p', { class: 'sub', text: `基準日 ${app.asOf}；金額單位 NT$。資產＝質押股票＋未質押持股現值；本站不記錄現金、存款或不動產，所以「淨值」只反映股票相對借款。` }));

  // 1. 資產負債
  root.appendChild(section('資產與負債',
    h('div', { class: 'grid' },
      kpi('總資產（股票現值）', twd(bs.assets.total)),
      kpi('總負債', twd(bs.liabilities.total), bs.liabilities.total > 0 ? 'bad' : ''),
      kpi('淨值（資產 − 負債）', twd(bs.net), bs.net < 0 ? 'bad' : ''),
      kpi('負債 ÷ 資產', bs.debtRatio === null ? '—' : pct(bs.debtRatio, 1))),
    legend([{ cls: 's1', name: '質押股票' }, { cls: 's2', name: '未質押持股' }, { cls: 's5', name: '借款（信貸／保單）' }, { cls: 's4', name: '質押借款' }]),
    barChart({
      labels: ['資產', '負債'], stacked: true, title: '資產與負債堆疊長條圖',
      series: [
        { name: '質押股票', values: [bs.assets.pledged, 0], cls: 's1' },
        { name: '未質押持股', values: [bs.assets.unpledged, 0], cls: 's2' },
        { name: '借款（信貸／保單）', values: [0, bs.liabilities.loanTotal], cls: 's5' },
        { name: '質押借款', values: [0, bs.liabilities.pledgeBorrowed], cls: 's4' },
      ],
      tipFmt: (v) => twd(v),
    })));

  // 2. 比例
  root.appendChild(section('比例圖', h('div', { class: 'chartgrid' },
    donut({ title: '資產組成', slices: [{ label: '質押股票', value: bs.assets.pledged }, { label: '未質押持股', value: bs.assets.unpledged }] }),
    donut({ title: '負債組成', slices: [...bs.liabilities.loans.map((l) => ({ label: l.name, value: l.value })), { label: '股票質押（已借）', value: bs.liabilities.pledgeBorrowed }] }),
    donut({ title: '每月固定支出組成', slices: [...m.salary.budget.items.map((x) => ({ label: x.label, value: x.amount })), ...m.salary.budget.must.map((x) => ({ label: x.label, value: x.amount }))] }))));

  // 3. 收入情境
  root.appendChild(section('收入情境', incomeControls(app, fixedIncome, saved)));

  root.appendChild(section(`每月收入如何分配（${chosen > 0 ? `月收入 ${twd(chosen)}` : '完全沒有收入'}）`,
    chosen > 0
      ? ratioBar({ title: '收入分配', parts: [{ label: '生活固定支出', value: split.living, idx: 1 }, { label: '必繳還款（月）', value: split.must, idx: 4 }, { label: '結餘（可提前還款）', value: split.surplus, idx: 2 }] })
      : h('p', null, '沒有收入時，每月需要自行備妥 ', h('strong', { text: twd(split.living + split.must) }), `（生活固定支出 ${twd(split.living)} ＋ 必繳還款 ${twd(split.must)}）。`),
    split.gap > 0 && chosen > 0 ? h('p', { class: 'note' }, h('strong', { text: `每月缺口 ${twd(split.gap)}` }), '：此收入不足以支付固定支出與必繳款。') : null));

  // 4. 餘額走勢
  const labels = zero.months.map((x, i) => (i === 0 ? x : x.slice(2)));
  root.appendChild(section(`負債餘額走勢（未來 ${horizon} 個月）`,
    legend([{ cls: 's5', name: '完全沒有收入' }, { cls: 's1', name: `固定收入 ${twd(fixedIncome)}` }]),
    lineChart({
      labels, monthKeys: zero.months, title: '負債餘額走勢',
      series: [{ name: '完全沒有收入', values: zero.balances, cls: 's5' }, { name: `固定收入 ${twd(fixedIncome)}`, values: fixed.balances, cls: 's1' }],
      tipFmt: (v) => twd(v),
    }),
    h('p', { class: 'note', text: '沒有收入時只有「必繳的本金攤還」會讓餘額下降（質押與保單借款本金不會減少）；有結餘時依雪崩法（利率高者優先）提前還款。利息不會滾入本金；缺口另計，不增加債務。' })));

  const top = m.salary.debts.slice(0, 4);
  const rest = m.salary.debts.slice(4);
  const per = (p) => [...top.map((d, i) => ({ name: d.name, values: p.perDebt[i], cls: `s${i + 1}` })),
    ...(rest.length ? [{ name: '其他借款', values: p.months.map((_, k) => rest.reduce((a, _d, j) => a + p.perDebt[4 + j][k], 0)), cls: 's5' }] : [])];
  if (m.salary.debts.length) {
    root.appendChild(section(`各筆借款餘額（${mode === 'zero' ? '完全沒有收入' : `固定收入 ${twd(fixedIncome)}`}）`,
      legend(per(cur).map((s) => ({ cls: s.cls, name: s.name }))),
      lineChart({ labels, monthKeys: cur.months, title: '各筆借款餘額走勢', series: per(cur), tipFmt: (v) => twd(v) })));
  }

  root.appendChild(section(`累計資金缺口（未來 ${horizon} 個月）`,
    legend([{ cls: 's5', name: '完全沒有收入' }, { cls: 's1', name: `固定收入 ${twd(fixedIncome)}` }]),
    lineChart({
      labels, monthKeys: zero.months, title: '累計資金缺口',
      series: [{ name: '完全沒有收入', values: zero.cumGap, cls: 's5' }, { name: `固定收入 ${twd(fixedIncome)}`, values: fixed.cumGap, cls: 's1' }],
      tipFmt: (v) => twd(v),
    }),
    h('p', { class: 'note', text: '累計缺口＝這段期間需要由收入以外的資金補足的金額。' })));

  // 5. 比較圖
  root.appendChild(section('情境比較',
    legend([{ cls: 's5', name: '完全沒有收入' }, { cls: 's1', name: `固定收入 ${twd(fixedIncome)}` }]),
    barChart({
      labels: ['每月結餘', `累計缺口`, '累計利息', '期末負債'], title: '收入情境比較',
      series: [
        { name: '完全沒有收入', values: [zero.monthlySurplus, zero.totalGap, zero.totalInterest, zero.endDebt], cls: 's5' },
        { name: `固定收入 ${twd(fixedIncome)}`, values: [fixed.monthlySurplus, fixed.totalGap, fixed.totalInterest, fixed.endDebt], cls: 's1' },
      ],
      tipFmt: (v) => twd(v),
    }),
    dataTable({
      label: '情境比較表',
      cols: [
        { label: '指標', get: (r) => r[0] },
        { label: '完全沒有收入', get: (r) => r[1], fmt: (v) => (typeof v === 'number' ? twd(v) : v), num: true },
        { label: `固定收入 ${twd(fixedIncome)}`, get: (r) => r[2], fmt: (v) => (typeof v === 'number' ? twd(v) : v), num: true },
      ],
      rows: [
        ['每月結餘（第 1 個月）', zero.monthlySurplus, fixed.monthlySurplus],
        [`累計缺口（${horizon} 個月）`, zero.totalGap, fixed.totalGap],
        [`累計利息（${horizon} 個月）`, zero.totalInterest, fixed.totalInterest],
        [`期末負債（${horizon} 個月後）`, zero.endDebt, fixed.endDebt],
        ['有缺口的月數', `${zero.gapMonths} 個月`, `${fixed.gapMonths} 個月`],
        ['全數還清月份（120 個月內）', zero.allPaid ?? '未還清', fixed.allPaid ?? '未還清'],
      ],
    })));
  return root;
}
