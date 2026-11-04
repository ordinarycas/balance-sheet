// Excel 匯出（主執行緒端）：由核心層結果排版 → 交給 Worker 產生 → 下載。
import { buildSheets } from './excel-layout.js';
import { nowTaipeiISO, stampTaipei } from '../core/dates.js';
import { downloadBlob } from '../data/io-json.js';

/**
 * @param {object} model computeModel() 的結果
 * @param {object} state 輸入資料
 * @param {(text:string)=>void} onProgress
 * @param {{includeDaily?:boolean, selected?:string[], quoteInfo?:object, fx?:object}} [opts]
 */
export async function exportExcel(model, state, onProgress = () => {}, opts = {}) {
  const now = new Date();
  onProgress('整理資料…');
  const sheets = buildSheets(model, state, {
    exportedAt: nowTaipeiISO(now),
    includeDaily: opts.includeDaily !== false,
    selected: opts.selected ?? null,
    quoteInfo: opts.quoteInfo ? { fetchedAt: opts.quoteInfo.fetchedAt ? nowTaipeiISO(new Date(opts.quoteInfo.fetchedAt)) : null } : null,
    fxAuto: opts.fx?.rate ?? null,
    fxSource: opts.fx ? `${opts.fx.source}${opts.fx.date ? ` ${opts.fx.date}` : ''}` : '',
  });
  const worker = new Worker(new URL('./excel-worker.js', import.meta.url));
  const buffer = await new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'progress') onProgress(d.text);
      else if (d.type === 'done') resolve(d.buffer);
      else reject(new Error(d.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Worker 載入失敗'));
    worker.postMessage({ sheets, meta: { created: now.toISOString() } });
  }).finally(() => worker.terminate());
  const filename = `資產負債表_${stampTaipei(now).slice(0, 8)}.xlsx`;
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return { filename, bytes: buffer.byteLength, sheets: sheets.length };
}
