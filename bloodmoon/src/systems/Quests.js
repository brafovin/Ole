/**
 * Quest system: data-driven main and side quests with counted objectives, rewards,
 * automatic chaining and objective markers resolved from world points.
 */
export const QUESTS = {
  m1: {
    title: 'Awaken in the Forgotten Cathedral', main: true,
    desc: 'You woke beside the altar with no memory of the last seven nights.',
    objectives: [
      { id: 'note', text: 'Read the bloodstained note on the altar', marker: 'note' },
      { id: 'crawlers', text: 'Destroy the creatures crawling from beneath', count: 3 },
      { id: 'key', text: "Search the east side chapel for the Sexton's Key", marker: 'key' },
      { id: 'doors', text: 'Unlock the cathedral doors', marker: 'doors' },
    ],
    reward: { xp: 80 }, next: ['m2', 'm3'],
  },
  m2: {
    title: 'Find the Missing Survivors', main: true,
    desc: 'The Ashen Village is silent. Someone must still be alive.',
    objectives: [{ id: 'survivors', text: 'Find the survivors of the Ashen Village', count: 3, markers: ['doran', 'elise', 'marta'] }],
    reward: { xp: 160, items: { vial: 2 } }, next: ['m4'],
  },
  m3: {
    title: 'Secrets of the Blood Moon', main: true,
    desc: 'Who caused the Blood Moon, and why can you wield forbidden blood magic?',
    objectives: [{ id: 'clues', text: 'Discover clues about the Blood Moon', count: 3, markers: ['decree', 'ledger', 'journal'] }],
    reward: { xp: 180 },
  },
  m4: {
    title: 'Survive the Whispering Forest', main: true,
    desc: 'The North Gate leads into the forest — and to the Blood Altar beyond.',
    objectives: [
      { id: 'enter', text: 'Pass through the North Gate', marker: 'gate' },
      { id: 'heart', text: 'Find a path through the Whispering Forest', marker: 'forestHeart' },
      { id: 'ambush', text: 'Survive the ambush', count: 5 },
      { id: 'exit', text: 'Reach the Blood Altar', marker: 'altarSeal' },
    ],
    reward: { xp: 220 }, next: ['m5'],
  },
  m5: {
    title: 'Defeat the Veiled Countess', main: true,
    desc: 'The architect of the Blood Moon waits beneath it.',
    objectives: [
      { id: 'seal', text: 'Break the Blood Seal (requires all 3 clues)', marker: 'altarSeal' },
      { id: 'boss', text: 'Defeat the Veiled Countess', marker: 'boss' },
    ],
    reward: { xp: 600, cosmetic: 'eternal', items: { veilpin: 1 } },
  },
  s1: {
    title: 'Hidden Relics', side: true, desc: 'Three relics are hidden in secret places across Nocturna.',
    objectives: [{ id: 'relics', text: 'Find hidden relics', count: 3 }],
    reward: { xp: 120, cosmetic: 'moonlit' },
  },
  s2: {
    title: 'Cursed Altars', side: true, desc: 'Profane altars feed the Blood Moon. Destroy them.',
    objectives: [{ id: 'altars', text: 'Destroy the cursed altars', count: 3 }],
    reward: { xp: 150, bonus: 'altar_reward', bonusText: '+20 maximum blood energy' },
  },
  s3: {
    title: 'Secret Rooms', side: true, desc: 'Not every wall in Nocturna is what it seems.',
    objectives: [{ id: 'rooms', text: 'Discover secret rooms', count: 2 }],
    reward: { xp: 120, items: { ashheart: 1 } },
  },
  s4: {
    title: 'Lost Vampire Records', side: true, desc: 'Pages of the Night Court\'s history, scattered and forgotten.',
    objectives: [{ id: 'records', text: 'Collect the lost vampire records', count: 5 }],
    reward: { xp: 150, cosmetic: 'crimson' },
  },
};

