// 時鐘頁的「利息堆」：每一秒跳出的利息是一顆氣泡，用 Matter.js（MIT，本地 vendor、用到才載入）模擬重力與碰撞，慢慢堆在地上。
// 規則：
//  - 上限 cap（0–100）；超過時最舊的一顆淡出，數值加到最新的一顆。
//  - 已達上限時，兩顆氣泡碰撞就合併（較大的留下、數值相加，有縮進去的動畫）。
//  - 台北時間換日就清空；堆的內容（只有數字）存在本機，重新開啟同一天會接續。
// 所有合併／淘汰的數字規則在 core/pile.js（可單元測試）；這裡只負責物理與畫面。
import { h } from '../dom.js';
import { Pile, pillSize } from '../../core/pile.js';
import { loadScript } from './charts/loader.js';
import { safeGet, safeSet } from '../../data/storage.js';

const KEY = 'pfs.clock.pile.v1';
const fmt = (v) => v.toFixed(5);

function load(day) {
  try {
    const j = JSON.parse(safeGet(KEY) || 'null');
    if (j && j.day === day && Array.isArray(j.values)) return j.values.filter((v) => Number.isFinite(v) && v > 0).slice(0, 500);
  } catch { /* 損毀就當沒有 */ }
  return [];
}

/**
 * @param {{stage:HTMLElement, layer:HTMLElement, dial:HTMLElement, digital:HTMLElement, cap:number, day:string, onChange?:(p:Pile)=>void}} o
 */
