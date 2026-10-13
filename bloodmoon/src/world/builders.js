/**
 * World-building infrastructure:
 *  - StaticBatcher: bakes static props into one merged mesh per material (few draw calls)
 *  - LightPool:     a fixed number of point lights assigned each frame to the nearest light
 *                   anchors (candles, lamps, braziers) with flicker; avoids shader recompiles
 *  - FlameField:    every candle/torch flame in the world rendered as a single Points draw call
 *  - helpers:       world-scale UV boxes/planes and the BuildContext used by area builders
 */
import * as THREE from '../three.js';
import { mergeGeometries, normalizeGeometry, mulberry32 } from '../core/utils.js';

// ------------------------------------------------------------------ geometry with world-scale UVs
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

export function planeGeo(w, d, tile = 4) {
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  return g;
}

export function cylGeo(rt, rb, h, seg = 12, tile = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
  return g;
}

/** Gabled roof prism, ridge along X. Width w (x), depth d (z), height h. */
export function roofGeo(w, d, h, tile = 2) {
  const hw = w / 2, hd = d / 2;
  const slope = Math.hypot(hd, h);
  const pos = [
    // north slope (-z)
    -hw, 0, -hd, hw, 0, -hd, hw, h, 0, -hw, h, 0,
    // south slope (+z)
    hw, 0, hd, -hw, 0, hd, -hw, h, 0, hw, h, 0,
    // gable ends
    -hw, 0, hd, -hw, 0, -hd, -hw, h, 0,
    hw, 0, -hd, hw, 0, hd, hw, h, 0,
  ];
  const uv = [
    0, 0, w / tile, 0, w / tile, slope / tile, 0, slope / tile,
    0, 0, w / tile, 0, w / tile, slope / tile, 0, slope / tile,
    0, 0, d / tile, 0, d / tile / 2, h / tile,
    0, 0, d / tile, 0, d / tile / 2, h / tile,
  ];
  const idx = [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ static batching
export class StaticBatcher {
  constructor() { this.groups = new Map(); }

  add(geometry, material, matrix, { cast = true, receive = true } = {}) {
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { material, cast, receive, geoms: [] }));
    const geo = normalizeGeometry(geometry.index ? geometry.clone() : geometry.clone());
    geo.applyMatrix4(matrix);
    g.geoms.push(geo);
  }

  /** Bake every mesh under `obj` (except those flagged userData.dynamic). */
  bake(obj, opts) {
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh || m.userData.dynamic || m.userData.noBake) return;
      let p = m.parent, dyn = false;
      while (p) { if (p.userData.dynamic) { dyn = true; break; } p = p.parent; }
      if (dyn) return;
      this.add(m.geometry, m.material, m.matrixWorld, { cast: m.castShadow, receive: m.receiveShadow, ...opts });
    });
  }

  build(parent) {
    const meshes = [];
    for (const g of this.groups.values()) {
      // split very large batches to keep bounding volumes useful for culling
      const chunks = [];
      let cur = [], verts = 0;
      for (const geo of g.geoms) {
        cur.push(geo);
        verts += geo.attributes.position.count;
        if (verts > 60000) { chunks.push(cur); cur = []; verts = 0; }
      }
      if (cur.length) chunks.push(cur);
      for (const c of chunks) {
        const merged = mergeGeometries(c);
        const mesh = new THREE.Mesh(merged, g.material);
        mesh.castShadow = g.cast;
        mesh.receiveShadow = g.receive;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        meshes.push(mesh);
      }
      for (const geo of g.geoms) geo.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

// ------------------------------------------------------------------ lights
export class LightPool {
  constructor(scene, count) {
    this.scene = scene;
    this.anchors = [];
    this.transients = [];
    this.lights = [];
    this.timer = 0;
    this.candidates = [];
    this.surge = 0; // horror flicker surge 0..1
    this.globalDim = 1;
    this.setCount(count);
  }

  setCount(n) {
    for (const l of this.lights) l.removeFromParent();
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.lights.push(l);
    }
    this.timer = 0;
  }

  /** anchor: { pos, color, intensity, distance, flicker (0..1), broken, enabled } */
  add(a) {
    const anchor = { flicker: 0.5, broken: false, enabled: true, seed: Math.random() * 100, distance: 10, intensity: 3, ...a };
    anchor.color = new THREE.Color(anchor.color ?? 0xffa050);
    this.anchors.push(anchor);
    return anchor;
  }

  transient(pos, color, intensity, distance, dur) {
    if (this.transients.length > 6) this.transients.shift();
    this.transients.push({ pos: pos.clone(), color: new THREE.Color(color), intensity, distance, dur, t: 0 });
  }

  _flicker(a, t) {
    if (!a.enabled) return 0;
    let k = 1;
    if (a.broken) {
      const n = Math.sin(t * 7.3 + a.seed) + Math.sin(t * 13.1 + a.seed * 2) + Math.sin(t * 2.1 + a.seed * 0.5) * 1.5;
      k = n > 1.2 ? 0.05 : n > 0.8 ? 0.5 : 1;
    }
    k *= 1 + a.flicker * (0.14 * Math.sin(t * 11 + a.seed) + 0.09 * Math.sin(t * 23.7 + a.seed * 3) + 0.05 * Math.sin(t * 41 + a.seed));
    if (this.surge > 0) k *= 1 - this.surge * (0.5 + 0.5 * Math.sin(t * 37 + a.seed * 7));
    return Math.max(0, k);
  }

  update(dt, center, t) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      const c = this.candidates;
      c.length = 0;
      for (const a of this.anchors) {
        if (!a.enabled) continue;
        const d = Math.hypot(a.pos.x - center.x, a.pos.z - center.z);
        if (d < 42) { a._d = d; c.push(a); }
      }
      c.sort((x, y) => x._d - y._d);
    }
    for (const tr of this.transients) tr.t += dt;
    this.transients = this.transients.filter((tr) => tr.t < tr.dur);
    let li = 0;
    for (const tr of this.transients) {
      if (li >= Math.min(2, this.lights.length)) break;
      const l = this.lights[li++];
      l.position.copy(tr.pos);
      l.color.copy(tr.color);
      l.distance = tr.distance;
      l.intensity = tr.intensity * (1 - tr.t / tr.dur);
    }
    for (const a of this.candidates) {
      if (li >= this.lights.length) break;
      const l = this.lights[li++];
      const d = Math.hypot(a.pos.x - center.x, a.pos.z - center.z);
      const fade = 1 - Math.min(1, Math.max(0, (d - 20) / 14));
      l.position.copy(a.pos);
      l.color.copy(a.color);
      l.distance = a.distance;
      l.intensity = a.intensity * this._flicker(a, t) * fade * this.globalDim;
    }
    for (; li < this.lights.length; li++) this.lights[li].intensity = 0;
  }
}

