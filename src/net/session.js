// The room, the match and who runs the night. The host's page steps the simulation on the match
// clock and broadcasts snapshots; everyone else steps a local copy between snapshots and sends
// commands. The season lives in room state (mirrored to the save); the night record names the seed,
// the weather and the clock base, so a new host, a reload or a latecomer can rebuild the night.
import { ow, saves, now, onPlatform } from '../platform.js';
import { createNight, stepNight, addCrew, removeCrew, hydrate, STATIONS, TICK } from '../sim/night.js';
import { applyCommand } from '../sim/verbs.js';
import { nightConfig, endNight, cleanSeason, cleanLedger } from '../sim/season.js';
import { computeMods } from '../sim/modifiers.js';
import { WEATHER } from '../sim/data/weather.js';

export const JOIN_OPTS = { private: true, maxPlayers: 4, minPlayers: 1, lobby: 'bar' };
const SNAP_HZ = 8;
const MAX_STEPS_PER_FRAME = 12;
const STRIP = new Set(['route', 'tl', 'fx', 'log', 'mods', 'weather']);

function pack(state) {
  // Floats to two decimals; static parts, ships already home or lost and things already gone left out: 2-9 KB.
  return JSON.stringify(state, (k, v) => {
    if (STRIP.has(k)) return undefined;
    if (k === 'ships' && Array.isArray(v)) return v.filter((s) => s.st !== 'saved' && s.st !== 'lost');
    if (k === 'hostiles' && Array.isArray(v)) return v.filter((h) => h.st !== 'gone');
    return typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
  });
}

// Effects that only the host can decide (a radio roll): a page plays these from the host's snapshot, never from
// its own prediction. Everything else a page did itself it has already heard, so the echo is skipped.
const HOST_DECIDES = new Set(['radio-ok', 'radio-fail', 'radio-dead', 'engine']);
const FX_TEXT = ['k', 'name', 'type', 'id', 'lens', 'mode', 'what', 'order', 'result', 'why', 'st', 'to', 'from', 'by'];
const FX_NUM = ['coins', 'n', 'x', 'z', 'tx', 'tz', 'level', 'phase', 'near', 'at', 'on', 'lensInt'];

/** An effect from another page, reduced to known fields of the right types (it only feeds sound, toasts and kicks). */
export function cleanFx(fx) {
  if (!fx || typeof fx !== 'object' || typeof fx.k !== 'string') return null;
  const out = {};
  for (const k of FX_TEXT) if (typeof fx[k] === 'string') out[k] = fx[k].slice(0, 40);
  for (const k of FX_NUM) if (Number.isFinite(fx[k])) out[k] = Math.max(-1e5, Math.min(1e5, fx[k]));
  return out;
}

