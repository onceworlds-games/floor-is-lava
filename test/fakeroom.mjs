// A stand-in for the platform's room, shared by several pages in one process: messages are routed,
// state is shared, the host moves when the host drops, the match keeps its clock. Enough to run
// three Session instances through a night and the things that go wrong in real play.
export class FakeServer {
  constructor() {
    this.pages = new Map(); // id -> page { id, name, room, connected, presence, ready }
    this.state = {};
    this.host = null;
    this.match = { phase: 'lobby', n: 0, id: '', min: 1, participants: [], seed: 7, paused: false };
    this.started = 0;
    this.pausedAt = 0;
    this.paused = false;
    this.open = true;
  }

  now() {
    return Date.now();
  }

  matchNow() {
    if (!this.started) return 0;
    return (this.paused ? this.pausedAt : this.now()) - this.started;
  }

  join(id, name) {
    let page = this.pages.get(id);
    const fresh = !page;
    if (!page) {
      page = { id, name, connected: true, presence: null, ready: false, room: null, listeners: new Map() };
      this.pages.set(id, page);
    } else page.connected = true;
    if (!this.host || !this.pages.get(this.host)?.connected) this.host = id;
    page.room = this.makeRoom(page);
    for (const other of this.pages.values()) if (other !== page && other.connected) this.emit(other, fresh ? 'join' : 'back', this.playerOf(page), !fresh);
    this.checkPause();
    return page.room;
  }

  playerOf(page) {
    return { id: page.id, name: page.name, presence: page.presence, team: 0, connected: page.connected, ready: page.ready };
  }

  emit(page, ev, ...args) {
    for (const fn of page.listeners.get(ev) || []) fn(...args);
  }

  broadcast(ev, ...args) {
    for (const page of this.pages.values()) if (page.connected) this.emit(page, ev, ...args);
  }

  /** The connection drops: the seat is held; the host role moves at once. */
  drop(id) {
    const page = this.pages.get(id);
    page.connected = false;
    page.room.connected = false;
    this.emit(page, 'disconnect');
    for (const other of this.pages.values()) if (other !== page && other.connected) this.emit(other, 'away', this.playerOf(page));
    if (this.host === id) {
      const next = [...this.pages.values()].find((p) => p.connected && (this.match.phase === 'lobby' || this.match.participants.includes(p.id))) || [...this.pages.values()].find((p) => p.connected);
      if (next) {
        this.host = next.id;
        this.broadcast('host', this.host);
      }
    }
    this.checkPause();
  }

  /** Back on the same page (not a reload). */
  reconnect(id) {
    const page = this.pages.get(id);
    page.connected = true;
    page.room.connected = true;
    this.emit(page, 'reconnect');
    this.emit(page, 'host', this.host); // the platform replays what changed while the page was away
    for (const other of this.pages.values()) if (other !== page && other.connected) this.emit(other, 'back', this.playerOf(page), false);
    this.checkPause();
  }

  leave(id) {
    const page = this.pages.get(id);
    this.pages.delete(id);
    for (const other of this.pages.values()) if (other.connected) this.emit(other, 'leave', this.playerOf(page), false);
    if (this.host === id) {
      const next = [...this.pages.values()].find((p) => p.connected);
      if (next) {
        this.host = next.id;
        this.broadcast('host', this.host);
      }
    }
    this.checkPause();
  }

  checkPause() {
    if (this.match.phase !== 'playing') return;
    const inside = this.match.participants.filter((id) => this.pages.get(id)?.connected).length;
    if (inside < this.match.min && !this.paused) {
      this.paused = true;
      this.pausedAt = this.now();
      this.match.paused = true;
      this.broadcast('matchpause', this.match);
    } else if (inside >= this.match.min && this.paused) {
      this.started += this.now() - this.pausedAt;
      this.paused = false;
      this.match.paused = false;
      this.broadcast('matchresume', this.match);
    }
  }

