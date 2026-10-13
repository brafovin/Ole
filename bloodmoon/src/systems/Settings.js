/**
 * Player settings, persisted to localStorage. Every setting takes effect immediately via change
 * listeners (audio volumes, renderer quality, camera FOV, etc.).
 */
const KEY = 'bloodmoon.settings.v1';

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.85,
  mouseSensitivity: 1.0,
  invertY: false,
  fov: 70,
  brightness: 1,
  quality: 'medium', // 'low' | 'medium' | 'high'
  screenShake: 1, // 0 = off, 0.5 = reduced, 1 = full
  reduceFlashing: false,
  reduceLoudSounds: false,
  showMarkers: true,
  damageNumbers: true,
  subtitles: true,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = [];
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (data[k] !== undefined && typeof data[k] === typeof DEFAULT_SETTINGS[k]) this.values[k] = data[k];
      }
      if (!['low', 'medium', 'high'].includes(this.values.quality)) this.values.quality = DEFAULT_SETTINGS.quality;
    } catch (err) {
      console.warn('[Settings] Could not read saved settings, using defaults.', err);
    }
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch (err) {
      console.warn('[Settings] Could not save settings (storage full or blocked).', err);
    }
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    if (!(k in DEFAULT_SETTINGS)) throw new Error('Unknown setting: ' + k);
    if (this.values[k] === v) return;
    this.values[k] = v;
    this.persist();
    for (const fn of this.listeners) fn(k, v);
  }

  resetDefaults() {
    for (const k of Object.keys(DEFAULT_SETTINGS)) this.set(k, DEFAULT_SETTINGS[k]);
  }

  onChange(fn) { this.listeners.push(fn); }
}
