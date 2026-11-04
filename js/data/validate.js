// 匯入驗證與規範化（規格 §7.10.2，V1–V15）。輸入視為不受信任：
// 回傳「重新建構」的乾淨物件（未知欄位一律丟棄並警告），因此不會把攻擊者控制的鍵帶進應用程式狀態。
import { SCHEMA_VERSION, APP_ID, MAX_IMPORT_BYTES, MAX_STRING_LENGTH } from '../core/constants.js';
import { isValidISODate, isValidMonthKey, dn } from '../core/dates.js';
import { parseDueRule, dueDatesOf } from '../core/loan.js';
import { migrate } from './migrate.js';
import { SECTIONS, REQUIRED_SECTIONS, defaultSection, defaultSettings } from './schema.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KINDS = ['amortizing', 'interest_only_annual'];
const CURRENCIES = ['TWD', 'USD'];

class Ctx {
  constructor() { this.errors = []; this.warnings = []; }
  err(path, msg, code) { this.errors.push({ path, msg, code }); }
  warn(path, msg, code) { this.warnings.push({ path, msg, code }); }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** V14：遞迴掃描禁用鍵。 */
function findForbidden(v, path = '$', out = [], depth = 0) {
  if (depth > 40) return out;
  if (Array.isArray(v)) v.forEach((x, i) => findForbidden(x, `${path}[${i}]`, out, depth + 1));
  else if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.has(k)) out.push(`${path}.${k}`);
      findForbidden(v[k], `${path}.${k}`, out, depth + 1);
    }
  }
  return out;
}

function unknownKeys(c, obj, allowed, path) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) c.warn(`${path}.${k}`, '未知欄位，已忽略（匯出再匯入後不保留）', 'V13');
  }
}

// ---- 型別讀取器：失敗時記錄錯誤並回傳 undefined ----
function rStr(c, v, path, { required = false, max = MAX_STRING_LENGTH, def = '' } = {}) {
  if (v === undefined || v === null) {
    if (required) c.err(path, '必填欄位', 'V6');
    return def;
  }
  if (typeof v !== 'string') { c.err(path, '必須是字串', 'V7'); return def; }
  if (v.length > max) { c.err(path, `字串長度超過 ${max} 字元`, 'V15'); return def; }
  return v;
}
function rNum(c, v, path, { required = false, def = 0, min = -Infinity, max = Infinity, int = false, minEx = false, maxEx = false } = {}) {
  if (v === undefined || v === null) {
    if (required) c.err(path, '必填欄位', 'V6');
    return def;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) { c.err(path, '必須是有限數值（不接受字串、NaN、Infinity）', 'V7'); return def; }
  if (int && !Number.isInteger(v)) { c.err(path, '必須是整數', 'V7'); return def; }
  if (v < min || (minEx && v === min) || v > max || (maxEx && v === max)) {
    c.err(path, `數值超出允許範圍（${minEx ? '>' : '≥'} ${min}${max !== Infinity ? `，${maxEx ? '<' : '≤'} ${max}` : ''}）`, 'V7');
    return def;
  }
  return v;
}
function rDate(c, v, path, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) c.err(path, '必填欄位', 'V6');
    return null;
  }
  if (!isValidISODate(v)) { c.err(path, '日期必須是真實存在的 YYYY-MM-DD', 'V8'); return null; }
  return v;
}
function rMonth(c, v, path, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) c.err(path, '必填欄位', 'V6');
    return null;
  }
  if (!isValidMonthKey(v)) { c.err(path, '月份必須是 YYYY-MM', 'V8'); return null; }
  return v;
}
function rDay(c, v, path) {
  if (v === undefined || v === null) return null;
  return rNum(c, v, path, { int: true, min: 1, max: 31, def: null });
}
function rArr(c, v, path, { required = false } = {}) {
  if (v === undefined || v === null) { if (required) c.err(path, '必填欄位', 'V6'); return []; }
  if (!Array.isArray(v)) { c.err(path, '必須是陣列', 'V6'); return []; }
  return v;
}
function rObj(c, v, path, { required = false } = {}) {
  if (v === undefined || v === null) { if (required) c.err(path, '必填區塊', 'V6'); return {}; }
  if (!isV(v)) { c.err(path, '必須是物件', 'V6'); return {}; }
  return v;
}
const isV = isObj;

