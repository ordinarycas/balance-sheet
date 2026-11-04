// P14 還款進度：進度與里程碑、預計還清日、多還一點試算、收入目標、償債順序、上月回顧。
// 語氣原則：只呈現事實與使用者自己輸入的資料推算；沒有排行、連續天數或失敗警示；一律標明假設。
import { h } from '../dom.js';
import { twd, pct } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { choiceField, labeled } from '../components/forms.js';
import { todayTaipei, iso, dn } from '../../core/dates.js';
import { effectiveIncome } from '../../core/scenario.js';
import { progressSummary, whatIfExtra, strategyCompare, incomeGoal, monthlyReview, smallWins, spanText } from '../../core/payoff.js';

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
          kpi('額外多還總額', twd(r.extraPaid))),
        h('p', { class: 'note', text: `「${r.name}」剩餘利息 ${twd(r.baseInterest)} → ${twd(r.newInterest)}。` }));
    root.appendChild(section('多還一點會怎樣',
      h('div', { class: 'card no-print' }, h('div', { class: 'incomebar' },
        labeled('借款', choiceField({ label: '選擇借款', value: loanSel, options: amort.map((s) => [s.loanId, `${s.name}（${pct(s.annualRate, 2)}）`]), onChange: (v) => { loanSel = v; app.rerender(); } })),
        labeled('每月多還（NT$）', prefNum(app, 'whatIfMonthly', '每月多還金額')),
        labeled('下一期一次多還（NT$）', prefNum(app, 'whatIfLump', '下一期一次多還金額')))),
      res,
      h('p', { class: 'note', text: '假設：從下一個繳款日起，月付金不變、縮短年限；利率維持目前設定；不考慮提前還款違約金（部分銀行會收，請先確認）。預設選利率最高的借款，因為多還的效益通常最大。這只是試算，不會改動你的資料；要真的記錄提前還款，請到「P05 借款」。'})));
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
  return root;
}
