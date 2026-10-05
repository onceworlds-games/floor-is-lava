// The room: the shared record of the match (`g`), the host's page that runs the rounds, and a stand-alone stub room.
//
//   - One record per match, written only by the host: `g` = { mid, by, n, round, rid, phase, until, t0, seed, lava, roster, scores, firsts, gap,
//     safe, sg, out, rp, order, te }. Pages derive what to draw from `room.match.phase` plus `g`; a `g` of another match is stale.
//   - Deadlines are match-clock values (`room.matchNow()`), so a pause and a change of host keep them. The host's ticker (every 100 ms)
//     only acts when it is the host, the match is running and `g.by` is itself; `adopt()` takes a record over after a reload or a new host.
//   - Outcomes: the page of the player it happens to decides (safe, burned) and tells the host; the host orders arrivals by the room's
//     clock, decides for bots and for players who went quiet, and writes `g`.
//   - Everything read from the room is validated: it comes from other people's browsers.

import { PHYS, T, GRACE_S, ROUND_MAX_S, SURGE_DELAY_S, TABLE_SIZE, buildRoster, spawnX, roundSeed, roundsOf, lavaOf, lavaAt, applySafe, applyOut, resolved, roundDone, roundOrder, roundPoints, clamp } from './rules.js';
import { BotRunner, botSpecs } from './bots.js';

// ------------------------------------------------------------------ the record
const PHASES = new Set(['banner', 'play', 'fly', 'score', 'final']);
let cachedRaw = null;
let cachedMid = null;
let cachedOk = null;

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function check(g, mid) {
  if (!isMap(g) || g.mid !== mid || typeof g.by !== 'string' || typeof g.rid !== 'string' || !PHASES.has(g.phase)) return null;
  if (!isNum(g.n, 1, 5) || !isNum(g.round, 1, g.n) || !isNum(g.until, 0, 1e12) || !isNum(g.t0, 0, 1e12) || !isNum(g.seed, 0, 4294967296) || typeof g.lava !== 'string') return null;
  if (!Array.isArray(g.roster) || g.roster.length < 1 || g.roster.length > 12) return null;
  const ids = new Set();
  for (const r of g.roster) {
    if (!isMap(r) || typeof r.id !== 'string' || r.id.length > 80 || ids.has(r.id) || (r.bot !== 0 && r.bot !== 1) || !isNum(r.c, 0, 11)) return null;
    if (r.bot && typeof r.name !== 'string') return null;
    ids.add(r.id);
  }
  if (!Array.isArray(g.safe) || g.safe.length > 12 || g.safe.some((id) => typeof id !== 'string')) return null;
  for (const key of ['scores', 'firsts', 'gap', 'sg', 'out']) if (!isMap(g[key])) return null;
  for (const key of ['scores', 'firsts', 'gap', 'sg', 'out']) for (const v of Object.values(g[key])) if (!isNum(v, -1e6, 1e6)) return null;
  if (g.ff !== undefined && !isNum(g.ff, -1, 1e6)) return null;
  if (g.rp !== null && g.rp !== undefined && !isMap(g.rp)) return null;
  if (g.order !== null && g.order !== undefined && (!Array.isArray(g.order) || g.order.some((id) => typeof id !== 'string'))) return null;
  return g;
}

/** The match's record if it is this match's and well formed, else null. */
export function readG(room) {
  const raw = room.state.g;
  if (raw === cachedRaw && room.match.id === cachedMid) return cachedOk;
  cachedRaw = raw;
  cachedMid = room.match.id;
  cachedOk = check(raw, room.match.id);
  return cachedOk;
}

const r1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ the host
export class Host {
  /** `game`: { ctxFor(g) -> RoundCtx | null, nowMs() } */
  constructor(room, game) {
    this.room = room;
    this.game = game;
    this.claims = []; // arrivals and burns waiting to be ordered: { kind, id, at, ms, h }
    this.lastBots = -1e9;
    this.lastEnd = -1e9;
  }

  get g() {
    return readG(this.room);
  }
  get meId() {
    return this.room.me.id;
  }
  get acting() {
    return this.room.isHost && this.room.running;
  }

  put(g, patch) {
    this.room.setState('g', { ...g, ...patch });
  }

