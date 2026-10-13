/**
 * Game: owns every system and runs the main loop.
 *
 * States: 'loading' → 'menu' ⇄ 'play'
 * Overlays (pause the simulation while open): pause, inventory, dialogue, note, death, victory
 */
import * as THREE from '../three.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';

import { Input } from './Input.js';
import { CollisionWorld } from './Collision.js';
import { CameraRig } from './CameraRig.js';
import { TaskRunner, formatTime, rand, nextFrame } from './utils.js';
import { Settings } from '../systems/Settings.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioEngine } from '../audio/Audio.js';
import { buildTextureLibrary } from '../gfx/textures.js';
import { ParticleSystem } from '../gfx/particles.js';
import { Effects } from '../gfx/effects.js';
import { World, AREAS } from '../world/World.js';
import { HorrorDirector } from '../world/Horror.js';
import { Player } from '../player/Player.js';
import { Combat } from '../player/combat.js';
import { EnemyManager } from '../enemies/EnemyManager.js';
import { Projectiles } from '../enemies/Projectiles.js';
import { Inventory } from '../systems/Inventory.js';
import { QuestSystem } from '../systems/Quests.js';
import { DialogueSystem } from '../systems/Dialogue.js';
import { StoryEvents } from '../systems/StoryEvents.js';
import { NOTES } from '../systems/story.js';
import { ITEMS } from '../systems/items.js';
import { CHARACTERS, COSMETICS, NPCS, BOSS_SPEC, playerSpec } from '../characters/definitions.js';
import { buildCharacter } from '../characters/CharacterBuilder.js';
import { Animator } from '../characters/Animator.js';
import { UI } from '../ui/UI.js';

const MENU_SPOT = new THREE.Vector3(0, 0, -200.5);
const PIXEL_RATIO = { low: 0.85, medium: 1.25, high: 2 };

export class Game {
  constructor(container) {
    this.container = container;
    this.state = 'loading';
    this.overlay = null;
    this.flags = {};
    this.stats = { playTime: 0, kills: 0, deaths: 0 };
    this.timeScale = 1;
    this.slowT = 0;
    this.hitstopT = 0;
    this.time = 0;
    this.portraits = {};
    this.boss = null;
    this.bossPhaseMoon = 1;
    this.godMode = false;
    this.acceptInput = true;
    this.currentInteractable = null;
    this.particleScale = 500;
    this.params = new URLSearchParams(location.search);
    this.noLock = this.params.has('nolock');
    // tests may allow bigger simulation steps on very slow (software) renderers
    this.maxDt = Math.min(0.1, parseFloat(this.params.get('maxdt')) || 0.05);
  }

  // ================================================================== boot
  async init() {
    this.settings = new Settings();
    this.save = new SaveSystem();
    this.profile = this.save.loadProfile();
    this.audio = new AudioEngine(this.settings);
    this.ui = new UI(this);
    this.ui.showScreen('loading');
    this.ui.setLoading(0.02, 'Waking the renderer…');
    await nextFrame();

    this.setupRenderer();
    this.input = new Input(this.renderer.domElement);
    this.collision = new CollisionWorld(8);
    this.tasks = new TaskRunner();
    this.cameraRig = new CameraRig(this);

    const q = this.settings.get('quality');
    this.ui.setLoading(0.05, 'Painting stone, wood and blood…');
    this.tex = await buildTextureLibrary(q === 'low' ? 256 : 512, (p) => this.ui.setLoading(0.05 + p * 0.4));
    this.particles = {
      add: new ParticleSystem(this.scene, this.tex.glow, { max: 3000, additive: true }),
      dark: new ParticleSystem(this.scene, this.tex.glow, { max: 1500, additive: false }),
    };
    this.fx = new Effects(this);
    this.combat = new Combat(this);
    this.enemies = new EnemyManager(this);
    this.projectiles = new Projectiles(this);
    this.inventory = new Inventory(this);
    this.quests = new QuestSystem(this);
    this.dialogue = new DialogueSystem(this);
    this.events = new StoryEvents(this);
    this.inventory.reset();
    this.quests.reset();

    this.ui.setLoading(0.47, 'Raising the cathedral and the Ashen Village…');
    this.world = new World(this);
    await this.world.build((p) => this.ui.setLoading(0.47 + p * 0.33));
    this.horror = new HorrorDirector(this);
    this.player = new Player(this);

    this.ui.setLoading(0.82, 'Drawing portraits by candlelight…');
    await nextFrame();
    try {
      this.generatePortraits();
    } catch (err) {
      console.warn('[Game] portrait generation failed, continuing without portraits', err);
    }
    this.ui.setLoading(0.9, 'Compiling shaders…');
    this.player.setCharacter(this.profile.character, this.profile.cosmetics[this.profile.character]);
    this.placeMenuScene();
    this.applyQuality();
    this.onResize();
    // warm up shaders so the first gameplay frames do not hitch
    this.renderer.compile(this.scene, this.camera);
    this.render();
    this.ui.setLoading(1, 'Ready');

    this.bindEvents();
    this.state = 'menu-gate';
    this.ui.showGate();
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    window.__BLOODMOON__ = this;
  }

