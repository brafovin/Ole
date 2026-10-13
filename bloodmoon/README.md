# BLOOD MOON: ETERNAL NIGHT

A 3D anime vampire action‑horror game that runs in the desktop browser.
Chapter I — *The Forgotten Night*: wake in a ruined cathedral with no memory of the last seven nights,
search the Ashen Village for survivors, survive the Whispering Forest and face **the Veiled Countess**
beneath the crimson moon.

Everything — characters, environments, textures, effects, music and sound — is generated procedurally
in code. No paid assets, accounts, API keys or network services are needed.

---

## Run it

You need [Node.js](https://nodejs.org) 18+ (only for the dev server; the game itself is plain files).

```bash
cd bloodmoon
npm install        # installs Vite (dev server only)
npm run dev        # → open http://localhost:5173
```

Other options:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload on http://localhost:5173 |
| `npm run build` | Production build into `dist/` (works from any sub‑path) |
| `npm run preview` | Serve the production build |
| `npm run serve-static` | Serve the folder as plain static files (no build step) |

The game uses native ES modules and a vendored copy of Three.js, so **any static web server works**
(e.g. `npx serve .` or `python3 -m http.server`) — including the existing Vercel deployment of this
repository, where it is available under `/bloodmoon/`. Opening `index.html` directly from the file
system does *not* work because browsers block ES modules on `file://`.

Requirements: a desktop browser with WebGL 2 (current Chrome, Edge, Firefox or Safari). Headphones recommended.

---

## Controls

| Input | Action |
| --- | --- |
| **W A S D** / arrows | Move |
| **Mouse** | Look (click the game to capture the mouse; **Esc** releases it and pauses) |
| **Shift** | Sprint (uses stamina) |
| **Space** | Jump |
| **Left click** | Attack — keep clicking to chain a combo |
| **Right click** | Lucien: heavy guard‑breaking slash · Seraphina: Blood Crescent (ranged) · Kairo: hold to block, tap as a hit lands to **parry** |
| **Q / E** | Supernatural abilities (cost blood energy, then recharge) |
| **R** | Ultimate ability |
| **F** | Interact — read, open, talk, pick up, rest at shrines |
| **H** or **1** | Drink a Blood Vial (heals 45%) |
| **Tab** / **I** | Inventory, attributes, relics, records and quest journal |
| **Mouse wheel** | Camera distance |
| **Esc** | Pause menu (save, settings, controls, quit) |

Blood energy fills when you land hits and slowly over time. **Blood Shrines** (glowing red crystals)
heal you, top up your vials and save the game.

**Death:** you rise again at the last shrine/checkpoint with full health. Experience, items and quest
progress are kept; slain enemies stay dead and wounded ones recover. Dying during the boss fight resets
the fight.

---

## What is in the game

**Playable characters** (Character Selection changes model, stats, weapon and abilities; it applies to
new games and to your saved journey):

| | Lucien Noctis | Seraphina Vex | Kairo Draeven |
| --- | --- | --- | --- |
| Weapon | Black longsword *Nocturne* | Twin blood blades | Twin silver blades |
| Right click | Severing Slash (heavy, breaks guards) | Blood Crescent (piercing ranged) | Block / parry |
| Q | Shadow Blink — teleport, damage at both ends | Blood Roses — damaging, slowing rose field | Spectral Dash — dash through enemies |
| E | Soul Drain — channel damage, heal yourself | Crimson Chains — immobilise an enemy | Moonlight Guard — barrier that blocks, reflects projectiles, repels attackers |
| R | Crimson Eclipse — huge red‑black shockwave | Queen of the Crimson Moon — storm of blood blades | Celestial Execution — teleport + multi‑hit finisher |

**Areas:** the Forgotten Cathedral (with a hidden crypt and side chapel) → the Ashen Village (houses,
alleys, backyards, a mayor's house with a secret room, the chapel‑house safe haven) → the Whispering
Forest (winding path, hidden glade, hunter's camp, ambush clearing) → the Blood Altar arena.

**Enemies:** Blood Crawlers (fast, lunge in groups, burrow out of the ground), Hollow Knights (slow,
tower shield blocks frontal hits — heavy attacks or abilities break the guard), Night Stalkers
(near‑invisible until close, then hunt fast), Blood Mages (keep distance, cast homing blood orbs, blink
away). **Boss:** the Veiled Countess — teleports, blood volleys, erupting blood pools, claw sweeps, and a
phase 2 below 50% HP with spiral barrages, crimson rain and summoned crawlers. Every attack is
telegraphed (raised hand + glowing orb, red ground circles, sound cues). Breaking her poise staggers her.

**Quests:** 5 main quests (awaken, find 3 survivors, discover 3 clues, survive the forest, defeat the
Countess) and 4 side quests (hidden relics, cursed altars, secret rooms, lost vampire records) with XP,
items, a stat bonus and unlockable attire as rewards. Objectives update automatically, show in the HUD
tracker and point to a world marker.

**Progression:** XP and levels (+health, +damage, upgrade points), 4 upgradeable attributes, 9 relics
(equip up to 3), Blood Vials, keys, clues, 5 lore records, and 4 attire sets per character
(*Original*, *Moonlit Vestments*, *Crimson Regalia*, *Eternal Night*).

**Story:** notes, environmental storytelling, dialogue with three survivors and the Countess, story
choices (Sister Elise's offer, Marta's question, the Countess's fate) and two endings that set up the
larger mystery.

**Horror direction:** fog, flickering pooled lights, distant footsteps, whispers with subtitles, crows
and owls, silhouettes that appear at the edge of your vision and vanish when looked at, the candles of
the nave dying at once, a rare fair jump scare, a low‑health heartbeat, and calm safe havens with their
own music.

---

## Settings & accessibility

Master / music / effects volume · reduce sudden loud sounds · mouse sensitivity · invert look ·
graphics quality (Low / Medium / High) · brightness · field of view · damage numbers ·
camera shake (Off / Reduced / Full) · reduce flashing effects · objective markers · whisper subtitles.
All settings apply immediately and are saved in `localStorage`.

Graphics quality controls resolution scale, bloom, shadow maps, the number of dynamic lights, fog
banks and particle density. **Medium** is the default; choose **Low** on integrated graphics.

---

## Saving

Progress is saved to `localStorage` (key `bloodmoon.save.v1`, versioned with a backup of the previous
save) when you rest at a shrine, enter a new area, complete a quest, from the pause menu, and after the
boss. It stores the character and attire, checkpoint, level/XP/attributes, inventory and equipped relics,
quest progress, world state (opened doors, defeated enemies, collected items, story choices), boss
completion and statistics. Starting a new game asks for confirmation before overwriting a save.
Selected character and unlocked attire are stored in a separate profile (`bloodmoon.profile.v1`).

---

## Project structure

```
bloodmoon/
├── index.html                 entry page
├── package.json / vite.config.js
├── src/
│   ├── main.js                bootstrap + WebGL check
│   ├── styles.css             all UI styling
│   ├── three.js               single import point for the vendored Three.js
│   ├── core/                  Game (loop, states, sessions), Input, CameraRig, Collision, utils
│   ├── gfx/                   procedural textures, toon/outline materials, particles, effects, sky
│   ├── characters/            CharacterBuilder (anime models), faces, hair, Animator, definitions
│   ├── player/                Player controller, abilities, combat feedback
│   ├── enemies/               Enemy AI, enemy types, EnemyManager, Boss, Projectiles
│   ├── world/                 World, builders (batching, light pool, flames), props, Horror director
│   │   └── areas/             cathedral.js, village.js, forest.js, altar.js
│   ├── systems/               Settings, SaveSystem, Inventory, items, Quests, Dialogue, story, StoryEvents
│   ├── audio/                 Audio engine (synthesized SFX, ambience) and Music sequencer
│   ├── ui/                    UI (menus, HUD, inventory, dialogue…), icons
│   ├── assets/fonts/          Cinzel, Cinzel Decorative, Cormorant Garamond (SIL OFL)
│   └── vendor/three/          Three.js r170 + post‑processing add‑ons (MIT)
└── tests/                     Playwright end‑to‑end tests and preview pages
```

---

## Testing

The tests drive the real game in headless Chromium (software WebGL) through Playwright:

```bash
npx http-server -p 5199 -c-1 .     # serve the folder on port 5199
node tests/smoke.mjs               # full acceptance run (menus → combat → quests → save/load → boss → death)
```

`tests/smoke.mjs` uses real keyboard/mouse input for interactions and combat, and the debug API
(`window.__BLOODMOON__.debug`: `teleport`, `god`, `killNear`, `give`, `info`) to travel between
areas quickly. The `?nolock` URL parameter disables pointer lock for automated testing.

---

## Replacing procedural content with real assets

**Character models.** Characters are assembled in `src/characters/CharacterBuilder.js` around a simple
bone rig (`hips, spine, chest, neck, head, armL/R, foreL/R, handL/R, thighL/R, shinL/R, footL/R`) that
`Animator.js` poses. To use a rigged glTF model instead:
1. Add `GLTFLoader` from `three/examples/jsm/loaders/` to `src/vendor/three/addons/` (rewrite its
   `from 'three'` import to the vendored path, as done for the post‑processing add‑ons).
2. Load the model in `Player.setCharacter()` and map its skeleton bones onto the `rig` object names
   above, or replace `Animator` with a `THREE.AnimationMixer` driving your clips (play the clip names
   used by `Animator.play()`: `sword1`, `castL`, `ultimate`, `hit`, …).
3. Keep `model.root`, `model.rig.handR/handL` (weapon sockets) and `model.updateSecondary()`
   (can be a no‑op) so the rest of the game keeps working.

**Audio.** All sounds are synthesized in `src/audio/Audio.js` (`SFX` table) and music in
`src/audio/Music.js`. To use a recording, place it in `src/assets/audio/` and register it after the
first user click, e.g. `game.audio.loadSample('hit', new URL('./assets/audio/hit.ogg', import.meta.url))`
— `AudioEngine.play(name)` automatically prefers a loaded sample over the synthesized version and still
respects the volume settings.

**Textures.** `src/gfx/textures.js` generates colour + normal maps; replace any entry of the texture
library with a `THREE.TextureLoader` result to use painted textures.

---

## Known limitations

- Characters are stylised procedural models with procedural animation — expressive, but not the
  fidelity of hand‑sculpted, hand‑animated assets. The structure above shows how to swap in real models.
- The ground is flat: there are jumps and low obstacles, but no climbable multi‑level terrain.
- Enemies use steering and simple obstacle avoidance rather than full navmesh pathfinding; in tight
  spaces they can occasionally get stuck behind props.
- Pointer lock: after pressing Esc, browsers require a click before the mouse can be captured again.
- The automated tests run on a CPU renderer and therefore skip some travel by teleporting; the visual
  quality and frame rate on a real GPU are much higher than in the headless test screenshots.

## Credits

Code, procedural art, story text and synthesized audio were created for this project with
Claude Code (Anthropic) from the player's design brief. Three.js (MIT), Vite (MIT), and the fonts
Cinzel / Cinzel Decorative (Natanael Gama) and Cormorant Garamond (Christian Thalmann) under the SIL
Open Font License. See the in‑game Credits screen.
