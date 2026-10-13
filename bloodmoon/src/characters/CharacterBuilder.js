/**
 * Builds stylised anime characters from layered procedural geometry:
 * cel-shaded toon materials + inverted-hull outlines, a painted face decal, bezier hair locks,
 * layered clothing with secondary motion (coat tails, long hair, scarves), and weapons.
 *
 * The returned model exposes a simple bone rig (Object3D pivots) that Animator.js poses.
 * Model forward is +Z; character's left is +X.
 */
import * as THREE from '../three.js';
import { toon, addOutline, glowMat } from '../gfx/materials.js';
import { smoothstep, damp, clamp } from '../core/utils.js';
import { convertToSkinned } from './skinning.js';
import { paintFace } from './faces.js';
import { buildHairstyle, mergeLocks } from './hair.js';

const OUT = 0.006; // default outline thickness (metres)

// ------------------------------------------------------------------ geometry helpers
function lathe(profile, segs = 20, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
}

function headGeometry(r, female) {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / r, nz = z / r;
    const k = smoothstep(0.1, -1.0, ny); // 0 above cheekbones -> 1 at the chin
    x *= 1 - (female ? 0.4 : 0.33) * k;
    z *= 1 - 0.16 * k * (nz < 0 ? 1.6 : 1);
    if (nz > 0) z += r * 0.07 * k * nz;
    y -= r * (female ? 0.1 : 0.14) * k;
    if (ny > 0.1 && nz < 0.2) z -= r * 0.04 * ny; // slightly longer skull back
    if (nz > 0.55) z = r * 0.55 + (z - r * 0.55) * 0.72; // flatter face plane
    x *= 0.93;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Front-only copy of the head with planar UVs for the painted face. */
function faceDecalGeometry(headGeo, r) {
  const src = headGeo;
  const pos = src.attributes.position, nor = src.attributes.normal;
  const idx = src.index.array;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (pos.getZ(a) > r * 0.12 && pos.getZ(b) > r * 0.12 && pos.getZ(c) > r * 0.12) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3), UV = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = 1.004;
    P[i * 3] = x * s; P[i * 3 + 1] = y * s; P[i * 3 + 2] = z * s + 0.0008;
    N[i * 3] = nor.getX(i); N[i * 3 + 1] = nor.getY(i); N[i * 3 + 2] = nor.getZ(i);
    UV[i * 2] = x / (2 * r) + 0.5;
    UV[i * 2 + 1] = (y + 1.1 * r) / (2 * r);
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setIndex(keep);
  return g;
}

/**
 * Skirt / coat panel surface hanging from a ring.
 * len(phi) gives hem length per angle. depth scales the z radius (elliptical waist).
 */
function skirtGeometry({ top, bottom, len, phiStart = 0, phiLength = Math.PI * 2, segs = 28, rows = 8, depth = 0.8, wave = 0, waves = 10, curve = 0.8 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const phi = phiStart + phiLength * u;
    const L = typeof len === 'function' ? len(phi) : len;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const r = top + (bottom - top) * Math.pow(t, curve) + wave * Math.sin(phi * waves) * t * t;
      pos.push(Math.sin(phi) * r, -L * t, Math.cos(phi) * r * depth);
      uv.push(u, 1 - t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = a + rows + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Diamond cross-section blade tapering to a point, along +Z. */
function bladeGeometry(len, width, thick, tipLen = 0.18) {
  const pts = [];
  const rows = [[0, 1], [len - tipLen, 0.92], [len, 0]];
  const pos = [], idx = [];
  for (const [z, w] of rows) {
    pos.push(0, thick * w, z, width * w, 0, z, 0, -thick * w, z, -width * w, 0, z);
  }
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 4; k++) {
      const a = r * 4 + k, b = r * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
      idx.push(a, b, c, b, d, c);
    }
  }
  idx.push(0, 2, 1, 0, 3, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  void pts;
  return ng;
}

/** Black floral lace pattern (Seraphina's gloves), painted once and cached per colour. */
const laceCache = new Map();
function laceTexture(base) {
  if (laceCache.has(base)) return laceCache.get(base);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(base).getHexString();
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(120,96,118,0.85)';
  x.lineWidth = 1.4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const cx = i * 32 + (j % 2) * 16 + 8, cy = j * 32 + 16;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        x.beginPath();
        x.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5, 2.4, a, 0, Math.PI * 2);
        x.stroke();
      }
      x.beginPath();
      x.arc(cx, cy, 2.2, 0, Math.PI * 2);
      x.stroke();
    }
  }
  x.strokeStyle = 'rgba(90,70,90,0.6)';
  x.lineWidth = 0.8;
  for (let i = 0; i < S; i += 8) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke();
    x.beginPath(); x.moveTo(i + S, 0); x.lineTo(i, S); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  laceCache.set(base, t);
  return t;
}

// ------------------------------------------------------------------ builder
class Builder {
  constructor(spec) {
    this.spec = spec;
    this.mats = {};
    this.root = new THREE.Group();
    this.root.name = spec.id || 'character';
    this.secondary = [];
    this.glowSprites = [];
  }

  mat(key, color, opts) {
    if (!this.mats[key]) this.mats[key] = toon(color, opts);
    return this.mats[key];
  }

  part(geo, mat, parent, { pos, rot, scale, outline = OUT, shadow = true, name } = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = shadow;
    m.receiveShadow = false;
    if (name) m.name = name;
    if (outline) {
      // compensate for non-uniform/small scales so the outline stays about the same width
      const s = scale ? (Math.abs(scale[0]) + Math.abs(scale[1]) + Math.abs(scale[2])) / 3 : 1;
      addOutline(m, outline / Math.max(0.05, s));
    }
    parent.add(m);
    return m;
  }

  pivot(parent, x, y, z, name) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.name = name;
    parent.add(g);
    return g;
  }
}

/**
 * spec fields (see definitions.js): id, female, height, skin, face, ears, hair, outfit, palette, weapon
 */
