/**
 * Enemy AI: idle → (detect) → chase → windup (telegraph) → strike → recover, with stagger,
 * knockback, leashing, and per-type behaviours:
 *   crawler – fast lunging bites, attacks in groups, can emerge from the ground
 *   knight  – slow, raises its tower shield against frontal attacks (heavy attacks break guard)
 *   stalker – nearly invisible until close, then reveals itself and hunts fast
 *   mage    – keeps its distance, strafes, casts blood projectiles, blinks away when cornered
 */
import * as THREE from '../three.js';
import { ENEMY_TYPES, buildCrawler } from './types.js';
import { buildCharacter } from '../characters/CharacterBuilder.js';
import { Animator } from '../characters/Animator.js';
import { rand, dampAngle, angleDiff, clamp } from '../core/utils.js';

const _v = new THREE.Vector3();

export class Enemy {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    const T = (this.T = ENEMY_TYPES[def.type]);
    this.name = T.name;
    this.maxHp = T.hp;
    this.hp = T.hp;
    this.radius = T.radius;
    this.height = T.height;
    this.pos = new THREE.Vector3(def.x, 0, def.z);
    this.home = this.pos.clone();
    this.facing = def.facing ?? rand(0, Math.PI * 2);
    this.homeFacing = this.facing;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.state = 'idle';
    this.st = 0;
    this.cd = rand(0.3, 1.0);
    this.aggro = false;
    this.alive = true;
    this.removed = false;
    this.deadT = 0;
    this.poiseDmg = 0;
    this.rootT = 0;
    this.slowT = 0;
    this.flash = 0;
    this.y = 0;
    this.vy = 0;
    this.time = rand(0, 10);
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.blinkCd = 3;
    this.stuckT = 0;
    this.sideT = 0;
    this.lastDist = 99;
    this.seenAttack = -1;
    this.hitThisStrike = false;

    if (def.type === 'crawler') {
      this.crawler = buildCrawler();
      this.root = this.crawler.root;
      this.glowMats = [this.crawler.eyeMat];
      this.toonMats = this.crawler.mats;
    } else {
      this.model = buildCharacter({ ...T.spec, glowTex: game.tex.glow });
      this.root = this.model.root;
      this.anim = new Animator(this.model, T.style);
      this.glowMats = this.model.glowMats;
      this.toonMats = Object.values(this.model.mats).filter((m) => m.userData && m.userData.rimK);
    }
    this.baseGlow = this.glowMats.map((m) => m.color.clone());
    this.baseRim = this.toonMats.map((m) => (m.userData.rimK ? m.userData.rimK.value : 1));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    game.scene.add(this.root);

