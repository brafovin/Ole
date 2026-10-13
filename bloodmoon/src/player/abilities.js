/**
 * Supernatural abilities for the three playable characters.
 * Each ability: cast(game, player) → true when it was used (cost + cooldown are then applied),
 * or false (e.g. no target) so nothing is spent. Damage scales with player.stats.dmgBase.
 */
import * as THREE from '../three.js';
import { rand, clamp, easeOutCubic } from '../core/utils.js';

const _v = new THREE.Vector3();

/** Furthest free point along dir up to maxDist. */
function travelPoint(g, from, dir, maxDist, radius = 0.5) {
  // passes over low obstacles (pews, crates) and ignores anything we are already standing inside
  const hit = g.collision.raycast(from.x, from.z, dir.x, dir.z, maxDist, 'all', 1.3, true);
  let d = Math.max(0, hit - radius - 0.1);
  const p = new THREE.Vector3();
  for (; d > 0; d -= 0.5) {
    p.set(from.x + dir.x * d, 0, from.z + dir.z * d);
    if (!g.collision.overlaps(p.x, p.z, radius)) return p;
  }
  return from.clone().setY(0);
}

function noTarget(g) {
  g.ui.toast('No target in range', 'warn');
  g.audio.play('denied');
  return false;
}

// =================================================================== LUCIEN
const lucien = {
  q(g, P) { // Shadow Blink
    const dir = P.aimDir();
    const start = P.pos.clone();
    const dest = travelPoint(g, start, dir, 8.5, P.radius);
    const dmg = P.stats.dmgBase * 2.6;
    g.fx.afterimage(P.model.root, 0x5a0010, 0.5);
    g.particles.dark.burst(_v.set(start.x, 1, start.z), 40, { color: 0x0a0006, size: 0.5, speed: 4, life: 0.7, gravity: 1 });
    g.particles.add.burst(_v.set(start.x, 1, start.z), 20, { color: 0xff1030, size: 0.2, speed: 4, life: 0.5 });
    g.combat.area(start, 3.2, dmg, { ability: true, knock: 5, poise: 30 });
    P.pos.copy(dest);
    P.facing = Math.atan2(dir.x, dir.z);
    P.invuln = Math.max(P.invuln, 0.35);
    g.fx.ring(dest, { r0: 0.5, r1: 3.6, color: 0xff1030, dur: 0.45 });
    g.fx.sphereFlash(_v.set(dest.x, 1, dest.z), 0x40000a, 2.2, 0.35, 0.7);
    g.particles.dark.burst(_v.set(dest.x, 1, dest.z), 40, { color: 0x0a0006, size: 0.5, speed: 4, life: 0.7, gravity: 1 });
    g.combat.area(dest, 3.2, dmg, { ability: true, knock: 6, poise: 30 });
    g.fx.flash(_v.set(dest.x, 1.5, dest.z), 0xff1030, 6, 0.3);
    g.audio.play('blink');
    g.shake(0.25);
    P.anim.play('sword2', 0.35);
    return true;
  },

  e(g, P) { // Soul Drain
    const dir = P.aimDir();
    const target = g.enemies.nearestInCone(P.pos, dir, 14, 0.75) || g.enemies.nearest(P.pos, 5);
    if (!target) return noTarget(g);
    const dur = 1.25;
    P.lockAction('drain', dur, { move: 0.25 });
    P.anim.play('castL', dur, { hold: true });
    g.audio.play('drain');
    const from = () => _v.set(target.pos.x, (target.y || 0) + target.height * 0.6, target.pos.z).clone();
    const to = () => {
      const p = new THREE.Vector3();
      P.model.rig.handL.getWorldPosition(p);
      return p;
    };
    g.fx.beam(from, to, 0xff1a3a, dur, 0.09);
    let tick = 0;
    g.tasks.run({
      dur,
      update(k, dt) {
        P.facing = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
        tick -= dt;
        if (Math.random() < 0.7) {
          const a = from(), b = to();
          const t = Math.random();
          g.particles.add.emit({ pos: a.lerp(b, t), vel: { x: rand(-0.3, 0.3), y: rand(-0.3, 0.3), z: rand(-0.3, 0.3) }, life: 0.4, size: 0.16, size1: 0.02, color: 0xff2040, alpha: 1, gravity: 0, drag: 1 });
        }
        if (tick <= 0 && target.alive) {
          tick = 0.2;
          const dealt = g.combat.hit(target, P.stats.dmgBase * 0.85, { ability: true, knock: 0, noCrit: true, hitstop: 0, poise: 6 });
          P.heal(dealt * 0.6, true);
        }
      },
    });
    return true;
  },

  r(g, P) { // Crimson Eclipse
    const dur = 1.7;
    P.lockAction('ultimate', dur, { move: 0, levitate: 1.3 });
    P.invuln = Math.max(P.invuln, dur + 0.2);
    P.anim.play('ultimate', dur, { hold: true });
    g.audio.play('eclipse');
    const center = P.pos.clone();
    g.fx.runeCircle(center, 6, 0xff1030, dur + 0.4, P.pos);
    // the dark sun: black core + red corona
    const sunPos = new THREE.Vector3(center.x, 6, center.z);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    core.position.copy(sunPos);
    core.userData.ownMat = true;
    g.fx._add(core, dur + 0.3, (k) => core.scale.setScalar(easeOutCubic(Math.min(1, k * 2)) * 1.6 * (k > 0.85 ? (1 - k) / 0.15 : 1) + 0.001));
    g.fx.sprite(sunPos, 0xff1a2a, 9, dur + 0.3, g.tex.glow, (k, dt, s) => s.scale.setScalar(6 + Math.sin(k * 30) * 0.4 + k * 6));
    g.screenTint(0x300008, dur + 0.2, 0.35);
    g.tasks.after(0.85, () => {
      g.fx.ring(center, { r0: 1, r1: 12, color: 0xff1030, dur: 0.7 });
      g.fx.ring(center, { r0: 0.5, r1: 9, color: 0x200006, dur: 0.9, opacity: 0.8 });
      g.fx.pillar(center, 0xff1030, 3, 16, 0.8);
      g.fx.flash(_v.set(center.x, 2, center.z), 0xff2030, 10, 0.5, 18);
      g.combat.area(center, 10.5, P.stats.dmgBase * 11, { ability: true, heavy: true, knock: 12, poise: 200, breakGuard: true, hitstop: 0.12 });
      g.shake(0.9);
      g.particles.add.burst(_v.set(center.x, 1, center.z), 120, { color: 0xff1030, color1: 0x300008, size: 0.3, speed: 12, life: 0.9, upBias: 0.2, gravity: -2 });
    });
    return true;
  },
};

