// 資料模型的預設值與區塊清單（規格 §5.2）。
import { SCHEMA_VERSION, APP_ID, APP_VERSION } from '../core/constants.js';
import { nowTaipeiISO } from '../core/dates.js';

export const SECTIONS = ['settings', 'loans', 'pledge', 'holdings', 'realizedPnl', 'cards', 'rent', 'home', 'salary', 'events'];
export const REQUIRED_SECTIONS = ['settings', 'loans'];

export const SECTION_LABELS = {
  settings: '全域設定', loans: '借款', pledge: '股票質押', holdings: '持股', realizedPnl: '已實現損益',
  cards: '信用卡', rent: '房租', home: '家裡支出', salary: '月薪情境', events: '自訂行事曆活動',
};

export function defaultSettings() {
  return { asOfDate: null, dayCountLoan: 365, dayCountPledge: 360, usdTwdManual: 32, monthStart: null, payDay: null };
}

/** 全空白的狀態（可直接匯出作為範本）。 */
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { app: APP_ID, appVersion: APP_VERSION, exportedAt: nowTaipeiISO() },
    settings: defaultSettings(),
    loans: [],
    pledge: { borrowed: 0, interestDay: null, accountName: '', stocks: [] },
    holdings: [],
    realizedPnl: [],
    cards: { payDay: {}, statementDay: {}, names: {}, entries: [], fixedFees: [] },
    rent: { monthlyRent: 0, dueDay: null, electricity: {} },
    home: { internetFee: 0, internetDay: null, water: {}, electricity: {} },
    salary: { scenarios: [36000, 40000, 46000, 52000, 56000], otherLiving: 0 },
    events: [],
  };
}

export function defaultSection(name) {
  return structuredClone(emptyState()[name]);
}

export function emptyLoan(id) {
  return {
    id, name: '', kind: 'amortizing', currency: 'TWD', principal: 0, annualRate: 0, periods: 12,
    startDate: '', firstDueDate: '', dueRule: 'EOM', decimals: 0, calibration: null,
    rateChanges: [], prepayments: [],
  };
}
