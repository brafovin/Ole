/**
 * Procedural prop library. Each function builds geometry into the BuildContext: static parts are
 * baked into merged meshes, colliders are registered, and light anchors / flames are added.
 * Functions return any dynamic objects (doors, gates, pickups) the caller needs to animate.
 */
import * as THREE from '../three.js';
import { boxGeo, cylGeo, roofGeo } from './builders.js';
import { glowMat } from '../gfx/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const G = (x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
};

// ------------------------------------------------------------------ gothic interior
export function column(ctx, x, z, r = 0.55, h = 12, opts = {}) {
  const m = ctx.mats.stone;
  const g = G(x, 0, z);
  g.add(ctx.M(boxGeo(r * 2.6, 0.6, r * 2.6, 1.5), m, 0, 0.3, 0));
  g.add(ctx.M(cylGeo(r * 1.1, r * 1.25, 0.4, 12), m, 0, 0.8, 0));
  const shaftH = opts.broken ? h * opts.broken : h - 1.6;
  // clustered shaft: core + 4 engaged colonnettes
  g.add(ctx.M(cylGeo(r, r, shaftH, 14, 2), m, 0, 1 + shaftH / 2, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(ctx.M(cylGeo(r * 0.32, r * 0.32, shaftH, 8, 2), m, Math.cos(a) * r * 0.95, 1 + shaftH / 2, Math.sin(a) * r * 0.95));
  }
  if (!opts.broken) {
    g.add(ctx.M(cylGeo(r * 1.5, r, 0.6, 12), m, 0, h - 0.3, 0));
    g.add(ctx.M(boxGeo(r * 3, 0.3, r * 3, 1.5), m, 0, h + 0.15, 0));
  } else {
    // jagged top + rubble
    g.add(ctx.M(new THREE.DodecahedronGeometry(r * 0.9, 0), m, 0.2, 1 + shaftH + 0.1, 0.1, 0.3, 0.5, 0.2, 1, 0.6, 1));
    for (let i = 0; i < 4; i++) g.add(ctx.M(new THREE.DodecahedronGeometry(ctx.r(0.2, 0.45), 0), m, ctx.r(-1.6, 1.6), 0.2, ctx.r(-1.6, 1.6), ctx.r(0, 3), ctx.r(0, 3), 0));
  }
  ctx.bake(g);
  ctx.col.addCircle(x, z, r * 1.25, { height: opts.broken ? 1 + shaftH : 50 });
}

export function pew(ctx, x, z, ry = 0, broken = 0) {
  const m = ctx.mats.darkwood;
  const g = G(x, 0, z, ry);
  const w = 3.4;
  if (broken === 2) {
    // toppled backwards
    g.rotation.z = 0;
    g.add(ctx.M(boxGeo(w, 0.08, 0.9), m, 0, 0.45, -0.3, -1.3, 0, 0));
    g.add(ctx.M(boxGeo(w, 0.5, 0.06), m, 0, 0.12, 0.25, 0, 0, 0));
  } else {
    g.add(ctx.M(boxGeo(w, 0.08, 0.5), m, 0, 0.48, 0));
    g.add(ctx.M(boxGeo(w, 0.6, 0.06), m, 0, 0.82, -0.24, -0.1, 0, 0));
    for (const s of [-1, 1]) {
      g.add(ctx.M(boxGeo(0.08, 1.15, 0.6), m, s * w / 2, 0.57, -0.02));
      g.add(ctx.M(new THREE.SphereGeometry(0.07, 6, 4), m, s * w / 2, 1.18, -0.24));
    }
    if (broken === 1) {
      g.children[0].rotation.z = 0.25;
      g.children[0].position.y = 0.35;
    }
  }
  ctx.bake(g);
  ctx.colliderLocal(g, 0, -0.05, w / 2 + 0.05, 0.35, 0, { height: 0.95, camera: false });
}

export function candles(ctx, x, y, z, n = 5, spread = 0.35, light = false) {
  const g = G(x, y, z);
  for (let i = 0; i < n; i++) {
    const h = ctx.r(0.12, 0.45), r = ctx.r(0.03, 0.055);
    const px = ctx.r(-spread, spread), pz = ctx.r(-spread, spread);
    const c = ctx.M(cylGeo(r, r * 1.05, h, 8, 1), ctx.mats.wax, px, h / 2, pz);
    c.castShadow = false;
    g.add(c);
    ctx.flame(V(x + px, y + h + 0.06, z + pz), 0.16 + r);
  }
  ctx.bake(g);
  if (light) ctx.light(V(x, y + 0.7, z), 0xff9a48, 2.2, 7, 0.8);
}

export function candelabra(ctx, x, z, h = 2.0, opts = {}) {
  const iron = ctx.mats.iron;
  const g = G(x, 0, z);
  g.add(ctx.M(cylGeo(0.3, 0.38, 0.12, 10), iron, 0, 0.06, 0));
  g.add(ctx.M(cylGeo(0.04, 0.05, h, 8), iron, 0, h / 2, 0));
  const arms = opts.arms ?? 5;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const r = i === 0 && arms % 2 ? 0 : 0.35;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r, py = h + (r ? 0 : 0.15);
    if (r) g.add(ctx.M(boxGeo(0.35, 0.03, 0.03), iron, px / 2, h - 0.05, pz / 2, 0, -a, 0));
    g.add(ctx.M(cylGeo(0.06, 0.03, 0.06, 8), iron, px, py, pz));
    const ch = ctx.r(0.2, 0.35);
    const c = ctx.M(cylGeo(0.03, 0.03, ch, 8), ctx.mats.wax, px, py + ch / 2 + 0.03, pz);
    c.castShadow = false;
    g.add(c);
    ctx.flame(V(x + px, py + ch + 0.09, z + pz), 0.2, 0xff9a40, opts.group);
  }
  ctx.bake(g);
  ctx.col.addCircle(x, z, 0.3, { height: h, camera: false });
  return ctx.light(V(x, h + 0.5, z), opts.color ?? 0xff9040, opts.intensity ?? 5.5, opts.distance ?? 13, 0.7);
}