  // ---------------------------------------------------------------- lifecycle
  startMatch() {
    const room = this.room;
    const humans = (room.match.participants ?? []).filter((id) => typeof id === 'string');
    const roster = buildRoster(humans, room.match.seed, TABLE_SIZE);
    const base = {
      mid: room.match.id,
      by: this.meId,
      n: roundsOf(room.settings.rounds),
      lava: lavaOf(room.settings.lava),
      roster,
      scores: Object.fromEntries(roster.map((r) => [r.id, 0])),
      firsts: {},
      gap: {},
      round: 0,
    };
    this.claims = [];
    room.setState('b', null);
    room.setState('g', this.roundRecord(base, 1));
  }

  roundRecord(g, n) {
    const room = this.room;
    const t0 = room.matchNow() + T.bannerMs;
    return { ...g, by: this.meId, round: n, rid: `${room.match.id}.${n}`, phase: 'banner', until: t0, t0, seed: roundSeed(room.match.seed, n), safe: [], sg: {}, out: {}, rp: null, order: null, te: 0, ff: -1 };
  }

  nextRound() {
    const g = this.g;
    if (!g) return;
    const n = g.round + 1;
    this.claims = [];
    if (n > g.n) {
      this.put(g, { phase: 'final', until: this.room.matchNow() + T.finalMs });
      return;
    }
    this.room.setState('b', null);
    this.room.setState('g', this.roundRecord(g, n));
  }

  /** Carry on as the host, from the room's copy. Safe to call again and again (a match start, a new host, a reconnect). */
  adopt() {
    const room = this.room;
    if (!room.isHost || !room.running) return;
    const g = this.g;
    if (!g) return this.startMatch();
    if (g.by === this.meId) return;
    this.claims = [];
    this.put(g, { by: this.meId });
  }

  tick() {
    const room = this.room;
    if (!this.acting) return;
    const g = this.g;
    if (!g || g.by !== this.meId) return;
    const now = room.matchNow();
    switch (g.phase) {
      case 'banner':
        if (now >= g.until) this.put(g, { phase: 'play', until: 0 });
        break;
      case 'play':
        this.tickPlay(g, now);
        break;
      case 'fly':
        if (now >= g.until) this.toScore(g, now);
        break;
      case 'score':
        if (now >= g.until) this.nextRound();
        break;
      case 'final':
        if (now >= g.until && now - this.lastEnd > 2500) {
          this.lastEnd = now;
          room.endMatch(); // back to the platform's lobby, ready flags cleared
        }
        break;
      default:
    }
  }

  // ---------------------------------------------------------------- playing
  tickPlay(g, now) {
    const ctx = this.game.ctxFor(g);
    if (!ctx) return;
    const room = this.room;
    const t = (now - g.t0) / 1000;
    const L = lavaAt(ctx.base, t, g.ff);
    const ids = g.roster.map((r) => r.id);
    const rec = { safe: g.safe.slice(), out: { ...g.out } };
    const sg = { ...g.sg };
    let changed = false;

    // arrivals in the room's order, once everyone's has had time to arrive
    const wall = this.game.nowMs();
    this.claims.sort((a, b) => a.at - b.at);
    const waiting = [];
    for (const c of this.claims) {
      if (c.kind === 'safe') {
        if (c.at > wall - T.claimWaitMs) {
          waiting.push(c);
          continue;
        }
        if (applySafe(rec, c.id)) {
          sg[c.id] = r1(Math.max(0, ctx.tower.goalY - lavaAt(ctx.base, (c.ms - g.t0) / 1000, g.ff)));
          changed = true;
        }
      } else if (applyOut(rec, c.id, c.h)) changed = true;
    }
    this.claims = waiting;

    // a person the lava passed without a word (away, frozen, gone): they stood still and it got them
    for (const r of g.roster) {
      if (r.bot || r.id === this.meId || resolved(rec, r.id) || waiting.some((c) => c.id === r.id)) continue;
      const pr = room.players.get(r.id)?.presence;
      const seen = pr && Number.isFinite(pr.y) && pr.r === g.round;
      const y = seen ? pr.y : 0;
      if (y < L - 1.2) {
        applyOut(rec, r.id, seen && Number.isFinite(pr.m) ? pr.m : 0);
        changed = true;
      }
    }

    // the round is over when every seat is safe or out; once every person is, the lava surges so the bots don't keep anyone waiting
    const everyone = roundDone(rec, ids) && waiting.length === 0;
    const people = g.roster.every((r) => r.bot || resolved(rec, r.id)) && waiting.length === 0;
    let ff = g.ff;
    if (people && !(ff >= 0)) {
      ff = t + SURGE_DELAY_S;
      changed = true;
    }
    if (everyone || t >= ROUND_MAX_S + GRACE_S || (ff >= 0 && t > ff + 40)) {
      // whoever is left (the very last stragglers) is ranked by how high they got
      for (const r of g.roster) {
        if (resolved(rec, r.id)) continue;
        const h = r.bot ? (ctx.runner?.byId(r.id)?.body.maxY ?? 0) : (room.players.get(r.id)?.presence?.m ?? 0);
        applyOut(rec, r.id, Number.isFinite(h) ? h : 0);
      }
      this.claims = [];
      this.put(g, { safe: rec.safe, out: rec.out, sg, ff, phase: 'fly', until: now + T.flyMs, te: now });
      return;
    }
    if (changed) this.put(g, { safe: rec.safe, out: rec.out, sg, ff });
  }