function amountField(c, v, path, { expense = true } = {}) {
  const n = rNum(c, v, path, { required: true });
  if (expense && n > 0) c.warn(path, '支出金額應為負數（或 0）', 'V11');
  return n;
}

// ---- 各區塊 ----
function vSettings(c, raw) {
  const o = rObj(c, raw, 'settings', { required: true });
  unknownKeys(c, o, ['asOfDate', 'dayCountLoan', 'dayCountPledge', 'usdTwdManual', 'monthStart', 'payDay'], 'settings');
  const d = defaultSettings();
  return {
    asOfDate: rDate(c, o.asOfDate, 'settings.asOfDate'),
    dayCountLoan: rNum(c, o.dayCountLoan, 'settings.dayCountLoan', { def: d.dayCountLoan, int: true, min: 1, max: 366 }),
    dayCountPledge: rNum(c, o.dayCountPledge, 'settings.dayCountPledge', { def: d.dayCountPledge, int: true, min: 1, max: 366 }),
    usdTwdManual: rNum(c, o.usdTwdManual, 'settings.usdTwdManual', { def: d.usdTwdManual, min: 0, minEx: true }),
    monthStart: rMonth(c, o.monthStart, 'settings.monthStart'),
    payDay: rDay(c, o.payDay, 'settings.payDay'),
  };
}

function vLoans(c, raw) {
  const arr = rArr(c, raw, 'loans', { required: true });
  const seen = new Set();
  return arr.map((l, i) => {
    const p = `loans[${i}]`;
    if (!isV(l)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, l, ['id', 'name', 'kind', 'currency', 'principal', 'annualRate', 'periods', 'startDate', 'firstDueDate', 'dueRule', 'decimals', 'calibration', 'rateChanges', 'prepayments'], p);
    const id = rStr(c, l.id, `${p}.id`, { required: true, max: 40 });
    if (id) {
      if (seen.has(id)) c.err(`${p}.id`, `id「${id}」重複`, 'V10');
      seen.add(id);
    }
    const kind = l.kind;
    if (!KINDS.includes(kind)) c.err(`${p}.kind`, `必須是 ${KINDS.join('、')}`, 'V7');
    const currency = l.currency ?? 'TWD';
    if (!CURRENCIES.includes(currency)) c.err(`${p}.currency`, `必須是 ${CURRENCIES.join('、')}`, 'V7');
    const annual = kind === 'interest_only_annual';
    const out = {
      id,
      name: rStr(c, l.name, `${p}.name`, { required: true }),
      kind,
      currency,
      principal: rNum(c, l.principal, `${p}.principal`, { required: true, min: 0 }),
      annualRate: rNum(c, l.annualRate, `${p}.annualRate`, { required: true, min: 0, max: 1, maxEx: true }),
      startDate: rDate(c, l.startDate, `${p}.startDate`, { required: true }),
      firstDueDate: rDate(c, l.firstDueDate, `${p}.firstDueDate`, { required: true }),
      decimals: rNum(c, l.decimals, `${p}.decimals`, { def: currency === 'USD' ? 2 : 0, int: true, min: 0, max: 6 }),
    };
    if (annual) {
      out.dueRule = 'YEARLY';
      out.periods = l.periods === undefined || l.periods === null ? null
        : rNum(c, l.periods, `${p}.periods`, { int: true, min: 1, max: 100, def: null });
    } else {
      out.periods = rNum(c, l.periods, `${p}.periods`, { required: true, int: true, min: 1, max: 600 });
      const rule = rStr(c, l.dueRule, `${p}.dueRule`, { required: true, max: 10 });
      if (rule && !parseDueRule(rule)) c.err(`${p}.dueRule`, '必須是 EOM、DAY_n（1–31）或 YEARLY', 'V7');
      out.dueRule = rule;
    }
    if (out.startDate && out.firstDueDate && dn(out.firstDueDate) <= dn(out.startDate)) {
      c.err(`${p}.firstDueDate`, '首次繳款日必須晚於起息日', 'V8');
    }
    // 校正
    let cal = null;
    if (l.calibration !== undefined && l.calibration !== null) {
      if (annual) c.warn(`${p}.calibration`, '年繳利息型不使用餘額校正，已忽略', 'V13');
      else if (!isV(l.calibration)) c.err(`${p}.calibration`, '必須是物件或 null', 'V6');
      else {
        unknownKeys(c, l.calibration, ['date', 'balance'], `${p}.calibration`);
        const date = rDate(c, l.calibration.date, `${p}.calibration.date`, { required: true });
        const balance = rNum(c, l.calibration.balance, `${p}.calibration.balance`, { required: true, min: 0 });
        if (date) cal = { date, balance };
      }
    }
    out.calibration = cal;
    // V9：校正日必須落在某一期繳款日
    if (cal && out.firstDueDate && out.periods && parseDueRule(out.dueRule)) {
      const dues = dueDatesOf(out);
      if (!dues.includes(dn(cal.date))) c.err(`${p}.calibration.date`, '校正日必須是該貸款某一期的繳款日', 'V9');
      else if (cal.balance > out.principal) c.err(`${p}.calibration.balance`, '校正餘額不可大於借款本金', 'V7');
    }
    out.rateChanges = vRateChanges(c, l.rateChanges, p, out, annual);
    out.prepayments = vPrepayments(c, l.prepayments, p, out, annual);
    return out;
  }).filter(Boolean);
}

