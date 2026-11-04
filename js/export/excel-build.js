// Excel 活頁簿產生器（classic script，不使用 import/export）：
// 在 Web Worker 以 importScripts 載入，也可在 Node 測試中直接載入。把版面描述物件寫成 .xlsx。
(function (root) {
  'use strict';

  var FORMATS = {
    twd0: '"NT$"#,##0;"-NT$"#,##0;-',
    twd2: '"NT$"#,##0.00;"-NT$"#,##0.00;-',
    usd2: '"US$"#,##0.00;"-US$"#,##0.00;-',
    pct: '0.00%',
    pct0: '0%',
    date: 'yyyy-mm-dd',
    month: 'yyyy-mm',
    int: '0',
    num2: '#,##0.00;[RED]-#,##0.00;-',
    num4: '#,##0.0000',
    num5: '0.00000',
    fx4: '0.0000',
    pnl: '"NT$"#,##0;[RED]"-NT$"#,##0;-',
    dayN: '"每月"0"日"'
  };

  var THIN = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  var BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

  function solid(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }

  // 每個樣式 token 對 ExcelJS 樣式的貢獻（依序疊加）
  var TOKENS = {
    title: function (s) { s.font = { bold: true, size: 16, color: { argb: 'FF1F3864' } }; },
    note: function (s) { s.font = { italic: true, size: 9, color: { argb: 'FF595959' } }; },
    section: function (s) { s.font = { bold: true, color: { argb: 'FFFFFFFF' } }; s.fill = solid('FF1F3864'); },
    header: function (s) { s.font = { bold: true }; s.fill = solid('FFD9E1F2'); s.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; s.border = BORDER; },
    input: function (s) { s.font = { color: { argb: 'FF0000FF' } }; s.fill = solid('FFFFF2CC'); s.border = BORDER; },
    body: function (s) { s.border = BORDER; },
    total: function (s) { s.font = { bold: true }; s.fill = solid('FFF2F2F2'); s.border = BORDER; },
    bold: function (s) { s.font = Object.assign({}, s.font, { bold: true }); },
    center: function (s) { s.alignment = Object.assign({}, s.alignment, { horizontal: 'center' }); },
    wrap: function (s) { s.alignment = Object.assign({}, s.alignment, { wrapText: true, vertical: 'top' }); },
    cur: function (s) { s.fill = solid('FFDDEBF7'); },
    today: function (s) { s.fill = solid('FFFFE699'); s.font = Object.assign({}, s.font, { bold: true }); },
    past: function (s) { s.font = Object.assign({}, s.font, { color: { argb: 'FF808080' } }); },
    bad: function (s) { s.fill = solid('FFFCE4D6'); },
    good: function (s) { s.fill = solid('FFE2EFDA'); },
    over: function (s) { s.fill = solid('FFFCE4D6'); s.font = Object.assign({}, s.font, { bold: true, color: { argb: 'FFC00000' } }); }
  };

  function styleFor(cache, tokens, fmt) {
    var key = tokens + '|' + fmt;
    var hit = cache.get(key);
    if (hit) return hit;
    var s = {};
    var parts = tokens ? tokens.split(' ') : [];
    for (var i = 0; i < parts.length; i++) { if (TOKENS[parts[i]]) TOKENS[parts[i]](s); }
    if (fmt && FORMATS[fmt]) s.numFmt = FORMATS[fmt];
    cache.set(key, s);
    return s;
  }

  function toValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && typeof v.d === 'number') return new Date(v.d * 86400000); // 日序號 → UTC 午夜
    if (typeof v === 'string' && v.length > 32000) return v.slice(0, 32000);
    return v;
  }

  /**
   * @param {object} ExcelJS 函式庫（worker 內為 self.ExcelJS；Node 為 require('exceljs')）
   * @param {Array} sheets excel-layout.js 的 buildSheets() 輸出
   * @param {{creator?:string, created?:string}} meta
   * @param {(text:string)=>void} [progress]
   * @returns {Promise<ArrayBuffer>}
   */
  function build(ExcelJS, sheets, meta, progress) {
    var wb = new ExcelJS.Workbook();
    wb.creator = (meta && meta.creator) || '個人資產負債表';
    wb.created = meta && meta.created ? new Date(meta.created) : new Date();
    var cache = new Map();

    sheets.forEach(function (sd, idx) {
      if (progress) progress('建立工作表 ' + (idx + 1) + '/' + sheets.length + '：' + sd.name);
      var ws = wb.addWorksheet(sd.name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      sd.widths.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      (sd.hiddenCols || []).forEach(function (c) { ws.getColumn(c).hidden = true; });
      for (var ri = 0; ri < sd.rows.length; ri++) {
        var r = sd.rows[ri][0];
        var cells = sd.rows[ri][1];
        var row = ws.getRow(r);
        for (var ci = 0; ci < cells.length; ci++) {
          var c = cells[ci];
          var cell = row.getCell(c[0]);
          cell.value = toValue(c[1]);
          var st = styleFor(cache, c[2], c[3]);
          if (st.font) cell.font = st.font;
          if (st.fill) cell.fill = st.fill;
          if (st.border) cell.border = st.border;
          if (st.alignment) cell.alignment = st.alignment;
          if (st.numFmt) cell.numFmt = st.numFmt;
        }
      }
      Object.keys(sd.heights || {}).forEach(function (r) { ws.getRow(Number(r)).height = sd.heights[r]; });
      (sd.merges || []).forEach(function (m) { ws.mergeCells(m[0], m[1], m[2], m[3]); });
      if (sd.freeze) ws.views = [{ state: 'frozen', xSplit: sd.freeze.x || 0, ySplit: sd.freeze.y || 0 }];
      if (sd.autoFilter) ws.autoFilter = { from: { row: sd.autoFilter.r1, column: sd.autoFilter.c1 }, to: { row: sd.autoFilter.r2, column: sd.autoFilter.c2 } };
    });

    if (progress) progress('壓縮並寫出檔案…');
    return wb.xlsx.writeBuffer().then(function (buf) {
      var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    });
  }

  root.ExcelBuild = { build: build, FORMATS: FORMATS };
})(typeof self !== 'undefined' ? self : globalThis);