export function buildCharacter(spec) {
  const B = new Builder(spec);
  const P = spec.palette;
  const female = !!spec.female;
  const bodyScale = spec.height / 1.86;
  const sw = female ? 0.165 : 0.19; // shoulder half width
  const rig = {};

  const skin = B.mat('skin', spec.skin, { rim: 0.6 });
  const root = B.root;
  const body = new THREE.Group();
  body.scale.set(bodyScale * (spec.bodyXZ ?? 1), bodyScale, bodyScale * (spec.bodyXZ ?? 1));
  root.add(body);
  rig.body = body;

  // --- skeleton
  rig.hips = B.pivot(body, 0, 0.98, 0, 'hips');
  rig.spine = B.pivot(rig.hips, 0, 0.06, 0, 'spine');
  rig.chest = B.pivot(rig.spine, 0, 0.24, 0, 'chest');
  rig.neck = B.pivot(rig.chest, 0, 0.215, 0, 'neck');
  rig.head = B.pivot(rig.neck, 0, 0.085, 0.005, 'head');
  rig.armL = B.pivot(rig.chest, sw, 0.165, -0.01, 'armL');
  rig.armR = B.pivot(rig.chest, -sw, 0.165, -0.01, 'armR');
  rig.foreL = B.pivot(rig.armL, 0, -0.29, 0, 'foreL');
  rig.foreR = B.pivot(rig.armR, 0, -0.29, 0, 'foreR');
  rig.handL = B.pivot(rig.foreL, 0, -0.255, 0, 'handL');
  rig.handR = B.pivot(rig.foreR, 0, -0.255, 0, 'handR');
  const hx = female ? 0.095 : 0.1;
  rig.thighL = B.pivot(rig.hips, hx, -0.03, 0, 'thighL');
  rig.thighR = B.pivot(rig.hips, -hx, -0.03, 0, 'thighR');
  rig.shinL = B.pivot(rig.thighL, 0, -0.45, 0, 'shinL');
  rig.shinR = B.pivot(rig.thighR, 0, -0.45, 0, 'shinR');
  rig.footL = B.pivot(rig.shinL, 0, -0.44, 0, 'footL');
  rig.footR = B.pivot(rig.shinR, 0, -0.44, 0, 'footR');
  // natural rest pose: arms slightly away from the body
  rig.armL.rotation.z = 0.12;
  rig.armR.rotation.z = -0.12;

  const hidden = spec.hideLegs || spec.outfit === 'countess';
  if (spec.armScale) for (const arm of [rig.armL, rig.armR]) arm.scale.set(1, spec.armScale, 1);

  // --- head
  const r = 0.112;
  if (spec.noHead) {
    rig.headMesh = new THREE.Group();
    rig.headMesh.position.set(0, 0.1, 0);
    rig.head.add(rig.headMesh);
  } else buildHead(B, rig, spec, skin, r, female);

  // --- neck
  B.part(new THREE.CylinderGeometry(0.042, 0.048, 0.13, 12), skin, rig.neck, { pos: [0, 0.04, 0], outline: 0.004 });

  // --- base body (under clothes)
  const torsoMat = B.mat('torso', P.inner ?? P.primary, { rim: 1 });
  const chestProfile = female
    ? [[0.001, -0.02], [0.12, -0.02], [0.125, 0.06], [0.135, 0.13], [0.135, 0.18], [0.11, 0.215], [0.05, 0.24], [0.001, 0.245]]
    : [[0.001, -0.02], [0.135, -0.02], [0.15, 0.06], [0.17, 0.13], [0.17, 0.18], [0.14, 0.215], [0.06, 0.245], [0.001, 0.25]];
  B.part(lathe(chestProfile, 22), torsoMat, rig.chest, { pos: [0, 0, 0], scale: [1.1, 1, 0.68] });
  const absProfile = female
    ? [[0.001, -0.02], [0.13, -0.02], [0.105, 0.1], [0.12, 0.24], [0.001, 0.25]]
    : [[0.001, -0.02], [0.14, -0.02], [0.13, 0.1], [0.135, 0.24], [0.001, 0.25]];
  B.part(lathe(absProfile, 20), torsoMat, rig.spine, { scale: [1.05, 1, 0.7] });
  const pelvisMat = B.mat('pelvis', P.legs ?? P.primary);
  B.part(new THREE.SphereGeometry(1, 18, 12), pelvisMat, rig.hips, { pos: [0, 0.01, 0], scale: [female ? 0.165 : 0.155, 0.1, 0.11] });
  if (female) {
    const bustMat = B.mat('bust', P.bodice ?? P.primary);
    for (const s of [-1, 1]) B.part(new THREE.SphereGeometry(0.062, 14, 10), bustMat, rig.chest, { pos: [s * 0.062, 0.12, 0.065], scale: [1, 0.9, 0.85], outline: 0.004 });
  }

  // --- arms
  const sleeveMat = B.mat('sleeve', P.sleeve ?? P.primary);
  if (P.lace && !B.mats.foreSleeve) B.mats.foreSleeve = toon(0xffffff, { map: laceTexture(P.foreSleeve ?? 0x0b080c), rim: 1 });
  const handMat = P.gloves ? B.mat('gloves', P.gloves) : skin;
  const upperArmGeo = lathe([[0.001, 0.02], [0.046, 0.0], [0.05, -0.08], [0.044, -0.24], [0.04, -0.29], [0.001, -0.3]], 14);
  const foreArmGeo = lathe([[0.001, 0.01], [0.041, 0], [0.042, -0.08], [0.033, -0.24], [0.001, -0.25]], 14);
  for (const [arm, fore, hand, s] of [[rig.armL, rig.foreL, rig.handL, 1], [rig.armR, rig.foreR, rig.handR, -1]]) {
    B.part(upperArmGeo, sleeveMat, arm, { scale: [female ? 0.88 : 1, 1, female ? 0.88 : 1] });
    B.part(foreArmGeo, P.foreSleeve ? B.mat('foreSleeve', P.foreSleeve) : sleeveMat, fore, { scale: [female ? 0.88 : 1, 1, female ? 0.88 : 1] });
    B.part(new THREE.SphereGeometry(0.047, 12, 10), sleeveMat, arm, { pos: [0, -0.005, 0], outline: 0.004 }); // shoulder ball
    // hand: palm + fingers block + thumb
    const palm = B.part(new THREE.SphereGeometry(1, 12, 10), handMat, hand, { pos: [0, -0.045, 0.004], scale: [0.034, 0.052, 0.02], outline: 0.004 });
    void palm;
    B.part(new THREE.CapsuleGeometry(0.012, 0.035, 4, 6), handMat, hand, { pos: [s * 0.025, -0.035, 0.018], rot: [0.5, 0, s * 0.5], outline: 0.003 });
    B.part(new THREE.SphereGeometry(1, 10, 8), handMat, hand, { pos: [0, -0.095, 0.012], scale: [0.03, 0.03, 0.022], outline: 0.003 });
  }

  // --- legs
  const legMat = B.mat('legs', P.legs ?? 0x15131a);
  const thighGeo = lathe([[0.001, 0.03], [0.07, 0.02], [0.075, -0.06], [0.058, -0.4], [0.05, -0.46], [0.001, -0.47]], 14);
  const shinGeo = lathe([[0.001, 0.01], [0.05, 0], [0.052, -0.12], [0.038, -0.4], [0.035, -0.44], [0.001, -0.45]], 14);
  const thighMat = P.thighSkin ? skin : legMat;
  if (!hidden) {
    for (const [th, sh, ft] of [[rig.thighL, rig.shinL, rig.footL], [rig.thighR, rig.shinR, rig.footR]]) {
      B.part(thighGeo, thighMat, th, { scale: female ? [0.92, 1, 0.92] : [1, 1, 1] });
      B.part(shinGeo, legMat, sh, { scale: female ? [0.9, 1, 0.9] : [1, 1, 1] });
      // boot
      const bootMat = B.mat('boots', P.boots ?? 0x0b0a0e);
      const bootTop = P.bootHeight ?? 0.42;
      B.part(lathe([[0.001, 0.01], [0.058, 0], [0.06, -0.04], [0.046, -bootTop * 0.8], [0.044, -bootTop], [0.001, -bootTop - 0.01]], 14), bootMat, sh, { pos: [0, -0.44 + bootTop, 0] });
      if (P.thighBoots) {
        B.part(lathe([[0.001, 0.01], [0.066, 0], [0.064, -0.2], [0.056, -0.32], [0.001, -0.33]], 14), bootMat, th, { pos: [0, -0.12, 0] });
        B.part(new THREE.TorusGeometry(0.066, 0.008, 6, 18), B.mat('trim2', P.accent ?? 0x8a0a1a, { rim: 0.4 }), th, { pos: [0, -0.12, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
      }
      const foot = B.part(new THREE.CapsuleGeometry(0.042, 0.13, 4, 10), bootMat, ft, { pos: [0, -0.02, 0.05], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.75] });
      void foot;
      if (P.buckles) B.part(new THREE.BoxGeometry(0.05, 0.02, 0.01), B.mat('silver', P.trim ?? 0xc0c4d0, { rim: 0.3 }), sh, { pos: [0, -0.2, 0.05], outline: 0 });
    }
  }

  // --- outfit specifics
  rig.weapons = [];
  const outfit = OUTFITS[spec.outfit];
  if (outfit) outfit(B, rig, spec, { female, sw });

  // --- weapons
  if (spec.weapon && WEAPONS[spec.weapon]) WEAPONS[spec.weapon](B, rig, spec);

  // shadows: outlines never cast
  root.traverse((o) => {
    if (o.userData.isOutline) o.castShadow = false;
  });
  // merge all rigid parts into a few rigid-skinned meshes (far fewer draw calls)
  if (spec.optimize !== false) convertToSkinned(root, rig);

  const model = {
    root, rig, spec, mats: B.mats, faceMat: B.faceMat, secondary: B.secondary, glowSprites: B.glowSprites,
    weaponGlow: B.weaponGlow || [],
    glowMats: B.glowMats || [],
    _vel: new THREE.Vector3(),
    /** Secondary motion for hair, coat tails and scarves. localVel: velocity in model space. */
    updateSecondary(dt, localVel, t) {
      for (const s of B.secondary) {
        const fwd = clamp(localVel.z, -10, 10), side = clamp(localVel.x, -10, 10), up = clamp(localVel.y ?? 0, -10, 10);
        let tx = 0, tz = 0;
        if (s.kind === 'hair') {
          tx = -fwd * 0.045 * s.amount - up * 0.02 * s.amount + Math.sin(t * 1.7) * 0.02 * s.amount;
          tz = side * 0.04 * s.amount;
          tx = clamp(tx, -0.6, 0.25);
        } else if (s.kind === 'panel') {
          // follow the nearest thigh, then trail when moving
          const th = s.thigh ? s.thigh.rotation.x : 0;
          tx = th * s.follow - Math.max(0, fwd) * 0.06 * s.trail + Math.sin(t * 2.3 + s.phase) * 0.015 - up * 0.02;
          tz = -side * 0.03 * s.trail;
          tx = clamp(tx, -1.1, 0.8);
        } else if (s.kind === 'scarf' || s.kind === 'cape') {
          tx = -Math.max(0, fwd) * 0.13 * s.amount + Math.sin(t * 3 + s.phase) * 0.06 * s.amount - up * 0.03;
          tz = side * 0.05 + Math.sin(t * 2.1 + s.phase) * 0.04 * s.amount;
          tx = clamp(tx, -1.3, 0.3);
        }
        s.rx = damp(s.rx, tx, s.stiff ?? 8, dt);
        s.rz = damp(s.rz, tz, s.stiff ?? 8, dt);
        s.obj.rotation.x = (s.baseX ?? 0) + s.rx;
        s.obj.rotation.z = (s.baseZ ?? 0) + s.rz;
      }
    },
    setOpacity(o) {
      root.traverse((m) => {
        if (!m.isMesh && !m.isSprite) return;
        if (m.userData.isOutline) { m.visible = o >= 0.99; return; } // outline materials are shared
        const mat = m.material;
        if (!mat.userData.baseTransparent) mat.userData.baseTransparent = { t: mat.transparent, o: mat.opacity };
        mat.transparent = o < 1 || mat.userData.baseTransparent.t;
        mat.opacity = mat.userData.baseTransparent.o * o;
        mat.depthWrite = o >= 1;
      });
    },
    dispose() {
      root.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
      });
      for (const m of Object.values(B.mats)) m.dispose();
    },
  };
  return model;
}