export function stainedWindow(ctx, x, y, z, ry, w = 2.2, h = 5, variant = 0) {
  const g = G(x, y, z, ry);
  const glass = ctx.M(new THREE.PlaneGeometry(w, h), ctx.mats.glass[variant % ctx.mats.glass.length], 0, 0, 0);
  glass.castShadow = false;
  glass.receiveShadow = false;
  g.add(glass);
  const s = ctx.mats.stone;
  g.add(ctx.M(boxGeo(0.25, h, 0.3, 1), s, -w / 2 - 0.12, 0, 0.05));
  g.add(ctx.M(boxGeo(0.25, h, 0.3, 1), s, w / 2 + 0.12, 0, 0.05));
  g.add(ctx.M(boxGeo(w + 0.5, 0.3, 0.4, 1), s, 0, -h / 2 - 0.15, 0.1));
  ctx.bake(g);
  return glass;
}

export function statue(ctx, x, z, ry = 0, opts = {}) {
  const m = ctx.mats.statue;
  const g = G(x, 0, z, ry);
  g.add(ctx.M(boxGeo(1.2, 1.0, 1.2, 1), ctx.mats.stone, 0, 0.5, 0));
  const robe = new THREE.LatheGeometry([[0.01, 0], [0.42, 0], [0.38, 0.5], [0.28, 1.2], [0.24, 1.55], [0.18, 1.7], [0.01, 1.75]].map(([a, b]) => new THREE.Vector2(a, b)), 14);
  g.add(ctx.M(robe, m, 0, 1, 0));
  if (!opts.headless) g.add(ctx.M(new THREE.SphereGeometry(0.17, 12, 10), m, 0, 2.92, 0.02));
  // praying hands / arms
  g.add(ctx.M(boxGeo(0.12, 0.45, 0.14, 1), m, 0, 2.15, 0.25, -0.5, 0, 0));
  if (opts.wings) {
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 4, 1), m);
      wing.position.set(s * 0.45, 2.4, -0.3);
      wing.rotation.set(0.3, 0, s * -0.5);
      wing.scale.set(1, 1, 0.15);
      wing.castShadow = true;
      g.add(wing);
    }
  }
  if (opts.bleeding) {
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.01), ctx.mats.blood);
    tear.position.set(0.05, 2.75, 0.17);
    g.add(tear);
  }
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 0.65, 0.65, 0, { height: 3 });
}

export function chandelier(ctx, x, y, z, r = 1.4) {
  const iron = ctx.mats.iron;
  const g = G(x, y, z);
  const ring = ctx.M(new THREE.TorusGeometry(r, 0.05, 6, 24), iron, 0, 0, 0, Math.PI / 2, 0, 0);
  g.add(ring);
  g.add(ctx.M(cylGeo(0.02, 0.02, 6, 4), iron, 0, 3, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const c = ctx.M(cylGeo(0.03, 0.03, 0.22, 6), ctx.mats.wax, Math.cos(a) * r, 0.12, Math.sin(a) * r);
    c.castShadow = false;
    g.add(c);
    ctx.flame(V(x + Math.cos(a) * r, y + 0.3, z + Math.sin(a) * r), 0.17);
  }
  ctx.bake(g);
  return ctx.light(V(x, y - 0.5, z), 0xff9a50, 5, 16, 0.5);
}

export function altarTable(ctx, x, z, w = 3.2, d = 1.4) {
  const g = G(x, 0, z);
  g.add(ctx.M(boxGeo(w + 1.6, 0.25, d + 2.2, 1.5), ctx.mats.marble, 0, 0.125, 0));
  g.add(ctx.M(boxGeo(w, 1.0, d, 1), ctx.mats.marble, 0, 0.75, 0));
  g.add(ctx.M(boxGeo(w + 0.3, 0.12, d + 0.3, 1), ctx.mats.marble, 0, 1.31, 0));
  // altar cloth
  const cloth = ctx.M(boxGeo(w * 0.6, 0.02, d + 0.36, 1), ctx.mats.cloth, 0, 1.38, 0);
  cloth.castShadow = false;
  g.add(cloth);
  g.add(ctx.M(new THREE.PlaneGeometry(w * 0.6, 0.8), ctx.mats.cloth, 0, 1.0, d / 2 + 0.19));
  ctx.bake(g);
  ctx.col.addBox(x, z, w / 2 + 0.15, d / 2 + 0.15, 0, { height: 1.4, camera: false });
}

export function confessional(ctx, x, z, ry) {
  const m = ctx.mats.darkwood;
  const g = G(x, 0, z, ry);
  g.add(ctx.M(boxGeo(2.6, 2.6, 1.2, 1.5), m, 0, 1.3, 0));
  g.add(ctx.M(roofGeo(2.8, 1.4, 0.6, 1.5), m, 0, 2.6, 0));
  for (const s of [-1, 1]) {
    const c = ctx.M(new THREE.PlaneGeometry(0.7, 1.7), ctx.mats.cloth, s * 0.75, 1.15, 0.61);
    c.castShadow = false;
    g.add(c);
  }
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 1.3, 0.6, 0, { height: 3 });
}

