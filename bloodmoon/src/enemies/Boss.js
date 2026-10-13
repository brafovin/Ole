/**
 * BOSS: THE VEILED COUNTESS
 * Phase 1: blood volleys, blood pools, teleports, claw sweeps.
 * Phase 2 (≤ 50% HP): faster, adds spiral barrages, crimson rain and summoned crawlers.
 * Every attack has a visible/audible telegraph. Breaking her poise staggers her (bonus damage).
 */
import * as THREE from '../three.js';
import { buildCharacter } from '../characters/CharacterBuilder.js';
import { Animator } from '../characters/Animator.js';
import { BOSS_SPEC } from '../characters/definitions.js';
import { rand, dampAngle, clamp, choice } from '../core/utils.js';
import { ARENA } from '../world/areas/altar.js';

const _v = new THREE.Vector3();

export class Boss {
  constructor(game) {
    this.game = game;
    this.isBoss = true;
    this.id = 'countess';
    this.type = 'boss';
    this.name = 'The Veiled Countess';
    this.def = { group: 'boss' };
    this.maxHp = 1450;
    this.hp = this.maxHp;
    this.radius = 1.0;
    this.height = 3.3;
    this.alive = true;
    this.aggro = true;
    this.removed = false;
    this.hidden = false;
    this.phase = 1;
    this.pos = new THREE.Vector3(ARENA.x, 0, ARENA.z - 5);
    this.facing = 0;
    this.y = 12;
    this.state = 'intro';
    this.st = 0;
    this.cd = 1.2;
    this.poiseDmg = 0;
    this.time = 0;
    this.history = [];
    this.summonT = 0;
    this.rootT = 0;
    this.slowT = 0;
    this.opacity = 1;
    this.model = buildCharacter({ ...BOSS_SPEC, glowTex: game.tex.glow });
    this.root = this.model.root;
    this.anim = new Animator(this.model, 'boss');
    this.toonMats = Object.values(this.model.mats).filter((m) => m.userData && m.userData.rimK);
    this.baseRim = this.toonMats.map((m) => m.userData.rimK.value);
    this.flash = 0;
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    game.scene.add(this.root);
    this.aura = game.world.lights.add({ pos: this.pos.clone(), color: 0xff1a30, intensity: 3.5, distance: 11, flicker: 0.3 });
    // glowing orb used for volleys
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    game.scene.add(this.orb);
    this.tmpTasks = [];
  }

  get vel() { return _v.set(0, 0, 0); }

  setOpacity(o) {
    this.opacity = o;
    this.model.setOpacity(o);
  }

  handPos(out = new THREE.Vector3()) {
    this.model.rig.handR.getWorldPosition(out);
    return out;
  }

