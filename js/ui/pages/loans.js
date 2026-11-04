// P05 借款：條件（可編輯）、目前狀況、日／月／年利息成本
import { h } from '../dom.js';
import { twd, money, pct } from '../fmt.js';
import { dataTable, section, gridTable } from '../components/table.js';
import { numField, textField, dateField, selectField, labeled, button, deleteButton } from '../components/forms.js';
import { emptyLoan } from '../../data/schema.js';
import { dn, iso, eomonth } from '../../core/dates.js';
import { dueDatesOf, rateAtDn } from '../../core/loan.js';
import { KIND_LABELS } from '../../core/constants.js';

const pctVal = (x) => Number((x * 100).toPrecision(12));
const fromPct = (v) => Number((v / 100).toPrecision(12));

function ruleKind(rule) {
  if (rule === 'EOM') return 'EOM';
  if (rule === 'YEARLY') return 'YEARLY';
  return 'DAY';
}

/** 利率變動與提前還款（只適用攤還型）。 */
function eventsBlock(app, l, i) {
  const sched = app.model.schedules[i];
  const dues = dueDatesOf(l).filter((d) => !Number.isNaN(d)).map((d) => iso(d));
  const rc = l.rateChanges ?? [];
  const pp = l.prepayments ?? [];
  const nextDue = dues.find((d) => d > app.asOf) ?? dues[dues.length - 1] ?? '';
  const mkRc = (j, fn) => (d, v) => fn(d.loans[i].rateChanges[j], v);
  const mkPp = (j, fn) => (d, v) => fn(d.loans[i].prepayments[j], v);
  const summary = [];
  if (sched && !sched.error && sched.prepayTotal > 0) summary.push(`已安排提前還款 ${money(sched.prepayTotal, l.currency, l.currency === 'USD' ? 2 : 0)}`);
  if (sched && !sched.error && sched.rows.length < (l.periods ?? 0)) summary.push(`預計提前 ${l.periods - sched.rows.length} 期結清（共 ${sched.rows.length} 期）`);
  const sorted = (arr) => arr.map((x, j) => [x, j]);
  return h('details', { class: 'no-print' },
    h('summary', { text: `利率變動與提前還款${rc.length || pp.length ? `（${rc.length} 筆利率、${pp.length} 筆提前還款）` : '（選填）'}` }),
    summary.length ? h('p', { class: 'pill', text: summary.join('；') }) : null,
    h('h3', { text: '利率變動' }),
    gridTable({
      headers: ['新利率起算日（含）', '年利率（%）', ''], numCols: [1],
      rows: sorted(rc).map(([x, j]) => [
        dateField({ value: x.date, mutate: mkRc(j, (o, v) => { o.date = v; }) }),
        numField({ value: pctVal(x.annualRate), min: 0, max: 99.999, step: '0.001', mutate: mkRc(j, (o, v) => { o.annualRate = fromPct(v); }) }),
        deleteButton(() => app.commit((d) => { d.loans[i].rateChanges.splice(j, 1); })),
      ]),
      empty: '沒有利率變動',
    }),
    h('div', { class: 'row' }, button('＋ 新增利率變動', () => app.commit((d) => {
      const t = app.asOf > l.startDate ? app.asOf : iso(dn(l.startDate) + 1);
      (d.loans[i].rateChanges ??= []).push({ date: t, annualRate: l.annualRate });
    })), h('span', { class: 'note', text: '新利率自該日起計息；跨期利息依各段天數分段計算，月付金於下一個繳款日起依新利率與剩餘期數重算。' })),
    h('h3', { text: '提前還款' }),
    gridTable({
      headers: ['提前還款日（須為繳款日）', '金額（原幣）', '方式', ''], numCols: [1],
      rows: sorted(pp).map(([x, j]) => [
        selectField({ value: x.date, options: (dues.includes(x.date) ? dues : [x.date, ...dues]).map((d) => [d, d]), mutate: mkPp(j, (o, v) => { o.date = v; }) }),
        numField({ value: x.amount, min: 0, mutate: mkPp(j, (o, v) => { o.amount = v; }) }),
        selectField({ value: x.mode ?? 'shorten', options: [['shorten', '縮短年限（月付金不變）'], ['reduce', '縮小月付金（期數不變）']], mutate: mkPp(j, (o, v) => { o.mode = v; }) }),
        deleteButton(() => app.commit((d) => { d.loans[i].prepayments.splice(j, 1); })),
      ]),
      empty: '沒有提前還款',
    }),
    h('div', { class: 'row' }, dues.length ? button('＋ 新增提前還款', () => app.commit((d) => {
      (d.loans[i].prepayments ??= []).push({ date: nextDue, amount: Math.max(1, Math.round(l.principal / 10)), mode: 'shorten' });
    })) : null, h('span', { class: 'note', text: '在該期繳款日於正常本金之外多還一筆；超過餘額時只還到清償為止。' })),
    rc.length ? h('p', { class: 'note', text: `基準日 ${app.asOf} 適用年利率：${pct(rateAtDn(sched, dn(app.asOf)))}` }) : null);
}