export function coffin(ctx, x, z, ry, open = false) {
  const m = ctx.mats.darkwood;
  const g = G(x, 0, z, ry);
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, -1);
  shape.lineTo(0.3, -1);
  shape.lineTo(0.42, 0.45);
  shape.lineTo(0.28, 1);
  shape.lineTo(-0.28, 1);
  shape.lineTo(-0.42, 0.45);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  g.add(ctx.M(geo, m, 0, 0, 0));
  if (open) {
    const lid = ctx.M(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }).rotateX(-Math.PI / 2), m, 0.6, 0.1, 0.2, 0, 0.4, 0.3);
    g.add(lid);
    g.add(ctx.M(new THREE.PlaneGeometry(0.6, 1.6).rotateX(-Math.PI / 2), ctx.mats.blood, 0, 0.45, 0));
  }
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 0.45, 1.0, 0, { height: 0.6, camera: false });
}

// ------------------------------------------------------------------ doors & gates (dynamic)
/** Double door in an opening of width w centred at (x, z) facing ±Z. Returns { open(), opened, collider }. */
export function doubleDoor(ctx, x, z, w = 5, h = 5.5, ry = 0) {
  const root = G(x, 0, z, ry);
  const leaves = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * w / 2, 0, 0);
    const leaf = ctx.M(boxGeo(w / 2, h, 0.22, 1.5), ctx.mats.darkwood, -s * w / 4, h / 2, 0);
    hinge.add(leaf);
    // iron straps
    for (const yy of [0.9, h / 2, h - 0.9]) hinge.add(ctx.M(boxGeo(w / 2 - 0.1, 0.12, 0.26, 1), ctx.mats.iron, -s * w / 4, yy, 0));
    hinge.add(ctx.M(new THREE.TorusGeometry(0.16, 0.03, 6, 12), ctx.mats.iron, -s * (w / 2 - 0.4), h / 2, 0.15));
    root.add(hinge);
    leaves.push({ hinge, s });
  }
  ctx.add(root);
  root.updateMatrixWorld(true);
  const collider = ctx.colliderLocal(root, 0, 0, w / 2, 0.2, 0, { height: h });
  const state = {
    root, opened: false, collider,
    open(instant = false) {
      if (state.opened) return;
      state.opened = true;
      collider.enabled = false;
      if (instant) for (const l of leaves) l.hinge.rotation.y = l.s * 1.6;
      else state.anim = 0;
    },
    close() {
      state.opened = false;
      collider.enabled = true;
      for (const l of leaves) l.hinge.rotation.y = 0;
      state.anim = null;
    },
    update(dt) {
      if (state.anim === null || state.anim === undefined) return;
      state.anim = Math.min(1, state.anim + dt / 1.8);
      const k = 1 - Math.pow(1 - state.anim, 3);
      for (const l of leaves) l.hinge.rotation.y = l.s * 1.6 * k;
      if (state.anim >= 1) state.anim = null;
    },
  };
  return state;
}

/** Iron portcullis gate that rises. */
export function portcullis(ctx, x, z, w = 6, h = 5.5, ry = 0) {
  const root = G(x, 0, z, ry);
  const bars = new THREE.Group();
  const iron = ctx.mats.iron;
  for (let i = 0; i <= Math.round(w / 0.5); i++) bars.add(ctx.M(cylGeo(0.05, 0.05, h, 6), iron, -w / 2 + i * 0.5, h / 2, 0));
  for (const yy of [0.6, h / 2, h - 0.4]) bars.add(ctx.M(boxGeo(w, 0.12, 0.12, 1), iron, 0, yy, 0));
  for (let i = 0; i <= Math.round(w / 0.5); i++) bars.add(ctx.M(new THREE.ConeGeometry(0.08, 0.3, 4), iron, -w / 2 + i * 0.5, -0.05, 0, Math.PI, 0, 0));
  root.add(bars);
  ctx.add(root);
  const collider = ctx.colliderLocal(root, 0, 0, w / 2, 0.25, 0, { height: h });
  const state = {
    root, opened: false, collider,
    open(instant = false) {
      if (state.opened) return;
      state.opened = true;
      collider.enabled = false;
      if (instant) bars.position.y = h - 0.6;
      else state.anim = 0;
    },
    close() {
      state.opened = false;
      collider.enabled = true;
      bars.position.y = 0;
      state.anim = null;
    },
    update(dt) {
      if (state.anim === null || state.anim === undefined) return;
      state.anim = Math.min(1, state.anim + dt / 2.5);
      bars.position.y = (h - 0.6) * (1 - Math.pow(1 - state.anim, 2));
      if (state.anim >= 1) state.anim = null;
    },
  };
  return state;
}

// ------------------------------------------------------------------ village
/**
 * Half-timbered house. Door faces local +Z (rotate with ry). Enterable houses get real walls
 * with a door gap and a roof; others are solid. Returns info with door world position.
 */
