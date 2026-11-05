// P12 資料匯入／匯出：JSON 匯出、JSON 匯入（驗證→預覽→套用）、Excel 匯出、危險操作
import { h } from '../dom.js';
import { section, gridTable } from '../components/table.js';
import { button, choiceField } from '../components/forms.js';
import { downloadJson, downloadBlob, serializeState, exportFilename, diffSummary } from '../../data/io-json.js';
import { encryptText, decryptEnvelope, parseEnvelope, MIN_PASSWORD_LENGTH } from '../../data/crypto.js';
import { markBackup } from '../../data/backup.js';
import { mergeStates, previewMerge, POLICIES } from '../../data/merge.js';
import { validateText } from '../../data/validate.js';
import { applyImport, restore, hasRestorePoint, clearAll, getState } from '../../data/store.js';
import { SECTIONS, SECTION_LABELS } from '../../data/schema.js';
import { MAX_IMPORT_BYTES } from '../../core/constants.js';
import { unregisterBackground } from '../reminder.js';

let pending = null; // {name, result, mode, sections:Set, ack:boolean}
let excelBusy = false;
let excelMsg = '';
let includeDaily = true;

async function readFile(app, file) {
  if (!/\.json$/i.test(file.name)) { pending = { name: file.name, result: { ok: false, errors: [{ path: '$', msg: '副檔名必須是 .json', code: 'V1' }], warnings: [] } }; return; }
  if (file.size > MAX_IMPORT_BYTES) { pending = { name: file.name, result: { ok: false, errors: [{ path: '$', msg: `檔案超過 ${MAX_IMPORT_BYTES / 1048576} MB 上限`, code: 'V2' }], warnings: [] } }; return; }
  const text = await file.text();
  const env = parseEnvelope(text);
  if (env) { pending = { name: file.name, encrypted: env, size: file.size, decryptMsg: '' }; return; }
  pending = { name: file.name, result: validateText(text, file.size), mode: 'replace', sections: new Set(SECTIONS), ack: false };
}

function issueList(items, cls) {
  return h('ul', { class: 'plain' }, items.map((e) => h('li', { class: cls, text: `[${e.code}] ${e.path}：${e.msg}` })));
}

function decryptBlock(app) {
  const pw = h('input', { type: 'password', class: 'in', autocomplete: 'off', 'aria-label': '解密密碼', placeholder: '輸入備份密碼' });
  const run = async () => {
    try {
      const text = await decryptEnvelope(pending.encrypted, pw.value);
      pending = { name: pending.name, result: validateText(text, text.length), mode: 'replace', sections: new Set(SECTIONS), ack: false };
    } catch (e) {
      pending.decryptMsg = e.message || String(e);
    }
    app.rerender();
  };
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return h('div', null,
    h('p', { text: '這是以密碼加密的備份。解密在你的瀏覽器內完成，密碼不會送出。' }),
    h('div', { class: 'row' }, pw, button('解密', run, 'primary'), button('取消', () => { pending = null; app.rerender(); })),
    pending.decryptMsg ? h('div', { class: 'field-error', role: 'alert', text: pending.decryptMsg }) : null);
}

function encryptedExportBlock(app) {
  const pw = h('input', { type: 'password', class: 'in', autocomplete: 'new-password', 'aria-label': '加密密碼', placeholder: `密碼（至少 ${MIN_PASSWORD_LENGTH} 字元）` });
  const pw2 = h('input', { type: 'password', class: 'in', autocomplete: 'new-password', 'aria-label': '再輸入一次密碼', placeholder: '再輸入一次' });
  const msg = h('div', { class: 'field-error', role: 'alert' });
  const go = button('匯出加密 JSON', async () => {
    msg.textContent = '';
    if (pw.value.length < MIN_PASSWORD_LENGTH) { msg.textContent = `密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`; return; }
    if (pw.value !== pw2.value) { msg.textContent = '兩次輸入的密碼不一致'; return; }
    go.disabled = true; go.textContent = '加密中…';
    try {
      const text = await encryptText(serializeState(getState()), pw.value);
      downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), exportFilename().replace('.json', '.enc.json'));
      markBackup();
      pw.value = ''; pw2.value = '';
      app.toast('已下載加密備份。請記住密碼：忘記就無法復原。');
    } catch (e) {
      msg.textContent = `加密失敗：${e.message || e}`;
    }
    go.disabled = false; go.textContent = '匯出加密 JSON';
  });
  return h('details', null, h('summary', { text: '以密碼加密匯出（選填）' }),
    h('div', { class: 'row' }, pw, pw2, go), msg,
    h('p', { class: 'note', text: 'AES-256-GCM，金鑰由 PBKDF2-SHA256（60 萬次）從密碼導出，全程在瀏覽器內完成。忘記密碼無法復原，也沒有後門。匯入時選取這個 .enc.json 檔，會先要求輸入密碼。' }));
}

const policiesOf = () => (pending.policies ??= Object.fromEntries(SECTIONS.map((s) => [s, 'add'])));

