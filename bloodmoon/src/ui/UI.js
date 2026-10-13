/**
 * DOM user interface: menus, character selection, settings, credits, HUD, pause, inventory,
 * dialogue, notes, death and victory screens. Game logic lives in Game.js; the UI calls into it.
 */
import * as THREE from '../three.js';
import { CHARACTERS, COSMETICS } from '../characters/definitions.js';
import { ITEMS, RELIC_SLOTS } from '../systems/items.js';
import { QUESTS } from '../systems/Quests.js';
import { NOTES, ENDINGS } from '../systems/story.js';
import { ICONS, ABILITY_ICONS } from './icons.js';
import { escapeHTML, formatTime, clamp } from '../core/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const SETTINGS_UI = [
  { group: 'Audio' },
  { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
  { key: 'musicVolume', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
  { key: 'sfxVolume', label: 'Effects volume', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
  { key: 'reduceLoudSounds', label: 'Reduce sudden loud sounds', type: 'toggle' },
  { group: 'Controls' },
  { key: 'mouseSensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05 },
  { key: 'invertY', label: 'Invert vertical look', type: 'toggle' },
  { group: 'Graphics' },
  { key: 'quality', label: 'Graphics quality', type: 'seg', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'brightness', label: 'Brightness', type: 'range', min: 0.6, max: 1.8, step: 0.05, pct: true },
  { key: 'fov', label: 'Field of view', type: 'range', min: 55, max: 100, step: 1 },
  { key: 'damageNumbers', label: 'Damage numbers', type: 'toggle' },
  { group: 'Accessibility' },
  { key: 'screenShake', label: 'Camera shake', type: 'seg', options: [[0, 'Off'], [0.5, 'Reduced'], [1, 'Full']] },
  { key: 'reduceFlashing', label: 'Reduce flashing effects', type: 'toggle' },
  { key: 'showMarkers', label: 'Objective markers', type: 'toggle' },
  { key: 'subtitles', label: 'Subtitles for whispers', type: 'toggle' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.dmgPool = [];
    this.dmgActive = [];
    this.ebars = [];
    this.toastTimers = [];
    this.invTab = 'character';
    this.csSelected = null;
    this.hudCache = {};
    this.build();
    this.bindSounds();
  }

  // ================================================================== construction
  build() {
    const R = this.root;
    R.innerHTML = '';
    // loading
    this.loading = R.appendChild(h(`
      <div id="screen-loading" class="screen show">
        <div class="loading-inner">
          <div class="moon-mark"></div>
          <div class="title-xl">Blood Moon<em>Eternal Night</em></div>
          <div class="load-bar"><i></i></div>
          <div class="load-text">Summoning the night…</div>
          <div class="gate-cta hidden">Click or press any key to awaken</div>
          <div class="gate-note hidden">Best experienced with headphones. Contains horror themes, blood and sudden scares (adjustable in Settings).</div>
        </div>
      </div>`));

    // main menu
    this.menu = R.appendChild(h(`
      <div id="screen-menu" class="screen">
        <div class="menu-left">
          <div class="eyebrow">An anime gothic horror · Chapter I</div>
          <div class="title-xl" style="margin-top:12px">Blood Moon<em>Eternal Night</em></div>
          <div class="menu-tag">The moon turned crimson. The Treaty shattered. And you woke in a cathedral with blood on your hands.</div>
          <nav class="menu-buttons">
            <button class="btn" data-act="start">Start Game</button>
            <button class="btn" data-act="continue">Continue<small class="cont-meta"></small></button>
            <button class="btn" data-act="chars">Character Selection</button>
            <button class="btn" data-act="settings">Settings</button>
            <button class="btn" data-act="controls">How to Play</button>
            <button class="btn" data-act="credits">Credits</button>
          </nav>
        </div>
        <div class="menu-footer"><span class="mf-char"></span><span>v1.0 · Chapter I — The Forgotten Night</span></div>
      </div>`));
    this.menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const g = this.game;
      ({
        start: () => g.newGame(),
        continue: () => g.continueGame(),
        chars: () => this.openCharSelect(),
        settings: () => this.openSettings('menu'),
        controls: () => this.openControls('menu'),
        credits: () => this.showScreen('credits'),
      })[b.dataset.act]();
    });

    // character select
    this.cs = R.appendChild(h(`
      <div id="screen-charselect" class="screen">
        <div class="cs-left">
          <div class="eyebrow">Choose your vessel</div>
          <h2 style="font-size:30px;margin-top:6px">Character Selection</h2>
          <div class="cs-cards"></div>
          <div class="cs-detail panel"></div>
          <div class="cs-actions">
            <button class="btn-solid" data-act="confirm">Select &amp; Return</button>
            <button class="btn-ghost" data-act="back">Back</button>
          </div>
        </div>
      </div>`));
    this.cs.addEventListener('click', (e) => {
      const card = e.target.closest('[data-char]');
      if (card) return this.pickChar(card.dataset.char);
      const cos = e.target.closest('[data-cos]');
      if (cos && !cos.classList.contains('locked')) return this.pickCosmetic(cos.dataset.cos);
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'confirm') {
        this.game.selectCharacter(this.csSelected, this.csCosmetic);
        this.game.audio.play('relic');
        this.showScreen('menu');
      } else {
        this.game.previewCharacter(this.game.profile.character, this.game.profile.cosmetics[this.game.profile.character]);
        this.showScreen('menu');
      }
    });

    // settings
    this.settingsEl = R.appendChild(h(`
      <div id="screen-settings" class="screen dim-bg">
        <div class="sheet panel">
          <div class="eyebrow">Configuration</div>
          <h2>Settings</h2>
          <div class="divider"></div>
          <div class="settings-grid"></div>
          <div class="foot">
            <button class="btn-ghost" data-act="reset">Reset defaults</button>
            <span class="spacer"></span>
            <button class="btn-solid" data-act="back">Done</button>
          </div>
        </div>
      </div>`));
    this.buildSettings();
    this.settingsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'reset') {
        this.game.settings.resetDefaults();
        this.syncSettings();
      } else this.closeSettings();
    });

    // credits
    this.credits = R.appendChild(h(`
      <div id="screen-credits" class="screen dim-bg">
        <div class="sheet panel credits">
          <div class="eyebrow">Credits</div>
          <h2>Blood Moon: Eternal Night</h2>
          <div class="divider"></div>
          <h3>Created for this project</h3>
          <p>Game design implementation, code, procedural 3D characters, environments, textures, visual effects, story text and synthesized audio were generated for this project by Claude Code (an AI coding assistant by Anthropic), following the player's design brief.</p>
          <h3>Technology</h3>
          <p><b>Three.js</b> r170 — 3D rendering library, © three.js authors, MIT License (vendored in <i>src/vendor/three</i>, including EffectComposer, UnrealBloomPass and OutputPass add-ons).</p>
          <p><b>Vite</b> — development server and build tool, MIT License (optional; the game also runs from any static web server).</p>
          <p><b>Web Audio API</b> — all music, ambience and sound effects are synthesized live in the browser. No audio files are used.</p>
          <h3>Fonts</h3>
          <p><b>Cinzel</b> and <b>Cinzel Decorative</b> by Natanael Gama, and <b>Cormorant Garamond</b> by Christian Thalmann — SIL Open Font License 1.1, bundled via the Fontsource packages (license files in <i>src/assets/fonts</i>).</p>
          <h3>Third-party assets</h3>
          <p>None. Every model, texture and sound is generated procedurally at runtime.</p>
          <div class="foot"><button class="btn-solid" data-act="back">Back</button></div>
        </div>
      </div>`));
    this.credits.addEventListener('click', (e) => { if (e.target.closest('[data-act]')) this.showScreen('menu'); });

    // controls / how to play
    this.controlsEl = R.appendChild(h(`
      <div id="screen-controls" class="screen dim-bg">
        <div class="sheet panel">
          <div class="eyebrow">How to play</div>
          <h2>Controls</h2>
          <div class="divider"></div>
          <div class="controls-table">
            <span><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span><span>Move (arrow keys also work)</span>
            <span><kbd>Mouse</kbd></span><span>Look around — click the game to capture the mouse, <kbd>Esc</kbd> releases it and pauses</span>
            <span><kbd>Shift</kbd></span><span>Sprint (uses stamina)</span>
            <span><kbd>Space</kbd></span><span>Jump</span>
            <span><kbd>Left click</kbd></span><span>Attack — keep clicking to chain a combo</span>
            <span><kbd>Right click</kbd></span><span>Lucien: heavy guard-breaking slash · Seraphina: Blood Crescent · Kairo: hold to block, tap as a hit lands to parry</span>
            <span><kbd>Q</kbd> <kbd>E</kbd></span><span>Supernatural abilities (cost blood energy, then recharge)</span>
            <span><kbd>R</kbd></span><span>Ultimate ability</span>
            <span><kbd>F</kbd></span><span>Interact — read notes, open doors, talk, pick up items</span>
            <span><kbd>H</kbd> / <kbd>1</kbd></span><span>Drink a Blood Vial (heal 45%)</span>
            <span><kbd>Tab</kbd> / <kbd>I</kbd></span><span>Inventory, stats, relics, records &amp; quest journal</span>
            <span><kbd>Mouse wheel</kbd></span><span>Camera distance</span>
            <span><kbd>Esc</kbd></span><span>Pause menu</span>
          </div>
          <div class="divider"></div>
          <p class="muted">Blood energy fills as you land hits and slowly over time. Rest at glowing <b>Blood Shrines</b> to heal fully and save. If you fall, you rise again at the last shrine you touched — you keep your experience, items and quest progress; slain enemies stay dead and wounded ones recover.</p>
          <div class="foot"><button class="btn-solid" data-act="back">Back</button></div>
        </div>
      </div>`));
    this.controlsEl.addEventListener('click', (e) => { if (e.target.closest('[data-act]')) this.closeControls(); });

    // HUD
    this.hud = R.appendChild(h(`
      <div id="hud">
        <div class="overlay-fx" id="grain"></div>
        <div class="overlay-fx" id="vignette"></div>
        <div class="overlay-fx" id="hurt"></div>
        <div class="overlay-fx" id="tint"></div>
        <div class="crosshair"></div>
        <div class="markers"></div>
        <div class="dmg-layer"></div>
        <div class="hud-area"><div class="sub"></div><div class="name"></div><div class="line"></div></div>
        <div class="boss-bar"><div class="bsub">Ancient Vampire</div><div class="bn">The Veiled Countess</div><div class="bar"><i class="lag"></i><i class="fill"></i><div class="marker"></div></div></div>
        <div class="toasts"></div>
        <div class="hud-quests"></div>
        <div class="banner"><div class="bt"></div><div class="bs"></div></div>
        <div class="prompt"><kbd>F</kbd><span></span></div>
        <div class="subtitle"></div>
        <div class="hint panel"><span class="eyebrow">Hint</span><span class="ht"></span></div>
        <div class="hud-vitals">
          <div class="hud-portrait"><div class="lvl"><span>1</span></div></div>
          <div class="bars">
            <div class="bar-label"><span class="hp-l">Health</span><span class="hp-v"></span></div>
            <div class="bar hp"><i class="lag"></i><i class="fill"></i></div>
            <div class="bar st"><i class="fill"></i></div>
            <div class="bar-label"><span>Blood energy</span><span class="bl-v"></span></div>
            <div class="bar bl"><i class="fill"></i></div>
            <div class="bar xp"><i class="fill"></i></div>
          </div>
        </div>
        <div class="hud-abilities"></div>
      </div>`));
    this.hudRefs = {
      hpFill: $('.bar.hp .fill', this.hud), hpLag: $('.bar.hp .lag', this.hud), hpV: $('.hp-v', this.hud),
      stFill: $('.bar.st .fill', this.hud), blFill: $('.bar.bl .fill', this.hud), blV: $('.bl-v', this.hud), xpFill: $('.bar.xp .fill', this.hud),
      lvl: $('.lvl span', this.hud), portrait: $('.hud-portrait', this.hud), abilities: $('.hud-abilities', this.hud),
      prompt: $('.prompt', this.hud), promptText: $('.prompt span', this.hud), quests: $('.hud-quests', this.hud),
      toasts: $('.toasts', this.hud), banner: $('.banner', this.hud), subtitle: $('.subtitle', this.hud), hint: $('.hint', this.hud),
      area: $('.hud-area', this.hud), boss: $('.boss-bar', this.hud), bossFill: $('.boss-bar .fill', this.hud), bossLag: $('.boss-bar .lag', this.hud),
      vignette: $('#vignette', this.hud), hurt: $('#hurt', this.hud), tint: $('#tint', this.hud), dmgLayer: $('.dmg-layer', this.hud), markers: $('.markers', this.hud),
      crosshair: $('.crosshair', this.hud),
    };
    this.marker = this.hudRefs.markers.appendChild(h('<div class="marker3d"><div class="gem"></div><div class="dist"></div></div>'));
    for (let i = 0; i < 10; i++) {
      const b = this.hudRefs.markers.appendChild(h('<div class="ebar hidden"><div class="en"></div><div class="bar"><i class="fill"></i></div></div>'));
      this.ebars.push(b);
    }

    // resume veil
    this.veil = R.appendChild(h('<div class="resume-veil"><div>Click to continue</div></div>'));
    this.veil.addEventListener('click', () => this.game.requestLock());

    // pause
    this.pause = R.appendChild(h(`
      <div id="screen-pause" class="screen">
        <div class="pause-wrap">
          <div class="pause-box panel">
            <h2>Paused</h2>
            <div class="sub pause-sub"></div>
            <div class="divider"></div>
            <nav class="menu-buttons">
              <button class="btn" data-act="resume">Resume</button>
              <button class="btn" data-act="inventory">Inventory &amp; Journal</button>
              <button class="btn" data-act="save">Save Game<small class="save-meta"></small></button>
              <button class="btn" data-act="settings">Settings</button>
              <button class="btn" data-act="controls">Controls</button>
              <button class="btn" data-act="quit">Quit to Main Menu</button>
            </nav>
          </div>
        </div>
      </div>`));
    this.pause.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const g = this.game;
      ({
        resume: () => g.resume(),
        inventory: () => { g.closeOverlay('pause'); g.openOverlay('inventory'); },
        save: () => g.saveGame(true),
        settings: () => this.openSettings('pause'),
        controls: () => this.openControls('pause'),
        quit: () => g.quitToMenu(),
      })[b.dataset.act]();
    });

    // inventory
    this.inv = R.appendChild(h(`
      <div id="screen-inventory" class="screen dim-bg">
        <div class="inv panel">
          <div class="tabs">
            <button class="tab" data-tab="character">Character</button>
            <button class="tab" data-tab="relics">Relics</button>
            <button class="tab" data-tab="items">Items</button>
            <button class="tab" data-tab="records">Records</button>
            <button class="tab" data-tab="journal">Quest Journal</button>
            <span class="spacer"></span>
            <button class="btn-ghost" data-act="close" style="margin-bottom:6px">Close [Tab]</button>
          </div>
          <div class="inv-body scroll"></div>
        </div>
      </div>`));
    this.inv.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { this.invTab = t.dataset.tab; this.game.audio.play('page'); return this.renderInventory(); }
      const up = e.target.closest('[data-up]');
      if (up) { if (this.game.player.spendPoint(up.dataset.up)) this.game.audio.play('levelUp', { vol: 0.5 }); return this.renderInventory(); }
      const eq = e.target.closest('[data-equip]');
      if (eq) { this.game.inventory.toggleEquip(eq.dataset.equip); this.game.audio.play('uiClick'); return this.renderInventory(); }
      const rd = e.target.closest('[data-read]');
      if (rd) return this.game.readNote(rd.dataset.read, null, true);
      const use = e.target.closest('[data-use]');
      if (use) { this.game.player.drinkVial(); return this.renderInventory(); }
      if (e.target.closest('[data-act="close"]')) this.game.closeOverlay('inventory');
    });

    // dialogue
    this.dlg = R.appendChild(h(`
      <div class="dialogue panel">
        <div class="dp"></div>
        <div><div class="dn"></div><div class="dt"></div><div class="dc"></div></div>
        <div class="dmore">Click · Space · F to continue</div>
      </div>`));
    this.dlg.addEventListener('click', (e) => {
      const c = e.target.closest('[data-choice]');
      if (c) return this.game.dialogue.choose(+c.dataset.choice);
      this.dialogueAdvance();
    });

    // note
    this.noteEl = R.appendChild(h(`<div class="note-wrap screen"><div class="note"><h2></h2><div class="nb"></div><div class="nf"></div><div class="nclose">Click · F · Esc to close</div></div></div>`));
    this.noteEl.addEventListener('click', () => this.game.closeNote());

    // death
    this.death = R.appendChild(h(`
      <div id="screen-death" class="screen">
        <div class="end-screen"><div>
          <div class="eyebrow">The night claims another</div>
          <h1>You Have Fallen</h1>
          <div class="end-text">You will rise again at the last Blood Shrine you touched, at full health.<br>Your experience, items and quest progress are kept. Slain enemies stay dead; wounded ones recover.</div>
          <div class="row" style="justify-content:center">
            <button class="btn-solid" data-act="respawn">Rise Again</button>
            <button class="btn-ghost" data-act="menu">Main Menu</button>
          </div>
        </div></div>
      </div>`));
    this.death.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'respawn') this.game.respawn();
      else this.game.quitToMenu();
    });

    // victory
    this.victory = R.appendChild(h(`<div id="screen-victory" class="screen"><div class="victory-box panel"></div></div>`));
    this.victory.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'explore') this.game.continueAfterVictory();
      else this.game.quitToMenu();
    });

    // confirm modal
    this.modal = R.appendChild(h(`<div class="modal hidden"><div class="panel"><p class="mt"></p><div class="row" style="justify-content:center;margin-top:20px"><button class="btn-solid" data-act="ok">Confirm</button><button class="btn-ghost" data-act="cancel">Cancel</button></div></div></div>`));

    this.fadeEl = R.appendChild(h('<div class="overlay-fx" id="fade"></div>'));
  }

  bindSounds() {
    let last = 0;
    this.root.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.btn,.btn-solid,.btn-ghost,.cs-card,.tab,.cosmetic');
      if (!b || b === this._lastHover) return;
      this._lastHover = b;
      const now = performance.now();
      if (now - last > 60) { this.game.audio.play('uiHover'); last = now; }
    });
    this.root.addEventListener('click', (e) => {
      if (e.target.closest('.btn,.btn-solid,.btn-ghost,.cs-card,.cosmetic')) this.game.audio.play('uiClick');
    });
  }

  // ================================================================== screens
  showScreen(name) {
    const map = { loading: this.loading, menu: this.menu, charselect: this.cs, settings: this.settingsEl, credits: this.credits, controls: this.controlsEl };
    for (const [k, el] of Object.entries(map)) el.classList.toggle('show', k === name);
    this.screen = name;
    if (name === 'menu') this.refreshMenu();
    this.game.onScreenChange && this.game.onScreenChange(name);
    const first = name && map[name] && map[name].querySelector('button:not(:disabled)');
    if (first && name !== 'loading') setTimeout(() => first.focus({ preventScroll: true }), 50);
  }

  setLoading(p, text) {
    $('.load-bar i', this.loading).style.width = Math.round(p * 100) + '%';
    if (text) $('.load-text', this.loading).textContent = text;
  }

  showGate() {
    $('.load-bar', this.loading).classList.add('hidden');
    $('.load-text', this.loading).classList.add('hidden');
    $('.gate-cta', this.loading).classList.remove('hidden');
    $('.gate-note', this.loading).classList.remove('hidden');
  }

  showFatal(msg) {
    this.showScreen('loading');
    $('.load-text', this.loading).innerHTML = `<span style="color:#ff6a7a">${escapeHTML(msg)}</span>`;
    $('.load-text', this.loading).classList.remove('hidden');
  }

  refreshMenu() {
    const g = this.game;
    const meta = g.saveMeta();
    const cont = $('[data-act="continue"]', this.menu);
    cont.disabled = false;
    $('.cont-meta', this.menu).textContent = meta ? `${meta.charName} · Level ${meta.level} · ${meta.area} · ${meta.when}` : 'No saved journey yet';
    const c = CHARACTERS[g.profile.character];
    $('.mf-char', this.menu).textContent = `Playing as ${c.name}`;
  }

  // ---------------------------------------------------------------- character select
  openCharSelect() {
    const g = this.game;
    this.csSelected = g.profile.character;
    this.csCosmetic = g.profile.cosmetics[this.csSelected] || 'default';
    const cards = $('.cs-cards', this.cs);
    cards.innerHTML = Object.values(CHARACTERS).map((c) => `
      <button class="cs-card" data-char="${c.id}" style="--accent:${c.color}">
        <img alt="${escapeHTML(c.name)}" src="${g.portraits[c.id] || ''}">
        <div class="nm">${escapeHTML(c.name)}<small>${escapeHTML(c.title)}</small></div>
      </button>`).join('');
    this.renderCharDetail();
    this.showScreen('charselect');
  }

  pickChar(id) {
    this.csSelected = id;
    this.csCosmetic = this.game.profile.cosmetics[id] || 'default';
    this.game.previewCharacter(id, this.csCosmetic);
    this.game.audio.play(id === 'kairo' ? 'guard' : 'roses', { vol: 0.4 });
    this.renderCharDetail();
  }

  pickCosmetic(cos) {
    this.csCosmetic = cos;
    this.game.previewCharacter(this.csSelected, cos);
    this.renderCharDetail();
  }

  renderCharDetail() {
    const g = this.game;
    const c = CHARACTERS[this.csSelected];
    for (const el of this.cs.querySelectorAll('.cs-card')) el.classList.toggle('sel', el.dataset.char === c.id);
    const icons = ABILITY_ICONS[c.id];
    const row = (key, label) => {
      const a = c.abilities[key];
      const ult = key === 'r';
      return `<div class="ability"><div class="ico">${ICONS[icons[key]]}<kbd>${label}</kbd></div>
        <div><b>${escapeHTML(a.name)}${ult ? '<span class="ult">ULTIMATE</span>' : ''}</b>
        ${a.cost ? `<span class="cost"> · ${a.cost} blood · ${a.cd}s</span>` : a.stamina ? `<span class="cost"> · ${a.stamina} stamina</span>` : ''}
        <p>${escapeHTML(a.desc)}</p></div></div>`;
    };
    const unlocked = g.profile.unlocked;
    $('.cs-detail', this.cs).innerHTML = `
      <div class="eyebrow" style="color:${c.color}">${escapeHTML(c.title)}</div>
      <h2>${escapeHTML(c.name)}</h2>
      <div class="cs-meta">${c.kind} · Age ${c.age} · ${escapeHTML(c.personality)}</div>
      <div class="cs-desc">${escapeHTML(c.desc)}</div>
      <div class="cs-stats"><span>Health <b>${c.stats.hp}</b></span><span>Stamina <b>${c.stats.stamina}</b></span><span>Blood <b>${c.stats.blood}</b></span><span>Power <b>${Math.round(c.stats.damage * 100)}%</b></span><span>Speed <b>${Math.round(c.stats.speed * 100)}%</b></span></div>
      <div class="cs-meta" style="margin-top:10px">Weapon — ${escapeHTML(c.weapon)}</div>
      <div class="ability-list">${row('lmb', 'LMB')}${row('rmb', 'RMB')}${row('q', 'Q')}${row('e', 'E')}${row('r', 'R')}</div>
      <div class="divider"></div>
      <div class="eyebrow">Attire</div>
      <div class="cosmetics">${Object.values(COSMETICS).map((k) => {
        const locked = !unlocked.includes(k.id);
        return `<button class="cosmetic ${k.id === this.csCosmetic ? 'on' : ''} ${locked ? 'locked' : ''}" data-cos="${k.id}" title="${escapeHTML(k.unlock)}">${locked ? '🔒 ' : ''}${escapeHTML(k.name)}</button>`;
      }).join('')}</div>
      <p class="muted" style="font-size:14px;margin:8px 0 0">${escapeHTML(COSMETICS[this.csCosmetic].unlock)} Your choice applies to new games and to your saved journey.</p>`;
  }

  // ---------------------------------------------------------------- settings
  buildSettings() {
    const grid = $('.settings-grid', this.settingsEl);
    grid.innerHTML = SETTINGS_UI.map((s) => {
      if (s.group) return `<h3>${s.group}</h3>`;
      let ctl = '';
      if (s.type === 'range') ctl = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" data-set="${s.key}" aria-label="${s.label}"><span class="val" data-val="${s.key}"></span>`;
      if (s.type === 'toggle') ctl = `<button class="toggle" data-set="${s.key}" role="switch" aria-label="${s.label}"><i></i></button>`;
      if (s.type === 'seg') ctl = `<span class="seg" data-set="${s.key}">${s.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</span>`;
      return `<div class="field"><label>${s.label}</label><span class="row">${ctl}</span></div>`;
    }).join('');
    grid.addEventListener('input', (e) => {
      const el = e.target.closest('input[data-set]');
      if (!el) return;
      this.game.settings.set(el.dataset.set, parseFloat(el.value));
      this.syncSettings();
    });
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.toggle[data-set]');
      if (t) {
        const k = t.dataset.set;
        this.game.settings.set(k, !this.game.settings.get(k));
        return this.syncSettings();
      }
      const sb = e.target.closest('.seg button');
      if (sb) {
        const k = sb.parentElement.dataset.set;
        const def = SETTINGS_UI.find((s) => s.key === k);
        const opt = def.options.find(([v]) => String(v) === sb.dataset.v);
        this.game.settings.set(k, opt[0]);
        this.syncSettings();
      }
    });
    this.syncSettings();
  }

  syncSettings() {
    const S = this.game.settings;
    for (const s of SETTINGS_UI) {
      if (!s.key) continue;
      const v = S.get(s.key);
      const el = this.settingsEl.querySelector(`[data-set="${s.key}"]`);
      if (s.type === 'range') {
        el.value = v;
        el.style.setProperty('--p', ((v - s.min) / (s.max - s.min)) * 100 + '%');
        this.settingsEl.querySelector(`[data-val="${s.key}"]`).textContent = s.pct ? Math.round(v * 100) + '%' : s.key === 'fov' ? v + '°' : v.toFixed(2);
      } else if (s.type === 'toggle') {
        el.classList.toggle('on', !!v);
        el.setAttribute('aria-checked', String(!!v));
      } else if (s.type === 'seg') {
        for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(v));
      }
    }
  }

  openSettings(from) {
    this.settingsFrom = from;
    this.syncSettings();
    if (from === 'pause') this.pause.classList.remove('show');
    this.settingsEl.classList.add('show');
    if (from === 'menu') this.showScreen('settings');
  }

  closeSettings() {
    this.settingsEl.classList.remove('show');
    if (this.settingsFrom === 'pause') this.pause.classList.add('show');
    else this.showScreen('menu');
  }

  openControls(from) {
    this.controlsFrom = from;
    if (from === 'pause') {
      this.pause.classList.remove('show');
      this.controlsEl.classList.add('show');
    } else this.showScreen('controls');
  }

  closeControls() {
    this.controlsEl.classList.remove('show');
    if (this.controlsFrom === 'pause') this.pause.classList.add('show');
    else this.showScreen('menu');
  }

  confirm(text, okLabel = 'Confirm') {
    return new Promise((resolve) => {
      $('.mt', this.modal).textContent = text;
      $('[data-act="ok"]', this.modal).textContent = okLabel;
      this.modal.classList.remove('hidden');
      const done = (v) => {
        this.modal.classList.add('hidden');
        this.modal.removeEventListener('click', onClick);
        resolve(v);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-act]');
        if (b) done(b.dataset.act === 'ok');
      };
      this.modal.addEventListener('click', onClick);
      setTimeout(() => $('[data-act="cancel"]', this.modal).focus(), 30);
    });
  }

  fade(to, dur = 0.6) {
    this.fadeEl.style.transition = `opacity ${dur}s`;
    this.fadeEl.style.opacity = to;
    return new Promise((r) => setTimeout(r, dur * 1000));
  }

  // ================================================================== HUD
  showHUD(on) {
    this.hud.classList.toggle('show', on);
    if (on) {
      this.buildAbilityBar();
      this.refreshQuests();
      this.hudRefs.portrait.style.backgroundImage = `url(${this.game.portraits[this.game.player.charId]})`;
    } else {
      this.hideBossBar();
      this.hudRefs.prompt.classList.remove('show');
      this.marker.classList.remove('show');
    }
  }

  buildAbilityBar() {
    const P = this.game.player;
    const icons = ABILITY_ICONS[P.charId];
    const c = P.def;
    const slot = (key, label, cls = '') => `<div class="slot ${cls}" data-slot="${key}" title="${escapeHTML(c.abilities[key].name)}">${ICONS[icons[key]]}<kbd>${label}</kbd>${c.abilities[key].cost ? `<span class="cost">${c.abilities[key].cost}</span>` : ''}<div class="cd"></div><div class="cdt"></div></div>`;
    this.hudRefs.abilities.innerHTML = `${slot('lmb', 'LMB', 'mini')}${slot('rmb', 'RMB', 'mini')}<div class="slot-sep"></div>${slot('q', 'Q')}${slot('e', 'E')}${slot('r', 'R', 'big')}<div class="slot-sep"></div>
      <div class="slot mini" data-slot="vial" title="Blood Vial">${ICONS.vial}<kbd>H</kbd><span class="count">0</span></div>`;
    this.slotRefs = {};
    for (const el of this.hudRefs.abilities.querySelectorAll('[data-slot]')) this.slotRefs[el.dataset.slot] = { el, cd: $('.cd', el), cdt: $('.cdt', el), count: $('.count', el) };
    this.hudCache = {};
  }

  set(key, v, fn) {
    if (this.hudCache[key] === v) return;
    this.hudCache[key] = v;
    fn(v);
  }

  update(dt) {
    const g = this.game;
    if (!this.hud.classList.contains('show') || !g.player) return;
    const P = g.player;
    const R = this.hudRefs;
    const hp = clamp(P.hp / P.maxHp, 0, 1);
    this.set('hp', hp.toFixed(3), () => { R.hpFill.style.width = hp * 100 + '%'; R.hpLag.style.width = hp * 100 + '%'; });
    this.set('hpv', `${Math.ceil(P.hp)} / ${P.maxHp}`, (v) => (R.hpV.textContent = v));
    this.set('st', (P.stamina / P.maxStamina).toFixed(3), (v) => (R.stFill.style.width = v * 100 + '%'));
    this.set('bl', (P.blood / P.maxBlood).toFixed(3), (v) => (R.blFill.style.width = v * 100 + '%'));
    this.set('blv', `${Math.floor(P.blood)}`, (v) => (R.blV.textContent = v));
    this.set('xp', (P.xp / P.xpToNext()).toFixed(3), (v) => (R.xpFill.style.width = v * 100 + '%'));
    this.set('lvl', P.level, (v) => (R.lvl.textContent = v));
    this.set('vig', hp < 0.35 ? (0.35 - hp) / 0.35 : 0, (v) => (R.vignette.style.opacity = v));
    // cooldowns
    if (this.slotRefs) {
      for (const k of ['q', 'e', 'r']) {
        const s = this.slotRefs[k];
        const meta = P.def.abilities[k];
        const total = meta.cd * (1 - P.stats.cdr);
        const cd = P.cooldowns[k];
        const pct = cd > 0 ? (cd / total) * 100 : 0;
        this.set('cd' + k, pct.toFixed(1), () => { s.cd.style.setProperty('--cd', pct + '%'); s.cdt.textContent = cd > 0 ? Math.ceil(cd) : ''; });
        const nores = P.blood < meta.cost;
        this.set('nr' + k, nores, (v) => s.el.classList.toggle('nores', v));
        this.set('rd' + k, k === 'r' && cd <= 0 && !nores, (v) => s.el.classList.toggle('ready', v));
      }
      this.set('vials', g.inventory.count('vial'), (v) => (this.slotRefs.vial.count.textContent = v));
      const rmbLow = (P.style === 'sword' && P.stamina < 24) || (P.style === 'blades' && P.stamina < 20);
      this.set('rmb', rmbLow, (v) => this.slotRefs.rmb.el.classList.toggle('nores', v));
    }
    // interaction prompt
    const it = g.currentInteractable;
    const ptext = it ? (typeof it.prompt === 'function' ? it.prompt(g) : it.prompt) : '';
    this.set('prompt', ptext, (v) => { R.promptText.textContent = v; R.prompt.classList.toggle('show', !!v); });
    // boss
    if (g.boss && this.bossShown) {
      const f = clamp(g.boss.hp / g.boss.maxHp, 0, 1);
      this.set('boss', f.toFixed(3), () => { R.bossFill.style.width = f * 100 + '%'; R.bossLag.style.width = f * 100 + '%'; });
    }
    this.updateMarker();
    this.updateEnemyBars();
    this.updateDamageNumbers(dt);
    // hurt flash decay
    if (this.hurtK > 0) {
      this.hurtK = Math.max(0, this.hurtK - dt * 2.2);
      R.hurt.style.opacity = this.hurtK;
    }
    if (this.tintT > 0) {
      this.tintT -= dt;
      const k = clamp(this.tintT / this.tintDur, 0, 1);
      R.tint.style.opacity = this.tintA * Math.min(1, k * 4) * Math.min(1, (1 - k) * 8 + 0.0001);
      if (this.tintT <= 0) R.tint.style.opacity = 0;
    }
  }

  updateMarker() {
    const g = this.game;
    if (!g.settings.get('showMarkers') || g.overlay) { this.marker.classList.remove('show'); return; }
    const m = g.quests.activeMarker(g.player.pos);
    if (!m || m.dist < 3) { this.marker.classList.remove('show'); return; }
    const p = g.project(new THREE.Vector3(m.pos.x, (m.pos.y || 1) + 1.2, m.pos.z));
    const W = innerWidth, H = innerHeight, pad = 60;
    let x = p.x, y = p.y, edge = false;
    if (p.behind) { x = W - x; y = H - pad; edge = true; }
    if (x < pad || x > W - pad || y < pad || y > H - pad) edge = true;
    x = clamp(x, pad, W - pad);
    y = clamp(y, pad, H - pad);
    this.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.marker.classList.add('show');
    this.marker.classList.toggle('edge', edge);
    this.set('mdist', Math.round(m.dist), (v) => ($('.dist', this.marker).textContent = v + ' m'));
  }

  updateEnemyBars() {
    const g = this.game;
    const P = g.player;
    const list = [];
    for (const e of g.enemies.list) {
      if (!e.alive || e.isBoss || e.hidden || e.hp >= e.maxHp) continue;
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (d < 24) list.push([d, e]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.ebars.length; i++) {
      const b = this.ebars[i];
      const e = list[i] && list[i][1];
      if (!e) { b.classList.add('hidden'); continue; }
      const p = g.project(new THREE.Vector3(e.pos.x, (e.y || 0) + e.height + 0.35, e.pos.z));
      if (p.behind) { b.classList.add('hidden'); continue; }
      b.classList.remove('hidden');
      b.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const en = b.firstElementChild;
      if (en.textContent !== e.name) en.textContent = e.name;
      b.querySelector('.fill').style.width = (e.hp / e.maxHp) * 100 + '%';
    }
  }

  // ---------------------------------------------------------------- floating numbers
  damageNumber(pos, amount, kind = 'normal') {
    if (!this.game.settings.get('damageNumbers') && kind !== 'heal') return;
    this.floatText(pos, String(amount), kind);
  }

  floatText(pos, text, kind = 'normal') {
    let el = this.dmgPool.pop();
    if (!el) el = this.hudRefs.dmgLayer.appendChild(document.createElement('div'));
    el.className = 'dmg ' + kind;
    el.textContent = text;
    el.style.display = '';
    this.dmgActive.push({ el, pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, (pos.y || 1.6) + 0.2, pos.z), t: 0, life: kind === 'crit' ? 1.1 : 0.85, dx: (Math.random() - 0.5) * 30 });
  }

  updateDamageNumbers(dt) {
    const g = this.game;
    for (const d of this.dmgActive) {
      d.t += dt;
      const p = g.project(d.pos);
      const k = d.t / d.life;
      const rise = 40 * Math.sqrt(k);
      const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 1.5);
      d.el.style.opacity = p.behind ? 0 : Math.min(1, (1 - k) * 3);
      d.el.style.transform = `translate(${p.x + d.dx * k}px, ${p.y - rise}px) translate(-50%, -50%) scale(${pop})`;
    }
    const keep = [];
    for (const d of this.dmgActive) {
      if (d.t >= d.life) { d.el.style.display = 'none'; this.dmgPool.push(d.el); } else keep.push(d);
    }
    this.dmgActive = keep;
  }

  clearFloaters() {
    for (const d of this.dmgActive) { d.el.style.display = 'none'; this.dmgPool.push(d.el); }
    this.dmgActive = [];
  }

  // ---------------------------------------------------------------- messages
  toast(text, kind = 'info') {
    const el = h(`<div class="toast ${kind}"></div>`);
    el.textContent = text;
    const box = this.hudRefs.toasts;
    box.appendChild(el);
    while (box.children.length > 5) box.firstElementChild.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  banner(title, sub = '', dur = 3.6) {
    const b = this.hudRefs.banner;
    $('.bt', b).textContent = title;
    $('.bs', b).textContent = sub;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }

  subtitle(text, isWhisper = false) {
    if (isWhisper && !this.game.settings.get('subtitles')) return;
    const s = this.hudRefs.subtitle;
    s.textContent = text;
    s.classList.add('show');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => s.classList.remove('show'), 4500);
  }

  hint(text, dur = 9) {
    const el = this.hudRefs.hint;
    $('.ht', el).textContent = text;
    el.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  areaTitle(area) {
    const a = this.hudRefs.area;
    $('.sub', a).textContent = area.sub;
    $('.name', a).textContent = area.name;
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
    clearTimeout(this._areaT);
    this._areaT = setTimeout(() => a.classList.remove('show'), 4200);
  }

  showBossBar(boss) {
    this.bossShown = true;
    $('.bn', this.hudRefs.boss).textContent = boss.name;
    this.hudRefs.boss.classList.add('show');
    this.hudCache.boss = null;
  }

  hideBossBar() {
    this.bossShown = false;
    this.hudRefs.boss.classList.remove('show');
  }

  flashBar(which) {
    const el = this.hud.querySelector(which === 'blood' ? '.bar.bl' : '.bar.st');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  flashAbility(key) {
    const s = this.slotRefs && this.slotRefs[key];
    if (!s) return;
    s.el.classList.remove('shake');
    void s.el.offsetWidth;
    s.el.classList.add('shake');
  }

  hurtFlash(k) {
    const reduce = this.game.settings.get('reduceFlashing');
    this.hurtK = Math.max(this.hurtK || 0, k * (reduce ? 0.35 : 0.8));
  }

  screenTint(color, dur, alpha = 0.35) {
    const reduce = this.game.settings.get('reduceFlashing');
    const R = this.hudRefs;
    R.tint.style.background = '#' + new THREE.Color(color).getHexString();
    R.tint.style.mixBlendMode = 'screen';
    this.tintT = dur;
    this.tintDur = dur;
    this.tintA = alpha * (reduce ? 0.4 : 1);
  }

  flashScreen(color, alpha) {
    this.screenTint(color, 0.35, alpha);
  }

  setResumeVeil(on) { this.veil.classList.toggle('show', on); }

  // ================================================================== quest tracker
  refreshQuests() {
    const g = this.game;
    if (!g.quests || !this.hudRefs) return;
    const html = g.quests.tracked().map((qid) => {
      const q = QUESTS[qid];
      const objs = g.quests.objectives(qid);
      let shown;
      if (q.main) {
        const firstOpen = objs.findIndex((o) => !o.done);
        shown = objs.filter((o, i) => i <= firstOpen && (i >= firstOpen - 1));
      } else shown = objs;
      return `<div class="q"><div class="qt ${q.side ? 'side' : ''}">${escapeHTML(q.title)}</div>${shown.map((o) => `<div class="qo ${o.done ? 'done' : ''}">${escapeHTML(o.text)}${o.count ? ` (${o.have}/${o.count})` : ''}</div>`).join('')}</div>`;
    }).join('');
    this.hudRefs.quests.innerHTML = html;
    if (this.inv.classList.contains('show') && this.invTab === 'journal') this.renderInventory();
  }

  // ================================================================== pause & inventory
  showPause(on) {
    if (on) {
      const meta = this.game.saveMeta();
      $('.save-meta', this.pause).textContent = meta ? `Last saved ${meta.when}` : 'Not saved yet';
      $('.pause-sub', this.pause).textContent = `${this.game.world.area.name} · ${formatTime(this.game.stats.playTime)}`;
    }
    this.pause.classList.toggle('show', on);
    if (!on) {
      this.settingsEl.classList.remove('show');
      this.controlsEl.classList.remove('show');
    } else setTimeout(() => $('[data-act="resume"]', this.pause).focus(), 50);
  }

  showInventory(on) {
    this.inv.classList.toggle('show', on);
    if (on) this.renderInventory();
  }

  refreshInventory() { if (this.inv.classList.contains('show')) this.renderInventory(); }

  renderInventory() {
    const g = this.game, P = g.player, I = g.inventory;
    for (const t of this.inv.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === this.invTab);
    const body = $('.inv-body', this.inv);
    const card = (it, extra = '', attrs = '', cls = '') => `<div class="item ${cls}" ${attrs}><h4>${escapeHTML(it.name)}${it.count > 1 ? `<span class="n">×${it.count}</span>` : ''}</h4>${extra}<p>${escapeHTML(it.desc || '')}</p></div>`;
    if (this.invTab === 'character') {
      const s = P.stats;
      const pts = P.upgradePoints;
      const stat = (key, name, desc, val) => `<div class="stat-row"><div><div class="sn">${name}</div><div class="sd">${desc}</div></div><div class="sv">${val}</div><button class="plus" data-up="${key}" ${pts ? '' : 'disabled'} aria-label="Upgrade ${name}">+</button></div>`;
      body.innerHTML = `<div class="inv-cols">
        <div><div class="inv-portrait" style="background-image:url(${g.portraits[P.charId]})"></div>
          <h3 style="margin-top:12px">${escapeHTML(P.def.name)}</h3><div class="muted">${escapeHTML(P.def.title)} · ${P.def.kind}</div>
          <div class="cs-meta" style="margin-top:10px">Level ${P.level} · ${P.xp} / ${P.xpToNext()} XP</div>
          <div class="cs-meta">Attire: ${escapeHTML(COSMETICS[P.cosmetic].name)}</div></div>
        <div>
          <div class="row"><h3>Attributes</h3><span class="spacer"></span><span class="eyebrow">${pts} upgrade point${pts === 1 ? '' : 's'}</span></div>
          <div class="divider"></div>
          ${stat('vit', 'Vitality', '+15 maximum health', `${P.maxHp} HP`)}
          ${stat('might', 'Might', '+7% damage', `${Math.round(s.damage * 100)}%`)}
          ${stat('agi', 'Agility', '+12 stamina, +3% speed', `${P.maxStamina} ST`)}
          ${stat('blood', 'Blood', '+12 blood energy, −4% cooldowns', `${P.maxBlood} BL`)}
          <div class="divider"></div>
          <div class="cs-stats" style="flex-wrap:wrap"><span>Move speed <b>${Math.round(s.speed * 100)}%</b></span><span>Cooldown reduction <b>${Math.round(s.cdr * 100)}%</b></span><span>Blood per hit <b>${s.bloodOnHit}</b></span><span>XP bonus <b>${Math.round((s.xpMult - 1) * 100)}%</b></span></div>
          <p class="muted">Gain levels by defeating enemies and completing quests. Each level grants +8 health, +4.5% damage and one upgrade point.</p>
        </div></div>`;
    } else if (this.invTab === 'relics') {
      const relics = I.list('relic');
      body.innerHTML = `<p class="muted">Equip up to ${RELIC_SLOTS} relics (${I.equipped.length}/${RELIC_SLOTS} equipped). Click a relic to equip or unequip it.</p>
        <div class="item-grid">${relics.map((r) => card(r, `<div class="tag">${I.equipped.includes(r.id) ? '◆ EQUIPPED' : 'UNEQUIPPED'}${r.hidden ? ' · HIDDEN RELIC' : ''}</div>`, `data-equip="${r.id}"`, `clickable ${I.equipped.includes(r.id) ? 'eq' : ''}`)).join('') || '<div class="empty">No relics yet. Search hidden places.</div>'}</div>`;
    } else if (this.invTab === 'items') {
      const list = [...I.list('consumable'), ...I.list('key'), ...I.list('clue')];
      body.innerHTML = `<div class="item-grid">${list.map((it) => card(it, `<div class="tag">${it.type.toUpperCase()}</div>`, it.id === 'vial' ? 'data-use="vial"' : it.type === 'clue' ? `data-read="${it.id}"` : '', it.id === 'vial' || it.type === 'clue' ? 'clickable' : '')).join('') || '<div class="empty">Your pockets are empty.</div>'}</div>
        <p class="muted" style="margin-top:12px">Click a Blood Vial to drink it, or a clue to re-read it.</p>`;
    } else if (this.invTab === 'records') {
      const recs = I.list('record');
      body.innerHTML = `<p class="muted">${recs.length} / 5 Lost Vampire Records found.</p><div class="item-grid">${recs.map((r) => card({ ...r, desc: NOTES[r.id].body.slice(0, 110) + '…' }, '<div class="tag">READ</div>', `data-read="${r.id}"`, 'clickable')).join('') || '<div class="empty">No records found yet.</div>'}</div>`;
    } else {
      const ids = Object.keys(QUESTS).filter((id) => g.quests.state[id].status !== 'inactive');
      body.innerHTML = ids.map((id) => {
        const q = QUESTS[id];
        const st = g.quests.state[id].status;
        return `<div class="qj"><h4>${escapeHTML(q.title)}<span class="st ${st === 'complete' ? 'done' : ''}">${st === 'complete' ? 'COMPLETE' : q.side ? 'SIDE QUEST' : 'MAIN QUEST'}</span></h4><p>${escapeHTML(q.desc)}</p><ul>${g.quests.objectives(id).map((o) => `<li class="${o.done ? 'done' : ''}">${escapeHTML(o.text)}${o.count ? ` (${o.have}/${o.count})` : ''}</li>`).join('')}</ul></div>`;
      }).join('');
    }
  }

  // ================================================================== dialogue & notes
  showDialogue(speaker, text, choices) {
    const d = this.dlg;
    d.classList.toggle('narr', !!speaker.narrator);
    $('.dp', d).style.backgroundImage = speaker.portrait ? `url(${speaker.portrait})` : 'none';
    const dn = $('.dn', d);
    dn.textContent = speaker.name || '';
    dn.style.color = speaker.color || '#fff';
    const dt = $('.dt', d);
    this.dlgFull = text;
    this.dlgChars = 0;
    this.dlgChoices = choices;
    dt.textContent = '';
    $('.dc', d).innerHTML = '';
    $('.dmore', d).classList.toggle('hidden', !!choices);
    d.classList.add('show');
    clearInterval(this._typeT);
    this._typeT = setInterval(() => {
      this.dlgChars += 2;
      dt.textContent = this.dlgFull.slice(0, this.dlgChars);
      if (this.dlgChars >= this.dlgFull.length) this.finishTyping();
    }, 16);
  }

  finishTyping() {
    clearInterval(this._typeT);
    this._typeT = null;
    $('.dt', this.dlg).textContent = this.dlgFull;
    this.dlgChars = this.dlgFull.length;
    if (this.dlgChoices) {
      $('.dc', this.dlg).innerHTML = this.dlgChoices.map((c, i) => `<button class="btn" data-choice="${i}"><kbd>${i + 1}</kbd>${escapeHTML(c)}</button>`).join('');
      setTimeout(() => { const b = $('.dc .btn', this.dlg); b && b.focus({ preventScroll: true }); }, 30);
    }
  }

  dialogueAdvance() {
    if (this._typeT) return this.finishTyping();
    if (!this.dlgChoices) this.game.dialogue.advance();
  }

  dialogueKey(e) {
    if (['Space', 'Enter', 'KeyF'].includes(e.code)) {
      if (this.dlgChoices && !this._typeT && e.code === 'Enter') return; // Enter activates focused choice
      e.preventDefault();
      this.dialogueAdvance();
    }
    const n = parseInt(e.key, 10);
    if (this.dlgChoices && !this._typeT && n >= 1 && n <= this.dlgChoices.length) this.game.dialogue.choose(n - 1);
  }

  hideDialogue() {
    clearInterval(this._typeT);
    this._typeT = null;
    this.dlg.classList.remove('show');
  }

  showNote(note) {
    $('h2', this.noteEl).textContent = note.title;
    $('.nb', this.noteEl).textContent = note.body;
    $('.nf', this.noteEl).textContent = note.footer || '';
    this.noteEl.classList.add('show');
  }

  hideNote() { this.noteEl.classList.remove('show'); }

  // ================================================================== death & victory
  showDeath(on) { this.death.classList.toggle('show', on); }

  showVictory(on, data) {
    if (on) {
      const g = this.game;
      const end = ENDINGS[g.flags.ending] || ENDINGS.silver;
      const s = g.stats;
      const relics = g.inventory.list('relic').length;
      const records = g.inventory.list('record').length;
      $('.victory-box', this.victory).innerHTML = `
        <div class="eyebrow">Chapter I — The Forgotten Night</div>
        <h1>Chapter Complete</h1>
        <div class="divider"></div>
        <h3 style="color:#ff6a7a">${escapeHTML(end.title)}</h3>
        <p class="end-text">${escapeHTML(end.text)}</p>
        <div class="vstats">
          <div><b>${formatTime(s.playTime)}</b><span>TIME</span></div>
          <div><b>${s.kills || 0}</b><span>ENEMIES SLAIN</span></div>
          <div><b>${s.deaths || 0}</b><span>DEATHS</span></div>
          <div><b>${g.player.level}</b><span>LEVEL</span></div>
          <div><b>${relics}</b><span>RELICS</span></div>
          <div><b>${records}/5</b><span>RECORDS</span></div>
          <div><b>${(g.flags.crypt_open ? 1 : 0) + (g.flags.shelf_moved ? 1 : 0)}/2</b><span>SECRET ROOMS</span></div>
          <div><b>${['v1', 'f1', 'f2'].filter((a) => g.flags['altar_' + a]).length}/3</b><span>ALTARS</span></div>
        </div>
        <p class="end-text" style="font-style:italic">The Blood Moon still hangs over Nocturna. King Aurelian is missing. The door behind the moon stands open a crack — and something on the other side knows your name.</p>
        <p class="muted">Unlocked: <b>Eternal Night</b> attire for every character. ${data && data.saved ? 'Your progress has been saved.' : ''}</p>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="btn-solid" data-act="explore">Keep Exploring</button>
          <button class="btn-ghost" data-act="menu">Main Menu</button>
        </div>`;
    }
    this.victory.classList.toggle('show', on);
  }
}
