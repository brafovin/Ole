/**
 * Enemy archetypes. Numbers are tuned for a forgiving introductory chapter.
 */
import * as THREE from '../three.js';
import { toon, addOutline, glowMat } from '../gfx/materials.js';
import { convertToSkinned } from '../characters/skinning.js';

export const ENEMY_TYPES = {
  crawler: {
    name: 'Blood Crawler', hp: 34, speed: 5.2, radius: 0.5, detect: 15, attackRange: 1.9, damage: 7,
    windup: 0.42, strike: 0.28, recover: 0.55, cooldown: 0.9, xp: 12, poise: 8, mass: 0.6, blood: 4, height: 0.7,
  },
  knight: {
    name: 'Hollow Knight', hp: 150, speed: 2.1, radius: 0.62, detect: 13, attackRange: 2.7, damage: 18,
    windup: 0.85, strike: 0.25, recover: 0.85, cooldown: 1.6, xp: 45, poise: 40, mass: 2.2, blood: 10, height: 2.1, blocks: true,
    spec: {
      id: 'knight', female: false, height: 2.05, skin: 0x3a3440, noHead: true, outfit: 'knight', bodyXZ: 1.15,
      palette: { primary: 0x30303a, trim: 0x8a8a9a, accent: 0x4a0a14, legs: 0x1a1a20, boots: 0x22222a, gloves: 0x2a2a30, sleeve: 0x2a2a32, inner: 0x2a2a32, glow: 0x8a7aff, bootHeight: 0.4 },
    },
    style: 'knight',
  },
  stalker: {
    name: 'Night Stalker', hp: 80, speed: 6.2, radius: 0.5, detect: 17, attackRange: 2.2, damage: 13,
    windup: 0.5, strike: 0.22, recover: 0.6, cooldown: 1.3, xp: 30, poise: 18, mass: 1, blood: 8, height: 2.4, stealth: true,
    spec: {
      id: 'stalker', female: false, height: 2.3, skin: 0x0d0a0e, noHead: true, outfit: 'stalker', bodyXZ: 0.72, armScale: 1.3,
      palette: { primary: 0x0c0a0e, accent: 0x15101a, legs: 0x0c0a0e, boots: 0x0c0a0e, gloves: 0x0c0a0e, sleeve: 0x0c0a0e, inner: 0x0c0a0e, glow: 0xff1830, bootHeight: 0.1 },
    },
    style: 'stalker',
  },
  mage: {
    name: 'Blood Mage', hp: 65, speed: 2.8, radius: 0.5, detect: 22, attackRange: 17, keep: [7, 13], damage: 12,
    windup: 0.9, strike: 0.2, recover: 0.6, cooldown: 2.3, xp: 30, poise: 14, mass: 0.8, blood: 8, height: 2.0, ranged: true,
    spec: {
      id: 'mage', female: false, height: 1.95, skin: 0x1a1016, noHead: true, outfit: 'mage', hideLegs: true,
      palette: { primary: 0x1c0a12, accent: 0x6a0a1a, inner: 0x1c0a12, sleeve: 0x1c0a12, gloves: 0x2a1a1e, legs: 0x1c0a12, glow: 0xff2030 },
    },
    style: 'boss',
  },
};

