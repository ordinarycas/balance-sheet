// Excel 匯出的版面層：把核心層的計算結果排成 18 張工作表的「描述物件」（純資料，可跨 Worker 傳遞）。
// 沿用原活頁簿的工作表名稱、順序、欄位標題與欄位順序；內容為計算後的靜態值，不含公式。
import { D } from '../core/decimal.js';
import { cardIds, cardLabel, cardMonthAmount, feeActive } from '../core/expenses.js';
import { monthKeyToDn, dn as toDn, iso } from '../core/dates.js';
import { KIND_LABELS, APP_VERSION, SCHEMA_VERSION } from '../core/constants.js';

export const SHEET_NAMES = ['總覽', '每月支出', '月薪情境', '繳費日曆', '借款總表', '月度彙總', '年度彙總', '月繳明細', '逐日明細',
  '股票質押', '持股與損益', '信用卡', '房租', '家裡支出', '繳費來源', '月薪試算', '設定', '說明'];

const date = (n) => (Number.isFinite(n) ? { d: n } : null);
const monthDate = (key) => ({ d: monthKeyToDn(key) });

class Sheet {
  constructor(name, widths = []) {
    this.name = name; this.widths = widths; this.cells = new Map(); this.merges = []; this.freeze = null;
    this.autoFilter = null; this.hiddenCols = []; this.heights = {};
  }
  set(r, c, v, s, n) {
    if (v === undefined) v = null;
    this.cells.set(r * 1000 + c, { r, c, v, s: s ? (Array.isArray(s) ? s : [s]) : [], n });
    return this;
  }
  row(r, c0, values, s, n) { values.forEach((v, i) => this.set(r, c0 + i, v, s, Array.isArray(n) ? n[i] : n)); return this; }
  merge(r1, c1, r2, c2) { this.merges.push([r1, c1, r2, c2]); return this; }
  section(r, text, c1, c2) { this.set(r, c1, text, 'section'); for (let c = c1 + 1; c <= c2; c++) this.set(r, c, null, 'section'); this.merge(r, c1, r, c2); return this; }
  title(text, sub) { this.set(1, 1, text, 'title'); this.heights[1] = 25.5; if (sub) this.set(2, 1, sub, 'note'); return this; }
  headers(r, c0, labels) { labels.forEach((t, i) => this.set(r, c0 + i, t, 'header')); this.heights[r] = 31.5; return this; }
  toJSON() {
    const byRow = new Map();
    for (const cell of this.cells.values()) {
      if (!byRow.has(cell.r)) byRow.set(cell.r, []);
      byRow.get(cell.r).push([cell.c, cell.v, cell.s.join(' '), cell.n || '']);
    }
    const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([r, cs]) => [r, cs.sort((a, b) => a[0] - b[0])]);
    return { name: this.name, widths: this.widths, rows, merges: this.merges, freeze: this.freeze, autoFilter: this.autoFilter, hiddenCols: this.hiddenCols, heights: this.heights };
  }
}

const moneyFmt = (cur, loan) => (cur === 'USD' ? 'usd2' : (loan ? 'twd0' : 'twd0'));
const dueLabel = (l) => {
  if (l.kind === 'interest_only_annual') { const m = /-(\d{2})-(\d{2})$/.exec(l.firstDueDate); return m ? `每年${+m[1]}/${+m[2]} 只繳利息` : '每年同月同日'; }
  if (l.dueRule === 'EOM') return '每月底';
  const d = /^DAY_(\d+)$/.exec(l.dueRule); return d ? `每月${d[1]}日` : l.dueRule;
};

