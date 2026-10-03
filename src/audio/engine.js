// Procedural sound: wind, swell, rain, the lamp motor, the horn, thunder, the siren's song, radio
// chatter, the harpoon, flares, the bell and a sparse pad that swells with danger. One limiter at
// the end so nothing clips. Starts on the first gesture; the platform owns the volume.

const dist = (x, z) => Math.hypot(x, z);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.layers = {};
    this.lastPitch = {};
    this.pad = null;
    this.danger = 0;
    this.song = null;
    this.hornNode = null;
    this.crankNode = null;
    this.muted = false;
    this.thunderQueue = [];
    this.time = 0;
  }

  /** Call from a tap or key inside the game. Safe to call repeatedly. */
  start() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 18;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.noiseBuf = this.makeNoise(2);
    this.buildAmbience();
    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      // Pinkish noise: three leaky integrators.
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  noiseSource(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  layer(name, build) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const nodes = build(gain);
    this.layers[name] = { gain, ...nodes };
    return this.layers[name];
  }

  buildAmbience() {
    const ctx = this.ctx;
    // Wind: pink noise through a wandering bandpass, with gusts.
    this.layer('wind', (out) => {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      lfo.start();
      src.connect(bp);
      bp.connect(out);
      src.start();
      return { bp };
    });
    // Swell: low rumble that breathes.
    this.layer('swell', (out) => {
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const amp = ctx.createGain();
      amp.gain.value = 0.6;
      lfo.connect(lg);
      lg.connect(amp.gain);
      lfo.start();
      src.connect(lp);
      lp.connect(amp);
      amp.connect(out);
      src.start();
      return {};
    });
    // Rain: bright hiss.
    this.layer('rain', (out) => {
      const src = this.noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2400;
      src.connect(hp);
      hp.connect(out);
      src.start();
      return {};
    });
    // The lamp's motor: a low hum whose pitch follows the output.
    this.layer('motor', (out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 58;
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 116.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(out);
      osc.start();
      osc2.start();
      return { osc, osc2, lp };
    });
    // Generator: a chugging pulse.
    this.layer('gen', (out) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 38;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      osc.connect(lp);
      lp.connect(out);
      osc.start();
      return {};
    });
    // The pad: three detuned voices, swelling with danger, receding at dawn.
    this.layer('pad', (out) => {
      const voices = [];
      for (const f of [55, 82.4, 110.2]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.33;
        o.connect(g);
        g.connect(out);
        o.start();
        voices.push(o);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      return { voices };
    });
    // The siren's song: dissonant additive voices with slow vibrato.
    this.layer('song', (out) => {
      const voices = [];
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.3;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg);
      vib.start();
      for (const f of [392, 415.3, 587.3, 622.3]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        vg.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.25;
        o.connect(g);
        g.connect(out);
        o.start();
        voices.push(o);
      }
      return { voices };
    });
    // Radio: bandpassed static, with beeps and garbled syllables on calls.
    this.layer('static', (out) => {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 1.2;
      src.connect(bp);
      bp.connect(out);
      src.start();
      return {};
    });
    // The horn: stacked low tones with a slow attack and a breathy top.
    this.layer('horn', (out) => {
      const voices = [];
      for (const [f, type] of [[55, 'sawtooth'], [82.5, 'square'], [110, 'sine'], [165, 'sine']]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = type === 'sawtooth' ? 0.3 : 0.2;
        o.connect(g);
        g.connect(out);
        o.start();
        voices.push(o);
      }
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 220;
      bp.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(out);
      src.start();
      return { voices };
    });
    // The crank: a ratchet of clicks.
    this.layer('crank', (out) => {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 6;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 7;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg);
      lg.connect(amp.gain);
      lfo.start();
      src.connect(bp);
      bp.connect(amp);
      amp.connect(out);
      src.start();
      return {};
    });
  }

  setLayer(name, value, time = 0.4) {
    const l = this.layers[name];
    if (!l) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0, Math.min(1.5, Number.isFinite(value) ? value : 0));
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setTargetAtTime(v, t, time);
  }

  /** A pitch that never repeats the last one for this sound. */
  vary(key, base, spread = 0.12) {
    let p = base * (1 + (Math.random() * 2 - 1) * spread);
    if (this.lastPitch[key] && Math.abs(p - this.lastPitch[key]) < base * spread * 0.3) p = base * (1 + (p > this.lastPitch[key] ? 1 : -1) * spread);
    this.lastPitch[key] = p;
    return p;
  }

  tone(freq, { type = 'sine', attack = 0.005, decay = 0.25, gain = 0.3, glide = 0, filter = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    let last = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      last = f;
    }
    last.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  burst({ decay = 0.2, gain = 0.3, hp = 0, lp = 0, bp = 0, q = 1, delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = this.noiseSource(false);
    let node = s;
    if (hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      node.connect(f);
      node = f;
    }
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node.connect(f);
      node = f;
    }
    if (bp) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = bp;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    node.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + decay + 0.05);
  }

  // Named sounds. Each varies its pitch so no two in a row are the same.
  click() {
    this.tone(this.vary('click', 1400, 0.15), { type: 'square', decay: 0.04, gain: 0.06 });
  }
  thunk() {
    this.burst({ decay: 0.12, gain: 0.5, lp: 900 });
    this.tone(this.vary('thunk', 70, 0.2), { type: 'sine', decay: 0.3, gain: 0.5, glide: 0.5 });
  }
  flare() {
    this.burst({ decay: 1.6, gain: 0.25, hp: 1500 });
    this.tone(this.vary('flare', 900, 0.2), { type: 'sine', decay: 0.5, gain: 0.08, glide: 0.4 });
  }
  splash() {
    this.burst({ decay: 0.5, gain: 0.3, bp: 700, q: 0.8 });
  }
  bell(level = 50) {
    const base = level <= 10 ? 440 : level <= 25 ? 520 : 620;
    for (const [m, g] of [[1, 0.35], [2.76, 0.12], [5.4, 0.06]]) this.tone(base * m, { type: 'sine', decay: level <= 10 ? 2.2 : 1.4, gain: g });
  }
  coins() {
    this.tone(this.vary('coin', 1800, 0.1), { type: 'triangle', decay: 0.18, gain: 0.12 });
    setTimeout(() => this.tone(this.vary('coin', 2400, 0.1), { type: 'triangle', decay: 0.22, gain: 0.1 }), 70);
  }
  shipHorn() {
    this.tone(this.vary('ship', 196, 0.08), { type: 'sawtooth', attack: 0.2, decay: 0.9, gain: 0.12, filter: 500 });
  }
  wreck() {
    this.burst({ decay: 1.4, gain: 0.5, lp: 500 });
    this.tone(this.vary('wreck', 90, 0.15), { type: 'triangle', decay: 1.2, gain: 0.3, glide: 0.4 });
  }
  crack() {
    this.burst({ decay: 0.5, gain: 0.5, hp: 2500 });
    this.burst({ decay: 0.3, gain: 0.4, bp: 4000, q: 3, delay: 0.05 });
    this.tone(this.vary('crack', 2200, 0.2), { type: 'square', decay: 0.1, gain: 0.08 });
  }
  thunder(distance) {
    const delay = Math.min(6, distance / 340);
    this.burst({ decay: 0.25, gain: 0.7, hp: 800, delay });
    this.burst({ decay: 2.5 + Math.random(), gain: 0.8, lp: 140, delay: delay + 0.1 });
    this.duck(delay, 2.5);
  }
  bark() {
    for (let i = 0; i < 2; i++) setTimeout(() => this.burst({ decay: 0.12, gain: 0.35, bp: this.vary('bark', 650, 0.2), q: 2 }), i * 160);
  }
  purr() {
    this.burst({ decay: 1.2, gain: 0.2, bp: 90, q: 3 });
  }
  gust() {
    this.burst({ decay: 1.5, gain: 0.25, bp: this.vary('gust', 700, 0.3), q: 0.5 });
  }
  radioBeep(ok) {
    this.tone(ok ? 1100 : 500, { type: 'square', decay: 0.08, gain: 0.07 });
    setTimeout(() => this.tone(ok ? 1500 : 400, { type: 'square', decay: 0.12, gain: 0.07 }), 120);
    if (ok) for (let i = 0; i < 4; i++) setTimeout(() => this.burst({ decay: 0.09, gain: 0.18, bp: this.vary('voice', 900, 0.4), q: 4 }), 300 + i * 110);
  }
  hail() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.tone(this.vary('morse', 1200, 0.05), { type: 'sine', decay: i === 1 ? 0.18 : 0.07, gain: 0.07 }), i * 170);
    for (let i = 0; i < 5; i++) setTimeout(() => this.burst({ decay: 0.08, gain: 0.14, bp: this.vary('voice', 1000, 0.45), q: 5 }), 600 + i * 95);
  }
  stairs() {
    this.burst({ decay: 0.1, gain: 0.18, bp: this.vary('step', 320, 0.3), q: 2 });
  }
  swapLens() {
    this.tone(this.vary('swap', 240, 0.1), { type: 'triangle', decay: 0.9, gain: 0.12, glide: 2.0 });
  }
  wipe() {
    this.burst({ decay: 0.6, gain: 0.2, bp: 2200, q: 1 });
  }
  strobeTick() {
    this.tone(this.vary('strobe', 3000, 0.2), { type: 'square', decay: 0.02, gain: 0.03 });
  }
  burn() {
    this.burst({ decay: 0.4, gain: 0.25, bp: this.vary('burn', 1800, 0.3), q: 2 });
  }
  scatter() {
    this.burst({ decay: 0.5, gain: 0.3, bp: 500, q: 0.6 });
  }
  door() {
    this.burst({ decay: 0.2, gain: 0.5, lp: 400 });
    this.tone(this.vary('door', 60, 0.2), { type: 'square', decay: 0.2, gain: 0.25, filter: 200 });
  }
  titan() {
    this.tone(this.vary('titan', 36, 0.1), { type: 'sawtooth', attack: 0.6, decay: 2.5, gain: 0.4, filter: 180 });
    this.burst({ decay: 2.5, gain: 0.5, lp: 120 });
  }
  dawnBell() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.bell(50), i * 900);
  }
  win() {
    for (const [i, f] of [330, 392, 494, 659].entries()) setTimeout(() => this.tone(f, { type: 'triangle', decay: 0.8, gain: 0.15 }), i * 160);
  }
  lose() {
    for (const [i, f] of [330, 311, 294, 220].entries()) setTimeout(() => this.tone(f, { type: 'sine', decay: 1.0, gain: 0.15 }), i * 260);
  }

  duck(delay, seconds) {
    const l = this.layers.pad;
    if (!l) return;
    const t = this.ctx.currentTime + delay;
    l.gain.gain.setTargetAtTime(0.02, t, 0.05);
    l.gain.gain.setTargetAtTime(this.padLevel || 0, t + seconds, 0.8);
  }

  /** Continuous mix from the night state, called every frame. */
  update(state, me, dt) {
    if (!this.ready) return;
    this.time += dt;
    const w = state.weather;
    const inside = me ? me.st !== 'gallery' : true;
    const night = state.phase === 'night';
    const storm = w.storm;
    this.setLayer('wind', (0.12 + storm * 0.5) * (inside ? 0.45 : 1) * (night ? 1 : 0.7));
    this.layers.wind.bp.Q.value = inside ? 1.4 : 0.7;
    this.setLayer('swell', 0.1 + storm * 0.35);
    this.setLayer('rain', (w.rain || 0) * (inside ? 0.12 : 0.35));
    const b = state.beam;
    const on = night && !(b.offline > 0) && state.res.oil > 0;
    const out = b.mode === 'spot' ? Math.min(2.5, (20 / b.r) ** 2) * (b.over ? 1.8 : 1) : 0.5;
    const lantern = me && me.st === 'lantern';
    this.setLayer('motor', on ? (lantern ? 0.14 : 0.04) + (b.over ? 0.08 : 0) : 0, 0.2);
    const m = this.layers.motor;
    m.osc.frequency.setTargetAtTime(52 + out * 18 + (b.mode === 'sweep' ? 6 : 0), this.ctx.currentTime, 0.3);
    m.osc2.frequency.setTargetAtTime(104 + out * 36, this.ctx.currentTime, 0.3);
    m.lp.frequency.setTargetAtTime(240 + out * 160, this.ctx.currentTime, 0.3);
    this.setLayer('gen', state.gen.on && state.res.oil > 0 ? (me && (me.st === 'watch' || me.st === 'cellar') ? 0.12 : 0.03) : 0);
    this.setLayer('horn', state.horn.on ? 0.55 : 0, state.horn.on ? 0.25 : 0.12);
    this.setLayer('crank', state.crank.on ? 0.3 : 0, 0.05);
    // The siren: louder the closer she is to the tower (the keeper is always at the tower).
    let song = 0;
    for (const h of state.hostiles) if (h.type === 'siren' && h.st === 'sing' && h.silenced <= 0) song = Math.max(song, 0.5 * (1 - Math.min(1, dist(h.x, h.z) / 400)));
    this.setLayer('song', song, 0.6);
    this.setLayer('static', me && me.st === 'watch' ? 0.04 + w.static * 0.12 : 0.01, 0.3);
    // Danger drives the pad.
    let danger = 0;
    for (const h of state.hostiles) if (h.st !== 'gone' && h.st !== 'tell') danger += h.type === 'titan' ? 1 : h.type === 'kraken' ? 0.8 : 0.35;
    for (const s of state.ships) if (s.needs) danger += 0.2;
    if (state.res.integ < 30) danger += 0.4;
    danger = Math.min(1, danger);
    this.danger += (danger - this.danger) * Math.min(1, dt * 0.5);
    this.padLevel = night ? 0.03 + this.danger * 0.14 : state.phase === 'dusk' ? 0.05 : 0;
    this.setLayer('pad', this.padLevel, 1.5);
    const pad = this.layers.pad;
    pad.voices[1].frequency.setTargetAtTime(82.4 + this.danger * 3, this.ctx.currentTime, 2);
    if (Math.random() < dt * (0.04 + storm * 0.1)) this.gust();
  }

  /** One-off events from the night. */
  fx(ev, state) {
    if (!this.ready) return;
    switch (ev.k) {
      case 'harpoon': return this.thunk();
      case 'splash': return this.splash();
      case 'harpoon-hit': return this.burst({ decay: 0.3, gain: 0.4, bp: 300, q: 1 });
      case 'flare': return this.flare();
      case 'bell': return this.bell(ev.level);
      case 'coins': return this.coins();
      case 'saved': return this.shipHorn();
      case 'wreck': return this.wreck();
      case 'crack': return this.crack();
      case 'lightning': return this.thunder(ev.near ? 30 : dist(ev.x, ev.z));
      case 'bark': return this.bark();
      case 'purr': return this.purr();
      case 'radio-ok': return this.radioBeep(true);
      case 'radio-fail': case 'radio-dead': return this.radioBeep(false);
      case 'hail': return this.hail();
      case 'stairs': return this.stairs();
      case 'arrived': return this.stairs();
      case 'swap': return this.swapLens();
      case 'wipe': return this.wipe();
      case 'burn': return this.burn();
      case 'scatter': case 'siren-flee': case 'moths-gone': return this.scatter();
      case 'door': return this.door();
      case 'arrive': return ev.type === 'kraken' || ev.type === 'titan' ? this.titan() : ev.type === 'drowned' ? this.scatter() : null;
      case 'titan-phase': case 'titan-slam': return this.titan();
      case 'dawn': return this.dawnBell();
      case 'over': return ev.result === 'dawn' ? null : this.lose();
      case 'titan-down': return this.win();
      case 'guided': return this.tone(this.vary('guided', 660, 0.08), { type: 'sine', decay: 0.3, gain: 0.08 });
      case 'mode': case 'lens': case 'gen': return this.click();
      case 'oil': return this.burst({ decay: 0.8, gain: 0.2, lp: 600 });
      case 'crate': return this.thunk();
      case 'salvage': return this.coins();
      case 'distress': return this.radioBeep(false);
      case 'engine': return this.shipHorn();
      case 'mimic-revealed': return this.tone(330, { type: 'square', decay: 0.4, gain: 0.08, glide: 0.5 });
      case 'siren-silenced': return this.tone(this.vary('silence', 880, 0.05), { type: 'sine', decay: 0.6, gain: 0.08 });
      case 'kraken-retreat': return this.splash();
      case 'stun': return this.crack();
      case 'rod': return this.burst({ decay: 0.4, gain: 0.3, bp: 3000, q: 3 });
      case 'powerout': case 'oilout': return this.tone(120, { type: 'triangle', decay: 1.2, gain: 0.15, glide: 0.5 });
      case 'nightfall': return this.bell(50);
      default: return null;
    }
  }

  ui() {
    this.click();
  }
}