function loanCard(app, l, i) {
  const annual = l.kind === 'interest_only_annual';
  const m = (fn) => (d, v) => fn(d.loans[i], v);
  const rk = ruleKind(l.dueRule);
  const dayNum = /^DAY_(\d+)$/.exec(l.dueRule)?.[1] ?? '1';
  const fields = [
    labeled('名稱', textField({ value: l.name, mutate: m((x, v) => { x.name = v; }) })),
    labeled('類型', selectField({ value: l.kind, options: Object.entries(KIND_LABELS), mutate: m((x, v) => {
      x.kind = v;
      if (v === 'interest_only_annual') { x.dueRule = 'YEARLY'; x.calibration = null; x.periods = null; }
      else { if (x.dueRule === 'YEARLY') x.dueRule = 'EOM'; if (!x.periods) x.periods = 12; }
    }) })),
    labeled('幣別', selectField({ value: l.currency, options: [['TWD', 'TWD 新台幣'], ['USD', 'USD 美元']], mutate: m((x, v) => { x.currency = v; x.decimals = v === 'USD' ? 2 : 0; }) })),
    labeled('借款本金（原幣）', numField({ value: l.principal, min: 0, mutate: m((x, v) => { x.principal = v; }) })),
    labeled('年利率（%）', numField({ value: pctVal(l.annualRate), min: 0, max: 99.999, step: '0.001', mutate: m((x, v) => { x.annualRate = fromPct(v); }) })),
    annual ? labeled('試算年數', numField({ value: l.periods ?? '', int: true, min: 1, max: 100, nullable: true, placeholder: '預設 7', mutate: m((x, v) => { x.periods = v; }) }), '年繳利息型的試算期數')
      : labeled('期數', numField({ value: l.periods, int: true, min: 1, max: 600, mutate: m((x, v) => { x.periods = v; }) })),
    labeled('起息日', dateField({ value: l.startDate, mutate: m((x, v) => { x.startDate = v; }) })),
    labeled('首次繳款日', dateField({ value: l.firstDueDate, mutate: m((x, v) => { x.firstDueDate = v; }) })),
    annual ? labeled('繳款方式', h('input', { type: 'text', value: '每年同月同日', readOnly: true }))
      : labeled('繳款方式', selectField({ value: rk, options: [['EOM', '每月底'], ['DAY', '每月固定日']], mutate: m((x, v) => { x.dueRule = v === 'EOM' ? 'EOM' : `DAY_${dayNum}`; }) })),
    !annual && rk === 'DAY' ? labeled('每月幾日', numField({ value: Number(dayNum), int: true, min: 1, max: 31, mutate: m((x, v) => { x.dueRule = `DAY_${v}`; }) })) : null,
    labeled('小數位', numField({ value: l.decimals, int: true, min: 0, max: 6, mutate: m((x, v) => { x.decimals = v; }) })),
  ];
  const cal = l.calibration;
  const calBlock = annual ? null : h('div', { class: 'row' },
    labeled('餘額校正日（選填）', dateField({ value: cal?.date ?? '', nullable: true, mutate: m((x, v) => { x.calibration = v ? { date: v, balance: x.calibration?.balance ?? 0 } : null; }) }), '必須是某一期的繳款日'),
    labeled('實際餘額（選填）', numField({ value: cal?.balance ?? '', min: 0, nullable: true, mutate: m((x, v) => { if (x.calibration) x.calibration.balance = v ?? 0; }) }), '該期繳款後，銀行帳面餘額'));
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('strong', { text: l.name || l.id }), h('span', { class: 'pill', text: annual ? '年繳利息' : '本息攤還' }),
      deleteButton(() => { if (confirm(`刪除「${l.name || l.id}」？`)) app.commit((d) => { d.loans.splice(i, 1); }); }, '刪除此借款')),
    h('div', { class: 'formgrid' }, fields), calBlock, annual ? null : eventsBlock(app, l, i));
}

