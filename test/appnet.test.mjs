// The real main.js as a guest in someone else's room: another page is the host (its own Host object, driven here), this page reads the
// host's record and bot snapshots, sends its own outcomes as messages, draws other people from presence, and watches when it was not in
// the match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, fakePlatform } from './fakedom.mjs';
import { autopilot } from './autopilot.mjs';
import { Host, readG } from '../game/net.js';
import { RoundCtx } from '../game/round.js';
import { analyze } from '../game/tower.js';
import { makeWorld } from '../game/sim.js';
import { BotRunner, SKILLS } from '../game/bots.js';
import { GRACE_S, PHYS, BOT_NAMES, lavaAt, spawnX, mulberry32 } from '../game/rules.js';

Math.random = mulberry32(7);

/** What the SDK's Room looks like to a page, with two views onto one shared room. */
const shared = {
  clock: () => Date.now(),
  state: {},
  players: new Map([
    ['h0', { id: 'h0', name: 'Hostess', presence: null }],
    ['p1', { id: 'p1', name: 'Pat', presence: null }],
  ]),
  match: { phase: 'lobby', n: 0, min: 1 },
  settings: { rounds: 3, lava: 'normal' },
  host: 'h0',
  outbox: [],
};
function view(meId) {
  const listeners = new Map();
  const room = {
    me: shared.players.get(meId),
    players: shared.players,
    state: shared.state,
    kind: 'public',
    connected: true,
    get host() {
      return shared.host;
    },
    get isHost() {
      return shared.host === meId;
    },
    get match() {
      return shared.match;
    },
    get settings() {
      return shared.settings;
    },
    get running() {
      return shared.match.phase === 'playing';
    },
    get participants() {
      return shared.match.phase === 'lobby' ? [] : shared.match.participants.map((id) => shared.players.get(id)).filter(Boolean);
    },
    get spectating() {
      return shared.match.phase !== 'lobby' && !shared.match.participants.includes(meId);
    },
    get online() {
      return [...shared.players.values()];
    },
    isParticipant: (id = meId) => shared.match.phase !== 'lobby' && shared.match.participants.includes(id),
    matchNow: () => (shared.match.phase === 'playing' ? shared.clock() - shared.match.startedAt : 0),
    setReady() {},
    clearReady() {},
    hideLobby() {},
    admit() {},
    setSetting() {},
    startMatch() {},
    endMatch() {
      if (shared.host !== meId) return;
      const before = shared.match;
      shared.match = { phase: 'lobby', n: before.n, min: 1 };
      other().emit('matchend', shared.match, before);
      room.emit('matchend', shared.match, before);
    },
    send(data, opts = {}) {
      shared.outbox.push({ from: meId, to: opts.to, data });
    },
    setPresence(d) {
      room.me.presence = d;
    },
    presenceAt: (id) => shared.players.get(id)?.presence ?? null,
    privateOf: () => ({}),
    setState(k, v) {
      if (v === null || v === undefined) delete shared.state[k];
      else shared.state[k] = v;
      if (meId !== 'p1') pageRoom.emit('state', k, v, meId);
    },
    on(e, f) {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e).add(f);
      return () => listeners.get(e).delete(f);
    },
    emit(e, ...a) {
      for (const f of listeners.get(e) ?? []) f(...a);
    },
  };
  return room;
}
const pageRoom = view('p1');
const hostRoom = view('h0');
const other = () => hostRoom;

const { ow, log } = fakePlatform(pageRoom);
const dom = installFakeDom({ ow });
await import('../game/main.js');
const ui = await import('../game/ui.js');
const seen = (t) => dom.stats.texts.includes(t);
const click = (h) => dom.fire('pointerdown', { clientX: h.x + h.w / 2, clientY: h.y + h.h / 2, pointerType: 'touch' });

// ---- the other page: a Host, and a person at its keyboard (a bot's brain)
const game = {
  ctx: null,
  nowMs: () => Date.now(),
  ctxFor(g) {
    if (!g) return null;
    if (!this.ctx || this.ctx.rid !== g.rid) this.ctx = new RoundCtx(g);
    return this.ctx;
  },
};
const host = new Host(hostRoom, game);
let person = null;
function hostSide(nextTick) {
  const g = readG(hostRoom);
  if (g) {
    const ctx = game.ctxFor(g);
    const t = (hostRoom.matchNow() - g.t0) / 1000;
    host.stepBots(t);
    if (g.phase === 'play' && g.safe.indexOf('h0') < 0 && !(g.h0done)) {
      if (!person || person.rid !== g.rid) {
        const world = makeWorld(ctx.tower, { floorUntil: GRACE_S });
        person = { rid: g.rid, done: false, runner: new BotRunner(world, analyze(ctx.tower), [{ id: 'h0', x: spawnX(0, g.roster.length), seed: 5, skill: SKILLS.avg }]) };
      }
      const bot = person.runner.bots[0];
      shared.players.get('h0').presence = { x: bot.body.x, y: bot.body.y, vx: bot.body.vx, vy: bot.body.vy, o: bot.body.on ? 1 : 0, f: 1, s: bot.st, m: bot.body.maxY, r: g.round };
      if (!person.done) {
        for (const e of person.runner.step(t, PHYS.dt, lavaAt(ctx.base, t, g.ff))) {
          person.done = true;
          if (e.kind === 'safe') host.claimSafe('h0', Date.now(), hostRoom.matchNow());
          else host.claimOut('h0', e.h);
        }
      }
    }
    host.publishBots();
  }
  if (nextTick) host.tick();
  // what the page sent to the host arrives
  while (shared.outbox.length) {
    const m = shared.outbox.shift();
    if (m.to === 'h0') host.onMessage(m.data, { id: m.from }, Date.now() - 20, hostRoom.matchNow());
  }
}