export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.state = {};
  }

  reset() {
    this.state = {};
    for (const id of Object.keys(QUESTS)) this.state[id] = { status: 'inactive', progress: {} };
    this.start('m1', true);
    for (const id of ['s1', 's2', 's3', 's4']) this.start(id, true);
  }

  q(id) { return this.state[id]; }
  isActive(id) { return this.state[id] && this.state[id].status === 'active'; }
  isComplete(id) { return this.state[id] && this.state[id].status === 'complete'; }
  count(qid, oid) { return (this.state[qid] && this.state[qid].progress[oid]) || 0; }

  isDone(qid, oid) {
    const o = QUESTS[qid].objectives.find((x) => x.id === oid);
    return this.count(qid, oid) >= (o.count || 1);
  }

  start(id, silent = false) {
    const s = this.state[id];
    if (!s || s.status !== 'inactive') return;
    s.status = 'active';
    if (!silent) {
      this.game.ui.toast(`New quest: ${QUESTS[id].title}`, 'quest');
      this.game.audio.play('questUpdate');
    }
    // progress may have been made before the quest was given
    if (QUESTS[id].objectives.every((o) => this.count(id, o.id) >= (o.count || 1))) this.complete(id);
    this.game.ui.refreshQuests && this.game.ui.refreshQuests();
  }

  /** Advance an objective. Progress on inactive quests is remembered. */
  progress(qid, oid, n = 1) {
    const s = this.state[qid];
    if (!s || s.status === 'complete') return;
    const def = QUESTS[qid].objectives.find((o) => o.id === oid);
    if (!def) return;
    const max = def.count || 1;
    const before = this.count(qid, oid);
    if (before >= max) return;
    s.progress[oid] = Math.min(max, before + n);
    if (s.status === 'active') {
      const done = s.progress[oid] >= max;
      const label = def.count ? `${def.text} (${s.progress[oid]}/${max})` : def.text;
      if (!QUESTS[qid].objectives.every((o) => this.count(qid, o.id) >= (o.count || 1))) {
        this.game.ui.toast(`${done ? '✓ ' : ''}${label}`, 'quest');
        this.game.audio.play('questUpdate');
      }
      if (QUESTS[qid].objectives.every((o) => this.count(qid, o.id) >= (o.count || 1))) this.complete(qid);
    }
    this.game.ui.refreshQuests && this.game.ui.refreshQuests();
  }

  complete(qid) {
    const g = this.game;
    const s = this.state[qid];
    if (!s || s.status === 'complete') return;
    s.status = 'complete';
    const def = QUESTS[qid];
    const r = def.reward || {};
    const lines = [];
    if (r.xp) lines.push(`+${g.player.addXP(r.xp)} XP`);
    if (r.items) for (const [id, n] of Object.entries(r.items)) { g.inventory.add(id, n, true); lines.push(`${g.itemName(id)}${n > 1 ? ' ×' + n : ''}`); }
    if (r.cosmetic) { g.unlockCosmetic(r.cosmetic); lines.push(`Cosmetic unlocked: ${g.cosmeticName(r.cosmetic)}`); }
    if (r.bonus) { g.flags[r.bonus] = true; g.player.recompute(); lines.push(r.bonusText); }
    g.ui.banner(`${def.side ? 'Side quest complete' : 'Quest complete'}`, `${def.title} — ${lines.join(' · ')}`);
    g.audio.play('questDone');
    g.stats.quests = (g.stats.quests || 0) + 1;
    for (const n of def.next || []) this.start(n);
    g.events.questComplete(qid);
    g.requestAutosave();
    g.ui.refreshQuests && g.ui.refreshQuests();
  }

  /** Quests shown in the HUD tracker: active main quests first, then up to two side quests. */
  tracked() {
    const main = Object.keys(QUESTS).filter((id) => QUESTS[id].main && this.isActive(id));
    const side = Object.keys(QUESTS).filter((id) => QUESTS[id].side && this.isActive(id) && Object.values(this.state[id].progress).some((v) => v > 0));
    return [...main, ...side.slice(0, 2)];
  }

  /** Current objectives of a quest (sequential display: completed + the next ones). */
  objectives(qid) {
    return QUESTS[qid].objectives.map((o) => ({ ...o, have: this.count(qid, o.id), done: this.count(qid, o.id) >= (o.count || 1) }));
  }

  /** World position of the current main objective marker (nearest of candidates). */
  activeMarker(playerPos) {
    const pts = this.game.world.points;
    let best = null, bd = Infinity;
    for (const qid of Object.keys(QUESTS)) {
      if (!QUESTS[qid].main || !this.isActive(qid)) continue;
      const next = this.objectives(qid).find((o) => !o.done);
      if (!next) continue;
      const names = next.markers || (next.marker ? [next.marker] : []);
      for (const n of names) {
        const p = pts[n];
        if (!p) continue;
        const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (d < bd) { bd = d; best = { pos: p, label: next.text, dist: d }; }
      }
      if (best) break; // the first active main quest wins
    }
    return best;
  }

  serialize() { return JSON.parse(JSON.stringify(this.state)); }

  deserialize(d) {
    this.reset();
    if (!d) return;
    for (const id of Object.keys(QUESTS)) {
      if (!d[id]) continue;
      this.state[id] = { status: ['inactive', 'active', 'complete'].includes(d[id].status) ? d[id].status : 'inactive', progress: { ...(d[id].progress || {}) } };
    }
  }
}