export function house(ctx, def) {
  const { x, z, w = 7, d = 7, h = 4.6, ry = 0, enterable = false, ruined = false, lit = false } = def;
  const g = G(x, 0, z, ry);
  const plaster = ctx.mats.plaster, wood = ctx.mats.darkwood, stone = ctx.mats.stone;
  const t = 0.3;
  const doorW = 1.6, doorH = 2.5;
  const walls = [
    // [cx, cz, len, alongX]
    [0, -d / 2, w, true], // back
    [-w / 2, 0, d, false], [w / 2, 0, d, false],
  ];
  const addWall = (cx, cz, len, alongX, hh = h) => {
    const gw = alongX ? len : t, gd = alongX ? t : len;
    g.add(ctx.M(boxGeo(gw + 0.02, 0.9, gd + 0.02, 2), stone, cx, 0.45, cz));
    g.add(ctx.M(boxGeo(gw, hh - 0.9, gd, 2.5), plaster, cx, 0.9 + (hh - 0.9) / 2, cz));
    // timber frame on the outside face
    const off = alongX ? (cz < 0 ? -t / 2 - 0.03 : t / 2 + 0.03) : (cx < 0 ? -t / 2 - 0.03 : t / 2 + 0.03);
    const bx = (v) => (alongX ? [cx + v, cz + off] : [cx + off, cz + v]);
    const beam = (along, y, size, len2, rz = 0) => {
      const [px, pz] = bx(along);
      const bw = alongX ? len2 : 0.12, bd = alongX ? 0.12 : len2;
      const m = ctx.M(boxGeo(bw, size, bd, 1), wood, px, y, pz);
      if (rz) { if (alongX) m.rotation.z = rz; else m.rotation.x = rz; }
      g.add(m);
    };
    beam(0, 0.95, 0.16, len);
    beam(0, hh * 0.58, 0.14, len);
    beam(0, hh - 0.08, 0.16, len);
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const a = -len / 2 + (i / n) * len;
      beam(a, 0.9 + (hh - 0.9) / 2, hh - 0.9, 0.16);
      if (i < n && i % 2 === 0) {
        const bl = Math.hypot(len / n, hh * 0.58 - 0.95);
        beam(a + len / n / 2, (0.95 + hh * 0.58) / 2, bl, 0.12, Math.atan2(hh * 0.58 - 0.95, len / n) * (alongX ? 1 : -1));
      }
    }
  };
  for (const [cx, cz, len, ax] of walls) addWall(cx, cz, len, ax, ruined && cx > 0 ? h * 0.55 : h);
  // front wall with door gap
  const side = (w - doorW) / 2;
  addWall(-w / 2 + side / 2, d / 2, side, true);
  addWall(w / 2 - side / 2, d / 2, side, true);
  g.add(ctx.M(boxGeo(doorW + 0.02, h - doorH, t, 2), plaster, 0, doorH + (h - doorH) / 2, d / 2));
  g.add(ctx.M(boxGeo(doorW + 0.3, 0.2, t + 0.1, 1), wood, 0, doorH + 0.1, d / 2));
  // windows
  const winMat = lit ? ctx.mats.windowLit : ctx.mats.windowDark;
  for (const s of [-1, 1]) {
    const wx = s * (doorW / 2 + side / 2);
    const win = ctx.M(new THREE.PlaneGeometry(0.9, 1.1), winMat, wx, 2.2, d / 2 + t / 2 + 0.02);
    win.castShadow = false;
    g.add(win);
    g.add(ctx.M(boxGeo(1.1, 0.1, 0.2, 1), wood, wx, 1.6, d / 2 + t / 2 + 0.05));
    g.add(ctx.M(boxGeo(0.08, 1.1, 0.14, 1), wood, wx, 2.2, d / 2 + t / 2 + 0.05));
    // side windows
    const sw = ctx.M(new THREE.PlaneGeometry(0.9, 1.1), ctx.mats.windowDark, s * (w / 2 + t / 2 + 0.02), 2.3, 0, 0, s * Math.PI / 2, 0);
    sw.castShadow = false;
    g.add(sw);
  }
  // roof
  if (!ruined) {
    const roof = ctx.M(roofGeo(w + 0.8, d + 1.0, 2.6, 2), ctx.mats.roof, 0, h, 0);
    roof.material = ctx.mats.roof;
    g.add(roof);
    // roof underside (ceiling) so interiors are dark
    g.add(ctx.M(boxGeo(w, 0.1, d, 2), wood, 0, h - 0.05, 0));
    g.add(ctx.M(boxGeo(0.8, 2.2, 0.8, 1), ctx.mats.stone, w * 0.25, h + 1.6, -d * 0.15));
  } else {
    // collapsed roof beams
    for (let i = 0; i < 5; i++) g.add(ctx.M(boxGeo(0.18, 0.18, d * 0.9, 1), wood, -w / 2 + 0.8 + i * (w - 1.6) / 4, h * 0.45 + ctx.r(-0.6, 0.6), 0, ctx.r(-0.4, 0.4), 0, ctx.r(-0.5, 0.5)));
    g.add(ctx.M(roofGeo(w * 0.5, d + 1, 1.6, 2), ctx.mats.roof, -w * 0.25, h * 0.75, 0, 0, 0, 0.45));
  }
  // closed door (enterable houses get dynamic doors from the caller)
  if (!enterable) g.add(ctx.M(boxGeo(doorW, doorH, 0.1, 1), wood, 0, doorH / 2, d / 2 + 0.05));
  else g.add(ctx.M(boxGeo(w - t * 2, 0.06, d - t * 2, 2), ctx.mats.wood, 0, 0.03, 0));
  // step
  g.add(ctx.M(boxGeo(doorW + 0.6, 0.18, 0.7, 1), stone, 0, 0.09, d / 2 + 0.45));
  ctx.bake(g);
  // colliders
  if (enterable || ruined) {
    ctx.colliderLocal(g, 0, -d / 2, w / 2, t / 2, 0);
    ctx.colliderLocal(g, -w / 2, 0, t / 2, d / 2, 0);
    ctx.colliderLocal(g, w / 2, 0, t / 2, d / 2, 0, { height: ruined ? h * 0.55 : 50 });
    ctx.colliderLocal(g, -w / 2 + side / 2, d / 2, side / 2, t / 2, 0);
    ctx.colliderLocal(g, w / 2 - side / 2, d / 2, side / 2, t / 2, 0);
  } else {
    ctx.colliderLocal(g, 0, 0, w / 2 + 0.05, d / 2 + 0.05, 0);
  }
  g.updateMatrixWorld(true);
  const doorPos = new THREE.Vector3(0, 0, d / 2 + 0.9).applyMatrix4(g.matrixWorld);
  const inside = new THREE.Vector3(0, 0, 0).applyMatrix4(g.matrixWorld);
  const local = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
  return { group: g, doorPos, inside, local, ry, w, d, h, doorW };
}