    if (def.emerge) {
      this.state = 'emerge';
      this.y = -1.3;
      this.aggro = true;
      game.audio.play('emerge', { pos: this.pos });
    } else if (def.drop) {
      this.state = 'drop';
      this.y = 7;
      this.aggro = true;
    } else if (T.stealth) {
      this.hidden = true;
      this.setOpacity(0.05);
    }
    this.updateTransform();
  }

  get isBoss() { return false; }

  setOpacity(o) {
    this.opacity = o;
    if (this.model) this.model.setOpacity(o);
    else this.root.traverse((m) => {
      if (!m.material) return;
      if (m.userData.isOutline) { m.visible = o >= 0.99; return; }
      m.material.transparent = o < 1;
      m.material.opacity = o;
    });
  }

  updateTransform() {
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.facing;
  }

  senses(dist) {
    const P = this.game.player;
    if (!P.alive || dist > this.T.detect) return false;
    if (this.hidden && dist > 8.5) return false;
    return dist < 6 || this.game.collision.lineOfSight(this.pos, P.pos);
  }

  alert(chain = true) {
    if (this.aggro && this.state !== 'idle' && this.state !== 'return') return;
    this.aggro = true;
    const g = this.game;
    if (this.hidden) {
      this.state = 'reveal';
      this.st = 0;
      g.audio.play('stalkerShriek', { pos: this.pos, pitch: rand(0.9, 1.1) });
    } else {
      this.state = 'chase';
      this.st = 0;
      const snd = { crawler: 'crawlerScreech', knight: 'armorClank', stalker: 'stalkerShriek', mage: 'mageCast' }[this.type];
      g.audio.play(snd, { pos: this.pos, pitch: rand(0.85, 1.15), vol: 0.8 });
    }
    if (chain) {
      for (const e of g.enemies.list) {
        if (e === this || !e.alive || e.aggro || e.isBoss) continue;
        if ((this.def.group && e.def.group === this.def.group) || e.pos.distanceTo(this.pos) < 9) e.alert(false);
      }
    }
  }

  update(dt) {
    const g = this.game, P = g.player, T = this.T;
    this.time += dt;
    if (!this.alive) return this.updateDeath(dt);
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    if (dist > 60 && !this.aggro) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.st += dt;
    this.cd -= dt;
    this.blinkCd -= dt;
    this.rootT = Math.max(0, this.rootT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    let move = null, speed = T.speed, turn = 8, animAction = null;

    switch (this.state) {
      case 'emerge': {
        this.y = Math.min(0, -1.3 + this.st * 1.4);
        if (Math.random() < 0.4) g.particles.dark.burst(this.pos, 2, { color: 0x2a1a14, size: 0.25, speed: 2, life: 0.6 });
        if (this.st > 1.0) this.setState('chase');
        break;
      }
      case 'drop': {
        this.vy -= 32 * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          g.particles.dark.burst(this.pos, 30, { color: 0x1a1018, size: 0.4, speed: 5, life: 0.8 });
          g.shake(0.35);
          g.audio.play('land', { pos: this.pos });
          this.setState('land');
        }
        break;
      }
      case 'land':
        this.facing = dampAngle(this.facing, toPlayer, 10, dt);
        if (this.st > 0.7) this.setState('chase');
        break;
      case 'idle': {
        this.facing = dampAngle(this.facing, this.homeFacing + Math.sin(this.time * 0.4) * 0.6, 2, dt);
        if (this.senses(dist)) this.alert();
        break;
      }
      case 'reveal': {
        this.setOpacity(Math.min(1, 0.05 + this.st * 2.5));
        this.facing = dampAngle(this.facing, toPlayer, 10, dt);
        animAction = 'claw';
        if (this.st > 0.45) {
          this.hidden = false;
          this.setOpacity(1);
          this.setState('chase');
        }
        break;
      }
      case 'return': {
        _v.subVectors(this.home, this.pos);
        _v.y = 0;
        if (_v.length() < 0.8) {
          this.setState('idle');
          this.aggro = false;
          if (T.stealth) { this.hidden = true; this.setOpacity(0.05); }
        } else move = _v.normalize();
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        if (this.senses(dist) && dist < 8) this.alert();
        break;
      }
      case 'chase': {
        if (!P.alive) { this.setState('return'); break; }
        if (this.pos.distanceTo(this.home) > 36 || dist > 40) { this.setState('return'); break; }
        if (T.ranged) {
          move = this.mageMove(dx, dz, dist);
          speed *= 0.9;
          if (this.cd <= 0 && dist < T.attackRange && g.collision.lineOfSight(this.pos, P.pos)) this.setState('windup');
          if (dist < 3.5 && this.blinkCd <= 0) this.blink();
          turn = 6;
          this.facing = dampAngle(this.facing, toPlayer, 6, dt);
          break;
        }
        // knights raise the shield when the player swings at them
        if (T.blocks && dist < 4.2 && P.attackSerial !== this.seenAttack && P.isAttacking()) {
          this.seenAttack = P.attackSerial;
          if (Math.random() < 0.55) { this.setState('block'); break; }
        }
        if (dist < T.attackRange && this.cd <= 0 && Math.abs(angleDiff(this.facing, toPlayer)) < 0.7) {
          this.setState('windup');
          break;
        }
        if (dist > T.attackRange * 0.75) {
          move = _v.set(dx / dist, 0, dz / dist);
          // simple obstacle avoidance: if we are not getting closer, sidestep for a moment
          if (this.sideT > 0) {
            this.sideT -= dt;
            move.set(move.z * this.strafeDir, 0, -move.x * this.strafeDir).add(_v.set(dx / dist, 0, dz / dist).multiplyScalar(0.3)).normalize();
          } else {
            this.stuckT = dist > this.lastDist - 0.02 ? this.stuckT + dt : 0;
            if (this.stuckT > 0.6) {
              this.sideT = 0.8;
              this.stuckT = 0;
              this.strafeDir *= -1;
            }
          }
          this.lastDist = dist;
        }
        this.facing = dampAngle(this.facing, toPlayer, turn, dt);
        break;
      }
      case 'block': {
        animAction = 'shieldUp';
        this.facing = dampAngle(this.facing, toPlayer, 6, dt);
        if (this.st > 1.1) this.setState('chase');
        break;
      }
      case 'windup': {
        const k = clamp(this.st / T.windup, 0, 1);
        this.facing = dampAngle(this.facing, toPlayer, T.blocks ? 3 : T.ranged ? 8 : 6, dt);
        for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].color.copy(this.baseGlow[i]).multiplyScalar(1 + 3 * k);
        if (this.model && this.model.rig.orb) this.model.rig.orb.scale.setScalar(1 + k * 1.6);
        if (this.st >= T.windup) this.setState('strike');
        break;
      }
      case 'strike': {
        if (T.ranged) {
          if (!this.hitThisStrike) {
            this.hitThisStrike = true;
            this.castProjectile();
          }
        } else {
          if (this.type === 'crawler' || this.type === 'stalker') {
            const lunge = this.type === 'crawler' ? 8 : 6;
            if (this.st < T.strike * 0.8) move = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing)), (speed = lunge);
          }
          if (!this.hitThisStrike && this.st >= T.strike * 0.35) {
            this.hitThisStrike = true;
            const reach = T.attackRange + 0.7;
            if (dist < reach && P.alive && Math.abs(angleDiff(this.facing, toPlayer)) < 1.35) {
              P.takeDamage(T.damage, { from: this.pos, source: this, knock: T.mass * 2.5 });
            }
          }
        }
        if (this.st >= T.strike) this.setState('recover');
        break;
      }
      case 'recover': {
        for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].color.copy(this.baseGlow[i]);
        if (this.model && this.model.rig.orb) this.model.rig.orb.scale.setScalar(1);
        if (this.st >= T.recover) {
          this.cd = T.cooldown * rand(0.8, 1.25);
          this.setState('chase');
        }
        break;
      }
      case 'stagger': {
        if (this.st >= this.staggerDur) this.setState('chase');
        break;
      }
    }

    // movement
    const rooted = this.rootT > 0 || this.state === 'stagger';
    if (move && !rooted) {
      const s = speed * (this.slowT > 0 ? 0.45 : 1);
      this.vel.x = move.x * s;
      this.vel.z = move.z * s;
    } else {
      this.vel.x *= Math.max(0, 1 - dt * 12);
      this.vel.z *= Math.max(0, 1 - dt * 12);
    }
    if (rooted) { this.vel.x = 0; this.vel.z = 0; }
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    // separation from other enemies and the player
    for (const e of g.enemies.list) {
      if (e === this || !e.alive) continue;
      const ex = this.pos.x - e.pos.x, ez = this.pos.z - e.pos.z;
      const rr = this.radius + e.radius;
      const d2 = ex * ex + ez * ez;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        this.pos.x += (ex / d) * push;
        this.pos.z += (ez / d) * push;
      }
    }
    if (P.alive && dist < this.radius + P.radius && dist > 1e-4) {
      const push = this.radius + P.radius - dist;
      this.pos.x -= (dx / dist) * push;
      this.pos.z -= (dz / dist) * push;
    }
    g.collision.resolveCircle(this.pos, this.radius, Math.max(0, this.y));
    if (T.ranged) this.y = 0.25 + Math.sin(this.time * 2.2) * 0.08;
    this.updateTransform();

    // hit flash (rim glow)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    const f = this.flash / 0.16;
    for (let i = 0; i < this.toonMats.length; i++) {
      const u = this.toonMats[i].userData.rimK;
      if (u) u.value = this.baseRim[i] + f * 6;
    }
    const sq = 1 + f * 0.08;
    this.root.scale.set(sq, 1 - f * 0.06, sq);

    // animation
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.crawler) {
      this.crawler.animate(dt, this.time, hSpeed, this.state, clamp(this.st / this.T.windup, 0, 1));
    } else {
      this.animateHumanoid(dt, hSpeed, animAction);
    }
  }

  animateHumanoid(dt, hSpeed, animAction) {
    const a = this.anim;
    const want = animAction || (this.state === 'windup' || this.state === 'strike' ? this.attackAnim() : this.state === 'stagger' ? 'hit' : null);
    if (want && !a.isPlaying(want)) {
      const dur = this.state === 'windup' ? this.T.windup + this.T.strike + 0.15 : want === 'hit' ? 0.5 : 1;
      a.play(want, dur, { hold: want === 'shieldUp' || want === 'castUp' || want === 'claw' });
    } else if (!want && a.action && !a.action.fadingOut && (a.action.name === 'shieldUp' || a.action.name === 'castUp' || a.action.name === 'claw')) a.stop();
    a.update(dt, { speed: hSpeed, grounded: this.y <= 0.3 || this.T.ranged, strideScale: this.type === 'stalker' ? 1.3 : this.type === 'knight' ? 1.1 : 1 });
    this.model.updateSecondary(dt, _v.set(0, 0, hSpeed), this.time);
  }

  attackAnim() {
    return { knight: 'knightSwing', stalker: 'claw', mage: 'castUp' }[this.type];
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    this.st = 0;
    const g = this.game;
    if (s === 'windup') {
      this.hitThisStrike = false;
      const T = this.T;
      if (T.ranged) g.audio.play('mageCast', { pos: this.pos });
      else {
        g.audio.play(this.type === 'knight' ? 'knightSwing' : this.type === 'crawler' ? 'crawlerScreech' : 'enemyAttack', { pos: this.pos, pitch: rand(0.9, 1.1), vol: 0.9 });
        // fair telegraph on the ground for heavy hitters
        if (this.type === 'knight' || this.type === 'stalker') {
          const fx = this.pos.clone().addScaledVector(_v.set(Math.sin(this.facing), 0, Math.cos(this.facing)), T.attackRange * 0.6);
          g.fx.groundWarning(fx, T.attackRange * 0.75, T.windup, 0xff3020);
        }
      }
    }
    if (s === 'stagger' && prev === 'windup') {
      for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].color.copy(this.baseGlow[i]);
      if (this.model && this.model.rig.orb) this.model.rig.orb.scale.setScalar(1);
    }
  }

  mageMove(dx, dz, dist) {
    const [near, far] = this.T.keep;
    if (dist < near) return _v.set(-dx / dist, 0, -dz / dist);
    if (dist > far) return _v.set(dx / dist, 0, dz / dist);
    if (Math.random() < 0.005) this.strafeDir *= -1;
    return _v.set((dz / dist) * this.strafeDir, 0, (-dx / dist) * this.strafeDir).multiplyScalar(0.6);
  }

  castProjectile() {
    const g = this.game, P = g.player;
    const from = new THREE.Vector3();
    if (this.model.rig.orb) this.model.rig.orb.getWorldPosition(from);
    else from.set(this.pos.x, 1.6, this.pos.z);
    const target = P.pos.clone().add(new THREE.Vector3(P.vel.x * 0.35, 1.1, P.vel.z * 0.35));
    const dir = target.sub(from).normalize();
    g.projectiles.spawn({ pos: from, dir, speed: 11, damage: this.T.damage, owner: 'enemy', color: 0xff1a30, homing: 0.6, radius: 0.35, source: this });
    g.audio.play('projectile', { pos: from });
  }

  blink() {
    const g = this.game, P = g.player;
    const _v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const x = P.pos.x + Math.sin(a) * 9, z = P.pos.z + Math.cos(a) * 9;
      if (g.collision.overlaps(x, z, this.radius + 0.2)) continue;
      g.particles.add.burst(_v.set(this.pos.x, 1.2, this.pos.z), 30, { color: 0xff2040, size: 0.25, speed: 3, life: 0.5 });
      this.pos.set(x, 0, z);
      g.particles.add.burst(_v.set(x, 1.2, z), 30, { color: 0xff2040, size: 0.25, speed: 3, life: 0.5 });
      g.audio.play('teleport', { pos: this.pos });
      this.blinkCd = 7;
      return;
    }
    this.blinkCd = 2;
  }

  /** Returns damage actually dealt. info: { dir, knock, poise, breakGuard, source, ability } */
  takeDamage(amount, info = {}) {
    if (!this.alive || this.removed) return 0;
    if (this.state === 'emerge' && this.y < -0.7) return 0;
    const g = this.game;
    let dmg = amount;
    if (this.state === 'block' && info.dir) {
      const fromAng = Math.atan2(-info.dir.x, -info.dir.z);
      const frontal = Math.abs(angleDiff(this.facing, fromAng)) < 1.25;
      if (frontal) {
        if (info.breakGuard) {
          g.ui.floatText(this.pos, 'GUARD BROKEN', 'guard');
          g.audio.play('hitHeavy', { pos: this.pos });
          this.staggerDur = 1.4;
          this.setState('stagger');
        } else {
          dmg *= 0.15;
          g.audio.play('block', { pos: this.pos });
          g.particles.add.burst(_v.set(this.pos.x, 1.3, this.pos.z), 14, { color: 0xffe0a0, size: 0.1, speed: 6, life: 0.3, gravity: -9 });
          info = { ...info, blocked: true };
        }
      }
    }
    this.hp -= dmg;
    this.flash = 0.16;
    if (this.hidden) {
      this.hidden = false;
      this.setOpacity(1);
    }
    if (!this.aggro || this.state === 'idle' || this.state === 'return') this.alert();
    if (info.dir && !info.blocked) this.knock.addScaledVector(info.dir, (info.knock ?? 2.5) / this.T.mass);
    if (!info.blocked) {
      this.poiseDmg += info.poise ?? dmg * 0.6;
      if (this.poiseDmg >= this.T.poise && this.state !== 'stagger') {
        this.poiseDmg = 0;
        this.staggerDur = 0.5;
        this.setState('stagger');
      }
    }
    if (this.hp <= 0) this.die(info);
    return dmg;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.deadT = 0;
    const g = this.game;
    g.audio.play('enemyDeath', { pos: this.pos, pitch: this.type === 'crawler' ? 1.4 : this.type === 'knight' ? 0.7 : 1 });
    g.particles.add.burst(_v.set(this.pos.x, 1, this.pos.z), 26, { color: 0xff1a30, color1: 0x400010, size: 0.25, speed: 4, life: 0.8, gravity: -6 });
    g.particles.dark.burst(_v.set(this.pos.x, 0.8, this.pos.z), 20, { color: 0x1a0508, size: 0.5, speed: 2, life: 1.2, gravity: 0.5 });
    if (this.anim) this.anim.die();
    for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].color.copy(this.baseGlow[i]).multiplyScalar(0.2);
    g.onEnemyKilled(this);
  }

  updateDeath(dt) {
    this.deadT += dt;
    if (this.crawler) {
      this.crawler.body.rotation.z = Math.min(Math.PI, this.deadT * 8);
      this.crawler.body.position.y = 0.45 - Math.min(0.25, this.deadT);
    } else this.anim.update(dt, {});
    if (this.deadT > 1.6) {
      this.y -= dt * 0.7;
      this.updateTransform();
      this.setOpacity(Math.max(0, 1 - (this.deadT - 1.6) / 1.2));
    }
    if (this.deadT > 2.8 && !this.removed) this.remove();
  }

  /** Reset to spawn position at full health (used when the player respawns). */
  resetHome() {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.pos.copy(this.home);
    this.facing = this.homeFacing;
    this.knock.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.aggro = false;
    this.cd = rand(0.5, 1.2);
    this.rootT = this.slowT = 0;
    this.y = 0;
    this.setState('idle');
    if (this.T.stealth) { this.hidden = true; this.setOpacity(0.05); }
    for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].color.copy(this.baseGlow[i]);
    this.updateTransform();
  }

  remove() {
    this.removed = true;
    this.root.removeFromParent();
    if (this.model) this.model.dispose();
    else this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.userData.isOutline) o.material.dispose();
    });
  }
}
