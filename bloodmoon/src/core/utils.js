import * as THREE from '../three.js';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** Deterministic PRNG so procedural levels look identical every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Horizontal distance between two vectors (ignores y). */
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Forward unit vector for a model facing angle (model forward = +Z). */
export const facingVec = (facing, out = new THREE.Vector3()) => out.set(Math.sin(facing), 0, Math.cos(facing));

export const formatTime = (sec) => {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Merge several BufferGeometries (already transformed) into one. All inputs must share the same
 * attribute names. Handles indexed and non-indexed inputs.
 */
export function mergeGeometries(geoms) {
  if (!geoms.length) return new THREE.BufferGeometry();
  const names = Object.keys(geoms[0].attributes);
  const out = new THREE.BufferGeometry();
  let vertexCount = 0, indexCount = 0;
  for (const g of geoms) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  for (const name of names) {
    const itemSize = geoms[0].attributes[name].itemSize;
    const arr = new Float32Array(vertexCount * itemSize);
    let off = 0;
    for (const g of geoms) {
      const a = g.attributes[name];
      if (!a) throw new Error('mergeGeometries: missing attribute ' + name);
      arr.set(a.array.subarray(0, a.count * itemSize), off);
      off += a.count * itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  const IndexArr = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArr(indexCount);
  let io = 0, vo = 0;
  for (const g of geoms) {
    const n = g.attributes.position.count;
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < g.index.count; i++) index[io++] = src[i] + vo;
    } else {
      for (let i = 0; i < n; i++) index[io++] = i + vo;
    }
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Ensure a geometry has the standard attribute set (position/normal/uv) for merging. */
export function normalizeGeometry(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  }
  return g;
}

/** Simple timed task runner that respects game pause (updated from the simulation loop). */
export class TaskRunner {
  constructor() { this.tasks = []; }
  /** Run fn after `delay` seconds of simulation time. */
  after(delay, fn) { return this.run({ dur: delay, end: fn }); }
  /** Run update(t01, dt, elapsed) each frame for `dur` seconds, then end(). */
  run(task) {
    task.elapsed = 0;
    task.done = false;
    this.tasks.push(task);
    return task;
  }
  cancel(task) { if (task) task.done = true; }
  clear() { this.tasks.length = 0; }
  update(dt) {
    for (let i = 0; i < this.tasks.length; i++) {
      const t = this.tasks[i];
      if (t.done) continue;
      t.elapsed += dt;
      const k = t.dur > 0 ? Math.min(1, t.elapsed / t.dur) : 1;
      try {
        if (t.update) t.update(k, dt, t.elapsed);
        if (k >= 1 && !t.done) {
          t.done = true;
          if (t.end) t.end();
        }
      } catch (err) {
        t.done = true;
        console.error('[TaskRunner] task failed', err);
      }
    }
    if (this.tasks.length > 64 || this.tasks.some((t) => t.done)) this.tasks = this.tasks.filter((t) => !t.done);
  }
}
