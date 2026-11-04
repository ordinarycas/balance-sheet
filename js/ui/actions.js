// 編輯動作：所有輸入經 commit()——複製目前狀態、套用變更、完整驗證，通過才寫入，確保儲存的資料永遠有效。
import { getState, replaceState } from '../data/store.js';
import { validateObject } from '../data/validate.js';
import { h } from './dom.js';

let renderHook = () => {};
export function setRenderHook(fn) { renderHook = fn; }
export function requestRender() { renderHook(); }

export function toast(msg, kind = 'info', ms = 4500) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}`, text: msg });
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/**
 * @param {(draft:object)=>void} mutator
 * @param {{onError?:(messages:string[])=>void}} [opts] 提供 onError 時，錯誤改由呼叫端就地顯示（不跳 toast、不重繪還原輸入）
 * @returns {boolean} 是否成功寫入
 */
export function commit(mutator, opts = {}) {
  const draft = structuredClone(getState());
  const fail = (messages) => {
    if (opts.onError) { opts.onError(messages); return false; }
    toast(messages.join('\n'), 'error', 7000);
    requestRender();
    return false;
  };
  try { mutator(draft); } catch (e) { return fail([`操作失敗：${e.message}`]); }
  const res = validateObject(draft);
  if (!res.ok) {
    const errs = res.errors.slice(0, 3);
    return fail(errs.map((e) => (opts.onError ? e.msg : `${e.path}：${e.msg}`)));
  }
  if (res.warnings.some((w) => w.code === 'V11')) toast('提醒：支出金額通常為負數。', 'info');
  replaceState(res.data);
  return true;
}