export function lamp(ctx, x, z, broken = false, dark = false) {
  const iron = ctx.mats.iron;
  const g = G(x, 0, z);
  g.add(ctx.M(cylGeo(0.07, 0.1, 3.4, 8), iron, 0, 1.7, 0));
  g.add(ctx.M(boxGeo(0.7, 0.06, 0.06, 1), iron, 0.3, 3.3, 0));
  const lantern = ctx.M(boxGeo(0.28, 0.4, 0.28, 1), iron, 0.6, 3.0, 0);
  g.add(lantern);
  g.add(ctx.M(new THREE.ConeGeometry(0.25, 0.22, 4), iron, 0.6, 3.3, 0, 0, Math.PI / 4, 0));
  ctx.bake(g);
  ctx.col.addCircle(x, z, 0.15, { height: 3.4, camera: false });
  if (!dark) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), glowMat(0xffa860, 0.9, false));
    glass.position.set(x + 0.6, 3.0, z);
    glass.userData.dynamic = true;
    ctx.root.add(glass);
    const a = ctx.light(V(x + 0.6, 2.9, z), 0xffa050, 3.2, 12, 0.3, broken);
    a.mesh = glass;
    return a;
  }
  return null;
}

export function barrel(ctx, x, z, ry = 0, tipped = false) {
  const g = G(x, 0, z, ry);
  const b = ctx.M(cylGeo(0.36, 0.32, 1.0, 12, 1.2), ctx.mats.wood, 0, tipped ? 0.36 : 0.5, 0, tipped ? Math.PI / 2 : 0, 0, 0);
  g.add(b);
  for (const yy of [-0.3, 0.3]) {
    const ring = ctx.M(new THREE.TorusGeometry(0.36, 0.025, 4, 16), ctx.mats.iron, 0, tipped ? 0.36 : 0.5 + yy, tipped ? yy : 0, tipped ? 0 : Math.PI / 2, 0, 0);
    g.add(ring);
  }
  ctx.bake(g);
  ctx.col.addCircle(x, z, 0.4, { height: 1.0, camera: false });
}

export function crate(ctx, x, z, s = 0.9, ry = 0, y = 0) {
  const g = G(x, y, z, ry);
  g.add(ctx.M(boxGeo(s, s, s, 1), ctx.mats.wood, 0, s / 2, 0));
  for (const zz of [-1, 1]) g.add(ctx.M(boxGeo(s * 1.25, 0.1, 0.04, 1), ctx.mats.darkwood, 0, s / 2, zz * s / 2, 0, 0, 0.78));
  ctx.bake(g);
  if (y < 0.5) ctx.col.addBox(x, z, s / 2, s / 2, ry, { height: y + s, camera: false });
}

export function fence(ctx, x0, z0, x1, z1, opts = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const g = G((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
  const iron = opts.wood ? ctx.mats.darkwood : ctx.mats.iron;
  const n = Math.max(2, Math.round(len / (opts.wood ? 0.6 : 0.35)));
  const h = opts.h ?? 1.8;
  for (let i = 0; i <= n; i++) {
    const zz = -len / 2 + (i / n) * len;
    if (opts.broken && ctx.rng() < 0.2) continue;
    const hh = h * (opts.broken ? ctx.r(0.6, 1) : 1);
    if (opts.wood) g.add(ctx.M(boxGeo(0.1, hh, 0.14, 1), iron, 0, hh / 2, zz, 0, 0, ctx.r(-0.05, 0.05)));
    else {
      g.add(ctx.M(cylGeo(0.025, 0.025, hh, 5), iron, 0, hh / 2, zz));
      g.add(ctx.M(new THREE.ConeGeometry(0.05, 0.16, 4), iron, 0, hh + 0.08, zz));
    }
  }
  for (const yy of [0.3, h * 0.85]) g.add(ctx.M(boxGeo(0.05, 0.06, len, 1), iron, 0, yy, 0));
  ctx.bake(g);
  ctx.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.1, len / 2, ry, { height: h, camera: false, projectiles: false });
}

export function gravestone(ctx, x, z, ry = 0, kind = 0) {
  const g = G(x, 0, z, ry);
  const s = ctx.mats.stone;
  const tilt = ctx.r(-0.15, 0.15);
  if (kind === 0) {
    g.add(ctx.M(boxGeo(0.7, 1.0, 0.18, 1), s, 0, 0.5, 0, tilt, 0, ctx.r(-0.1, 0.1)));
    g.add(ctx.M(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), s, 0, 1.0, 0, tilt, 0, 0));
  } else if (kind === 1) {
    g.add(ctx.M(boxGeo(0.14, 1.4, 0.14, 1), s, 0, 0.7, 0, tilt, 0, 0));
    g.add(ctx.M(boxGeo(0.7, 0.14, 0.14, 1), s, 0, 1.05, 0, tilt, 0, 0));
  } else {
    g.add(ctx.M(boxGeo(0.9, 0.6, 1.8, 1), s, 0, 0.3, 0));
    g.add(ctx.M(boxGeo(1.0, 0.1, 1.9, 1), s, 0, 0.62, 0));
  }
  ctx.bake(g);
  ctx.col.addBox(x, z, kind === 2 ? 0.45 : 0.36, kind === 2 ? 0.9 : 0.14, ry, { height: 1.2, camera: false });
}

