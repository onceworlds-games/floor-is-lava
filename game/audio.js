// Synthesized sound: a short sound for every action and a looping step-sequencer track. No files. The platform applies volume and mute.
// Everything is guarded: audio never throws into the game, and nothing plays before the first tap unlocks the context.

const STEP = 60 / 124 / 4; // 124 BPM, sixteenth notes
// I - vi - IV - V in C major: bass root, and the chord's three notes
const BARS = [
  { root: 65.41, chord: [261.63, 329.63, 392.0] },
  { root: 55.0, chord: [220.0, 261.63, 329.63] },
  { root: 87.31, chord: [174.61, 220.0, 261.63] },
  { root: 98.0, chord: [196.0, 246.94, 293.66] },
];
const MELODY = [0, 1, 2, 1, 2, 1, 0, 2];

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuf = null;
    this.music = { running: false, next: 0, step: 0, timer: 0, level: 0.35, target: 0.35 };
    this.nextLavaPop = 0;
  }

  get ready() {
    return Boolean(this.ctx);
  }

  /** Call from a tap or key press. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const out = ctx.createGain();
        out.gain.value = 0.9;
        out.connect(ctx.destination);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = 1;
        this.sfxBus.connect(out);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(out);
        const len = ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let seed = 7;
        for (let i = 0; i < len; i++) {
          seed = (seed * 16807) % 2147483647;
          data[i] = (seed / 2147483647) * 2 - 1;
        }
        this.noiseBuf = buf;
        this.ctx = ctx;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  tone(f, dur, opt = {}) {
    const c = this.ctx;
    if (!c || !(f > 0)) return;
    try {
      const t0 = c.currentTime + (opt.delay ?? 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = opt.type ?? 'sine';
      osc.frequency.setValueAtTime(f, t0);
      if (opt.to > 0) osc.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
      const peak = Math.max(0.0002, (opt.v ?? 0.25) * (opt.vol ?? 1));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(opt.bus ?? this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    } catch {
      // ignore
    }
  }

  noise(dur, opt = {}) {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    try {
      const t0 = c.currentTime + (opt.delay ?? 0);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = opt.filter ?? 'bandpass';
      filter.frequency.setValueAtTime(opt.f ?? 1500, t0);
      if (opt.to > 0) filter.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
      filter.Q.value = opt.q ?? 0.8;
      const g = c.createGain();
      const peak = Math.max(0.0002, (opt.v ?? 0.2) * (opt.vol ?? 1));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(opt.bus ?? this.sfxBus);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + 0.04);
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------- the sounds
  jump(vol = 1) {
    this.tone(330, 0.13, { to: 700, type: 'triangle', v: 0.2, vol });
  }
  land(impact = 6, vol = 1) {
    const k = Math.min(1, impact / 14);
    this.tone(150, 0.1, { to: 60, v: 0.3 * (0.4 + k), vol });
    this.noise(0.06, { filter: 'lowpass', f: 900, v: 0.12 * k, vol });
  }
  bounce(vol = 1) {
    this.tone(200, 0.32, { to: 900, type: 'sine', v: 0.3, vol });
    this.tone(400, 0.28, { to: 1500, type: 'triangle', v: 0.1, vol, delay: 0.02 });
  }
  pop() {
    this.tone(520, 0.08, { to: 880, type: 'triangle', v: 0.2 });
  }
  tap() {
    this.tone(700, 0.06, { to: 1000, type: 'square', v: 0.08 });
  }
  tick() {
    this.tone(440, 0.14, { type: 'square', v: 0.16 });
  }
  go() {
    this.tone(880, 0.38, { type: 'square', v: 0.18 });
    this.tone(1320, 0.38, { type: 'square', v: 0.1 });
  }
  shout() {
    this.tone(220, 0.4, { type: 'sawtooth', v: 0.14 });
    this.tone(330, 0.4, { type: 'sawtooth', v: 0.08 });
  }
  lavaShout() {
    this.tone(165, 0.9, { to: 110, type: 'sawtooth', v: 0.18 });
    this.tone(248, 0.9, { to: 165, type: 'sawtooth', v: 0.1 });
    this.noise(0.8, { filter: 'lowpass', f: 1800, to: 300, v: 0.2 });
  }
  melt() {
    this.noise(1.1, { filter: 'lowpass', f: 2600, to: 200, v: 0.3 });
    this.tone(90, 0.9, { to: 40, v: 0.4 });
    this.tone(1200, 0.5, { to: 300, type: 'sawtooth', v: 0.06 });
  }
  warn(vol = 1) {
    this.tone(880, 0.07, { type: 'triangle', v: 0.14, vol });
  }
  crumble(vol = 1) {
    this.noise(0.35, { filter: 'lowpass', f: 500, to: 150, v: 0.25, vol });
  }
  lavaPop(vol = 1) {
    this.tone(140 + Math.random() * 80, 0.09, { to: 320, v: 0.1, vol });
  }
  out(vol = 1) {
    this.noise(0.7, { filter: 'bandpass', f: 2600, to: 500, q: 1.4, v: 0.3, vol });
    this.tone(700, 0.5, { to: 110, type: 'sawtooth', v: 0.2, vol });
  }
  ghost(vol = 1) {
    this.tone(420, 0.5, { to: 840, v: 0.12, vol });
  }
  safe(vol = 1) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', v: 0.2, vol, delay: i * 0.07 }));
  }
  place(i = 0, vol = 1) {
    const base = [1046.5, 880, 783.99, 698.46][Math.min(i, 3)];
    this.tone(base, 0.5, { v: 0.18, vol });
    this.tone(base * 1.5, 0.5, { v: 0.08, vol, delay: 0.02 });
  }
  points() {
    this.tone(1200, 0.07, { to: 1800, type: 'triangle', v: 0.12 });
  }
  fanfare() {
    const notes = [523.25, 523.25, 523.25, 783.99, 659.25, 783.99, 1046.5];
    const at = [0, 0.12, 0.24, 0.36, 0.62, 0.74, 0.9];
    notes.forEach((f, i) => {
      this.tone(f, i === 6 ? 0.9 : 0.2, { type: 'square', v: 0.14, delay: at[i] });
      this.tone(f / 2, i === 6 ? 0.9 : 0.2, { type: 'triangle', v: 0.16, delay: at[i] });
    });
    this.noise(0.6, { filter: 'highpass', f: 6000, v: 0.08, delay: 0.9 });
  }
  whoosh() {
    this.noise(0.9, { filter: 'bandpass', f: 400, to: 3000, q: 0.5, v: 0.2 });
  }

  // ---------------------------------------------------------------- music
  /** 'off' | 'menu' (quiet) | 'play' (full). */
  setMusic(mode) {
    if (!this.ctx) return;
    const m = this.music;
    m.target = mode === 'play' ? 0.85 : mode === 'menu' ? 0.4 : 0;
    m.level = mode === 'play' ? 1 : mode === 'menu' ? 0.45 : 0;
    try {
      this.musicBus.gain.setTargetAtTime(m.target * 0.5, this.ctx.currentTime, 0.4);
    } catch {
      // ignore
    }
    if (mode !== 'off' && !m.running) this.startMusic();
  }

  startMusic() {
    const m = this.music;
    if (!this.ctx || m.running) return;
    m.running = true;
    m.next = this.ctx.currentTime + 0.1;
    m.step = 0;
    m.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    this.music.running = false;
    clearInterval(this.music.timer);
  }

  schedule() {
    const c = this.ctx;
    const m = this.music;
    if (!c || !m.running) return;
    if (m.next < c.currentTime - 0.3) m.next = c.currentTime + 0.05; // the tab slept: don't play the missed notes at once
    while (m.next < c.currentTime + 0.25) {
      try {
        this.playStep(m.step, m.next, m.level);
      } catch {
        // ignore
      }
      m.next += STEP;
      m.step = (m.step + 1) % 64;
    }
  }

  playStep(i, t, level) {
    const c = this.ctx;
    if (level <= 0) return;
    const bar = BARS[i >> 4];
    const s = i & 15;
    const delay = Math.max(0, t - c.currentTime);
    const bus = this.musicBus;
    if (s % 2 === 0) this.tone(bar.root * (s === 6 || s === 14 ? 2 : 1), 0.16, { type: 'triangle', v: 0.34, delay, bus });
    if (level > 0.3) {
      if (s === 0 || s === 8 || (s === 10 && (i >> 4) % 2 === 1)) this.tone(150, 0.16, { to: 45, v: 0.55, delay, bus });
      if (s % 2 === 0) this.noise(0.035, { filter: 'highpass', f: 7000, v: level > 0.7 ? 0.09 : 0.05, delay, bus });
    }
    if (level > 0.7) {
      if (s === 4 || s === 12) {
        this.noise(0.12, { filter: 'bandpass', f: 1800, v: 0.22, delay, bus });
        this.tone(190, 0.08, { type: 'triangle', v: 0.1, delay, bus });
      }
      if (s === 2 || s === 6 || s === 10 || s === 14) for (const f of bar.chord) this.tone(f, 0.1, { type: 'square', v: 0.035, delay, bus });
      if (s % 2 === 0) this.tone(bar.chord[MELODY[(s >> 1) % MELODY.length]] * 2, 0.12, { type: 'sine', v: 0.1, delay, bus });
    } else if (level > 0.3 && (s === 2 || s === 10)) {
      for (const f of bar.chord) this.tone(f, 0.12, { type: 'triangle', v: 0.03, delay, bus });
    }
  }
}