  toScore(g, now) {
    const ids = g.roster.map((r) => r.id);
    const rec = { safe: g.safe, out: g.out };
    const rp = roundPoints(rec, ids);
    const order = roundOrder(rec, ids);
    const scores = { ...g.scores };
    for (const id of ids) scores[id] = (scores[id] ?? 0) + rp[id];
    const firsts = { ...g.firsts };
    if (g.safe[0]) firsts[g.safe[0]] = (firsts[g.safe[0]] ?? 0) + 1;
    const gap = { ...g.gap };
    for (const id of g.safe) {
      const v = g.sg[id];
      if (Number.isFinite(v) && (gap[id] === undefined || v < gap[id])) gap[id] = v;
    }
    this.put(g, { phase: 'score', until: now + T.scoreMs, scores, firsts, gap, rp, order });
  }

  // ---------------------------------------------------------------- outcomes
  claimSafe(id, at, ms) {
    const g = this.g;
    if (!g || g.phase !== 'play' || !g.roster.some((r) => r.id === id)) return;
    if (this.claims.some((c) => c.id === id) || resolved({ safe: g.safe, out: g.out }, id)) return;
    this.claims.push({ kind: 'safe', id, at: Number.isFinite(at) ? at : this.game.nowMs(), ms: Number.isFinite(ms) ? ms : this.room.matchNow(), h: 0 });
  }

  claimOut(id, h) {
    const g = this.g;
    if (!g || g.phase !== 'play' || !g.roster.some((r) => r.id === id)) return;
    if (this.claims.some((c) => c.id === id) || resolved({ safe: g.safe, out: g.out }, id)) return;
    this.claims.push({ kind: 'out', id, at: this.game.nowMs(), ms: this.room.matchNow(), h: clamp(Number.isFinite(h) ? h : 0, 0, 200) });
  }

  /** A message from another page: it says what happened to its own player, and only that. `at`: the room's clock; `ms`: the match clock. */
  onMessage(d, from, at, ms) {
    if (!this.acting || !isMap(d) || typeof d.rid !== 'string' || !from) return;
    const g = this.g;
    if (!g || g.by !== this.meId || g.phase !== 'play' || d.rid !== g.rid) return;
    const entry = g.roster.find((r) => r.id === from.id);
    if (!entry || entry.bot) return;
    if (d.t === 'safe') {
      // plausible: they were up near the balloon
      const y = this.room.players.get(from.id)?.presence?.y;
      const ctx = this.game.ctxFor(g);
      if (typeof y !== 'number' || !ctx || y < ctx.tower.goalY - 4) return;
      this.claimSafe(from.id, at, ms);
    } else if (d.t === 'lava') this.claimOut(from.id, d.h);
  }

  // ---------------------------------------------------------------- the bots
  ensureRunner(ctx, g) {
    if (ctx.runner) return ctx.runner;
    const room = this.room;
    const n = g.roster.length;
    const specs = botSpecs(g.roster, room.match.seed, (i) => spawnX(i, n));
    const runner = new BotRunner(ctx.world, ctx.analysis(), specs);
    const t = (room.matchNow() - g.t0) / 1000;
    const b = room.state.b;
    const usable = isMap(b) && b.rid === g.rid && Array.isArray(b.p) && b.p.length === runner.bots.length;
    runner.restore(usable ? b.p : null, t, (id) => (g.safe.includes(id) ? 1 : usable ? -1 : Object.prototype.hasOwnProperty.call(g.out, id) ? 2 : -1));
    ctx.runner = runner;
    return runner;
  }