const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** A snapshot from another page: checked for shape and bounds before it becomes the night. */
function unpack(json, record, previous) {
  let s;
  if (json && typeof json === 'object') s = json;
  else {
    try {
      s = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.ships) || !Array.isArray(s.hostiles) || !s.beam || !s.res || !s.crew) return null;
  if (s.ships.length > 40 || s.hostiles.length > 24 || (s.pools?.length || 0) > 12 || (s.crates?.length || 0) > 30 || (s.shots?.length || 0) > 12) return null;
  for (const k of ['pools', 'crates', 'shots']) if (s[k] !== undefined && !Array.isArray(s[k])) return null;
  for (const list of [s.ships, s.hostiles, s.pools || [], s.crates || [], s.shots || []]) if (list.some((x) => !x || typeof x !== 'object')) return null;
  s.mods = previous?.mods || record.mods;
  // The record names the weather by id; the night needs the weather itself (storm, rain, fog), or every guest's
  // sea, fog and drift turn to NaN.
  s.weather = previous?.weather && typeof previous.weather === 'object' ? previous.weather : WEATHER[record.weather] || WEATHER.clear;
  s.route = previous?.route || null;
  s.tl = null;
  s.log = previous?.log || [];
  s.fx = [];
  s.pools = s.pools || [];
  s.crates = s.crates || [];
  s.shots = s.shots || [];
  s.pending = s.pending || [];
  s.evMut = s.evMut || {};
  s.barked = s.barked || [];
  s.flags = s.flags || {};
  s.stats = s.stats || previous?.stats || {};
  s.t = num(s.t, 0, 3600, 0);
  s.tick = num(s.tick, 0, 1e6, 0);
  s.steps = num(s.steps, 0, 1e6, 0);
  s.res.oil = num(s.res.oil, 0, 1000, 0);
  s.res.power = num(s.res.power, 0, 100, 0);
  s.res.integ = num(s.res.integ, 0, 100, 0);
  s.res.rep = num(s.res.rep, -1, 100, 0);
  s.beam.r = num(s.beam.r, 6, 40, 20);
  s.beam.dist = num(s.beam.dist, 18, 420, 90);
  s.beam.az = num(s.beam.az, -7, 7, 0);
  s.beam.heat = num(s.beam.heat, 0, 100, 0);
  for (const sh of s.ships) {
    sh.s = num(sh.s, 0, 2000, 0);
    sh.d = num(sh.d, -200, 200, 0);
    sh.name = String(sh.name || '').slice(0, 24);
  }
  for (const p of s.pools) {
    p.x = num(p.x, -500, 500, 0);
    p.z = num(p.z, -500, 500, 0);
    p.r = num(p.r, 1, 80, 28);
    p.I = num(p.I, 0, 4, 0.8);
    p.life = num(p.life, 0, 60, 0);
  }
  for (const c of s.crates) {
    c.x = num(c.x, -500, 500, 0);
    c.z = num(c.z, -500, 500, 0);
    c.lit = num(c.lit, 0, 10, 0);
    c.life = num(c.life, 0, 1e4, 0);
  }
  for (const sh of s.shots) {
    sh.x = num(sh.x, -500, 500, 0);
    sh.z = num(sh.z, -500, 500, 0);
    sh.life = num(sh.life, 0, 2, 0);
  }
  for (const h of s.hostiles) {
    h.x = num(h.x, -500, 500, 0);
    h.z = num(h.z, -500, 500, 0);
    if (h.type === 'drowned' && !Array.isArray(h.b)) h.b = [];
    if (h.type === 'wraith' && !Array.isArray(h.holes)) h.holes = [];
    if (h.type === 'titan' && !Array.isArray(h.lures)) h.lures = [];
  }
  if (!s.stations) s.stations = { lantern: null, gallery: null, watch: null, cellar: null };
  hydrate(s);
  return s;
}

export class Session {
  constructor(handlers) {
    this.h = handlers; // { onPhase, onFx, onToast, onSeason, onClosed, onNight, onLedger }
    this.room = null;
    this.me = null;
    this.state = null; // the night I draw (host: authoritative; others: the latest snapshot stepped locally)
    this.record = null; // the night record from room state
    this.season = null;
    this.role = 'none';
    this.lastSnapAt = 0;
    this.fxBuffer = [];
    this.snapTimer = 0;
    this.localBeamUntil = 0;
    this.seasonDirty = 0;
    this.closed = null;
    this.unsub = [];
    this.behind = 0;
    this.joinedAt = 0;
    this.nightOverHandled = false;
    this.presence = { ph: 'title', st: 'lantern' };
    this.presenceTimer = 0;
    this.awaitingSnapshot = false;
    this.speed = 1;
  }

