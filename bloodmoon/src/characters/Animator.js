/**
 * Procedural animation for the humanoid rig produced by CharacterBuilder.
 *
 * A locomotion pose (idle / walk / run / air) is computed every frame; one-shot actions
 * (attacks, casts, hits) are keyframed poses blended on top, per bone. Bone rotations are
 * absolute Euler angles in the bone's parent space.
 *
 * Sign conventions (model faces +Z):
 *   thigh.x < 0 → leg forward      shin.x > 0 → knee bends
 *   arm.x  < 0 → arm forward/up    fore.x < 0 → elbow bends forward
 *   armL.z > 0 / armR.z < 0 → arms raised sideways
 *   chest.y > 0 → torso turns to its left;  spine.x > 0 → lean forward
 */
import { smoothstep, lerp, clamp, damp } from '../core/utils.js';

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];

// ------------------------------------------------------------------ stance (idle upper body)
const STANCE = {
  sword: { armR: [-0.3, 0, -0.3], foreR: [-0.55, 0, 0], handR: [1.25, 0, 0.15], armL: [0.05, 0, 0.18], foreL: [-0.25, 0, 0] },
  blades: { armL: [-0.15, 0, 0.32], armR: [-0.15, 0, -0.32], foreL: [-0.55, 0, 0], foreR: [-0.55, 0, 0], handL: [0.6, 0, 0], handR: [0.6, 0, 0] },
  dual: { armL: [-0.35, 0, 0.2], armR: [-0.35, 0, -0.2], foreL: [-1.0, 0, 0], foreR: [-1.0, 0, 0], handL: [0.75, 0, 0], handR: [0.75, 0, 0] },
  npc: { armL: [0.05, 0, 0.1], armR: [0.05, 0, -0.1], foreL: [-0.15, 0, 0], foreR: [-0.15, 0, 0] },
  knight: { armR: [-0.4, 0, -0.18], foreR: [-0.6, 0, 0], handR: [0.5, 0, 0], armL: [-0.6, 0.3, 0.25], foreL: [-1.1, 0, 0] },
  stalker: { spine: [0.45, 0, 0], neck: [-0.3, 0, 0], armL: [-0.4, 0, 0.35], armR: [-0.4, 0, -0.35], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0] },
  boss: { armL: [-0.2, 0, 0.4], armR: [-0.2, 0, -0.4], foreL: [-0.5, 0, 0], foreR: [-0.5, 0, 0], handL: [0.3, 0, 0], handR: [0.3, 0, 0] },
};