function buildHead(B, rig, spec, skin, r, female) {
  const headGeo = headGeometry(r, female);
  const headMesh = B.part(headGeo, skin, rig.head, { pos: [0, 0.1, 0], outline: 0.005 });
  rig.headMesh = headMesh;
  const face = paintFace(spec.face);
  const faceMat = toon(0xffffff, {
    map: face.map, transparent: true, depthWrite: false, rim: 0,
    emissive: face.hasGlow ? 0xffffff : 0x000000, emissiveMap: face.hasGlow ? face.emissiveMap : null,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (face.hasGlow) faceMat.emissiveIntensity = 1.6;
  const faceMesh = new THREE.Mesh(faceDecalGeometry(headGeo, r), faceMat);
  faceMesh.renderOrder = 2;
  headMesh.add(faceMesh);
  B.faceMat = faceMat;
  // ears
  if (spec.ears === 'pointed') {
    const earGeo = new THREE.ConeGeometry(0.022, 0.085, 5);
    for (const s of [-1, 1]) {
      B.part(earGeo, skin, headMesh, { pos: [s * r * 0.9, -r * 0.08, -r * 0.08], rot: [-0.5, 0, -s * 1.05], scale: [1, 1, 0.45], outline: 0.004 });
    }
  } else if (spec.ears === 'human') {
    const earGeo = new THREE.SphereGeometry(0.022, 8, 6);
    for (const s of [-1, 1]) B.part(earGeo, skin, headMesh, { pos: [s * r * 0.9, -r * 0.1, -r * 0.05], scale: [0.5, 1, 0.8], outline: 0.004 });
  }
  // eye glow sprites (subtle, helps readability in the dark)
  if (face.hasGlow && spec.eyeGlow) {
    const gm = new THREE.SpriteMaterial({ map: spec.glowTex, color: spec.eyeGlow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    for (const s of [-1, 1]) {
      const sp = new THREE.Sprite(gm);
      sp.scale.setScalar(0.07);
      sp.position.set(s * r * 0.36, -r * 0.1, r * 0.95);
      headMesh.add(sp);
      B.glowSprites.push(sp);
    }
  }

  // --- hair
  const hairMat = B.mat('hair', 0xffffff, { vertexColors: true, rim: 0.9 });
  const hs = buildHairstyle(spec.hair.style, r, spec.hair);
  const capColor = spec.hair.cap ?? spec.hair.root;
  if (spec.hair.style !== 'countess') {
    const capGeo = new THREE.SphereGeometry(r * 1.06, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
    // cut the cap away from the face
    const cp = capGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const z = cp.getZ(i), y = cp.getY(i);
      if (z > r * 0.35 && y < r * 0.55) cp.setY(i, Math.max(y, r * 0.55 - (z - r * 0.35) * 0.4));
    }
    capGeo.computeVertexNormals();
    B.part(capGeo, B.mat('hairCap', capColor, { rim: 0.8 }), headMesh, { pos: [0, r * 0.02, -r * 0.03], scale: [0.98, 1, 1.02], outline: 0 });
  }
  const hairPivot = new THREE.Group();
  hairPivot.position.set(0, 0, 0);
  headMesh.add(hairPivot);
  if (hs.front.length) B.part(mergeLocks(hs.front), hairMat, hairPivot, { outline: 0.0035 });
  if (hs.side.length) B.part(mergeLocks(hs.side), hairMat, hairPivot, { outline: 0.0035 });
  if (hs.back.length) {
    const backPivot = new THREE.Group();
    backPivot.position.set(0, r * 0.8, -r * 0.4);
    hairPivot.add(backPivot);
    const backMesh = B.part(mergeLocks(hs.back), hairMat, backPivot, { pos: [0, -r * 0.8, r * 0.4], outline: 0.0035 });
    void backMesh;
    B.secondary.push({ obj: backPivot, kind: 'hair', amount: spec.hair.style === 'seraphina' || spec.hair.style === 'countess' ? 1.0 : 0.4, rx: 0, rz: 0 });
  }

}


// ====================================================================== outfits
const OUTFITS = {
  /** Lucien: long gothic coat with split tails, high collar, silver trim, crimson cravat, half-cape. */
  lucien(B, rig, spec, { sw }) {
    const P = spec.palette;
    const coat = B.mat('coat', P.primary, { rim: 1 });
    const trim = B.mat('silver', P.trim, { rim: 0.4, emissive: P.trimGlow ?? 0x000000 });
    const lining = B.mat('lining', P.lining, { side: THREE.DoubleSide });
    // coat body over the chest
    B.part(lathe([[0.001, -0.02], [0.15, -0.02], [0.165, 0.08], [0.185, 0.14], [0.18, 0.2], [0.15, 0.225], [0.07, 0.25], [0.001, 0.255]], 22), coat, rig.chest, { scale: [1.12, 1, 0.74] });
    B.part(lathe([[0.001, -0.03], [0.145, -0.03], [0.142, 0.1], [0.15, 0.25], [0.001, 0.26]], 22), coat, rig.spine, { scale: [1.08, 1, 0.74] });
    // vest + cravat (visible in the open front)
    B.part(new THREE.BoxGeometry(0.09, 0.3, 0.02), B.mat('vest', P.inner, { rim: 0.6 }), rig.chest, { pos: [0, 0.03, 0.118], outline: 0.003 });
    B.part(new THREE.ConeGeometry(0.035, 0.12, 6), B.mat('cravat', P.accent, { rim: 0.4, emissive: 0x200004 }), rig.chest, { pos: [0, 0.165, 0.125], rot: [Math.PI, 0, 0], scale: [1, 1, 0.5], outline: 0.003 });
    // buttons
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) B.part(new THREE.SphereGeometry(0.009, 8, 6), trim, rig.chest, { pos: [s * 0.065, 0.12 - i * 0.07, 0.122 - i * 0.004], outline: 0 });
    // high standing collar (open at front)
    B.part(skirtLike(0.078, 0.15, -0.17, Math.PI * 0.2, Math.PI * 1.6), lining, rig.neck, { pos: [0, 0.075, -0.005], outline: 0 });
    const coatDS = B.mat('coatDS', P.primary, { side: THREE.DoubleSide, rim: 1 });
    B.part(skirtLike(0.084, 0.158, -0.174, Math.PI * 0.2, Math.PI * 1.6), coatDS, rig.neck, { pos: [0, 0.075, -0.012], outline: 0 });
    // black choker with a silver cross pendant
    B.part(new THREE.TorusGeometry(0.047, 0.008, 6, 18), B.mat('choker', 0x07050a), rig.neck, { pos: [0, 0.04, 0.003], rot: [Math.PI / 2, 0, 0], outline: 0 });
    B.part(new THREE.BoxGeometry(0.008, 0.04, 0.006), trim, rig.neck, { pos: [0, 0.008, 0.05], outline: 0 });
    B.part(new THREE.BoxGeometry(0.024, 0.007, 0.006), trim, rig.neck, { pos: [0, 0.018, 0.05], outline: 0 });
    // shoulder epaulettes
    for (const [s, arm] of [[1, rig.armL], [-1, rig.armR]]) {
      B.part(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), coat, arm, { pos: [s * 0.005, 0.01, 0], scale: [1.15, 0.7, 1.1] });
      // flared cuff with silver trim
      B.part(lathe([[0.042, 0], [0.05, -0.04], [0.056, -0.07]], 16), coat, s > 0 ? rig.foreL : rig.foreR, { pos: [0, -0.16, 0], outline: 0.004 });
      B.part(new THREE.TorusGeometry(0.056, 0.006, 6, 18), trim, s > 0 ? rig.foreL : rig.foreR, { pos: [0, -0.23, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    }
    // coat tails: 4 panels pivoting at the waist
    const panels = [
      { a: 0.32, b: 1.5, len: 0.68, thigh: rig.thighL, follow: 0.85, trail: 0.4 },
      { a: 1.5, b: Math.PI - 0.06, len: 0.86, thigh: rig.thighL, follow: 0.55, trail: 1 },
      { a: Math.PI + 0.06, b: Math.PI * 2 - 1.5, len: 0.86, thigh: rig.thighR, follow: 0.55, trail: 1 },
      { a: Math.PI * 2 - 1.5, b: Math.PI * 2 - 0.32, len: 0.68, thigh: rig.thighR, follow: 0.85, trail: 0.4 },
    ];
    panels.forEach((p, i) => {
      const pivot = B.pivot(rig.hips, 0, 0.09, 0, 'tail' + i);
      const geo = skirtGeometry({ top: 0.165, bottom: 0.28, len: p.len, phiStart: p.a, phiLength: p.b - p.a, segs: 10, rows: 6, depth: 0.78 });
      B.part(geo, coatDS, pivot, { outline: 0, shadow: true });
      const hem = skirtGeometry({ top: 0.28 * 0.985, bottom: 0.282, len: 0.03, phiStart: p.a, phiLength: p.b - p.a, segs: 10, rows: 1, depth: 0.78 });
      B.part(hem, trim, pivot, { pos: [0, -p.len + 0.03, 0], outline: 0 });
      B.secondary.push({ obj: pivot, kind: 'panel', thigh: p.thigh, follow: p.follow, trail: p.trail, phase: i, rx: 0, rz: 0, stiff: 10 });
    });
    // belt
    B.part(new THREE.TorusGeometry(0.15, 0.014, 6, 24), B.mat('belt', 0x141016), rig.hips, { pos: [0, 0.09, 0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.76, 1], outline: 0 });
    // half cape on the left shoulder
    const capePivot = B.pivot(rig.chest, sw * 0.6, 0.22, -0.02, 'cape');
    const capeGeo = skirtGeometry({ top: 0.09, bottom: 0.22, len: 0.55, phiStart: Math.PI * 0.05, phiLength: Math.PI * 1.25, segs: 14, rows: 6, depth: 0.9, wave: 0.012, waves: 9 });
    const cape = B.part(capeGeo, B.mat('capeOuter', P.primary, { side: THREE.DoubleSide }), capePivot, { outline: 0 });
    cape.rotation.y = 0.6;
    B.part(capeGeo, B.mat('capeInner', P.lining, { side: THREE.BackSide }), capePivot, { outline: 0, scale: [0.985, 0.995, 0.985] }).rotation.y = 0.6;
    B.secondary.push({ obj: capePivot, kind: 'cape', amount: 0.5, phase: 1.3, rx: 0, rz: 0, stiff: 6 });
  },

  /** Seraphina: gothic dress — bodice, corset, high collar, puff sleeves, high-low layered skirt. */
  seraphina(B, rig, spec) {
    const P = spec.palette;
    const dress = B.mat('dress', P.primary, { rim: 1 });
    const accent = B.mat('accent', P.accent, { rim: 0.6, emissive: 0x14000a });
    const trim = B.mat('silver', P.trim, { rim: 0.4 });
    B.part(lathe([[0.001, -0.02], [0.128, -0.02], [0.132, 0.06], [0.142, 0.13], [0.14, 0.18], [0.115, 0.215], [0.06, 0.24], [0.001, 0.245]], 22), dress, rig.chest, { scale: [1.1, 1, 0.72] });
    // corset front panel with lacing
    B.part(new THREE.CylinderGeometry(0.135, 0.12, 0.3, 16, 1, true, -0.55, 1.1), accent, rig.spine, { pos: [0, 0.14, 0.004], scale: [1.07, 1, 0.74], outline: 0 }).material.side = THREE.DoubleSide;
    for (let i = 0; i < 6; i++) {
      B.part(new THREE.BoxGeometry(0.045, 0.006, 0.006), B.mat('lace', 0x050305), rig.spine, { pos: [0, 0.03 + i * 0.045, 0.094], rot: [0, 0, (i % 2 ? 0.5 : -0.5)], outline: 0 });
    }
    B.part(lathe([[0.001, -0.03], [0.128, -0.03], [0.108, 0.1], [0.125, 0.25], [0.001, 0.26]], 22), dress, rig.spine, { scale: [1.05, 1, 0.74] });
    // high collar + choker gem
    B.part(skirtLike(0.058, 0.085, -0.1, Math.PI * 0.2, Math.PI * 1.6), B.mat('collar', P.primary, { side: THREE.DoubleSide }), rig.neck, { pos: [0, 0.12, -0.004], outline: 0 });
    B.part(new THREE.TorusGeometry(0.046, 0.007, 6, 18), B.mat('choker', 0x07050a), rig.neck, { pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    const gem = B.part(new THREE.OctahedronGeometry(0.014), B.mat('gem', 0xff1a3a, { emissive: 0xc0001a, rim: 0 }), rig.neck, { pos: [0, 0.04, 0.05], outline: 0 });
    gem.material.emissiveIntensity = 1.5;
    // puff sleeves
    for (const arm of [rig.armL, rig.armR]) {
      B.part(new THREE.SphereGeometry(0.07, 14, 10), dress, arm, { pos: [0, -0.04, 0], scale: [1, 1.1, 1] });
      B.part(new THREE.TorusGeometry(0.06, 0.008, 6, 16), accent, arm, { pos: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    }
    // high-low skirt: black outer (short front, long back) + crimson underskirt
    const outer = (phi) => 0.36 + 0.5 * Math.pow((1 - Math.cos(phi)) / 2, 1.4);
    const under = (phi) => 0.3 + 0.38 * Math.pow((1 - Math.cos(phi)) / 2, 1.2);
    const segsPanels = [[0.35, 1.7], [1.7, Math.PI], [Math.PI, Math.PI * 2 - 1.7], [Math.PI * 2 - 1.7, Math.PI * 2 - 0.35]];
    const thighs = [rig.thighL, rig.thighL, rig.thighR, rig.thighR];
    // front piece stays (short)
    B.part(skirtGeometry({ top: 0.145, bottom: 0.25, len: under, phiStart: -0.6, phiLength: 1.2, segs: 10, rows: 5, depth: 0.82, wave: 0.02, waves: 14 }), B.mat('under', P.accent, { side: THREE.DoubleSide }), rig.hips, { pos: [0, 0.08, 0], outline: 0 });
    segsPanels.forEach(([a, b], i) => {
      const pivot = B.pivot(rig.hips, 0, 0.085, 0, 'skirt' + i);
      B.part(skirtGeometry({ top: 0.15, bottom: 0.33, len: outer, phiStart: a, phiLength: b - a, segs: 12, rows: 7, depth: 0.82, wave: 0.018, waves: 12 }), B.mat('skirt', P.primary, { side: THREE.DoubleSide, rim: 1 }), pivot, { outline: 0 });
      B.part(skirtGeometry({ top: 0.145, bottom: 0.3, len: under, phiStart: a, phiLength: b - a, segs: 12, rows: 6, depth: 0.82, wave: 0.02, waves: 14 }), B.mat('under', P.accent, { side: THREE.DoubleSide }), pivot, { outline: 0, scale: [0.97, 1, 0.97] });
      B.secondary.push({ obj: pivot, kind: 'panel', thigh: thighs[i], follow: i === 0 || i === 3 ? 0.8 : 0.5, trail: i === 1 || i === 2 ? 1.2 : 0.5, phase: i * 1.3, rx: 0, rz: 0, stiff: 9 });
    });
    // waist sash bow at the back
    B.part(new THREE.TorusGeometry(0.135, 0.016, 6, 24), accent, rig.hips, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1.08, 0.78, 1], outline: 0 });
    for (const s of [-1, 1]) B.part(new THREE.SphereGeometry(0.045, 10, 8), accent, rig.hips, { pos: [s * 0.045, 0.11, -0.12], scale: [1.3, 0.8, 0.5] });
    // red spider-lily hair ornament
    const lily = new THREE.Group();
    lily.position.set(0.098, 0.07, 0.0);
    lily.rotation.set(0.2, 0, -0.5);
    rig.headMesh.add(lily);
    const petalMat = B.mat('lily', 0xb0001e, { emissive: 0x3a0008, rim: 0.6 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.11, 4).translate(0, 0.055, 0), petalMat);
      petal.rotation.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
      petal.scale.set(1, 1, 0.45);
      lily.add(petal);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.13, 3).translate(0, 0.065, 0), petalMat);
      st.rotation.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
      lily.add(st);
    }
    // ruby drop earrings
    const silver = B.mat('silverJ', 0xd0d4de, { rim: 0.3 });
    const ruby = B.mat('ruby', 0xff1a3a, { emissive: 0x8a0018, rim: 0 });
    for (const s of [-1, 1]) {
      B.part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 4), silver, rig.headMesh, { pos: [s * 0.1, -0.05, -0.012], outline: 0 });
      B.part(new THREE.OctahedronGeometry(0.012), ruby, rig.headMesh, { pos: [s * 0.1, -0.082, -0.012], scale: [0.8, 1.4, 0.8], outline: 0 });
    }
    // pendant necklace
    B.part(new THREE.TorusGeometry(0.075, 0.003, 4, 20, Math.PI), silver, rig.chest, { pos: [0, 0.2, 0.05], rot: [Math.PI / 2 + 0.5, 0, Math.PI], outline: 0 });
    B.part(new THREE.OctahedronGeometry(0.016), ruby, rig.chest, { pos: [0, 0.155, 0.1], scale: [0.8, 1.3, 0.6], outline: 0 });
    void trim;
  },

  /** Kairo: black combat jacket, silver armour plates, belt with pouches, long scarf. */
  kairo(B, rig, spec, { sw }) {
    const P = spec.palette;
    const jacket = B.mat('jacket', P.primary, { rim: 1 });
    const armor = B.mat('armor', P.trim, { rim: 0.5, emissive: P.trimGlow ?? 0x000000 });
    const blueGlow = glowMat(P.glow ?? 0x4aa8ff);
    B.part(lathe([[0.001, -0.02], [0.152, -0.02], [0.165, 0.08], [0.185, 0.14], [0.18, 0.2], [0.15, 0.225], [0.07, 0.25], [0.001, 0.255]], 22), jacket, rig.chest, { scale: [1.12, 1, 0.74] });
    B.part(lathe([[0.001, -0.05], [0.15, -0.05], [0.142, 0.1], [0.15, 0.25], [0.001, 0.26]], 22), jacket, rig.spine, { scale: [1.08, 1, 0.74] });
    // short jacket skirt
    B.part(skirtGeometry({ top: 0.16, bottom: 0.2, len: 0.2, segs: 24, rows: 3, depth: 0.76 }), B.mat('jacketHem', P.primary, { side: THREE.DoubleSide }), rig.hips, { pos: [0, 0.08, 0], outline: 0 });
    // asymmetric zipper line + collar
    B.part(new THREE.BoxGeometry(0.008, 0.36, 0.01), armor, rig.chest, { pos: [0.03, 0.03, 0.125], rot: [0, 0, 0.08], outline: 0 });
    B.part(skirtLike(0.07, 0.09, -0.11, Math.PI * 0.12, Math.PI * 1.76), B.mat('collar', P.primary, { side: THREE.DoubleSide }), rig.neck, { pos: [0, 0.115, 0], outline: 0 });
    // chest plate (upper chest, partial)
    B.part(new THREE.SphereGeometry(0.19, 20, 10, -0.9, 1.8, Math.PI * 0.18, Math.PI * 0.3), armor, rig.chest, { pos: [0, 0.06, -0.015], scale: [1.05, 1, 0.75], outline: 0.004 });
    // pauldrons (layered)
    for (const [s, arm] of [[1, rig.armL], [-1, rig.armR]]) {
      for (let k = 0; k < 2; k++) {
        B.part(new THREE.SphereGeometry(0.066 - k * 0.006, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), armor, arm, { pos: [s * 0.012, 0.03 - k * 0.04, 0], rot: [0, 0, s * (0.2 + k * 0.12)], scale: [1.05, 0.55, 1.0], outline: 0.003 });
      }
      const fore = s > 0 ? rig.foreL : rig.foreR;
      B.part(lathe([[0.046, 0], [0.05, -0.06], [0.048, -0.17], [0.044, -0.2]], 14), armor, fore, { pos: [0, -0.04, 0], outline: 0.004 });
      B.part(new THREE.BoxGeometry(0.006, 0.12, 0.004), blueGlow, fore, { pos: [0, -0.13, 0.05], outline: 0 });
    }
    // knee guards
    for (const sh of [rig.shinL, rig.shinR]) B.part(new THREE.SphereGeometry(0.062, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), armor, sh, { pos: [0, 0.0, 0.025], rot: [Math.PI / 2.4, 0, 0], scale: [1, 1, 0.7], outline: 0.004 });
    // belt with pouches
    B.part(new THREE.TorusGeometry(0.152, 0.018, 6, 24), B.mat('belt', 0x221a16), rig.hips, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.76, 1], outline: 0 });
    for (const [x, z, ry] of [[0.13, 0.06, 0.9], [-0.14, 0.03, -1.1], [0.07, -0.11, 2.6]]) {
      B.part(new THREE.BoxGeometry(0.06, 0.07, 0.035), B.mat('pouch', 0x1a1412), rig.hips, { pos: [x, 0.03, z], rot: [0, ry, 0], outline: 0.004 });
    }
    // long scarf: knot at the neck + two tails with secondary motion
    B.part(new THREE.TorusGeometry(0.06, 0.03, 8, 16), B.mat('scarf', P.accent), rig.neck, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.8], outline: 0.004 });
    for (let k = 0; k < 2; k++) {
      const piv = B.pivot(rig.chest, 0.05 - k * 0.07, 0.22, -0.1, 'scarf' + k);
      const len = 0.75 + k * 0.2;
      const geo = new THREE.PlaneGeometry(0.1, len, 1, 8).translate(0, -len / 2, 0);
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const y = pa.getY(i);
        pa.setZ(i, -Math.pow(-y, 1.4) * 0.15 + Math.sin(-y * 6 + k) * 0.03);
        pa.setX(i, pa.getX(i) * (1 - (-y / len) * 0.3));
      }
      geo.computeVertexNormals();
      B.part(geo, B.mat('scarfCloth', P.accent, { side: THREE.DoubleSide }), piv, { outline: 0 });
      B.secondary.push({ obj: piv, kind: 'scarf', amount: 1.2, phase: k * 2, rx: 0, rz: 0, stiff: 5, baseX: 0.15 });
    }
    void sw;
  },

  /** The Veiled Countess (boss): huge bell gown, Medici collar, crown of thorns and veil. */
  countess(B, rig, spec) {
    const P = spec.palette;
    const gown = B.mat('gown', P.primary, { rim: 1 });
    const wine = B.mat('wine', P.accent, { rim: 0.8, emissive: 0x12000a });
    const silver = B.mat('silver', P.trim, { rim: 0.4 });
    B.part(lathe([[0.001, -0.02], [0.12, -0.02], [0.13, 0.06], [0.14, 0.13], [0.135, 0.18], [0.11, 0.215], [0.06, 0.24], [0.001, 0.245]], 22), wine, rig.chest, { scale: [1.1, 1, 0.72] });
    B.part(lathe([[0.001, -0.03], [0.13, -0.03], [0.1, 0.1], [0.125, 0.25], [0.001, 0.26]], 22), wine, rig.spine, { scale: [1.05, 1, 0.74] });
    // bell gown layers
    for (let k = 0; k < 3; k++) {
      const g = skirtGeometry({ top: 0.14 + k * 0.01, bottom: 0.8 - k * 0.12, len: 1.08 - k * 0.12, segs: 48, rows: 10, depth: 0.95, wave: 0.05 - k * 0.012, waves: 16 + k * 4, curve: 1.6 });
      B.part(g, k === 1 ? wine : gown, rig.hips, { pos: [0, 0.07 - k * 0.0, 0], outline: 0, shadow: k === 0 }).material.side = THREE.DoubleSide;
    }
    // medici collar (fan behind the head)
    const fan = skirtGeometry({ top: 0.07, bottom: 0.32, len: -0.32, phiStart: Math.PI * 0.55, phiLength: Math.PI * 0.9, segs: 16, rows: 4, depth: 0.7, wave: 0.03, waves: 18 });
    B.part(fan, B.mat('lace', 0x2a2030, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), rig.neck, { pos: [0, 0.02, -0.02], outline: 0 });
    // long bell sleeves
    for (const fore of [rig.foreL, rig.foreR]) {
      B.part(skirtGeometry({ top: 0.045, bottom: 0.12, len: 0.34, segs: 16, rows: 5, depth: 1, wave: 0.02, waves: 8 }), B.mat('sleeveBell', P.primary, { side: THREE.DoubleSide }), fore, { pos: [0, -0.05, 0], outline: 0 });
    }
    // crown of thorns
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      B.part(new THREE.ConeGeometry(0.012, 0.09 + (i % 2) * 0.05, 4), silver, rig.headMesh, { pos: [Math.sin(a) * 0.1, 0.11, Math.cos(a) * 0.1], rot: [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25], outline: 0 });
    }
    // veil
    const veil = skirtGeometry({ top: 0.06, bottom: 0.16, len: 0.42, segs: 28, rows: 6, depth: 1.05, wave: 0.01, waves: 12 });
    const veilMat = new THREE.MeshStandardMaterial({ color: 0x0a0408, transparent: true, opacity: 0.72, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
    const vm = new THREE.Mesh(veil, veilMat);
    vm.position.set(0, 0.2, 0.005);
    vm.renderOrder = 3;
    rig.headMesh.add(vm);
    B.veil = vm;
  },

  /** Sister Elise — nun's habit. */
  nun(B, rig, spec) {
    const P = spec.palette;
    const robe = B.mat('robe', P.primary);
    B.part(lathe([[0.001, -0.02], [0.15, -0.02], [0.16, 0.12], [0.15, 0.2], [0.07, 0.25], [0.001, 0.26]], 18), robe, rig.chest, { scale: [1.08, 1, 0.74] });
    B.part(skirtGeometry({ top: 0.15, bottom: 0.32, len: 0.98, segs: 32, rows: 6, depth: 0.85, wave: 0.01, waves: 10 }), B.mat('robeSkirt', P.primary, { side: THREE.DoubleSide }), rig.hips, { pos: [0, 0.08, 0], outline: 0 });
    B.part(new THREE.SphereGeometry(0.13, 18, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.62), B.mat('veilCap', P.primary, { side: THREE.DoubleSide }), rig.headMesh, { pos: [0, 0.02, -0.02], scale: [1, 1.05, 1.08], outline: 0 });
    B.part(new THREE.SphereGeometry(0.128, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), B.mat('veilCap', P.primary, { side: THREE.DoubleSide }), rig.headMesh, { pos: [0, 0.025, -0.02], scale: [1, 1.05, 1.08], outline: 0 });
    B.part(skirtGeometry({ top: 0.12, bottom: 0.2, len: 0.42, phiStart: Math.PI * 0.4, phiLength: Math.PI * 1.2, segs: 14, rows: 4, depth: 1 }), B.mat('veilDrape', P.primary, { side: THREE.DoubleSide }), rig.headMesh, { pos: [0, 0.03, -0.01], outline: 0 });
    B.part(skirtLike(0.05, 0.16, -0.06, 0, Math.PI * 2), B.mat('wimple', 0xd8d0c8, { side: THREE.DoubleSide }), rig.neck, { pos: [0, 0.02, 0.0], outline: 0 });
    B.part(new THREE.BoxGeometry(0.015, 0.08, 0.01), B.mat('cross', 0xb8a070), rig.chest, { pos: [0, 0.08, 0.12], outline: 0 });
    B.part(new THREE.BoxGeometry(0.05, 0.013, 0.01), B.mat('cross', 0xb8a070), rig.chest, { pos: [0, 0.095, 0.12], outline: 0 });
  },

  /** Doran the blacksmith — rolled sleeves, leather apron, beard. */
  smith(B, rig, spec) {
    const P = spec.palette;
    B.part(lathe([[0.001, -0.02], [0.16, -0.02], [0.18, 0.12], [0.18, 0.2], [0.08, 0.25], [0.001, 0.26]], 18), B.mat('shirt', P.primary), rig.chest, { scale: [1.15, 1, 0.8] });
    B.part(new THREE.BoxGeometry(0.26, 0.7, 0.02), B.mat('apron', P.accent), rig.chest, { pos: [0, -0.25, 0.13], outline: 0.004 });
    B.part(new THREE.SphereGeometry(0.06, 12, 8, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.55, Math.PI * 0.45), B.mat('beard', spec.hair.root, { side: THREE.DoubleSide }), rig.headMesh, { pos: [0, -0.06, 0.035], scale: [1.15, 1.1, 1.1], outline: 0 });
  },

  /** Marta — shawl and long skirt. */
  peasant(B, rig, spec) {
    const P = spec.palette;
    B.part(lathe([[0.001, -0.02], [0.13, -0.02], [0.14, 0.12], [0.13, 0.2], [0.06, 0.25], [0.001, 0.26]], 18), B.mat('blouse', P.primary), rig.chest, { scale: [1.1, 1, 0.75] });
    B.part(skirtGeometry({ top: 0.14, bottom: 0.3, len: 0.95, segs: 28, rows: 5, depth: 0.85, wave: 0.015, waves: 9 }), B.mat('pskirt', P.accent, { side: THREE.DoubleSide }), rig.hips, { pos: [0, 0.08, 0], outline: 0 });
    B.part(skirtLike(0.06, 0.22, 0.2, 0, Math.PI * 2), B.mat('shawl', 0x3a2a28, { side: THREE.DoubleSide }), rig.neck, { pos: [0, 0.0, 0], outline: 0 });
  },

  /** Hollow Knight: hollowed royal guard in heavy plate with a tower shield and greatsword. */
  knight(B, rig, spec) {
    const P = spec.palette;
    const iron = B.mat('iron', P.primary, { rim: 0.9 });
    const trim = B.mat('trim', P.trim, { rim: 0.5 });
    const glow = glowMat(P.glow ?? 0x7a6aff);
    B.glowMats = [glow];
    // helmet with visor slit and crest
    B.part(lathe([[0.001, 0.2], [0.09, 0.19], [0.13, 0.12], [0.14, 0.0], [0.135, -0.12], [0.12, -0.15], [0.001, -0.15]], 16), iron, rig.headMesh, { scale: [1, 1, 1.05] });
    B.part(new THREE.BoxGeometry(0.19, 0.022, 0.03), glow, rig.headMesh, { pos: [0, 0.015, 0.135], outline: 0 });
    B.part(new THREE.BoxGeometry(0.02, 0.1, 0.03), glow, rig.headMesh, { pos: [0, -0.05, 0.138], outline: 0 });
    B.part(new THREE.BoxGeometry(0.025, 0.14, 0.3), B.mat('plume', P.accent), rig.headMesh, { pos: [0, 0.24, -0.03], outline: 0.003 });
    // plate cuirass
    B.part(lathe([[0.001, -0.03], [0.17, -0.03], [0.19, 0.08], [0.21, 0.15], [0.2, 0.21], [0.16, 0.24], [0.06, 0.26], [0.001, 0.26]], 18), iron, rig.chest, { scale: [1.15, 1, 0.82] });
    B.part(lathe([[0.001, -0.06], [0.17, -0.06], [0.165, 0.1], [0.17, 0.25], [0.001, 0.26]], 18), iron, rig.spine, { scale: [1.12, 1, 0.8] });
    B.part(new THREE.TorusGeometry(0.075, 0.016, 6, 14), glow, rig.neck, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    // fauld (skirt plates)
    B.part(skirtGeometry({ top: 0.18, bottom: 0.24, len: 0.26, segs: 20, rows: 3, depth: 0.8 }), B.mat('ironDS', P.primary, { side: THREE.DoubleSide, rim: 0.9 }), rig.hips, { pos: [0, 0.06, 0], outline: 0 });
    // tabard
    const tab = B.mat('tabard', P.accent, { side: THREE.DoubleSide });
    for (const z of [1, -1]) {
      const piv = B.pivot(rig.hips, 0, 0.08, z * 0.15, 'tabard' + z);
      const g = new THREE.PlaneGeometry(0.28, 0.75, 1, 6).translate(0, -0.375, 0);
      B.part(g, tab, piv, { outline: 0 });
      B.secondary.push({ obj: piv, kind: 'panel', thigh: z > 0 ? rig.thighL : rig.thighR, follow: 0.5, trail: 0.6, phase: z, rx: 0, rz: 0, stiff: 8 });
    }
    // pauldrons
    for (const [s, arm] of [[1, rig.armL], [-1, rig.armR]]) {
      for (let k = 0; k < 3; k++) B.part(new THREE.SphereGeometry(0.095 - k * 0.008, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), iron, arm, { pos: [s * 0.015, 0.03 - k * 0.04, 0], rot: [0, 0, s * (0.25 + k * 0.12)], scale: [1.1, 0.6, 1.05], outline: 0.004 });
      const fore = s > 0 ? rig.foreL : rig.foreR;
      B.part(lathe([[0.05, 0], [0.058, -0.08], [0.052, -0.2], [0.06, -0.24]], 12), iron, fore, { pos: [0, -0.02, 0], outline: 0.004 });
    }
    for (const sh of [rig.shinL, rig.shinR]) {
      B.part(lathe([[0.06, 0], [0.064, -0.12], [0.052, -0.36], [0.056, -0.42]], 12), iron, sh, { outline: 0.004 });
      B.part(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), trim, sh, { pos: [0, 0, 0.03], rot: [Math.PI / 2.3, 0, 0], scale: [1, 1, 0.7], outline: 0.004 });
    }
    // tower shield on the left forearm
    const shield = new THREE.Group();
    shield.position.set(0.05, -0.17, 0.07);
    shield.rotation.set(Math.PI / 2, 0, 0);
    rig.foreL.add(shield);
    B.part(new THREE.BoxGeometry(0.56, 0.86, 0.05), iron, shield, { outline: 0.006 });
    B.part(new THREE.BoxGeometry(0.6, 0.9, 0.03), trim, shield, { pos: [0, 0, -0.012], outline: 0 });
    B.part(new THREE.TorusGeometry(0.13, 0.025, 6, 16, Math.PI * 1.4), B.mat('emblem', P.accent, { emissive: 0x200008 }), shield, { pos: [0, 0.1, 0.04], rot: [0, 0, 0.6], outline: 0 });
    rig.shield = shield;
    // greatsword
    const sw = new THREE.Group();
    sw.position.set(0, -0.07, 0.01);
    rig.handR.add(sw);
    const blade = new THREE.Mesh(bladeGeometry(1.2, 0.05, 0.012, 0.22), new THREE.MeshStandardMaterial({ color: 0x55585f, metalness: 0.8, roughness: 0.45 }));
    blade.position.z = 0.14;
    blade.castShadow = true;
    sw.add(blade);
    B.part(new THREE.BoxGeometry(0.28, 0.04, 0.05), trim, sw, { pos: [0, 0, 0.12], outline: 0.003 });
    B.part(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), B.mat('grip', 0x1a1210), sw, { pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    rig.weapons.push(sw);
  },

  /** Night Stalker: emaciated, elongated predator of the dark. */
  stalker(B, rig, spec) {
    const P = spec.palette;
    const skinD = B.mat('stalkerSkin', P.primary, { rim: 1.4 });
    const glow = glowMat(P.glow ?? 0xff1830);
    B.glowMats = [glow];
    const head = B.part(new THREE.SphereGeometry(0.1, 16, 12), skinD, rig.headMesh, { pos: [0, 0.03, 0.02], scale: [0.95, 1.7, 1.15], outline: 0.004 });
    void head;
    B.part(new THREE.BoxGeometry(0.014, 0.1, 0.02), glow, rig.headMesh, { pos: [0, -0.06, 0.12], outline: 0 });
    for (const s of [-1, 1]) {
      B.part(new THREE.SphereGeometry(0.014, 8, 6), glow, rig.headMesh, { pos: [s * 0.035, 0.07, 0.105], outline: 0 });
      B.part(new THREE.SphereGeometry(0.009, 8, 6), glow, rig.headMesh, { pos: [s * 0.05, 0.11, 0.095], outline: 0 });
    }
    // lank hair
    const hs = buildHairstyle('countess', 0.1, { root: 0x050405, tip: 0x0a080c });
    if (hs.back.length) B.part(mergeLocks(hs.back.slice(0, 9)), B.mat('stalkerHair', 0xffffff, { vertexColors: true, rim: 1 }), rig.headMesh, { pos: [0, 0.03, 0], scale: [1, 0.6, 1], outline: 0.003 });
    // ribs / emaciated torso
    for (let i = 0; i < 4; i++) B.part(new THREE.TorusGeometry(0.12 - i * 0.008, 0.008, 4, 14, Math.PI), B.mat('ribs', 0x2a2228, { rim: 1 }), rig.chest, { pos: [0, 0.16 - i * 0.045, 0.02], rot: [0, 0, Math.PI], scale: [1.1, 0.5, 1], outline: 0 });
    // long claws
    for (const hand of [rig.handL, rig.handR]) {
      for (let k = 0; k < 3; k++) B.part(new THREE.ConeGeometry(0.009, 0.24, 4), B.mat('claw', 0xd8ccc0, { rim: 0.4 }), hand, { pos: [(k - 1) * 0.02, -0.19, 0.02], rot: [Math.PI + 0.25, 0, (k - 1) * 0.15], outline: 0 });
    }
    // tattered strips
    const cloth = B.mat('rags', P.accent, { side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const piv = B.pivot(rig.hips, Math.sin(a) * 0.13, 0.05, Math.cos(a) * 0.1, 'rag' + i);
      piv.rotation.y = a;
      const len = 0.5 + (i % 3) * 0.2;
      const g = new THREE.PlaneGeometry(0.09, len, 1, 4).translate(0, -len / 2, 0);
      B.part(g, cloth, piv, { outline: 0 });
      B.secondary.push({ obj: piv, kind: 'scarf', amount: 0.8, phase: i, rx: 0, rz: 0, stiff: 6 });
    }
  },

  /** Blood Mage: floating hooded caster with a blood orb. */
  mage(B, rig, spec) {
    const P = spec.palette;
    const robe = B.mat('robe', P.primary, { rim: 1, side: THREE.DoubleSide });
    const trim = B.mat('robeTrim', P.accent, { rim: 0.6, side: THREE.DoubleSide });
    const glow = glowMat(P.glow ?? 0xff2030);
    B.glowMats = [glow];
    B.part(lathe([[0.001, -0.02], [0.14, -0.02], [0.15, 0.12], [0.15, 0.2], [0.07, 0.25], [0.001, 0.26]], 16), robe, rig.chest, { scale: [1.1, 1, 0.8] });
    B.part(skirtGeometry({ top: 0.15, bottom: 0.42, len: 1.05, segs: 32, rows: 6, depth: 0.9, wave: 0.03, waves: 9 }), robe, rig.hips, { pos: [0, 0.1, 0], outline: 0 });
    B.part(skirtGeometry({ top: 0.42 * 0.99, bottom: 0.43, len: 0.08, segs: 32, rows: 1, depth: 0.9, wave: 0.03, waves: 9 }), trim, rig.hips, { pos: [0, 0.1 - 0.98, 0], outline: 0 });
    B.part(skirtLike(0.08, 0.3, 0.3, 0, Math.PI * 2), trim, rig.neck, { pos: [0, 0.02, 0], outline: 0 });
    // hood
    B.part(new THREE.SphereGeometry(0.15, 16, 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.75), robe, rig.headMesh, { pos: [0, 0.02, -0.01], scale: [1, 1.15, 1.1], outline: 0.004 });
    B.part(new THREE.ConeGeometry(0.08, 0.25, 8), robe, rig.headMesh, { pos: [0, 0.12, -0.12], rot: [-0.9, 0, 0], outline: 0.003 });
    B.part(new THREE.SphereGeometry(0.11, 12, 10), B.mat('void', 0x020102, { rim: 0 }), rig.headMesh, { pos: [0, 0, 0.0], outline: 0 });
    for (const s of [-1, 1]) B.part(new THREE.SphereGeometry(0.016, 8, 6), glow, rig.headMesh, { pos: [s * 0.04, 0.0, 0.1], outline: 0 });
    for (const fore of [rig.foreL, rig.foreR]) {
      B.part(skirtGeometry({ top: 0.045, bottom: 0.11, len: 0.3, segs: 14, rows: 3, depth: 1 }), robe, fore, { pos: [0, -0.02, 0], outline: 0 });
    }
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), glow);
    orb.position.set(0, 0.0, 0.34);
    rig.chest.add(orb);
    rig.orb = orb;
  },
};

