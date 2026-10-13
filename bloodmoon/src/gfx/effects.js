/**
 * Transient visual effects: anime sword slashes, shockwaves, ground telegraphs, beams, pillars,
 * blood spikes, roses, chains, afterimages. Every effect is time-limited and cleaned up.
 */
import * as THREE from '../three.js';
import { rand, clamp, easeOutCubic } from '../core/utils.js';
import { cloneSkinned } from '../characters/skinning.js';

const GEO = {
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  torus: new THREE.TorusGeometry(0.11, 0.035, 6, 10),
};

function arcGeometry(r0, r1, arc, segs = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const th = -arc / 2 + arc * u;
    const s = Math.sin(th), c = Math.cos(th);
    // taper the inner radius toward both ends for a crescent shape
    const taper = Math.sin(u * Math.PI);
    const ri = r1 - (r1 - r0) * (0.25 + 0.75 * taper);
    pos.push(s * ri, 0, c * ri, s * r1, 0, c * r1);
    uv.push(u, 0, u, 1);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function roseGeometry() {
  // A small stylised rose: stacked petal cones + leaves
  const parts = [];
  const petal = new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  for (let l = 0; l < 3; l++) {
    for (let i = 0; i < 5; i++) {
      const g = petal.clone();
      g.scale(0.7 - l * 0.15, 1.1 - l * 0.2, 0.45);
      g.rotateX(-0.5 + l * 0.25);
      g.translate(0, 0, 0.05 - l * 0.02);
      g.rotateY((i / 5) * Math.PI * 2 + l * 0.6);
      parts.push(g);
    }
  }
  const merged = new THREE.BufferGeometry();
  // manual merge (positions + normals only)
  let n = 0;
  for (const p of parts) n += p.index.count;
  const posArr = new Float32Array(n * 3), norArr = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const ni = p.toNonIndexed();
    posArr.set(ni.attributes.position.array, o);
    norArr.set(ni.attributes.normal.array, o);
    o += ni.attributes.position.array.length;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norArr, 3));
  merged.translate(0, 0.1, 0);
  return merged;
}

