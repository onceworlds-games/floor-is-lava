// The first night teaches in context: one short hint at the moment it matters, each shown until its
// condition is met or it times out, remembered in the profile so it stops after a few nights.
const HINTS = [
  { id: 'spot', when: (s, me) => me.st === 'lantern' && s.beam.mode === 'sweep' && s.ships.length > 0, done: (s) => s.beam.mode === 'spot', text: (t) => (t ? 'MODE: SPOT' : 'SPACE: SPOT'), max: 3 },
  { id: 'aim', when: (s, me) => me.st === 'lantern' && s.beam.mode === 'spot' && s.ships.some((x) => x.st === 'sail'), done: (s) => s.ships.some((x) => x.lit), text: (t) => (t ? 'DRAG ONTO THE SHIP' : 'AIM AT THE SHIP'), max: 3 },
  { id: 'hold', when: (s, me) => me.st === 'lantern' && s.ships.some((x) => x.lit), done: (s) => s.ships.some((x) => x.guided > 0), text: () => 'HOLD IT: GUIDED', max: 3 },
  { id: 'focus', when: (s, me) => me.st === 'lantern' && s.ships.some((x) => x.guided > 0) && s.beam.r > 16, done: (s) => s.beam.r <= 16, text: (t) => (t ? 'SLIDER: FOCUS' : 'WHEEL: FOCUS'), max: 2 },
  { id: 'drowned', when: (s, me) => me.st === 'lantern' && s.hostiles.some((h) => h.type === 'drowned' && h.st === 'climb'), done: (s) => !s.hostiles.some((h) => h.type === 'drowned' && h.st === 'climb'), text: () => 'BURN THE CRAWLERS', max: 3 },
  { id: 'door', when: (s) => s.hostiles.some((h) => h.type === 'drowned' && h.st === 'door'), done: (s) => !s.hostiles.some((h) => h.type === 'drowned' && h.st === 'door'), text: () => 'GALLERY: FLARE THE DOOR', max: 3 },
  { id: 'heat', when: (s, me) => me.st === 'lantern' && s.beam.heat > 70, done: (s) => s.beam.heat < 50, text: () => 'SWEEP TO COOL', max: 3 },
  { id: 'radio', when: (s, me) => me.st !== 'watch' && s.ships.some((x) => x.needs && x.st === 'distress'), done: (s) => !s.ships.some((x) => x.needs && x.st === 'distress'), text: () => 'WATCH ROOM: RADIO', max: 3 },
  { id: 'siren', when: (s) => s.hostiles.some((h) => h.type === 'siren' && h.st === 'sing' && h.silenced <= 0), done: (s) => !s.hostiles.some((h) => h.type === 'siren' && h.st === 'sing' && h.silenced <= 0), text: () => 'AMBER QUIETS HER', max: 2 },
  { id: 'mimic', when: (s) => s.hostiles.some((h) => h.type === 'mimic' && h.st === 'lure'), done: (s) => !s.hostiles.some((h) => h.type === 'mimic' && h.st === 'lure'), text: () => 'BLUE SHOWS LIES', max: 2 },
  { id: 'wraith', when: (s) => s.ships.some((x) => x.hidden), done: (s) => !s.ships.some((x) => x.hidden), text: () => 'HORN, OR A FLARE', max: 2 },
  { id: 'moths', when: (s) => s.beam.grit > 0.3, done: (s) => s.beam.grit < 0.1, text: () => 'STROBE THE MOTHS', max: 2 },
  { id: 'kraken', when: (s) => s.hostiles.some((h) => h.type === 'kraken' && h.st === 'grip'), done: (s) => !s.hostiles.some((h) => h.type === 'kraken' && h.st === 'grip'), text: () => 'HARPOONS, OR HARD WHITE', max: 2 },
  { id: 'oil', when: (s) => s.res.oil / s.res.oilMax < 0.15 && s.res.oilCans > 0, done: (s) => s.res.oilCans === 0 || s.res.oil / s.res.oilMax > 0.2, text: () => 'CELLAR: OIL CAN', max: 3 },
  { id: 'power', when: (s) => s.res.power < 15, done: (s) => s.res.power > 25, text: () => 'GENERATOR OR CRANK', max: 3 },
  { id: 'tower', when: (s) => s.res.integ < 40, done: (s) => s.res.integ > 50, text: () => 'HAMMER: GALLERY OR CELLAR', max: 3 },
];

export class Hints {
  constructor(profile, touch) {
    this.profile = profile;
    this.touch = touch;
    this.active = null;
    this.timer = 0;
    this.enabled = !profile.tutorial;
  }

  skip() {
    this.enabled = false;
    this.profile.tutorial = true;
    this.active = null;
  }

  /** Returns the hint text to show, or null. */
  update(state, me, dt) {
    if (!this.enabled || !me || state.phase !== 'night') return null;
    const seen = this.profile.hints;
    if (this.active) {
      const h = this.active;
      this.timer += dt;
      if (h.done(state, me) || this.timer > 10) {
        this.active = null;
      } else return h.text(this.touch);
    }
    for (const h of HINTS) {
      if ((seen[h.id] || 0) >= h.max) continue;
      if (h.when(state, me) && !h.done(state, me)) {
        seen[h.id] = (seen[h.id] || 0) + 1;
        this.active = h;
        this.timer = 0;
        return h.text(this.touch);
      }
    }
    return null;
  }
}
