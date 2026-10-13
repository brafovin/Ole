/**
 * Playable characters, NPCs and the boss: appearance specs, stats, ability metadata and cosmetics.
 * Ability behaviour lives in player/abilities.js; this file is pure data so the UI can show it.
 */

export const COSMETICS = {
  default: { id: 'default', name: 'Original Attire', unlock: 'Available from the start.' },
  moonlit: { id: 'moonlit', name: 'Moonlit Vestments', unlock: 'Side quest: find all three Hidden Relics.' },
  crimson: { id: 'crimson', name: 'Crimson Regalia', unlock: 'Side quest: collect all five Lost Vampire Records.' },
  eternal: { id: 'eternal', name: 'Eternal Night', unlock: 'Defeat the Veiled Countess.' },
};

export const CHARACTERS = {
  lucien: {
    id: 'lucien',
    name: 'Lucien Noctis',
    title: 'The Silent Eclipse',
    age: 24,
    kind: 'Vampire',
    personality: 'Calm · Mysterious · Dangerous',
    desc: 'A vampire noble who speaks softly and strikes once. His black longsword Nocturne drinks the light around it, and his shadow moves a heartbeat before he does.',
    weapon: 'Nocturne — supernatural black longsword',
    color: '#c0182e',
    combat: 'sword',
    stats: { hp: 125, stamina: 100, blood: 100, damage: 1.1, speed: 1.0 },
    abilities: {
      lmb: { name: 'Nocturne Combo', desc: 'Three-strike longsword combo. The third strike cleaves in a wide arc.' },
      rmb: { name: 'Severing Slash', desc: 'Charged heavy slash. Costs stamina, deals heavy damage and breaks guards.', stamina: 24 },
      q: { name: 'Shadow Blink', desc: 'Teleport a short distance through the shadows, damaging enemies where you vanish and where you appear.', cost: 15, cd: 6 },
      e: { name: 'Soul Drain', desc: 'Lock onto an enemy and drain its life for a moment, healing yourself.', cost: 20, cd: 9 },
      r: { name: 'Crimson Eclipse', desc: 'ULTIMATE — Rise and eclipse the moon, unleashing a red-black shockwave that devastates everything nearby.', cost: 60, cd: 38 },
    },
    model: {
      female: false, height: 1.86, skin: 0xf3e3dd, ears: 'pointed', outfit: 'lucien', weapon: 'longsword', eyeGlow: 0xff2a3a,
      hair: { style: 'lucien', root: 0x0c0d12, mid: 0x1e2028, tip: 0xb8bfcf, cap: 0x101116 },
      face: { style: 'sharp', iris: '#d0102a', irisDark: '#3a0008', irisLight: '#ff4a5a', glow: '#ff2a40', slit: true, mouth: 'grin', fangs: true },
    },
    palettes: {
      default: { primary: 0x17131d, lining: 0x6e0a1c, inner: 0x1f1822, accent: 0xa0102a, trim: 0xc8ccd8, legs: 0x121016, boots: 0x0a090c, gloves: 0x0d0b10, weaponGlow: 0xff1a30, buckles: true, bootHeight: 0.4 },
      moonlit: { primary: 0xd6dae6, lining: 0x23336e, inner: 0x2a3042, accent: 0x3a5aa8, trim: 0xa8b4d4, legs: 0x262a36, boots: 0x16181f, gloves: 0xdfe2ec, weaponGlow: 0x8ab4ff, buckles: true, bootHeight: 0.4 },
      crimson: { primary: 0x4a0613, lining: 0x0d0608, inner: 0x2a050c, accent: 0xe0b860, trim: 0xd4a84a, legs: 0x16090c, boots: 0x0c0607, gloves: 0x1a0a0c, weaponGlow: 0xff5a20, buckles: true, bootHeight: 0.4 },
      eternal: { primary: 0x08070b, lining: 0x3c0d5e, inner: 0x120d18, accent: 0x8a2ad0, trim: 0x9a8ab8, legs: 0x0b090e, boots: 0x060508, gloves: 0x0b090e, weaponGlow: 0xb44aff, buckles: true, bootHeight: 0.4 },
    },
  },

  seraphina: {
    id: 'seraphina',
    name: 'Seraphina Vex',
    title: 'Queen of Thorns',
    age: 23,
    kind: 'Vampire',
    personality: 'Confident · Intelligent · Mysterious',
    desc: 'A brilliant blood-sorceress who shapes her own blood into crystalline blades and roses. She smiles as if she already knows how the night ends.',
    weapon: 'Sanguine Edges — twin magical blood blades',
    color: '#d0204a',
    combat: 'blades',
    stats: { hp: 105, stamina: 100, blood: 125, damage: 1.0, speed: 1.05 },
    abilities: {
      lmb: { name: 'Crimson Waltz', desc: 'Graceful three-strike blood-blade combo with extended reach.' },
      rmb: { name: 'Blood Crescent', desc: 'Hurl a piercing crescent of blood that cuts through every enemy in a line.', stamina: 20 },
      q: { name: 'Blood Roses', desc: 'Summon a field of magical roses ahead of you that cut and slow enemies within it.', cost: 20, cd: 9 },
      e: { name: 'Crimson Chains', desc: 'Bind the nearest enemy in front of you with chains of blood, immobilising it.', cost: 20, cd: 11 },
      r: { name: 'Queen of the Crimson Moon', desc: 'ULTIMATE — Ascend beneath a crimson moon and rain a storm of blood blades on all nearby enemies.', cost: 60, cd: 42 },
    },
    model: {
      female: true, height: 1.76, skin: 0xf5e6e2, ears: 'pointed', outfit: 'seraphina', weapon: 'bloodblades', eyeGlow: 0xff2a50,
      hair: { style: 'seraphina', root: 0x0c090d, mid: 0x1a0c12, tip: 0x5a0f22, cap: 0x0d0a0e },
      face: { female: true, style: 'normal', iris: '#c0103a', irisDark: '#3a0014', irisLight: '#ff5a7a', glow: '#ff2a50', slit: true, mouth: 'soft', lips: '#7a1a2a', fangs: true, blush: true },
    },
    palettes: {
      default: { primary: 0x6a0816, accent: 0x0e0a0e, trim: 0xc0c4d0, gloves: 0x0a080b, boots: 0x0a080b, legs: 0x0e0b10, sleeve: 0x7a0a1a, foreSleeve: 0x0b080c, thighSkin: true, thighBoots: true, bootHeight: 0.44, weaponGlow: 0xff1030, bodice: 0x6a0816, lace: true },
      moonlit: { primary: 0xe2e4ee, accent: 0x26367c, trim: 0xa8b4d4, gloves: 0xe8eaf2, boots: 0xd8dce8, legs: 0x2a2e3a, sleeve: 0xe2e4ee, foreSleeve: 0xe8eaf2, thighSkin: true, thighBoots: true, bootHeight: 0.44, weaponGlow: 0x7aa8ff, bodice: 0xe2e4ee },
      crimson: { primary: 0x5a0614, accent: 0x14040a, trim: 0xd4a84a, gloves: 0x1a0608, boots: 0x1a0608, legs: 0x16080b, sleeve: 0x5a0614, foreSleeve: 0x1a0608, thighSkin: true, thighBoots: true, bootHeight: 0.44, weaponGlow: 0xff6030, bodice: 0x5a0614 },
      eternal: { primary: 0x0a0610, accent: 0x521a86, trim: 0x9a8ab8, gloves: 0x07050a, boots: 0x07050a, legs: 0x0b0810, sleeve: 0x0a0610, foreSleeve: 0x07050a, thighSkin: true, thighBoots: true, bootHeight: 0.44, weaponGlow: 0xb44aff, bodice: 0x0a0610 },
    },
  },

  kairo: {
    id: 'kairo',
    name: 'Kairo Draeven',
    title: 'The Last Hunter',
    age: 25,
    kind: 'Vampire Hunter',
    personality: 'Determined · Sarcastic · Relentless',
    desc: 'A hunter of the Silver Order who woke up with vampire blood in his veins and a grudge against whoever put it there. Quick blades, quicker mouth.',
    weapon: 'Lunar Fangs — supernatural twin blades',
    color: '#4aa8ff',
    combat: 'dual',
    stats: { hp: 140, stamina: 120, blood: 100, damage: 0.95, speed: 1.06 },
    abilities: {
      lmb: { name: 'Twin Fang', desc: 'Fast four-strike twin-blade combo.' },
      rmb: { name: 'Hunter\'s Guard', desc: 'Hold to block attacks from the front. Block just as a hit lands to parry and stagger the attacker.' },
      q: { name: 'Spectral Dash', desc: 'Become a spectre and dash straight through enemies, cutting everything you pass.', cost: 15, cd: 5 },
      e: { name: 'Moonlight Guard', desc: 'Raise a barrier of moonlight that blocks most damage, destroys projectiles and repels attackers.', cost: 25, cd: 14 },
      r: { name: 'Celestial Execution', desc: 'ULTIMATE — Flash to an enemy and unleash a relentless multi-hit execution ending in a pillar of moonlight.', cost: 60, cd: 38 },
    },
    model: {
      female: false, height: 1.88, skin: 0xefd8cc, ears: 'human', outfit: 'kairo', weapon: 'dualblades', eyeGlow: 0x4ab0ff,
      hair: { style: 'kairo', root: 0x0e0f14, mid: 0x15171e, tip: 0x252a36, cap: 0x101117 },
      face: { style: 'sharp', iris: '#2a7ad8', irisDark: '#081a3a', irisLight: '#7ad0ff', glow: '#4ab0ff', slit: false, mouth: 'stern', fangs: false, scar: true },
    },
    palettes: {
      default: { primary: 0x101218, trim: 0xb8c0cc, accent: 0x18223e, legs: 0x101216, boots: 0x0b0b0e, gloves: 0x15151a, glow: 0x4aa8ff, weaponGlow: 0x4aa8ff, buckles: true, bootHeight: 0.38 },
      moonlit: { primary: 0xd0d6e2, trim: 0x8a9ab8, accent: 0x5a7acc, legs: 0x2a2e3a, boots: 0x1a1d26, gloves: 0xd0d6e2, glow: 0x9ad0ff, weaponGlow: 0x9ad0ff, buckles: true, bootHeight: 0.38 },
      crimson: { primary: 0x3a0810, trim: 0xd0b070, accent: 0x8a0a1a, legs: 0x180608, boots: 0x0e0506, gloves: 0x1a0608, glow: 0xff5040, weaponGlow: 0xff4030, buckles: true, bootHeight: 0.38 },
      eternal: { primary: 0x060508, trim: 0x6a5a8a, accent: 0x3a1a5a, legs: 0x0a080c, boots: 0x050406, gloves: 0x0a080c, glow: 0xb44aff, weaponGlow: 0xb44aff, buckles: true, bootHeight: 0.38 },
    },
  },
};