export function buildSheets(m, st, opts = {}) {
  const { exportedAt = '', includeDaily = true, selected = null } = opts;
  const all = {};
  const loans = st.loans.map((l, i) => ({ l, s: m.schedules[i], t: m.statuses[i], i })).filter((x) => !x.s.error);
  const asOfDn = m.asOfDn;

  // ---------- 1 總覽 ----------
  {
    const S = new Sheet('總覽', [20, 18, 16, 16, 16, 14, 16, 11]);
    S.title('個人資產負債總覽');
    S.set(2, 1, '基準日', 'bold').set(2, 2, date(asOfDn), 'input', 'date').set(2, 3, '（可於『設定』修改；匯率：', 'note').set(2, 5, m.usdTwd, null, 'fx4').set(2, 6, '）', 'note');
    S.section(4, '一、負債總覽', 1, 8);
    S.headers(5, 1, ['項目', '本金餘額\n(NT$)', '年利率', '今日日息\n(NT$)', '當月預估利息\n(NT$)', '下次繳款日', '下次繳款金額\n(NT$)', '剩餘期數']);
    let r = 6;
    for (const { t } of loans) {
      S.row(r, 1, [t.name, t.balanceTWD, t.annualRate, t.dailyInterestTWD, t.monthEstimateTWD, t.nextDueDn === null ? '已結清' : date(t.nextDueDn), t.nextPaymentTWD, t.remainingPeriods === null ? '-' : t.remainingPeriods], 'body',
        [null, 'twd0', 'pct', 'twd2', 'twd0', 'date', 'twd0', 'int']);
      r++;
    }
    const p = m.pledge;
    S.row(r, 1, ['股票質押（已借）', p.borrowed, p.weightedRate, p.dailyInterest, p.monthEstimate, '依對帳單', 0, '-'], 'body', [null, 'twd0', 'pct', 'twd2', 'twd0', null, 'twd0', null]); r++;
    const t = m.overview.totals;
    S.row(r, 1, ['合計', t.balanceTWD, t.annualRate, t.dailyInterestTWD, t.monthEstimateTWD, '', loans.reduce((a, x) => a + x.t.nextPaymentTWD, 0), ''], 'total', [null, 'twd0', 'pct', 'twd2', 'twd0', null, 'twd0', null]); r++;
    S.set(r, 1, '※ 年利率合計列為本金加權平均；下次繳款金額合計不含質押。', 'note'); r += 2;
    S.section(r, '二、股票質押與持股', 1, 8); r++;
    const blk = [['質押股票現值', p.totalValue, 'twd0'], ['質押可借額度', p.totalLimit, 'twd0'], ['實際已借金額', p.borrowed, 'twd0'],
      ['超出可借額度', p.overLimit, 'twd0', p.overLimit > 0 ? 'over' : null], ['目前借款成數', p.ltvActual, 'pct'], ['持股現值（未質押）', m.holdings.totalValue, 'twd0']];
    for (const [label, v, n, extra] of blk) {
      S.set(r, 1, label, 'body'); S.set(r, 2, null, 'body'); S.merge(r, 1, r, 2); S.set(r, 3, v, extra ? ['body', extra] : 'body', n); r++;
    }
    r++;
    S.section(r, '三、現金流與損益（NT$）', 1, 8); r++;
    const f = m.overview.flow;
    S.set(r, 1, '項目', 'header').set(r, 2, '項目', 'header').merge(r, 1, r, 2);
    f.forEach((x, i) => S.set(r, 3 + i, x.label, 'header')); r++;
    const lines = [['信用卡', (x) => x.card], ['房租', (x) => x.rent], ['家裡支出', (x) => x.home], ['支出合計', (x) => x.living]];
    for (const [label, fn] of lines) { S.set(r, 1, label, 'body').set(r, 2, null, 'body').merge(r, 1, r, 2); f.forEach((x, i) => S.set(r, 3 + i, fn(x), 'body', 'twd0')); r++; }
    S.set(r, 1, '信貸每月固定月繳', 'body').set(r, 2, null, 'body').merge(r, 1, r, 2).set(r, 3, m.overview.fixedLoanMonthly, 'body', 'twd0'); r++;
    S.set(r, 1, '已實現損益累計', 'body').set(r, 2, null, 'body').merge(r, 1, r, 2).set(r, 3, m.pnl.total, 'body', 'pnl');
    all['總覽'] = S;
  }

  // ---------- 2 每月支出 ----------
  {
    const mt = m.monthly;
    const ids = mt.cardIds;
    const heads = ['月份', '月標籤', ...ids.map((id) => `${cardLabel(st.cards, id)}`), '房租\n(租金+電費)', '家裡支出\n(網路費+水電費)', '生活支出\n小計',
      ...m.schedules.map((s) => `${s.name}\n${s.kind === 'interest_only_annual' ? '年繳利息' : '月繳'}`), '借款還款\n小計', '當月總支出', '其中：借款\n利息'];
    const S = new Sheet('每月支出', [11, 8, ...heads.slice(2).map(() => 14)]);
    S.title('每月費用支出', '逐月彙總：生活支出（信用卡／房租／家裡支出）＋借款還款＝當月總支出（NT$）。');
    S.set(3, 1, '逐月明細（NT$）', 'bold');
    S.headers(4, 1, heads);
    S.freeze = { x: 2, y: 4 };
    const line = (x, label) => [monthDate(x.month), x.label, ...ids.map((id) => x.cards[id]), x.rent, x.home, x.living, ...x.loans.map((l) => l.payment), x.loanTotal, x.total, x.loanInterest];
    mt.rows.forEach((x, i) => {
      const cur = x.month === m.asOfMonth;
      S.row(5 + i, 1, line(x), cur ? ['body', 'cur'] : 'body', ['month', null, ...Array(heads.length - 2).fill('twd0')]);
    });
    const tot = (label, t) => [label, '', ...ids.map((id) => t.cards[id]), t.rent, t.home, t.living, ...t.loans, t.loanTotal, t.total, t.loanInterest];
    const nr = 5 + mt.rows.length;
    S.row(nr, 1, tot('12個月合計', mt.totals), 'total', [null, null, ...Array(heads.length - 2).fill('twd0')]);
    S.row(nr + 1, 1, tot('月平均', mt.avg), 'total', [null, null, ...Array(heads.length - 2).fill('twd0')]);
    S.set(nr + 3, 1, '※ 起始月份可在系統設定修改，其後逐月往下推；支出為負數；保單年繳利息僅於繳款月出現。', 'note');
    S.set(nr + 4, 1, '※ 尚未輸入的月份（信用卡、電費、水費）顯示為 0；房租固定租金與網路費固定金額為預估。', 'note');
    all['每月支出'] = S;
  }

  // ---------- 3 月薪情境 ----------
  const sal = m.salary;
  {
    const sc = sal.scenarios;
    const S = new Sheet('月薪情境', [34, 22, 16, 16, 16, 16, 52, ...Array(Math.max(sc.length - 5, 0)).fill(16)]);
    S.title('月薪情境與還款方式（雪崩法）', '以稅後月薪試算：每月結餘／缺口，並用結餘依『雪崩法』提前還款——先還利率最高的債務。');
    S.section(3, '輸入', 1, 7);
    S.set(4, 1, '其他生活開銷（每月，負數）', 'body').set(4, 2, st.salary.otherLiving, 'input', 'twd0').set(4, 3, '日常、餐飲、衣服、水電等變動支出；預設 0。', 'note');
    S.section(7, '一、各情境每月收支與結餘', 1, 7);
    S.set(8, 1, '稅後月薪', 'header'); sc.forEach((s, i) => S.set(8, 2 + i, s.salary, ['input', 'bold'], 'twd0'));
    let r = 9;
    for (const it of [...sal.budget.items, ...sal.budget.must]) {
      S.set(r, 1, it.label, 'body'); sc.forEach((_, i) => S.set(r, 2 + i, -it.amount, 'body', 'twd0')); r++;
    }
    S.set(r, 1, '每月支出合計', 'total'); sc.forEach((_, i) => S.set(r, 2 + i, -sal.budget.total, 'total', 'twd0')); r++;
    S.set(r, 1, '每月結餘', 'total'); sc.forEach((s, i) => S.set(r, 2 + i, s.balance, ['total', s.balance < 0 ? 'bad' : 'good'], 'twd0')); r++;
    S.set(r, 1, '支出占月薪比', 'body'); sc.forEach((s, i) => S.set(r, 2 + i, s.salary ? s.ratio : null, 'body', 'pct')); r += 2;
    S.section(r, '二、還款方式：雪崩法（Debt Avalanche）— 結餘依利率由高到低提前還款', 1, 7); r++;
    S.headers(r, 1, ['順位', '債務', '目前餘額(NT$)', '年利率', '提前還款方式']); S.merge(r, 5, r, 7); r++;
    const METHOD = { pledge: '隨時可還，先把結餘全部還質押', amortizing: '前一順位還清後，結餘加碼還本', interest_only: '利率最低，最後還本' };
    sal.debts.forEach((d, i) => {
      S.row(r, 1, [i + 1, d.name, d.balance, d.rate, METHOD[d.type]], 'body', [null, null, 'twd0', 'pct', null]);
      S.set(r, 6, null, 'body').set(r, 7, null, 'body'); S.merge(r, 5, r, 7); r++;
    });
    S.set(r, 1, '※ 順位依目前利率由高到低自動排序；必繳款為各攤還型借款月繳與質押／保單按月攤提利息。', 'note'); r += 2;
    S.section(r, '三、模擬結果（自基準日所在月起算，最長 120 個月）', 1, 7); r++;
    S.headers(r, 1, ['項目', ...sc.map((_, i) => `情境${'一二三四五六七八'[i]}`), '說明']); r++;
    const mo = (v) => v ?? '120個月內未還清';
    const lines = [
      ['首月可提前還款額', (s) => s.firstExtra, 'twd0', '結餘為正才有提前還款'],
      ['缺口月數', (s) => s.gapMonths, 'int', '結餘為負的月份數'],
      ['累計缺口', (s) => s.cumGap, 'twd0', '缺口不增加債務，需靠其他資金補足'],
      ...sal.debts.map((d, k) => [`${d.name}還清月份`, (s) => mo(s.payoff[k]), null, '日期＝預計還清當月']),
      ['全部債務還清月份', (s) => mo(s.allPaid), null, '120 個月內未還清則顯示文字'],
      ['模擬期間利息合計', (s) => s.interestTotal, 'twd0', '概算：月利率＝年利率÷12'],
      ['120個月後剩餘債務', (s) => s.remaining, 'twd0', ''],
      ['還款狀態', (s) => s.status, null, ''],
    ];
    for (const [label, fn, n, note] of lines) {
      S.set(r, 1, label, 'body'); sc.forEach((s, i) => S.set(r, 2 + i, fn(s), ['body', 'wrap'], n)); S.set(r, 2 + sc.length, note, 'note'); r++;
    }
    r++;
    S.set(r, 1, '※ 模擬為概算：利息以月利率（年利率÷12）計，與『逐日明細』實際天數計息略有差異；缺口月份不增加債務，另列累計缺口。', 'note');
    all['月薪情境'] = S;
  }

  // ---------- 4 繳費日曆 ----------
  const cal = m.calendar;
  {
    const S = new Sheet('繳費日曆', [12, 8, 28, 15, 14, 8, 58]);
    S.title('繳費日曆（每日應繳費用）', '依日期由近到遠列出：借款月繳、信用卡、房租、水電網路、質押利息。費用以負數表示；日期未填或金額為 0 的項目不列入。');
    S.set(3, 1, '基準日', 'bold').set(3, 2, null, 'bold').merge(3, 1, 3, 2).set(3, 3, date(asOfDn), 'input', 'date').set(3, 5, '當月', ['cur', 'center']).set(3, 7, '底色說明：淺藍＝基準日所在月份（當月）；黃色粗體＝今日；灰字＝已過。', 'note');
    S.set(4, 1, '未來7日應繳', 'bold').set(4, 2, null, 'bold').merge(4, 1, 4, 2).set(4, 3, cal.next7, 'body', 'twd0');
    S.set(5, 1, '本月剩餘應繳', 'bold').set(5, 2, null, 'bold').merge(5, 1, 5, 2).set(5, 3, cal.monthRest, 'body', 'twd0');
    S.headers(7, 1, ['日期', '星期', '項目', '費用(NT$)', '當日合計', '狀態', '備註']);
    S.freeze = { y: 7 };
    cal.events.forEach((e, i) => {
      const style = e.status === '今日' ? ['body', 'today'] : e.status === '已過' ? ['body', 'past', e.inAsOfMonth ? 'cur' : ''] : ['body', e.inAsOfMonth ? 'cur' : ''];
      S.row(8 + i, 1, [date(e.dn), e.weekday, e.item, e.amount, e.dayTotal, e.status, e.note], style.filter(Boolean), ['date', null, null, 'twd0', 'twd0', null, null]);
    });
    all['繳費日曆'] = S;
  }

  // ---------- 5 借款總表 ----------
  {
    const S = new Sheet('借款總表', [20, 24, 15, 16, 16, 14, 16, 16, 24, 12, 16, 16, 16, 16, 62]);
    S.title('借款總表', '一、借款條件（輸入）→ 二、目前狀況 → 三、利息成本（日／月／年）。逐期與逐日明細見『月繳明細』『逐日明細』。');
    S.freeze = { x: 1, y: 5 };
    S.section(4, '一、借款條件（輸入）', 1, 15);
    S.headers(5, 1, ['名稱', '類型', '幣別', '借款本金\n(原幣)', '年利率', '期數', '起息日', '首次繳款日', '繳款方式', '小數位', '月繳／年繳\n(原幣)', '最後繳款日', '餘額校正日\n(選填)', '實際餘額校正\n(選填)', '備註']);
    let r = 6;
    for (const { l, s } of loans) {
      const mf = moneyFmt(l.currency);
      S.row(r, 1, [l.name, KIND_LABELS[l.kind], l.currency, l.principal, l.annualRate, l.kind === 'interest_only_annual' ? (l.periods ?? '-') : l.periods, date(toDn(l.startDate)), date(toDn(l.firstDueDate)), dueLabel(l), l.decimals], 'input', [null, null, null, mf, 'pct', 'int', 'date', 'date', null, 'int']);
      S.set(r, 11, s.pmt, 'body', mf).set(r, 12, date(s.lastDueDn), 'body', 'date');
      S.set(r, 13, l.calibration ? date(toDn(l.calibration.date)) : null, 'input', 'date').set(r, 14, l.calibration ? l.calibration.balance : null, 'input', mf).set(r, 15, '', 'note');
      S.heights[r] = 24; r++;
    }
    S.set(r, 1, '※ 月繳＝本息平均攤還 PMT(年利率÷12, 期數, 本金)；每期利息＝期初本金×年利率×當期實際天數÷計息基準；末期結清餘額。保單借款：每年利息＝本金×年利率。『餘額校正日／實際餘額校正』：填入銀行帳面餘額，該期利息改為『月繳－實際還本』反推，之後各期依此續算。', 'note'); r += 2;
    S.section(r, '二、目前狀況（依『設定』基準日計算）', 1, 13); r++;
    S.headers(r, 1, ['名稱', '已繳期數', '剩餘期數', '目前本金餘額\n(原幣)', '目前本金餘額\n(NT$)', '今日日息\n(NT$)', '本期已計未繳\n利息(NT$)', '下次繳款日', '下次繳款金額\n(原幣)', '距下次繳款\n(天)', '累計已繳利息\n(原幣)', '累計已繳本金\n(原幣)', '還款進度']); r++;
    for (const { t } of loans) {
      const mf = moneyFmt(t.currency);
      S.row(r, 1, [t.name, t.paidPeriods, t.remainingPeriods ?? '-', t.balance, t.balanceTWD, t.dailyInterestTWD, t.accruedTWD, t.nextDueDn === null ? '已結清' : date(t.nextDueDn), t.nextPayment, t.daysToNext ?? '-', t.cumInterest, t.cumPrincipal, t.progress], 'body',
        [null, 'int', 'int', mf, 'twd0', 'twd2', 'twd2', 'date', mf, 'int', mf, mf, 'pct']); r++;
    }
    S.row(r, 1, ['合計', '', '', '', loans.reduce((a, x) => a + x.t.balanceTWD, 0), loans.reduce((a, x) => a + x.t.dailyInterestTWD, 0), loans.reduce((a, x) => a + x.t.accruedTWD, 0)], 'total', [null, null, null, null, 'twd0', 'twd2', 'twd2']);
    r++;
    S.set(r, 1, '※ 年繳利息型借款的剩餘期數以「-」表示（本金不攤還）。', 'note'); r += 2;
    S.section(r, '三、目前利息成本（日／月／年，皆折合 NT$）', 1, 7); r++;
    S.headers(r, 1, ['名稱', '今日日息\n(NT$)', '當月預估利息\n(NT$)', '未來12個月\n應繳利息(NT$)', '未來12個月\n應還本金(NT$)', '至到期剩餘\n利息(NT$)', '計息基準']); r++;
    for (const { t } of loans) {
      S.row(r, 1, [t.name, t.dailyInterestTWD, t.monthEstimateTWD, t.next12InterestTWD, t.next12PrincipalTWD, t.remainingInterestTWD, `實際天數÷${m.dayCountLoan}`], 'body', [null, 'twd2', 'twd0', 'twd0', 'twd0', 'twd0', null]); r++;
    }
    const p = m.pledge;
    S.row(r, 1, ['股票質押(已借)', p.dailyInterest, p.monthEstimate, p.yearEstimate, 0, 0, `實際天數÷${m.dayCountPledge}（未來12個月欄為年息估算）`], 'body', [null, 'twd2', 'twd0', 'twd0', 'twd0', 'twd0', null]); r++;
    const cost = (f) => loans.reduce((a, x) => a + f(x.t), 0);
    S.row(r, 1, ['合計', cost((t) => t.dailyInterestTWD) + p.dailyInterest, cost((t) => t.monthEstimateTWD) + p.monthEstimate, cost((t) => t.next12InterestTWD) + p.yearEstimate, cost((t) => t.next12PrincipalTWD), cost((t) => t.remainingInterestTWD), ''], 'total', [null, 'twd2', 'twd0', 'twd0', 'twd0', 'twd0', null]); r++;
    S.set(r, 1, '※ 質押年息以日息×365 估算；質押借款無固定還款表，故未來12個月本金與剩餘利息不適用。', 'note');
    all['借款總表'] = S;
  }

  // ---------- 6 月度彙總 / 7 年度彙總 ----------
  {
    const a = m.aggregate;
    const S = new Sheet('月度彙總', [11, 8, 11, ...m.schedules.flatMap(() => [14, 14]), 14, 14, 15, 16]);
    S.title('月度彙總（全部折合 NT$）', '依繳款日所屬年月彙總；月底本金餘額為各借款最後一個 ≤ 月底繳款日的期末本金。');
    S.headers(3, 1, ['月份', '年度', '月份鍵', ...m.schedules.flatMap((s) => [`${s.name}\n利息`, `${s.name}\n本金`]), '利息合計', '本金合計', '當月繳款合計', '月底本金餘額合計']);
    S.freeze = { x: 3, y: 3 };
    a.months.forEach((x, i) => {
      S.row(4 + i, 1, [monthDate(x.key), x.year, x.key, ...x.byLoan.flatMap((b) => [b.interest, b.principal]), x.interest, x.principal, x.payment, x.endBalance],
        x.key === m.asOfMonth ? ['body', 'today'] : 'body', ['month', 'int', null, ...Array(m.schedules.length * 2 + 4).fill('twd0')]);
    });
    all['月度彙總'] = S;

    const Y = new Sheet('年度彙總', [10, ...m.schedules.flatMap(() => [14, 14]), 14, 14, 15, 16]);
    Y.title('年度彙總（全部折合 NT$）', '月度彙總依年度加總；年底餘額取該年 12 月（或最後一個月）月底餘額。');
    Y.headers(3, 1, ['年度', ...m.schedules.flatMap((s) => [`${s.name}\n利息`, `${s.name}\n本金`]), '利息合計', '本金合計', '當年繳款合計', '年底本金餘額合計']);
    a.years.forEach((x, i) => Y.row(4 + i, 1, [x.year, ...x.byLoan.flatMap((b) => [b.interest, b.principal]), x.interest, x.principal, x.payment, x.endBalance], 'body', ['int', ...Array(m.schedules.length * 2 + 4).fill('twd0')]));
    const nr = 4 + a.years.length;
    const sum = (f) => a.years.reduce((acc, y) => acc + f(y), 0);
    Y.row(nr, 1, ['合計', ...m.schedules.flatMap((_, i) => [sum((y) => y.byLoan[i].interest), sum((y) => y.byLoan[i].principal)]), sum((y) => y.interest), sum((y) => y.principal), sum((y) => y.payment), ''], 'total', [null, ...Array(m.schedules.length * 2 + 4).fill('twd0')]);
    Y.set(nr + 2, 1, '※ 合計列的年底餘額不加總。', 'note');
    all['年度彙總'] = Y;
  }

  // ---------- 8 月繳明細 ----------
  {
    const S = new Sheet('月繳明細', [14, 6, 6, 12, 8, 14, 12, 12, 12, 14, 13, 13, 8, 10, 8, 10, 12, 12, 13, 14]);
    S.title('月繳明細（逐期）', '各借款逐期攤還表；右側為折合 NT$ 的欄位。');
    S.headers(3, 1, ['貸款', '幣別', '期別', '繳款日', '當期天數', '期初本金', '利息', '本金', '繳款合計', '期末本金', '累計利息', '累計本金', '狀態', '月份鍵', '年度', '匯率係數', '利息(NT$)', '本金(NT$)', '繳款合計(NT$)', '期末本金(NT$)']);
    S.freeze = { x: 4, y: 3 };
    let r = 4;
    for (const { s, t } of loans) {
      const mf = moneyFmt(s.currency);
      for (const row of s.rows) {
        const paid = row.k <= t.paidPeriods;
        const fx = s.fx;
        S.row(r, 1, [s.name, s.currency, row.k, date(row.dueDn), row.days, row.open, row.interest, row.principal, row.payment, row.close, row.cumInterest, row.cumPrincipal, paid ? '已繳' : '未繳', row.due.slice(0, 7), +row.due.slice(0, 4), fx,
          D(row.interest).mul(fx).toNumber(), D(row.principal).mul(fx).toNumber(), D(row.payment).mul(fx).toNumber(), D(row.close).mul(fx).toNumber()],
        paid ? ['body', 'past'] : 'body', [null, null, 'int', 'date', 'int', mf, mf, mf, mf, mf, mf, mf, null, null, 'int', 'fx4', 'twd0', 'twd0', 'twd0', 'twd0']);
        r++;
      }
    }
    S.autoFilter = { r1: 3, c1: 1, r2: Math.max(r - 1, 3), c2: 20 };
    all['月繳明細'] = S;
  }

  // ---------- 9 逐日明細 ----------
  if (includeDaily) {
    const S = new Sheet('逐日明細', [14, 12, 6, 14, 12, 14, 12, 12, 12, 14, 8, 6, 12, 14]);
    S.title('逐日明細', '自起息日次日至最後繳款日，每個日曆日一列；日利息＝當期利息÷當期天數。');
    S.headers(3, 1, ['貸款', '日期', '期別', '計息本金', '日利息', '當期累計利息', '繳款日利息', '繳款日本金', '當日繳款合計', '日終本金', '狀態', '幣別', '日利息(NT$)', '日終本金(NT$)']);
    S.freeze = { x: 2, y: 3 };
    let r = 4;
    loans.forEach(({ i }) => {
      for (const d of m.daily(i)) {
        const mf = moneyFmt(d.currency);
        S.row(r, 1, [d.loanName, date(d.dn), d.period, d.open, d.daily, d.cumPeriod, d.payInterest, d.payPrincipal, d.pay, d.endBalance, d.status, d.currency, d.dailyTWD, d.endBalanceTWD],
          d.status === '今日' ? ['body', 'today'] : d.status === '已過' ? ['body', 'past'] : 'body', [null, 'date', 'int', mf, 'num4', 'num4', mf, mf, mf, mf, null, null, 'num4', 'twd0']);
        r++;
      }
    });
    S.autoFilter = { r1: 3, c1: 1, r2: Math.max(r - 1, 3), c2: 14 };
    all['逐日明細'] = S;
  }

  // ---------- 10 股票質押 ----------
  const quoteNote = (opts.quoteInfo?.fetchedAt ? `行情取價時間：${opts.quoteInfo.fetchedAt}（證交所最近收盤價，非即時）；` : '') + '價格來源欄註明「行情服務」或「手動輸入」。';
  {
    const p = m.pledge;
    const S = new Sheet('股票質押', [14, 28, 10, 11, 12, 11, 15, 15, 10, 15, 9, 14]);
    S.title('股票質押', quoteNote);
    S.headers(4, 1, ['代號', '股票名稱', '股數', '股價(自動)', '股價(手動備援)', '採用股價', '價格來源', '現值', '借款成數', '可借額度', '年利率', '日息(若全額動用)']);
    let r = 5;
    for (const x of p.rows) {
      S.row(r, 1, [x.code, x.name, x.shares, x.auto, x.manual, x.price, x.source, x.value, x.ltv, x.limit, x.annualRate, x.dailyIfFull], 'body', [null, null, 'int', 'num2', 'num2', 'num2', null, 'twd0', 'pct0', 'twd0', 'pct', 'twd2']); r++;
    }
    S.row(r, 1, ['總額', '', '', '', '', '', '', p.totalValue, '', p.totalLimit, '', p.totalDailyIfFull], 'total', [null, null, null, null, null, null, null, 'twd0', null, 'twd0', null, 'twd2']); r += 2;
    S.section(r, '質押借款狀況', 1, 12); r++;
    const items = [
      ['實際已借金額', -p.borrowed, 'twd0', '輸入（負數）；內部取絕對值計算', 'input'],
      ['目前可借額度合計', p.totalLimit, 'twd0', 'Σ 各檔現值 × 借款成數'],
      ['超出可借額度', p.overLimit, 'twd0', '正數＝超借', p.overLimit > 0 ? 'over' : null],
      ['目前借款成數', p.ltvActual, 'pct', '已借金額 ÷ 質押現值'],
      ['加權年利率', p.weightedRate, 'pct', 'Σ(可借額度 × 年利率) ÷ Σ 可借額度'],
      ['日息', p.dailyInterest, 'twd2', `已借金額 × 加權年利率 ÷ ${m.dayCountPledge}`],
      ['當月預估利息', p.monthEstimate, 'twd2', '日息 × 當月天數'],
      ['年利息估算', p.yearEstimate, 'twd0', '日息 × 365'],
      ['利息繳款日(選填)', p.interestDay, 'int', '填入後才會列入繳費日曆', 'input'],
    ];
    for (const [label, v, n, note, extra] of items) {
      S.set(r, 1, label, 'body').set(r, 2, null, 'body').merge(r, 1, r, 2).set(r, 3, v, extra ? ['body', extra] : 'body', n).set(r, 4, note, 'note').merge(r, 4, r, 12); r++;
    }
    all['股票質押'] = S;
  }

  // ---------- 11 持股與損益 ----------
  {
    const h = m.holdings;
    const S = new Sheet('持股與損益', [14, 28, 10, 11, 12, 11, 15, 15]);
    S.title('持股與已實現損益', quoteNote);
    S.headers(4, 1, ['代號', '股票名稱', '股數', '股價(自動)', '股價(手動備援)', '採用股價', '價格來源', '現值']);
    let r = 5;
    for (const x of h.rows) { S.row(r, 1, [x.code, x.name, x.shares, x.auto, x.manual, x.price, x.source, x.value], 'body', [null, null, 'int', 'num2', 'num2', 'num2', null, 'twd0']); r++; }
    S.row(r, 1, ['總額', '', '', '', '', '', '', h.totalValue], 'total', [null, null, null, null, null, null, null, 'twd0']); r += 3;
    S.section(r - 1, '已實現損益', 1, 6);
    S.headers(r, 1, ['月份', '個人戶頭', '爸爸戶頭', '媽媽戶頭', '損益總額', '累計']); r++;
    for (const x of m.pnl.rows) { S.row(r, 1, [monthDate(x.month), x.personal, x.father, x.mother, x.total, x.cumulative], 'body', ['month', 'pnl', 'pnl', 'pnl', 'pnl', 'pnl']); r++; }
    S.row(r, 1, ['總額', m.pnl.personal, m.pnl.father, m.pnl.mother, m.pnl.total, ''], 'total', [null, 'pnl', 'pnl', 'pnl', 'pnl', null]); r++;
    S.set(r, 1, '※ 損益總額＝三個戶頭相加；損失為負數。', 'note');
    all['持股與損益'] = S;
  }

  // ---------- 12 信用卡 ----------
  {
    const ids = cardIds(st.cards);
    const prev = m.overview.flow[0].month; const cur = m.asOfMonth;
    const S = new Sheet('信用卡', [11, 16, 22, 13, 9, 26, 3, 20, 12, 13, 12, 12, 14, 12]);
    S.title('信用卡', '支出為負數。逐筆明細填入「帳期月份」；固定費用依起算月份與週期自動入帳。');
    S.section(3, '彙總', 1, 6);
    S.headers(4, 1, ['卡別', `${+prev.slice(5)}月帳期`, `${+cur.slice(5)}月帳期`, '結帳日', '繳費日']);
    let r = 5;
    for (const id of ids) {
      S.row(r, 1, [cardLabel(st.cards, id), cardMonthAmount(st.cards, id, prev), cardMonthAmount(st.cards, id, cur), st.cards.statementDay[id] ?? null, st.cards.payDay[id] ?? null], 'body', [null, 'twd0', 'twd0', 'dayN', 'dayN']); r++;
    }
    S.row(r, 1, ['合計', ids.reduce((a, id) => a + cardMonthAmount(st.cards, id, prev), 0), ids.reduce((a, id) => a + cardMonthAmount(st.cards, id, cur), 0), '', ''], 'total', [null, 'twd0', 'twd0']);
    S.section(3, '固定費用', 8, 14);
    S.headers(4, 8, ['項目', '卡別', '金額', '起算月份', '結束月份', '有效結束(計算)', '週期']);
    st.cards.fixedFees.forEach((f, i) => {
      S.row(5 + i, 8, [f.item, cardLabel(st.cards, f.card), f.amount, monthDate(f.start), f.end ? monthDate(f.end) : null, f.end ? monthDate(f.end) : '無限期', f.cycle === 'yearly' ? '每年' : '每月'], 'input', [null, null, 'twd0', 'month', 'month', 'month', null]);
    });
    const dr = Math.max(9, r + 2);
    S.section(dr, '逐筆明細', 1, 6);
    S.headers(dr + 1, 1, ['帳期月份', '卡別', '費用細項', '金額', '結帳日', '備註']);
    st.cards.entries.forEach((e, i) => {
      S.row(dr + 2 + i, 1, [monthDate(e.month), cardLabel(st.cards, e.card), e.item, e.amount, st.cards.statementDay[e.card] ?? null, ''], 'input', ['month', null, null, 'twd0', 'dayN', null]);
    });
    const fr = Math.max(9, 5 + st.cards.fixedFees.length + 1);
    S.section(fr, '每月卡費合計', 8, 14);
    S.headers(fr + 1, 8, ['月份', '月標籤', ...ids.map((id) => cardLabel(st.cards, id)), '合計']);
    m.monthly.rows.forEach((x, i) => S.row(fr + 2 + i, 8, [monthDate(x.month), x.label, ...ids.map((id) => x.cards[id]), x.cardTotal], 'body', ['month', null, ...Array(ids.length + 1).fill('twd0')]));
    S.set(fr + 15, 8, `（固定費用本月入帳：${st.cards.fixedFees.filter((f) => feeActive(f, cur)).map((f) => f.item).join('、') || '無'}）`, 'note');
    all['信用卡'] = S;
  }

  // ---------- 13 房租 ----------
  {
    const S = new Sheet('房租', [12, 14, 16, 16, 40]);
    S.title('房租', '每月固定租金與匯款日；電費隨月填入，與房租同日匯款。支出為負數。');
    S.section(3, '固定項目', 1, 5);
    S.set(4, 1, '每月房租', 'body').set(4, 2, st.rent.monthlyRent, 'input', 'twd0');
    S.set(5, 1, '每月匯款日', 'body').set(5, 2, st.rent.dueDay, 'input', 'dayN');
    S.section(7, '逐月電費與匯款合計', 1, 5);
    S.headers(8, 1, ['月份', '房租', '電費(變動)', '匯款合計', '備註']);
    m.months.forEach((mo, i) => {
      const e = st.rent.electricity[mo] ?? 0;
      S.row(9 + i, 1, [monthDate(mo), st.rent.monthlyRent, e, st.rent.monthlyRent + e, ''], mo === m.asOfMonth ? ['body', 'cur'] : 'body', ['month', 'twd0', 'twd0', 'twd0', null]);
    });
    const nr = 9 + m.months.length;
    S.row(nr, 1, ['合計', m.months.length * st.rent.monthlyRent, m.months.reduce((a, mo) => a + (st.rent.electricity[mo] ?? 0), 0), m.monthly.totals.rent, ''], 'total', [null, 'twd0', 'twd0', 'twd0']);
    S.set(nr + 1, 1, '※ 電費依實際帳單填入；未填月份顯示為 0。', 'note');
    all['房租'] = S;
  }

  // ---------- 14 家裡支出 ----------
  {
    const S = new Sheet('家裡支出', [12, 16, 16, 16, 14, 24, 14, 14]);
    S.title('家裡支出（網路費＋水電費）', '網路費為每月固定；水費、電費逐月填入並可指定扣款日。支出為負數。');
    S.set(4, 1, '每月網路費', 'body').set(4, 2, st.home.internetFee, 'input', 'twd0');
    S.set(5, 1, '網路費扣款日', 'body').set(5, 2, st.home.internetDay, 'input', 'dayN');
    S.section(6, '逐月水電費', 1, 8);
    S.headers(7, 1, ['月份', '網路費(固定)', '水費(變動)', '電費(變動)', '合計', '備註', '水費扣款日', '電費扣款日']);
    m.months.forEach((mo, i) => {
      const w = st.home.water[mo]; const e = st.home.electricity[mo];
      S.row(8 + i, 1, [monthDate(mo), st.home.internetFee, w?.amount ?? 0, e?.amount ?? 0, st.home.internetFee + (w?.amount ?? 0) + (e?.amount ?? 0), '', w?.date ? date(toDn(w.date)) : null, e?.date ? date(toDn(e.date)) : null],
        mo === m.asOfMonth ? ['body', 'cur'] : 'body', ['month', 'twd0', 'twd0', 'twd0', 'twd0', null, 'date', 'date']);
    });
    const nr = 8 + m.months.length;
    S.row(nr, 1, ['合計', m.months.length * st.home.internetFee, m.months.reduce((a, mo) => a + (st.home.water[mo]?.amount ?? 0), 0), m.months.reduce((a, mo) => a + (st.home.electricity[mo]?.amount ?? 0), 0), m.monthly.totals.home, '', '', ''], 'total', [null, 'twd0', 'twd0', 'twd0', 'twd0']);
    S.set(nr + 1, 1, '※ 填入扣款日與金額後才會列入繳費日曆。', 'note');
    all['家裡支出'] = S;
  }

  // ---------- 15 繳費來源 ----------
  {
    const S = new Sheet('繳費來源', [12, 28, 15, 58, 16, 12]);
    S.title('繳費來源（日曆事件來源明細）', '依來源順序列出（借款、信用卡、房租、家裡支出、質押利息）；繳費日曆由此彙整排序。');
    S.headers(3, 1, ['日期', '項目', '費用(NT$)', '備註', '排序鍵', '類別']);
    S.freeze = { y: 3 };
    [...cal.events].sort((a, b) => a.seq - b.seq).forEach((e, i) => {
      S.row(4 + i, 1, [date(e.dn), e.item, e.amount, e.note, e.dn + (e.seq + 1) / 100000, e.cat], 'body', ['date', null, 'twd0', null, 'num5', null]);
    });
    all['繳費來源'] = S;
  }

  // ---------- 16 月薪試算 ----------
  {
    const d = sal.debts;
    const heads = ['月薪', '月序', '月份', ...d.flatMap((x) => [`${x.name}\n期初`, `${x.name}\n利息`, `${x.name}\n必繳本金`]), '必繳現金合計', '固定生活支出', '結餘', '可提前還款', '缺口',
      ...d.map((x) => `提前→${x.name}`), ...d.map((x) => `${x.name}\n期末`), '總期末餘額', '累計缺口'];
    const S = new Sheet('月薪試算', heads.map((_, i) => (i === 0 ? 11 : i < 3 ? 8 : 14)));
    S.title('月薪試算（逐月模擬）', '每個月薪情境 120 個月的逐月模擬：利息以年利率÷12 概算，結餘依雪崩法提前還款。');
    S.headers(3, 1, heads);
    S.freeze = { x: 3, y: 3 };
    let r = 4;
    for (const sc of sal.scenarios) {
      for (const x of sc.rows) {
        S.row(r, 1, [sc.salary, x.t, monthDate(x.month), ...d.flatMap((_, k) => [x.open[k], x.interest[k], x.req[k]]), x.must, x.fixed, x.surplus, x.avail, x.gap, ...x.prepay, ...x.close, x.closeTotal, x.cumGap],
          'body', ['twd0', 'int', 'month', ...Array(heads.length - 3).fill('num2')]);
        r++;
      }
    }
    S.autoFilter = { r1: 3, c1: 1, r2: Math.max(r - 1, 3), c2: heads.length };
    all['月薪試算'] = S;
  }

  // ---------- 17 設定 ----------
  {
    const S = new Sheet('設定', [28, 2, 16, 80]);
    S.title('設定');
    S.section(3, '全域參數', 1, 4);
    const rows = [
      ['查詢基準日', date(asOfDn), 'date', '空白＝使用今天；此檔為匯出當下的基準日'],
      ['信貸／保單計息天數基準', m.dayCountLoan, 'int', '利息＝本金×年利率×實際天數÷基準'],
      ['股票質押計息天數基準', m.dayCountPledge, 'int', '日息＝已借金額×加權年利率÷基準'],
      ['USD/TWD 匯率(自動)', opts.fxAuto ?? null, 'fx4', opts.fxAuto ? `來源：${opts.fxSource || ''}` : '未取得自動匯率'],
      ['USD/TWD 匯率(手動備援)', st.settings.usdTwdManual, 'fx4', '自動匯率取不到時使用'],
      ['採用匯率', m.usdTwd, 'fx4', ''],
    ];
    rows.forEach(([label, v, n, note], i) => { S.set(4 + i, 1, label, 'body').set(4 + i, 3, v, i === 5 ? 'body' : 'input', n).set(4 + i, 4, note, 'note'); });
    all['設定'] = S;
  }

  // ---------- 18 說明 ----------
  {
    const S = new Sheet('說明', [130]);
    S.title('說明');
    const lines = [
      ['section', '一、這份檔案是什麼'],
      ['body', `由「個人資產負債表」靜態網站匯出（應用程式 ${APP_VERSION}，資料結構 v${SCHEMA_VERSION}）。內容為匯出當下計算好的靜態數值，不含公式，也不能匯入回網站；備份請使用 JSON。`],
      ['body', `匯出時間：${exportedAt}；基準日：${iso(asOfDn)}。`],
      ['section', '二、計算假設'],
      ['body', `信貸／保單利息以實際天數 ÷ ${m.dayCountLoan} 計；股票質押以 ÷ ${m.dayCountPledge} 計。攤還型：月付金＝PMT 四捨五入；末期結清；可用餘額校正對齊銀行餘額。`],
      ['body', '保單借款（年繳利息）：本金不攤還，每年於首次繳款日的同月同日繳息；美元以設定匯率折算 NT$。'],
      ['body', '月薪模擬：月利率＝年利率÷12 概算；雪崩法依年利率由高到低；缺口不增加債務，另計累計；最長 120 個月。'],
      ['body', '股價為證交所最近一個交易日收盤價（非即時）；取不到時使用手動股價，並於「價格來源」欄標示。'],
      ['section', '三、符號與顏色'],
      ['body', '支出一律為負數。藍字黃底＝輸入欄位；淺藍底＝基準日所在月份；黃底粗體＝今日；灰字＝已過／已繳。'],
      ['section', '四、隱私'],
      ['body', '此檔含完整個人財務資料且未加密，請妥善保管，勿上傳到公開處。'],
    ];
    lines.forEach(([s, t], i) => { S.set(3 + i, 1, t, s === 'section' ? 'section' : ['body', 'wrap']); });
    all['說明'] = S;
  }

  const order = SHEET_NAMES.filter((n) => all[n] && (!selected || selected.includes(n)));
  return order.map((n) => all[n].toJSON());
}

