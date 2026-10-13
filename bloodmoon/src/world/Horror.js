/**
 * Horror director: paces atmospheric scares so they feel organic but never constant.
 *  - silhouettes that appear at the edge of vision and vanish when looked at
 *  - whispers (with optional subtitles), distant footsteps, crows, owls, bells
 *  - light flicker surges and the scripted "candles go out" beat in the cathedral
 *  - heartbeat at low health
 * Safe zones (shrines, the chapel house, the hunter's camp) suppress all events.
 */
import * as THREE from '../three.js';
import { rand, choice, angleDiff } from '../core/utils.js';

export class HorrorDirector {
  constructor(game) {
    this.game = game;
    this.timer = 18;
    this.ambTimer = 6;
    this.heartTimer = 0;
    this.apparition = this._buildApparition();
    this.app = null;
    game.scene.add(this.apparition);
  }

  _buildApparition() {
    const g = new THREE.Group();
    const black = new THREE.MeshBasicMaterial({ color: 0x020103, transparent: true, opacity: 1, fog: true });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 10, 1, true), black);
    robe.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), black);
    head.position.y = 2.45;
    head.scale.set(0.9, 1.3, 0.9);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.5, 5), black);
    armL.position.set(0.32, 1.45, 0);
    armL.rotation.z = 0.12;
    const armR = armL.clone();
    armR.position.x = -0.32;
    armR.rotation.z = -0.12;
    g.add(robe, head, armL, armR);
    const eyeMat = new THREE.SpriteMaterial({ map: this.game.tex.glow, color: 0xff1020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const s of [-1, 1]) {
      const e = new THREE.Sprite(eyeMat);
      e.scale.setScalar(0.14);
      e.position.set(s * 0.06, 2.5, 0.15);
      g.add(e);
    }
    g.visible = false;
    g.userData.mats = [black, eyeMat];
    return g;
  }

  reset() {
    this.timer = 18;
    this.app = null;
    this.apparition.visible = false;
    this.game.world.lights.surge = 0;
    this.game.world.lights.globalDim = 1;
  }

  get calm() {
    const g = this.game;
    return !g.player || g.world.inSafeZone(g.player.pos) || g.boss || g.dialogue.active;
  }

  update(dt) {
    const g = this.game;
    if (!g.player) return;
    this._updateApparition(dt);
    // low health heartbeat
    if (g.player.alive && g.player.hp / g.player.maxHp < 0.3) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.95;
        g.audio.play('heartbeat', { vol: 0.9 });
      }
    }
    // flicker surge decay
    const L = g.world.lights;
    if (L.surge > 0) L.surge = Math.max(0, L.surge - dt * 0.6);

    if (this.calm) return;
    const area = g.world.area.id;
    // ambient one-shots
    this.ambTimer -= dt;
    if (this.ambTimer <= 0) {
      this.ambTimer = rand(7, 16);
      const p = g.player.pos;
      const pos = new THREE.Vector3(p.x + rand(-25, 25), 2, p.z + rand(-25, 25));
      const pool = { cathedral: ['drip', 'creak', 'drip'], village: ['crow', 'creak', 'footstepsDistant'], forest: ['owl', 'crow', 'whisper', 'owl'], altar: ['whisper', 'drip'] }[area];
      g.audio.play(choice(pool), { pos, maxDist: 60, vol: 0.8 });
    }
    // bigger events
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = area === 'forest' ? rand(18, 34) : rand(26, 52);
      if (g.enemies.inCombat()) return; // never stack scares on top of fights
      const roll = Math.random();
      if (roll < 0.35) this.spawnApparition();
      else if (roll < 0.55) this.flickerSurge();
      else if (roll < 0.75) this.footstepsBehind();
      else if (roll < 0.9) this.whisper(null, choice(WHISPERS[area] || WHISPERS.village));
      else this.crows();
    }
  }

  spawnApparition() {
    const g = this.game;
    if (this.app) return;
    const cam = g.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const yaw = Math.atan2(fwd.x, fwd.z);
    for (let tries = 0; tries < 8; tries++) {
      const off = (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 0.78);
      const d = rand(16, 28);
      const a = yaw + off;
      const x = g.player.pos.x + Math.sin(a) * d, z = g.player.pos.z + Math.cos(a) * d;
      if (g.collision.overlaps(x, z, 0.6)) continue;
      if (!g.collision.lineOfSight(g.player.pos, { x, z })) continue;
      this.apparition.position.set(x, 0, z);
      this.apparition.lookAt(g.player.pos.x, 0, g.player.pos.z);
      this.apparition.visible = true;
      this.apparition.userData.mats[0].opacity = 1;
      this.apparition.userData.mats[1].opacity = 1;
      this.app = { t: 0, fading: false, fade: 1 };
      return;
    }
  }

  _updateApparition(dt) {
    const a = this.app;
    if (!a) return;
    const g = this.game;
    a.t += dt;
    const ap = this.apparition.position;
    const cam = g.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const to = new THREE.Vector3(ap.x - cam.position.x, 0, ap.z - cam.position.z);
    const dist = to.length();
    const look = Math.abs(angleDiff(Math.atan2(fwd.x, fwd.z), Math.atan2(to.x, to.z)));
    if (!a.fading && ((look < 0.28 && a.t > 0.35) || dist < 9 || a.t > 5)) {
      a.fading = true;
      if (look < 0.28) {
        g.audio.play('whisper', { pos: ap, vol: 0.7 });
        g.flashScreen(0x300008, 0.15);
      }
    }
    if (a.fading) {
      a.fade -= dt * 3.5;
      for (const m of this.apparition.userData.mats) m.opacity = Math.max(0, a.fade);
      if (a.fade <= 0) {
        this.apparition.visible = false;
        this.app = null;
      }
    }
  }

  flickerSurge() {
    this.game.world.lights.surge = 1;
    this.game.audio.play('stingSoft', { vol: 0.5 });
  }

  footstepsBehind() {
    const g = this.game;
    const fwd = g.camera.getWorldDirection(new THREE.Vector3());
    const pos = g.player.pos.clone().addScaledVector(fwd, -8);
    g.audio.play('footstepsDistant', { pos, vol: 1.3, maxDist: 30 });
  }

  crows() {
    const g = this.game;
    const p = g.player.pos;
    const pos = new THREE.Vector3(p.x + rand(-8, 8), 5, p.z + rand(-8, 8));
    g.audio.play('crow', { pos, maxDist: 40 });
    for (let i = 0; i < 6; i++) {
      g.particles.dark.emit({
        pos: { x: pos.x + rand(-1, 1), y: pos.y, z: pos.z + rand(-1, 1) },
        vel: { x: rand(-3, 3), y: rand(2, 4), z: rand(-3, 3) }, life: 2.2, size: 0.35, size1: 0.3, color: 0x050305, alpha: 1, gravity: 0.5, drag: 0.2,
      });
    }
  }

  /** Play a whisper at a world position with an optional subtitle line. */
  whisper(pos, text) {
    const g = this.game;
    const p = pos || g.player.pos.clone().add(new THREE.Vector3(rand(-6, 6), 2, rand(-6, 6)));
    g.audio.play('whisper', { pos: p, vol: 1.2, maxDist: 30 });
    if (text) g.ui.subtitle(text, true);
  }

  /** Scripted: every candle in the nave dies at once, then slowly returns. */
  candlesOut() {
    const g = this.game;
    const W = g.world;
    g.audio.play('candlesOut');
    W.flames.setGroup('nave', 0);
    W.flames.setGroup('altar', 0);
    W.lights.globalDim = 0.25;
    g.tasks.after(1.2, () => this.whisper(new THREE.Vector3(0, 3, -10), '…you were here before… on the seventh night…'));
    g.tasks.after(2.2, () => this.spawnApparitionAt(new THREE.Vector3(0, 0, -14.5)));
    g.tasks.run({
      dur: 4, update: () => {}, end: () => {
        W.flames.setGroup('nave', 1);
        W.flames.setGroup('altar', 1);
        g.tasks.run({ dur: 1.5, update: (k) => (W.lights.globalDim = 0.25 + 0.75 * k) });
      },
    });
  }

  spawnApparitionAt(pos) {
    if (this.app) return;
    this.apparition.position.copy(pos);
    this.apparition.lookAt(this.game.player.pos.x, 0, this.game.player.pos.z);
    this.apparition.visible = true;
    for (const m of this.apparition.userData.mats) m.opacity = 1;
    this.app = { t: 0, fading: false, fade: 1 };
  }

  /** A sudden but fair scare: sound sting + optional flash, respecting accessibility settings. */
  jumpscare() {
    const g = this.game;
    g.audio.sting('scare');
    g.flashScreen(0x5a0010, 0.35);
    g.shake(0.5);
  }
}

const WHISPERS = {
  cathedral: ['…wake up… wake up, little heir…', '…the doors remember your hands…', '…seven nights… seven nights…'],
  village: ['…they took us at the bells…', '…the veiled ones are coming back…', '…you smell like the Queen…', '…don\'t look at the moon…'],
  forest: ['…it is following you…', '…turn around… no, don\'t…', '…the trees were people once…', '…closer… closer…'],
  altar: ['…she is waiting…', '…kneel…', '…the moon is hungry…'],
};
