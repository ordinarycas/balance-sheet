// 表單元件：輸入欄為「藍字黃底」（沿用 Excel 慣例，標示可編輯）。變更於 change 時提交；
// 驗證失敗時在欄位旁就地顯示錯誤（role="alert"、aria-invalid、aria-describedby），不會像 toast 那樣自動消失。
import { h } from '../dom.js';
import { commit, toast } from '../actions.js';

let errSeq = 0;

export function clearError(el) {
  el.classList.remove('invalid');
  el.removeAttribute('aria-invalid');
  const id = el.getAttribute('aria-describedby');
  if (id && id.startsWith('err-')) { document.getElementById(id)?.remove(); el.removeAttribute('aria-describedby'); }
}

export function showError(el, messages) {
  clearError(el);
  const id = `err-${++errSeq}`;
  el.classList.add('invalid');
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', id);
  el.insertAdjacentElement('afterend', h('div', { class: 'field-error', role: 'alert', id, text: messages.join('；') }));
}

/** 提交變更；失敗時把訊息顯示在 el 旁邊。 */
function attempt(el, mutator) {
  const ok = commit(mutator, { onError: (msgs) => showError(el, msgs) });
  if (ok) clearError(el);
  return ok;
}

/** 建立輸入欄的共同骨架。parse(el)→{value}|{error}；required 且為空時報錯。 */
function inputField(tag, attrs, { mutate, nullable, parse }) {
  const el = h(tag, attrs);
  el.addEventListener('change', () => {
    const r = parse(el);
    if (r.error) { showError(el, [r.error]); return; }
    if (r.value === null && !nullable) { showError(el, ['此欄位不可空白']); return; }
    attempt(el, (d) => mutate(d, r.value));
  });
  return el;
}

/** 數字輸入。mutate(draft, value) 負責寫入草稿。 */
export function numField({ value, mutate, int = false, nullable = false, step = 'any', min, max, placeholder, cls = '', title }) {
  return inputField('input', { type: 'number', class: `in ${cls}`, value: value ?? '', step: int ? '1' : step, min, max, placeholder, title }, {
    mutate, nullable,
    parse: (el) => {
      const raw = el.value.trim();
      if (raw === '') return { value: null };
      const v = Number(raw);
      if (!Number.isFinite(v)) return { error: '請輸入有效數字' };
      if (int && !Number.isInteger(v)) return { error: '請輸入整數' };
      if (min !== undefined && v < Number(min)) return { error: `不可小於 ${min}` };
      if (max !== undefined && v > Number(max)) return { error: `不可大於 ${max}` };
      return { value: v };
    },
  });
}

export function textField({ value, mutate, max = 200, placeholder, cls = '', title }) {
  const el = inputField('input', { type: 'text', class: `in ${cls}`, value: value ?? '', placeholder, title }, {
    mutate, nullable: true, parse: (e) => ({ value: e.value.trim() }),
  });
  el.maxLength = max;
  return el;
}

export function dateField({ value, mutate, nullable = false, cls = '' }) {
  return inputField('input', { type: 'date', class: `in ${cls}`, value: value ?? '' }, {
    mutate, nullable, parse: (el) => ({ value: el.value === '' ? null : el.value }),
  });
}

export function monthField({ value, mutate, nullable = false, cls = '' }) {
  return inputField('input', { type: 'month', class: `in ${cls}`, value: value ?? '', placeholder: 'YYYY-MM', pattern: '\\d{4}-\\d{2}' }, {
    mutate, nullable, parse: (el) => ({ value: el.value === '' ? null : el.value }),
  });
}

/** options: [[value,label],...]；value 一律以字串比較。 */
export function selectField({ value, options, mutate, cls = '' }) {
  const el = h('select', { class: `in ${cls}` });
  for (const [v, label] of options) {
    const o = h('option', { value: String(v), text: label });
    if (String(v) === String(value)) o.selected = true;
    el.appendChild(o);
  }
  el.addEventListener('change', () => attempt(el, (d) => mutate(d, el.value)));
  return el;
}

/** 只改「畫面狀態」的下拉選單（篩選、偏好…）：不經過 commit，不會寫入財務資料、也不計入備份提醒的修改次數。 */
export function choiceField({ value, options, onChange, cls = '', label }) {
  const el = h('select', { class: `in ${cls}`, 'aria-label': label });
  for (const [v, text] of options) {
    const o = h('option', { value: String(v), text });
    if (String(v) === String(value)) o.selected = true;
    el.appendChild(o);
  }
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function labeled(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('span', { class: 'note', text: hint }) : null);
}

export function button(label, onClick, cls = '', title, disabled = false) {
  return h('button', { type: 'button', class: cls, onClick, title, disabled }, label);
}

export function deleteButton(onClick, label = '刪除') {
  return h('button', { type: 'button', class: 'small danger', onClick, title: label, 'aria-label': label }, '✕');
}

/** 把貼上的文字（Excel 欄位、逗號／Tab／換行分隔）轉成數字陣列。支援 1,234、NT$、全形負號與括號負數；無法解析的格子為 null。 */
export function parseNumberList(text) {
  return String(text).split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l !== '').map((cell) => {
    let s = cell.split(/\t/)[0].replace(/NT\$|\$|,|\s/gi, '').replace(/[－−]/g, '-');
    let neg = false;
    const m = /^\((.*)\)$/.exec(s);
    if (m) { neg = true; s = m[1]; }
    if (s === '' || s === '-') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  });
}

/**
 * 批次貼上區塊：貼上一欄數字，依序套用到 targets（例如每個月份）。
 * apply(values[]) 由呼叫端處理（通常是一次 commit）；正數視為費用大小，自動轉成負數。
 */
export function pasteBox({ summary = '批次貼上', hint, count, apply }) {
  const ta = h('textarea', { rows: 6, class: 'in paste', placeholder: '從 Excel 複製一欄金額後貼在這裡（每行一個月）', 'aria-label': summary });
  const msg = h('div', { class: 'note', role: 'status' });
  const go = button('套用', () => {
    const vals = parseNumberList(ta.value);
    if (!vals.length) { msg.textContent = '沒有可套用的數字'; return; }
    if (vals.some((v) => v === null)) { msg.textContent = `第 ${vals.findIndex((v) => v === null) + 1} 行不是數字`; return; }
    const used = vals.slice(0, count).map((v) => (v > 0 ? -v : v));
    const ok = apply(used);
    if (ok) toast(`已套用 ${used.length} 筆${vals.length > count ? `（多出的 ${vals.length - count} 筆已忽略）` : ''}`);
    else msg.textContent = '套用失敗，請檢查內容';
  }, 'primary');
  return h('details', { class: 'no-print' }, h('summary', { text: summary }),
    hint ? h('p', { class: 'note', text: hint }) : null, ta, h('div', { class: 'row' }, go, msg));
}