  update(dt) {
    const g = this.game, P = g.player;
    this.time += dt;
    this.st += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    for (let i = 0; i < this.toonMats.length; i++) this.toonMats[i].userData.rimK.value = this.baseRim[i] + (this.flash / 0.16) * 5;
    this.aura.pos.set(this.pos.x, 2.5, this.pos.z);
    if (this.state === 'dead') return;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const fast = this.phase === 2 ? 0.75 : 1;
    let anim = null;
    this.orb.material.opacity = Math.max(0, this.orb.material.opacity - dt * 2);

    switch (this.state) {
      case 'intro': {
        this.y = Math.max(0.45, 12 - this.st * 4.6);
        this.facing = dampAngle(this.facing, toP, 3, dt);
        if (Math.random() < 0.6) g.particles.add.burst(_v.set(this.pos.x, this.y + 1.5, this.pos.z), 3, { color: 0xff2030, size: 0.3, speed: 2, life: 0.8 });
        if (this.y <= 0.45 && this.st > 2.6) this.setState('waiting');
        break;
      }
      case 'waiting':
        this.facing = dampAngle(this.facing, toP, 3, dt);
        break; // StoryEvents starts the fight after the intro dialogue
      case 'idle': {
        this.facing = dampAngle(this.facing, toP, 4, dt);
        // drift around the player at a menacing distance
        const want = this.phase === 2 ? 7 : 8.5;
        const radial = dist > want + 1 ? 1 : dist < want - 1 ? -1 : 0;
        const side = Math.sin(this.time * 0.6) > 0 ? 1 : -1;
        if (dist > 0.1) {
          const mx = (dx / dist) * radial + (dz / dist) * side * 0.5;
          const mz = (dz / dist) * radial - (dx / dist) * side * 0.5;
          const sp = (this.slowT > 0 ? 1 : 2.4) * (this.rootT > 0 ? 0 : 1);
          this.pos.x += mx * sp * dt;
          this.pos.z += mz * sp * dt;
        }
        this.cd -= dt;
        this.summonT -= dt;
        if (this.cd <= 0 && P.alive) this.chooseAttack(dist);
        break;
      }
      case 'volley': {
        anim = 'bossCast';
        this.facing = dampAngle(this.facing, toP, 6, dt);
        const wind = 0.85 * fast;
        const hp = this.handPos();
        this.orb.position.copy(hp).add(_v.set(0, 0.35, 0));
        this.orb.material.opacity = Math.min(1, this.st / wind);
        this.orb.scale.setScalar(0.5 + Math.min(1, this.st / wind) * 1.2);
        if (!this.fired && this.st >= wind) {
          this.fired = true;
          this.fireFan(this.phase === 2 ? 7 : 5, this.phase === 2 ? 14 : 12);
          if (this.phase === 2) g.tasks.after(0.45, () => this.state !== 'dead' && this.fireFan(6, 13, 0.12));
        }
        if (this.st >= wind + 0.7) this.recover(1.0 * fast);
        break;
      }
      case 'pools': {
        anim = 'castUp';
        this.facing = dampAngle(this.facing, toP, 6, dt);
        if (!this.fired && this.st >= 0.45) {
          this.fired = true;
          const n = this.phase === 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const p = i === 0 ? P.pos.clone() : P.pos.clone().add(_v.set(rand(-4.5, 4.5), 0, rand(-4.5, 4.5)));
            this.bloodPool(p, 2.4, (this.phase === 2 ? 1.05 : 1.35) + i * 0.08, 22);
          }
        }
        if (this.st >= 1.3) this.recover(0.9 * fast);
        break;
      }
      case 'rain': {
        anim = 'castUp';
        if (!this.fired && this.st >= 0.5) {
          this.fired = true;
          for (let i = 0; i < 9; i++) {
            const p = P.pos.clone().add(_v.set(rand(-8, 8), 0, rand(-8, 8)));
            if (i === 0) p.copy(P.pos);
            this.bloodPool(p, 1.8, 1.1 + rand(0, 0.6), 16);
          }
        }
        if (this.st >= 1.6) this.recover(0.8);
        break;
      }
      case 'teleport': {
        if (this.st < 0.35) {
          this.setOpacity(1 - this.st / 0.35);
          if (Math.random() < 0.8) g.particles.add.burst(_v.set(this.pos.x, 1.5, this.pos.z), 4, { color: 0xff1a30, size: 0.3, speed: 3, life: 0.5 });
        } else if (!this.moved) {
          this.moved = true;
          this.setOpacity(0);
          this.dest = this.pickTeleport();
          g.fx.groundWarning(this.dest, 1.6, 0.55, 0xff1a30);
          g.audio.play('teleport', { pos: this.dest });
        } else if (this.st > 0.9 && !this.arrived) {
          this.arrived = true;
          this.pos.copy(this.dest);
          g.particles.add.burst(_v.set(this.pos.x, 1.5, this.pos.z), 40, { color: 0xff1a30, size: 0.35, speed: 4, life: 0.6 });
        } else if (this.arrived) {
          this.setOpacity(Math.min(1, (this.st - 0.9) / 0.3));
          this.facing = dampAngle(this.facing, toP, 10, dt);
          if (this.st > 1.25) {
            this.setOpacity(1);
            this.setState(dist < 5.5 ? 'sweep' : 'volley');
          }
        }
        break;
      }
      case 'sweep': {
        anim = 'bossSweep';
        const wind = 0.8 * (this.phase === 2 ? 0.85 : 1);
        if (this.st < wind * 0.8) this.facing = dampAngle(this.facing, toP, 5, dt);
        if (!this.warned) {
          this.warned = true;
          g.fx.groundWarning(this.pos, 4.8, wind, 0xff2030);
          g.audio.play('warn', { pos: this.pos });
        }
        if (!this.fired && this.st >= wind) {
          this.fired = true;
          g.audio.play('knightSwing', { pos: this.pos, pitch: 0.7 });
          g.fx.slash(_v.set(this.pos.x, 1.4, this.pos.z), this.facing, { radius: 4.8, arc: 3.6, width: 2.2, color: 0xff1030, core: 0x100004, dur: 0.35 });
          if (dist < 4.8 + P.radius && P.alive) P.takeDamage(24, { from: this.pos, source: this, knock: 9 });
        }
        if (this.st >= wind + 0.7) this.recover(1.0 * fast);
        break;
      }
      case 'spiral': {
        anim = 'castUp';
        this.facing += dt * 2.5;
        this.spiralT = (this.spiralT || 0) - dt;
        if (this.st > 0.5 && this.spiralT <= 0 && this.st < 3.4) {
          this.spiralT = 0.13;
          const arms = 3;
          for (let i = 0; i < arms; i++) {
            const a = this.st * 1.7 + (i / arms) * Math.PI * 2;
            g.projectiles.spawn({ pos: _v.set(this.pos.x, 1.4, this.pos.z), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: 8, damage: 10, owner: 'enemy', color: 0xff2a3a, radius: 0.32, life: 3.5, source: this });
          }
        }
        if (this.st >= 3.8) this.recover(1.2);
        break;
      }
      case 'summon': {
        anim = 'castUp';
        if (!this.fired && this.st >= 0.8) {
          this.fired = true;
          for (let i = 0; i < 2; i++) {
            const a = rand(0, Math.PI * 2);
            const x = clamp(this.pos.x + Math.sin(a) * 3, ARENA.x - 12, ARENA.x + 12), z = clamp(this.pos.z + Math.cos(a) * 3, ARENA.z - 12, ARENA.z + 12);
            g.enemies.spawn({ id: 'boss_add_' + Math.floor(Math.random() * 1e6), type: 'crawler', x, z, emerge: true, group: 'bossAdds', noSave: true });
          }
          g.audio.play('bossLaugh', { pos: this.pos });
        }
        if (this.st >= 1.6) this.recover(0.8);
        break;
      }
      case 'phase': {
        anim = 'castUp';
        if (!this.fired && this.st > 0.9) {
          this.fired = true;
          g.audio.play('shockwave');
          g.fx.ring(this.pos, { r0: 1, r1: 14, color: 0xff1a30, dur: 0.9 });
          g.fx.sphereFlash(_v.set(this.pos.x, 1.5, this.pos.z), 0xff1a30, 6, 0.6, 0.6);
          g.shake(0.8);
          if (dist < 7 && P.alive) P.takeDamage(10, { from: this.pos, source: this, knock: 14, unblockable: true });
        }
        if (this.st > 2.4) {
          this.setState('summon');
        }
        break;
      }
      case 'stagger': {
        anim = 'kneel';
        if (this.st > 2.2) this.recover(0.4);
        break;
      }
      case 'recover': {
        this.facing = dampAngle(this.facing, toP, 4, dt);
        if (this.st >= this.recoverT) this.setState('idle');
        break;
      }
    }

