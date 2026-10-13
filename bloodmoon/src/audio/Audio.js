/**
 * Procedural audio for Blood Moon: Eternal Night.
 *
 * Everything is synthesized with the Web Audio API at runtime — no audio files are required.
 * To replace a synthesized sound with a recorded asset later, put the file in src/assets/audio/
 * and route that name through `playSample()` (see README "Replacing audio").
 *
 * Graph:
 *   instruments -> musicIn ─┬────────────> musicBus ─┐
 *                           └> musicVerb ─> musicBus ─┤
 *   sfx         -> sfxIn   ─┬────────────> sfxBus  ──┼─> master -> limiter -> speakers
 *                           └> sfxVerb  ──> sfxBus  ──┤
 *   ambience    -> ambIn   ─────────────> sfxBus ────┘
 */
import { MusicSystem } from './Music.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.ambience = {};
    this.samples = new Map(); // name -> AudioBuffer (optional recorded assets)
    settings.onChange((k) => {
      if (k.endsWith('Volume')) this.applyVolumes();
    });
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('[Audio] Web Audio API not supported — the game will run silently.');
      return;
    }
    try {
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -8;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 10;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.2;
      this.master.connect(this.limiter).connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);

      const ir = this._impulse(3.2, 2.6);
      this.musicIn = ctx.createGain();
      this.musicRevIn = ctx.createGain();
      this.musicVerb = ctx.createConvolver();
      this.musicVerb.buffer = ir;
      this.musicIn.connect(this.musicBus);
      this.musicRevIn.connect(this.musicVerb).connect(this.musicBus);

      this.sfxIn = ctx.createGain();
      this.sfxRevIn = ctx.createGain();
      this.sfxVerb = ctx.createConvolver();
      this.sfxVerb.buffer = this._impulse(2.4, 3);
      this.sfxIn.connect(this.sfxBus);
      this.sfxRevIn.connect(this.sfxVerb).connect(this.sfxBus);
      this.sfxRevIn.gain.value = 0.55;

      this.ambIn = ctx.createGain();
      this.ambIn.gain.value = 0.9;
      this.ambIn.connect(this.sfxBus);

      this.noiseBuf = this._noiseBuffer(2);
      this.brownBuf = this._noiseBuffer(4, true);
      this.music = new MusicSystem(this);
      this.ready = true;
      this.applyVolumes();
    } catch (err) {
      console.error('[Audio] Failed to initialise audio:', err);
      this.ctx = null;
    }
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.get('masterVolume'), t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.get('musicVolume') * 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.get('sfxVolume'), t, 0.05);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  _noiseBuffer(seconds, brown = false) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  /** Returns a destination node with distance attenuation and stereo panning for a world position. */
  _spatial(pos, out, maxDist = 40) {
    if (!pos) return out;
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const d = Math.hypot(dx, dz);
    const att = Math.max(0, 1 - d / maxDist);
    if (att <= 0.001) return null;
    // camera right vector for yaw: (cos yaw, 0, -sin yaw)
    const yaw = this.listener.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    const g = this.ctx.createGain();
    g.gain.value = att * att * 0.85 + 0.15 * att;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan * 0.8;
    g.connect(p).connect(out);
    return g;
  }

  // ---------------------------------------------------------------- primitives
  tone({ type = 'sine', f = 440, f2 = null, t = this.now, dur = 0.2, a = 0.005, peak = 0.3, out = this.sfxIn, detune = 0, rev = 0, curve = 'exp', release = null }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    if (f2) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
      else o.frequency.linearRampToValueAtTime(f2, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (release ?? 0));
    o.connect(g).connect(out);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s).connect(out === this.musicIn ? this.musicRevIn : this.sfxRevIn);
    }
    o.start(t);
    o.stop(t + dur + (release ?? 0) + 0.05);
    return o;
  }

  noise({ t = this.now, dur = 0.2, a = 0.005, peak = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, out = this.sfxIn, rev = 0, brown = false }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(out);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s).connect(this.sfxRevIn);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  // ---------------------------------------------------------------- public sfx API
  /**
   * Play a named sound effect. opts: { pos: Vector3 (spatialised), vol, pitch }
   */
  play(name, opts = {}) {
    if (!this.ready) return;
    try {
      if (this.samples.has(name)) return this.playSample(name, opts);
      const fn = SFX[name];
      if (!fn) {
        console.warn('[Audio] Unknown sound:', name);
        return;
      }
      let out = this.sfxIn;
      const vol = opts.vol ?? 1;
      if (opts.pos) {
        out = this._spatial(opts.pos, this.sfxIn, opts.maxDist ?? 45);
        if (!out) return;
      }
      if (vol !== 1) {
        const g = this.ctx.createGain();
        g.gain.value = vol;
        g.connect(out);
        out = g;
      }
      fn(this, this.now, out, opts.pitch ?? 1, opts);
    } catch (err) {
      console.warn('[Audio] Failed to play', name, err);
    }
  }

  /** Optional hook for recorded assets: register with loadSample(name, url). */
  async loadSample(name, url) {
    if (!this.ready) return;
    try {
      const res = await fetch(url);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.samples.set(name, buf);
    } catch (err) {
      console.warn('[Audio] Could not load sample', name, url, err);
    }
  }

  playSample(name, opts = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.samples.get(name);
    src.playbackRate.value = opts.pitch ?? 1;
    const out = opts.pos ? this._spatial(opts.pos, this.sfxIn) : this.sfxIn;
    if (!out) return;
    const g = this.ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    src.connect(g).connect(out);
    src.start();
  }

  /** Big scary sting, scaled down when "reduce sudden loud sounds" is enabled. */
  sting(kind = 'scare') {
    if (!this.ready) return;
    const reduce = this.settings.get('reduceLoudSounds');
    this.play(kind === 'scare' ? 'scare' : 'stingSoft', { vol: reduce ? 0.3 : 1 });
  }

  // ---------------------------------------------------------------- ambience
  /** Set ambience layer levels: { wind, drone, forest } each 0..1 */
  setAmbience(levels) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (!this.ambience.wind) {
      // Wind: brown noise through a slowly sweeping band-pass
      const src = ctx.createBufferSource();
      src.buffer = this.brownBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 380;
      bp.Q.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(bp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.11;
      const lfo2g = ctx.createGain();
      lfo2g.gain.value = 0.08;
      const wg = ctx.createGain();
      wg.gain.value = 0.22;
      lfo2.connect(lfo2g).connect(wg.gain);
      src.connect(bp).connect(wg).connect(g).connect(this.ambIn);
      src.start();
      lfo.start();
      lfo2.start();
      this.ambience.wind = g;

      // Low cathedral drone
      const dg = ctx.createGain();
      dg.gain.value = 0;
      for (const [f, v] of [[55, 0.07], [82.4, 0.04], [110.3, 0.02]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = v;
        o.connect(og).connect(dg);
        o.start();
      }
      const dl = ctx.createBiquadFilter();
      dl.type = 'lowpass';
      dl.frequency.value = 300;
      dg.connect(dl).connect(this.ambIn);
      this.ambience.drone = dg;

      // Forest: airy high noise + slow tremolo
      const fsrc = ctx.createBufferSource();
      fsrc.buffer = this.noiseBuf;
      fsrc.loop = true;
      const fhp = ctx.createBiquadFilter();
      fhp.type = 'bandpass';
      fhp.frequency.value = 2400;
      fhp.Q.value = 0.4;
      const fg = ctx.createGain();
      fg.gain.value = 0;
      const fpre = ctx.createGain();
      fpre.gain.value = 0.03;
      fsrc.connect(fhp).connect(fpre).connect(fg).connect(this.ambIn);
      fsrc.start();
      this.ambience.forest = fg;
    }
    const t = ctx.currentTime;
    for (const k of ['wind', 'drone', 'forest']) {
      if (levels[k] !== undefined) this.ambience[k].gain.setTargetAtTime(levels[k], t, 1.2);
    }
  }

  // ---------------------------------------------------------------- music proxies
  playMusic(name) { if (this.ready) this.music.play(name); }
  setMusicIntensity(v) { if (this.ready) this.music.setIntensity(v); }
  stopMusic() { if (this.ready) this.music.play(null); }
}