// ------------------------------------------------------------------ actions
// keys: [t (0..1), { bone: [x,y,z], hipsY, lean, bodyY }]
const A = {
  // ---- Lucien longsword
  sword1: [[0, { chest: [0, -0.75, 0], armR: [-1.9, 0, -1.0], foreR: [-0.5, 0, 0], handR: [0.2, 0, 0.6], spine: [0.1, 0, 0] }],
    [0.42, { chest: [0, 0.6, 0], armR: [-1.1, 0, 0.5], foreR: [-0.2, 0, 0], handR: [0.9, 0, -0.4], spine: [0.25, 0, 0] }],
    [1, { chest: [0, 0.25, 0], armR: [-0.6, 0, 0.1], foreR: [-0.5, 0, 0], handR: [0.6, 0, 0], spine: [0.12, 0, 0] }]],
  sword2: [[0, { chest: [0, 0.75, 0], armR: [-1.5, 0, 0.6], foreR: [-0.9, 0, 0], handR: [0.8, 0, -0.8], spine: [0.1, 0, 0] }],
    [0.42, { chest: [0, -0.6, 0], armR: [-1.3, 0, -1.2], foreR: [-0.1, 0, 0], handR: [0.9, 0, 0.6], spine: [0.22, 0, 0] }],
    [1, { chest: [0, -0.2, 0], armR: [-0.5, 0, -0.35], foreR: [-0.6, 0, 0], handR: [0.5, 0, 0], spine: [0.1, 0, 0] }]],
  sword3: [[0, { chest: [0, -0.2, 0], armR: [-2.9, 0, -0.3], foreR: [-0.4, 0, 0], handR: [0.1, 0, 0], armL: [-2.6, 0, 0.3], spine: [-0.2, 0, 0], hipsY: 0.04 }],
    [0.45, { chest: [0, 0.1, 0], armR: [-0.7, 0, -0.1], foreR: [-0.2, 0, 0], handR: [0.9, 0, 0], armL: [-0.5, 0, 0.4], spine: [0.55, 0, 0], hipsY: -0.12 }],
    [1, { chest: [0, 0, 0], armR: [-0.5, 0, -0.2], foreR: [-0.5, 0, 0], handR: [0.6, 0, 0], armL: [0, 0, 0.2], spine: [0.2, 0, 0], hipsY: -0.04 }]],
  swordHeavy: [[0, { chest: [0, -1.1, 0], armR: [-1.6, 0, -1.3], foreR: [-0.4, 0, 0], handR: [0.4, 0, 0.8], spine: [0.05, 0, 0], hipsY: -0.08 }],
    [0.4, { chest: [0, -1.25, 0], armR: [-1.7, 0, -1.4], foreR: [-0.3, 0, 0], handR: [0.4, 0, 0.8], spine: [0.1, 0, 0], hipsY: -0.12 }],
    [0.6, { chest: [0, 1.0, 0], armR: [-1.2, 0, 0.7], foreR: [-0.1, 0, 0], handR: [1.0, 0, -0.6], spine: [0.3, 0, 0], hipsY: -0.14 }],
    [1, { chest: [0, 0.3, 0], armR: [-0.6, 0, 0.1], foreR: [-0.5, 0, 0], handR: [0.6, 0, 0], spine: [0.12, 0, 0], hipsY: -0.04 }]],
  // ---- Seraphina blood blades
  blades1: [[0, { chest: [0, -0.6, 0], armR: [-1.2, 0, -1.3], foreR: [-0.3, 0, 0], handR: [0.8, 0, 0.5] }],
    [0.4, { chest: [0, 0.55, 0], armR: [-1.4, 0, 0.6], foreR: [-0.1, 0, 0], handR: [1.1, 0, -0.5] }],
    [1, { chest: [0, 0.2, 0], armR: [-0.4, 0, -0.1], foreR: [-0.5, 0, 0], handR: [0.6, 0, 0] }]],
  blades2: [[0, { chest: [0, 0.6, 0], armL: [-1.2, 0, 1.3], foreL: [-0.3, 0, 0], handL: [0.8, 0, -0.5] }],
    [0.4, { chest: [0, -0.55, 0], armL: [-1.4, 0, -0.6], foreL: [-0.1, 0, 0], handL: [1.1, 0, 0.5] }],
    [1, { chest: [0, -0.2, 0], armL: [-0.4, 0, 0.1], foreL: [-0.5, 0, 0], handL: [0.6, 0, 0] }]],
  blades3: [[0, { armL: [-1.6, 0, -0.5], armR: [-1.6, 0, 0.5], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0], spine: [-0.15, 0, 0] }],
    [0.4, { armL: [-1.3, 0, 1.4], armR: [-1.3, 0, -1.4], foreL: [0, 0, 0], foreR: [0, 0, 0], spine: [0.3, 0, 0], hipsY: -0.1 }],
    [1, { armL: [-0.3, 0, 0.4], armR: [-0.3, 0, -0.4], foreL: [-0.5, 0, 0], foreR: [-0.5, 0, 0], spine: [0.1, 0, 0] }]],
  throw: [[0, { chest: [0, -0.9, 0], armR: [-0.6, 0, -1.4], foreR: [-1.2, 0, 0] }],
    [0.45, { chest: [0, 0.5, 0], armR: [-1.5, 0, 0.3], foreR: [0, 0, 0], handR: [0.5, 0, 0] }],
    [1, { chest: [0, 0.1, 0], armR: [-0.5, 0, -0.2], foreR: [-0.4, 0, 0] }]],
  // ---- Kairo twin blades
  dual1: [[0, { chest: [0, -0.5, 0], armR: [-1.0, 0, -1.1], foreR: [-0.8, 0, 0], handR: [0.6, 0, 0.5] }],
    [0.4, { chest: [0, 0.5, 0], armR: [-1.4, 0, 0.4], foreR: [-0.1, 0, 0], handR: [1.0, 0, -0.5], spine: [0.2, 0, 0] }],
    [1, { chest: [0, 0.2, 0], armR: [-0.5, 0, -0.1], foreR: [-0.9, 0, 0] }]],
  dual2: [[0, { chest: [0, 0.5, 0], armL: [-1.0, 0, 1.1], foreL: [-0.8, 0, 0], handL: [0.6, 0, -0.5] }],
    [0.4, { chest: [0, -0.5, 0], armL: [-1.4, 0, -0.4], foreL: [-0.1, 0, 0], handL: [1.0, 0, 0.5], spine: [0.2, 0, 0] }],
    [1, { chest: [0, -0.2, 0], armL: [-0.5, 0, 0.1], foreL: [-0.9, 0, 0] }]],
  dual3: [[0, { armR: [0.3, 0, -0.3], foreR: [-1.4, 0, 0], spine: [0.3, 0, 0], hipsY: -0.12 }],
    [0.4, { armR: [-2.5, 0, -0.2], foreR: [-0.1, 0, 0], handR: [0.3, 0, 0], spine: [-0.2, 0, 0], hipsY: 0.05 }],
    [1, { armR: [-0.6, 0, -0.2], foreR: [-0.9, 0, 0], spine: [0.05, 0, 0] }]],
  dual4: [[0, { chest: [0, -1.2, 0], armL: [-1.3, 0, 1.4], armR: [-1.3, 0, -1.4], foreL: [0, 0, 0], foreR: [0, 0, 0], hipsY: -0.1 }],
    [0.5, { chest: [0, 1.3, 0], armL: [-1.3, 0, 1.4], armR: [-1.3, 0, -1.4], foreL: [0, 0, 0], foreR: [0, 0, 0], hipsY: -0.1, bodyY: 3.14 }],
    [1, { chest: [0, 0, 0], armL: [-0.4, 0, 0.3], armR: [-0.4, 0, -0.3], foreL: [-0.9, 0, 0], foreR: [-0.9, 0, 0], bodyY: 6.28 }]],
  block: [[0, { armL: [-1.25, -0.3, -0.5], armR: [-1.25, 0.3, 0.5], foreL: [-1.3, 0, 0], foreR: [-1.3, 0, 0], handL: [0.2, 0, 0.6], handR: [0.2, 0, -0.6], spine: [0.15, 0, 0], hipsY: -0.07 }],
    [1, { armL: [-1.25, -0.3, -0.5], armR: [-1.25, 0.3, 0.5], foreL: [-1.3, 0, 0], foreR: [-1.3, 0, 0], handL: [0.2, 0, 0.6], handR: [0.2, 0, -0.6], spine: [0.15, 0, 0], hipsY: -0.07 }]],
  // ---- generic
  castL: [[0, { armL: [-0.4, 0, 0.6], foreL: [-1.2, 0, 0], chest: [0, 0.3, 0] }],
    [0.35, { armL: [-1.55, 0, 0.1], foreL: [-0.05, 0, 0], handL: [-0.3, 0, 0], chest: [0, -0.35, 0], spine: [0.1, 0, 0] }],
    [1, { armL: [-1.4, 0, 0.15], foreL: [-0.1, 0, 0], handL: [-0.3, 0, 0], chest: [0, -0.3, 0] }]],
  castUp: [[0, { armL: [-0.5, 0, 0.5], armR: [-0.5, 0, -0.5], foreL: [-1, 0, 0], foreR: [-1, 0, 0] }],
    [0.4, { armL: [-2.8, 0, 0.35], armR: [-2.8, 0, -0.35], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], head: [-0.35, 0, 0], spine: [-0.15, 0, 0] }],
    [1, { armL: [-2.8, 0, 0.35], armR: [-2.8, 0, -0.35], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], head: [-0.35, 0, 0], spine: [-0.15, 0, 0] }]],
  ultimate: [[0, { armL: [0, 0, 0.3], armR: [0, 0, -0.3], spine: [0.3, 0, 0], head: [0.3, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.2, 0, 0], shinL: [0.8, 0, 0], shinR: [0.6, 0, 0] }],
    [0.3, { armL: [-0.2, 0, 1.5], armR: [-0.2, 0, -1.5], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], spine: [-0.25, 0, 0], head: [-0.4, 0, 0], thighL: [0.1, 0, 0], thighR: [0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.5, 0, 0] }],
    [1, { armL: [-0.2, 0, 1.5], armR: [-0.2, 0, -1.5], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], spine: [-0.25, 0, 0], head: [-0.4, 0, 0], thighL: [0.1, 0, 0], thighR: [0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.5, 0, 0] }]],
  dash: [[0, { spine: [0.7, 0, 0], armL: [0.9, 0, 0.3], armR: [0.9, 0, -0.3], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], thighL: [-0.6, 0, 0], thighR: [0.5, 0, 0], shinL: [0.6, 0, 0], shinR: [0.9, 0, 0], hipsY: -0.15 }],
    [1, { spine: [0.7, 0, 0], armL: [0.9, 0, 0.3], armR: [0.9, 0, -0.3], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], thighL: [-0.6, 0, 0], thighR: [0.5, 0, 0], shinL: [0.6, 0, 0], shinR: [0.9, 0, 0], hipsY: -0.15 }]],
  hit: [[0, { spine: [-0.35, 0, 0.1], head: [-0.3, 0, 0], armL: [-0.5, 0, 0.6], armR: [-0.5, 0, -0.6] }],
    [1, { spine: [0, 0, 0], head: [0, 0, 0] }]],
  drink: [[0, { armR: [-1.6, 0, 0.3], foreR: [-1.7, 0, 0], head: [-0.3, 0, 0] }], [1, { armR: [-1.6, 0, 0.3], foreR: [-1.7, 0, 0], head: [-0.3, 0, 0] }]],
  interact: [[0, { armR: [-0.3, 0, -0.1], spine: [0, 0, 0] }], [0.5, { armR: [-1.2, 0, -0.1], foreR: [-0.2, 0, 0], spine: [0.25, 0, 0] }], [1, { armR: [-0.3, 0, -0.1], spine: [0, 0, 0] }]],
  // ---- enemies / boss
  knightSwing: [[0, { armR: [-2.8, 0, -0.4], foreR: [-0.3, 0, 0], handR: [0.2, 0, 0], chest: [0, -0.4, 0], spine: [-0.1, 0, 0] }],
    [0.55, { armR: [-2.9, 0, -0.4], foreR: [-0.4, 0, 0], handR: [0.2, 0, 0], chest: [0, -0.45, 0], spine: [-0.15, 0, 0] }],
    [0.7, { armR: [-0.6, 0, 0.1], foreR: [-0.1, 0, 0], handR: [0.9, 0, 0], chest: [0, 0.3, 0], spine: [0.45, 0, 0], hipsY: -0.1 }],
    [1, { armR: [-0.5, 0, -0.2], foreR: [-0.5, 0, 0], handR: [0.6, 0, 0], chest: [0, 0, 0], spine: [0.1, 0, 0] }]],
  shieldUp: [[0, { armL: [-1.4, 0.6, 0.1], foreL: [-1.3, 0, 0], spine: [0.15, 0, 0] }], [1, { armL: [-1.4, 0.6, 0.1], foreL: [-1.3, 0, 0], spine: [0.15, 0, 0] }]],
  claw: [[0, { armL: [-2.4, 0, 0.8], armR: [-2.4, 0, -0.8], foreL: [-0.4, 0, 0], foreR: [-0.4, 0, 0], spine: [-0.1, 0, 0], head: [-0.4, 0, 0] }],
    [0.6, { armL: [-2.5, 0, 0.9], armR: [-2.5, 0, -0.9], foreL: [-0.5, 0, 0], foreR: [-0.5, 0, 0], spine: [-0.2, 0, 0], head: [-0.4, 0, 0] }],
    [0.75, { armL: [-0.6, 0, -0.3], armR: [-0.6, 0, 0.3], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], spine: [0.7, 0, 0], head: [0.1, 0, 0] }],
    [1, { armL: [-0.4, 0, 0.35], armR: [-0.4, 0, -0.35], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0], spine: [0.45, 0, 0] }]],
  bossCast: [[0, { armR: [-0.4, 0, -0.4], foreR: [-0.5, 0, 0] }], [0.5, { armR: [-2.6, 0, -0.5], foreR: [-0.2, 0, 0], head: [-0.2, 0, 0] }], [1, { armR: [-2.6, 0, -0.5], foreR: [-0.2, 0, 0], head: [-0.2, 0, 0] }]],
  bossSweep: [[0, { chest: [0, -0.9, 0], armR: [-1.2, 0, -1.5], foreR: [-0.2, 0, 0] }], [0.6, { chest: [0, -1.0, 0], armR: [-1.3, 0, -1.55], foreR: [-0.2, 0, 0] }],
    [0.78, { chest: [0, 0.9, 0], armR: [-1.4, 0, 0.8], foreR: [0, 0, 0] }], [1, { chest: [0, 0.2, 0], armR: [-0.3, 0, -0.4], foreR: [-0.4, 0, 0] }]],
  kneel: [[0, { spine: [0.3, 0, 0], head: [0.4, 0, 0], armL: [0, 0, 0.2], armR: [0, 0, -0.2], hipsY: -0.3 }], [1, { spine: [0.7, 0, 0], head: [0.6, 0, 0], armL: [0.2, 0, 0.1], armR: [0.2, 0, -0.1], hipsY: -0.55 }]],
  cower: [[0, { spine: [0.5, 0, 0], head: [0.5, 0, 0], armL: [-1.6, -0.5, -0.3], armR: [-1.6, 0.5, 0.3], foreL: [-1.8, 0, 0], foreR: [-1.8, 0, 0], thighL: [-1.2, 0, 0], thighR: [-1.2, 0, 0], shinL: [2.0, 0, 0], shinR: [2.0, 0, 0], hipsY: -0.55 }],
    [1, { spine: [0.5, 0, 0], head: [0.5, 0, 0], armL: [-1.6, -0.5, -0.3], armR: [-1.6, 0.5, 0.3], foreL: [-1.8, 0, 0], foreR: [-1.8, 0, 0], thighL: [-1.2, 0, 0], thighR: [-1.2, 0, 0], shinL: [2.0, 0, 0], shinR: [2.0, 0, 0], hipsY: -0.55 }]],
  talk: [[0, { armR: [-0.5, 0, -0.2], foreR: [-0.9, 0, 0], head: [0.05, 0, 0] }], [0.5, { armR: [-0.7, 0, -0.3], foreR: [-1.1, 0, 0], head: [-0.05, 0.1, 0] }], [1, { armR: [-0.5, 0, -0.2], foreR: [-0.9, 0, 0], head: [0.05, 0, 0] }]],
};