    // keep inside the arena
    const ax = this.pos.x - ARENA.x, az = this.pos.z - ARENA.z;
    const ad = Math.hypot(ax, az);
    if (ad > ARENA.r - 3) {
      this.pos.x = ARENA.x + (ax / ad) * (ARENA.r - 3);
      this.pos.z = ARENA.z + (az / ad) * (ARENA.r - 3);
    }
    if (this.state !== 'intro') this.y = 0.45 + Math.sin(this.time * 1.6) * 0.12;
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.facing;
    if (anim && !this.anim.isPlaying(anim)) this.anim.play(anim, anim === 'bossSweep' ? 1.3 : 0.8, { hold: anim !== 'bossSweep' });
    if (!anim && this.anim.action && !this.anim.action.fadingOut) this.anim.stop();
    this.anim.update(dt, { speed: 0, grounded: true });
    this.model.updateSecondary(dt, _v.set(0, 0, 0.5), this.time);
    if (Math.random() < 0.3) g.particles.add.emit({ pos: { x: this.pos.x + rand(-0.8, 0.8), y: rand(0.2, 1.2), z: this.pos.z + rand(-0.8, 0.8) }, vel: { x: 0, y: rand(0.4, 1.2), z: 0 }, life: 1.4, size: 0.12, size1: 0.02, color: 0xff1a30, alpha: 0.8, gravity: 0, drag: 0 });
  }

  setState(s) {
    this.state = s;
    this.st = 0;
    this.fired = false;
    this.warned = false;
    this.moved = false;
    this.arrived = false;
    if (s === 'volley' || s === 'pools' || s === 'rain' || s === 'spiral' || s === 'summon') this.game.audio.play('warn', { pos: this.pos });
  }

  recover(t) {
    this.recoverT = t;
    this.setState('recover');
  }

  chooseAttack(dist) {
    const p2 = this.phase === 2;
    const opts = [];
    if (dist < 5) opts.push(['sweep', 5], ['teleport', 2], ['pools', 2]);
    else opts.push(['volley', 4], ['pools', 3], ['teleport', 2]);
    if (p2) {
      opts.push(['spiral', 2], ['rain', 2]);
      if (this.summonT <= 0) opts.push(['summon', 3]);
    }
    const last2 = this.history.slice(-2);
    const filtered = opts.filter(([n]) => !(last2.length === 2 && last2.every((h) => h === n)));
    const total = filtered.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total, pick = filtered[0][0];
    for (const [n, w] of filtered) {
      if ((r -= w) <= 0) { pick = n; break; }
    }
    this.history.push(pick);
    if (pick === 'summon') this.summonT = 22;
    this.cd = rand(0.4, 0.9) * (p2 ? 0.7 : 1);
    this.setState(pick);
  }

  pickTeleport() {
    const P = this.game.player;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), r = rand(3, ARENA.r - 4);
      const p = new THREE.Vector3(ARENA.x + Math.sin(a) * r, 0, ARENA.z + Math.cos(a) * r);
      const d = p.distanceTo(P.pos);
      if (d > 5 && d < 13 && !this.game.collision.overlaps(p.x, p.z, 1.0)) return p;
    }
    return new THREE.Vector3(ARENA.x, 0, ARENA.z - 5);
  }

  fireFan(n, speed, offset = 0) {
    const g = this.game, P = g.player;
    const from = this.handPos().add(_v.set(0, 0.35, 0));
    const base = Math.atan2(P.pos.x - from.x, P.pos.z - from.z) + offset;
    const spread = 0.95;
    for (let i = 0; i < n; i++) {
      const a = base - spread / 2 + (spread * i) / (n - 1);
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      dir.y = (P.pos.y + 1.0 - from.y) / Math.max(4, from.distanceTo(P.pos));
      g.projectiles.spawn({ pos: from, dir, speed, damage: 14, owner: 'enemy', color: 0xff1a30, radius: 0.36, homing: 0.15, life: 3.5, source: this, size: 0.26 });
    }
    g.audio.play('projectile', { pos: from });
    g.audio.play('mageCast', { pos: from, vol: 0.6 });
  }

  bloodPool(pos, r, delay, damage) {
    const g = this.game;
    pos.y = 0;
    g.fx.groundWarning(pos, r, delay, 0xff1020, () => {
      if (!this.alive) return;
      g.fx.spikes(pos, r, 0xa0001a, 0.9, 8);
      g.particles.add.burst(_v.set(pos.x, 0.5, pos.z), 24, { color: 0xff1a30, size: 0.25, speed: 5, life: 0.6, gravity: -8 });
      g.audio.play('eruption', { pos });
      const P = g.player;
      if (P.alive && Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) < r + P.radius * 0.5 && P.pos.y < 1.5) P.takeDamage(damage, { from: pos, source: this, knock: 4 });
    });
  }

  takeDamage(amount, info = {}) {
    if (!this.alive || this.state === 'intro' || this.state === 'waiting' || this.state === 'phase') return 0;
    if (this.state === 'teleport' && this.opacity < 0.3) return 0;
    const g = this.game;
    let dmg = amount * (this.state === 'stagger' ? 1.3 : 1);
    this.hp -= dmg;
    this.flash = 0.16;
    this.poiseDmg += info.poise ?? dmg * 0.5;
    if (this.poiseDmg >= 160 && this.state !== 'stagger' && this.state !== 'teleport') {
      this.poiseDmg = 0;
      this.setState('stagger');
      g.ui.floatText(this.pos, 'STAGGERED', 'guard');
      g.audio.play('hitHeavy', { pos: this.pos, pitch: 0.6 });
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.hp = this.maxHp * 0.5;
      this.setState('phase');
      g.events.bossPhase2(this);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.state = 'dead';
      this.anim.play('kneel', 1.2, { hold: true });
      g.events.bossDefeated(this);
    }
    return dmg;
  }

  remove() {
    this.removed = true;
    this.root.removeFromParent();
    this.orb.removeFromParent();
    this.aura.enabled = false;
    this.model.dispose();
  }
}