/** 逐筆合併：每個區塊選策略，並即時預覽新增／覆蓋／保留的筆數。 */
function recordsTable(app, incoming) {
  const pol = policiesOf();
  const prev = previewMerge(getState(), incoming);
  const fmt = (rep) => (rep ? `新增 ${rep.added.length}｜覆蓋 ${rep.updated.length}｜保留現有 ${rep.kept.length}｜相同 ${rep.unchanged}` : '—');
  const names = (rep) => (rep ? [...rep.added.map((x) => `＋${x}`), ...rep.updated.map((x) => `～${x}`), ...rep.kept.map((x) => `＝${x}（保留現有）`)].slice(0, 12).join('、') : '');
  return h('div', null,
    gridTable({
      headers: ['區塊', '策略', '預覽（依目前策略）', '明細（前 12 項）'],
      rows: SECTIONS.map((s) => {
        const rep = pol[s] === 'skip' ? null : prev[s][pol[s]];
        return [SECTION_LABELS[s],
          choiceField({ value: pol[s], options: POLICIES, label: `${SECTION_LABELS[s]}合併策略`, onChange: (v) => { pol[s] = v; app.rerender(); } }),
          fmt(rep), names(rep)];
      }),
    }),
    h('p', { class: 'note', text: '比對鍵：借款＝id；持股／質押股票＝代號；已實現損益、逐月電費水費＝月份；信用卡明細＝月份＋卡別＋細項；固定費用＝細項＋卡別＋起算月。「只新增」不會動到任何現有資料；純量欄位（如質押已借金額）只有「覆蓋」才會被匯入值取代。' }));
}

function importBlock(app) {
  const input = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '選擇 JSON 備份檔（含加密備份）' });
  input.addEventListener('change', async () => { if (input.files[0]) { await readFile(app, input.files[0]); app.rerender(); } });
  const zone = h('div', { class: 'dropzone' }, '拖放 .json 檔到這裡，或 ', input);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault(); zone.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) { await readFile(app, f); app.rerender(); }
  });
  const kids = [zone];
  if (pending?.encrypted) {
    kids.push(h('h3', { text: `加密檔案：${pending.name}` }), decryptBlock(app));
  } else if (pending) {
    const r = pending.result;
    kids.push(h('h3', { text: `檔案：${pending.name}` }));
    if (!r.ok) {
      kids.push(h('div', { class: 'banner error' }, '驗證失敗，未變更任何資料：'), issueList(r.errors, 'neg'));
      if (r.warnings.length) kids.push(h('p', { class: 'note', text: '另有警告：' }), issueList(r.warnings));
    } else {
      if (r.migratedFrom) kids.push(h('div', { class: 'banner info' }, `此檔為 v${r.migratedFrom}，已自動遷移到最新版本。`));
      if (r.warnings.length) kids.push(h('div', { class: 'banner' }, '有警告（可匯入，但請確認）：'), issueList(r.warnings));
      const cur = getState();
      const diff = diffSummary(cur, r.data);
      kids.push(gridTable({ headers: ['區塊', '目前筆數', '匯入筆數', ...(pending.mode === 'merge' ? ['匯入此區塊'] : [])], numCols: [1, 2],
        rows: diff.map((d) => [SECTION_LABELS[d.name], String(d.current), String(d.incoming), ...(pending.mode === 'merge' ? [(() => {
          const b = h('input', { type: 'checkbox', checked: pending.sections.has(d.name) });
          b.addEventListener('change', () => { if (b.checked) pending.sections.add(d.name); else pending.sections.delete(d.name); });
          return b;
        })()] : [])]) }));
      const mode = (value, label) => {
        const rb = h('input', { type: 'radio', name: 'mode', checked: pending.mode === value });
        rb.addEventListener('change', () => { pending.mode = value; app.rerender(); });
        return h('label', null, rb, ` ${label}　`);
      };
      kids.push(h('div', { class: 'row' }, mode('replace', '取代全部（預設）'), mode('merge', '依區塊整塊取代'), mode('records', '逐筆合併（依鍵比對）')));
      if (pending.mode === 'records') kids.push(recordsTable(app, r.data));
      if (r.warnings.length) {
        const ack = h('input', { type: 'checkbox', checked: pending.ack });
        ack.addEventListener('change', () => { pending.ack = ack.checked; app.rerender(); });
        kids.push(h('label', null, ack, ' 我已閱讀警告，仍要匯入'));
      }
      const blocked = r.warnings.length > 0 && !pending.ack;
      kids.push(h('div', { class: 'row' },
        h('button', { type: 'button', class: 'primary', disabled: blocked, onClick: () => {
          let res;
          if (pending.mode === 'records') {
            const merged = mergeStates(getState(), r.data, policiesOf());
            res = applyImport(merged.state, 'replace');
          } else res = applyImport(r.data, pending.mode, [...pending.sections]);
          if (!res.ok) { app.toast(res.errors.slice(0, 3).map((e) => `${e.path}：${e.msg}`).join('\n'), 'error', 8000); return; }
          pending = null;
          app.toast('匯入完成。若不滿意，可按「還原到匯入前」。');
          app.rerender();
        } }, '套用匯入'),
        button('取消', () => { pending = null; app.rerender(); })));
      kids.push(h('p', { class: 'note', text: '套用前會先建立還原點；寫入為原子操作（全部成功或完全不變）。' }));
    }
  }
  return kids;
}

