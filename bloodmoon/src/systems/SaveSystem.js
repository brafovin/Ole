/**
 * Versioned localStorage save system.
 *
 * Save slot  : 'bloodmoon.save.v1'  — game progress (character, checkpoint, stats, inventory,
 *                                     quests, world flags, boss state, settings snapshot)
 * Profile    : 'bloodmoon.profile.v1' — selected character + cosmetics unlocked across playthroughs
 */
const SAVE_KEY = 'bloodmoon.save.v1';
const BACKUP_KEY = 'bloodmoon.save.backup';
const PROFILE_KEY = 'bloodmoon.profile.v1';
export const SAVE_VERSION = 1;

function storageAvailable() {
  try {
    const k = '__bm_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export class SaveSystem {
  constructor() {
    this.available = storageAvailable();
    this.lastError = null;
    if (!this.available) console.warn('[Save] localStorage is unavailable — progress cannot be saved in this browser session.');
  }

  hasSave() { return !!this.load(); }

  load() {
    if (!this.available) return null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = this.migrate(JSON.parse(raw));
      if (!this.validate(data)) {
        console.warn('[Save] Save data failed validation and was ignored.');
        return null;
      }
      return data;
    } catch (err) {
      this.lastError = err;
      console.error('[Save] Failed to read save data:', err);
      return null;
    }
  }

  validate(d) {
    return !!(d && d.version === SAVE_VERSION && typeof d.character === 'string' && d.player && typeof d.player.level === 'number' &&
      d.inventory && d.quests && d.flags && typeof d.checkpoint === 'string');
  }

  /** Upgrade older save formats here when SAVE_VERSION changes. */
  migrate(d) {
    return d;
  }

  save(data) {
    if (!this.available) {
      this.lastError = new Error('Storage unavailable');
      return false;
    }
    try {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      const payload = { ...data, version: SAVE_VERSION, savedAt: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = err;
      console.error('[Save] Failed to write save data:', err);
      return false;
    }
  }

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.error('[Save] Failed to clear save:', err);
    }
  }

  loadProfile() {
    const def = { character: 'lucien', cosmetics: { lucien: 'default', seraphina: 'default', kairo: 'default' }, unlocked: ['default'] };
    if (!this.available) return def;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return def;
      const p = JSON.parse(raw);
      return {
        character: ['lucien', 'seraphina', 'kairo'].includes(p.character) ? p.character : 'lucien',
        cosmetics: { ...def.cosmetics, ...(p.cosmetics || {}) },
        unlocked: Array.isArray(p.unlocked) ? Array.from(new Set(['default', ...p.unlocked])) : def.unlocked,
      };
    } catch (err) {
      console.warn('[Save] Profile unreadable, using defaults.', err);
      return def;
    }
  }

  saveProfile(profile) {
    if (!this.available) return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (err) {
      console.warn('[Save] Could not store profile.', err);
    }
  }
}