export function well(ctx, x, z) {
  const g = G(x, 0, z);
  const s = ctx.mats.stone;
  g.add(ctx.M(cylGeo(1.2, 1.3, 1.0, 16, 2), s, 0, 0.5, 0));
  g.add(ctx.M(new THREE.CircleGeometry(1.0, 16).rotateX(-Math.PI / 2), ctx.mats.black, 0, 0.95, 0));
  for (const sx of [-1, 1]) g.add(ctx.M(boxGeo(0.15, 2.4, 0.15, 1), ctx.mats.darkwood, sx * 1.1, 1.2, 0));
  g.add(ctx.M(roofGeo(2.8, 1.8, 0.8, 1.5), ctx.mats.roof, 0, 2.4, 0, 0, Math.PI / 2, 0));
  g.add(ctx.M(cylGeo(0.12, 0.12, 2.2, 8), ctx.mats.darkwood, 0, 2.0, 0, 0, 0, Math.PI / 2));
  ctx.bake(g);
  ctx.col.addCircle(x, z, 1.35, { height: 1.0, camera: false });
}

export function cart(ctx, x, z, ry = 0) {
  const g = G(x, 0, z, ry);
  const w = ctx.mats.wood;
  g.add(ctx.M(boxGeo(1.8, 0.12, 3.0, 1), w, 0, 0.75, 0, 0, 0, 0.1));
  for (const s of [-1, 1]) g.add(ctx.M(boxGeo(0.1, 0.6, 3.0, 1), w, s * 0.9, 1.05, 0, 0, 0, 0.1));
  for (const s of [-1, 1]) {
    const wheel = ctx.M(new THREE.TorusGeometry(0.5, 0.06, 6, 14), ctx.mats.darkwood, s * 1.05, 0.5, 0.6, 0, Math.PI / 2, 0);
    g.add(wheel);
  }
  g.add(ctx.M(boxGeo(0.1, 0.1, 2.0, 1), w, 0, 0.4, -2.2, 0.35, 0, 0));
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 1.0, 1.6, 0, { height: 1.4, camera: false });
}

export function noticeBoard(ctx, x, z, ry) {
  const g = G(x, 0, z, ry);
  for (const s of [-1, 1]) g.add(ctx.M(boxGeo(0.15, 2.6, 0.15, 1), ctx.mats.darkwood, s * 0.9, 1.3, 0));
  g.add(ctx.M(boxGeo(2.0, 1.3, 0.08, 1), ctx.mats.wood, 0, 1.75, 0));
  g.add(ctx.M(roofGeo(2.4, 0.6, 0.4, 1), ctx.mats.roof, 0, 2.6, 0));
  for (let i = 0; i < 4; i++) g.add(ctx.M(new THREE.PlaneGeometry(0.42, 0.55), ctx.mats.paper, -0.6 + i * 0.4, 1.75 + ctx.r(-0.2, 0.2), 0.05, 0, 0, ctx.r(-0.15, 0.15)));
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 1.0, 0.15, 0, { height: 2.6, camera: false });
}

export function cage(ctx, x, z) {
  const root = G(x, 0, z);
  const iron = ctx.mats.iron;
  const r = 1.2, h = 2.6;
  const bars = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = ctx.M(cylGeo(0.035, 0.035, h, 5), iron, Math.cos(a) * r, h / 2, Math.sin(a) * r);
    root.add(b);
    bars.push(b);
  }
  root.add(ctx.M(new THREE.TorusGeometry(r, 0.05, 4, 20), iron, 0, h, 0, Math.PI / 2, 0, 0));
  root.add(ctx.M(new THREE.TorusGeometry(r, 0.05, 4, 20), iron, 0, 0.15, 0, Math.PI / 2, 0, 0));
  root.add(ctx.M(new THREE.ConeGeometry(r * 1.1, 0.8, 16, 1, true), iron, 0, h + 0.4, 0));
  ctx.add(root);
  const collider = ctx.col.addCircle(x, z, r + 0.1, { height: 3, camera: false });
  return {
    root, collider, opened: false,
    open() {
      this.opened = true;
      // swing the front bars away
      bars.forEach((b, i) => { if (i >= 2 && i <= 6) b.visible = false; });
      collider.enabled = false;
    },
    close() { this.opened = false; bars.forEach((b) => (b.visible = true)); collider.enabled = true; },
  };
}

export function smithy(ctx, x, z, ry) {
  const g = G(x, 0, z, ry);
  const w = ctx.mats.darkwood;
  for (const [px, pz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) g.add(ctx.M(boxGeo(0.3, 3.6, 0.3, 1), w, px, 1.8, pz));
  g.add(ctx.M(roofGeo(7, 6.4, 1.6, 2), ctx.mats.roof, 0, 3.6, 0));
  g.add(ctx.M(boxGeo(6.4, 3.6, 0.3, 2), ctx.mats.wall, 0, 1.8, -2.6));
  // forge
  g.add(ctx.M(boxGeo(1.8, 1.0, 1.4, 1), ctx.mats.stone, -1.6, 0.5, -1.6));
  g.add(ctx.M(boxGeo(0.8, 2.6, 0.8, 1), ctx.mats.stone, -1.6, 2.3, -1.9));
  const coals = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.8), glowMat(0xff4a10, 1, false));
  coals.position.set(-1.6, 1.05, -1.5);
  g.add(coals);
  // anvil
  g.add(ctx.M(boxGeo(0.5, 0.5, 0.4, 1), ctx.mats.iron, 1.0, 0.25, -0.4));
  g.add(ctx.M(boxGeo(0.9, 0.22, 0.3, 1), ctx.mats.iron, 1.0, 0.6, -0.4));
  ctx.bake(g);
  ctx.colliderLocal(g, 0, -2.6, 3.2, 0.2, 0);
  ctx.colliderLocal(g, -1.6, -1.6, 0.9, 0.7, 0, { height: 1.0 });
  ctx.colliderLocal(g, 1.0, -0.4, 0.45, 0.25, 0, { height: 0.7, camera: false });
  for (const [px, pz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) ctx.colliderLocal(g, px, pz, 0.2, 0.2, 0);
  g.updateMatrixWorld(true);
  const fp = new THREE.Vector3(-1.6, 1.4, -1.5).applyMatrix4(g.matrixWorld);
  ctx.light(fp, 0xff5a20, 4, 10, 0.9);
  return g;
}

