// 全站常數
export const SCHEMA_VERSION = 2;
export const APP_ID = 'personal-finance-static';
export const APP_VERSION = '1.1.0';

/** 保單借款（只繳利息、本金不攤還）的試算年數。原 Excel 為 7 期（逐日明細 2,557 列）。 */
export const DEFAULT_ANNUAL_PERIODS = 7;
/** 月薪情境模擬的最長月數。 */
export const SIM_MONTHS = 120;
/** 每月支出與繳費日曆的視窗月數。 */
export const WINDOW_MONTHS = 12;
/** 單一 JSON 匯入檔大小上限（位元組）。 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** 名稱、備註等字串長度上限。 */
export const MAX_STRING_LENGTH = 200;

// 公開網站不內建任何銀行或發卡機構名稱；顯示名稱由使用者於「P09 支出」自行設定（cards.names），未設定時顯示代號。
export const KNOWN_CARD_LABELS = {};

export const KIND_LABELS = {
  amortizing: '本息平均攤還',
  interest_only_annual: '年繳利息（本金不攤還）',
};

export const DUE_RULE_LABELS = {
  EOM: '每月底',
  DAY: '每月固定日',
  YEARLY: '每年同月同日',
};
