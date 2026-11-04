// Excel 產生用的 Web Worker（classic worker）：不阻塞主執行緒，也不發出任何網路請求。
/* global importScripts, ExcelBuild */
importScripts('../../vendor/exceljs.min.js', 'excel-build.js');

self.onmessage = async (ev) => {
  try {
    const { sheets, meta } = ev.data;
    const buf = await ExcelBuild.build(self.ExcelJS, sheets, meta, (text) => self.postMessage({ type: 'progress', text }));
    self.postMessage({ type: 'done', buffer: buf }, [buf]);
  } catch (e) {
    self.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};
