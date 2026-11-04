// P14 還款進度：進度與里程碑、預計還清日、多還一點試算、收入目標、償債順序、上月回顧。
// 語氣原則：只呈現事實與使用者自己輸入的資料推算；沒有排行、連續天數或失敗警示；一律標明假設。
import { h } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { choiceField, labeled, button, deleteButton } from '../components/forms.js';
import { lineChart, legend } from '../components/chart.js';
import { WAGE } from '../../core/lifetime.js';
import { todayTaipei, iso, dn } from '../../core/dates.js';
import { effectiveIncome } from '../../core/scenario.js';
import { progressSummary, whatIfExtra, strategyCompare, incomeGoal, monthlyReview, smallWins, spanText, unlockTimeline, pastPath, bufferStatus, hoursOfWage, extraIncomePlan } from '../../core/payoff.js';

let loanSel = '';

function bar(value, label) {
  const p = Math.min(Math.max(value, 0), 1);
  const fill = h('span', { class: 'pfill' });
  fill.style.width = `${(p * 100).toFixed(1)}%`;
  return h('div', { class: 'pbar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100) }, fill);
}

/** 只存在偏好設定的數字輸入（不屬於匯出資料）。 */
function prefNum(app, key, label) {
  const el = h('input', { type: 'number', class: 'in', min: 0, step: 1000, value: app.prefs[key] || '', placeholder: '0', 'aria-label': label });
  el.addEventListener('change', () => {
    const v = el.value === '' ? 0 : Number(el.value);
    if (!Number.isFinite(v) || v < 0) { el.value = app.prefs[key] || ''; app.toast('請輸入 0 或以上的金額'); return; }
    app.setPref(key, Math.round(v));
  });
  return el;
}

const HOURLY = WAGE.current.hourly;
const hrs = (v) => `${hoursOfWage(v, HOURLY).toFixed(1)} 小時`;
function hoursText(monthly, lump) {
  return [monthly > 0 ? `每月約 ${hrs(monthly)}` : '', lump > 0 ? `一次約 ${hrs(lump)}` : ''].filter(Boolean).join('、') || '—';
}
let draft = { date: '', amount: '', pct: 50 };
const ym = (k) => (k ? `${k.slice(0, 4)} 年 ${+k.slice(5, 7)} 月` : '—');
const monthsText = (n) => (n === null ? '—' : n === 0 ? '時間相同' : `${Math.abs(n)} 個月`);

export default function render(app) {
  const m = app.model;
  const prog = progressSummary(m);
  const income = effectiveIncome(m, app.prefs.chartIncome);
  const root = h('div', null,
    h('h1', { text: '還款進度' }),
    h('p', { class: 'sub', text: '看見已經走了多遠、還剩多少，以及哪些做法最有幫助。所有數字都由你輸入的借款與支出推算；試算會標明假設。' }));

  // 1. 進度與里程碑
  if (!prog.loans.length) {
    root.appendChild(section('還款進度', h('p', { class: 'note', text: '目前沒有攤還型借款可以計算進度。到「P05 借款」新增後，這裡會顯示進度。' })));
  } else {
    const kids = [
      h('div', { class: 'grid' },
        kpi('已完成', pct(prog.progress, 1)),
        kpi('已還本金', twd(prog.paidTWD)),
        kpi('尚餘本金（攤還型）', twd(prog.remainingTWD)),
        kpi('預計全部還清', prog.payoffDn === null ? '—' : iso(prog.payoffDn))),
      bar(prog.progress, `攤還型借款整體進度 ${Math.round(prog.progress * 100)}%`),
      h('p', { class: 'note' },
        prog.reached > 0 ? `已越過 ${Math.round(prog.reached * 100)}% 的里程碑。` : '還在起步階段，每一期都會讓數字往前一點。',
        prog.next !== null ? ` 下一個里程碑 ${Math.round(prog.next * 100)}%：再還 ${twd(Math.max(prog.nextTargetTWD, 0))} 本金。` : ' 攤還型借款已全部完成。'),
      dataTable({
        label: '各筆借款進度',
        cols: [
          { label: '借款', get: (r) => r.name },
          { label: '進度', get: (r) => r.progress, fmt: (v, r) => h('div', { class: 'cell-bar' }, bar(v, `${r.name} 進度 ${Math.round(v * 100)}%`), h('span', { text: pct(v, 1) })) },
          { label: '尚餘本金', get: (r) => r.remainingTWD, fmt: (v) => twd(v), num: true },
          { label: '剩餘期數', get: (r) => r.remainingPeriods, num: true },
          { label: '預計還清', get: (r) => (r.settled ? '已還清' : r.payoffDate), center: true },
        ],
        rows: prog.loans,
      }),
    ];
    root.appendChild(section('還款進度與里程碑', ...kids));

    // 2. 預計還清日
    const days = prog.payoffDn - dn(todayTaipei());
    root.appendChild(section('預計還清日',
      h('p', null, h('strong', { text: iso(prog.payoffDn) }), days > 0 ? `（距今約 ${spanText(days)}）` : '（攤還型借款已全部還清）'),
      h('p', { class: 'note', text: `假設：照目前的還款表與利率，每期按時繳款。${prog.otherDebt ? `不含不攤還本金的借款（保單借款 ${twd(prog.interestOnly.reduce((a, x) => a + x.balanceTWD, 0))}）與股票質押已借 ${twd(prog.pledgeBorrowed)}，它們需要另外規劃。` : ''}` })));
  }

  // 小進展
  const wins = smallWins(m, income);
  if (wins.length) {
    root.appendChild(section('目前的小進展', h('ul', { class: 'plain wins' }, ...wins.map((w) => h('li', { text: `✓ ${w}` })))));
  }

  // 3. 多還一點
  const amort = m.schedules.filter((s) => !s.error && s.kind === 'amortizing' && s.rows.some((r) => r.dueDn > m.asOfDn));
  if (amort.length) {
    if (!amort.some((s) => s.loanId === loanSel)) {
      // 預設選利率最高的（多還效益最大）
      loanSel = amort.slice().sort((a, b) => b.annualRate - a.annualRate)[0].loanId;
    }
    const r = whatIfExtra(m, app.state, loanSel, { monthly: app.prefs.whatIfMonthly, lump: app.prefs.whatIfLump });
    const res = !r || (!app.prefs.whatIfMonthly && !app.prefs.whatIfLump)
      ? h('p', { class: 'note', text: '輸入「每月多還」或「下一期一次多還」的金額，就會看到差異。' })
      : h('div', null,
        h('div', { class: 'grid' },
          kpi('省下利息', twd(r.interestSaved), r.interestSaved > 0 ? 'good' : ''),
          kpi('提早還清', r.periodsSaved > 0 ? `${r.periodsSaved} 期（約 ${spanText(r.daysEarlier)}）` : '沒有變化'),
          kpi('預計還清日', `${r.baseEnd} → ${r.newEnd}`),
          kpi('額外多還總額', twd(r.extraPaid)),
          kpi('相當於基本工資', hoursText(app.prefs.whatIfMonthly, app.prefs.whatIfLump))),
        h('p', { class: 'note', text: `「${r.name}」剩餘利息 ${twd(r.baseInterest)} → ${twd(r.newInterest)}。` }));
    root.appendChild(section('多還一點會怎樣',
      h('div', { class: 'card no-print' }, h('div', { class: 'incomebar' },
        labeled('借款', choiceField({ label: '選擇借款', value: loanSel, options: amort.map((s) => [s.loanId, `${s.name}（${pct(s.annualRate, 2)}）`]), onChange: (v) => { loanSel = v; app.rerender(); } })),
        labeled('每月多還（NT$）', prefNum(app, 'whatIfMonthly', '每月多還金額')),
        labeled('下一期一次多還（NT$）', prefNum(app, 'whatIfLump', '下一期一次多還金額')))),
      res,
      h('p', { class: 'note', text: `假設：從下一個繳款日起，月付金不變、縮短年限；利率維持目前設定；不考慮提前還款違約金（部分銀行會收，請先確認）。「相當於基本工資」以現行時薪 ${twd(HOURLY)} 換算，只是讓金額變成具體的工作量。預設選利率最高的借款，因為多還的效益通常最大。這只是試算，不會改動你的資料；要真的記錄提前還款，請到「P05 借款」。`})));
  }

  // 4. 收入目標
  const goalExtra = app.prefs.goalExtraIncome;
  const goal = goalExtra > 0 && income > 0 ? incomeGoal(m, income, goalExtra) : null;
  root.appendChild(section('收入目標',
    h('div', { class: 'card no-print' }, h('div', { class: 'incomebar' },
      h('span', null, income > 0 ? `目前採用月收入 ${twd(income)}` : '尚未設定月收入'),
      labeled('想增加月收入（NT$）', prefNum(app, 'goalExtraIncome', '想增加的月收入')))),
    income <= 0
      ? h('p', { class: 'note' }, '請先在「P03 月薪情境」填入月薪，或到「P13 圖表分析」設定固定月收入。')
      : !goal ? h('p', { class: 'note', text: '輸入想增加的月收入，會顯示它對還清時間的影響。' })
        : h('div', null,
          h('div', { class: 'grid' },
            kpi('全部還清（現在）', ym(goal.now.allPaid)),
            kpi(`全部還清（+${twd(goalExtra)}）`, ym(goal.goal.allPaid)),
            kpi('提早', goal.newlyPayable ? '從「120 個月內無法還清」變為可還清' : monthsText(goal.monthsEarlier)),
            kpi('省下利息（120 個月內）', twd(goal.interestSaved), goal.interestSaved > 0 ? 'good' : '')),
          h('p', { class: 'note', text: `每月可用於提前還款的結餘：${twd(goal.now.firstExtra)} → ${twd(goal.goal.firstExtra)}。` })),
    goalExtra > 0 ? h('p', null, `每月多賺 ${twd(goalExtra)}，約等於每月多工作 ${hrs(goalExtra)}（以基本工資時薪 ${twd(HOURLY)} 計）。想找機會可看 `, h('a', { href: '#/income', text: 'P16 收入網站資源' }), '。') : null,
    h('p', { class: 'note', text: '假設：收入固定、支出照你的設定、結餘全數依雪崩法（利率高者優先）提前還款，最長推演 120 個月，利息不滾入本金。這是情境試算，不是對收入的預測或保證。'})));

  // 5. 償債順序
  if (income > 0 && m.salary.debts.length > 1) {
    const sc = strategyCompare(m, income);
    root.appendChild(section('償債順序：雪崩法與雪球法',
      dataTable({
        label: '雪崩法與雪球法比較',
        cols: [
          { label: '', get: (r) => r[0] },
          { label: '雪崩法（利率高者先）', get: (r) => r[1], num: true },
          { label: '雪球法（餘額小者先）', get: (r) => r[2], num: true },
        ],
        rows: [
          ['120 個月內利息', twd(sc.avalanche.interest), twd(sc.snowball.interest)],
          ['最早還清第一筆', ym(sc.avalanche.firstCleared), ym(sc.snowball.firstCleared)],
          ['全部還清', sc.avalanche.allPaid ? ym(sc.avalanche.allPaid) : '120 個月內未還清', sc.snowball.allPaid ? ym(sc.snowball.allPaid) : '120 個月內未還清'],
          ['優先順序', sc.avalanche.order.join(' → '), sc.snowball.order.join(' → ')],
        ],
      }),
      h('p', null, sc.interestDiff > 0.5 ? `雪球法在 120 個月內多付約 ${twd(sc.interestDiff)} 利息；` : '兩者利息差異很小；', '雪球法的好處是更早完成「還清一筆」，有些人因此更容易持續。選哪一種都合理，重點是持續還。'),
      h('p', { class: 'note', text: `假設：以月收入 ${twd(income)} 計，結餘全數用於提前還款；質押與保單借款視為不能部分還款以外的一般債務處理，與「P03 月薪情境」的規則一致。` })));
  }

  // 6. 上月回顧
  const rv = monthlyReview(m, income > 0 ? income : null);
  root.appendChild(section(`上月回顧（${rv.month}）`,
    h('div', { class: 'grid' },
      kpi('還掉的本金', twd(rv.principal)),
      kpi('付出的利息', twd(rv.interest)),
      kpi('生活支出（卡、房租、家裡）', twd(rv.living)),
      kpi(rv.balance === null ? '結餘' : '估算結餘', rv.balance === null ? '未設定月收入' : twd(rv.balance))),
    rv.prepay > 0 ? h('p', { class: 'note', text: `其中提前還款 ${twd(rv.prepay)}。` }) : null,
    h('p', { class: 'note', text: rv.balance === null ? '設定月收入後會估算結餘。' : '估算結餘＝月收入 − 生活支出 − 當月本金與利息；實際以你的帳戶為準。'})));
  moreSections(app, root, m);
  return root;
}

const todayStr = () => todayTaipei();

/** 已走過的路、解鎖的現金流、緩衝月數、額外收入分配。 */
function moreSections(app, root, m) {
  // 已走過的路
  const past = pastPath(m);
  if (past.months.length) {
    const labels = past.months.map((k, i) => (i === 0 ? k : k.slice(2)));
    root.appendChild(section('已走過的路',
      h('div', { class: 'grid' },
        kpi('累計已還本金（含提前還款）', twd(past.totalPrincipal), 'good'),
        kpi('累計已付利息', twd(past.totalInterest)),
        kpi('走過的期間', `${past.months[0]} ～ ${past.months[past.months.length - 1]}`)),
      past.months.length >= 2 ? legend([{ cls: 's3', name: '累計已還本金' }, { cls: 's5', name: '累計已付利息' }]) : null,
      past.months.length >= 2 ? lineChart({
        labels, monthKeys: past.months, title: '累計已還本金與已付利息',
        series: [{ name: '累計已還本金', values: past.cumPrincipal, cls: 's3' }, { name: '累計已付利息', values: past.cumInterest, cls: 's5' }],
        tipFmt: (v) => twd(v),
      }) : null,
      h('p', { class: 'note', text: '這是已經完成的部分：來自還款表中基準日以前的每一期（美元借款以目前匯率折算）。不含保單借款與股票質押的利息。' })));
  }

  // 解鎖的現金流
  const un = unlockTimeline(m);
  if (un.steps.length) {
    root.appendChild(section('還清之後，每月多出來的錢',
      dataTable({
        label: '解鎖的現金流',
        cols: [
          { label: '還清的借款', get: (r) => r.name },
          { label: '預計還清', get: (r) => r.date, center: true },
          { label: '之後每月多出', get: (r) => r.monthly, fmt: (v) => twd(v), num: true, cls: () => 'pos' },
          { label: '累計每月多出', get: (r) => r.cumulative, fmt: (v) => twd(v), num: true },
        ],
        rows: un.steps,
      }),
      h('p', null, `每還清一筆，原本繳給它的月付金就回到你手上；全部還清後，每月多出 `, h('strong', { text: twd(un.totalMonthly) }), '。'),
      h('p', { class: 'note', text: '假設：照目前還款表每期按時繳款，月付金不變；不含保單借款與股票質押的利息。多出來的錢可以用在生活、儲蓄，或提前還下一筆。' })));
  }

  // 緩衝月數
  const cash = app.prefs.bufferCash;
  const bf = bufferStatus(m, cash, app.prefs.bufferTargetMonths);
  const targetIn = h('input', { type: 'number', class: 'in', min: 1, max: 36, step: 1, value: app.prefs.bufferTargetMonths, 'aria-label': '預備金目標月數' });
  targetIn.addEventListener('change', () => {
    const v = Math.round(Number(targetIn.value));
    if (!Number.isFinite(v) || v < 1 || v > 36) { targetIn.value = app.prefs.bufferTargetMonths; app.toast('請輸入 1 到 36 個月'); return; }
    app.setPref('bufferTargetMonths', v);
  });
  root.appendChild(section('緩衝：可以撐幾個月',
    h('div', { class: 'card no-print' }, h('div', { class: 'incomebar' },
      labeled('目前可動用的現金／存款（NT$）', prefNum(app, 'bufferCash', '目前可動用的現金或存款')),
      labeled('預備金目標（月）', targetIn))),
    bf.months === null
      ? h('p', { class: 'note', text: '還沒有每月支出資料（到「P03 月薪情境」或「P02 每月支出」填寫）就無法換算月數。' })
      : h('div', null,
        h('div', { class: 'grid' },
          kpi('每月支出（生活固定＋必繳還款）', twd(bf.spend)),
          kpi('目前可以支撐', cash > 0 ? `${bf.months.toFixed(1)} 個月` : '尚未填寫'),
          kpi(`${bf.target} 個月的預備金`, twd(bf.targetAmount))),
        bar(bf.progress, `預備金進度 ${Math.round(bf.progress * 100)}%`),
        h('p', { class: 'note', text: cash <= 0 ? '填入目前手邊可動用的現金或存款，就會看到進度。' : bf.months >= bf.target ? `已達到 ${bf.target} 個月的目標。手邊有緩衝，遇到突發狀況比較不慌，也能更放心地提前還款。` : `目前完成 ${Math.round(bf.progress * 100)}%，再累積 ${twd(bf.targetAmount - cash)} 就達標。先有緩衝再加速還款，通常比把現金全部拿去還更安心。` })),
    h('p', { class: 'note', text: '假設：每月支出取自你在 P02、P03 填的資料；現金金額由你自己輸入，只存在這個瀏覽器、不屬於匯出資料。本站不記錄現金與存款。' })));

  // 額外收入分配
  const log = app.prefs.extraIncomeLog;
  const plan = extraIncomePlan(log);
  const amort = m.schedules.filter((s) => !s.error && s.kind === 'amortizing' && s.rows.some((r) => r.dueDn > m.asOfDn));
  const top = amort.slice().sort((a, b) => b.annualRate - a.annualRate)[0];
  const eff = top && plan.prepay > 0 ? whatIfExtra(m, app.state, top.loanId, { lump: plan.prepay }) : null;
  const dateIn = h('input', { type: 'date', class: 'in', value: draft.date || todayStr(), 'aria-label': '額外收入日期' });
  const amtIn = h('input', { type: 'number', class: 'in', min: 1, step: 100, value: draft.amount, placeholder: '例如 3000', 'aria-label': '額外收入金額' });
  const pctIn = choiceField({ label: '拿去提前還款的比例', value: String(draft.pct), options: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => [String(n), `${n}%`]), onChange: (v) => { draft.pct = Number(v); } });
  dateIn.addEventListener('change', () => { draft.date = dateIn.value; });
  amtIn.addEventListener('input', () => { draft.amount = amtIn.value; });
  const add = () => {
    const amount = Math.round(Number(amtIn.value));
    if (!Number.isFinite(amount) || amount <= 0) { app.toast('請輸入大於 0 的金額'); return; }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateIn.value)) { app.toast('請選擇日期'); return; }
    const entry = { id: `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, date: dateIn.value, amount, pct: draft.pct };
    draft = { date: '', amount: '', pct: draft.pct };
    app.setPref('extraIncomeLog', [...log, entry].sort((a, b) => b.date.localeCompare(a.date)));
    app.toast('已記下');
  };
  root.appendChild(section('額外收入怎麼用',
    h('p', { text: '記下一筆額外收入（獎金、兼職、退稅……），自己決定要拿幾成提前還款，其餘留給自己。這裡只做記錄與試算，不會自動扣款或轉帳。' }),
    h('div', { class: 'card no-print' }, h('div', { class: 'incomebar' },
      labeled('日期', dateIn), labeled('金額（NT$）', amtIn), labeled('提前還款比例', pctIn), button('記下這筆', add, 'primary'))),
    log.length ? dataTable({
      label: '額外收入紀錄',
      cols: [
        { label: '日期', get: (e) => e.date, center: true },
        { label: '金額', get: (e) => e.amount, fmt: (v) => twd(v), num: true },
        { label: '提前還款', get: (e) => `${e.pct}%（${twd((e.amount * e.pct) / 100)}）`, num: true },
        { label: '留給自己', get: (e) => e.amount - (e.amount * e.pct) / 100, fmt: (v) => twd(v), num: true },
        { label: '', get: (e) => e.id, fmt: (id) => deleteButton(() => { if (confirm('刪除這筆紀錄？')) app.setPref('extraIncomeLog', log.filter((x) => x.id !== id)); }) },
      ],
      rows: log,
      foot: [{ cells: ['合計', twd(plan.total), twd(plan.prepay), twd(plan.keep), ''] }],
    }) : h('p', { class: 'note', text: '還沒有紀錄。' }),
    eff ? h('div', null,
      h('div', { class: 'grid' },
        kpi(`若把 ${twd(plan.prepay)} 一次還給「${eff.name}」`, `省下利息 ${twd(eff.interestSaved)}`, eff.interestSaved > 0 ? 'good' : ''),
        kpi('提早還清', eff.periodsSaved > 0 ? `${eff.periodsSaved} 期（約 ${spanText(eff.daysEarlier)}）` : '沒有變化'),
        kpi('預計還清日', `${eff.baseEnd} → ${eff.newEnd}`)),
      h('p', { class: 'note', text: '試算對象是利率最高的攤還型借款，假設從下一個繳款日一次提前還款、縮短年限、不考慮違約金。要真的記錄提前還款，請到「P05 借款」。' })) : null,
    h('p', { class: 'note', text: '這些紀錄只存在這個瀏覽器（不屬於匯出資料）；清除瀏覽器資料就會消失。' })));
}
