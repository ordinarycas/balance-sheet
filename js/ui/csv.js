// CSV 匯出：UTF-8 with BOM（Excel 開啟中文正常），並防範 CSV／試算表公式注入。
import { downloadBlob } from '../data/io-json.js';

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // 公式注入防護：文字欄位以 ' 開頭
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename, headers, rows) {
  downloadBlob(new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