/** 利率變動（v2）：新利率自該日（含）起適用；須晚於起息日、日期不可重複。 */
function vRateChanges(c, raw, p, loan, annual) {
  if (raw === undefined || raw === null) return [];
  if (annual) { c.warn(`${p}.rateChanges`, '年繳利息型不使用利率變動，已忽略', 'V13'); return []; }
  if (!Array.isArray(raw)) { c.err(`${p}.rateChanges`, '必須是陣列', 'V6'); return []; }
  if (raw.length > 60) { c.err(`${p}.rateChanges`, '最多 60 筆', 'V7'); return []; }
  const seen = new Set();
  const out = [];
  raw.forEach((x, j) => {
    const q = `${p}.rateChanges[${j}]`;
    if (!isV(x)) { c.err(q, '必須是物件', 'V6'); return; }
    unknownKeys(c, x, ['date', 'annualRate'], q);
    const date = rDate(c, x.date, `${q}.date`, { required: true });
    const annualRate = rNum(c, x.annualRate, `${q}.annualRate`, { required: true, min: 0, max: 1, maxEx: true });
    if (!date) return;
    if (seen.has(date)) c.err(`${q}.date`, '日期重複', 'V10');
    seen.add(date);
    if (loan.startDate && dn(date) <= dn(loan.startDate)) c.err(`${q}.date`, '必須晚於起息日', 'V8');
    out.push({ date, annualRate });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 提前還款（v2）：必須發生在某一期繳款日；mode＝shorten（縮短年限，月付金不變）或 reduce（縮小月付金，期數不變）。 */
function vPrepayments(c, raw, p, loan, annual) {
  if (raw === undefined || raw === null) return [];
  if (annual) { c.warn(`${p}.prepayments`, '年繳利息型不使用提前還款，已忽略', 'V13'); return []; }
  if (!Array.isArray(raw)) { c.err(`${p}.prepayments`, '必須是陣列', 'V6'); return []; }
  if (raw.length > 100) { c.err(`${p}.prepayments`, '最多 100 筆', 'V7'); return []; }
  const canCheck = loan.firstDueDate && loan.periods && parseDueRule(loan.dueRule);
  const dues = canCheck ? dueDatesOf(loan) : [];
  const out = [];
  raw.forEach((x, j) => {
    const q = `${p}.prepayments[${j}]`;
    if (!isV(x)) { c.err(q, '必須是物件', 'V6'); return; }
    unknownKeys(c, x, ['date', 'amount', 'mode'], q);
    const date = rDate(c, x.date, `${q}.date`, { required: true });
    const amount = rNum(c, x.amount, `${q}.amount`, { required: true, min: 0, minEx: true });
    const mode = x.mode === undefined || x.mode === null ? 'shorten' : x.mode;
    if (mode !== 'shorten' && mode !== 'reduce') c.err(`${q}.mode`, '必須是 shorten（縮短年限）或 reduce（縮小月付金）', 'V7');
    if (!date) return;
    if (canCheck && !dues.includes(dn(date))) c.err(`${q}.date`, '提前還款日必須是該貸款某一期的繳款日', 'V9');
    if (amount !== null && amount !== undefined && amount > loan.principal) c.err(`${q}.amount`, '不可大於借款本金', 'V7');
    out.push({ date, amount, mode });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function vStocks(c, raw, base, withLtv) {
  const arr = rArr(c, raw, base);
  const seen = new Set();
  return arr.map((s, i) => {
    const p = `${base}[${i}]`;
    if (!isV(s)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, s, withLtv ? ['code', 'name', 'shares', 'manualPrice', 'ltv', 'annualRate'] : ['code', 'name', 'shares', 'manualPrice'], p);
    const code = rStr(c, s.code, `${p}.code`, { required: true, max: 30 });
    if (code) {
      if (seen.has(code)) c.err(`${p}.code`, `代號「${code}」重複`, 'V10');
      seen.add(code);
    }
    const o = {
      code,
      name: rStr(c, s.name, `${p}.name`),
      shares: rNum(c, s.shares, `${p}.shares`, { required: true, int: true, min: 0 }),
      manualPrice: rNum(c, s.manualPrice, `${p}.manualPrice`, { def: 0, min: 0 }),
    };
    if (withLtv) {
      o.ltv = rNum(c, s.ltv, `${p}.ltv`, { def: 0.6, min: 0, max: 1 });
      o.annualRate = rNum(c, s.annualRate, `${p}.annualRate`, { def: 0.0645, min: 0, max: 1, maxEx: true });
    }
    return o;
  }).filter(Boolean);
}

function vPledge(c, raw) {
  const o = rObj(c, raw, 'pledge');
  unknownKeys(c, o, ['borrowed', 'interestDay', 'accountName', 'stocks'], 'pledge');
  return {
    borrowed: rNum(c, o.borrowed, 'pledge.borrowed', { def: 0 }),
    interestDay: rDay(c, o.interestDay, 'pledge.interestDay'),
    accountName: rStr(c, o.accountName, 'pledge.accountName', { max: 40 }),
    stocks: vStocks(c, o.stocks, 'pledge.stocks', true),
  };
}

function vPnl(c, raw) {
  const arr = rArr(c, raw, 'realizedPnl');
  const seen = new Set();
  return arr.map((r, i) => {
    const p = `realizedPnl[${i}]`;
    if (!isV(r)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, r, ['month', 'personal', 'father', 'mother'], p);
    const month = rMonth(c, r.month, `${p}.month`, { required: true });
    if (month) { if (seen.has(month)) c.err(`${p}.month`, `月份 ${month} 重複`, 'V10'); seen.add(month); }
    return {
      month,
      personal: rNum(c, r.personal, `${p}.personal`, { def: 0 }),
      father: rNum(c, r.father, `${p}.father`, { def: 0 }),
      mother: rNum(c, r.mother, `${p}.mother`, { def: 0 }),
    };
  }).filter((x) => x && x.month);
}

function dayMap(c, raw, path) {
  const o = rObj(c, raw, path);
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const d = rDay(c, v, `${path}.${k}`);
    if (d !== null) out[k] = d;
  }
  return out;
}

function vCards(c, raw) {
  const o = rObj(c, raw, 'cards');
  unknownKeys(c, o, ['payDay', 'statementDay', 'names', 'entries', 'fixedFees'], 'cards');
  const names = {};
  for (const [k, v] of Object.entries(rObj(c, o.names, 'cards.names'))) names[k] = rStr(c, v, `cards.names.${k}`, { max: 40 });
  const entries = rArr(c, o.entries, 'cards.entries').map((e, i) => {
    const p = `cards.entries[${i}]`;
    if (!isV(e)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, e, ['month', 'card', 'item', 'amount'], p);
    return {
      month: rMonth(c, e.month, `${p}.month`, { required: true }),
      card: rStr(c, e.card, `${p}.card`, { required: true, max: 40 }),
      item: rStr(c, e.item, `${p}.item`),
      amount: amountField(c, e.amount, `${p}.amount`),
    };
  }).filter(Boolean);
  const fixedFees = rArr(c, o.fixedFees, 'cards.fixedFees').map((e, i) => {
    const p = `cards.fixedFees[${i}]`;
    if (!isV(e)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, e, ['item', 'card', 'amount', 'start', 'end', 'cycle'], p);
    const cycle = e.cycle ?? 'monthly';
    if (cycle !== 'monthly' && cycle !== 'yearly') c.err(`${p}.cycle`, '必須是 monthly 或 yearly', 'V7');
    const start = rMonth(c, e.start, `${p}.start`, { required: true });
    const end = rMonth(c, e.end, `${p}.end`);
    if (start && end && end < start) c.err(`${p}.end`, '結束月份不可早於起算月份', 'V8');
    return {
      item: rStr(c, e.item, `${p}.item`, { required: true }),
      card: rStr(c, e.card, `${p}.card`, { required: true, max: 40 }),
      amount: amountField(c, e.amount, `${p}.amount`),
      start, end, cycle,
    };
  }).filter(Boolean);
  return {
    payDay: dayMap(c, o.payDay, 'cards.payDay'),
    statementDay: dayMap(c, o.statementDay, 'cards.statementDay'),
    names, entries, fixedFees,
  };
}

function vEvents(c, raw) {
  const arr = rArr(c, raw, 'events');
  const seen = new Set();
  return arr.map((e, i) => {
    const p = `events[${i}]`;
    if (!isV(e)) { c.err(p, '必須是物件', 'V6'); return null; }
    unknownKeys(c, e, ['id', 'date', 'item', 'amount', 'note'], p);
    const id = rStr(c, e.id, `${p}.id`, { required: true, max: 40 });
    if (id) { if (seen.has(id)) c.err(`${p}.id`, `id「${id}」重複`, 'V10'); seen.add(id); }
    const date = rDate(c, e.date, `${p}.date`, { required: true });
    const item = rStr(c, e.item, `${p}.item`, { required: true, max: 60 });
    if (e.item !== undefined && typeof e.item === 'string' && !e.item.trim()) c.err(`${p}.item`, '活動名稱不可空白', 'V6');
    return { id, date, item, amount: rNum(c, e.amount, `${p}.amount`, { def: 0 }), note: rStr(c, e.note, `${p}.note`, { max: 200 }) };
  }).filter((x) => x && x.id && x.date);
}

function vRent(c, raw) {
  const o = rObj(c, raw, 'rent');
  unknownKeys(c, o, ['monthlyRent', 'dueDay', 'electricity'], 'rent');
  const electricity = {};
  for (const [k, v] of Object.entries(rObj(c, o.electricity, 'rent.electricity'))) {
    if (!isValidMonthKey(k)) { c.err(`rent.electricity.${k}`, '鍵必須是 YYYY-MM', 'V8'); continue; }
    electricity[k] = amountField(c, v, `rent.electricity.${k}`);
  }
  return {
    monthlyRent: amountField(c, o.monthlyRent ?? 0, 'rent.monthlyRent'),
    dueDay: rDay(c, o.dueDay, 'rent.dueDay'),
    electricity,
  };
}

function vBills(c, raw, path) {
  const out = {};
  for (const [k, v] of Object.entries(rObj(c, raw, path))) {
    if (!isValidMonthKey(k)) { c.err(`${path}.${k}`, '鍵必須是 YYYY-MM', 'V8'); continue; }
    if (!isV(v)) { c.err(`${path}.${k}`, '必須是 {amount, date}', 'V6'); continue; }
    unknownKeys(c, v, ['amount', 'date'], `${path}.${k}`);
    out[k] = { amount: amountField(c, v.amount, `${path}.${k}.amount`), date: rDate(c, v.date, `${path}.${k}.date`) };
  }
  return out;
}

function vHome(c, raw) {
  const o = rObj(c, raw, 'home');
  unknownKeys(c, o, ['internetFee', 'internetDay', 'water', 'electricity'], 'home');
  return {
    internetFee: amountField(c, o.internetFee ?? 0, 'home.internetFee'),
    internetDay: rDay(c, o.internetDay, 'home.internetDay'),
    water: vBills(c, o.water, 'home.water'),
    electricity: vBills(c, o.electricity, 'home.electricity'),
  };
}

function vSalary(c, raw) {
  const o = rObj(c, raw, 'salary');
  unknownKeys(c, o, ['scenarios', 'otherLiving'], 'salary');
  const arr = rArr(c, o.scenarios, 'salary.scenarios');
  if (arr.length > 8) c.err('salary.scenarios', '最多 8 組情境', 'V7');
  return {
    scenarios: arr.slice(0, 8).map((v, i) => rNum(c, v, `salary.scenarios[${i}]`, { min: 0 })),
    otherLiving: amountField(c, o.otherLiving ?? 0, 'salary.otherLiving'),
  };
}

/**
 * 驗證已解析的物件。
 * @returns {{ok:boolean, errors:Array, warnings:Array, data:object|null, migratedFrom:number|null}}
 */
export function validateObject(input) {
  const c = new Ctx();
  if (!isObj(input)) {
    c.err('$', '頂層必須是物件', 'V1');
    return { ok: false, errors: c.errors, warnings: c.warnings, data: null, migratedFrom: null };
  }
  const bad = findForbidden(input);
  if (bad.length) {
    for (const p of bad) c.err(p, '禁用的物件鍵（防原型污染），整檔拒絕', 'V14');
    return { ok: false, errors: c.errors, warnings: c.warnings, data: null, migratedFrom: null };
  }
  const ver = input.schemaVersion;
  if (!Number.isInteger(ver) || ver < 1) {
    c.err('schemaVersion', '必須存在且為正整數', 'V3');
    return { ok: false, errors: c.errors, warnings: c.warnings, data: null, migratedFrom: null };
  }
  if (ver > SCHEMA_VERSION) {
    c.err('schemaVersion', `檔案版本 ${ver} 高於本程式支援的 ${SCHEMA_VERSION}，請更新應用程式`, 'V4');
    return { ok: false, errors: c.errors, warnings: c.warnings, data: null, migratedFrom: null };
  }
  let obj = input;
  let migratedFrom = null;
  if (ver < SCHEMA_VERSION) { obj = migrate(structuredClone(input)); migratedFrom = ver; }

  unknownKeys(c, obj, ['schemaVersion', 'meta', ...SECTIONS], '$');
  const meta = isObj(obj.meta) ? obj.meta : null;
  if (!meta || meta.app !== APP_ID) c.warn('meta.app', `缺少或不是「${APP_ID}」，此檔可能不是由本程式匯出`, 'V12');

  const data = {};
  for (const name of REQUIRED_SECTIONS) {
    if (obj[name] === undefined) c.err(name, '缺少必要區塊', 'V6');
  }
  const builders = { settings: vSettings, loans: vLoans, pledge: vPledge, holdings: (cc, r) => vStocks(cc, r, 'holdings', false),
    realizedPnl: vPnl, cards: vCards, rent: vRent, home: vHome, salary: vSalary, events: vEvents };
  for (const name of SECTIONS) {
    if (obj[name] === undefined && !REQUIRED_SECTIONS.includes(name)) data[name] = defaultSection(name);
    else if (obj[name] !== undefined) data[name] = builders[name](c, obj[name]);
  }
  data.schemaVersion = SCHEMA_VERSION;
  const ok = c.errors.length === 0;
  return { ok, errors: c.errors, warnings: c.warnings, data: ok ? data : null, migratedFrom };
}

/** 驗證檔案文字（V1、V2）。 */
export function validateText(text, byteLength = new TextEncoder().encode(text).length) {
  if (byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, errors: [{ path: '$', msg: `檔案超過 ${(MAX_IMPORT_BYTES / 1048576).toFixed(0)} MB 上限`, code: 'V2' }], warnings: [], data: null, migratedFrom: null };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    return { ok: false, errors: [{ path: '$', msg: `不是合法 JSON：${e.message}`, code: 'V1' }], warnings: [], data: null, migratedFrom: null };
  }
  return validateObject(parsed);
}