let tickAt = 0;
function frames(n, each) {
  dom.frames(n, 16.7, (i) => {
    tickAt += 16.7;
    const tick = tickAt >= 100;
    if (tick) tickAt -= 100;
    hostSide(tick);
    each?.(i);
  });
}

function startMatch(participants) {
  const startsAt = Date.now() + 3000;
  shared.match = { phase: 'starting', n: shared.match.n + 1, min: 1, id: `m${shared.match.n + 1}`, seed: 90210 + shared.match.n, participants, startsAt };
  pageRoom.emit('starting', shared.match);
  frames(190);
  const { startsAt: _s, ...rest } = shared.match;
  shared.match = { ...rest, phase: 'playing', startedAt: Date.now() };
  pageRoom.emit('matchstart', shared.match);
  hostRoom.emit('matchstart', shared.match);
  host.adopt();
}

test('the lobby draws the other person running about, with their name', () => {
  frames(30);
  click(ui.hits.play);
  shared.players.get('h0').presence = { x: 9, y: 0, vx: 0, vy: 0, o: 1, f: -1, s: 0, m: 0, r: 0 };
  frames(60);
  assert.ok(seen('Hostess'), 'their name tag');
  assert.ok(seen('Pat'), 'mine');
  assert.ok(!ui.hits.rounds.on, 'only the host can change the settings');
  assert.ok(ui.hits.rounds.w > 0 && seen('ROUNDS'), 'but everyone sees them');
  assert.deepEqual(dom.problems, []);
});

test('a match in someone else\'s room: the page follows the host\'s record and sends its own outcomes', () => {
  dom.stats.texts.length = 0;
  startMatch(['h0', 'p1']);
  const drive = autopilot(pageRoom, ow);
  const phases = [];
  let last = '';
  for (let i = 0; i < 60 * 60 * 10 && shared.match.phase !== 'lobby'; i++) {
    drive(readG(pageRoom));
    frames(1);
    const g = readG(pageRoom);
    if (g && `${g.round}:${g.phase}` !== last) {
      last = `${g.round}:${g.phase}`;
      phases.push(last);
    }
  }
  assert.deepEqual(dom.problems, []);
  assert.equal(shared.match.phase, 'lobby', 'the host ended the match after the podium');
  assert.ok(phases.includes('1:play') && phases.includes('3:score') && phases.includes('3:final'), phases.join(' '));
  const g = shared.state.g;
  assert.ok(g.roster.some((r) => r.id === 'p1') && g.roster.length === 6);
  assert.ok(g.scores.p1 > 0, `the guest scored (${JSON.stringify(g.scores)})`);
  assert.ok(g.safe.includes('p1') || Object.prototype.hasOwnProperty.call(g.out, 'p1'));
  assert.ok(BOT_NAMES.some((n) => seen(n)), 'the bots were drawn, from snapshots, with their names');
  assert.ok(seen('SAFE') && seen('THE FLOOR IS...'));
  assert.equal(log.saves.length, 1, 'stats saved once');
  assert.ok(log.badges.includes('first-up') || log.saves[0][1].tops === 0);
});

test('the page remembers nothing of the last match: the lobby is back, then a spectator match', () => {
  frames(60 * 6);
  assert.ok(seen('ROUNDS'));
  dom.stats.texts.length = 0;
  startMatch(['h0']); // this page was not ready in time: it watches
  assert.equal(pageRoom.spectating, true);
  for (let i = 0; i < 60 * 25; i++) frames(1);
  assert.ok(seen('WATCHING'), 'a "Watching" label');
  assert.ok(seen('REACH THE BALLOON!'));
  assert.equal(log.controls.at(-1), null, 'no controls while watching');
  assert.deepEqual(dom.problems, []);
  const presence = pageRoom.me.presence;
  assert.ok(presence && presence.r === 0, 'a spectator publishes nothing new in a round');
});
