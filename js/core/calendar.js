// 繳費日曆（規格 §6.12）：把借款、卡費、房租、水電網路、質押利息彙成單一事件清單。
import { D, sum } from './decimal.js';
import { dn, iso, monthKeyToDn, dayInMonthOf, daysInMonthOf, weekdayISO, WEEKDAY_ZH, monthKey, eomonth } from './dates.js';
import { cardIds, cardLabel, cardMonthAmount, rentMonthAmount } from './expenses.js';

function fmtN(x) {
  return Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * @param {object} state
 * @param {Array} schedules
 * @param {object} pledgeCalc computePledge() 結果
 * @param {string[]} months 視窗月份
 * @param {number} asOfDn
 */
export function buildCalendar(state, schedules, pledgeCalc, months, asOfDn) {
  const events = [];
  let seq = 0;
  const push = (dateDn, item, amount, note, cat, extra) => {
    if (Number.isNaN(dateDn)) return;
    const amt = D(amount).toNumber();
    if (amt === 0 && !extra) return; // 自訂活動允許沒有金額
    events.push({ dn: dateDn, date: iso(dateDn), item, amount: amt, note, cat, seq: seq++, ...extra });
  };
  const ids = cardIds(state.cards);

  for (const m of months) {
    const m1 = monthKeyToDn(m);
    // 1. 借款
    for (const s of schedules) {
      for (const r of s.rows) {
        if (monthKey(r.dueDn) !== m) continue;
        const annual = s.kind === 'interest_only_annual';
        push(
          r.dueDn,
          annual ? `${s.name} 年繳利息` : `${s.name} 信貸月繳`,
          D(r.payment).mul(s.fx).neg(),
          `第${r.k}期｜利息 ${fmtN(r.interest)}／本金 ${fmtN(r.principal)}`,
          '借款',
        );
      }
    }
    // 2. 各卡帳單
    for (const id of ids) {
      const day = state.cards?.payDay?.[id];
      if (!Number.isInteger(day)) continue;
      push(
        dayInMonthOf(m1, 0, day),
        `${cardLabel(state.cards, id)} 帳單`,
        cardMonthAmount(state.cards, id, m),
        `${+m.slice(5, 7)}月帳期支出｜每月${day}日繳費`,
        '信用卡',
      );
    }
    // 3. 房租、房租電費
    const rentDay = state.rent?.dueDay;
    if (Number.isInteger(rentDay)) {
      const d = dayInMonthOf(m1, 0, rentDay);
      push(d, '房租', state.rent.monthlyRent ?? 0, '每月匯款（固定）', '房租');
      push(d, '房租電費（變動）', state.rent.electricity?.[m] ?? 0, '與房租同日匯款，依實際電費', '房租');
    }
    // 4. 網路費：未填扣款日時，預設每月底
    {
      const netDay = state.home?.internetDay;
      const d = Number.isInteger(netDay) ? dayInMonthOf(m1, 0, netDay) : eomonth(m1, 0);
      push(d, '網路費（家裡）', state.home?.internetFee ?? 0, Number.isInteger(netDay) ? '每月固定' : '每月固定（未填扣款日，預設月底）', '家裡支出');
    }
    // 5. 水費、電費
    const w = state.home?.water?.[m];
    if (w) push(dn(w.date), '水費（家裡）', w.amount, '變動，依實際帳單', '家裡支出');
    const e = state.home?.electricity?.[m];
    if (e) push(dn(e.date), '電費（家裡）', e.amount, '變動，依實際帳單', '家裡支出');
    // 6. 質押利息
    const pDay = state.pledge?.interestDay;
    if (Number.isInteger(pDay) && pledgeCalc) {
      push(
        dayInMonthOf(m1, 0, pDay),
        `${state.pledge?.accountName || '股票質押'}利息（預估）`,
        D(pledgeCalc.dailyInterest).mul(daysInMonthOf(m1)).neg(),
        '已借金額×年利率÷360；實際以對帳單為準',
        '股票質押',
      );
    }
  }

  // 7. 使用者自訂的單筆活動（不受 12 個月視窗以外的月份影響）
  const inWindow = new Set(months);
  for (const ev of state.events || []) {
    const d = dn(ev.date);
    if (!inWindow.has(monthKey(d))) continue;
    push(d, ev.item, ev.amount, ev.note || '自訂活動', '自訂', { custom: true, eventId: ev.id });
  }

  events.sort((a, b) => a.dn - b.dn || a.seq - b.seq);
  const asOfMonth = monthKey(asOfDn);
  let prev = null;
  for (const ev of events) {
    ev.weekday = WEEKDAY_ZH[weekdayISO(ev.dn)];
    ev.status = ev.dn < asOfDn ? '已過' : ev.dn === asOfDn ? '今日' : '未來';
    ev.inAsOfMonth = monthKey(ev.dn) === asOfMonth;
    ev.firstOfDay = ev.dn !== prev;
    prev = ev.dn;
  }
  // 當日合計（同日第一列顯示）
  const dayTotals = new Map();
  for (const ev of events) dayTotals.set(ev.dn, D(dayTotals.get(ev.dn) ?? 0).plus(ev.amount).toNumber());
  for (const ev of events) ev.dayTotal = ev.firstOfDay ? dayTotals.get(ev.dn) : null;

  const monthEnd = eomonth(asOfDn, 0);
  const next7 = sum(events.filter((e) => e.dn >= asOfDn && e.dn <= asOfDn + 7).map((e) => e.amount)).toNumber();
  const monthRest = sum(events.filter((e) => e.dn >= asOfDn && e.dn <= monthEnd).map((e) => e.amount)).toNumber();
  return { events, next7, monthRest, rentMonthAmount };
}