// Fill missing bones in later/earlier keys so every key defines the same set
const SPECIAL = ['hipsY', 'lean', 'bodyY'];
for (const keys of Object.values(A)) {
  const names = new Set();
  for (const [, p] of keys) Object.keys(p).forEach((k) => names.add(k));
  for (const n of names) {
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][1][n] !== undefined) continue;
      let v;
      for (let j = i - 1; j >= 0 && v === undefined; j--) v = keys[j][1][n];
      for (let j = i + 1; j < keys.length && v === undefined; j++) v = keys[j][1][n];
      keys[i][1][n] = Array.isArray(v) ? v.slice() : v;
    }
  }
}

export class Animator {
  constructor(model, style = 'npc') {
    this.model = model;
    this.rig = model.rig;
    this.style = style;
    this.phase = 0;
    this.action = null;
    this.t = 0;
    this.speedBlend = 0;
    this.airBlend = 0;
    this.deadT = -1;
    this.pose = {};
    this.lockedStance = false;
    for (const b of BONES) this.pose[b] = [0, 0, 0];
    this.extra = { hipsY: 0, lean: 0, bodyY: 0 };
    this.breath = Math.random() * 10;
  }

  /** Play a keyframed action for `dur` seconds. opts: { loop, hold, onDone, speed } */
  play(name, dur, opts = {}) {
    const keys = A[name];
    if (!keys) {
      console.warn('[Animator] unknown action', name);
      return;
    }
    this.action = { name, keys, dur, t: 0, loop: !!opts.loop, hold: !!opts.hold, onDone: opts.onDone, fadeIn: opts.fadeIn ?? 0.06, w: this.action ? 1 : 0 };
  }

