/**
 * Tiny look-ahead music sequencer with synthesized gothic instruments.
 * Tracks: menu, explore, cathedral, safe, tension (combat layer), boss, victory.
 * The 'tension' track is layered over exploration music according to combat intensity.
 */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const EXPLORE_TRACKS = new Set(['explore', 'cathedral', 'forest']);

export class MusicSystem {
  constructor(audio) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.tracks = {};
    this.current = null;
    this.intensity = 0;
    for (const [name, def] of Object.entries(TRACKS)) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(audio.musicIn);
      const send = this.ctx.createGain();
      send.gain.value = def.reverb ?? 0.6;
      gain.connect(send).connect(audio.musicRevIn);
      this.tracks[name] = { name, def, out: gain, step: 0, nextTime: 0, active: false, stopAt: null };
    }
    this.timer = setInterval(() => this._tick(), 40);
  }

  _start(tr, level) {
    const t = this.ctx.currentTime;
    tr.out.gain.cancelScheduledValues(t);
    tr.out.gain.setTargetAtTime(level, t, 0.9);
    if (!tr.active) {
      tr.active = true;
      tr.step = 0;
      tr.nextTime = t + 0.08;
    }
    tr.stopAt = null;
  }

  _stop(tr) {
    if (!tr.active) return;
    const t = this.ctx.currentTime;
    tr.out.gain.cancelScheduledValues(t);
    tr.out.gain.setTargetAtTime(0, t, 0.7);
    tr.stopAt = t + 3.5;
  }

  play(name) {
    if (this.current === name) return;
    this.current = name;
    for (const tr of Object.values(this.tracks)) {
      if (tr.name === name) this._start(tr, 1);
      else if (tr.name !== 'tension' || !EXPLORE_TRACKS.has(name)) this._stop(tr);
    }
    this.setIntensity(this.intensity, true);
  }

  setIntensity(v, force = false) {
    v = Math.max(0, Math.min(1, v));
    if (!force && Math.abs(v - this.intensity) < 0.02) return;
    this.intensity = v;
    const tension = this.tracks.tension;
    if (EXPLORE_TRACKS.has(this.current) && v > 0.05) {
      if (!tension.active || tension.stopAt) this._start(tension, v);
      else tension.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.8);
    } else if (tension.active && !tension.stopAt) this._stop(tension);
  }

  _tick() {
    const t = this.ctx.currentTime;
    if (this.ctx.state !== 'running') return;
    const ahead = t + 0.3;
    for (const tr of Object.values(this.tracks)) {
      if (!tr.active) continue;
      if (tr.stopAt && t > tr.stopAt) {
        tr.active = false;
        continue;
      }
      const spb = 60 / tr.def.bpm / tr.def.div;
      if (tr.nextTime < t - 0.25) tr.nextTime = t + 0.05; // tab was throttled — skip, don't burst
      while (tr.nextTime < ahead) {
        try {
          tr.def.step(this, tr, tr.step % tr.def.length, tr.nextTime, spb);
        } catch (err) {
          console.warn('[Music] step failed', err);
        }
        tr.step++;
        tr.nextTime += spb;
      }
    }
  }

  // ---------------------------------------------------------------- instruments
  _env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }

  organ(tr, m, t, dur, vel = 0.5) {
    const ctx = this.ctx, f = mtof(m);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    g.connect(lp).connect(tr.out);
    for (const [mul, v, type] of [[1, 0.5, 'sine'], [2, 0.25, 'sine'], [4, 0.08, 'triangle'], [0.5, 0.2, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 1);
    }
    this._env(g, t, 0.12, 0.06 * vel, dur, 0.8);
  }

  pad(tr, notes, t, dur, vel = 0.5, cutoff = 900) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.5;
    g.connect(lp).connect(tr.out);
    for (const m of notes) {
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 2.5);
      }
    }
    this._env(g, t, Math.min(1.5, dur * 0.35), 0.022 * vel, dur, 2);
  }

  choir(tr, notes, t, dur, vel = 0.5) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass';
    f1.frequency.value = 720;
    f2.frequency.value = 1150;
    f1.Q.value = 5;
    f2.Q.value = 7;
    const mix = ctx.createGain();
    mix.gain.value = 3.2;
    g.connect(f1).connect(mix);
    g.connect(f2).connect(mix);
    mix.connect(tr.out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 7;
    lfo.connect(lfoG);
    lfo.start(t);
    lfo.stop(t + dur + 2.5);
    for (const m of notes) {
      for (const det of [-6, 0, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        lfoG.connect(o.detune);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 2.5);
      }
    }
    this._env(g, t, Math.min(1.2, dur * 0.4), 0.03 * vel, dur, 1.8);
  }

  bell(tr, m, t, vel = 0.5, decay = 2.5) {
    const ctx = this.ctx, f = mtof(m);
    for (const [mul, v] of [[1, 1], [2, 0.35], [3.01, 0.12], [4.2, 0.05]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 * vel * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / mul ** 0.3);
      o.connect(g).connect(tr.out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  pluck(tr, m, t, vel = 0.5) {
    const ctx = this.ctx, f = mtof(m);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 4;
    const g = ctx.createGain(), g2 = ctx.createGain();
    g2.gain.value = 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(tr.out);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.3);
    o2.stop(t + 1.3);
  }

  bass(tr, m, t, dur, vel = 0.6) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(tr.out);
    this._env(g, t, 0.01, 0.12 * vel, dur * 0.7, 0.12);
    o.start(t);
    o.stop(t + dur + 0.3);
  }

  strings(tr, m, t, dur, vel = 0.5) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    g.connect(lp).connect(tr.out);
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
    this._env(g, t, 0.015, 0.035 * vel, dur * 0.6, 0.12);
  }

  lead(tr, m, t, dur, vel = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg).connect(o.detune);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(tr.out);
    this._env(g, t, 0.03, 0.03 * vel, dur * 0.85, 0.25);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.4);
    lfo.stop(t + dur + 0.4);
  }

  kick(tr, t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(tr.out);
    o.start(t);
    o.stop(t + 0.35);
  }

  taiko(tr, t, vel = 1, f = 80) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(tr.out);
    o.start(t);
    o.stop(t + 0.6);
    this._noiseHit(tr, t, 0.08, 500, 'lowpass', 0.12 * vel);
  }

  _noiseHit(tr, t, dur, f, type, peak) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.a.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(tr.out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  snare(tr, t, vel = 1) {
    this._noiseHit(tr, t, 0.16, 1800, 'highpass', 0.12 * vel);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(tr.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(tr, t, vel = 1) {
    this._noiseHit(tr, t, 0.04, 7500, 'highpass', 0.04 * vel);
  }
}

// ======================================================================= tracks
const R = () => Math.random();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const DMIN = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77];

const TRACKS = {
  menu: {
    bpm: 54, div: 1, length: 16, reverb: 0.9,
    step(m, tr, s, t, spb) {
      const chords = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
      const bar = Math.floor(s / 4);
      if (s % 4 === 0) {
        const ch = chords[bar];
        ch.forEach((n) => m.organ(tr, n, t, spb * 3.8, 0.55));
        m.organ(tr, ch[0] - 12, t, spb * 3.8, 0.6);
        m.choir(tr, ch.map((n) => n + 12), t, spb * 3.6, 0.45);
      }
      const mel = [69, null, 74, null, 77, null, 76, 74, 74, null, 70, null, 73, null, 69, null];
      if (mel[s]) m.bell(tr, mel[s], t, 0.55, 3.5);
    },
  },
  explore: {
    bpm: 42, div: 1, length: 16, reverb: 1,
    step(m, tr, s, t, spb) {
      if (s % 8 === 0) m.pad(tr, [38, 45], t, spb * 8.5, 0.9, 500);
      if (R() < 0.28) m.bell(tr, pick(DMIN) - (R() < 0.5 ? 12 : 0), t, 0.35, 4);
      if (s === 12 && R() < 0.45) m.pad(tr, [62, 63, 68], t, spb * 4, 0.5, 1400);
    },
  },
  cathedral: {
    bpm: 42, div: 1, length: 16, reverb: 1,
    step(m, tr, s, t, spb) {
      if (s % 8 === 0) [38, 45, 50].forEach((n) => m.organ(tr, n, t, spb * 7.5, 0.35));
      if (s === 4) m.choir(tr, [62, 65, 69], t, spb * 6, 0.35);
      if (s === 12 && R() < 0.5) m.choir(tr, [61, 64, 70], t, spb * 4, 0.3);
      if (R() < 0.18) m.bell(tr, pick(DMIN), t, 0.28, 4);
    },
  },
  forest: {
    bpm: 40, div: 1, length: 16, reverb: 1,
    step(m, tr, s, t, spb) {
      if (s % 8 === 0) m.pad(tr, [33, 40, 45], t, spb * 8.5, 0.9, 380);
      if (R() < 0.2) m.bell(tr, pick([62, 63, 65, 68, 69, 74]) - 12, t, 0.3, 5);
      if (s === 10 && R() < 0.5) m.pad(tr, [56, 57, 63], t, spb * 5, 0.45, 1600);
    },
  },
  safe: {
    bpm: 62, div: 2, length: 32, reverb: 0.8,
    step(m, tr, s, t, spb) {
      const bars = [[65, 69, 72, 69], [62, 65, 69, 65], [58, 62, 65, 62], [60, 64, 67, 64]];
      const bar = Math.floor(s / 8);
      const arp = bars[bar];
      m.pluck(tr, arp[s % 4] + 12, t, s % 4 === 0 ? 0.6 : 0.4);
      if (s % 8 === 0) m.pad(tr, arp.slice(0, 3), t, spb * 7.5, 0.5, 1100);
    },
  },
  tension: {
    bpm: 100, div: 2, length: 32, reverb: 0.4,
    step(m, tr, s, t, spb) {
      const ost = [38, 38, 41, 38, 40, 38, 37, 38];
      m.strings(tr, ost[s % 8], t, spb * 0.9, 0.8);
      if ([0, 6, 8, 14, 16, 22, 24, 27, 30].includes(s)) m.taiko(tr, t, s % 8 === 0 ? 1 : 0.6);
      if (s === 0 || s === 16) m.pad(tr, [50, 51, 57], t, spb * 15, 0.35, 1200);
      if (m.intensity > 0.6 && s % 2 === 1) m.hat(tr, t, 0.6);
    },
  },
  boss: {
    bpm: 138, div: 2, length: 32, reverb: 0.5,
    step(m, tr, s, t, spb) {
      const roots = [38, 34, 36, 33];
      const chords = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]];
      const bar = Math.floor(s / 8);
      const b = s % 8;
      const r = roots[bar];
      const bp = [0, 0, 12, 0, 0, 12, 0, 7];
      m.bass(tr, r + bp[b], t, spb * 0.9, 0.8);
      if (b % 2 === 0) m.kick(tr, t, b === 0 ? 1 : 0.7);
      if (b === 6) m.kick(tr, t, 0.6);
      if (b === 4) m.snare(tr, t, 1);
      if (b % 2 === 1) m.hat(tr, t, 0.8);
      if (b === 0) m.choir(tr, chords[bar], t, spb * 7, 0.6);
      if (s >= 30) m.taiko(tr, t, 0.9, 70);
      const mel = [74, null, 73, 74, 77, null, 76, 74, 70, null, 72, 74, 72, null, 70, 69, 72, null, 70, 69, 67, null, 69, 70, 69, null, null, null, 73, null, 69, null];
      if (m.intensity > 0.5 && mel[s]) m.lead(tr, mel[s], t, spb * 1.8, 0.8);
      else if (b === 0) m.strings(tr, chords[bar][0] - 12, t, spb * 7, 0.5);
    },
  },
  victory: {
    bpm: 66, div: 1, length: 16, reverb: 1,
    step(m, tr, s, t, spb) {
      const chords = [[50, 54, 57], [47, 50, 54], [43, 47, 50], [45, 49, 52]];
      if (s % 4 === 0) {
        const ch = chords[s / 4];
        m.choir(tr, ch.map((n) => n + 12), t, spb * 3.8, 0.55);
        ch.forEach((n) => m.organ(tr, n, t, spb * 3.8, 0.4));
      }
      const mel = [74, null, 78, 81, null, 79, 78, null, 76, null, 74, 73, 74, null, null, null];
      if (mel[s]) m.bell(tr, mel[s], t, 0.6, 3);
    },
  },
};
