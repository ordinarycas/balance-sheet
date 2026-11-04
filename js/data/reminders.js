// 繳費提醒的純函式（無 DOM、無網路）：挑出明天要繳的項目、組通知文字、產生 .ics 行事曆檔。
import { dn, iso } from '../core/dates.js';

const money = (n) => Math.abs(Math.round(n)).toLocaleString('en-US');

/** 某日到期的支出（費用為負數）。 */
export function dueOn(events, date) {
  return events.filter((e) => e.date === date && (e.amount < 0 || e.custom));
}

export function tomorrowOf(today) { return iso(dn(today) + 1); }

/** 通知標題與內文；項目多時只列前 5 筆。 */
export function describeDue(list) {
  const total = list.reduce((a, e) => a + Math.abs(e.amount), 0);
  const lines = list.slice(0, 5).map((e) => (e.amount ? `${e.item}　NT$${money(e.amount)}` : e.item));
  if (list.length > 5) lines.push(`…另有 ${list.length - 5} 筆`);
  const title = list.some((e) => e.custom && e.amount >= 0)
    ? `明天有 ${list.length} 項行程，應繳合計 NT$${money(list.filter((e) => e.amount < 0).reduce((x, e) => x + e.amount, 0))}`
    : `明天要繳 ${list.length} 筆，合計 NT$${money(total)}`;
  return { title, body: lines.join('\n') };
}

/** 給 Service Worker 背景檢查用的精簡快照：只含接下來 14 天的日期、項目與金額。 */
export function snapshot(events, today, days = 14) {
  const end = dn(today) + days;
  return events.filter((e) => (e.amount < 0 || e.custom) && e.dn >= dn(today) && e.dn <= end).map((e) => ({ date: e.date, item: e.item, amount: e.amount }));
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compactDate = (d) => d.replace(/-/g, '');

/** RFC 5545：每行最多 75 位元組，續行以空白開頭；以 UTF-8 位元組計算，不切斷字元。 */
export function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * 產生行事曆檔：每筆未來的支出一個「全天事件」，並在前一天 09:00 提醒（TRIGGER:-PT15H）。
 * @param {Array} events 繳費日曆事件
 * @param {{today:string, stamp:string}} o today=YYYY-MM-DD；stamp=UTC 時間戳（YYYYMMDDTHHMMSSZ）
 */
export function buildIcs(events, { today, stamp }) {
  const seen = new Map();
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//personal-balance-sheet//繳費提醒//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:繳費提醒'];
  for (const e of events) {
    if ((e.amount >= 0 && !e.custom) || e.dn < dn(today)) continue;
    const key = `${e.date}|${e.item}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const summary = e.amount < 0 ? `繳費：${e.item} NT$${money(e.amount)}` : e.custom ? `${e.item}${e.amount ? ` NT$${money(e.amount)}（收入）` : ''}` : e.item;
    const hash = [...key].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7).toString(16);
    L.push('BEGIN:VEVENT',
      `UID:${compactDate(e.date)}-${hash}-${n}@pfs.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(iso(e.dn + 1))}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(e.note || '')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`明天要繳：${summary}`)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return `${L.map(fold).join('\r\n')}\r\n`;
}