  stop(fade = true) {
    if (!this.action) return;
    if (fade) this.action.fadingOut = true;
    else this.action = null;
  }

  isPlaying(name) { return this.action && !this.action.fadingOut && (!name || this.action.name === name); }

  die() { this.deadT = 0; this.action = null; }
  revive() { this.deadT = -1; this.model.rig.body.rotation.set(0, 0, 0); this.model.rig.body.position.set(0, 0, 0); }

  _locomotion(dt, s) {
    const P = this.pose;
    for (const b of BONES) { P[b][0] = 0; P[b][1] = 0; P[b][2] = 0; }
    const speed = s.speed || 0;
    const run = clamp((speed - 3) / 4, 0, 1);
    this.speedBlend = damp(this.speedBlend, clamp(speed / 2.5, 0, 1), 10, dt);
    this.airBlend = damp(this.airBlend, s.grounded === false ? 1 : 0, 12, dt);
    const stride = s.strideScale ?? 1;
    this.phase += dt * (speed * 1.45 / stride + 0.001);
    const ph = this.phase;
    const w = this.speedBlend;
    const legA = lerp(0.55, 0.85, run) * w;
    const kneeA = lerp(0.7, 1.25, run) * w;
    const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
    P.thighL[0] = -sL * legA;
    P.thighR[0] = -sR * legA;
    P.shinL[0] = Math.max(0, Math.sin(ph + 1.9)) * kneeA + 0.05;
    P.shinR[0] = Math.max(0, Math.sin(ph + Math.PI + 1.9)) * kneeA + 0.05;
    P.footL[0] = Math.max(0, -sL) * 0.3 * w;
    P.footR[0] = Math.max(0, -sR) * 0.3 * w;
    const armA = lerp(0.35, 0.7, run) * w;
    P.armL[0] = sL * armA;
    P.armR[0] = sR * armA;
    P.armL[2] = 0.12;
    P.armR[2] = -0.12;
    P.foreL[0] = -0.25 - run * 0.6 * w;
    P.foreR[0] = -0.25 - run * 0.6 * w;
    P.chest[1] = sL * 0.12 * w;
    P.spine[0] = lerp(0.05, 0.28, run) * w;
    this.extra.hipsY = -Math.abs(Math.cos(ph)) * 0.035 * w;
    // idle breathing
    this.breath += dt;
    const br = Math.sin(this.breath * 1.6) * (1 - w);
    P.chest[0] = br * 0.025;
    P.head[0] += -br * 0.02;
    P.spine[0] += 0.02;
    // stance blend (weapon-ready upper body), weaker when running
    const stance = STANCE[this.style];
    if (stance) {
      const k = this.style === 'npc' ? 1 - w : 1 - run * 0.65;
      for (const b in stance) {
        P[b][0] = lerp(P[b][0], stance[b][0] + (b === 'armL' || b === 'armR' ? P[b][0] * 0.3 : 0), k);
        P[b][1] = lerp(P[b][1], stance[b][1], k);
        P[b][2] = lerp(P[b][2], stance[b][2], k);
      }
    }
    // airborne pose
    if (this.airBlend > 0.01) {
      const a = this.airBlend;
      const rising = (s.vy || 0) > 0 ? 1 : 0.4;
      P.thighL[0] = lerp(P.thighL[0], -0.7 * rising, a);
      P.thighR[0] = lerp(P.thighR[0], 0.15, a);
      P.shinL[0] = lerp(P.shinL[0], 0.9, a);
      P.shinR[0] = lerp(P.shinR[0], 0.5, a);
      P.armL[2] = lerp(P.armL[2], 0.5, a * 0.6);
      P.armR[2] = lerp(P.armR[2], -0.5, a * 0.6);
    }
    // looking (head turn toward a target)
    if (s.lookYaw) P.head[1] = clamp(s.lookYaw, -0.9, 0.9);
  }

