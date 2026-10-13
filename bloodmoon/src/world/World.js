/**
 * The world: builds all four areas, owns lighting/atmosphere, and manages interactables,
 * triggers, pickups, NPCs, shrines (checkpoints) and persistent world state.
 */
import * as THREE from '../three.js';
import { buildEnvMaterials, rimUniforms } from '../gfx/materials.js';
import { Sky } from '../gfx/sky.js';
import { StaticBatcher, LightPool, FlameField, BuildContext } from './builders.js';
import { treeGeometry, shrine as shrineProp, pickupMesh } from './props.js';
import { buildCathedral } from './areas/cathedral.js';
import { buildVillage } from './areas/village.js';
import { buildForest } from './areas/forest.js';
import { buildAltar } from './areas/altar.js';
import { buildCharacter } from '../characters/CharacterBuilder.js';
import { Animator } from '../characters/Animator.js';
import { NPCS } from '../characters/definitions.js';
import { damp, lerp, nextFrame, rand } from '../core/utils.js';
import { ITEMS } from '../systems/items.js';

export const AREAS = [
  {
    id: 'cathedral', name: 'The Forgotten Cathedral', sub: 'Area I', seed: 101, zMin: -17,
    fog: 0x0b0710, density: 0.03, hemiSky: 0x7a6a94, hemiGround: 0x2a161a, hemi: 2.0, moon: 0.2, fill: 0.35,
    rim: 0x9a8aff, rimK: 0.55, music: 'cathedral', amb: { wind: 0.05, drone: 0.75, forest: 0 }, moonScale: 1, particles: 'dust',
  },
  {
    id: 'village', name: 'The Ashen Village', sub: 'Area II', seed: 202, zMin: -93,
    fog: 0x160a12, density: 0.03, hemiSky: 0x5a62a0, hemiGround: 0x22100e, hemi: 1.0, moon: 1.2, fill: 0.75,
    rim: 0x7d93ff, rimK: 0.5, music: 'explore', amb: { wind: 0.65, drone: 0.08, forest: 0 }, moonScale: 1, particles: 'ash',
  },
  {
    id: 'forest', name: 'The Whispering Forest', sub: 'Area III', seed: 303, zMin: -178,
    fog: 0x0c0b12, density: 0.048, hemiSky: 0x4a5886, hemiGround: 0x16120e, hemi: 1.15, moon: 0.9, fill: 0.6,
    rim: 0x6a84e0, rimK: 0.55, music: 'forest', amb: { wind: 0.35, drone: 0, forest: 1 }, moonScale: 1.1, particles: 'wisp',
  },
  {
    id: 'altar', name: 'The Blood Altar', sub: 'Area IV', seed: 404, zMin: -Infinity,
    fog: 0x1c060a, density: 0.022, hemiSky: 0x7a3a50, hemiGround: 0x280a0c, hemi: 0.95, moon: 1.8, fill: 0.45,
    rim: 0xff5a6a, rimK: 0.55, music: 'explore', amb: { wind: 0.75, drone: 0.3, forest: 0 }, moonScale: 1.9, particles: 'embers',
  },
];