// =================================================================== SERAPHINA
const seraphina = {
  q(g, P) { // Blood Roses
    const dir = P.aimDir();
    const center = travelPoint(g, P.pos, dir, 6.5, 0.3);
    const R = 4.5, dur = 5;
    g.fx.roses(center, R, dur);
    g.fx.runeCircle(center, R, 0xff1040, dur);
    g.audio.play('roses');
    P.anim.play('castL', 0.5);
    let tick = 0;
    g.tasks.run({
      dur,
      update(k, dt) {
        tick -= dt;
        for (const e of g.enemies.queryRadius(center, R)) e.slowT = 0.6;
        if (tick <= 0) {
          tick = 0.5;
          for (const e of g.enemies.queryRadius(center, R)) {
            g.combat.hit(e, P.stats.dmgBase * 0.75, { ability: true, knock: 0.5, hitstop: 0, poise: 4, noCrit: true });
            g.particles.add.burst(_v.set(e.pos.x, 0.6, e.pos.z), 6, { color: 0xff1040, size: 0.15, speed: 2, life: 0.4 });
          }
        }
        if (Math.random() < 0.5) g.particles.add.emit({ pos: { x: center.x + rand(-R, R) * 0.7, y: 0.4, z: center.z + rand(-R, R) * 0.7 }, vel: { x: 0, y: rand(0.5, 1.5), z: 0 }, life: 1, size: 0.1, size1: 0.02, color: 0xff2050, alpha: 0.9, gravity: 0, drag: 0 });
      },
    });
    return true;
  },

  e(g, P) { // Crimson Chains
    const dir = P.aimDir();
    const target = g.enemies.nearestInCone(P.pos, dir, 15, 0.8) || g.enemies.nearest(P.pos, 6);
    if (!target) return noTarget(g);
    const hold = target.isBoss ? 1.6 : 4;
    target.rootT = Math.max(target.rootT || 0, hold);
    if (target.state === 'windup' && !target.isBoss) { target.staggerDur = hold; target.setState('stagger'); }
    g.fx.chains(target, hold);
    g.audio.play('chains', { pos: target.pos });
    g.combat.hit(target, P.stats.dmgBase * 1.8, { ability: true, knock: 0, poise: 40 });
    g.ui.floatText(target.pos, 'BOUND', 'guard');
    P.anim.play('castL', 0.5);
    P.facing = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
    return true;
  },

  r(g, P) { // Queen of the Crimson Moon
    const dur = 3.4;
    P.lockAction('ultimate', dur, { move: 0, levitate: 1.6 });
    P.invuln = Math.max(P.invuln, dur + 0.2);
    P.anim.play('ultimate', dur, { hold: true });
    g.audio.play('queen');
    const center = P.pos.clone();
    g.fx.runeCircle(center, 14, 0xff1040, dur + 0.3);
    g.fx.sprite(new THREE.Vector3(center.x, 4.5, center.z - 0.8), 0xff1a2a, 7, dur + 0.3, g.tex.moon, (k, dt, s) => s.scale.setScalar(5 + k * 1.5));
    g.fx.sprite(new THREE.Vector3(center.x, 4.5, center.z - 0.9), 0xff1a2a, 12, dur + 0.3);
    g.screenTint(0x3a0010, dur, 0.25);
    let tick = 0.4;
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bladeGeo = new THREE.ConeGeometry(0.12, 1.6, 4);
    g.tasks.run({
      dur,
      update(k, dt) {
        tick -= dt;
        if (tick > 0 || k > 0.92) return;
        tick = 0.11;
        const enemies = g.enemies.queryRadius(center, 15);
        let target;
        if (enemies.length && Math.random() < 0.8) {
          const e = enemies[Math.floor(Math.random() * enemies.length)];
          target = new THREE.Vector3(e.pos.x + rand(-0.8, 0.8), 0, e.pos.z + rand(-0.8, 0.8));
        } else target = new THREE.Vector3(center.x + rand(-12, 12), 0, center.z + rand(-12, 12));
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.rotation.x = Math.PI;
        g.fx._add(blade, 0.3, (kk) => {
          blade.position.set(target.x, 12 * (1 - kk) + 0.6, target.z);
        }, () => {
          g.particles.add.burst(_v.set(target.x, 0.4, target.z), 10, { color: 0xff1a30, size: 0.2, speed: 4, life: 0.4, gravity: -6 });
          g.fx.ring(target, { r0: 0.2, r1: 1.8, color: 0xff1a30, dur: 0.3 });
          g.audio.play('bladeRain', { pos: target, pitch: rand(0.8, 1.2), vol: 0.6 });
          g.combat.area(target, 1.7, P.stats.dmgBase * 1.75, { ability: true, knock: 2, poise: 10, hitstop: 0, noCrit: true });
        });
      },
      end() { bladeMat.dispose(); },
    });
    return true;
  },
};