// ------------------------------------------------------------------ flames
const FLAME_VERT = `
attribute float aSeed;
attribute float aSize;
attribute float aOn;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vOn;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float f = 0.82 + 0.12 * sin(uTime * 13.0 + aSeed * 31.0) + 0.06 * sin(uTime * 29.0 + aSeed * 7.0);
  p.y += 0.015 * sin(uTime * 9.0 + aSeed * 11.0);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * f * uScale / max(0.1, -mvPosition.z) * aOn;
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  vOn = aOn;
  #include <fog_vertex>
}`;
const FLAME_FRAG = `
uniform sampler2D uTex;
varying vec3 vColor;
varying float vOn;
#include <fog_pars_fragment>
void main() {
  vec2 uv = gl_PointCoord;
  uv.y = (uv.y - 0.5) * 0.75 + 0.5; // slightly elongated
  vec4 t = texture2D(uTex, uv);
  float core = smoothstep(0.55, 1.0, t.a);
  gl_FragColor = vec4(mix(vColor, vec3(1.0, 0.95, 0.8), core) * 1.6, t.a * vOn);
  if (gl_FragColor.a < 0.01) discard;
  #include <fog_fragment>
}`;

export class FlameField {
  constructor(tex) {
    this.tex = tex;
    this.items = [];
    this.points = null;
  }

