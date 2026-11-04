// JSON 匯出入（規格 §7.10）：固定鍵順序、無 BOM、縮排 2 空格；匯出不含衍生結果與股價快取。
import { APP_ID, APP_VERSION, SCHEMA_VERSION } from '../core/constants.js';
import { nowTaipeiISO, stampTaipei } from '../core/dates.js';
import { SECTIONS } from './schema.js';

const LOAN_KEYS = ['id', 'name', 'kind', 'currency', 'principal', 'annualRate', 'periods', 'startDate', 'firstDueDate', 'dueRule', 'decimals', 'calibration', 'rateChanges', 'prepayments'];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** 依固定順序建出匯出物件。 */
export function toExportObject(state, now = new Date()) {
  const o = {
    schemaVersion: SCHEMA_VERSION,
    meta: { app: APP_ID, appVersion: APP_VERSION, exportedAt: nowTaipeiISO(now) },
    settings: pick(state.settings, ['asOfDate', 'dayCountLoan', 'dayCountPledge', 'usdTwdManual', 'monthStart', 'payDay']),
    loans: state.loans.map((l) => {
      const x = pick(l, LOAN_KEYS);
      if (l.kind === 'interest_only_annual') { delete x.calibration; delete x.rateChanges; delete x.prepayments; if (x.periods === null) delete x.periods; }
      else {
        x.rateChanges = (l.rateChanges ?? []).map((r) => pick(r, ['date', 'annualRate']));
        x.prepayments = (l.prepayments ?? []).map((r) => pick(r, ['date', 'amount', 'mode']));
      }
      return x;
    }),
    pledge: {
      borrowed: state.pledge.borrowed,
      interestDay: state.pledge.interestDay,
      accountName: state.pledge.accountName ?? '',
      stocks: state.pledge.stocks.map((s) => pick(s, ['code', 'name', 'shares', 'manualPrice', 'ltv', 'annualRate'])),
    },
    holdings: state.holdings.map((s) => pick(s, ['code', 'name', 'shares', 'manualPrice'])),
    realizedPnl: state.realizedPnl.map((r) => pick(r, ['month', 'personal', 'father', 'mother'])),
    cards: {
      payDay: state.cards.payDay,
      statementDay: state.cards.statementDay,
      names: state.cards.names,
      entries: state.cards.entries.map((e) => pick(e, ['month', 'card', 'item', 'amount'])),
      fixedFees: state.cards.fixedFees.map((e) => pick(e, ['item', 'card', 'amount', 'start', 'end', 'cycle'])),
    },
    rent: { monthlyRent: state.rent.monthlyRent, dueDay: state.rent.dueDay, electricity: sortKeys(state.rent.electricity) },
    home: {
      internetFee: state.home.internetFee,
      internetDay: state.home.internetDay,
      water: sortKeys(state.home.water),
      electricity: sortKeys(state.home.electricity),
    },
    salary: { scenarios: state.salary.scenarios, otherLiving: state.salary.otherLiving },
    events: (state.events ?? []).map((e) => pick(e, ['id', 'date', 'item', 'amount', 'note'])),
  };
  return o;
}

function sortKeys(map) {
  return Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
}

export function serializeState(state, now = new Date()) {
  return JSON.stringify(toExportObject(state, now), null, 2) + '\n';
}

export function exportFilename(now = new Date()) {
  return `finance-backup-${stampTaipei(now)}.json`;
}

/** 在瀏覽器內以 Blob 下載，不經網路。 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJson(state) {
  downloadBlob(new Blob([serializeState(state)], { type: 'application/json;charset=utf-8' }), exportFilename());
}

/** 匯入預覽：各區塊筆數（目前 vs 匯入）。 */
export function diffSummary(current, incoming) {
  const count = (s, name) => {
    const v = s[name];
    if (Array.isArray(v)) return v.length;
    if (name === 'pledge') return v.stocks.length;
    if (name === 'cards') return v.entries.length + v.fixedFees.length;
    if (name === 'rent') return Object.keys(v.electricity).length + (v.monthlyRent ? 1 : 0);
    if (name === 'home') return Object.keys(v.water).length + Object.keys(v.electricity).length + (v.internetFee ? 1 : 0);
    if (name === 'salary') return v.scenarios.length;
    return 1;
  };
  return SECTIONS.map((name) => ({ name, current: count(current, name), incoming: count(incoming, name) }));
}