// =================================================================== KAIRO
const kairo = {
  q(g, P) { // Spectral Dash
    const dir = P.aimDir();
    const start = P.pos.clone();
    const dest = travelPoint(g, start, dir, 10, P.radius);
    const hit = new Set();
    const dur = 0.24;
    P.lockAction('dash', dur, { move: 0 });
    P.invuln = Math.max(P.invuln, dur + 0.15);
    P.anim.play('dash', dur + 0.1);
    P.facing = Math.atan2(dir.x, dir.z);
    g.audio.play('dash');
    let ghost = 0;
    g.tasks.run({
      dur,
      update(k, dt) {
        const e = easeOutCubic(k);
        P.pos.set(start.x + (dest.x - start.x) * e, P.pos.y, start.z + (dest.z - start.z) * e);
        ghost -= dt;
        if (ghost <= 0) { ghost = 0.04; g.fx.afterimage(P.model.root, 0x6aa8ff, 0.35); }
        for (const en of g.enemies.queryRadius(P.pos, 1.6)) {
          if (hit.has(en)) continue;
          hit.add(en);
          g.combat.hit(en, P.stats.dmgBase * 3.2, { ability: true, knock: 4, poise: 30, dir: dir.clone(), color: 0x6aa8ff });
          g.fx.slash(_v.set(en.pos.x, 1.2, en.pos.z), P.facing + Math.PI / 2, { radius: 1.6, arc: 2, color: 0x6aa8ff, dur: 0.25, tilt: rand(-0.6, 0.6) });
        }
      },
    });
    return true;
  },

  e(g, P) { // Moonlight Guard
    const dur = 5;
    P.guardT = dur;
    g.audio.play('guard');
    P.anim.play('block', 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), mat);
    shell.userData.ownMat = true;
    shell.userData.ownGeo = true;
    g.fx._add(shell, dur, (k, dt, e) => {
      shell.position.set(P.pos.x, P.pos.y + 1.0, P.pos.z);
      shell.rotation.y += dt;
      const pulse = 0.18 + 0.08 * Math.sin(e.t * 8);
      mat.opacity = (P.guardT > 0 ? pulse : 0) * Math.min(1, k * 8) * Math.min(1, (1 - k) * 6);
      g.projectiles.destroyNear(shell.position, 1.6);
      if (P.guardT <= 0) e.t = e.dur;
    });
    g.fx.runeCircle(P.pos, 1.8, 0x6aa8ff, dur, P.pos);
    return true;
  },

  r(g, P) { // Celestial Execution
    const dir = P.aimDir();
    const target = g.enemies.nearestInCone(P.pos, dir, 16, 0.8) || g.enemies.nearest(P.pos, 8);
    if (!target) return noTarget(g);
    const dur = 1.45;
    P.lockAction('ultimate', dur, { move: 0 });
    P.invuln = Math.max(P.invuln, dur + 0.3);
    g.audio.play('dash');
    g.fx.afterimage(P.model.root, 0x6aa8ff, 0.4);
    // appear beside the target
    const back = new THREE.Vector3(P.pos.x - target.pos.x, 0, P.pos.z - target.pos.z).normalize();
    const spot = travelPoint(g, target.pos, back, target.radius + 1.3, P.radius);
    P.pos.set(spot.x, 0, spot.z);
    P.facing = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
    g.screenTint(0x0a1430, dur, 0.3);
    const hits = 6;
    for (let i = 0; i < hits; i++) {
      g.tasks.after(0.1 + i * 0.12, () => {
        if (!target.alive) return;
        P.anim.play(i % 2 ? 'dual2' : 'dual1', 0.2);
        P.facing = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
        g.fx.slash(_v.set(target.pos.x, 1.2 + rand(-0.3, 0.3), target.pos.z), rand(0, 6.28), { radius: 1.8, arc: 2.4, color: 0x8ac0ff, core: 0x0a1020, dur: 0.22, tilt: rand(-1.2, 1.2) });
        g.combat.hit(target, P.stats.dmgBase * 1.9, { ability: true, knock: 0.5, poise: 18, hitstop: 0.03, color: 0x8ac0ff });
        g.audio.play('swing', { pitch: 1.3 });
      });
    }
    g.tasks.after(0.95, () => {
      P.anim.play('dual3', 0.4);
      const c = target.pos.clone();
      g.fx.pillar(c, 0xbad8ff, 2, 18, 0.9);
      g.fx.ring(c, { r0: 0.5, r1: 6, color: 0x8ac0ff, dur: 0.6 });
      g.fx.flash(_v.set(c.x, 3, c.z), 0xbad8ff, 10, 0.5, 16);
      g.audio.play('execution');
      g.shake(0.8);
      if (target.alive) g.combat.hit(target, P.stats.dmgBase * 10, { ability: true, heavy: true, knock: 8, poise: 200, breakGuard: true, hitstop: 0.12, color: 0xbad8ff });
      for (const e of g.enemies.queryRadius(c, 4.5)) if (e !== target) g.combat.hit(e, P.stats.dmgBase * 4, { ability: true, knock: 6, poise: 60 });
    });
    return true;
  },
};

export const ABILITIES = { lucien, seraphina, kairo };
