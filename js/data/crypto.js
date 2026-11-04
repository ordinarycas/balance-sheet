// 選填的備份加密：PBKDF2-SHA256 → AES-256-GCM（瀏覽器內建 Web Crypto，無第三方程式碼）。
// 密碼與明文都不離開瀏覽器；忘記密碼就無法復原，且無任何後門。
const FORMAT = 'pfs-encrypted';
const VERSION = 1;
const DEFAULT_ITERATIONS = 600000;
const MIN_ITERATIONS = 1000;        // 只用於讀取（測試／舊檔）；匯出一律使用預設值
const MAX_ITERATIONS = 2000000;     // 防止惡意檔案宣告超大迭代數拖垮瀏覽器
export const MIN_PASSWORD_LENGTH = 8;
const AAD = new TextEncoder().encode(`${FORMAT}:${VERSION}`);

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('此瀏覽器不支援 Web Crypto（需要 HTTPS 或 localhost）');
  return s;
};

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) throw new Error('加密檔格式錯誤');
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 加密一段文字，回傳可直接存檔的 JSON 字串。 */
export async function encryptText(plain, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) throw new Error(`密碼至少需要 ${MIN_PASSWORD_LENGTH} 個字元`);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(plain)));
  return JSON.stringify({
    format: FORMAT, version: VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toB64(iv) },
    data: toB64(ct),
  }, null, 2) + '\n';
}

/** 若文字是加密檔 envelope 就回傳物件，否則 null（呼叫端改走一般 JSON 匯入）。 */
export function parseEnvelope(text) {
  if (typeof text !== 'string' || !text.includes(FORMAT)) return null;
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  return o && typeof o === 'object' && o.format === FORMAT ? o : null;
}

/** 解密；密碼錯誤或檔案被竄改一律丟出同一則訊息（GCM 驗證失敗）。 */
export async function decryptEnvelope(env, password) {
  if (env.version !== VERSION || env.kdf?.name !== 'PBKDF2' || env.kdf?.hash !== 'SHA-256' || env.cipher?.name !== 'AES-256-GCM') throw new Error('不支援的加密檔版本');
  const it = env.kdf.iterations;
  if (!Number.isInteger(it) || it < MIN_ITERATIONS || it > MAX_ITERATIONS) throw new Error('加密檔參數不合理');
  const salt = fromB64(env.kdf.salt);
  const iv = fromB64(env.cipher.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('加密檔格式錯誤');
  const data = fromB64(env.data);
  const key = await deriveKey(String(password), salt, it);
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, data);
    return new TextDecoder('utf-8', { fatal: true }).decode(pt);
  } catch {
    throw new Error('密碼錯誤，或檔案已損毀／被修改');
  }
}