// ------------------------------------------------------------------ forest
const treeCache = new Map();
/** A gnarled dead tree as merged geometry (cached by variant). */
export function treeGeometry(variant) {
  if (treeCache.has(variant)) return treeCache.get(variant);
  const rng = (() => { let s = variant * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const parts = [];
  const branch = (start, dir, len, rad, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.65, rad, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyQuaternion(q);
    g.translate(start.x, start.y, start.z);
    parts.push(g);
    if (depth <= 0 || rad < 0.035) return;
    const n = depth > 2 ? 2 + Math.floor(rng() * 2) : 2;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.5 - 0.05, rng() - 0.5).multiplyScalar(1.5)).normalize();
      branch(end, nd, len * (0.55 + rng() * 0.25), rad * 0.6, depth - 1);
    }
  };
  const h = 3 + rng() * 3;
  branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((rng() - 0.5) * 0.25, 1, (rng() - 0.5) * 0.25).normalize(), h, 0.32 + rng() * 0.12, 4);
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const g = new THREE.CylinderGeometry(0.03, 0.18, 1.3, 5, 1, true).translate(0, 0.65, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).normalize()));
    parts.push(g);
  }
  const ng = parts.map((p) => {
    const n = p.toNonIndexed();
    n.deleteAttribute('uv');
    const uv = new Float32Array(n.attributes.position.count * 2);
    for (let i = 0; i < n.attributes.position.count; i++) {
      uv[i * 2] = (Math.atan2(n.attributes.position.getZ(i), n.attributes.position.getX(i)) / Math.PI + 1) * 0.5;
      uv[i * 2 + 1] = n.attributes.position.getY(i) * 0.5;
    }
    n.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return n;
  });
  let count = 0;
  for (const g of ng) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  let o = 0;
  for (const g of ng) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uvs.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  treeCache.set(variant, out);
  return out;
}

export function rock(ctx, x, z, s = 1, collide = true) {
  const m = ctx.M(new THREE.DodecahedronGeometry(s, 0), ctx.mats.stone, x, s * 0.35, z, ctx.r(0, 3), ctx.r(0, 3), ctx.r(0, 3), 1, ctx.r(0.5, 0.8), ctx.r(0.8, 1.2));
  ctx.bake(m);
  if (collide) ctx.col.addCircle(x, z, s * 0.85, { height: s, camera: s > 1.5 });
}

export function log(ctx, x, z, ry, len = 4) {
  const m = ctx.M(cylGeo(0.35, 0.4, len, 8, 2), ctx.mats.bark, x, 0.35, z, 0, ry, Math.PI / 2);
  ctx.bake(m);
  ctx.col.addBox(x, z, len / 2, 0.4, ry, { height: 0.75, camera: false });
}

export function campfire(ctx, x, z) {
  const g = G(x, 0, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(ctx.M(new THREE.DodecahedronGeometry(0.22, 0), ctx.mats.stone, Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7));
  }
  for (let i = 0; i < 4; i++) g.add(ctx.M(cylGeo(0.06, 0.08, 1.1, 5), ctx.mats.bark, 0, 0.2, 0, 0.3, (i / 4) * Math.PI, Math.PI / 2 - 0.4));
  ctx.bake(g);
  ctx.flame(V(x, 0.45, z), 0.9, 0xff7a30);
  ctx.flame(V(x + 0.15, 0.35, z - 0.1), 0.6, 0xff9a40);
  ctx.col.addCircle(x, z, 0.8, { height: 0.5, camera: false });
  return ctx.light(V(x, 1.2, z), 0xff7030, 6.5, 17, 0.9);
}

export function tent(ctx, x, z, ry) {
  const g = G(x, 0, z, ry);
  g.add(ctx.M(roofGeo(2.6, 3.0, 2.0, 1.5), ctx.mats.cloth, 0, 0, 0, 0, Math.PI / 2, 0));
  ctx.bake(g);
  ctx.colliderLocal(g, 0, 0, 1.4, 1.2, 0, { height: 2 });
}

export function brazier(ctx, x, z, color = 0xff6a20, group = null) {
  const g = G(x, 0, z);
  g.add(ctx.M(cylGeo(0.06, 0.08, 1.2, 6), ctx.mats.iron, 0, 0.6, 0));
  for (let i = 0; i < 3; i++) g.add(ctx.M(cylGeo(0.03, 0.03, 1.3, 4), ctx.mats.iron, 0, 0.6, 0, 0.35, (i / 3) * Math.PI * 2, 0));
  g.add(ctx.M(new THREE.CylinderGeometry(0.5, 0.25, 0.4, 10, 1, true), ctx.mats.iron, 0, 1.3, 0));
  ctx.bake(g);
  ctx.flame(V(x, 1.65, z), 0.95, color, group);
  ctx.flame(V(x + 0.12, 1.55, z + 0.1), 0.6, color, group);
  ctx.col.addCircle(x, z, 0.45, { height: 1.5, camera: false });
  return ctx.light(V(x, 2.1, z), color, 4.5, 12, 0.8);
}

export function brokenPillar(ctx, x, z, h = 4, r = 0.7) {
  column(ctx, x, z, r, 10, { broken: Math.min(0.9, h / 10) });
}

