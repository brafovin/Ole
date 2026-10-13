/**
 * The player character: third-person movement, stamina/sprint/jump, melee combos, character-
 * specific right-click (heavy / blood crescent / block & parry), abilities, stats & levelling.
 */
import * as THREE from '../three.js';
import { buildCharacter } from '../characters/CharacterBuilder.js';
import { Animator } from '../characters/Animator.js';
import { CHARACTERS, playerSpec } from '../characters/definitions.js';
import { ABILITIES } from './abilities.js';
import { clamp, damp, dampAngle, angleDiff, rand } from '../core/utils.js';
import { ITEMS } from '../systems/items.js';

const _v = new THREE.Vector3();

export const COMBOS = {
  sword: [
    { anim: 'sword1', dur: 0.5, hit: 0.42, range: 2.9, arc: 1.15, mult: 1.0, slash: { tilt: 0.55, pitch: 0.1 } },
    { anim: 'sword2', dur: 0.5, hit: 0.42, range: 2.9, arc: 1.15, mult: 1.0, slash: { tilt: -0.5, mirror: true, pitch: 0.1 } },
    { anim: 'sword3', dur: 0.74, hit: 0.46, range: 3.3, arc: 1.35, mult: 1.8, heavy: true, slash: { tilt: 1.45, radius: 2.7, width: 1.3 } },
  ],
  blades: [
    { anim: 'blades1', dur: 0.44, hit: 0.4, range: 3.1, arc: 1.1, mult: 0.95, slash: { tilt: 0.3 } },
    { anim: 'blades2', dur: 0.44, hit: 0.4, range: 3.1, arc: 1.1, mult: 0.95, slash: { tilt: -0.3, mirror: true } },
    { anim: 'blades3', dur: 0.64, hit: 0.42, range: 3.4, arc: 1.55, mult: 1.6, heavy: true, slash: { tilt: 0.05, radius: 3.1, width: 1.3, double: true } },
  ],
  dual: [
    { anim: 'dual1', dur: 0.34, hit: 0.4, range: 2.6, arc: 1.1, mult: 0.62, slash: { tilt: 0.45 } },
    { anim: 'dual2', dur: 0.34, hit: 0.4, range: 2.6, arc: 1.1, mult: 0.62, slash: { tilt: -0.45, mirror: true } },
    { anim: 'dual3', dur: 0.42, hit: 0.4, range: 2.7, arc: 1.0, mult: 0.85, slash: { tilt: 1.5 } },
    { anim: 'dual4', dur: 0.64, hit: 0.45, range: 3.1, arc: Math.PI, mult: 1.4, heavy: true, slash: { tilt: 0, arc: 6.2, radius: 2.9, width: 1.2 } },
  ],
};
const HEAVY = { anim: 'swordHeavy', dur: 0.95, hit: 0.6, range: 3.6, arc: 1.7, mult: 2.7, heavy: true, breakGuard: true, poise: 70, slash: { tilt: 0.15, radius: 3.4, width: 1.8, arc: 3.2 } };