  /** Joins the platform's room (or, for tests, whatever `makeRoom` returns). */
  async join(makeRoom = null) {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.closed = null;
    const room = await (makeRoom ? makeRoom() : ow.rooms.join(JOIN_OPTS));
    this.room = room;
    this.me = room.me;
    this.joinedAt = now();
    const on = (ev, fn) => this.unsub.push(room.on(ev, (...a) => {
      try {
        fn(...a);
      } catch (e) {
        console.error(e);
      }
    }));
    on('matchstart', () => this.onMatchStart());
    on('match', () => {
      if (this.isHost && this.state && room.match.phase !== 'lobby' && this.state.mid === room.match.id) this.seatCrew();
    });
    on('matchend', () => this.onMatchEnd());
    on('matchpause', () => this.h.onToast?.('Waiting for players'));
    on('matchresume', () => {});
    on('host', () => this.onHostChange());
    on('state', (key, value) => this.onState(key, value));
    on('message', (data, from) => this.onMessage(data, from));
    on('join', (p) => this.onJoin(p));
    on('leave', (p) => this.onLeave(p));
    on('back', (p, fresh) => this.onBack(p, fresh));
    on('close', (reason) => {
      this.closed = reason;
      this.h.onClosed?.(reason);
    });
    on('starting', () => {
      // Friends may still drop in: a private match closes to newcomers unless the game opens it.
      if (room.isHost) this.safe(() => room.setOpen(true));
    });
    this.season = this.validSeason(room.state.season) || null;
    this.record = this.validRecord(room.state.night);
    // A page arriving into a running night waits for the host's snapshot (or restarts it when it is the host).
    if (room.match && room.match.phase !== 'lobby') this.onMatchStart(true);
    return room;
  }

  get isHost() {
    return Boolean(this.room && this.room.isHost && this.room.connected && !this.closed);
  }

