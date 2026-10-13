/**
 * Inventory: item counts, equipped relics (max 3, providing stat modifiers) and cosmetics.
 */
import { ITEMS, RELIC_SLOTS } from './items.js';

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = {};
    this.equipped = [];
  }

  reset() {
    this.items = { vial: 2 };
    this.equipped = [];
  }

  count(id) { return this.items[id] || 0; }
  has(id) { return this.count(id) > 0; }

  add(id, n = 1, silent = false) {
    const def = ITEMS[id];
    if (!def) {
      console.warn('[Inventory] unknown item', id);
      return;
    }
    const g = this.game;
    this.items[id] = this.count(id) + n;
    if (def.type === 'relic' && this.equipped.length < RELIC_SLOTS && !this.equipped.includes(id)) {
      this.equipped.push(id);
      g.player && g.player.recompute();
    }
    if (!silent) {
      g.ui.toast(`Obtained: ${def.name}${n > 1 ? ' ×' + n : ''}`, def.type === 'relic' ? 'relic' : 'item');
      g.audio.play(def.type === 'relic' ? 'relic' : 'pickup');
    }
    g.ui.refreshInventory && g.ui.refreshInventory();
  }

  remove(id, n = 1) {
    this.items[id] = Math.max(0, this.count(id) - n);
    if (this.items[id] === 0) delete this.items[id];
  }

  toggleEquip(id) {
    const def = ITEMS[id];
    if (!def || def.type !== 'relic' || !this.has(id)) return false;
    const i = this.equipped.indexOf(id);
    if (i >= 0) this.equipped.splice(i, 1);
    else {
      if (this.equipped.length >= RELIC_SLOTS) {
        this.game.ui.toast(`You can equip up to ${RELIC_SLOTS} relics. Unequip one first.`, 'warn');
        return false;
      }
      this.equipped.push(id);
    }
    this.game.player.recompute();
    return true;
  }

  relicMods() {
    const out = {};
    for (const id of this.equipped) {
      const m = ITEMS[id] && ITEMS[id].mods;
      if (!m) continue;
      for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v;
    }
    return out;
  }

  list(type) {
    return Object.keys(this.items).filter((id) => ITEMS[id] && ITEMS[id].type === type && this.items[id] > 0).map((id) => ({ ...ITEMS[id], count: this.items[id] }));
  }

  serialize() { return { items: { ...this.items }, equipped: [...this.equipped] }; }

  deserialize(d) {
    this.items = {};
    for (const [k, v] of Object.entries((d && d.items) || {})) if (ITEMS[k] && v > 0) this.items[k] = v;
    this.equipped = ((d && d.equipped) || []).filter((id) => this.has(id)).slice(0, RELIC_SLOTS);
  }
}