// ======================================================================= SFX library
// Each entry: (audio, t, out, pitch, opts) => void
const SFX = {
  uiHover(a, t, out) {
    a.tone({ type: 'sine', f: 1400, f2: 1600, t, dur: 0.05, peak: 0.04, out });
  },
  uiClick(a, t, out) {
    a.tone({ type: 'triangle', f: 520, f2: 380, t, dur: 0.09, peak: 0.12, out });
    a.tone({ type: 'sine', f: 1560, t, dur: 0.12, peak: 0.05, out, rev: 0.4 });
  },
  uiBack(a, t, out) {
    a.tone({ type: 'triangle', f: 380, f2: 260, t, dur: 0.1, peak: 0.1, out });
  },
  uiOpen(a, t, out) {
    a.noise({ t, dur: 0.25, peak: 0.06, type: 'bandpass', f: 3000, f2: 1200, q: 0.8, out });
    a.tone({ type: 'sine', f: 660, t, dur: 0.3, peak: 0.05, out, rev: 0.6 });
  },
  page(a, t, out) {
    a.noise({ t, dur: 0.18, a: 0.02, peak: 0.12, type: 'bandpass', f: 2600, f2: 4200, q: 1.2, out });
    a.noise({ t: t + 0.12, dur: 0.16, a: 0.02, peak: 0.08, type: 'bandpass', f: 3800, f2: 2000, q: 1.2, out });
  },
  pickup(a, t, out) {
    [74, 78, 81, 86].forEach((m, i) => a.tone({ type: 'sine', f: mtof(m), t: t + i * 0.06, dur: 0.5, peak: 0.08, out, rev: 0.7 }));
  },
  relic(a, t, out) {
    [62, 69, 74, 77, 81].forEach((m, i) => a.tone({ type: 'triangle', f: mtof(m), t: t + i * 0.09, dur: 1.2, peak: 0.07, out, rev: 1 }));
    a.tone({ type: 'sine', f: mtof(50), t, dur: 1.5, peak: 0.1, out });
  },
  heal(a, t, out) {
    a.tone({ type: 'sine', f: 300, f2: 700, t, dur: 0.6, a: 0.1, peak: 0.1, out, rev: 0.8 });
    a.noise({ t, dur: 0.5, a: 0.1, peak: 0.05, type: 'bandpass', f: 1800, q: 4, out });
  },
  levelUp(a, t, out) {
    [62, 65, 69, 74, 77, 81, 86].forEach((m, i) => a.tone({ type: 'triangle', f: mtof(m), t: t + i * 0.07, dur: 0.9, peak: 0.07, out, rev: 1 }));
    a.tone({ type: 'sine', f: 73.4, t, dur: 1.8, peak: 0.15, out });
  },
  questDone(a, t, out) {
    [[62, 66, 69], [64, 67, 71], [66, 69, 74]].forEach((ch, i) =>
      ch.forEach((m) => a.tone({ type: 'triangle', f: mtof(m), t: t + i * 0.22, dur: 1.1, a: 0.03, peak: 0.05, out, rev: 1 })));
  },
  questUpdate(a, t, out) {
    a.tone({ type: 'sine', f: mtof(74), t, dur: 0.6, peak: 0.06, out, rev: 1 });
    a.tone({ type: 'sine', f: mtof(81), t: t + 0.1, dur: 0.8, peak: 0.05, out, rev: 1 });
  },
  denied(a, t, out) {
    a.tone({ type: 'square', f: 140, f2: 110, t, dur: 0.15, peak: 0.05, out });
  },
  step(a, t, out, p, o) {
    const grass = o.surface === 'grass';
    a.noise({ t, dur: 0.09, a: 0.004, peak: grass ? 0.05 : 0.07, type: grass ? 'bandpass' : 'lowpass', f: (grass ? 1400 : 420) * p, q: grass ? 0.8 : 1, out });
    if (!grass) a.noise({ t, dur: 0.03, peak: 0.02, type: 'highpass', f: 3500, out });
  },
  land(a, t, out) {
    a.noise({ t, dur: 0.16, peak: 0.12, type: 'lowpass', f: 300, out });
    a.tone({ type: 'sine', f: 90, f2: 50, t, dur: 0.12, peak: 0.12, out });
  },
  jump(a, t, out) {
    a.noise({ t, dur: 0.12, peak: 0.05, type: 'bandpass', f: 900, f2: 1600, out });
  },
  swing(a, t, out, p) {
    a.noise({ t, dur: 0.2, a: 0.03, peak: 0.16, type: 'bandpass', f: 500 * p, f2: 2600 * p, q: 1.6, out });
    a.tone({ type: 'sine', f: 180 * p, f2: 90 * p, t, dur: 0.15, peak: 0.04, out });
  },
  swingHeavy(a, t, out, p) {
    a.noise({ t, dur: 0.38, a: 0.08, peak: 0.22, type: 'bandpass', f: 300 * p, f2: 1800 * p, q: 1.2, out });
    a.tone({ type: 'sawtooth', f: 90 * p, f2: 50 * p, t, dur: 0.3, peak: 0.05, out });
  },
  hit(a, t, out, p) {
    a.noise({ t, dur: 0.12, peak: 0.25, type: 'lowpass', f: 1600 * p, f2: 300, out });
    a.tone({ type: 'sine', f: 150 * p, f2: 45, t, dur: 0.14, peak: 0.26, out });
    a.noise({ t, dur: 0.05, peak: 0.08, type: 'highpass', f: 4000, out });
  },
  hitHeavy(a, t, out, p) {
    a.noise({ t, dur: 0.22, peak: 0.32, type: 'lowpass', f: 1200 * p, f2: 150, out, rev: 0.3 });
    a.tone({ type: 'sine', f: 110 * p, f2: 35, t, dur: 0.25, peak: 0.35, out });
    a.tone({ type: 'square', f: 70 * p, f2: 40, t, dur: 0.1, peak: 0.06, out });
  },
  block(a, t, out, p) {
    [1, 2.76, 5.4, 8.9].forEach((r, i) => a.tone({ type: 'triangle', f: 420 * r * p, t, dur: 0.35 - i * 0.05, peak: 0.08 / (i + 1), out, rev: 0.6 }));
    a.noise({ t, dur: 0.05, peak: 0.15, type: 'highpass', f: 2500, out });
  },
  parry(a, t, out) {
    [1, 2.76, 5.4].forEach((r, i) => a.tone({ type: 'sine', f: 880 * r, t, dur: 0.8, peak: 0.07 / (i + 1), out, rev: 1 }));
    a.tone({ type: 'sine', f: 140, f2: 60, t, dur: 0.3, peak: 0.2, out });
  },
  playerHurt(a, t, out) {
    a.tone({ type: 'sawtooth', f: 240, f2: 140, t, dur: 0.18, peak: 0.08, out });
    a.noise({ t, dur: 0.15, peak: 0.18, type: 'lowpass', f: 800, out });
    a.tone({ type: 'sine', f: 70, f2: 40, t, dur: 0.2, peak: 0.25, out });
  },
  heartbeat(a, t, out) {
    a.tone({ type: 'sine', f: 60, f2: 38, t, dur: 0.12, peak: 0.3, out });
    a.tone({ type: 'sine', f: 55, f2: 35, t: t + 0.18, dur: 0.12, peak: 0.22, out });
  },
  // ---- Abilities
  blink(a, t, out) {
    a.noise({ t, dur: 0.3, a: 0.25, peak: 0.2, type: 'bandpass', f: 400, f2: 3000, q: 2, out, rev: 0.5 });
    a.tone({ type: 'sine', f: 220, f2: 40, t: t + 0.25, dur: 0.5, peak: 0.3, out });
    a.tone({ type: 'sawtooth', f: 110, f2: 55, t: t + 0.25, dur: 0.3, peak: 0.05, out, rev: 0.5 });
  },
  drain(a, t, out) {
    a.tone({ type: 'sawtooth', f: 110, f2: 220, t, dur: 1.2, a: 0.2, peak: 0.05, out, rev: 0.6 });
    a.tone({ type: 'sine', f: 660, f2: 330, t, dur: 1.2, a: 0.2, peak: 0.05, out, rev: 0.8 });
    a.noise({ t, dur: 1.2, a: 0.3, peak: 0.08, type: 'bandpass', f: 600, f2: 1500, q: 3, out });
  },
  eclipse(a, t, out) {
    [50, 53, 57, 62].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), t, dur: 1.6, a: 0.5, peak: 0.04, out, rev: 1 }));
    a.tone({ type: 'sine', f: 80, f2: 22, t: t + 0.8, dur: 1.6, peak: 0.6, out });
    a.noise({ t: t + 0.8, dur: 1.8, peak: 0.4, type: 'lowpass', f: 1800, f2: 80, out, rev: 0.8 });
  },
  roses(a, t, out) {
    [74, 77, 81, 84, 86, 89].forEach((m, i) => a.tone({ type: 'sine', f: mtof(m), t: t + i * 0.05, dur: 0.9, peak: 0.05, out, rev: 1 }));
    a.noise({ t, dur: 0.6, a: 0.05, peak: 0.1, type: 'bandpass', f: 900, f2: 300, q: 2, out });
  },
  chains(a, t, out) {
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.055;
      [1, 2.4, 3.9].forEach((r) => a.tone({ type: 'square', f: 900 * r * (0.9 + Math.random() * 0.2), t: tt, dur: 0.07, peak: 0.025, out }));
    }
    a.tone({ type: 'sine', f: 200, f2: 60, t: t + 0.3, dur: 0.3, peak: 0.25, out });
  },
  queen(a, t, out) {
    [50, 57, 62, 65, 69].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), t, dur: 2.5, a: 0.6, peak: 0.035, out, rev: 1 }));
    a.tone({ type: 'sine', f: 60, f2: 30, t: t + 0.5, dur: 2, peak: 0.4, out });
  },
  bladeRain(a, t, out, p) {
    a.noise({ t, dur: 0.1, peak: 0.12, type: 'bandpass', f: 2600 * p, f2: 900, q: 2, out });
    a.tone({ type: 'sine', f: 140, f2: 60, t: t + 0.08, dur: 0.08, peak: 0.12, out });
  },
  dash(a, t, out) {
    a.noise({ t, dur: 0.3, a: 0.02, peak: 0.25, type: 'highpass', f: 800, f2: 4000, out, rev: 0.4 });
    a.tone({ type: 'sine', f: 900, f2: 200, t, dur: 0.3, peak: 0.06, out, rev: 0.6 });
  },
  guard(a, t, out) {
    [69, 76, 81, 88].forEach((m, i) => a.tone({ type: 'sine', f: mtof(m), t: t + i * 0.04, dur: 1.5, a: 0.05, peak: 0.05, out, rev: 1 }));
  },
  execution(a, t, out) {
    [81, 88, 93].forEach((m) => a.tone({ type: 'triangle', f: mtof(m), t, dur: 2.2, peak: 0.05, out, rev: 1 }));
    a.tone({ type: 'sine', f: 90, f2: 25, t: t + 0.1, dur: 1.4, peak: 0.5, out });
    a.noise({ t, dur: 1.5, peak: 0.3, type: 'lowpass', f: 3000, f2: 100, out, rev: 0.8 });
  },
  crescent(a, t, out) {
    a.noise({ t, dur: 0.35, peak: 0.18, type: 'bandpass', f: 2000, f2: 600, q: 2, out, rev: 0.4 });
    a.tone({ type: 'sine', f: mtof(81), f2: mtof(69), t, dur: 0.35, peak: 0.05, out, rev: 0.6 });
  },
  // ---- Enemies
  crawlerScreech(a, t, out, p) {
    const o = a.tone({ type: 'sawtooth', f: 900 * p, f2: 1500 * p, t, dur: 0.25, peak: 0.05, out });
    a.noise({ t, dur: 0.25, peak: 0.07, type: 'bandpass', f: 3000 * p, q: 5, out });
    return o;
  },
  knightSwing(a, t, out) {
    a.noise({ t, dur: 0.4, a: 0.1, peak: 0.18, type: 'bandpass', f: 250, f2: 1200, q: 1.2, out });
    a.tone({ type: 'sawtooth', f: 85, f2: 70, t, dur: 0.3, peak: 0.07, out });
  },
  armorClank(a, t, out) {
    [1, 2.3, 3.7].forEach((r) => a.tone({ type: 'triangle', f: 300 * r, t, dur: 0.2, peak: 0.04, out }));
  },
  stalkerShriek(a, t, out, p) {
    a.tone({ type: 'sawtooth', f: 600 * p, f2: 1800 * p, t, dur: 0.5, a: 0.05, peak: 0.07, out, rev: 0.6 });
    a.noise({ t, dur: 0.55, a: 0.05, peak: 0.14, type: 'bandpass', f: 2200 * p, f2: 4000, q: 3, out, rev: 0.6 });
  },
  mageCast(a, t, out) {
    a.tone({ type: 'sine', f: 200, f2: 800, t, dur: 0.8, a: 0.3, peak: 0.08, out, rev: 0.8 });
    a.noise({ t, dur: 0.8, a: 0.5, peak: 0.06, type: 'bandpass', f: 500, f2: 2000, q: 4, out });
  },
  projectile(a, t, out) {
    a.noise({ t, dur: 0.25, peak: 0.1, type: 'bandpass', f: 1200, f2: 500, q: 2, out });
    a.tone({ type: 'sine', f: 500, f2: 250, t, dur: 0.2, peak: 0.06, out });
  },
  splash(a, t, out) {
    a.noise({ t, dur: 0.25, peak: 0.16, type: 'lowpass', f: 1500, f2: 200, out });
  },
  enemyAttack(a, t, out, p) {
    a.tone({ type: 'sawtooth', f: 160 * p, f2: 90 * p, t, dur: 0.25, peak: 0.07, out });
    a.noise({ t, dur: 0.2, peak: 0.09, type: 'bandpass', f: 700 * p, q: 2, out });
  },
  enemyDeath(a, t, out, p) {
    a.tone({ type: 'sawtooth', f: 400 * p, f2: 60 * p, t, dur: 0.6, peak: 0.08, out, rev: 0.4 });
    a.noise({ t, dur: 0.5, peak: 0.18, type: 'lowpass', f: 2000, f2: 120, out });
    a.tone({ type: 'sine', f: 120, f2: 40, t: t + 0.1, dur: 0.3, peak: 0.2, out });
  },
  emerge(a, t, out) {
    a.noise({ t, dur: 0.9, a: 0.3, peak: 0.16, type: 'lowpass', f: 200, f2: 900, out, brown: true });
    a.tone({ type: 'sawtooth', f: 60, f2: 90, t, dur: 0.9, a: 0.3, peak: 0.04, out });
  },
  // ---- Boss
  bossLaugh(a, t, out) {
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.16;
      a.tone({ type: 'sawtooth', f: 330 - i * 18, f2: 300 - i * 18, t: tt, dur: 0.12, a: 0.02, peak: 0.06, out, rev: 1 });
      a.noise({ t: tt, dur: 0.12, peak: 0.05, type: 'bandpass', f: 900, q: 6, out, rev: 1 });
    }
  },
  bossRoar(a, t, out) {
    [45, 46, 52].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), f2: mtof(m - 5), t, dur: 1.4, a: 0.1, peak: 0.08, out, rev: 1 }));
    a.noise({ t, dur: 1.4, a: 0.1, peak: 0.22, type: 'bandpass', f: 600, f2: 300, q: 1.5, out, rev: 0.8 });
  },
  teleport(a, t, out) {
    a.noise({ t, dur: 0.5, peak: 0.16, type: 'bandpass', f: 3000, f2: 300, q: 3, out, rev: 0.8 });
    a.tone({ type: 'sine', f: 1200, f2: 200, t, dur: 0.4, peak: 0.05, out, rev: 0.8 });
  },
  warn(a, t, out) {
    a.tone({ type: 'sine', f: 200, f2: 400, t, dur: 0.6, a: 0.1, peak: 0.05, out });
  },
  eruption(a, t, out) {
    a.noise({ t, dur: 0.5, peak: 0.25, type: 'lowpass', f: 1800, f2: 200, out, rev: 0.3 });
    a.tone({ type: 'sine', f: 100, f2: 40, t, dur: 0.35, peak: 0.25, out });
  },
  shockwave(a, t, out) {
    a.tone({ type: 'sine', f: 70, f2: 25, t, dur: 1.2, peak: 0.5, out });
    a.noise({ t, dur: 1.2, peak: 0.3, type: 'lowpass', f: 1200, f2: 60, out, rev: 0.8 });
  },
  // ---- World / horror
  doorOpen(a, t, out) {
    a.tone({ type: 'sawtooth', f: 90, f2: 140, t, dur: 1.1, a: 0.2, peak: 0.04, out, rev: 0.6 });
    a.noise({ t, dur: 1.1, a: 0.2, peak: 0.07, type: 'bandpass', f: 700, f2: 1100, q: 8, out, rev: 0.6 });
    a.tone({ type: 'sine', f: 70, f2: 50, t: t + 1, dur: 0.3, peak: 0.2, out });
  },
  gate(a, t, out) {
    for (let i = 0; i < 8; i++) a.tone({ type: 'square', f: 180 + Math.random() * 40, t: t + i * 0.12, dur: 0.06, peak: 0.03, out });
    a.tone({ type: 'sine', f: 60, f2: 40, t: t + 1, dur: 0.5, peak: 0.25, out, rev: 0.6 });
  },
  locked(a, t, out) {
    a.tone({ type: 'square', f: 220, f2: 180, t, dur: 0.06, peak: 0.05, out });
    a.tone({ type: 'square', f: 200, f2: 160, t: t + 0.1, dur: 0.06, peak: 0.05, out });
  },
  bell(a, t, out) {
    [1, 2, 2.4, 3, 4.2, 5.4].forEach((r, i) => a.tone({ type: 'sine', f: 98 * r, t, dur: 6 - i * 0.6, a: 0.005, peak: 0.12 / (1 + i * 0.6), out, rev: 1 }));
  },
  whisper(a, t, out, p) {
    const n = 7 + Math.floor(Math.random() * 6);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.06 + Math.random() * 0.16;
      a.noise({ t: tt, dur: d, a: d * 0.4, peak: 0.07, type: 'bandpass', f: (1800 + Math.random() * 2200) * p, q: 5 + Math.random() * 6, out, rev: 1 });
      a.noise({ t: tt, dur: d, a: d * 0.4, peak: 0.04, type: 'bandpass', f: (500 + Math.random() * 600) * p, q: 4, out, rev: 1 });
      tt += d + Math.random() * 0.1;
    }
  },
  footstepsDistant(a, t, out) {
    for (let i = 0; i < 6; i++) {
      a.noise({ t: t + i * 0.55, dur: 0.12, peak: 0.08 + i * 0.012, type: 'lowpass', f: 350, out, rev: 0.8 });
    }
  },
  crow(a, t, out) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.32;
      a.tone({ type: 'sawtooth', f: 720, f2: 520, t: tt, dur: 0.18, a: 0.02, peak: 0.05, out, rev: 0.6 });
      a.noise({ t: tt, dur: 0.18, peak: 0.05, type: 'bandpass', f: 1500, q: 3, out, rev: 0.6 });
    }
  },
  owl(a, t, out) {
    a.tone({ type: 'sine', f: 420, f2: 380, t, dur: 0.35, a: 0.08, peak: 0.05, out, rev: 1 });
    a.tone({ type: 'sine', f: 400, f2: 360, t: t + 0.55, dur: 0.6, a: 0.08, peak: 0.05, out, rev: 1 });
  },
  creak(a, t, out) {
    a.tone({ type: 'sawtooth', f: 160, f2: 230, t, dur: 0.9, a: 0.2, peak: 0.025, out, rev: 0.7 });
    a.noise({ t, dur: 0.9, a: 0.2, peak: 0.05, type: 'bandpass', f: 1100, f2: 1500, q: 12, out, rev: 0.7 });
  },
  drip(a, t, out) {
    a.tone({ type: 'sine', f: 1800, f2: 900, t, dur: 0.08, peak: 0.05, out, rev: 1 });
  },
  candlesOut(a, t, out) {
    for (let i = 0; i < 6; i++) a.noise({ t: t + i * 0.18, dur: 0.15, peak: 0.06, type: 'bandpass', f: 1200, f2: 500, q: 1, out, rev: 0.5 });
  },
  scare(a, t, out) {
    [61, 62, 66, 67, 73].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), f2: mtof(m - 2), t, dur: 1.2, a: 0.01, peak: 0.07, out, rev: 0.8 }));
    a.noise({ t, dur: 0.8, a: 0.005, peak: 0.3, type: 'bandpass', f: 2600, f2: 900, q: 1, out, rev: 0.8 });
    a.tone({ type: 'sine', f: 70, f2: 30, t, dur: 0.6, peak: 0.4, out });
  },
  stingSoft(a, t, out) {
    [62, 63, 69].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), t, dur: 1.6, a: 0.25, peak: 0.03, out, rev: 1 }));
  },
  shrine(a, t, out) {
    [62, 69, 74, 78, 81].forEach((m, i) => a.tone({ type: 'sine', f: mtof(m), t: t + i * 0.12, dur: 2.2, a: 0.05, peak: 0.05, out, rev: 1 }));
  },
  altarBreak(a, t, out) {
    a.noise({ t, dur: 0.9, peak: 0.3, type: 'lowpass', f: 2500, f2: 120, out, rev: 0.6 });
    a.tone({ type: 'sine', f: 120, f2: 30, t, dur: 0.9, peak: 0.35, out });
    [61, 62, 68].forEach((m) => a.tone({ type: 'sawtooth', f: mtof(m), t, dur: 1, a: 0.01, peak: 0.03, out, rev: 1 }));
  },
};
