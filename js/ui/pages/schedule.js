// P06 還款表：逐日（虛擬捲動）／逐期／月度／年度
import { h } from '../dom.js';
import { twd, money, num } from '../fmt.js';
import { dataTable } from '../components/table.js';
import { virtualTable } from '../components/vtable.js';
import { barChart, legend } from '../components/chart.js';
import { tabs } from '../components/table.js';
import { button, choiceField, labeled } from '../components/forms.js';
import { downloadCsv } from '../csv.js';

let tab = 'daily';
let loanIdx = 'all';
const flt = { from: '', to: '', q: '', status: 'all' };
let qTimer = 0;

function dailyAll(m) {
  if (loanIdx !== 'all') return m.daily(Number(loanIdx));
  return m.schedules.flatMap((s, i) => (s.error ? [] : m.daily(i)));
}

export default function render(app) {
  const m = app.model;
  const root = h('div', null, h('h1', { text: '還款表' }),
    h('p', { class: 'sub', text: '逐日、逐期、月度與年度明細；皆可匯出 CSV（UTF-8 含 BOM）。' }));
  root.appendChild(tabs([['daily', '逐日'], ['period', '逐期'], ['month', '月度'], ['year', '年度']], tab, (k) => { tab = k; app.rerender(); }));

  const loanOptions = (all) => [...(all ? [['all', '全部借款']] : []), ...m.schedules.map((s, i) => [i, s.name])];
  const picker = (all) => labeled('借款', choiceField({ value: loanIdx === 'all' && !all ? 0 : loanIdx, options: loanOptions(all), onChange: (v) => { loanIdx = v === 'all' ? 'all' : Number(v); app.rerender(); } }));
  if (!all(m)) { root.appendChild(h('p', { class: 'muted', text: '尚無借款資料。請先到「P05 借款」新增。' })); return root; }
  const sel = loanIdx === 'all' ? 0 : Math.min(Number(loanIdx), m.schedules.length - 1);

  if (tab === 'daily') {
    const every = dailyAll(m);
    const q = flt.q.trim().toLowerCase();
    const rows = every.filter((r) => (!flt.from || r.date >= flt.from) && (!flt.to || r.date <= flt.to)
      && (flt.status === 'all' || r.status === flt.status)
      && (!q || `${r.loanName} ${r.date} 第${r.period}期`.toLowerCase().includes(q)));
    const todayIdx = rows.findIndex((r) => r.status === '今日');
    const cols = [
      { label: '借款', width: '110px' }, { label: '日期', width: '100px' }, { label: '期別', width: '50px', num: true },
      { label: '計息本金', width: '110px', num: true }, { label: '日利息', width: '90px', num: true }, { label: '當期累計', width: '100px', num: true },
      { label: '繳款日利息', width: '100px', num: true }, { label: '繳款日本金', width: '100px', num: true }, { label: '當日繳款', width: '100px', num: true },
      { label: '日終本金', width: '110px', num: true }, { label: '狀態', width: '60px' }, { label: '幣別', width: '50px' },
    ];
    const vt = virtualTable({
      cols, count: rows.length, label: '逐日還款明細',
      getRow: (i) => {
        const r = rows[i];
        return { cls: r.status === '今日' ? 'today' : r.status === '已過' ? 'past' : '', cells: [r.loanName, r.date, String(r.period), num(r.open, 2), num(r.daily, 4), num(r.cumPeriod, 2), num(r.payInterest, 2), num(r.payPrincipal, 2), num(r.pay, 2), num(r.endBalance, 2), r.status, r.currency] };
      },
    });
    root.appendChild(dailyFilters(app, every.length, rows.length));
    root.appendChild(h('div', { class: 'row no-print' }, picker(true),
      button('跳至今日', () => { if (todayIdx >= 0) vt.scrollToRow(todayIdx); else app.toast('基準日不在此借款的計息期間內'); }),
      button('匯出 CSV', () => downloadCsv('daily-schedule.csv', ['借款', '日期', '期別', '計息本金', '日利息', '當期累計利息', '繳款日利息', '繳款日本金', '當日繳款合計', '日終本金', '狀態', '幣別'],
        rows.map((r) => [r.loanName, r.date, r.period, r.open, r.daily, r.cumPeriod, r.payInterest, r.payPrincipal, r.pay, r.endBalance, r.status, r.currency]))),
      h('span', { class: 'muted', text: `${rows.length === every.length ? '共' : '符合'} ${rows.length.toLocaleString('en-US')} 列${rows.length === every.length ? '' : `／${every.length.toLocaleString('en-US')}`}（虛擬捲動，只渲染可視範圍）` })));
    root.appendChild(vt);
    if (todayIdx >= 0) setTimeout(() => vt.scrollToRow(todayIdx), 0);
  } else if (tab === 'period') {
    const s = m.schedules[sel];
    const paid = m.statuses[sel].paidPeriods;
    const rows = s.rows;
    root.appendChild(h('div', { class: 'row no-print' }, picker(false),
      button('匯出 CSV', () => downloadCsv('installments.csv', ['期別', '繳款日', '天數', '期初本金', '利息', '本金', '繳款合計', '期末本金', '累計利息', '累計本金', '狀態'],
        rows.map((r, i) => [r.k, r.due, r.days, r.open, r.interest, r.principal, r.payment, r.close, r.cumInterest, r.cumPrincipal, i < paid ? '已繳' : '未繳'])))));
    const f = (v) => money(v, s.currency, s.currency === 'USD' ? 2 : 0);
    root.appendChild(dataTable({
      cols: [
        { label: '期別', get: (r) => r.k, center: true }, { label: '繳款日', get: (r) => r.due, center: true }, { label: '天數', get: (r) => r.days, num: true },
        { label: '期初本金', get: (r) => r.open, fmt: f, num: true }, { label: '利息', get: (r) => r.interest, fmt: f, num: true },
        { label: '本金', get: (r) => r.principal, fmt: f, num: true }, { label: '繳款合計', get: (r) => r.payment, fmt: f, num: true },
        { label: '期末本金', get: (r) => r.close, fmt: f, num: true }, { label: '累計利息', get: (r) => r.cumInterest, fmt: f, num: true },
        { label: '累計本金', get: (r) => r.cumPrincipal, fmt: f, num: true },
        { label: '狀態', get: (r) => (r.k <= paid ? '已繳' : '未繳'), center: true },
      ],
      rows, rowClass: (r) => (r.k <= paid ? 'past' : ''),
    }));
    if (s.calibration) root.appendChild(h('p', { class: 'note', text: `已於 ${s.calibration.date} 以實際餘額 ${twd(s.calibration.balance)} 校正；該期利息由月繳反推。` }));
  } else if (tab === 'month') {
    const a = m.aggregate.months;
    const cols = [{ label: '月份', get: (r) => r.key, center: true }, { label: '年度', get: (r) => r.year, center: true },
      ...m.schedules.flatMap((s, i) => [
        { label: `${s.name}利息`, get: (r) => r.byLoan[i].interest, fmt: (v) => twd(v), num: true },
        { label: `${s.name}本金`, get: (r) => r.byLoan[i].principal, fmt: (v) => twd(v), num: true }]),
      { label: '利息合計', get: (r) => r.interest, fmt: (v) => twd(v), num: true }, { label: '本金合計', get: (r) => r.principal, fmt: (v) => twd(v), num: true },
      { label: '當月繳款合計', get: (r) => r.payment, fmt: (v) => twd(v), num: true }, { label: '月底本金餘額', get: (r) => r.endBalance, fmt: (v) => twd(v), num: true }];
    root.appendChild(h('div', { class: 'row no-print' }, button('匯出 CSV', () => downloadCsv('monthly-summary.csv', cols.map((c) => c.label), a.map((r) => cols.map((c) => c.get(r)))))));
    root.appendChild(dataTable({ cols, rows: a, rowClass: (r) => (r.key === m.asOfMonth ? 'cur' : '') }));
    root.appendChild(h('p', { class: 'note', text: '全部折合 NT$。淺藍底為基準日所在月份。' }));
  } else {
    const y = m.aggregate.years;
    const cols = [{ label: '年度', get: (r) => r.year, center: true },
      ...m.schedules.flatMap((s, i) => [
        { label: `${s.name}利息`, get: (r) => r.byLoan[i].interest, fmt: (v) => twd(v), num: true },
        { label: `${s.name}本金`, get: (r) => r.byLoan[i].principal, fmt: (v) => twd(v), num: true }]),
      { label: '利息合計', get: (r) => r.interest, fmt: (v) => twd(v), num: true }, { label: '本金合計', get: (r) => r.principal, fmt: (v) => twd(v), num: true },
      { label: '當年繳款合計', get: (r) => r.payment, fmt: (v) => twd(v), num: true }, { label: '年底本金餘額', get: (r) => r.endBalance, fmt: (v) => twd(v), num: true }];
    const tot = (f) => y.reduce((acc, r) => acc + f(r), 0);
    root.appendChild(h('div', { class: 'row no-print' }, button('匯出 CSV', () => downloadCsv('annual-summary.csv', cols.map((c) => c.label), y.map((r) => cols.map((c) => c.get(r)))))));
    root.appendChild(dataTable({ cols, rows: y, foot: [{ cells: ['合計', ...m.schedules.flatMap((_, i) => [twd(tot((r) => r.byLoan[i].interest)), twd(tot((r) => r.byLoan[i].principal))]), twd(tot((r) => r.interest)), twd(tot((r) => r.principal)), twd(tot((r) => r.payment)), ''] }] }));
    root.appendChild(h('div', { class: 'card' }, legend([{ cls: 's2', name: '利息' }, { cls: 's1', name: '本金' }]),
      barChart({ labels: y.map((r) => String(r.year)), stacked: true, series: [{ name: '本金', values: y.map((r) => r.principal), cls: 's1' }, { name: '利息', values: y.map((r) => r.interest), cls: 's2' }], tipFmt: (v) => twd(v) })));
  }
  return root;
}

