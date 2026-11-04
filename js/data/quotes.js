// 行情與匯率（開放 API，皆可失敗並優雅降級為手動輸入）。
// 隱私：主要來源「證交所 STOCK_DAY_ALL」一次下載全市場最近收盤價，不送出任何持股資料；
//       FinMind 只在使用者明確開啟、且證交所查無（例如上櫃）時，才會送出該檔「股票代號」。
import { isValidISODate } from '../core/dates.js';

export const TWSE_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data';
export const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';
export const FX_URLS = [
  { url: 'https://open.er-api.com/v6/latest/USD', name: 'open.er-api.com', parse: (j) => (j?.result === 'success' ? [j.rates?.TWD, j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString().slice(0, 10) : null] : []) },
  { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', name: 'jsDelivr currency-api', parse: (j) => [j?.usd?.twd, j?.date ?? null] },
];
export const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;
const SYMBOL_RE = /^[0-9A-Z]{1,8}$/;

/** 'TPE:0050' → {market:'TPE', symbol:'0050'}；格式不符回傳 null。 */
export function parseCode(code) {
  if (typeof code !== 'string') return null;
  const i = code.indexOf(':');
  const market = i >= 0 ? code.slice(0, i).toUpperCase() : '';
  const symbol = (i >= 0 ? code.slice(i + 1) : code).trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return null;
  return { market, symbol };
}

/** 解析一列 CSV（支援雙引號欄位）。 */
function csvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 民國日期 '1151104' → '2026-11-04'。 */
export function rocToIso(s) {
  const m = /^(\d{2,3})(\d{2})(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const iso = `${+m[1] + 1911}-${m[2]}-${m[3]}`;
  return isValidISODate(iso) ? iso : null;
}

/** 解析 STOCK_DAY_ALL 的 CSV → Map(symbol → {price, date, name})。 */
export function parseStockDayAll(csv) {
  const map = new Map();
  const lines = String(csv).replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length < 2) return map;
  const head = csvLine(lines[0]);
  const iDate = head.indexOf('日期');
  const iCode = head.indexOf('證券代號');
  const iName = head.indexOf('證券名稱');
  const iClose = head.indexOf('收盤價');
  if (iCode < 0 || iClose < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = csvLine(lines[i]);
    const price = Number(String(c[iClose]).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) continue;
    map.set(String(c[iCode]).trim().toUpperCase(), { price, date: iDate >= 0 ? rocToIso(c[iDate]) : null, name: iName >= 0 ? c[iName] : '' });
  }
  return map;
}

async function fetchText(fetchImpl, url, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

let quoteCache = null; // {key, at, result}
let bulkCache = null;  // {at, map}

export function clearQuoteCache() { quoteCache = null; bulkCache = null; }

/**
 * 取得多檔最近收盤價。
 * @param {string[]} codes 例如 ['TPE:0050','TPEX:6488']
 * @param {{finmind?:boolean, fetchImpl?:typeof fetch, now?:()=>number, force?:boolean}} opts
 * @returns {Promise<{quotes:Object, missing:string[], twse:'ok'|'fail', finmind:'off'|'ok'|'partial'|'fail'|'unused', fetchedAt:number, errors:string[]}>}
 */
export async function fetchQuotes(codes, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const now = opts.now ?? Date.now;
  const uniq = [...new Set(codes)].filter((c) => parseCode(c));
  const key = JSON.stringify([uniq, !!opts.finmind]);
  if (!opts.force && quoteCache && quoteCache.key === key && now() - quoteCache.at < CACHE_MS) return quoteCache.result;

  const result = { quotes: {}, missing: [], twse: 'fail', finmind: opts.finmind ? 'unused' : 'off', fetchedAt: now(), errors: [] };
  if (!fetchImpl || !uniq.length) { result.missing = uniq; return result; }

  // 1. 證交所全市場 CSV
  let map = null;
  if (!opts.force && bulkCache && now() - bulkCache.at < CACHE_MS) map = bulkCache.map;
  else {
    try {
      map = parseStockDayAll(await fetchText(fetchImpl, TWSE_URL));
      if (map.size === 0) throw new Error('內容為空或格式不符');
      bulkCache = { at: now(), map };
    } catch (e) {
      result.errors.push(`證交所：${e.message || e}`);
      map = null;
    }
  }
  if (map) {
    result.twse = 'ok';
    for (const code of uniq) {
      const { symbol } = parseCode(code);
      const hit = map.get(symbol);
      if (hit) result.quotes[code] = { price: hit.price, date: hit.date, source: '證交所收盤價' };
    }
  }

  // 2. FinMind 補查（需使用者開啟）
  let rest = uniq.filter((c) => !result.quotes[c]);
  if (opts.finmind && rest.length) {
    let ok = 0;
    for (const code of rest) {
      const { symbol } = parseCode(code);
      const start = new Date(now() - 14 * 86400000).toISOString().slice(0, 10);
      const url = `${FINMIND_URL}?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(symbol)}&start_date=${start}`;
      try {
        const j = JSON.parse(await fetchText(fetchImpl, url));
        const rows = Array.isArray(j?.data) ? j.data : [];
        const last = rows[rows.length - 1];
        const price = Number(last?.close);
        if (Number.isFinite(price) && price > 0) { result.quotes[code] = { price, date: last.date ?? null, source: 'FinMind 收盤價' }; ok++; }
      } catch (e) {
        result.errors.push(`FinMind ${symbol}：${e.message || e}`);
      }
    }
    result.finmind = ok === rest.length ? 'ok' : ok > 0 ? 'partial' : 'fail';
  }

  result.missing = uniq.filter((c) => !result.quotes[c]);
  result.fetchedAt = now();
  if (result.twse === 'ok' || Object.keys(result.quotes).length) quoteCache = { key, at: now(), result };
  return result;
}

/** USD/TWD：er-api → jsDelivr；皆失敗回傳 null（呼叫端改用手動匯率）。 */
export async function fetchUsdTwd(opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return null;
  for (const src of FX_URLS) {
    try {
      const j = JSON.parse(await fetchText(fetchImpl, src.url));
      const [rate, date] = src.parse(j);
      if (Number.isFinite(rate) && rate > 1 && rate < 1000) return { rate, source: src.name, date };
    } catch { /* 試下一個來源 */ }
  }
  return null;
}
