/**
 * Anime hair lock geometry: a tapered, flattened tube swept along a cubic Bézier curve, with
 * vertex colours blending from root to tip (used for silver-black / burgundy highlights).
 */
import * as THREE from '../three.js';

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _side = new THREE.Vector3(), _nrm = new THREE.Vector3();

function bezier(out, p0, p1, p2, p3, t) {
  const it = 1 - t;
  const a = it * it * it, b = 3 * it * it * t, c = 3 * it * t * t, d = t * t * t;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}
function bezierTangent(out, p0, p1, p2, p3, t) {
  const it = 1 - t;
  const a = -3 * it * it, b = 3 * it * it - 6 * it * t, c = 6 * it * t - 3 * t * t, d = 3 * t * t;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  ).normalize();
}

/**
 * pts: [p0, p1, p2, p3] Vector3 control points (root -> tip)
 * o.width / o.thick: cross-section half sizes at the widest point
 * o.up: reference vector for the flat orientation (usually outward from the head)
 * o.root / o.tip: colours
 * o.shape: taper exponent; o.segs / o.radial
 */
export function makeLock(pts, o = {}) {
  const segs = o.segs ?? 10, radial = o.radial ?? 6;
  const width = o.width ?? 0.03, thick = o.thick ?? 0.012;
  const up = (o.up ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  const cRoot = new THREE.Color(o.root ?? 0x111111), cTip = new THREE.Color(o.tip ?? o.root ?? 0x111111);
  const cMid = o.mid !== undefined ? new THREE.Color(o.mid) : null;
  const [p0, p1, p2, p3] = pts;
  const pos = [], col = [], idx = [];
  const tmpC = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    bezier(_p, p0, p1, p2, p3, t);
    bezierTangent(_t, p0, p1, p2, p3, Math.min(0.999, Math.max(0.001, t)));
    _side.crossVectors(_t, up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();
    _nrm.crossVectors(_side, _t).normalize();
    // taper: thin at root, full by ~20%, sharp tip
    const rise = 0.55 + 0.45 * Math.sin(Math.min(1, t / 0.25) * Math.PI * 0.5);
    const w = width * rise * Math.pow(1 - t, o.shape ?? 0.85);
    const th = thick * Math.pow(1 - t, 0.6);
    if (cMid) {
      if (t < 0.5) tmpC.copy(cRoot).lerp(cMid, t * 2);
      else tmpC.copy(cMid).lerp(cTip, (t - 0.5) * 2);
    } else tmpC.copy(cRoot).lerp(cTip, Math.pow(t, o.tipBias ?? 1.4));
    for (let r = 0; r < radial; r++) {
      const a = (r / radial) * Math.PI * 2;
      const cx = Math.cos(a) * w, cy = Math.sin(a) * th;
      pos.push(_p.x + _side.x * cx + _nrm.x * cy, _p.y + _side.y * cx + _nrm.y * cy, _p.z + _side.z * cx + _nrm.z * cy);
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let r = 0; r < radial; r++) {
      const a = i * radial + r, b = i * radial + ((r + 1) % radial);
      const c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  // cap the root
  const rootC = pos.length / 3;
  bezier(_p, p0, p1, p2, p3, 0);
  pos.push(_p.x, _p.y, _p.z);
  col.push(cRoot.r, cRoot.g, cRoot.b);
  for (let r = 0; r < radial; r++) idx.push(rootC, r, (r + 1) % radial);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge geometries that have position/normal/color attributes. */
export function mergeLocks(geoms) {
  let vc = 0, ic = 0;
  for (const g of geoms) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo;
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Generate the lock list for a hairstyle around a head of radius r (head centre at origin).
 * Returns { front: [geo], back: [geo], cap: {color} } where back locks get secondary motion.
 */
export function buildHairstyle(style, r, colors) {
  const front = [], back = [], side = [];
  const root = colors.root, tip = colors.tip, mid = colors.mid;
  const L = (pts, o, list = front) => list.push(makeLock(pts, { root, tip, mid, ...o }));

  if (style === 'lucien') {
    // Layered, slightly messy medium-length hair; long bangs sweeping across one eye.
    const bangs = [
      [-0.75, 0.95, 0.032], [-0.4, 1.05, 0.034], [-0.05, 1.12, 0.036], [0.3, 1.05, 0.032], [0.62, 0.92, 0.03], [0.15, 1.0, 0.03],
      [-0.25, 0.85, 0.026], [0.45, 0.8, 0.026], [-0.55, 0.75, 0.024],
    ];
    for (const [a, len, w] of bangs) {
      const sx = Math.sin(a) * r * 0.75, sz = Math.cos(a) * r * 0.75;
      L([V(sx * 0.6, r * 0.95, sz * 0.4), V(sx * 1.1, r * 1.05, sz * 1.2), V(sx * 1.05 + r * 0.25 * Math.sign(a + 0.2), r * 0.35, sz * 1.25 + 0.02), V(sx * 0.9 + r * 0.3, -r * 0.25 * len, sz * 1.15 + 0.01)],
        { width: w, thick: 0.012, up: V(sx, 0.4, sz) });
    }
    // side locks framing the face
    for (const s of [-1, 1]) {
      L([V(s * r * 0.75, r * 0.7, r * 0.3), V(s * r * 1.08, r * 0.4, r * 0.45), V(s * r * 1.05, -r * 0.4, r * 0.45), V(s * r * 0.9, -r * 1.05, r * 0.35)], { width: 0.03, thick: 0.012, up: V(s, 0, 0.3) });
      L([V(s * r * 0.85, r * 0.5, -r * 0.1), V(s * r * 1.15, r * 0.2, 0), V(s * r * 1.15, -r * 0.4, 0), V(s * r * 1.0, -r * 0.85, -r * 0.1)], { width: 0.035, thick: 0.013, up: V(s, 0, 0) });
    }
    // crown spikes / back layers
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * 0.35 + (i / 10) * Math.PI * 1.3;
      const sx = Math.sin(a), sz = Math.cos(a);
      const len = 0.9 + (i % 3) * 0.25;
      L([V(sx * r * 0.5, r * 0.95, sz * r * 0.5), V(sx * r * 1.15, r * 0.9, sz * r * 1.15), V(sx * r * 1.25, r * 0.1, sz * r * 1.25), V(sx * r * 1.1, -r * len, sz * r * 1.15)],
        { width: 0.045, thick: 0.016, up: V(sx, 0.3, sz) }, back);
    }
    // nape tail (short ponytail tied low — distinctive silhouette)
    L([V(0, -r * 0.4, -r * 0.9), V(0, -r * 0.9, -r * 1.2), V(0.02, -r * 2.2, -r * 1.3), V(0.04, -r * 3.4, -r * 1.05)], { width: 0.03, thick: 0.02, up: V(0, 0, -1) }, back);
  } else if (style === 'seraphina') {
    // Hime cut: straight blunt bangs, long side locks, waist-length hair.
    for (let i = 0; i < 9; i++) {
      const a = -0.85 + (i / 8) * 1.7;
      const sx = Math.sin(a) * r, sz = Math.cos(a) * r;
      L([V(sx * 0.5, r * 0.98, sz * 0.4), V(sx * 1.0, r * 1.02, sz * 1.15), V(sx * 1.05, r * 0.55, sz * 1.18), V(sx * 1.0, r * 0.12 - Math.abs(a) * 0.01, sz * 1.13)],
        { width: 0.026, thick: 0.01, up: V(sx, 0.3, sz), shape: 0.35 });
    }
    for (const s of [-1, 1]) {
      // hime side locks (straight, chin length)
      for (let k = 0; k < 2; k++) {
        L([V(s * r * 0.8, r * 0.6, r * (0.35 - k * 0.2)), V(s * r * 1.08, r * 0.3, r * (0.45 - k * 0.2)), V(s * r * 1.08, -r * 0.6, r * (0.42 - k * 0.2)), V(s * r * 1.02, -r * (1.4 + k * 0.2), r * (0.35 - k * 0.2))],
          { width: 0.03, thick: 0.01, up: V(s, 0, 0.2), shape: 0.35 }, side);
      }
    }
    // long flowing back hair
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.42 + (i / 13) * Math.PI * 1.16;
      const sx = Math.sin(a), sz = Math.cos(a);
      const len = 5.6 + Math.sin(i * 1.7) * 0.5;
      L([V(sx * r * 0.6, r * 0.95, sz * r * 0.6), V(sx * r * 1.18, r * 0.75, sz * r * 1.18), V(sx * r * 1.35, -r * 2.2, sz * r * 1.3 - r * 0.2), V(sx * r * 1.15, -r * len, sz * r * 1.1 - r * 0.45)],
        { width: 0.05, thick: 0.018, up: V(sx, 0, sz), segs: 14, shape: 0.6 }, back);
    }
  } else if (style === 'kairo') {
    // Spiky, wind-swept hair with a white streak lock.
    for (let i = 0; i < 7; i++) {
      const a = -0.8 + (i / 6) * 1.6;
      const sx = Math.sin(a) * r, sz = Math.cos(a) * r;
      const streak = i === 2;
      front.push(makeLock([V(sx * 0.5, r * 0.98, sz * 0.4), V(sx * 1.05, r * 1.15, sz * 1.25), V(sx * 1.25 + 0.01, r * 0.45, sz * 1.3), V(sx * 1.3, -r * 0.05, sz * 1.25)],
        { width: 0.032, thick: 0.012, up: V(sx, 0.4, sz), root: streak ? 0xe8eaf0 : root, tip: streak ? 0xffffff : tip, mid: streak ? 0xf0f2f8 : mid }));
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * 0.25 + (i / 11) * Math.PI * 1.5;
      const sx = Math.sin(a), sz = Math.cos(a);
      const up = 0.6 + (i % 2) * 0.5;
      L([V(sx * r * 0.5, r * 0.95, sz * r * 0.5), V(sx * r * 1.1, r * (0.95 + up * 0.25), sz * r * 1.1), V(sx * r * 1.3, r * (0.55 + up * 0.15), sz * r * 1.3), V(sx * r * 1.42, r * (0.05 + up * 0.2), sz * r * 1.42)],
        { width: 0.045, thick: 0.018, up: V(sx, 0.5, sz), shape: 1.1 }, back);
    }
    for (const s of [-1, 1]) L([V(s * r * 0.8, r * 0.6, r * 0.2), V(s * r * 1.1, r * 0.3, r * 0.3), V(s * r * 1.12, -r * 0.3, r * 0.3), V(s * r * 1.0, -r * 0.75, r * 0.2)], { width: 0.03, thick: 0.012, up: V(s, 0, 0.2) });
  } else if (style === 'countess') {
    // Long, flowing silver-white hair under the veil.
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.48 + (i / 15) * Math.PI * 1.04;
      const sx = Math.sin(a), sz = Math.cos(a);
      L([V(sx * r * 0.6, r * 0.9, sz * r * 0.6), V(sx * r * 1.25, r * 0.6, sz * r * 1.25), V(sx * r * 1.6, -r * 3, sz * r * 1.4), V(sx * r * 1.4, -r * 7, sz * r * 1.2 - r * 0.5)],
        { width: 0.055, thick: 0.02, up: V(sx, 0, sz), segs: 14, shape: 0.6 }, back);
    }
  } else if (style === 'short') {
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + (i / 8) * 2.4;
      const sx = Math.sin(a), sz = Math.cos(a);
      L([V(sx * r * 0.5, r * 0.95, sz * r * 0.45), V(sx * r * 1.1, r * 0.95, sz * r * 1.15), V(sx * r * 1.1, r * 0.55, sz * r * 1.15), V(sx * r * 1.02, r * 0.3, sz * r * 1.08)], { width: 0.04, thick: 0.014, up: V(sx, 0.3, sz) });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.55 + (i / 7) * Math.PI * 0.9;
      const sx = Math.sin(a), sz = Math.cos(a);
      L([V(sx * r * 0.5, r * 0.95, sz * r * 0.5), V(sx * r * 1.15, r * 0.8, sz * r * 1.15), V(sx * r * 1.1, -r * 0.2, sz * r * 1.1), V(sx * r * 0.95, -r * 0.6, sz * r * 0.95)], { width: 0.05, thick: 0.016, up: V(sx, 0, sz) }, back);
    }
  } else if (style === 'bun') {
    for (let i = 0; i < 10; i++) {
      const a = -1.1 + (i / 9) * 2.2;
      const sx = Math.sin(a), sz = Math.cos(a);
      L([V(sx * r * 0.3, r * 1.0, sz * r * 0.6), V(sx * r * 1.0, r * 1.0, sz * r * 1.05), V(sx * r * 1.1, r * 0.4, sz * r * 0.5), V(sx * r * 0.6, r * 0.5, -r * 0.9)], { width: 0.045, thick: 0.012, up: V(sx, 0.4, sz), shape: 0.3 });
    }
  }
  return { front, back, side };
}