export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tex = game.tex;
    this.list = [];
    this.roseGeo = roseGeometry();
    this.roseMat = new THREE.MeshStandardMaterial({ color: 0x8a0018, emissive: 0x6a0010, emissiveIntensity: 1.2, roughness: 0.4 });
    this.stemMat = new THREE.MeshStandardMaterial({ color: 0x0a1408, roughness: 1 });
    this.chainMat = new THREE.MeshStandardMaterial({ color: 0x8a1020, emissive: 0xff1a30, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 });
  }

  _add(obj, dur, update, onEnd) {
    if (obj && !obj.parent) this.scene.add(obj);
    const e = { obj, t: 0, dur, update, onEnd, dead: false };
    this.list.push(e);
    return e;
  }

  kill(e) { if (e) e.t = e.dur; }

  update(dt) {
    for (const e of this.list) {
      e.t += dt;
      const k = clamp(e.t / e.dur, 0, 1);
      try {
        if (e.update) e.update(k, dt, e);
      } catch (err) {
        console.error('[Effects] update failed', err);
        e.t = e.dur;
      }
      if (e.t >= e.dur) {
        e.dead = true;
        if (e.onEnd) e.onEnd();
        if (e.obj) {
          e.obj.removeFromParent();
          e.obj.traverse((o) => {
            if (o.material && o.userData.ownMat) o.material.dispose();
            if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
          });
        }
      }
    }
    if (this.list.some((e) => e.dead)) this.list = this.list.filter((e) => !e.dead);
  }

  clear() {
    for (const e of this.list) {
      if (e.obj) e.obj.removeFromParent();
    }
    this.list.length = 0;
  }

  _mat(color, opacity = 1, map = null) {
    const m = new THREE.MeshBasicMaterial({
      color, map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: true,
    });
    return m;
  }

  _mesh(geo, mat, ownGeo = false) {
    const m = new THREE.Mesh(geo, mat);
    m.userData.ownMat = true;
    m.userData.ownGeo = ownGeo;
    m.frustumCulled = false;
    return m;
  }

  // ------------------------------------------------------------- melee
  /**
   * Anime crescent slash. pos = centre (chest height), facing = yaw of attacker.
   * o: { color, radius, arc, tilt, dur, width, mirror, intensity }
   */
  slash(pos, facing, o = {}) {
    const radius = o.radius ?? 2.2, arc = o.arc ?? 2.4, width = o.width ?? 0.9;
    const geo = arcGeometry(Math.max(0.05, radius - width), radius, arc);
    const mat = this._mat(o.color ?? 0xff2040, 1, this.tex.slash);
    const mesh = this._mesh(geo, mat, true);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = facing;
    const tiltG = new THREE.Group();
    tiltG.rotation.z = o.tilt ?? 0;
    tiltG.rotation.x = o.pitch ?? 0;
    if (o.mirror) mesh.scale.x = -1;
    tiltG.add(mesh);
    g.add(tiltG);
    // inner dark core gives the red-black anime look
    if (o.core) {
      const coreMat = new THREE.MeshBasicMaterial({ color: o.core, map: this.tex.slash, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const core = this._mesh(geo, coreMat);
      core.scale.set(o.mirror ? -0.94 : 0.94, 1, 0.94);
      core.position.y = -0.01;
      tiltG.add(core);
    }
    const dur = o.dur ?? 0.28;
    const segs = 28;
    const intensity = o.intensity ?? 1.6;
    mat.color.multiplyScalar(intensity);
    return this._add(g, dur, (k) => {
      const reveal = clamp(k / 0.35, 0, 1);
      geo.setDrawRange(0, Math.max(6, Math.floor(segs * easeOutCubic(reveal)) * 6));
      const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      tiltG.traverse((m) => { if (m.material) m.material.opacity = fade * (m === mesh ? 1 : 0.85); });
      const s = 1 + k * 0.12;
      tiltG.scale.setScalar(s);
    });
  }

  // ------------------------------------------------------------- ground decals
  ring(pos, o = {}) {
    const mat = this._mat(o.color ?? 0xff3040, o.opacity ?? 1, this.tex.ring);
    const m = this._mesh(GEO.plane, mat);
    m.position.set(pos.x, (o.y ?? 0) + 0.06, pos.z);
    const r0 = o.r0 ?? 0.5, r1 = o.r1 ?? 6;
    const op = o.opacity ?? 1;
    return this._add(m, o.dur ?? 0.6, (k) => {
      const r = r0 + (r1 - r0) * easeOutCubic(k);
      m.scale.set(r * 2, 1, r * 2);
      mat.opacity = op * (1 - k);
    });
  }

  /** A filling telegraph circle; erupts (via onEnd) after `dur`. */
  groundWarning(pos, radius, dur, color = 0xff2030, onEnd) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0.05, pos.z);
    const outer = this._mesh(GEO.plane, this._mat(color, 0.9, this.tex.ring));
    outer.scale.set(radius * 2, 1, radius * 2);
    const fill = this._mesh(GEO.plane, this._mat(color, 0.55, this.tex.glow));
    g.add(outer, fill);
    return this._add(g, dur, (k) => {
      const s = radius * 2 * (0.15 + 0.85 * k) * 1.3;
      fill.scale.set(s, 1, s);
      outer.material.opacity = 0.6 + 0.4 * Math.sin(k * 30);
      fill.position.y = 0.01;
    }, onEnd);
  }

  runeCircle(pos, radius, color, dur, follow = null) {
    const mat = this._mat(color, 0.9, this.tex.runes);
    const m = this._mesh(GEO.plane, mat);
    m.position.set(pos.x, 0.07, pos.z);
    m.scale.set(radius * 2, 1, radius * 2);
    return this._add(m, dur, (k, dt) => {
      m.rotation.y += dt * 0.8;
      if (follow) m.position.set(follow.x, 0.07, follow.z);
      const fadeIn = clamp(k * 6, 0, 1), fadeOut = clamp((1 - k) * 5, 0, 1);
      mat.opacity = 0.9 * fadeIn * fadeOut;
    });
  }

  // ------------------------------------------------------------- volumes
  sphereFlash(pos, color, radius = 2, dur = 0.4, opacity = 0.8) {
    const mat = this._mat(color, opacity);
    const m = this._mesh(GEO.sphere, mat);
    m.position.copy(pos);
    return this._add(m, dur, (k) => {
      m.scale.setScalar(radius * (0.3 + 0.7 * easeOutCubic(k)));
      mat.opacity = opacity * (1 - k);
    });
  }

  pillar(pos, color, radius = 1, height = 14, dur = 0.8) {
    const mat = this._mat(color, 0.4);
    const m = this._mesh(GEO.cyl, mat);
    m.position.set(pos.x, 0, pos.z);
    return this._add(m, dur, (k) => {
      const r = radius * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) * 0.8);
      m.scale.set(Math.max(0.01, r), height, Math.max(0.01, r));
      mat.opacity = 0.4 * (1 - k);
    });
  }

  /** Glow line between two (possibly moving) points given as functions returning Vector3. */
  beam(fromFn, toFn, color, dur, width = 0.12) {
    const mat = this._mat(color, 0.9);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2);
    const m = this._mesh(geo, mat, true);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    return this._add(m, dur, (k) => {
      a.copy(fromFn());
      b.copy(toFn());
      const len = a.distanceTo(b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b);
      const w = width * (0.6 + 0.4 * Math.sin(k * 40)) * (1 - k * 0.5);
      m.scale.set(w, w, len);
    });
  }

  spikes(pos, radius, color = 0x8a0010, dur = 0.9, count = 7) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a0008, emissive: color, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.3 });
    const spikes = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(GEO.cone, mat);
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3), r = i === 0 ? 0 : rand(0.3, radius * 0.8);
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      s.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
      s.userData.h = rand(1.2, 2.4) * (i === 0 ? 1.4 : 1);
      s.userData.w = rand(0.12, 0.22);
      g.add(s);
      spikes.push(s);
    }
    g.children[0].userData.ownMat = true;
    return this._add(g, dur, (k) => {
      const up = k < 0.15 ? easeOutCubic(k / 0.15) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      for (const s of spikes) s.scale.set(s.userData.w, Math.max(0.01, s.userData.h * up), s.userData.w);
    });
  }

  roses(pos, radius, dur) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    const roses = [];
    const n = Math.round(10 + radius * 5);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius;
      const rose = new THREE.Group();
      const head = new THREE.Mesh(this.roseGeo, this.roseMat);
      const stem = new THREE.Mesh(GEO.cyl, this.stemMat);
      stem.scale.set(0.015, 0.35, 0.015);
      head.position.y = 0.35;
      head.scale.setScalar(rand(0.9, 1.5));
      rose.add(stem, head);
      rose.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      rose.rotation.y = rand(0, 6.28);
      rose.userData.delay = rand(0, 0.25);
      g.add(rose);
      roses.push(rose);
    }
    return this._add(g, dur, (k, dt, e) => {
      const t = e.t;
      for (const r of roses) {
        const grow = clamp((t - r.userData.delay) / 0.35, 0, 1);
        const wither = clamp((dur - t) / 0.4, 0, 1);
        r.scale.setScalar(Math.max(0.001, easeOutCubic(grow) * wither));
        r.rotation.y += dt * 0.5;
      }
    });
  }

  /** Chains erupt from the ground and wrap around a target for `dur` seconds. */
  chains(target, dur = 3) {
    const g = new THREE.Group();
    const strands = [];
    for (let s = 0; s < 4; s++) {
      const strand = new THREE.Group();
      const a = (s / 4) * Math.PI * 2 + 0.4;
      for (let i = 0; i < 12; i++) {
        const link = new THREE.Mesh(GEO.torus, this.chainMat);
        link.rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0);
        link.position.y = i * 0.17;
        strand.add(link);
      }
      strand.userData.a = a;
      strands.push(strand);
      g.add(strand);
    }
    return this._add(g, dur, (k, dt, e) => {
      const p = target.pos || target;
      g.position.set(p.x, 0, p.z);
      const rise = clamp(e.t / 0.3, 0, 1);
      const fade = clamp((dur - e.t) / 0.3, 0, 1);
      strands.forEach((st, i) => {
        const a = st.userData.a + e.t * 1.5;
        const r = 1.6 - rise * 1.0;
        st.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        st.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
        st.scale.setScalar(Math.max(0.001, rise * fade));
      });
    });
  }

  /** Ghostly copy of a character model (afterimage / blink trail). */
  afterimage(model, color = 0x6a90ff, dur = 0.45) {
    model.updateMatrixWorld(true);
    const ghost = cloneSkinned(model);
    const mat = this._mat(color, 0.45);
    ghost.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.isOutline) o.visible = false;
        o.material = mat;
        o.castShadow = false;
      }
    });
    ghost.userData.ownMat = false;
    model.updateMatrixWorld(true);
    ghost.position.setFromMatrixPosition(model.matrixWorld);
    ghost.quaternion.setFromRotationMatrix(model.matrixWorld);
    return this._add(ghost, dur, (k) => {
      mat.opacity = 0.45 * (1 - k);
    }, () => mat.dispose());
  }

  /** Floating textured billboard sprite (e.g. dark sun corona). */
  sprite(pos, color, size, dur, map = this.tex.glow, update = null) {
    const mat = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.userData.ownMat = true;
    s.position.copy(pos);
    s.scale.setScalar(size);
    return this._add(s, dur, (k, dt, e) => {
      mat.opacity = Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.7) / 0.3));
      if (update) update(k, dt, s, e);
    });
  }

  /** Short-lived point light via the world's light pool. */
  flash(pos, color, intensity = 6, dur = 0.25, distance = 10) {
    if (this.game.reduceFlash) intensity *= 0.4;
    this.game.world?.lights?.transient(pos, color, intensity, distance, dur);
  }
}