  /** One fixed step of the bots at round time `t` (host only). */
  stepBots(t) {
    if (!this.acting) return;
    const g = this.g;
    if (!g || g.by !== this.meId || (g.phase !== 'play' && g.phase !== 'fly')) return;
    const ctx = this.game.ctxFor(g);
    if (!ctx) return;
    const events = this.ensureRunner(ctx, g).step(t, PHYS.dt, lavaAt(ctx.base, t, g.ff));
    if (g.phase !== 'play') return;
    for (const e of events) {
      if (e.kind === 'safe') this.claimSafe(e.id, this.game.nowMs(), this.room.matchNow());
      else this.claimOut(e.id, e.h);
    }
  }

  /** Share the bots' positions about 12 times a second. */
  publishBots() {
    if (!this.acting) return;
    const g = this.g;
    if (!g || g.by !== this.meId || (g.phase !== 'play' && g.phase !== 'fly')) return;
    const ctx = this.game.ctxFor(g);
    if (!ctx || !ctx.runner || ctx.runner.bots.length === 0) return;
    const now = this.game.nowMs();
    if (now - this.lastBots < 80) return;
    this.lastBots = now;
    this.room.setState('b', { rid: g.rid, t: Math.round(this.room.matchNow()), p: ctx.runner.snapshot() });
  }
}

// ------------------------------------------------------------------ outside the platform
/** A room with nobody else in it, for when the page is opened on its own: it keeps a match the way the platform's rooms do. */
export function createStubRoom() {
  const listeners = new Map();
  const emit = (e, ...a) => {
    for (const f of listeners.get(e) ?? []) {
      try {
        f(...a);
      } catch (err) {
        console.error(err);
      }
    }
  };
  const me = { id: 'me', name: 'You', presence: null, team: 0 };
  let timer = 0;
  const room = {
    stub: true,
    me,
    players: new Map([['me', me]]),
    host: 'me',
    kind: 'solo',
    connected: true,
    state: {},
    match: { phase: 'lobby', n: 0, min: 1 },
    settings: { rounds: 3, lava: 'normal' },
    isHost: true,
    get online() {
      return [me];
    },
    get participants() {
      return this.match.phase === 'lobby' ? [] : [me];
    },
    spectating: false,
    get running() {
      return this.match.phase === 'playing';
    },
    matchNow() {
      return this.match.phase === 'playing' ? Date.now() - this.match.startedAt : 0;
    },
    isParticipant() {
      return this.match.phase !== 'lobby';
    },
    setReady() {},
    clearReady() {},
    hideLobby() {},
    send() {},
    admit() {},
    privateOf() {
      return {};
    },
    setState(k, v) {
      if (v === null || v === undefined) delete this.state[k];
      else this.state[k] = v;
    },
    setPresence(d) {
      me.presence = d;
    },
    presenceAt(id) {
      return id === 'me' ? me.presence : null;
    },
    setSetting(id, v) {
      if (this.match.phase === 'lobby') this.settings = { ...this.settings, [id]: v };
    },
    on(e, f) {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e).add(f);
      return () => listeners.get(e).delete(f);
    },
    startMatch() {
      if (this.match.phase !== 'lobby') return;
      const n = this.match.n + 1;
      const prev = this.match;
      this.match = { phase: 'starting', n, min: 1, id: `solo${n}`, seed: Math.floor(Math.random() * 4294967296), participants: ['me'], startsAt: Date.now() + 3000 };
      emit('match', this.match, prev);
      emit('starting', this.match);
      timer = setTimeout(() => {
        const before = this.match;
        const { startsAt, ...rest } = before;
        this.match = { ...rest, phase: 'playing', startedAt: Date.now() };
        emit('match', this.match, before);
        emit('matchstart', this.match);
      }, 3000);
    },
    endMatch() {
      clearTimeout(timer);
      if (this.match.phase === 'lobby') return;
      const before = this.match;
      this.match = { phase: 'lobby', n: before.n, min: 1 };
      this.state = {};
      emit('match', this.match, before);
      emit('matchend', this.match, before);
    },
  };
  return room;
}
