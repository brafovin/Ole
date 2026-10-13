/**
 * Projectiles for enemies (blood orbs, boss volleys) and the player (Blood Crescent).
 * Each projectile is a glowing mesh with a particle trail; it collides with walls and targets.
 */
import * as THREE from '../three.js';
import { glowMat } from '../gfx/materials.js';

const ORB_GEO = new THREE.SphereGeometry(1, 12, 10);
const _v = new THREE.Vector3();

function crescentGeometry() {
  const pos = [], idx = [];
  const segs = 20;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = -1.2 + 2.4 * t;
    const w = Math.sin(t * Math.PI);
    const r0 = 1.0 - 0.35 * w, r1 = 1.0;
    pos.push(Math.sin(a) * r0, 0, Math.cos(a) * r0 - 0.7, Math.sin(a) * r1, 0, Math.cos(a) * r1 - 0.7);
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const CRESCENT_GEO = crescentGeometry();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  /**
   * o: { pos, dir, speed, damage, owner: 'enemy'|'player', color, radius, life, homing, pierce,
   *      kind: 'orb'|'crescent', size, knock, source, onHit }
   */
  spawn(o) {
    const p = {
      pos: o.pos.clone(), dir: o.dir.clone().normalize(), speed: o.speed ?? 10, damage: o.damage ?? 10,
      owner: o.owner ?? 'enemy', color: o.color ?? 0xff2030, radius: o.radius ?? 0.35, life: o.life ?? 4,
      homing: o.homing ?? 0, pierce: !!o.pierce, kind: o.kind ?? 'orb', knock: o.knock ?? 3, source: o.source,
      onHit: o.onHit, hit: new Set(), t: 0, size: o.size ?? 0.22, poise: o.poise, breakGuard: o.breakGuard,
    };
    const mat = glowMat(p.color, 0.95);
    mat.color.multiplyScalar(2);
    if (p.kind === 'crescent') {
      p.mesh = new THREE.Mesh(CRESCENT_GEO, mat);
      p.mesh.material.side = THREE.DoubleSide;
      p.mesh.scale.setScalar(p.size);
    } else {
      p.mesh = new THREE.Mesh(ORB_GEO, mat);
      p.mesh.scale.setScalar(p.size);
      const core = new THREE.Mesh(ORB_GEO, glowMat(0xffffff, 0.9));
      core.scale.setScalar(0.5);
      p.mesh.add(core);
    }
    p.mesh.position.copy(p.pos);
    this.game.scene.add(p.mesh);
    this.list.push(p);
    return p;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    for (const p of this.list) {
      p.t += dt;
      if (p.homing > 0 && p.owner === 'enemy' && P.alive && p.t < 1.4) {
        _v.set(P.pos.x - p.pos.x, P.pos.y + 1.1 - p.pos.y, P.pos.z - p.pos.z).normalize();
        p.dir.lerp(_v, Math.min(1, p.homing * dt)).normalize();
      }
      const step = p.speed * dt;
      // wall collision
      const wall = g.collision.raycast(p.pos.x, p.pos.z, p.dir.x, p.dir.z, step + p.radius, 'projectiles', p.pos.y);
      p.pos.addScaledVector(p.dir, step);
      if (p.pos.y < 0.15) p.dir.y = Math.abs(p.dir.y) * 0.2;
      p.mesh.position.copy(p.pos);
      if (p.kind === 'crescent') p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);
      // trail
      if (Math.random() < 0.8) {
        g.particles.add.emit({ pos: p.pos, vel: { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.6, z: (Math.random() - 0.5) * 0.6 }, life: 0.35, size: p.size * (p.kind === 'crescent' ? 1.5 : 1.6), size1: 0.02, color: p.color, alpha: 0.8, gravity: 0, drag: 2 });
      }
      let dead = p.t > p.life || (wall < step + p.radius && p.t > 0.05);
      if (p.owner === 'enemy') {
        if (P.alive) {
          const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, dy = P.pos.y + 1.0 - p.pos.y;
          if (dx * dx + dz * dz < (p.radius + P.radius) ** 2 && Math.abs(dy) < 1.3) {
            const res = P.takeDamage(p.damage, { from: p.pos, source: p.source, knock: p.knock, projectile: true });
            if (res !== 'reflected') dead = true;
            else {
              p.owner = 'player';
              p.dir.multiplyScalar(-1);
              p.hit.clear();
            }
          }
        }
      } else {
        for (const e of g.enemies.list) {
          if (!e.alive || p.hit.has(e)) continue;
          const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
          const r = p.radius + e.radius;
          if (dx * dx + dz * dz < r * r) {
            p.hit.add(e);
            g.combat.hit(e, p.damage, { dir: p.dir.clone().setY(0).normalize(), knock: p.knock, ability: true, poise: p.poise, breakGuard: p.breakGuard });
            if (p.onHit) p.onHit(e, p);
            if (!p.pierce) { dead = true; break; }
          }
        }
      }
      if (dead) {
        p.dead = true;
        g.particles.add.burst(p.pos, 14, { color: p.color, size: 0.2, speed: 3, life: 0.4 });
        if (p.t < p.life) g.audio.play('splash', { pos: p.pos, vol: 0.6 });
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
      }
    }
    if (this.list.some((p) => p.dead)) this.list = this.list.filter((p) => !p.dead);
  }

  clear() {
    for (const p of this.list) {
      p.mesh.removeFromParent();
      p.mesh.material.dispose();
    }
    this.list.length = 0;
  }

  /** Destroy enemy projectiles inside a radius (Moonlight Guard). */
  destroyNear(pos, r) {
    for (const p of this.list) {
      if (p.owner !== 'enemy' || p.dead) continue;
      if (p.pos.distanceTo(pos) < r) p.t = p.life + 1;
    }
  }
}