  safe(fn) {
    try {
      return fn();
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  validSeason(s) {
    return cleanSeason(s);
  }

  validRecord(r) {
    if (!r || typeof r !== 'object' || typeof r.mid !== 'string' || !Number.isFinite(r.seed) || !Number.isFinite(r.night)) return null;
    if (!WEATHER[r.weather] || !r.mods || typeof r.mods !== 'object') return null;
    return r;
  }

  // ---- Season in room state and the save.
  setSeason(season, { save = true } = {}) {
    this.season = season;
    if (this.isHost) this.safe(() => this.room.setState('season', season));
    if (save) this.seasonDirty = 1;
    this.h.onSeason?.(season);
  }

  /** A season belongs to the keeper who began it: a friend's tower never overwrites the run in your own save. */
  mine(season) {
    return Boolean(season) && (!season.owner || !this.me || season.owner === this.me.id);
  }

  flushSeason() {
    if (!this.seasonDirty || !this.season) return;
    this.seasonDirty = 0;
    if (this.mine(this.season) && !this.season.daily) saves.set('season', this.season);
  }

  onState(key, value) {
    if (key === 'season') {
      const s = this.validSeason(value);
      if (s && !this.isHost) {
        this.season = s;
        this.seasonDirty = 1;
        this.h.onSeason?.(s);
      }
    } else if (key === 'night') {
      const r = this.validRecord(value);
      if (r) this.record = r;
    } else if (key === 'ledger') {
      const ledger = cleanLedger(value);
      if (ledger && !this.isHost) this.h.onLedger?.(ledger);
    }
  }

  /** The ledger in room state when it closes this match's night (the night is over, only the morning is left). */
  finishedLedger() {
    const ledger = cleanLedger(this.room?.state?.ledger);
    return ledger && ledger.mid && this.room.match && ledger.mid === this.room.match.id ? ledger : null;
  }

  // ---- The match: a night.
  onMatchStart(late = false) {
    const room = this.room;
    const match = room.match;
    this.nightOverHandled = false;
    this.fxBuffer.length = 0;
    this.record = this.validRecord(room.state.night);
    const mine = this.record && this.record.mid === match.id;
    const done = late ? this.finishedLedger() : null;
    if (done) {
      // The night is already in the ledger: a reload here must not play it (or pay it) a second time.
      this.role = this.isHost ? 'host' : room.spectating ? 'watch' : 'client';
      this.state = null;
      this.awaitingSnapshot = false;
      this.nightOverHandled = true;
      this.h.onLedger?.(done);
      return;
    }
    if (this.isHost) {
      if (mine && this.state && this.state.mid === match.id) {
        // Still the host of a night this page already runs.
      } else if (mine && late) {
        // Back as the host with nothing in memory: the night restarts from its dusk.
        this.state = this.buildNight(this.record);
        this.record = { ...this.record, base: room.matchNow(), by: this.me.id };
        this.safe(() => room.setState('night', this.record));
        this.h.onToast?.('The night starts over');
      } else if (!mine) {
        if (!this.season) return;
        const cfg = nightConfig(this.season);
        this.record = { mid: match.id, seed: cfg.seed, night: cfg.night, weather: cfg.weather, mods: computeMods(cfg.season), site: cfg.season.site, base: room.matchNow(), by: this.me.id };
        this.state = this.buildNight(this.record);
        this.safe(() => room.setState('night', this.record));
        this.safe(() => room.setState('ledger', null));
      }
      this.role = 'host';
      this.seatCrew();
      this.sendSnapshot();
    } else {
      this.role = room.spectating ? 'watch' : 'client';
      if (!(this.state && this.state.mid === match.id)) {
        this.state = null;
        this.awaitingSnapshot = true;
      }
    }
    this.h.onNight?.(this.state, this.role);
  }

  buildNight(record) {
    const season = this.season || {};
    const state = createNight({ seed: record.seed, night: record.night, season: { ...(season.keeper ? { keeper: season.keeper, site: record.site || season.site, asc: season.asc, upgrades: season.upgrades, relics: season.relics, charter: season.charter, almanacRead: season.almanacRead, mutators: season.mutators, rep: season.rep } : { site: record.site }), rep: season.rep }, weather: record.weather });
    state.mods = record.mods;
    state.mid = record.mid;
    return state;
  }

  /** The host seats every participant who is connected; stations come from their presence or fill in order. */
  seatCrew() {
    const room = this.room;
    const st = this.state;
    if (!st) return;
    const parts = room.participants || [];
    const taken = new Set(Object.values(st.stations).filter(Boolean));
    for (const p of parts) {
      if (st.crew[p.id] || p.connected === false) continue;
      const want = p.presence && STATIONS.includes(p.presence.st) ? p.presence.st : null;
      const free = STATIONS.find((s) => !Object.values(st.crew).some((c) => c.st === s));
      addCrew(st, p.id, want && !taken.has(want) ? want : free || 'lantern');
      taken.add(st.crew[p.id].st);
    }
    for (const id of Object.keys(st.crew)) if (!parts.some((p) => p.id === id)) removeCrew(st, id);
  }

  onJoin(p) {
    if (!this.isHost || !this.state) return;
    // Latecomers may take a seat during dusk; later they watch until the next night.
    if (this.state.phase === 'dusk') this.safe(() => this.room.admit([p.id]));
    this.seatCrew();
    this.sendSnapshot(p.id);
  }

  onLeave(p) {
    if (this.isHost && this.state) removeCrew(this.state, p.id);
  }

  onBack(p, fresh) {
    if (this.isHost && this.state && fresh) this.sendSnapshot(p.id);
  }

  onHostChange() {
    const room = this.room;
    if (this.finishedLedger()) this.nightOverHandled = true;
    if (this.isHost && room.match.phase !== 'lobby') {
      // A watcher must not run a night it is not in: hand it to someone who is.
      if (room.spectating) {
        const inside = (room.participants || []).find((p) => p.connected !== false && p.id !== this.me.id);
        if (inside) {
          this.safe(() => room.transferHost(inside.id));
          return;
        }
        this.safe(() => room.endMatch());
        return;
      }
      this.role = 'host';
      if (this.state && this.state.mid === room.match.id) {
        this.record = { ...(this.record || {}), base: room.matchNow() - this.state.steps * TICK * 1000, by: this.me.id };
        this.safe(() => room.setState('night', this.record));
      } else if (this.record && this.record.mid === room.match.id) {
        this.state = this.buildNight(this.record);
        this.record = { ...this.record, base: room.matchNow(), by: this.me.id };
        this.safe(() => room.setState('night', this.record));
        this.h.onToast?.('The night starts over');
      }
      this.seatCrew();
      this.h.onNight?.(this.state, this.role);
    } else if (this.isHost) {
      this.role = 'host';
      if (this.season) this.safe(() => room.setState('season', this.season));
    } else if (room.match.phase !== 'lobby') {
      this.role = room.spectating ? 'watch' : 'client';
    }
    this.h.onRole?.(this.isHost);
  }

  onMatchEnd() {
    this.state = null;
    this.record = null;
    this.role = 'none';
    this.awaitingSnapshot = false;
    this.h.onNight?.(null, 'none');
    this.h.onPhase?.('lobby');
  }

  // ---- Messages.
  onMessage(data, from) {
    if (!data || typeof data !== 'object') return;
    if (data.t === 'cmd') {
      if (!this.isHost || !this.state || !from) return;
      if (!data.c || typeof data.c !== 'object') return;
      if (data.c.k === 'light' && from.id !== this.room.host) return;
      this.state.fx.length = 0;
      applyCommand(this.state, data.c, from.id);
      for (const fx of this.state.fx) {
        fx.by = from.id;
        this.fxBuffer.push(fx);
        this.h.onFx?.(fx, this.state);
      }
      this.state.fx.length = 0;
      if (this.fxBuffer.length > 120) this.fxBuffer.splice(0, this.fxBuffer.length - 120);
    } else if (data.t === 'snap') {
      if (this.isHost || !from || from.id !== this.room.host) return; // only the host's snapshots count
      if (!data.s || (typeof data.s !== 'string' && typeof data.s !== 'object') || (typeof data.s === 'string' && data.s.length > 60000)) return;
      const record = this.record && this.record.mid === this.room.match.id ? this.record : this.validRecord(this.room.state.night);
      if (!record || record.mid !== this.room.match.id) return;
      this.record = record;
      const s = unpack(data.s, record, this.state);
      if (!s) return;
      if (data.mid !== record.mid) return;
      s.mid = record.mid;
      // Keep my own aim for a moment after I moved it, so the beam doesn't jump back.
      if (this.state && now() < this.localBeamUntil && this.state.stations.lantern === this.me.id) {
        s.beam.az = this.state.beam.az;
        s.beam.dist = this.state.beam.dist;
        s.beam.r = this.state.beam.r;
      }
      if (this.state && this.state.log) s.log = this.state.log;
      this.state = s;
      this.awaitingSnapshot = false;
      this.lastSnapAt = now();
      if (Array.isArray(data.fx)) for (const raw of data.fx.slice(0, 60)) {
        const fx = cleanFx(raw);
        if (!fx || (fx.by === this.me.id && !HOST_DECIDES.has(fx.k))) continue;
        this.safe(() => this.h.onFx?.(fx, this.state));
      }
      this.h.onNight?.(this.state, this.role);
    }
  }

  sendSnapshot(to = null) {
    if (!this.isHost || !this.state) return;
    // Sent as an object, not a string inside the message: no escaped quotes, a third smaller on the wire.
    const msg = { t: 'snap', mid: this.state.mid, s: JSON.parse(pack(this.state)), fx: to ? [] : this.fxBuffer.splice(0, 60) };
    this.safe(() => (to ? this.room.send(msg, { to }) : this.room.send(msg)));
    if (!to) this.fxBuffer.length = 0;
  }

  /** A command from my own keeper. The host applies it; everyone else asks the host. */
  command(cmd) {
    if (!this.state || this.role === 'watch' || this.role === 'none') return false;
    if (this.isHost) {
      const ok = applyCommand(this.state, cmd, this.me.id);
      if (ok) for (const fx of this.state.fx) {
        this.fxBuffer.push(fx);
        this.h.onFx?.(fx, this.state);
      }
      this.state.fx.length = 0;
      return ok;
    }
    this.state.fx.length = 0;
    const ok = applyCommand(this.state, cmd, this.me.id);
    for (const fx of this.state.fx) if (!HOST_DECIDES.has(fx.k)) this.h.onFx?.(fx, this.state);
    this.state.fx.length = 0;
    if (cmd.k === 'beam') this.localBeamUntil = now() + 400;
    if (cmd.on === true) {
      // A held verb: one message every 200 ms keeps the host's hold alive.
      const t = now();
      this.holdSent = this.holdSent || {};
      if (this.holdSent[cmd.k] && t - this.holdSent[cmd.k] < 200) return ok;
      this.holdSent[cmd.k] = t;
    }
    this.safe(() => this.room.send({ t: 'cmd', c: cmd }, { to: this.room.host }));
    return ok;
  }

  // ---- The frame.
  update(dt) {
    const room = this.room;
    if (!room || this.closed) return [];
    this.presenceTimer += dt;
    if (this.presenceTimer > 0.5) {
      this.presenceTimer = 0;
      this.safe(() => room.setPresence(this.presence));
    }
    this.flushTimer = (this.flushTimer || 0) + dt;
    if (this.flushTimer > 3) {
      this.flushTimer = 0;
      this.flushSeason();
    }
    const st = this.state;
    if (!st || room.match.phase === 'lobby') return [];
    if (!room.running) return [];
    const fx = [];
    if (this.isHost) {
      const base = this.record?.base || 0;
      const clock = () => (room.matchNow() - (this.record?.base || 0)) * this.speed;
      const target = Math.floor(clock() / (TICK * 1000));
      let steps = 0;
      if (target - st.steps > 60) {
        // A hidden tab came back: don't live those seconds at once, skip them.
        this.record = { ...this.record, base: room.matchNow() - ((st.steps + 1) * TICK * 1000) / this.speed };
        this.safe(() => room.setState('night', this.record));
      }
      while (st.steps < Math.floor(clock() / (TICK * 1000)) && steps++ < MAX_STEPS_PER_FRAME * this.speed && st.phase !== 'over') {
        stepNight(st, TICK);
        for (const f of st.fx) {
          fx.push(f);
          this.fxBuffer.push(f);
        }
      }
      this.snapTimer += dt;
      if (this.snapTimer >= 1 / SNAP_HZ) {
        this.snapTimer = 0;
        this.sendSnapshot();
      }
      if (st.phase === 'over' && !this.nightOverHandled) {
        this.nightOverHandled = true;
        this.sendSnapshot();
        this.closeNight();
      }
    } else {
      // Step the copy between snapshots, at most a little ahead of real time.
      this.behind += dt;
      let steps = 0;
      while (this.behind >= TICK && steps++ < 4 && st.phase !== 'over') {
        this.behind -= TICK;
        stepNight(st, TICK);
      }
      if (this.behind > 1) this.behind = 0;
    }
    return fx;
  }

  /** The host closes the night: the ledger goes to room state, then the night-over screen. */
  closeNight() {
    if (!this.isHost || !this.state || !this.season) return;
    if (this.finishedLedger()) return; // a host before me already closed this night
    const ledger = endNight(this.season, this.state);
    ledger.mid = this.state.mid;
    this.setSeason(this.season);
    this.safe(() => this.room.setState('ledger', ledger));
    this.h.onLedger?.(ledger);
  }

  morning() {
    if (!this.isHost) return;
    this.safe(() => this.room.endMatch());
  }

  startNight() {
    if (!this.isHost) return false;
    return this.safe(() => (this.room.canStart ? (this.room.startMatch(), true) : false)) || false;
  }

  setPresence(fields) {
    Object.assign(this.presence, fields);
  }
}

export { onPlatform, pack, unpack, cleanLedger };