export default function render(app) {
  const root = h('div', null, h('h1', { text: '資料匯入／匯出' }),
    h('p', { class: 'sub', text: '所有匯入匯出都在你的瀏覽器內完成，不經任何網路。' }));

  // 1. 匯出 JSON
  const warnBox = h('input', { type: 'checkbox', checked: app.prefs.hideExportWarning });
  warnBox.addEventListener('change', () => app.setPref('hideExportWarning', warnBox.checked));
  root.appendChild(section('JSON 匯出（備份全部輸入資料）',
    button('匯出 JSON', () => {
      if (!app.prefs.hideExportWarning && !confirm('此檔為「未加密」明文，含完整個人財務資料，請妥善保管、勿上傳到公開處。\n\n按「確定」繼續下載。')) return;
      downloadJson(getState());
      markBackup();
    }, 'primary'),
    h('div', { class: 'row' }, h('label', null, warnBox, ' 不再顯示未加密提醒')),
    encryptedExportBlock(app),
    h('p', { class: 'note', text: '內容只含輸入資料（不含計算結果與股價快取）；檔名 finance-backup-YYYYMMDD-HHmm.json。沒有資料時匯出空白範本。' })));

  // 2. 匯入
  root.appendChild(section('JSON 匯入', importBlock(app)));
  if (hasRestorePoint()) {
    root.appendChild(h('div', { class: 'card' }, h('strong', { text: '可還原：' }), ' 上一次匯入前的資料。 ',
      button('還原到匯入前', () => { if (restore()) { app.toast('已還原。'); } else app.toast('還原失敗：還原點無效', 'error'); app.rerender(); })));
  }

  // 3. Excel
  root.appendChild(section('Excel 匯出（計算結果 .xlsx）',
    h('p', null, '輸出 18 張工作表，沿用原試算表的名稱與版面；內容為目前的計算結果（靜態數值，不含公式）。'),
    h('div', { class: 'row' }, (() => { const b = h('input', { type: 'checkbox', checked: includeDaily }); b.addEventListener('change', () => { includeDaily = b.checked; }); return h('label', null, b, ' 包含「逐日明細」（約 6,500 列，檔案較大）'); })()),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', disabled: excelBusy, onClick: async () => {
      excelBusy = true; excelMsg = '產生中…'; app.rerender();
      try {
        const mod = await import('../../export/excel-export.js');
        const info = await mod.exportExcel(app.model, app.state, (p) => { excelMsg = p; app.rerender(); }, { includeDaily, quoteInfo: app.quoteInfo, fx: app.prefs.autoFx ? app.fx : null });
        excelMsg = `已下載 ${info.filename}（${(info.bytes / 1024).toFixed(0)} KB）`;
      } catch (e) {
        console.error(e);
        excelMsg = `匯出失敗：${e.message || e}`;
      }
      excelBusy = false; app.rerender();
    } }, excelBusy ? '產生中…' : '匯出 Excel'), h('span', { class: 'muted', text: excelMsg })),
    h('p', { class: 'note', text: '在背景執行緒中產生，不會凍結畫面；檔案為明文，含完整財務資料。Excel 檔無法在瀏覽器內做到真正的檔案加密（ExcelJS 只支援工作表保護，不是加密）；需要保護請改用上方的加密 JSON 備份，或自行用 7-Zip／系統工具加密壓縮 .xlsx。' })));

  // 4. 危險操作
  const confirmInput = h('input', { type: 'text', placeholder: '輸入「清除」以確認', 'aria-label': '輸入清除以確認' });
  root.appendChild(section('危險操作',
    h('div', { class: 'row' }, confirmInput,
      h('button', { type: 'button', class: 'danger', onClick: () => {
        if (confirmInput.value.trim() !== '清除') { app.toast('請先在欄位輸入「清除」'); return; }
        if (!confirm('確定要清除這個瀏覽器中的所有本機資料？此動作無法復原（建議先匯出備份）。')) return;
        clearAll(); pending = null;
        unregisterBackground(); // 繳費提醒的背景快照（含應繳項目與金額）也一併移除
        app.afterClear();
        app.toast('已清除本機資料。'); app.navigate('overview');
      } }, '清除本機資料')),
    h('p', { class: 'note', text: '會清除本網站在此瀏覽器儲存的一切：財務資料、還原點，以及生日、性別、現金、預計退休年齡、時鐘設定與堆積、繳費提醒快照等偏好設定。已匯出的檔案不受影響。' })));
  return root;
}