const COLORS = {
  lucien: { slash: 0xff1430, core: 0x0a0004 },
  seraphina: { slash: 0xff1a50, core: 0x1a0008 },
  kairo: { slash: 0x6aa8ff, core: 0x050a18 },
};

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.42;
    this.facing = 0;
    this.grounded = true;
    this.alive = true;
    this.level = 1;
    this.xp = 0;
    this.upgradePoints = 0;
    this.alloc = { vit: 0, might: 0, agi: 0, blood: 0 };
    this.cooldowns = { q: 0, e: 0, r: 0 };
    this.action = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.buffered = false;
    this.attackSerial = 0;
    this.invuln = 0;
    this.staminaDelay = 0;
    this.blocking = false;
    this.parryT = 0;
    this.guardT = 0;
    this.stepAcc = 0;
    this.time = 0;
    this.levitate = 0;
    this.hurtT = 0;
    this.drinkT = 0;
    this.model = null;
  }

  // ---------------------------------------------------------------- setup
  setCharacter(id, cosmetic = 'default') {
    const g = this.game;
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose();
    }
    this.charId = id;
    this.cosmetic = cosmetic;
    this.def = CHARACTERS[id];
    this.style = this.def.combat;
    this.model = buildCharacter(playerSpec(id, cosmetic, g.tex.glow));
    this.model.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
    g.scene.add(this.model.root);
    this.anim = new Animator(this.model, this.style);
    this.abilities = ABILITIES[id];
    this.colors = COLORS[id];
    // combat state belongs to the previous body/session: cooldowns, actions and guards start fresh
    this.cooldowns = { q: 0, e: 0, r: 0 };
    this.action = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.buffered = false;
    this.blocking = false;
    this.parryT = 0;
    this.guardT = 0;
    this.levitate = 0;
    this.recompute();
    this.model.root.position.copy(this.pos);
  }

  recompute() {
    const c = this.def.stats;
    const r = this.game.inventory ? this.game.inventory.relicMods() : {};
    const bonusBlood = this.game.flags && this.game.flags.altar_reward ? 20 : 0;
    const prevMax = this.maxHp || 1;
    this.stats = {
      maxHp: Math.round(c.hp + (this.level - 1) * 8 + this.alloc.vit * 15 + (r.hp || 0)),
      maxStamina: Math.round(c.stamina + this.alloc.agi * 12),
      maxBlood: Math.round(c.blood + this.alloc.blood * 12 + bonusBlood),
      damage: c.damage * (1 + (this.level - 1) * 0.045 + this.alloc.might * 0.07 + (r.damage || 0)),
      speed: c.speed * (1 + this.alloc.agi * 0.03 + (r.speed || 0)),
      cdr: Math.min(0.4, this.alloc.blood * 0.04 + (r.cdr || 0)),
      staminaRegen: 1 + (r.staminaRegen || 0),
      bloodRegen: 1 + (r.bloodRegen || 0),
      bloodOnHit: 3 + (r.bloodOnHit || 0),
      xpMult: 1 + (r.xp || 0),
    };
    this.stats.dmgBase = 14 * this.stats.damage;
    this.maxHp = this.stats.maxHp;
    this.maxStamina = this.stats.maxStamina;
    this.maxBlood = this.stats.maxBlood;
    if (this.hp === undefined) this.hp = this.maxHp;
    else this.hp = clamp(this.hp * (this.maxHp / prevMax), 1, this.maxHp);
    if (this.stamina === undefined) this.stamina = this.maxStamina;
    if (this.blood === undefined) this.blood = this.maxBlood * 0.5;
    this.stamina = Math.min(this.stamina, this.maxStamina);
    this.blood = Math.min(this.blood, this.maxBlood);
  }

  xpToNext() { return Math.round(70 * Math.pow(this.level, 1.45)); }

  // ---------------------------------------------------------------- persistence
  serialize() {
    return { level: this.level, xp: this.xp, upgradePoints: this.upgradePoints, alloc: { ...this.alloc }, blood: Math.round(this.blood) };
  }

  deserialize(d) {
    this.level = d.level || 1;
    this.xp = d.xp || 0;
    this.upgradePoints = d.upgradePoints || 0;
    this.alloc = { vit: 0, might: 0, agi: 0, blood: 0, ...(d.alloc || {}) };
    this.hp = undefined;
    this.stamina = undefined;
    this.blood = undefined;
    this.recompute();
    this.blood = clamp(d.blood ?? this.maxBlood * 0.5, 0, this.maxBlood);
  }

  resetProgress() {
    this.level = 1;
    this.xp = 0;
    this.upgradePoints = 0;
    this.alloc = { vit: 0, might: 0, agi: 0, blood: 0 };
    this.hp = this.stamina = this.blood = undefined;
    this.recompute();
  }

  // ---------------------------------------------------------------- helpers
  aimDir() {
    const yaw = this.game.cameraRig.yaw;
    return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  isAttacking() { return !!(this.action && this.action.kind === 'attack'); }

  lockAction(name, dur, opts = {}) {
    this.action = { kind: 'locked', name, t: 0, dur, move: opts.move ?? 0, levitate: opts.levitate ?? 0 };
  }

  gainBlood(n) { this.blood = Math.min(this.maxBlood, this.blood + n); }

  heal(n, quiet = false) {
    if (!this.alive || n <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const healed = Math.round(this.hp - before);
    if (!quiet && healed > 0) this.game.ui.damageNumber(_v.set(this.pos.x, 2.2, this.pos.z), healed, 'heal');
  }

  addXP(n) {
    const g = this.game;
    const amount = Math.round(n * this.stats.xpMult);
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.upgradePoints++;
      leveled = true;
    }
    if (leveled) {
      this.recompute();
      this.hp = this.maxHp;
      this.stamina = this.maxStamina;
      g.audio.play('levelUp');
      g.ui.banner(`LEVEL ${this.level}`, 'Your blood grows stronger. Spend upgrade points in the Inventory [Tab].');
      g.fx.pillar(this.pos, 0xff3050, 0.6, 7, 1.0);
      g.particles.add.burst(_v.set(this.pos.x, 1, this.pos.z), 60, { color: 0xff4060, size: 0.2, speed: 4, life: 1, gravity: 2 });
    }
    return amount;
  }

  spendPoint(stat) {
    if (this.upgradePoints <= 0 || !(stat in this.alloc)) return false;
    this.upgradePoints--;
    this.alloc[stat]++;
    const hpBefore = this.hp;
    this.recompute();
    if (stat === 'vit') this.hp = Math.min(this.maxHp, hpBefore + 15);
    return true;
  }

  // ---------------------------------------------------------------- damage
  /** Returns 'ignored' | 'hit' | 'blocked' | 'parried' | 'reflected' */
  takeDamage(amount, o = {}) {
    const g = this.game;
    if (!this.alive || this.invuln > 0 || g.godMode) return 'ignored';
    const fromAng = o.from ? Math.atan2(o.from.x - this.pos.x, o.from.z - this.pos.z) : this.facing;
    const frontal = Math.abs(angleDiff(this.facing, fromAng)) < 1.25;
    const src = o.source;
    // Moonlight Guard barrier
    if (this.guardT > 0 && !o.unblockable) {
      g.audio.play('block', { pitch: 1.4 });
      g.particles.add.burst(_v.set(this.pos.x, 1.2, this.pos.z), 16, { color: 0x8ac0ff, size: 0.15, speed: 5, life: 0.4 });
      if (o.projectile) return 'reflected';
      amount *= 0.15;
      if (src && src.takeDamage && src.alive && !src.isBoss) {
        const d = new THREE.Vector3(src.pos.x - this.pos.x, 0, src.pos.z - this.pos.z).normalize();
        g.combat.hit(src, this.stats.dmgBase * 1.1, { dir: d, knock: 8, ability: true, poise: 30, color: 0x8ac0ff });
      }
    }
    // Kairo's block & parry
    if (this.blocking && frontal && !o.unblockable) {
      if (this.parryT > 0) {
        g.audio.play('parry');
        g.ui.floatText(this.pos, 'PARRY', 'guard');
        g.hitstop(0.12);
        g.slowmo(0.35, 0.35);
        g.particles.add.burst(_v.set(this.pos.x, 1.3, this.pos.z), 24, { color: 0xbad8ff, size: 0.12, speed: 7, life: 0.4, gravity: -6 });
        if (src && src.alive && src.setState && !src.isBoss) { src.staggerDur = 1.2; src.setState('stagger'); }
        this.gainBlood(10);
        if (o.projectile) return 'reflected';
        return 'parried';
      }
      const cost = 10 + amount * 0.8;
      this.stamina -= cost;
      this.staminaDelay = 0.8;
      g.audio.play('block');
      g.particles.add.burst(_v.set(this.pos.x, 1.3, this.pos.z), 10, { color: 0xffe0b0, size: 0.1, speed: 5, life: 0.3, gravity: -9 });
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.blocking = false;
        this.hurtT = 0.6;
        g.ui.floatText(this.pos, 'GUARD BROKEN', 'guard');
        amount *= 0.5;
      } else {
        this.knockback(o.from, (o.knock ?? 3) * 0.4);
        return 'blocked';
      }
    }
    this.hp -= amount;
    this.invuln = 0.4;
    this.hurtT = 0.22;
    g.audio.play('playerHurt');
    g.hurtFlash(Math.min(1, amount / 30 + 0.3));
    g.shake(Math.min(0.5, 0.15 + amount / 60));
    g.particles.add.burst(_v.set(this.pos.x, 1.2, this.pos.z), 12, { color: 0xff1020, size: 0.16, speed: 3, life: 0.4, gravity: -9 });
    this.knockback(o.from, o.knock ?? 3);
    if (!this.action || this.action.kind !== 'locked') {
      if (amount > 15) this.action = null;
      if (!this.isAttacking()) this.anim.play('hit', 0.35);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  knockback(from, k) {
    if (!from || !k) return;
    _v.set(this.pos.x - from.x, 0, this.pos.z - from.z);
    if (_v.lengthSq() < 1e-4) return;
    _v.normalize().multiplyScalar(k);
    this.vel.x += _v.x;
    this.vel.z += _v.z;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.action = null;
    this.blocking = false;
    this.anim.die();
    this.game.onPlayerDeath();
  }

  respawn(pos, facing) {
    this.alive = true;
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.facing = facing ?? this.facing;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.blood = Math.max(this.blood, this.maxBlood * 0.5);
    this.action = null;
    this.invuln = 1.5;
    this.levitate = 0;
    this.guardT = 0;
    this.cooldowns = { q: 0, e: 0, r: 0 };
    this.anim.revive();
    this.anim.stop(false);
    this.model.root.position.copy(this.pos);
  }

  // ---------------------------------------------------------------- update
  update(dt, controls) {
    const g = this.game;
    this.time += dt;
    const I = g.input;
    if (!this.alive) {
      this.anim.update(dt, {});
      this.model.root.position.copy(this.pos);
      return;
    }
    // timers
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.guardT = Math.max(0, this.guardT - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    for (const k of ['q', 'e', 'r']) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.blood = Math.min(this.maxBlood, this.blood + 1.3 * this.stats.bloodRegen * dt);

    const ctl = controls && g.acceptInput;
    // ---------------- actions
    const act = this.action;
    if (act) {
      act.t += dt;
      if (act.kind === 'attack') {
        if (!act.hitDone && act.t >= act.def.dur * act.def.hit) {
          act.hitDone = true;
          this.performHit(act.def);
        }
        if (act.t >= act.def.dur) {
          this.action = null;
          this.comboTimer = 0.55;
          if (this.buffered && ctl) {
            this.buffered = false;
            this.startAttack((act.step + 1) % COMBOS[this.style].length);
          }
        }
      } else if (act.t >= act.dur) this.action = null;
    }
    if (ctl) this.handleCombatInput();

    // ---------------- movement
    let mx = 0, mz = 0;
    if (ctl) {
      if (I.down('KeyW') || I.down('ArrowUp')) mz += 1;
      if (I.down('KeyS') || I.down('ArrowDown')) mz -= 1;
      if (I.down('KeyA') || I.down('ArrowLeft')) mx -= 1;
      if (I.down('KeyD') || I.down('ArrowRight')) mx += 1;
    }
    const yaw = g.cameraRig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // camera forward
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // camera right
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const mlen = Math.hypot(dx, dz);
    if (mlen > 0) { dx /= mlen; dz /= mlen; }
    const moving = mlen > 0;
    const wantSprint = ctl && moving && (I.down('ShiftLeft') || I.down('ShiftRight')) && this.stamina > 1 && !this.blocking;
    let speed = 5.0 * this.stats.speed;
    if (wantSprint) {
      speed *= 1.6;
      this.stamina -= 15 * dt;
      this.staminaDelay = 0.5;
      if (this.stamina < 0) this.stamina = 0;
    }
    if (this.blocking) speed *= 0.4;
    if (this.drinkT > 0) { speed *= 0.4; this.drinkT -= dt; }
    let moveMul = 1;
    if (this.action) {
      if (this.action.kind === 'attack') moveMul = this.action.t < this.action.def.dur * 0.3 ? 0.35 : 0.12;
      else moveMul = this.action.move ?? 0;
    }
    if (this.hurtT > 0) moveMul *= 0.3;
    const targetVX = dx * speed * moveMul, targetVZ = dz * speed * moveMul;
    const accel = this.grounded ? 14 : 4;
    this.vel.x = damp(this.vel.x, targetVX, accel, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel, dt);
    // attack lunge
    if (this.action && this.action.kind === 'attack' && this.action.t < this.action.def.dur * 0.35) {
      const f = this.forward(_v);
      this.vel.x += f.x * 3.2 * dt * 8;
      this.vel.z += f.z * 3.2 * dt * 8;
    }
    // jump / gravity / levitation
    const lev = this.action && this.action.kind === 'locked' && this.action.levitate;
    if (lev) {
      this.levitate = damp(this.levitate, this.action.levitate, 6, dt);
      this.pos.y = this.levitate;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      if (this.levitate > 0.01) {
        this.levitate = damp(this.levitate, 0, 8, dt);
        this.pos.y = this.levitate;
      }
      if (ctl && I.pressed('Space') && this.grounded && !this.action && this.stamina > 6) {
        this.vel.y = 7.4;
        this.grounded = false;
        this.stamina -= 6;
        this.staminaDelay = 0.4;
        g.audio.play('jump');
      }
      if (!this.grounded || this.vel.y > 0) {
        this.vel.y -= 22 * dt;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= 0) {
          this.pos.y = 0;
          if (this.vel.y < -4) g.audio.play('land', { vol: 0.6 });
          this.vel.y = 0;
          this.grounded = true;
        }
      }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    g.collision.resolveCircle(this.pos, this.radius, this.pos.y);

    // stamina regen
    if (this.staminaDelay <= 0 && !this.blocking) this.stamina = Math.min(this.maxStamina, this.stamina + 28 * this.stats.staminaRegen * dt);

    // facing: movement direction, or aim while fighting/blocking
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.blocking) this.facing = dampAngle(this.facing, Math.atan2(fx, fz), 14, dt);
    else if (this.action && this.action.kind === 'attack') { /* facing fixed at swing start */ }
    else if (!this.action && moving && hs > 0.5) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);

    // footsteps
    if (this.grounded && hs > 0.8 && this.pos.y < 0.05) {
      this.stepAcc += hs * dt;
      const stride = wantSprint ? 2.3 : 1.65;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const area = g.world.area.id;
        g.audio.play('step', { surface: area === 'forest' ? 'grass' : 'stone', pitch: rand(0.9, 1.1), vol: wantSprint ? 1 : 0.7 });
      }
    }

    // animation
    const localVel = _v.set(this.vel.x, this.vel.y, this.vel.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.facing);
    this.anim.update(dt, { speed: hs, grounded: this.grounded && this.pos.y < 0.05, vy: this.vel.y });
    this.model.updateSecondary(dt, localVel, this.time);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    // flicker while invulnerable after a hit
    this.model.root.visible = !(this.invuln > 0 && this.hurtT === 0 && this.invuln < 0.4 && Math.floor(this.time * 20) % 2 === 0 && !this.action);
    // weapon glow pulse
    for (const m of this.model.weaponGlow) {
      if (m.color && !m.userData.base) m.userData.base = m.color.clone();
      if (m.userData.base) m.color.copy(m.userData.base).multiplyScalar(1.1 + Math.sin(this.time * 3) * 0.2 + (this.isAttacking() ? 0.6 : 0));
    }
  }

  handleCombatInput() {
    const g = this.game, I = g.input;
    const locked = this.action && this.action.kind === 'locked';
    // Kairo: hold right mouse to block
    if (this.style === 'dual') {
      const want = I.mouseDown(2) && !locked && this.stamina > 0;
      if (want && !this.blocking) {
        this.blocking = true;
        this.parryT = 0.24;
        this.action = null;
        this.anim.play('block', 0.3, { hold: true, fadeIn: 0.05 });
      } else if (!want && this.blocking) {
        this.blocking = false;
        this.anim.stop();
      }
    }
    if (this.blocking) return;
    // healing vial
    if ((I.pressed('KeyH') || I.pressed('Digit1')) && !locked) this.drinkVial();
    // abilities
    for (const key of ['q', 'e', 'r']) {
      const code = 'Key' + key.toUpperCase();
      if (!I.pressed(code)) continue;
      this.tryAbility(key);
    }
    // left mouse: combo
    if (I.mousePressed(0) && !locked) {
      if (!this.action) this.startAttack(this.comboTimer > 0 ? (this.combo + 1) % COMBOS[this.style].length : 0);
      else if (this.action.kind === 'attack' && this.action.t > this.action.def.dur * 0.35) this.buffered = true;
    }
    // right mouse: heavy (Lucien) or blood crescent (Seraphina)
    if (I.mousePressed(2) && !this.action) {
      if (this.style === 'sword') {
        if (this.stamina >= 24) {
          this.stamina -= 24;
          this.staminaDelay = 0.9;
          this.startAttack(-1);
        } else this.lowStamina();
      } else if (this.style === 'blades') {
        if (this.stamina >= 20) {
          this.stamina -= 20;
          this.staminaDelay = 0.9;
          this.throwCrescent();
        } else this.lowStamina();
      }
    }
  }

  lowStamina() {
    this.game.audio.play('denied');
    this.game.ui.flashBar('stamina');
  }

  tryAbility(key) {
    const g = this.game;
    const meta = this.def.abilities[key];
    if (this.action && this.action.kind === 'locked') return false;
    if (this.cooldowns[key] > 0) {
      g.audio.play('denied');
      g.ui.flashAbility(key);
      return false;
    }
    if (this.blood < meta.cost) {
      g.audio.play('denied');
      g.ui.flashBar('blood');
      g.ui.toast('Not enough blood energy', 'warn');
      return false;
    }
    this.action = null;
    let ok = false;
    try {
      ok = this.abilities[key](g, this);
    } catch (err) {
      console.error('[Player] ability failed', key, err);
      ok = false;
    }
    if (ok) {
      this.blood -= meta.cost;
      this.cooldowns[key] = meta.cd * (1 - this.stats.cdr);
      g.stats.abilities = (g.stats.abilities || 0) + 1;
    }
    return ok;
  }

  startAttack(step) {
    const g = this.game;
    const def = step < 0 ? HEAVY : COMBOS[this.style][step];
    if (step >= 0) this.combo = step;
    this.action = { kind: 'attack', def, t: 0, hitDone: false, step: step < 0 ? -1 : step };
    this.attackSerial++;
    // aim: camera direction, with a gentle assist toward the nearest enemy in front
    const aim = this.aimDir();
    const target = g.enemies.nearestInCone(this.pos, aim, def.range + 1.5, 0.9);
    this.facing = target ? Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z) : Math.atan2(aim.x, aim.z);
    this.anim.play(def.anim, def.dur, { fadeIn: 0.04 });
    g.audio.play(def.heavy ? 'swingHeavy' : 'swing', { pitch: this.style === 'dual' ? 1.25 : this.style === 'blades' ? 1.1 : 1 });
  }

  performHit(def) {
    const g = this.game;
    const fwd = this.forward(new THREE.Vector3());
    const origin = this.pos.clone().addScaledVector(fwd, -0.2);
    const col = this.colors;
    const sl = def.slash || {};
    const center = new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z);
    g.fx.slash(center, this.facing, { radius: sl.radius ?? def.range * 0.85, width: sl.width ?? 0.9, arc: sl.arc ?? def.arc * 2, tilt: sl.tilt ?? 0, pitch: sl.pitch ?? 0, mirror: sl.mirror, color: col.slash, core: col.core, dur: def.heavy ? 0.36 : 0.26 });
    if (sl.double) g.fx.slash(center, this.facing, { radius: (sl.radius ?? 3) * 0.85, width: 0.8, arc: def.arc * 2, tilt: -0.05, mirror: true, color: col.slash, core: col.core, dur: 0.3 });
    const targets = g.enemies.queryArc(origin, fwd, def.range, def.arc);
    const base = this.stats.dmgBase * def.mult;
    for (const e of targets) {
      g.combat.hit(e, base, { dir: fwd.clone(), knock: def.heavy ? 6 : 2.5, poise: def.poise ?? base * 0.6, breakGuard: def.breakGuard, heavy: def.heavy });
    }
    if (def.heavy) g.fx.flash(center, col.slash, 3, 0.15);
  }

  throwCrescent() {
    const g = this.game;
    this.action = { kind: 'locked', name: 'throw', t: 0, dur: 0.5, move: 0.3 };
    this.attackSerial++;
    const aim = this.aimDir();
    this.facing = Math.atan2(aim.x, aim.z);
    this.anim.play('throw', 0.5);
    g.audio.play('crescent');
    g.tasks.after(0.22, () => {
      if (!this.alive) return;
      const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z).addScaledVector(aim, 0.6);
      g.projectiles.spawn({ pos: from, dir: aim, speed: 20, damage: this.stats.dmgBase * 2.1, owner: 'player', color: 0xff1a50, kind: 'crescent', radius: 1.1, size: 1.3, pierce: true, life: 1.4, knock: 4, poise: 30 });
    });
  }

  drinkVial() {
    const g = this.game;
    if (!g.inventory.has('vial')) {
      g.ui.toast('No Blood Vials left', 'warn');
      g.audio.play('denied');
      return;
    }
    if (this.hp >= this.maxHp) {
      g.ui.toast('Already at full health', 'info');
      return;
    }
    g.inventory.remove('vial', 1);
    this.drinkT = 0.7;
    this.anim.play('drink', 0.7);
    g.audio.play('heal');
    const amount = this.maxHp * ITEMS.vial.heal;
    g.tasks.run({ dur: 0.7, update: (k, dt) => this.heal((amount / 0.7) * dt, true), end: () => g.ui.damageNumber(_v.set(this.pos.x, 2.2, this.pos.z), Math.round(amount), 'heal') });
    g.particles.add.burst(_v.set(this.pos.x, 1, this.pos.z), 30, { color: 0xff3050, size: 0.15, speed: 2, life: 0.8, gravity: 2 });
  }
}