/** Short open ring band (collars, shawls). Negative len grows upward. */
function skirtLike(top, bottom, len, phiStart, phiLength) {
  return skirtGeometry({ top, bottom, len, phiStart, phiLength, segs: 18, rows: 2, depth: 0.9 });
}

// ====================================================================== weapons
const WEAPONS = {
  longsword(B, rig, spec) {
    const P = spec.palette;
    const g = new THREE.Group();
    g.name = 'longsword';
    g.position.set(0, -0.07, 0.01);
    rig.handR.add(g);
    const blade = new THREE.Mesh(bladeGeometry(1.0, 0.032, 0.008, 0.2), new THREE.MeshStandardMaterial({ color: 0x0b0a10, metalness: 0.9, roughness: 0.22 }));
    blade.position.z = 0.12;
    blade.castShadow = true;
    g.add(blade);
    const edge = new THREE.Mesh(bladeGeometry(0.98, 0.036, 0.003, 0.2), glowMat(P.weaponGlow ?? 0xff1a30, 0.9));
    edge.position.z = 0.125;
    g.add(edge);
    const guardMat = B.mat('guard', P.trim, { rim: 0.4 });
    B.part(new THREE.BoxGeometry(0.2, 0.025, 0.03), guardMat, g, { pos: [0, 0, 0.11], outline: 0.004 });
    for (const s of [-1, 1]) B.part(new THREE.ConeGeometry(0.018, 0.08, 5), guardMat, g, { pos: [s * 0.12, 0, 0.13], rot: [Math.PI / 2, 0, -s * 0.6], outline: 0.003 });
    B.part(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8), B.mat('grip', 0x1a0d10), g, { pos: [0, 0, 0.0], rot: [Math.PI / 2, 0, 0], outline: 0.003 });
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.026), glowMat(P.weaponGlow ?? 0xff1a30));
    pommel.position.z = -0.11;
    g.add(pommel);
    rig.weapons.push(g);
    B.weaponGlow = [edge.material, pommel.material];
    rig.weaponTip = new THREE.Object3D();
    rig.weaponTip.position.z = 1.1;
    g.add(rig.weaponTip);
  },

  bloodblades(B, rig, spec) {
    const P = spec.palette;
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a0010, emissive: P.weaponGlow ?? 0xff1030, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.88 });
    B.weaponGlow = [mat];
    for (const [hand, s] of [[rig.handL, 1], [rig.handR, -1]]) {
      const g = new THREE.Group();
      g.position.set(s * 0.02, -0.08, 0.02);
      hand.add(g);
      const blade = new THREE.Mesh(bladeGeometry(0.62, 0.04, 0.012, 0.25), mat);
      blade.position.z = 0.04;
      blade.castShadow = true;
      g.add(blade);
      // crystalline guard ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), mat);
      ring.position.z = 0.03;
      g.add(ring);
      rig.weapons.push(g);
    }
    rig.weaponTip = new THREE.Object3D();
    rig.weaponTip.position.z = 0.7;
    rig.weapons[1].add(rig.weaponTip);
  },

  dualblades(B, rig, spec) {
    const P = spec.palette;
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8d0e0, metalness: 1, roughness: 0.25 });
    const edgeMat = glowMat(P.weaponGlow ?? 0x4aa8ff, 0.9);
    B.weaponGlow = [edgeMat];
    for (const [hand, s] of [[rig.handL, 1], [rig.handR, -1]]) {
      const g = new THREE.Group();
      g.position.set(0, -0.07, 0.01);
      hand.add(g);
      const blade = new THREE.Mesh(bladeGeometry(0.68, 0.03, 0.007, 0.16), steel);
      blade.position.z = 0.1;
      blade.castShadow = true;
      g.add(blade);
      const edge = new THREE.Mesh(bladeGeometry(0.66, 0.034, 0.003, 0.16), edgeMat);
      edge.position.z = 0.105;
      g.add(edge);
      B.part(new THREE.BoxGeometry(0.11, 0.02, 0.025), B.mat('guard', 0x2a2a34, { rim: 0.4 }), g, { pos: [0, 0, 0.09], outline: 0.003 });
      B.part(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), B.mat('grip', 0x101014), g, { pos: [0, 0, 0.0], rot: [Math.PI / 2, 0, 0], outline: 0.003 });
      rig.weapons.push(g);
      void s;
    }
    rig.weaponTip = new THREE.Object3D();
    rig.weaponTip.position.z = 0.78;
    rig.weapons[1].add(rig.weaponTip);
  },
};