  makeRoom(page) {
    const server = this;
    const room = {
      id: 'fake', kind: 'private', invite: null, teams: 0, closed: false, connected: true, settings: {}, private: {},
      me: this.playerOf(page),
      get host() {
        return server.host;
      },
      get isHost() {
        return server.host === page.id && room.connected;
      },
      get players() {
        return new Map([...server.pages.values()].map((p) => [p.id, server.playerOf(p)]));
      },
      get online() {
        return [...server.pages.values()].filter((p) => p.connected).map((p) => server.playerOf(p));
      },
      get state() {
        return server.state;
      },
      get match() {
        return server.match;
      },
      get participants() {
        return server.match.phase === 'lobby' ? [] : server.match.participants.map((id) => server.playerOf(server.pages.get(id) || { id, name: id, connected: false }));
      },
      get spectators() {
        return room.online.filter((p) => server.match.phase !== 'lobby' && !server.match.participants.includes(p.id));
      },
      get leftOut() {
        return [];
      },
      get spectating() {
        return server.match.phase !== 'lobby' && !server.match.participants.includes(page.id);
      },
      get running() {
        return server.match.phase === 'playing' && !server.paused;
      },
      get canStart() {
        return room.isHost && server.match.phase === 'lobby';
      },
      get allReady() {
        return true;
      },
      get notReady() {
        return [];
      },
      isParticipant: (id = page.id) => server.match.phase !== 'lobby' && server.match.participants.includes(id),
      matchNow: () => server.matchNow(),
      on(ev, fn) {
        if (!page.listeners.has(ev)) page.listeners.set(ev, new Set());
        page.listeners.get(ev).add(fn);
        return () => page.listeners.get(ev).delete(fn);
      },
      send(data, opts = {}) {
        const payload = JSON.parse(JSON.stringify(data));
        const from = server.playerOf(page);
        for (const other of server.pages.values()) {
          if (other === page || !other.connected) continue;
          if (opts.to && other.id !== opts.to) continue;
          server.emit(other, 'message', payload, from, server.now(), server.matchNow());
        }
      },
      setPresence(d) {
        page.presence = JSON.parse(JSON.stringify(d));
      },
      presenceAt: (id) => server.pages.get(id)?.presence ?? null,
      setState(k, v) {
        if (v === null || v === undefined) delete server.state[k];
        else server.state[k] = JSON.parse(JSON.stringify(v));
        for (const other of server.pages.values()) if (other !== page && other.connected) server.emit(other, 'state', k, server.state[k], page.id);
      },
      setPrivate() {},
      setPrivateFor() {},
      privateOf: () => ({}),
      setTeam() {},
      setOpen(o) {
        server.open = Boolean(o);
      },
      setSetting() {},
      hideLobby() {},
      setReady(r) {
        page.ready = Boolean(r);
      },
      clearReady() {
        for (const p of server.pages.values()) p.ready = false;
      },
      admit(ids) {
        for (const id of [].concat(ids)) if (!server.match.participants.includes(id)) server.match.participants.push(id);
        server.broadcast('match', server.match);
      },
      kick() {},
      voteKick() {},
      transferHost(id) {
        if (server.pages.get(id)?.connected) {
          server.host = id;
          server.broadcast('host', id);
        }
      },
      reportResult() {},
      startMatch() {
        if (!room.isHost || server.match.phase !== 'lobby') return;
        server.match = { phase: 'playing', n: server.match.n + 1, id: `m${server.match.n + 1}`, min: 1, participants: [...server.pages.values()].filter((p) => p.connected && (p.ready || p.id === server.host)).map((p) => p.id), seed: 7, paused: false };
        server.started = server.now();
        server.paused = false;
        for (const p of server.pages.values()) p.ready = false;
        server.broadcast('match', server.match);
        server.broadcast('matchstart', server.match);
      },
      endMatch() {
        if (!room.isHost || server.match.phase === 'lobby') return;
        const prev = server.match;
        server.match = { phase: 'lobby', n: prev.n, id: prev.id, min: 1, participants: [], seed: 7, paused: false };
        server.started = 0;
        server.broadcast('match', server.match, prev);
        server.broadcast('matchend', server.match, prev);
      },
      pauseMatch() {},
      leave() {
        room.closed = true;
        server.leave(page.id);
      },
    };
    return room;
  }
}