export async function createInterestPile({ stage, layer, dial, digital, cap, day, onChange }) {
  await loadScript('matter.min.js');
  const M = window.Matter;
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = M;

  const sr = stage.getBoundingClientRect();
  const W = sr.width;
  const H = sr.height;
  const rel = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }; };
  const d = rel(dial);
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  const R = (d.w / 2) * 0.96;

  const pile = new Pile(cap);
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  const world = engine.world;
  const wall = { isStatic: true, friction: 0.2 };
  Composite.add(world, [
    Bodies.rectangle(W / 2, H + 30, W + 200, 60, wall),   // 地板
    Bodies.rectangle(-30, H - 1500, 60, 3400, wall),      // 左牆
    Bodies.rectangle(W + 30, H - 1500, 60, 3400, wall),   // 右牆
    Bodies.rectangle(W / 2, -1600, W + 200, 60, wall),    // 天花板（傾斜手機時利息不會飛出去）
  ]); // 時鐘與數位時間不是障礙物：利息會穿過它們落到地上

  /** @type {Map<number, {body:any, el:HTMLElement, r:number}>} */
  const live = new Map();
  const queue = [];
  let disposed = false;

  const place = (b) => { b.el.style.transform = `translate(${(b.body.position.x - b.w / 2).toFixed(1)}px,${(b.body.position.y - b.h / 2).toFixed(1)}px) rotate(${b.body.angle.toFixed(3)}rad)`; };
  const size = (b, item) => {
    const d = pillSize(item.count, fmt(item.value));
    b.w = d.w; b.h = d.h;
    b.el.style.width = `${d.w}px`; b.el.style.height = `${d.h}px`; b.el.style.fontSize = `${d.font}px`;
  };
  const save = () => { safeSet(KEY, JSON.stringify({ day, values: pile.toValues() })); onChange?.(pile); };
  const pulse = (b) => { b.el.classList.remove('merge'); void b.el.offsetWidth; b.el.classList.add('merge'); };
  const pillBody = (item, x, y) => {
    const d = pillSize(item.count, fmt(item.value));
    const body = Bodies.rectangle(x, y, d.w, d.h, { chamfer: { radius: d.h / 2 }, restitution: 0.2, friction: 0.12, frictionAir: 0.012, density: 0.002, label: 'bubble' });
    body.plugin = { id: item.id };
    return body;
  };

  function makeBubble(item, x, y, vx, vy) {
    const body = pillBody(item, x, y);
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
    const el = h('span', { class: 'clk-bub', text: fmt(item.value) });
    const b = { body, el, w: 0, h: 0 };
    size(b, item);
    place(b);
    layer.appendChild(el);
    Composite.add(world, body);
    live.set(item.id, b);
    return b;
  }

  function fadeOut(id, toward) {
    const b = live.get(id);
    if (!b) return;
    live.delete(id);
    Composite.remove(world, b.body);
    b.el.classList.add('fade');
    if (toward) { // 縮進去並往保留的那顆靠攏（合併動畫）
      b.el.style.transform = `translate(${(toward.body.position.x - b.w / 2).toFixed(1)}px,${(toward.body.position.y - b.h / 2).toFixed(1)}px) scale(.3)`;
    }
    setTimeout(() => b.el.remove(), 320);
  }

  function grow(b, item) {
    const d = pillSize(item.count, fmt(item.value));
    b.el.textContent = fmt(item.value);
    if (d.w !== b.w || d.h !== b.h) { // 尺寸改變：以新尺寸的膠囊取代，保留位置、速度與角度
      const old = b.body;
      const nb = pillBody(item, old.position.x, old.position.y);
      Body.setAngle(nb, old.angle);
      Body.setVelocity(nb, old.velocity);
      Composite.remove(world, old);
      Composite.add(world, nb);
      b.body = nb;
      size(b, item);
    }
    pulse(b);
  }

  /** 放進新的一顆：從指定角度（0＝12 點方向，順時針）的鐘面邊緣彈出。 */
  function spawn(angleDeg, value) {
    if (disposed) return;
    const { item, evicted } = pile.add(value);
    const a = (angleDeg * Math.PI) / 180;
    const tip = R * 0.72; // 從秒針尖端附近冒出
    const b = makeBubble(item, cx + tip * Math.sin(a), cy - tip * Math.cos(a), 1.6 * Math.sin(a) + (Math.random() - 0.5) * 0.8, -1.6 * Math.cos(a) - 0.6);
    if (evicted) { fadeOut(evicted.id, b); grow(b, item); }
    save();
  }

  /** 還原當天已堆的內容：從上方依序掉下來。 */
  function restore() {
    const values = load(day);
    values.forEach((v, i) => setTimeout(() => {
      if (disposed) return;
      const { item, evicted } = pile.add(v);
      const b = makeBubble(item, 20 + Math.random() * Math.max(W - 40, 1), -30, (Math.random() - 0.5) * 2, 0);
      if (evicted) { fadeOut(evicted.id, b); grow(b, item); }
      onChange?.(pile);
    }, i * 35));
  }

  function reset(newDay) {
    day = newDay;
    for (const id of [...live.keys()]) fadeOut(id);
    pile.clear();
    save();
  }

  Events.on(engine, 'collisionStart', (e) => {
    for (const p of e.pairs) {
      if (p.bodyA.label === 'bubble' && p.bodyB.label === 'bubble') queue.push([p.bodyA.plugin.id, p.bodyB.plugin.id]);
    }
  });

  function flushMerges() {
    let did = false;
    while (queue.length) {
      const [a, b] = queue.shift();
      if (!pile.canMerge() || !live.has(a) || !live.has(b)) continue;
      const m = pile.merge(a, b);
      if (!m) continue;
      const keep = live.get(m.keep.id);
      fadeOut(m.drop.id, keep);
      grow(keep, m.keep);
      did = true;
    }
    if (did) save();
  }

  function step(dtMs) {
    if (disposed) return;
    Engine.update(engine, Math.min(Math.max(dtMs, 1), 33));
    flushMerges();
    for (const b of live.values()) place(b);
  }

  /** 依手機傾斜改變重力方向（gx、gy 各在 -1 到 1）；會喚醒睡著的物體。 */
  function setGravity(gx, gy) {
    engine.gravity.x = Math.max(-1, Math.min(1, gx));
    engine.gravity.y = Math.max(-1, Math.min(1, gy));
    for (const b of live.values()) Sleeping.set(b.body, false);
  }

  function dispose() {
    disposed = true;
    Events.off(engine);
    Composite.clear(world, false);
    Engine.clear(engine);
    layer.replaceChildren();
    live.clear();
  }

  restore();
  return { pile, spawn, step, reset, setGravity, dispose, get day() { return day; } };
}