/** Six-legged blood crawler (non-humanoid). */
export function buildCrawler() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.45;
  root.add(body);
  const flesh = toon(0x3a0a12, { rim: 1.2 });
  const dark = toon(0x14060a, { rim: 1 });
  const bone = toon(0xc8b8a8, { rim: 0.4 });
  const eye = glowMat(0xff2a2a);
  const mats = [flesh, dark, bone];
  const mk = (geo, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, outline = 0.012) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    if (outline) addOutline(m, outline);
    parent.add(m);
    return m;
  };
  const thorax = mk(new THREE.SphereGeometry(1, 16, 12), flesh, body, 0, 0, 0.05, 0, 0, 0, 0.32, 0.22, 0.38, 0.03);
  const abdomen = mk(new THREE.SphereGeometry(1, 16, 12), dark, body, 0, 0.08, -0.45, 0.2, 0, 0, 0.36, 0.28, 0.42, 0.03);
  void thorax;
  void abdomen;
  // spine ridges
  for (let i = 0; i < 6; i++) mk(new THREE.ConeGeometry(0.05, 0.22, 4), bone, body, 0, 0.22 + Math.sin(i * 0.6) * 0.06, 0.2 - i * 0.14, -0.4, 0, 0, 1, 1, 1, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.04, 0.38);
  body.add(head);
  mk(new THREE.SphereGeometry(1, 14, 10), flesh, head, 0, 0, 0.06, 0, 0, 0, 0.2, 0.16, 0.2, 0.04);
  const jawL = mk(new THREE.ConeGeometry(0.035, 0.24, 5), bone, head, 0.08, -0.06, 0.2, Math.PI / 2 + 0.3, 0, 0.35, 1, 1, 1, 0);
  const jawR = mk(new THREE.ConeGeometry(0.035, 0.24, 5), bone, head, -0.08, -0.06, 0.2, Math.PI / 2 + 0.3, 0, -0.35, 1, 1, 1, 0);
  for (const [x, y] of [[0.06, 0.07], [-0.06, 0.07], [0.11, 0.03], [-0.11, 0.03]]) mk(new THREE.SphereGeometry(0.028, 8, 6), eye, head, x, y, 0.2, 0, 0, 0, 1, 1, 1, 0);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const k = i % 3;
    const hip = new THREE.Group();
    hip.position.set(side * 0.26, 0, 0.22 - k * 0.24);
    hip.rotation.y = side * (Math.PI / 2 - 0.4 + k * 0.4) * -1 + (side > 0 ? 0 : 0);
    body.add(hip);
    const upper = new THREE.Group();
    hip.add(upper);
    mk(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6).translate(0, 0.25, 0), dark, upper, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.01);
    upper.rotation.z = -side * 1.0;
    const knee = new THREE.Group();
    knee.position.set(0, 0.5, 0);
    upper.add(knee);
    mk(new THREE.CylinderGeometry(0.012, 0.035, 0.7, 5).translate(0, -0.35, 0), bone, knee, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.008);
    knee.rotation.z = side * 2.3;
    legs.push({ hip, upper, knee, side, phase: (i % 2 === 0 ? 0 : Math.PI) + (side > 0 ? 0 : Math.PI) });
  }
  // position legs symmetric: left legs mirror to +x
  for (const l of legs) {
    const yaw = l.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    l.baseYaw = yaw + (l.side > 0 ? -1 : 1) * (0.5 - (legs.indexOf(l) % 3) * 0.5);
    l.hip.rotation.set(0, l.baseYaw, 0);
    l.upper.rotation.set(0.9, 0, 0);
    l.knee.rotation.set(-1.1, 0, 0);
  }
  root.traverse((o) => { if (o.userData.isOutline) o.castShadow = false; });
  jawL.userData.keep = jawR.userData.keep = true;
  convertToSkinned(root);
  return {
    root, body, head, legs, jawL, jawR, mats, eyeMat: eye,
    animate(dt, t, speed, state, k) {
      const gait = Math.min(1, speed / 3);
      for (const l of legs) {
        const ph = t * (8 + speed * 2) + l.phase;
        l.upper.rotation.x = 0.9 + Math.max(0, Math.sin(ph)) * 0.35 * gait;
        l.hip.rotation.y = l.baseYaw + Math.cos(ph) * 0.3 * gait;
      }
      body.position.y = 0.45 + Math.abs(Math.sin(t * 16)) * 0.03 * gait;
      const open = state === 'windup' ? 0.6 * k : state === 'strike' ? 0.8 : 0.1 + Math.sin(t * 6) * 0.05;
      jawL.rotation.z = 0.35 + open;
      jawR.rotation.z = -0.35 - open;
      body.rotation.x = state === 'windup' ? -0.25 * k : state === 'strike' ? 0.25 : 0;
    },
  };
}