export const NPCS = {
  elise: {
    id: 'elise', name: 'Sister Elise', female: true, height: 1.68, skin: 0xf0dcd0, ears: 'human', outfit: 'nun',
    hair: { style: 'bun', root: 0x3a2a20, tip: 0x4a3a2a }, palette: { primary: 0x15131a, legs: 0x15131a, boots: 0x0b0a0c, bodice: 0x15131a },
    face: { female: true, style: 'soft', iris: '#6a4a3a', irisDark: '#2a1a10', irisLight: '#a07a5a', glow: null, slit: false, mouth: 'soft', lips: '#a05a5a', fangs: false },
  },
  doran: {
    id: 'doran', name: 'Doran the Smith', female: false, height: 1.9, skin: 0xe0c4ac, ears: 'human', outfit: 'smith',
    hair: { style: 'short', root: 0x3a2618, tip: 0x5a3a24 }, palette: { primary: 0x4a3c30, accent: 0x2a1a12, legs: 0x2a2420, boots: 0x1a1410, sleeve: 0x4a3c30 },
    face: { style: 'normal', iris: '#4a3a2a', irisDark: '#1a1008', irisLight: '#8a6a4a', glow: null, slit: false, mouth: 'stern', fangs: false },
  },
  marta: {
    id: 'marta', name: 'Old Marta', female: true, height: 1.62, skin: 0xe8d0c4, ears: 'human', outfit: 'peasant',
    hair: { style: 'bun', root: 0x8a8890, tip: 0xb0aeb8 }, palette: { primary: 0x5a4a4a, accent: 0x2a2230, legs: 0x2a2230, boots: 0x1a1410, sleeve: 0x5a4a4a, bodice: 0x5a4a4a },
    face: { female: true, style: 'soft', iris: '#5a5a6a', irisDark: '#1a1a2a', irisLight: '#9a9ab0', glow: null, slit: false, mouth: 'neutral', fangs: false },
  },
};

export const BOSS_SPEC = {
  id: 'countess', female: true, height: 2.5, skin: 0xece0e4, ears: 'pointed', outfit: 'countess', eyeGlow: 0xff1a2a,
  hair: { style: 'countess', root: 0xb8b4c4, mid: 0xd8d4e0, tip: 0xf0eef6 },
  palette: { primary: 0x0d080d, accent: 0x4a0618, trim: 0xb8bcc8, legs: 0x0d080d, boots: 0x0d080d, sleeve: 0x0d080d, gloves: 0xd8ccd4, bodice: 0x4a0618 },
  face: { female: true, style: 'sharp', iris: '#ff1a2a', irisDark: '#4a0008', irisLight: '#ff7a80', glow: '#ff2030', slit: true, mouth: 'neutral', lips: '#3a0a14', fangs: true },
};

/** Build the CharacterBuilder spec for a playable character + palette id. */
export function playerSpec(id, cosmetic, glowTex) {
  const c = CHARACTERS[id];
  const palette = c.palettes[cosmetic] || c.palettes.default;
  return { id: c.id, ...c.model, palette, glowTex };
}
