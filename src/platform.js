// The one place that touches window.onceworlds. Outside the platform (poster mode, tests, a plain
// static server) a stand-in gives a solo room with the same match lifecycle, saves in memory, and
// never throws into the frame loop.

function makeEmitter() {
  const map = new Map();
  return {
    on(ev, fn) {
      if (!map.has(ev)) map.set(ev, new Set());
      map.get(ev).add(fn);
      return () => map.get(ev)?.delete(fn);
    },
    emit(ev, ...args) {
      for (const fn of map.get(ev) || []) {
        try {
          fn(...args);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}

function standaloneRoom(player) {
  const em = makeEmitter();
  const me = { id: player.id, name: player.name, presence: null, team: 0, connected: true, ready: false, idle: false };
  let n = 0;
  let started = 0;
  let paused = 0;
  let pausedAt = 0;
  const room = {
    id: 'solo', kind: 'solo', invite: null, teams: 0, open: true, me, players: new Map([[me.id, me]]), state: {}, host: me.id, closed: false,
    connected: true, settings: {}, match: { phase: 'lobby', n: 0, id: '', min: 1, participants: [], seed: 1 }, private: {},
    get isHost() {
      return !room.closed;
    },
    get online() {
      return [me];
    },
    get participants() {
      return room.match.phase === 'lobby' ? [] : [me];
    },
    get spectators() {
      return [];
    },
    get leftOut() {
      return [];
    },
    get spectating() {
      return false;
    },
    get running() {
      return room.match.phase === 'playing' && !paused;
    },
    get canStart() {
      return room.match.phase === 'lobby';
    },
    get allReady() {
      return true;
    },
    get notReady() {
      return [];
    },
    isParticipant: () => room.match.phase !== 'lobby',
    matchNow: () => (started ? (paused ? pausedAt : Date.now()) - started : 0),
    send() {},
    setPresence(d) {
      me.presence = d;
    },
    presenceAt: (id) => room.players.get(id)?.presence ?? null,
    setState(k, v) {
      if (v === null || v === undefined) delete room.state[k];
      else room.state[k] = v;
      em.emit('state', k, v, me.id);
    },
    setPrivate(k, v) {
      if (v === null || v === undefined) delete room.private[k];
      else room.private[k] = v;
    },
    setPrivateFor() {},
    privateOf: () => ({}),
    setTeam() {},
    setOpen(o) {
      room.open = Boolean(o);
    },
    setSetting() {},
    hideLobby() {},
    setReady(r) {
      me.ready = Boolean(r);
    },
    clearReady() {
      me.ready = false;
    },
    admit() {},
    kick() {},
    voteKick() {},
    transferHost() {},
    reportResult() {},
    startMatch() {
      if (room.match.phase !== 'lobby') return;
      n++;
      started = Date.now();
      paused = 0;
      room.match = { phase: 'playing', n, id: `solo${n}`, min: 1, participants: [me.id], startedAt: started, seed: (Math.random() * 1e9) >>> 0, paused: false };
      em.emit('match', room.match);
      em.emit('matchstart', room.match);
    },
    endMatch() {
      if (room.match.phase === 'lobby') return;
      const previous = room.match;
      started = 0;
      room.match = { phase: 'lobby', n, id: previous.id, min: 1, participants: [], seed: previous.seed };
      em.emit('match', room.match, previous);
      em.emit('matchend', room.match, previous);
    },
    pauseMatch(p = true) {
      if (room.match.phase !== 'playing') return;
      if (p && !paused) {
        paused = 1;
        pausedAt = Date.now();
        room.match.paused = true;
        em.emit('matchpause', room.match);
      } else if (!p && paused) {
        started += Date.now() - pausedAt;
        paused = 0;
        room.match.paused = false;
        em.emit('matchresume', room.match);
      }
    },
    leave() {
      room.closed = true;
      em.emit('close', 'left');
    },
    on: em.on,
  };
  return room;
}

const memory = new Map();

function standalone() {
  const player = { id: 'local', name: 'Keeper', guest: true };
  const em = makeEmitter();
  let room = null;
  const settings = { quality: 'high', scale: 1, choice: 'auto', reducedMotion: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), pixelRatio: (max = 2) => Math.min(globalThis.devicePixelRatio || 1, max), on: () => () => {} };
  return {
    mode: 'standalone',
    player: { get: async () => player, rename: async () => null, avatarUrl: async () => null },
    env: {},
    save: {
      get: async (k) => (memory.has(k) ? JSON.parse(memory.get(k)) : null),
      set: async (k, v) => void memory.set(k, JSON.stringify(v)),
      delete: async (k) => void memory.delete(k),
      list: async () => [...memory.keys()],
    },
    badges: { award: async () => false, list: async () => [], has: async () => false },
    leaderboards: { submit: async () => null, top: async () => ({ entries: [], me: null }) },
    now: () => Date.now(),
    controls: { set() {}, stick: { x: 0, y: 0 }, pressed: () => false, touch: typeof location !== 'undefined' && /[?&]touch\b/.test(location.search) },
    ui: { setOrientation() {}, showInvite() {}, requestFullscreen() {}, setMenuPosition() {} },
    settings,
    rooms: {
      join: async () => {
        room = standaloneRoom(player);
        return room;
      },
      get current() {
        return room;
      },
      on: () => () => {},
    },
    on: em.on,
    emit: em.emit,
  };
}

const raw = typeof window !== 'undefined' && window.onceworlds && typeof window.onceworlds.rooms?.join === 'function' ? window.onceworlds : null;
export const ow = raw || standalone();
export const onPlatform = Boolean(raw);

/** Calls an SDK method and never throws; returns `fallback` on any failure. */
export function safe(fn, fallback) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.catch(() => fallback);
    return r;
  } catch {
    return fallback;
  }
}

export const now = () => safe(() => ow.now(), Date.now()) || Date.now();

export const settings = {
  get quality() {
    return safe(() => ow.settings.quality, 'high') || 'high';
  },
  get choice() {
    return safe(() => ow.settings.choice, 'auto') || 'auto';
  },
  get reducedMotion() {
    return Boolean(safe(() => ow.settings.reducedMotion, false));
  },
  pixelRatio(max = 2) {
    const v = safe(() => ow.settings.pixelRatio(max), null);
    return Number.isFinite(v) && v > 0 ? v : Math.min(globalThis.devicePixelRatio || 1, max);
  },
  onChange(fn) {
    return safe(() => ow.settings.on('change', fn), () => {}) || (() => {});
  },
};

export const controls = {
  set(cfg) {
    safe(() => ow.controls.set(cfg));
  },
  get stick() {
    const s = safe(() => ow.controls.stick, null);
    return s && Number.isFinite(s.x) && Number.isFinite(s.y) ? s : { x: 0, y: 0 };
  },
  pressed(id) {
    return Boolean(safe(() => ow.controls.pressed(id), false));
  },
  get touch() {
    return Boolean(safe(() => ow.controls.touch, false));
  },
};

export const saves = {
  async get(key) {
    return safe(() => ow.save.get(key), null);
  },
  async set(key, value) {
    return safe(() => ow.save.set(key, value), null);
  },
};

export const badges = {
  award(id) {
    return safe(() => ow.badges.award(id), false);
  },
};

export const leaderboards = {
  submit(name, score, opts) {
    if (!Number.isFinite(score)) return Promise.resolve(null);
    return safe(() => ow.leaderboards.submit(name, Math.round(score), opts), null);
  },
};

export const ui = {
  showInvite() {
    safe(() => ow.ui.showInvite());
  },
};

export const player = {
  async get() {
    const p = await safe(() => ow.player.get(), null);
    return p && typeof p === 'object' ? { id: String(p.id ?? 'local'), name: String(p.name ?? 'Keeper').slice(0, 24), guest: Boolean(p.guest) } : { id: 'local', name: 'Keeper', guest: true };
  },
  avatarUrl(id, kind = 'head') {
    return safe(() => ow.player.avatarUrl(id, kind), null);
  },
};

export function onPlatformEvent(ev, fn) {
  return safe(() => ow.on(ev, fn), () => {}) || (() => {});
}
