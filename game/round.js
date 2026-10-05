// What one page keeps about the round it is in: the tower (made from the round's seed), the people, and the bots' latest snapshots.
// It is keyed by the round id and thrown away when the id changes, so nothing leaks from one round into the next.

import { GRACE_S, lavaBase, clamp, WORLD_W } from './rules.js';
import { generateTower, analyze } from './tower.js';
import { makeWorld } from './sim.js';
import { makeVis } from './fx.js';

export class RoundCtx {
  constructor(g) {
    this.rid = g.rid;
    this.n = g.round;
    this.seed = g.seed;
    this.tower = generateTower(g.seed);
    this.world = makeWorld(this.tower, { floorUntil: GRACE_S });
    this.base = lavaBase(g.lava);
    this.t0 = g.t0;
    this.index = new Map(g.roster.map((r, i) => [r.id, i]));
    this.botIds = g.roster.filter((r) => r.bot).map((r) => r.id);
    this.vis = new Map(); // id -> look (squash, dust, run cycle)
    this.an = null; // the bots' map of the tower (the host builds it when it needs it)
    this.runner = null; // the host's bots
    this.snaps = []; // other pages' view of the bots: [{ t, p }]
    this.me = null; // this page's own character: { body, st, hot, ghost, ... }
    this.flags = { shout1: false, shout2: false, melt: false, surge: false, warnAt: 0 };
    this.arrived = new Set(); // who we have already celebrated
    this.burned = new Set();
    this.balloonT = -1; // when the balloon started to rise (match ms)
    this.placePop = { text: '', at: -10 };
    this.camSnap = true;
  }

  analysis() {
    if (!this.an) this.an = analyze(this.tower);
    return this.an;
  }

  visOf(id) {
    let v = this.vis.get(id);
    if (!v) {
      v = makeVis();
      this.vis.set(id, v);
    }
    return v;
  }

  /** Remember another page's bot snapshot (validated). */
  pushSnap(b) {
    if (!b || typeof b !== 'object' || b.rid !== this.rid || !Number.isFinite(b.t) || !Array.isArray(b.p) || b.p.length !== this.botIds.length) return;
    for (const s of b.p) if (!Array.isArray(s) || s.length < 7 || !s.every((x) => Number.isFinite(x))) return;
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.t >= b.t) return;
    this.snaps.push({ t: b.t, p: b.p });
    if (this.snaps.length > 6) this.snaps.shift();
  }

  /** Where bot number `i` is at match time `T` (a moment behind the newest snapshot, between the two around it). Fills `out`; false if unknown. */
  sampleBot(i, T, out) {
    const s = this.snaps;
    if (s.length === 0) return false;
    let a = s[0];
    let b = s[0];
    if (T >= s[s.length - 1].t) a = b = s[s.length - 1];
    else if (T > s[0].t) {
      for (let k = s.length - 2; k >= 0; k--) {
        if (s[k].t <= T) {
          a = s[k];
          b = s[k + 1];
          break;
        }
      }
    }
    const pa = a.p[i];
    const pb = b.p[i];
    const f = a === b ? 1 : clamp((T - a.t) / Math.max(1, b.t - a.t), 0, 1);
    // a jump bigger than a step is a teleport (a new round, a new host): don't slide across it
    const jump = Math.abs(pb[0] - pa[0]) > 4 || Math.abs(pb[1] - pa[1]) > 8;
    const k = jump ? 1 : f;
    out.x = clamp(pa[0] + (pb[0] - pa[0]) * k, 0, WORLD_W);
    out.y = pa[1] + (pb[1] - pa[1]) * k;
    out.vx = pb[2];
    out.vy = pb[3];
    out.o = pb[4] ? 1 : 0;
    out.s = pb[5];
    out.f = pb[6] ? 1 : -1;
    return true;
  }
}