const QUALITY = {
  low: { lights: 3, shadows: 0, fogBanks: 10, particles: 0.5 },
  medium: { lights: 6, shadows: 1024, fogBanks: 22, particles: 0.8 },
  high: { lights: 8, shadows: 2048, fogBanks: 34, particles: 1 },
};

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tex = game.tex;
    this.interactables = [];
    this.triggers = [];
    this.spawnDefs = [];
    this.npcs = [];
    this.pickups = [];
    this.points = {};
    this.stateful = [];
    this.doors = {};
    this.altars = {};
    this.animated = [];
    this.lampMeshes = [];
    this.safeZones = [];
    this.shrines = {};
    this.trees = [];
    this.area = AREAS[0];
    this.atmo = null;
  }

  async build(progress = () => {}) {
    const g = this.game;
    this.root = new THREE.Group();
    this.root.name = 'world';
    this.scene.add(this.root);
    this.mats = buildEnvMaterials(this.tex);
    this.batch = new StaticBatcher();
    const q = QUALITY[g.settings.get('quality')];
    this.lights = new LightPool(this.scene, q.lights);
    this.flames = new FlameField(this.tex.glow);

    const builders = [buildCathedral, buildVillage, buildForest, buildAltar];
    for (let i = 0; i < AREAS.length; i++) {
      const ctx = new BuildContext(this, AREAS[i]);
      builders[i](ctx);
      progress((i + 1) / (AREAS.length + 1));
      await nextFrame();
    }
    this._buildTrees();
    this.batch.build(this.root);
    this.flames.build(this.scene);

    // sky and lights
    this.sky = new Sky(this.scene, this.tex);
    this.hemi = new THREE.HemisphereLight(0x4a4a72, 0x1a0a0a, 0.6);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xff7a78, 1.2);
    this.moon.target = new THREE.Object3D();
    this.scene.add(this.moon, this.moon.target);
    this.fill = new THREE.DirectionalLight(0x6a84e8, 0.3);
    this.fill.position.set(-30, 40, 40);
    this.scene.add(this.fill);
    this.hero = new THREE.PointLight(0xb0a8ff, 2.6, 11, 2);
    this.scene.add(this.hero);
    this.scene.fog = new THREE.FogExp2(AREAS[0].fog, AREAS[0].density);
    this.atmo = {
      fog: new THREE.Color(AREAS[0].fog), density: AREAS[0].density,
      hemiSky: new THREE.Color(AREAS[0].hemiSky), hemiGround: new THREE.Color(AREAS[0].hemiGround), hemi: AREAS[0].hemi,
      moon: AREAS[0].moon, fill: AREAS[0].fill, rim: new THREE.Color(AREAS[0].rim), rimK: AREAS[0].rimK, moonScale: 1,
    };
    this._buildFogBanks();
    this.setQuality(g.settings.get('quality'));
    progress(1);
  }

  // ---------------------------------------------------------------- registration API (used by area builders)
  interact(def) {
    const d = { radius: 2.2, ...def };
    this.interactables.push(d);
    return d;
  }

  trigger(def) {
    this.triggers.push({ once: true, inside: false, fired: false, ...def });
  }

  spawn(def) { this.spawnDefs.push(def); }

  treeAt(x, z, s = 1) {
    this.trees.push({ x, z, s, ry: rand(0, Math.PI * 2), v: (Math.abs(Math.floor(x * 7 + z * 13)) % 6) });
    this.game.collision.addCircle(x, z, 0.38 * s, { height: 50 });
  }

  pickup(def) {
    const item = ITEMS[def.item];
    const ctx = { M: null, add: (o) => { o.userData.dynamic = true; this.root.add(o); return o; }, tex: this.tex, mats: this.mats, root: this.root };
    const mesh = pickupMesh(ctx, def.pos.x, def.pos.y, def.pos.z, def.kind);
    const p = { ...def, itemId: def.item, mesh, itemDef: item };
    this.pickups.push(p);
    const verb = { relic: 'Take the relic', record: 'Pick up the lost record', vial: 'Take the Blood Vial', key: 'Take the key', note: 'Pick up the note' }[def.kind];
    this.interact({
      id: 'pickup_' + def.id, pos: def.pos, radius: 2,
      prompt: `${verb}${item ? ' — ' + item.name : ''}`,
      visible: (g) => !g.flags['item_' + def.id],
      use: (g) => this.collect(p),
    });
    this.stateful.push({ sync: (f) => (mesh.visible = !f['item_' + def.id]) });
    return p;
  }

  collect(p) {
    const g = this.game;
    g.flags['item_' + p.id] = true;
    p.mesh.visible = false;
    g.inventory.add(p.itemId, 1);
    g.particles.add.burst(p.pos, 24, { color: p.kind === 'relic' ? 0xffc060 : 0xff3050, size: 0.18, speed: 2.5, life: 0.7, gravity: 1 });
    if (p.kind === 'relic' && p.hidden) g.quests.progress('s1', 'relics');
    if (p.kind === 'record') {
      g.quests.progress('s4', 'records');
      g.readNote(p.itemId);
    }
  }

  addShrine(id, ctx, x, z, opts) {
    const s = shrineProp(ctx, x, z);
    this.shrines[id] = { id, name: opts.name, pos: new THREE.Vector3(x, 0, z), spawn: opts.spawn, facing: opts.facing ?? 0, crystal: s.crystal, area: ctx.area.id };
    if (opts.safe !== false) this.safeZones.push({ x, z, r: 3.5 });
    this.interact({
      id: 'shrine_' + id, pos: new THREE.Vector3(x, 1, z), radius: 2.6,
      prompt: 'Rest at the Blood Shrine (heal & save)',
      use: (g) => g.restAtShrine(id),
    });
  }

  npc(def) {
    const spec = { ...NPCS[def.spec], glowTex: this.tex.glow };
    const model = buildCharacter(spec);
    model.root.position.set(def.x, 0, def.z);
    model.root.rotation.y = def.facing ?? 0;
    model.root.userData.dynamic = true;
    model.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
    this.root.add(model.root);
    const animator = new Animator(model, 'npc');
    const n = {
      id: def.id, name: spec.name, model, animator, pos: model.root.position, facing: def.facing ?? 0, anim: null,
      setAnim(name) {
        if (n.anim === name) return;
        n.anim = name;
        if (name) animator.play(name, 1, { hold: true, fadeIn: 0.3 });
        else animator.stop();
      },
    };
    if (def.anim) n.setAnim(def.anim);
    this.npcs.push(n);
    return n;
  }

  _buildTrees() {
    const byVariant = new Map();
    for (const t of this.trees) {
      if (!byVariant.has(t.v)) byVariant.set(t.v, []);
      byVariant.get(t.v).push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [v, list] of byVariant) {
      const geo = treeGeometry(v);
      const inst = new THREE.InstancedMesh(geo, this.mats.bark, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry);
        s.set(t.s, t.s * rand(0.9, 1.25), t.s);
        p.set(t.x, 0, t.z);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.root.add(inst);
    }
  }

  _buildFogBanks() {
    this.fogBanks = [];
    const mat = new THREE.SpriteMaterial({ map: this.tex.glow, color: 0x2a2030, transparent: true, opacity: 0.12, depthWrite: false, fog: false });
    for (let i = 0; i < 34; i++) {
      const sp = new THREE.Sprite(mat.clone());
      sp.scale.set(rand(9, 16), rand(2.5, 4.5), 1);
      sp.userData.vel = new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
      sp.userData.base = rand(0.06, 0.14);
      sp.position.set(rand(-30, 30), rand(0.4, 1.6), rand(-30, 30));
      sp.renderOrder = 8;
      this.scene.add(sp);
      this.fogBanks.push(sp);
    }
  }

  setQuality(qname) {
    const q = QUALITY[qname] || QUALITY.medium;
    this.quality = q;
    if (this.lights.lights.length !== q.lights) this.lights.setCount(q.lights);
    const r = this.game.renderer;
    r.shadowMap.enabled = q.shadows > 0;
    this.moon.castShadow = q.shadows > 0;
    if (q.shadows) {
      this.moon.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.moon.shadow.map) {
        this.moon.shadow.map.dispose();
        this.moon.shadow.map = null;
      }
      const c = this.moon.shadow.camera;
      c.left = c.bottom = -32;
      c.right = c.top = 32;
      c.near = 1;
      c.far = 160;
      c.updateProjectionMatrix();
      this.moon.shadow.bias = -0.0008;
      this.moon.shadow.normalBias = 0.04;
    }
    this.fogBanks.forEach((f, i) => (f.visible = i < q.fogBanks));
    this.game.particles.add.budget = this.game.particles.dark.budget = q.particles;
    // materials must recompile when shadow state changes
    this.scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
  }

  areaAt(pos) {
    for (const a of AREAS) if (pos.z > a.zMin) return a;
    return AREAS[AREAS.length - 1];
  }

  inSafeZone(pos) {
    return this.safeZones.some((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r);
  }

  /** Apply persisted flags to every stateful object (doors, walls, pickups, NPC poses). */
  applyFlags(flags) {
    for (const s of this.stateful) {
      try {
        s.sync(flags);
      } catch (err) {
        console.error('[World] failed to sync state', err);
      }
    }
    for (const t of this.triggers) {
      t.fired = !!flags['trg_' + t.id];
      t.inside = false;
    }
    // points that are already resolved
    if (flags.clue_decree) this.points.decree = null;
    if (flags.clue_ledger) this.points.ledger = null;
    if (flags.clue_journal) this.points.journal = null;
    for (const n of ['doran', 'elise', 'marta']) if (flags['found_' + n]) this.points[n] = null;
  }

  /** Nearest usable interactable in front of / around the player. */
  nearestInteractable(pos, facingVec) {
    let best = null, bestScore = Infinity;
    for (const it of this.interactables) {
      if (it.visible && !it.visible(this.game)) continue;
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      const facingDot = d > 0.01 ? (dx * facingVec.x + dz * facingVec.z) / d : 1;
      const score = d - facingDot * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  updateTriggers(pos) {
    const g = this.game;
    for (const t of this.triggers) {
      if (t.once && t.fired) continue;
      const inside = t.hx ? Math.abs(pos.x - t.x) < t.hx && Math.abs(pos.z - t.z) < t.hz : Math.hypot(pos.x - t.x, pos.z - t.z) < t.r;
      if (inside && !t.inside && (!t.when || t.when(g))) {
        t.fired = true;
        if (t.once) g.flags['trg_' + t.id] = true;
        try {
          t.enter(g);
        } catch (err) {
          console.error('[World] trigger failed', t.id, err);
        }
      }
      t.inside = inside;
    }
  }

  update(dt, time, focus, camera) {
    const g = this.game;
    // area & atmosphere
    const area = this.areaAt(focus);
    if (area !== this.area) {
      const prev = this.area;
      this.area = area;
      g.onAreaChange(area, prev);
    }
    const a = this.atmo, k = 1 - Math.exp(-1.5 * dt);
    a.fog.lerp(new THREE.Color(area.fog), k);
    a.density = lerp(a.density, area.density, k);
    a.hemiSky.lerp(new THREE.Color(area.hemiSky), k);
    a.hemiGround.lerp(new THREE.Color(area.hemiGround), k);
    a.hemi = lerp(a.hemi, area.hemi, k);
    a.moon = lerp(a.moon, area.moon * (g.bossPhaseMoon || 1), k);
    a.fill = lerp(a.fill, area.fill, k);
    a.rim.lerp(new THREE.Color(area.rim), k);
    a.rimK = lerp(a.rimK, area.rimK, k);
    a.moonScale = lerp(a.moonScale, area.moonScale, k * 0.5);
    this.scene.fog.color.copy(a.fog);
    this.scene.fog.density = a.density;
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemi * this.lights.globalDim;
    this.moon.intensity = a.moon;
    this.fill.intensity = a.fill;
    rimUniforms.uRimColor.value.copy(a.rim);
    rimUniforms.uRimStrength.value = a.rimK;
    this.sky.uniforms.uHorizon.value.copy(a.fog).multiplyScalar(1.4);
    this.sky.setMoonScale(a.moonScale);

    // moonlight follows the focus point for a stable shadow frustum
    this.moon.position.copy(focus).addScaledVector(this.sky.moonDir, 70);
    this.moon.position.x += 15;
    this.moon.target.position.copy(focus);
    this.hero.position.set(focus.x, focus.y + 2.6, focus.z).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -1.2);

    this.lights.update(dt, focus, time);
    this.flames.update(time, g.particleScale);
    this.sky.update(dt, camera);
    for (const l of this.lampMeshes) l.mesh.material.opacity = 0.35 + 0.65 * Math.min(1, this.lights._flicker(l, time));

    // fog banks drift around the camera
    const cp = camera.position;
    for (const f of this.fogBanks) {
      if (!f.visible) continue;
      f.position.addScaledVector(f.userData.vel, dt);
      const dx = f.position.x - cp.x, dz = f.position.z - cp.z;
      if (Math.abs(dx) > 32 || Math.abs(dz) > 32) {
        f.position.set(cp.x + rand(-28, 28), rand(0.4, 1.6), cp.z + rand(-28, 28));
      }
      f.material.color.copy(a.fog).multiplyScalar(2.2).addScalar(0.03);
      f.material.opacity = f.userData.base * (area.id === 'forest' ? 1.6 : area.id === 'cathedral' ? 0.6 : 1);
    }

    // pickups float and spin
    for (const p of this.pickups) {
      if (!p.mesh.visible) continue;
      p.mesh.position.y = p.mesh.userData.baseY + Math.sin(time * 2 + p.pos.x) * 0.08;
      p.mesh.userData.spin.rotation.y += dt * 1.5;
    }
    for (const s of Object.values(this.shrines)) {
      s.crystal.rotation.y += dt * 0.8;
      s.crystal.position.y = 1.9 + Math.sin(time * 1.5) * 0.1;
    }
    for (const d of Object.values(this.doors)) d.update && d.update(dt);
    for (const d of this.animated) d.update && d.update(dt);
    // NPCs: idle + look at the player when close
    for (const n of this.npcs) {
      const d = Math.hypot(focus.x - n.pos.x, focus.z - n.pos.z);
      if (d > 45) continue;
      let lookYaw = 0;
      if (d < 6 && !n.anim) {
        const ang = Math.atan2(focus.x - n.pos.x, focus.z - n.pos.z);
        let diff = ang - n.model.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > 0.9) n.model.root.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff) - 0.9, dt * 2);
        lookYaw = Math.max(-0.9, Math.min(0.9, diff));
      }
      n.animator.update(dt, { speed: 0, grounded: true, lookYaw });
      n.model.updateSecondary(dt, new THREE.Vector3(), time);
    }
    // ambient particles
    this._ambient(dt, focus, area);
  }

  _ambient(dt, focus, area) {
    const P = this.game.particles;
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT > 0) return;
    this._ambT = 0.05;
    const tmp = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    const n = Math.ceil(2 * this.quality.particles);
    for (let i = 0; i < n; i++) {
      tmp.x = focus.x + rand(-14, 14);
      tmp.z = focus.z + rand(-14, 14);
      if (area.particles === 'ash') {
        tmp.y = rand(2, 9);
        vel.x = rand(0.2, 0.6); vel.y = rand(-0.6, -0.3); vel.z = rand(-0.2, 0.2);
        P.dark.emit({ pos: tmp, vel, life: 6, size: 0.06, size1: 0.05, color: 0x8a8088, alpha: 0.6, gravity: 0, drag: 0 });
      } else if (area.particles === 'embers') {
        tmp.y = rand(0, 2);
        vel.x = rand(-0.3, 0.3); vel.y = rand(0.6, 1.6); vel.z = rand(-0.3, 0.3);
        P.add.emit({ pos: tmp, vel, life: 4, size: 0.08, size1: 0.02, color: 0xff4020, color1: 0x801010, alpha: 0.9, gravity: 0, drag: 0 });
      } else if (area.particles === 'wisp') {
        if (Math.random() < 0.4) {
          tmp.y = rand(0.3, 3);
          vel.x = rand(-0.15, 0.15); vel.y = rand(-0.05, 0.15); vel.z = rand(-0.15, 0.15);
          P.add.emit({ pos: tmp, vel, life: 5, size: 0.07, size1: 0.03, color: 0x6a8aff, alpha: 0.6, gravity: 0, drag: 0 });
        }
      } else {
        tmp.y = rand(0.5, 6);
        vel.x = rand(-0.08, 0.08); vel.y = rand(-0.08, 0.05); vel.z = rand(-0.08, 0.08);
        P.add.emit({ pos: tmp, vel, life: 6, size: 0.035, size1: 0.03, color: 0xb08a60, alpha: 0.45, gravity: 0, drag: 0 });
      }
    }
  }
}
