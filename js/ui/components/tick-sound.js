// 純 JS（Web Audio）合成的秒針滴答聲：不載入任何音檔。瀏覽器規定要在使用者操作後才能發聲，
// 所以 enable() 必須由點擊或勾選等操作呼叫。
let ctx = null;
let noise = null;

export function soundSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

/** 在使用者操作中呼叫：建立並喚醒 AudioContext。回傳是否可發聲。 */
export function enableSound() {
  if (!soundSupported()) return false;
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

export function disableSound() {
  try { ctx?.suspend(); } catch { /* 忽略 */ }
}

export function soundReady() { return !!ctx && ctx.state === 'running'; }

/** 一聲「滴」或「答」（交替音高）。 */
export function tick(alt = false) {
  if (!soundReady()) return;
  const t = ctx.currentTime;
  if (!noise) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = alt ? 1400 : 2000;
  bp.Q.value = 5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.05);
}
