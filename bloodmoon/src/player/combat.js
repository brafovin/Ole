/**
 * Player → enemy damage with consistent feedback: crits, damage numbers, blood spray,
 * hit-stop, camera shake, sound and blood-energy gain.
 */
import * as THREE from '../three.js';
import { rand } from '../core/utils.js';

const _v = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
  }

  /** info: { dir, knock, poise, breakGuard, heavy, ability, hitstop, noCrit, color } */
  hit(enemy, base, info = {}) {
    const g = this.game, P = g.player;
    if (!enemy.alive) return 0;
    const crit = !info.noCrit && Math.random() < 0.08;
    const amount = Math.max(1, Math.round(base * (crit ? 1.6 : 1) * rand(0.92, 1.08)));
    const dealt = enemy.takeDamage(amount, { ...info, source: P });
    if (dealt <= 0) {
      g.ui.floatText(enemy.pos, 'IMMUNE', 'blocked');
      return 0;
    }
    const top = _v.set(enemy.pos.x, (enemy.y || 0) + (enemy.height || 1.6) * 0.8, enemy.pos.z);
    g.ui.damageNumber(top, Math.round(dealt), crit ? 'crit' : dealt < amount * 0.5 ? 'blocked' : 'normal');
    const dir = info.dir || new THREE.Vector3(enemy.pos.x - P.pos.x, 0, enemy.pos.z - P.pos.z).normalize();
    g.particles.add.burst(top.setY(top.y - 0.4), info.heavy ? 18 : 10, {
      color: info.color ?? 0xff1a30, color1: 0x500010, size: 0.16, speed: info.heavy ? 6 : 4, life: 0.45, gravity: -9,
      dir: { x: dir.x * 3, y: 1, z: dir.z * 3 },
    });
    g.particles.dark.burst(top, 4, { color: 0x3a0008, size: 0.22, speed: 3, life: 0.6, gravity: -10, dir: { x: dir.x * 2, y: 0.5, z: dir.z * 2 } });
    g.audio.play(info.heavy || crit ? 'hitHeavy' : 'hit', { pos: enemy.pos, pitch: rand(0.9, 1.1) });
    g.hitstop(info.hitstop ?? (info.heavy ? 0.085 : info.ability ? 0.02 : 0.045));
    g.shake(info.heavy ? 0.28 : 0.1);
    P.gainBlood(P.stats.bloodOnHit * (info.ability ? 0.35 : 1));
    return dealt;
  }

  /** Damage every enemy in a radius; returns the list hit. */
  area(pos, radius, base, info = {}) {
    const hits = this.game.enemies.queryRadius(pos, radius);
    for (const e of hits) {
      const dir = new THREE.Vector3(e.pos.x - pos.x, 0, e.pos.z - pos.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      this.hit(e, base, { ...info, dir });
    }
    return hits;
  }
}