export default function render(app) {
  const m = app.model;
  const st = app.state;
  const root = h('div', null, h('h1', { text: '借款' }),
    h('p', { class: 'sub', text: '編輯借款條件後，所有頁面即時重算。藍字黃底欄位可編輯。' }));

  root.appendChild(section('區塊一　借款條件', st.loans.map((l, i) => loanCard(app, l, i)),
    h('div', { class: 'row' }, button('＋ 新增借款', () => app.commit((d) => {
      let n = d.loans.length + 1;
      while (d.loans.some((x) => x.id === `loan-${n}`)) n++;
      const l = emptyLoan(`loan-${n}`);
      l.name = `新借款 ${n}`;
      const t = dn(app.asOf);
      l.startDate = iso(t);
      l.firstDueDate = iso(eomonth(t, 1));
      l.principal = 100000;
      l.annualRate = 0.05;
      d.loans.push(l);
    }), 'primary'))));

  const sts = m.statuses;
  const ok = (i) => !m.schedules[i].error;
  const errs = m.schedules.filter((s) => s.error);
  if (errs.length) root.appendChild(h('div', { class: 'banner error' }, errs.map((s) => `${s.name}：${s.error}`).join('；')));

  root.appendChild(section('區塊二　目前狀況', dataTable({
    cols: [
      { label: '借款', get: (s) => s.name },
      { label: '幣別', get: (s) => s.currency, center: true },
      { label: '已繳期數', get: (s) => s.paidPeriods, num: true },
      { label: '剩餘期數', get: (s) => s.remainingPeriods, fmt: (v) => (v === null ? '—' : v), num: true },
      { label: '目前本金餘額（原幣）', get: (s) => s.balance, fmt: (v, s) => money(v, s.currency, 2), num: true },
      { label: '餘額（NT$）', get: (s) => s.balanceTWD, fmt: (v) => twd(v), num: true },
      { label: '年利率', get: (s) => s.annualRate, fmt: (v) => pct(v), num: true },
      { label: '下次繳款日', get: (s) => s.nextDue ?? '已結清', center: true },
      { label: '下次繳款金額', get: (s) => s.nextPayment, fmt: (v, s) => money(v, s.currency, s.currency === 'USD' ? 2 : 0), num: true },
      { label: '還款進度', get: (s) => s.progress, fmt: (v) => pct(v, 1), num: true },
    ],
    rows: sts.filter((_, i) => ok(i)),
  })));

  const cost = sts.filter((_, i) => ok(i));
  const sum = (f) => cost.reduce((a, s) => a + f(s), 0);
  root.appendChild(section('區塊三　日／月／年利息成本', dataTable({
    cols: [
      { label: '借款', get: (s) => s.name },
      { label: '今日日息', get: (s) => s.dailyInterestTWD, fmt: (v) => twd(v, 2), num: true },
      { label: '當月預估利息', get: (s) => s.monthEstimateTWD, fmt: (v) => twd(v), num: true },
      { label: '本期已計未繳利息', get: (s) => s.accruedTWD, fmt: (v) => twd(v), num: true },
      { label: '未來 12 個月利息', get: (s) => s.next12InterestTWD, fmt: (v) => twd(v), num: true },
      { label: '未來 12 個月本金', get: (s) => s.next12PrincipalTWD, fmt: (v) => twd(v), num: true },
      { label: '至到期剩餘利息', get: (s) => s.remainingInterestTWD, fmt: (v) => twd(v), num: true },
    ],
    rows: cost,
    foot: [{ cells: ['合計', twd(sum((s) => s.dailyInterestTWD), 2), twd(sum((s) => s.monthEstimateTWD)), twd(sum((s) => s.accruedTWD)), twd(sum((s) => s.next12InterestTWD)), twd(sum((s) => s.next12PrincipalTWD)), twd(sum((s) => s.remainingInterestTWD))] }],
  }), h('p', { class: 'note', text: '日息＝本金餘額（NT$）× 年利率 ÷ 計息天數；未來 12 個月＝繳款日落在（基準日, 基準日＋12 個月］內的加總。年繳利息型的「至到期」以試算年數為準。' })));
  return root;
}