  /** Console/test helpers (window.__BLOODMOON__.debug). */
  get debug() {
    const g = this;
    return {
      teleport(x, z, facing) { g.player.pos.set(x, 0, z); if (facing !== undefined) { g.player.facing = facing; g.cameraRig.faceDirection(facing); } },
      god(on = true) { g.godMode = on; },
      killNear(r = 12) { for (const e of g.enemies.queryRadius(g.player.pos, r)) e.takeDamage(1e6, {}); },
      give(id, n = 1) { g.inventory.add(id, n); },
      info() {
        const P = g.player;
        return {
          state: g.state, overlay: g.overlay, area: g.world.area.id, pos: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], hp: Math.round(P.hp), maxHp: P.maxHp,
          stamina: Math.round(P.stamina), blood: Math.round(P.blood), level: P.level, xp: P.xp, char: P.charId,
          enemies: g.enemies.list.filter((e) => e.alive).map((e) => ({ id: e.id, type: e.type, hp: Math.round(e.hp), state: e.state, d: +e.pos.distanceTo(P.pos).toFixed(1) })).filter((e) => e.d < 40),
          boss: g.boss ? { hp: Math.round(g.boss.hp), state: g.boss.state, phase: g.boss.phase } : null,
          cooldowns: { ...P.cooldowns }, interact: g.currentInteractable ? g.currentInteractable.id : null,
          quests: Object.fromEntries(Object.entries(g.quests.state).map(([k, v]) => [k, v.status + ' ' + JSON.stringify(v.progress)])),
        };
      },
    };
  }

  setupRenderer() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35 * this.settings.get('brightness');
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.prepend(r.domElement);
    r.domElement.tabIndex = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030205);
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), innerWidth / innerHeight, 0.1, 600);
    this.camera.rotation.order = 'YXZ';
    // environment light probe for metals (very dim; this is a dark game)
    const pmrem = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x0a0810 }));
    envScene.add(envSphere);
    for (const [c, p] of [[0xff3040, [5, 3, -5]], [0x6a80d0, [-6, 6, 4]], [0xffffff, [0, 9, 0]]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      panel.position.set(...p);
      panel.lookAt(0, 0, 0);
      envScene.add(panel);
    }
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }

  buildComposer() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    const q = this.settings.get('quality');
    if (q === 'low') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    const c = (this.composer = new EffectComposer(this.renderer, rt));
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.75, 0.45, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
  }

  applyQuality() {
    const q = this.settings.get('quality');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[q]) * (q === 'low' ? 0.85 : 1));
    this.world.setQuality(q);
    this.buildComposer();
    this.onResize();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.settings.onChange((k) => {
      if (k === 'quality') this.applyQuality();
      if (k === 'brightness') this.renderer.toneMappingExposure = 1.35 * this.settings.get('brightness');
      if (k === 'fov') {
        this.camera.fov = this.settings.get('fov');
        this.camera.updateProjectionMatrix();
        this.onResize();
      }
    });
    // first user gesture: start audio and show the menu
    const gate = () => {
      if (this.state !== 'menu-gate') return;
      this.audio.init();
      this.audio.playMusic('menu');
      this.audio.setAmbience({ wind: 0.5, drone: 0.2, forest: 0 });
      this.state = 'menu';
      this.ui.showScreen('menu');
    };
    window.addEventListener('pointerdown', gate);
    window.addEventListener('keydown', (e) => { if (this.state === 'menu-gate') { e.preventDefault(); gate(); } });

    this.input.on('lockchange', (locked) => {
      if (locked) {
        this.needsLock = false;
        this.ui.setResumeVeil(false);
        return;
      }
      if (this.expectUnlock) { this.expectUnlock = false; return; }
      if (this.state === 'play' && !this.overlay) this.openOverlay('pause');
    });
    this.input.on('lockerror', () => {
      if (this.state === 'play' && !this.overlay && !this.noLock) {
        this.needsLock = true;
        this.ui.setResumeVeil(true);
      }
    });
    this.renderer.domElement.addEventListener('mousedown', () => {
      if (this.state === 'play' && !this.overlay && !this.input.locked) this.requestLock();
    });
    this.input.on('keydown', (e) => this.onKey(e));
  }

  onKey(e) {
    if (this.state !== 'play') {
      if (e.code === 'Escape' && this.state === 'menu' && this.ui.screen && this.ui.screen !== 'menu') {
        if (this.ui.screen === 'settings') this.ui.closeSettings();
        else if (this.ui.screen === 'controls') this.ui.closeControls();
        else this.ui.showScreen('menu');
      }
      return;
    }
    const o = this.overlay;
    if (o === 'dialogue') return this.ui.dialogueKey(e);
    if (o === 'note') {
      if (['KeyF', 'Escape', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); this.closeNote(); }
      return;
    }
    if (e.code === 'Tab' || e.code === 'KeyI') {
      e.preventDefault();
      if (o === 'inventory') this.closeOverlay('inventory');
      else if (!o) this.openOverlay('inventory');
      return;
    }
    if (e.code === 'Escape') {
      if (o === 'pause') {
        if (performance.now() - (this.pauseOpenedAt || 0) < 350) return; // same Esc that released the mouse
        if (this.ui.settingsEl.classList.contains('show')) this.ui.closeSettings();
        else if (this.ui.controlsEl.classList.contains('show')) this.ui.closeControls();
        else this.resume();
      } else if (o === 'inventory') this.closeOverlay('inventory');
      else if (!o) this.openOverlay('pause');
      return;
    }
    if (!o && e.code === 'KeyF' && this.currentInteractable && this.player.alive) {
      const it = this.currentInteractable;
      this.player.anim.play('interact', 0.5);
      try {
        it.use(this);
      } catch (err) {
        console.error('[Game] interaction failed', it.id, err);
      }
    }
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
    const bh = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    this.particleScale = bh / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    if (this.particles) for (const p of Object.values(this.particles)) p.setViewport(bh, this.camera.fov);
  }

  requestLock() {
    if (this.noLock) { this.needsLock = false; this.ui.setResumeVeil(false); return; }
    this.input.requestLock();
  }

  // ================================================================== portraits
  generatePortraits() {
    const W = 256, H = 320;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    r.setSize(W, H);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    const scene = new THREE.Scene();
    const bg = document.createElement('canvas');
    bg.width = 4;
    bg.height = 256;
    const bx = bg.getContext('2d');
    const grd = bx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#2a0812');
    grd.addColorStop(0.6, '#0e0610');
    grd.addColorStop(1, '#050306');
    bx.fillStyle = grd;
    bx.fillRect(0, 0, 4, 256);
    const bgTex = new THREE.CanvasTexture(bg);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;
    scene.add(new THREE.HemisphereLight(0x8a90c0, 0x200810, 1.1));
    const key = new THREE.DirectionalLight(0xffe4e8, 2.4);
    key.position.set(1.5, 2, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff3040, 2.2);
    rim.position.set(-2, 1, -2);
    scene.add(rim);
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 50);
    const shoot = (id, spec, style) => {
      const m = buildCharacter(spec);
      scene.add(m.root);
      const an = new Animator(m, style);
      for (let i = 0; i < 20; i++) an.update(0.03, { speed: 0, grounded: true });
      m.root.updateMatrixWorld(true);
      const head = new THREE.Vector3();
      m.rig.headMesh.getWorldPosition(head);
      const s = spec.height / 1.86;
      cam.position.set(head.x + 0.18 * s, head.y + 0.0, head.z + 0.95 * s);
      cam.lookAt(head.x, head.y - 0.12 * s, head.z);
      m.root.rotation.y = 0.28;
      r.render(scene, cam);
      this.portraits[id] = r.domElement.toDataURL('image/png');
      scene.remove(m.root);
      m.dispose();
    };
    for (const id of Object.keys(CHARACTERS)) shoot(id, playerSpec(id, this.profile.cosmetics[id] || 'default', this.tex.glow), CHARACTERS[id].combat);
    for (const id of Object.keys(NPCS)) shoot(id, { ...NPCS[id], glowTex: this.tex.glow }, 'npc');
    shoot('countess', { ...BOSS_SPEC, glowTex: this.tex.glow }, 'boss');
    r.dispose();
    r.forceContextLoss();
  }

  // ================================================================== menu scene
  placeMenuScene() {
    const P = this.player;
    P.pos.copy(MENU_SPOT);
    P.facing = Math.PI - 0.35;
    P.model.root.position.copy(P.pos);
    P.model.root.rotation.y = P.facing;
    P.model.root.visible = true;
    this.menuT = 0;
    this.menuSnap = true;
  }

  previewCharacter(id, cosmetic) {
    const c = this.profile.unlocked.includes(cosmetic) ? cosmetic : 'default';
    this.player.setCharacter(id, c);
    this.placeMenuScene();
  }

  selectCharacter(id, cosmetic) {
    const c = this.profile.unlocked.includes(cosmetic) ? cosmetic : 'default';
    this.profile.character = id;
    this.profile.cosmetics[id] = c;
    this.save.saveProfile(this.profile);
    this.previewCharacter(id, c);
    this.ui.refreshMenu();
  }

  unlockCosmetic(id) {
    if (this.profile.unlocked.includes(id)) return;
    this.profile.unlocked.push(id);
    this.save.saveProfile(this.profile);
    this.ui.toast(`Attire unlocked: ${COSMETICS[id].name} (change it in Character Selection)`, 'relic');
  }

  cosmeticName(id) { return COSMETICS[id] ? COSMETICS[id].name : id; }
  itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }

  updateMenu(dt) {
    this.menuT += dt;
    const P = this.player;
    const cs = this.ui.screen === 'charselect';
    const t = this.menuT;
    // sway the camera around the character with the crimson moon behind
    const ang = -0.55 + Math.sin(t * 0.08) * 0.25;
    const dist = cs ? 3.3 : 3.9;
    const cx = P.pos.x + Math.sin(ang) * dist, cz = P.pos.z + Math.cos(ang) * dist;
    const target = new THREE.Vector3(P.pos.x, cs ? 1.12 : 1.3, P.pos.z);
    const want = new THREE.Vector3(cx, cs ? 1.4 : 1.55, cz);
    if (this.menuSnap) { this.camera.position.copy(want); this.menuSnap = false; }
    else this.camera.position.lerp(want, 1 - Math.exp(-dt * 2));
    this.camera.lookAt(target);
    // shift framing so the character sits right of the menu panel
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.camera.lookAt(target.addScaledVector(right, cs ? -0.95 : -1.15));
    P.facing = Math.atan2(this.camera.position.x - P.pos.x, this.camera.position.z - P.pos.z) - 0.35;
    P.model.root.rotation.y = P.facing;
    P.anim.update(dt, { speed: 0, grounded: true });
    P.model.updateSecondary(dt, new THREE.Vector3(0.6, 0, 0.8), t);
    this.world.update(dt, t, P.pos, this.camera);
    this.horror.apparition.visible = false;
  }

  onScreenChange() {}

  // ================================================================== sessions
  saveMeta() {
    const d = this.save.load();
    if (!d) return null;
    const area = this.world.shrines[d.checkpoint];
    const mins = Math.round((Date.now() - d.savedAt) / 60000);
    return {
      charName: CHARACTERS[d.character] ? CHARACTERS[d.character].name : d.character,
      level: d.player.level,
      area: area ? AREAS.find((a) => a.id === area.area).name : 'Unknown',
      when: mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : new Date(d.savedAt).toLocaleString(),
    };
  }

  async newGame() {
    if (this.save.hasSave()) {
      const ok = await this.ui.confirm('Starting a new game will overwrite your saved journey. Are you sure?', 'Overwrite');
      if (!ok) return;
    }
    await this.startSession(null);
  }

  async continueGame() {
    const data = this.save.load();
    if (!data) {
      const ok = await this.ui.confirm(this.save.available ? 'No saved journey was found. Begin a new game instead?' : 'Saving is unavailable in this browser (storage is blocked), so there is nothing to continue. Begin a new game?', 'New Game');
      if (ok) await this.startSession(null);
      return;
    }
    await this.startSession(data);
  }

  async startSession(data) {
    try {
      await this._startSession(data);
    } catch (err) {
      console.error('[Game] Failed to start the session', err);
      this.state = 'menu';
      this.ui.showHUD(false);
      this.ui.showScreen('menu');
      this.ui.fade(0, 0.3);
      await this.ui.confirm('The journey could not begin because of an error (see the browser console). Your save file was not changed.', 'OK');
    }
  }

  async _startSession(data) {
    this.requestLock();
    await this.ui.fade(1, 0.6);
    this.state = 'loading-session';
    this.ui.showScreen(null);
    this.overlay = null;
    // systems
    this.flags = data ? { ...data.flags } : {};
    this.stats = data ? { playTime: 0, kills: 0, deaths: 0, ...data.stats } : { playTime: 0, kills: 0, deaths: 0 };
    if (data) {
      this.inventory.deserialize(data.inventory);
      this.quests.deserialize(data.quests);
    } else {
      this.inventory.reset();
      this.quests.reset();
    }
    const charId = this.profile.character;
    const cos = this.profile.unlocked.includes(this.profile.cosmetics[charId]) ? this.profile.cosmetics[charId] : 'default';
    this.player.setCharacter(charId, cos);
    if (data) this.player.deserialize(data.player);
    else this.player.resetProgress();
    // world state
    this.boss = null;
    this.bossPhaseMoon = 1;
    this.flags.boss_started = false;
    this.tasks.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.particles.add.clear();
    this.particles.dark.clear();
    this.world.applyFlags(this.flags);
    this.enemies.spawnAll(this.flags);
    this.horror.reset();
    this.ui.clearFloaters();
    this.ui.hideBossBar();
    // position at checkpoint
    this.checkpoint = data ? data.checkpoint : 'cathedral';
    let spawn, facing;
    if (data && this.world.shrines[this.checkpoint]) {
      const s = this.world.shrines[this.checkpoint];
      spawn = s.spawn;
      facing = s.facing;
    } else {
      spawn = this.world.startPos;
      facing = this.world.startFacing;
    }
    this.player.respawn(spawn, facing);
    this.player.hp = this.player.maxHp;
    this.cameraRig.faceDirection(facing);
    this.cameraRig.curDist = this.cameraRig.dist;
    this.world.area = this.world.areaAt(spawn);
    this.state = 'play';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.input.captureKeys = true;
    this.input.reset();
    this.timeScale = 1;
    this.ui.showHUD(true);
    this.updateAudioForArea(this.world.area, true);
    this.ui.areaTitle(this.world.area);
    await nextFrame();
    this.ui.fade(0, 1.2);
    if (!data) {
      this.ui.subtitle('…wake up… wake up, little heir…');
      this.audio.play('whisper', { vol: 1 });
      this.ui.hint('WASD to move · Mouse to look · Shift sprint · Space jump · F interact. Read the note on the altar ahead.', 12);
      this.saveGame(false);
    } else {
      this.ui.toast(`Journey resumed at ${this.world.shrines[this.checkpoint] ? this.world.shrines[this.checkpoint].name : 'the cathedral'}`, 'info');
    }
  }

  serialize() {
    return {
      character: this.player.charId,
      cosmetic: this.player.cosmetic,
      checkpoint: this.checkpoint,
      player: this.player.serialize(),
      inventory: this.inventory.serialize(),
      quests: this.quests.serialize(),
      flags: { ...this.flags, boss_started: false },
      bossDefeated: !!this.flags.boss_defeated,
      stats: { ...this.stats },
      settings: { ...this.settings.values },
    };
  }

  saveGame(manual = false) {
    if (this.state !== 'play') return false;
    const ok = this.save.save(this.serialize());
    this.profile.character = this.player.charId;
    this.save.saveProfile(this.profile);
    if (manual) {
      if (ok) this.ui.toast('Game saved.', 'info');
      else this.ui.toast('Saving failed — your browser blocked storage.', 'warn');
      this.ui.showPause(this.overlay === 'pause');
    }
    this.autosavePending = false;
    return ok;
  }

  requestAutosave(force = false) {
    this.autosavePending = true;
    if (force) this.saveGame(false);
  }

  async quitToMenu() {
    if (this.overlay === 'pause' || this.overlay === 'death') {
      const ok = await this.ui.confirm('Return to the main menu? Progress since your last save or shrine will be lost.', 'Main Menu');
      if (!ok) return;
    } else if (this.overlay === 'victory') this.saveGame(false);
    await this.ui.fade(1, 0.5);
    this.closeAllOverlays();
    if (this.boss) this.events.resetBoss();
    this.enemies.clear();
    this.projectiles.clear();
    this.fx.clear();
    this.tasks.clear();
    this.ui.showHUD(false);
    this.ui.setResumeVeil(false);
    this.state = 'menu';
    this.input.captureKeys = false;
    this.input.exitLock();
    this.player.setCharacter(this.profile.character, this.profile.cosmetics[this.profile.character]);
    this.player.respawn(MENU_SPOT, 0);
    this.placeMenuScene();
    this.audio.playMusic('menu');
    this.audio.setAmbience({ wind: 0.5, drone: 0.2, forest: 0 });
    this.ui.showScreen('menu');
    this.ui.fade(0, 0.8);
  }

  // ================================================================== overlays
  openOverlay(name) {
    if (this.overlay === name) return;
    this.overlay = name;
    if (this.input.locked) {
      this.expectUnlock = true;
      this.input.exitLock();
    }
    this.input.reset();
    this.ui.setResumeVeil(false);
    if (name === 'pause') { this.ui.showPause(true); this.pauseOpenedAt = performance.now(); }
    if (name === 'inventory') { this.ui.showInventory(true); this.audio.play('uiOpen'); }
    if (name === 'death') this.ui.showDeath(true);
  }

  closeOverlay(name) {
    if (this.overlay !== name) return;
    if (name === 'pause') this.ui.showPause(false);
    if (name === 'inventory') this.ui.showInventory(false);
    if (name === 'death') this.ui.showDeath(false);
    if (name === 'victory') this.ui.showVictory(false);
    this.overlay = null;
    this.input.reset();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (this.state === 'play') this.requestLock();
  }

  closeAllOverlays() {
    this.ui.showPause(false);
    this.ui.showInventory(false);
    this.ui.showDeath(false);
    this.ui.showVictory(false);
    this.ui.hideNote();
    this.ui.hideDialogue();
    this.dialogue.active = null;
    this.overlay = null;
  }

  resume() { this.closeOverlay('pause'); }

  readNote(id, onClose, fromInventory = false) {
    const note = NOTES[id];
    if (!note) return onClose && onClose();
    this.noteReturn = fromInventory ? 'inventory' : null;
    this.noteClose = onClose;
    if (fromInventory) {
      this.ui.showInventory(false);
      this.overlay = null;
    }
    this.openOverlay('note');
    this.ui.showNote(note);
    this.audio.play('page');
  }

  closeNote() {
    if (this.overlay !== 'note') return;
    this.ui.hideNote();
    const ret = this.noteReturn;
    const cb = this.noteClose;
    this.noteClose = null;
    if (ret === 'inventory') {
      this.overlay = 'inventory';
      this.ui.showInventory(true);
    } else this.closeOverlay('note');
    if (cb) cb();
  }

  // ================================================================== gameplay hooks
  onAreaChange(area, prev) {
    if (this.state !== 'play') return;
    this.ui.areaTitle(area);
    this.updateAudioForArea(area);
    if (this.world.shrines[area.id] && this.checkpointOrder(area.id) > this.checkpointOrder(this.checkpoint)) {
      this.checkpoint = area.id;
      this.requestAutosave();
    }
    void prev;
  }

  checkpointOrder(id) { return ['cathedral', 'village', 'forest', 'altar'].indexOf(id); }

  updateAudioForArea(area) {
    this.audio.setAmbience(area.amb);
  }

  restAtShrine(id) {
    const s = this.world.shrines[id];
    const P = this.player;
    if (this.enemies.inCombat()) {
      this.ui.toast('You cannot rest while enemies are near.', 'warn');
      this.audio.play('denied');
      return;
    }
    P.hp = P.maxHp;
    P.stamina = P.maxStamina;
    P.blood = Math.max(P.blood, P.maxBlood * 0.6);
    if (this.inventory.count('vial') < 2) this.inventory.items.vial = 2;
    this.checkpoint = id;
    this.flags['shrine_' + id] = true;
    this.audio.play('shrine');
    this.fx.pillar(s.pos, 0xff2a40, 1.1, 10, 1.2);
    this.particles.add.burst(new THREE.Vector3(s.pos.x, 1.5, s.pos.z), 50, { color: 0xff3050, size: 0.18, speed: 3, life: 1.2, gravity: 1.5 });
    const ok = this.saveGame(false);
    this.ui.banner('Rested', `${s.name} — health restored${ok ? ', progress saved' : ''}.`, 3);
  }

  onEnemyKilled(e) {
    this.stats.kills = (this.stats.kills || 0) + 1;
    if (e.def && e.id && !e.def.noSave && !e.isBoss) this.flags['k_' + e.id] = true;
    const P = this.player;
    if (e.T) {
      const xp = P.addXP(e.T.xp);
      this.ui.floatText(new THREE.Vector3(e.pos.x, (e.height || 1.5) + 0.6, e.pos.z), `+${xp} XP`, 'guard');
      P.gainBlood(e.T.blood);
      // crimson feast: a thread of blood flows into the player and heals a little
      P.heal(P.maxHp * 0.04, true);
      for (let i = 0; i < 14; i++) {
        const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
        this.particles.add.emit({ pos: { x: e.pos.x + rand(-0.4, 0.4), y: 1 + rand(-0.3, 0.3), z: e.pos.z + rand(-0.4, 0.4) }, vel: { x: dx * 1.8, y: rand(0.5, 1.5), z: dz * 1.8 }, life: 0.55, size: 0.14, size1: 0.04, color: 0xff2040, alpha: 1, gravity: 0, drag: 0.5 });
      }
    }
    this.events.onKill(e);
  }

  onPlayerDeath() {
    this.stats.deaths = (this.stats.deaths || 0) + 1;
    this.slowmo(0.3, 1.5);
    this.audio.play('playerHurt', { pitch: 0.6 });
    this.audio.play('stingSoft');
    this.ui.hurtFlash(1);
    this.tasks.after(1.0, () => this.openOverlay('death'));
  }

  async respawn() {
    await this.ui.fade(1, 0.5);
    this.closeOverlay('death');
    const s = this.world.shrines[this.checkpoint] || this.world.shrines.cathedral;
    if (this.boss) this.events.resetBoss();
    this.projectiles.clear();
    this.fx.clear();
    this.enemies.resetForRespawn();
    this.horror.reset();
    this.timeScale = 1;
    this.slowT = 0;
    this.player.respawn(s.spawn, s.facing);
    this.cameraRig.faceDirection(s.facing);
    this.ui.clearFloaters();
    this.ui.fade(0, 0.9);
    this.ui.banner('You rise again', s.name, 2.5);
  }

  showVictory() {
    const saved = this.saveGame(false);
    this.unlockCosmetic('eternal');
    this.audio.playMusic('victory');
    this.openOverlay('victory');
    this.ui.showVictory(true, { saved });
  }

  continueAfterVictory() {
    this.closeOverlay('victory');
    this.ui.hint('The chapter is complete. Explore freely — find any relics, records and secrets you missed.', 8);
  }

  // ================================================================== feedback helpers
  shake(a) { this.cameraRig.addTrauma(a); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(scale, dur) { this.timeScale = scale; this.slowT = dur; }
  hurtFlash(k) { this.ui.hurtFlash(k); }
  screenTint(color, dur, alpha) { this.ui.screenTint(color, dur, alpha); }
  flashScreen(color, alpha) { if (!this.settings.get('reduceFlashing')) this.ui.flashScreen(color, alpha); }
  get reduceFlash() { return this.settings.get('reduceFlashing'); }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, behind: p.z > 1 };
  }

  // ================================================================== loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const dt = Math.min(raw, this.maxDt);
    this.time += dt;
    try {
      this.step(dt);
    } catch (err) {
      console.error('[Game] frame error', err);
    }
    this.input.endFrame();
  }

  step(dt) {
    const st = this.state;
    let sdt = 0;
    if (st === 'menu' || st === 'menu-gate') {
      this.updateMenu(dt);
      sdt = dt;
    } else if (st === 'play') {
      const simulate = !this.overlay && (!this.needsLock || this.noLock);
      if (simulate) {
        if (this.slowT > 0) {
          this.slowT -= dt;
          if (this.slowT <= 0) this.timeScale = 1;
        }
        if (this.hitstopT > 0) {
          this.hitstopT -= dt;
          sdt = dt * 0.06;
        } else sdt = dt * this.timeScale;
        this.stats.playTime += dt;
        this.simulate(sdt, dt);
      }
      const look = simulate && (this.input.locked || this.noLock) ? this.input.consumeLook() : (this.input.consumeLook(), null);
      const wheel = simulate ? this.input.consumeWheel() : (this.input.consumeWheel(), 0);
      this.cameraRig.update(dt, this.player.pos, look, wheel);
      this.world.update(simulate ? sdt : dt * 0.25, this.time, this.player.pos, this.camera);
      this.fx.update(sdt);
      this.audio.setListener(this.camera.position.x, this.camera.position.z, this.cameraRig.yaw);
    }
    this.particles.add.update(sdt);
    this.particles.dark.update(sdt);
    this.ui.update(dt);
    this.render();
  }

  simulate(sdt, dt) {
    const P = this.player;
    P.update(sdt, true);
    this.enemies.update(sdt);
    this.projectiles.update(sdt);
    this.tasks.update(sdt);
    this.horror.update(sdt);
    if (P.alive) this.world.updateTriggers(P.pos);
    this.currentInteractable = P.alive && !(P.action && P.action.kind === 'locked') ? this.world.nearestInteractable(P.pos, P.forward()) : null;
    // music
    const area = this.world.area;
    const safe = this.world.inSafeZone(P.pos);
    const track = this.boss ? 'boss' : safe ? 'safe' : area.music;
    this.audio.playMusic(track);
    if (!this.boss) this.audio.setMusicIntensity(this.enemies.combatIntensity());
    else this.audio.setMusicIntensity(this.boss.phase === 2 ? 1 : 0.2);
    // autosave when it is calm
    if (this.autosavePending && P.alive && !this.enemies.inCombat() && !this.boss) {
      if (this.saveGame(false)) this.ui.toast('Autosaved', 'info');
    }
    void dt;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

export { formatTime };