function dailyFilters(app, total, shown) {
  const date = (key, label) => {
    const el = h('input', { type: 'date', class: 'in', value: flt[key], 'aria-label': label });
    el.addEventListener('change', () => { flt[key] = el.value; app.rerender(); });
    return labeled(label, el);
  };
  const search = h('input', { type: 'search', class: 'in', value: flt.q, placeholder: '借款名稱、日期、期別', 'aria-label': '搜尋' });
  search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { flt.q = search.value; app.rerender(); }, 250); });
  search.addEventListener('change', () => { clearTimeout(qTimer); flt.q = search.value; app.rerender(); });
  const status = choiceField({ value: flt.status, options: [['all', '全部'], ['已過', '已過'], ['今日', '今日'], ['未來', '未來']], onChange: (v) => { flt.status = v; app.rerender(); } });
  const active = flt.from || flt.to || flt.q || flt.status !== 'all';
  return h('div', { class: 'row no-print', role: 'search', 'aria-label': '篩選逐日明細' },
    date('from', '起日'), date('to', '迄日'), labeled('搜尋', search), labeled('狀態', status),
    active ? button('清除篩選', () => { Object.assign(flt, { from: '', to: '', q: '', status: 'all' }); app.rerender(); }) : null,
    active && shown === 0 && total > 0 ? h('span', { class: 'pill warn', text: '沒有符合的列' }) : null);
}

function all(m) { return m.schedules.some((s) => !s.error); }