  add(pos, size = 0.22, color = 0xff9a40, group = null) {
    const c = new THREE.Color(color);
    const f = { pos: pos.clone(), size, color: c, on: 1, group };
    this.items.push(f);
    return f;
  }

  build(scene) {
    const n = this.items.length;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n), on = new Float32Array(n), col = new Float32Array(n * 3);
    this.items.forEach((f, i) => {
      pos.set([f.pos.x, f.pos.y, f.pos.z], i * 3);
      seed[i] = Math.random();
      size[i] = f.size;
      on[i] = f.on;
      col.set([f.color.r, f.color.g, f.color.b], i * 3);
      f.index = i;
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.onAttr = new THREE.BufferAttribute(on, 1);
    g.setAttribute('aOn', this.onAttr);
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: null }, uTime: { value: 0 }, uScale: { value: 500 } }]),
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    this.material.uniforms.uTex.value = this.tex;
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setOn(f, v) {
    f.on = v;
    if (this.onAttr) {
      this.onAttr.array[f.index] = v;
      this.onAttr.needsUpdate = true;
    }
  }

  setGroup(group, v) {
    for (const f of this.items) if (f.group === group) this.setOn(f, v);
  }

  update(t, scale) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uScale.value = scale;
  }
}

// ------------------------------------------------------------------ build context
export class BuildContext {
  constructor(world, area) {
    this.world = world;
    this.game = world.game;
    this.area = area;
    this.mats = world.mats;
    this.tex = world.tex;
    this.col = world.game.collision;
    this.batch = world.batch;
    this.lights = world.lights;
    this.flames = world.flames;
    this.root = world.root;
    this.rng = mulberry32(area.seed || 1234);
  }

  r(a = 0, b = 1) { return a + this.rng() * (b - a); }

  /** Create a mesh (not yet added anywhere). */
  M(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** Bake a static object (Mesh or Group) into the area's merged geometry. */
  bake(obj) { this.batch.bake(obj); }

  /** Add a dynamic object to the scene. */
  add(obj) { obj.userData.dynamic = true; this.root.add(obj); return obj; }

  /** Static box with collider. */
  box(x, y, z, w, h, d, mat, ry = 0, opts = {}) {
    const m = this.M(boxGeo(w, h, d, opts.tile ?? 2), mat, x, y + h / 2, z, 0, ry, 0);
    if (opts.cast === false) m.castShadow = false;
    this.bake(m);
    if (opts.collide !== false) this.col.addBox(x, z, w / 2 + (opts.pad ?? 0), d / 2 + (opts.pad ?? 0), ry, { height: y + h, camera: opts.camera, tag: opts.tag });
    return m;
  }

  floor(x, z, w, d, mat, y = 0, tile = 4) {
    const m = this.M(planeGeo(w, d, tile), mat, x, y, z);
    m.castShadow = false;
    this.bake(m);
    return m;
  }

  /** Transform a local collider from a group's space to world and register it. */
  colliderLocal(group, lx, lz, hx, hz, lrot = 0, opts = {}) {
    group.updateMatrixWorld(true);
    const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(group.matrixWorld);
    const ry = group.rotation.y + lrot;
    return this.col.addBox(p.x, p.z, hx, hz, ry, opts);
  }

  light(pos, color = 0xff9a40, intensity = 3, distance = 9, flicker = 0.6, broken = false) {
    return this.lights.add({ pos: pos.clone(), color, intensity, distance, flicker, broken, area: this.area.id });
  }

  flame(pos, size = 0.22, color = 0xff9a40, group = null) { return this.flames.add(pos, size, color, group); }
}