export function arch(ctx, x, z, ry, w = 5, h = 7) {
  const g = G(x, 0, z, ry);
  const s = ctx.mats.stone;
  for (const sx of [-1, 1]) g.add(ctx.M(boxGeo(0.9, h, 0.9, 2), s, sx * w / 2, h / 2, 0));
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.45, 0);
  shape.lineTo(-w / 2 - 0.45, 0.6);
  shape.quadraticCurveTo(-w / 2, w * 0.7, 0, w * 0.75 + 0.6);
  shape.quadraticCurveTo(w / 2, w * 0.7, w / 2 + 0.45, 0.6);
  shape.lineTo(w / 2 + 0.45, 0);
  shape.lineTo(w / 2 - 0.45, 0);
  shape.quadraticCurveTo(w / 2 - 0.4, w * 0.55, 0, w * 0.68);
  shape.quadraticCurveTo(-w / 2 + 0.4, w * 0.55, -w / 2 + 0.45, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
  geo.translate(0, h, -0.45);
  g.add(ctx.M(geo, s, 0, 0, 0));
  ctx.bake(g);
  ctx.colliderLocal(g, -w / 2, 0, 0.45, 0.45, 0);
  ctx.colliderLocal(g, w / 2, 0, 0.45, 0.45, 0);
}

export function bones(ctx, x, z) {
  const g = G(x, 0, z, ctx.r(0, 6));
  g.add(ctx.M(new THREE.SphereGeometry(0.12, 8, 6), ctx.mats.bone, 0, 0.1, 0, 0, 0, 0, 1, 0.9, 1.1));
  for (let i = 0; i < 4; i++) g.add(ctx.M(cylGeo(0.025, 0.025, ctx.r(0.3, 0.5), 5), ctx.mats.bone, ctx.r(-0.4, 0.4), 0.03, ctx.r(-0.4, 0.4), Math.PI / 2, ctx.r(0, 3), 0));
  ctx.bake(g);
}

export function banner(ctx, x, y, z, ry, h = 3) {
  const m = ctx.M(new THREE.PlaneGeometry(1.1, h), ctx.mats.banner, x, y, z, 0, ry, 0);
  m.castShadow = false;
  ctx.bake(m);
}

/** Blood shrine (checkpoint). Returns the crystal mesh for animation. */
export function shrine(ctx, x, z) {
  const g = G(x, 0, z);
  g.add(ctx.M(cylGeo(0.9, 1.1, 0.35, 8), ctx.mats.stone, 0, 0.175, 0));
  g.add(ctx.M(cylGeo(0.5, 0.6, 0.9, 8), ctx.mats.stone, 0, 0.8, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(ctx.M(new THREE.ConeGeometry(0.12, 1.2, 4), ctx.mats.iron, Math.cos(a) * 0.55, 1.6, Math.sin(a) * 0.55, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
  }
  ctx.bake(g);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), ctx.mats.crystal);
  crystal.scale.set(0.8, 1.4, 0.8);
  crystal.position.set(x, 1.9, z);
  crystal.userData.dynamic = true;
  ctx.root.add(crystal);
  ctx.col.addCircle(x, z, 0.9, { height: 1.3, camera: false });
  const a = ctx.light(V(x, 2.2, z), 0xff2a40, 3, 9, 0.3);
  return { crystal, anchor: a };
}

/** Cursed altar (side quest). Returns object with destroy() for state changes. */
export function cursedAltar(ctx, x, z) {
  const root = G(x, 0, z);
  const s = ctx.mats.stone;
  root.add(ctx.M(cylGeo(1.1, 1.3, 0.5, 6), s, 0, 0.25, 0));
  const pillar = ctx.M(boxGeo(0.7, 1.6, 0.7, 1), s, 0, 1.3, 0, 0, 0.4, 0);
  root.add(pillar);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshStandardMaterial({ color: 0x1a0008, emissive: 0x9a0020, emissiveIntensity: 2, roughness: 0.3 }));
  orb.position.y = 2.5;
  root.add(orb);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    root.add(ctx.M(new THREE.ConeGeometry(0.07, 0.7, 4), ctx.mats.bone, Math.cos(a) * 0.9, 0.8, Math.sin(a) * 0.9, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3));
  }
  ctx.add(root);
  const collider = ctx.col.addCircle(x, z, 1.1, { height: 2, camera: false });
  const anchor = ctx.light(V(x, 2.6, z), 0xc0002a, 3.5, 9, 0.5);
  return {
    root, orb, anchor, collider, destroyed: false,
    destroy() {
      this.destroyed = true;
      orb.visible = false;
      pillar.rotation.z = 0.6;
      pillar.position.set(0.5, 0.7, 0);
      anchor.enabled = false;
    },
    restore() {
      this.destroyed = false;
      orb.visible = true;
      pillar.rotation.set(0, 0.4, 0);
      pillar.position.set(0, 1.3, 0);
      anchor.enabled = true;
    },
  };
}

/** Floating glowing pickup (relic, record page, vial). */
export function pickupMesh(ctx, x, y, z, kind) {
  const g = G(x, y, z);
  let mesh;
  if (kind === 'relic') {
    mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0xd8b060, emissive: 0xa07020, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.3 }));
  } else if (kind === 'record') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.45), new THREE.MeshStandardMaterial({ color: 0x8a7a68, emissive: 0x5a1a20, emissiveIntensity: 0.8, roughness: 0.9 }));
  } else if (kind === 'key') {
    mesh = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), new THREE.MeshStandardMaterial({ color: 0xb09050, emissive: 0x604010, metalness: 0.9, roughness: 0.3 }));
  } else if (kind === 'note') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.4), ctx.mats.paper);
  } else {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0x6a0010, emissive: 0xc0102a, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 }));
  }
  g.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.tex.glow, color: kind === 'relic' ? 0xffc060 : kind === 'record' ? 0xff4060 : kind === 'note' ? 0xffd0a0 : 0xff2040, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(kind === 'note' ? 0.7 : 1.1);
  g.add(halo);
  ctx.add(g);
  g.userData.spin = mesh;
  g.userData.baseY = y;
  return g;
}