  update(dt, s = {}) {
    const rig = this.rig;
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = smoothstep(0, 0.9, this.deadT);
      rig.body.rotation.x = -1.45 * k;
      rig.body.position.y = 0.12 * k;
      rig.body.position.z = -0.1 * k;
      // limp limbs
      for (const b of ['armL', 'armR']) rig[b].rotation.z = lerp(rig[b].rotation.z, b === 'armL' ? 1.0 : -1.0, k * 0.2);
      rig.thighL.rotation.x = lerp(rig.thighL.rotation.x, -0.3, k * 0.2);
      rig.shinL.rotation.x = lerp(rig.shinL.rotation.x, 0.6, k * 0.2);
      rig.head.rotation.x = lerp(rig.head.rotation.x, -0.3, k * 0.2);
      return;
    }
    this._locomotion(dt, s);
    const P = this.pose;
    let hipsY = this.extra.hipsY, lean = 0, bodyY = 0;

    const act = this.action;
    if (act) {
      act.t += dt;
      let k = act.t / act.dur;
      if (k >= 1) {
        if (act.loop) { act.t %= act.dur; k = act.t / act.dur; }
        else if (act.hold) k = 1;
        else if (!act.fadingOut) {
          act.fadingOut = true;
          if (act.onDone) act.onDone();
        }
      }
      k = clamp(k, 0, 1);
      if (act.fadingOut) act.w -= dt / 0.12;
      else act.w = Math.min(1, act.w + dt / Math.max(0.001, act.fadeIn));
      if (act.w <= 0) {
        this.action = null;
      } else {
        const keys = act.keys;
        let i = 0;
        while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
        const [t0, p0] = keys[i], [t1, p1] = keys[Math.min(i + 1, keys.length - 1)];
        const f = t1 > t0 ? smoothstep(0, 1, (k - t0) / (t1 - t0)) : 1;
        const w = clamp(act.w, 0, 1);
        for (const b in p0) {
          if (SPECIAL.includes(b)) {
            const v = lerp(p0[b], p1[b], f) * w;
            if (b === 'hipsY') hipsY = lerp(hipsY, p0[b] + (p1[b] - p0[b]) * f, w);
            else if (b === 'lean') lean = v;
            else bodyY = v;
            continue;
          }
          const a = p0[b], c = p1[b];
          const dst = P[b];
          if (!dst) continue;
          dst[0] = lerp(dst[0], lerp(a[0], c[0], f), w);
          dst[1] = lerp(dst[1], lerp(a[1], c[1], f), w);
          dst[2] = lerp(dst[2], lerp(a[2], c[2], f), w);
        }
      }
    }
    for (const b of BONES) {
      const p = P[b];
      rig[b].rotation.set(p[0], p[1], p[2]);
    }
    rig.hips.position.y = 0.98 + hipsY;
    rig.body.rotation.x = lean;
    rig.body.rotation.y = bodyY;
  }
}

export const ACTIONS = A;
