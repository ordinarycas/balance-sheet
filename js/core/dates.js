// 日期工具（規格 §2.2）：日期以 YYYY-MM-DD 字串儲存；運算以「日序號」（自 1970-01-01 起的整數天數）進行，
// 不含時分秒，因此與時區、夏令時間無關。月底繳款：EOMONTH；固定日若該月無此日，取該月最後一日。

const MS_DAY = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 為 1..12
}

function ymdToDn(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

/** 嚴格驗證 YYYY-MM-DD 且為真實存在的日曆日。 */
export function isValidISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** 嚴格驗證 YYYY-MM。 */
export function isValidMonthKey(s) {
  if (typeof s !== 'string') return false;
  const m = MONTH_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2];
  return y >= MIN_YEAR && y <= MAX_YEAR && mo >= 1 && mo <= 12;
}

/** ISO 日期字串 → 日序號。無效時回傳 NaN。 */
export function dn(isoDate) {
  if (!isValidISODate(isoDate)) return NaN;
  const m = ISO_RE.exec(isoDate);
  return ymdToDn(+m[1], +m[2], +m[3]);
}

/** 日序號 → ISO 日期字串。 */
export function iso(n) {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

export function ymd(n) {
  const d = new Date(n * MS_DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** EDATE：加減月份；若該月無此日則取該月最後一日。 */
export function addMonths(n, k) {
  const { y, m, d } = ymd(n);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return ymdToDn(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** EOMONTH：k 個月後的月底。 */
export function eomonth(n, k = 0) {
  const { y, m } = ymd(n);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return ymdToDn(ny, nm, daysInMonth(ny, nm));
}

/** 該月第 day 日（超過當月天數則取月底）。 */
export function dayInMonthOf(n, k, day) {
  const { y, m } = ymd(n);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return ymdToDn(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function firstOfMonth(n) {
  const { y, m } = ymd(n);
  return ymdToDn(y, m, 1);
}

export function daysInMonthOf(n) {
  const { y, m } = ymd(n);
  return daysInMonth(y, m);
}

/** 星期：ISO 1=週一 … 7=週日。 */
export function weekdayISO(n) {
  const w = new Date(n * MS_DAY).getUTCDay(); // 0=週日
  return w === 0 ? 7 : w;
}

export const WEEKDAY_ZH = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** 日序號 → 'YYYY-MM'。 */
export function monthKey(n) {
  return iso(n).slice(0, 7);
}

export function monthKeyYear(key) {
  return +key.slice(0, 4);
}

export function monthKeyMonth(key) {
  return +key.slice(5, 7);
}

/** 'YYYY-MM' ± k 個月。 */
export function monthKeyAdd(key, k) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

/** 'YYYY-MM' 的第一天日序號。 */
export function monthKeyToDn(key) {
  return ymdToDn(+key.slice(0, 4), +key.slice(5, 7), 1);
}

/** 兩個 'YYYY-MM' 相差的月數（b − a）。 */
export function monthKeyDiff(a, b) {
  return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
}

/** Asia/Taipei 的「今天」（YYYY-MM-DD）。 */
export function todayTaipei(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA 即 YYYY-MM-DD
}

/** Asia/Taipei 的時間戳，ISO 8601 含 +08:00（台灣無夏令時間）。 */
export function nowTaipeiISO(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}:${p.second}+08:00`;
}

/** 檔名用時間戳 YYYYMMDD-HHmm（Asia/Taipei）。 */
export function stampTaipei(now = new Date()) {
  const t = nowTaipeiISO(now); // 2026-11-04T23:56:00+08:00
  return `${t.slice(0, 4)}${t.slice(5, 7)}${t.slice(8, 10)}-${t.slice(11, 13)}${t.slice(14, 16)}`;
}
