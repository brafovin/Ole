/**
 * Owns all live enemies (and the boss while it is active) and answers spatial combat queries.
 */
import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(def) {
    const e = new Enemy(this.game, def);
    this.list.push(e);
    return e;
  }

  add(obj) { this.list.push(obj); }

  /** Spawn every enemy that should exist given the saved world flags. */
  spawnAll(flags) {
    this.clear();
    for (const def of this.game.world.spawnDefs) {
      if (flags['k_' + def.id]) continue;
      if (def.trigger && !flags['trig_' + def.trigger]) continue;
      // trigger already happened earlier: spawn quietly at the spot, already alert
      this.spawn({ ...def, emerge: false, drop: false });
    }
  }

  /** Spawn the enemies tied to a story trigger (with emerge/drop theatrics). */
  fireTrigger(name) {
    const out = [];
    for (const def of this.game.world.spawnDefs) {
      if (def.trigger !== name || this.game.flags['k_' + def.id]) continue;
      if (this.list.some((e) => e.id === def.id && e.alive)) continue;
      out.push(this.spawn(def));
    }
    return out;
  }

  update(dt) {
    for (const e of this.list) {
      try {
        e.update(dt);
      } catch (err) {
        console.error('[Enemies] update failed for', e.id, err);
        e.removed = true;
        e.root && e.root.removeFromParent();
      }
    }
    if (this.list.some((e) => e.removed)) this.list = this.list.filter((e) => !e.removed);
  }

  clear() {
    for (const e of this.list) if (!e.removed && e.remove) e.remove();
    this.list.length = 0;
  }

  resetForRespawn() {
    for (const e of this.list) if (!e.isBoss && e.resetHome) e.resetHome();
  }

  alive() { return this.list.filter((e) => e.alive); }

  groupAlive(group) { return this.list.some((e) => e.alive && e.def && e.def.group === group); }

  inCombat() {
    const p = this.game.player.pos;
    return this.list.some((e) => e.alive && e.aggro && e.state !== 'return' && e.pos.distanceTo(p) < 26);
  }

  combatIntensity() {
    const p = this.game.player.pos;
    let n = 0;
    for (const e of this.list) if (e.alive && e.aggro && e.state !== 'return' && e.pos.distanceTo(p) < 26) n += e.isBoss ? 3 : e.type === 'knight' ? 1.5 : 1;
    return Math.min(1, n / 3);
  }

  /** Enemies whose body intersects a circle. */
  queryRadius(pos, r) {
    return this.list.filter((e) => e.alive && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.radius < r);
  }

  /** Enemies inside a horizontal cone (melee arcs). dir must be normalised (x,z). */
  queryArc(origin, dir, range, halfAngle) {
    const out = [];
    const cosA = Math.cos(halfAngle);
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > range) continue;
      if (d < e.radius + 0.4) { out.push(e); continue; }
      const c = (dx * dir.x + dz * dir.z) / d;
      // allow a little extra angle for big targets
      const extra = Math.atan2(e.radius, d);
      if (c >= Math.cos(Math.min(Math.PI, halfAngle + extra)) || c >= cosA) out.push(e);
    }
    return out;
  }

  nearestInCone(origin, dir, range, halfAngle = 0.6) {
    let best = null, bd = Infinity;
    for (const e of this.queryArc(origin, dir, range, halfAngle)) {
      if (e.hidden) continue;
      const d = Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearest(origin, range) {
    let best = null, bd = range;
    for (const e of this.list) {
      if (!e.alive || e.hidden) continue;
      const d = Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
}
