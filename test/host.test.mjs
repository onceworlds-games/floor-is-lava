import test from 'node:test';
import assert from 'node:assert/strict';
import { Host, readG, createStubRoom } from '../game/net.js';
import { RoundCtx } from '../game/round.js';
import { analyze } from '../game/tower.js';
import { makeWorld } from '../game/sim.js';
import { BotRunner, SKILLS } from '../game/bots.js';
import { PHYS, T, GRACE_S, lavaLevel, spawnX, finalRanking, arrivalPoints } from '../game/rules.js';

/** Just enough of a platform room for the host's page: the clock, shared state, players, the match. */
class FakeRoom {
  constructor({ ids, hostId, seed = 4242, rounds = 3, lava = 'normal' }) {
    this.clock = 0;
    this.state = {};
    this.writes = [];
    this.players = new Map(ids.map((id) => [id, { id, name: id, presence: null }]));
    this.me = this.players.get(hostId);
    this.host = hostId;
    this.settings = { rounds, lava };
    this.match = { phase: 'playing', n: 1, min: 1, id: 'm1', seed, participants: ids.slice(), startedAt: 0 };
    this.ended = 0;
  }
  get isHost() {
    return this.host === this.me.id;
  }
  get running() {
    return this.match.phase === 'playing' && !this.match.paused;
  }
  matchNow() {
    return this.running ? this.clock - this.match.startedAt : 0;
  }
  setState(k, v) {
    this.writes.push(k);
    if (v === null || v === undefined) delete this.state[k];
    else this.state[k] = v;
  }
  endMatch() {
    this.ended++;
  }
}

function makeGame(room) {
  const game = {
    ctx: null,
    nowMs: () => room.clock,
    ctxFor(g) {
      if (!g) return null;
      if (!this.ctx || this.ctx.rid !== g.rid) this.ctx = new RoundCtx(g);
      return this.ctx;
    },
  };
  return game;
}

/** A person at a keyboard, stood in for by a bot's brain on its own copy of the tower. */
class Person {
  constructor(room, id, skill, send) {
    this.room = room;
    this.id = id;
    this.skill = skill;
    this.send = send; // (kind, h) => void
    this.rid = null;
    this.runner = null;
    this.done = false;
  }
  start(g, ctx, index) {
    this.rid = g.rid;
    this.world = makeWorld(ctx.tower, { floorUntil: GRACE_S });
    this.runner = new BotRunner(this.world, analyze(ctx.tower), [{ id: this.id, x: spawnX(index, g.roster.length), seed: 77 + index, skill: this.skill }]);
    this.done = false;
  }
  step(g, ctx, t) {
    if (this.rid !== g.rid) this.start(g, ctx, g.roster.findIndex((r) => r.id === this.id));
    if (g.phase !== 'play') return;
    const bot = this.runner.bots[0];
    const pl = this.room.players.get(this.id);
    pl.presence = { x: bot.body.x, y: bot.body.y, r: g.round, m: bot.body.maxY, s: bot.st };
    if (this.done) return;
    const ev = this.runner.step(t, PHYS.dt, lavaLevel(ctx.base, t));
    for (const e of ev) {
      this.done = true;
      this.send(e.kind === 'safe' ? 'safe' : 'lava', e.h);
    }
  }
}

function play({ ids, hostId, rounds = 3, lava = 'normal', seed = 4242, people = {}, silent = [], limitMin = 40, hook }) {
  const room = new FakeRoom({ ids, hostId, rounds, lava, seed });
  const game = makeGame(room);
  const host = new Host(room, game);
  host.adopt();
  const persons = Object.entries(people).map(
    ([id, skill]) =>
      new Person(room, id, skill, (kind, h) => {
        const g = readG(room);
        if (id === hostId) kind === 'safe' ? host.claimSafe(id, room.clock, room.matchNow()) : host.claimOut(id, h);
        else host.onMessage({ t: kind, rid: g.rid, h }, { id }, room.clock - 30, room.matchNow() - 30);
      }),
  );
  const phases = [];
  let nextTick = 100;
  let last = '';
  for (let step = 0; room.ended === 0 && room.clock < limitMin * 60 * 1000; step++) {
    room.clock += 1000 / 60;
    const g = readG(room);
    if (g) {
      const key = `${g.round}:${g.phase}`;
      if (key !== last) {
        phases.push(key);
        last = key;
      }
      const ctx = game.ctxFor(g);
      const t = (room.matchNow() - g.t0) / 1000;
      if (g.by === room.me.id) host.stepBots(t);
      for (const p of persons) if (!silent.includes(p.id)) p.step(g, ctx, t);
      if (g.by === room.me.id) host.publishBots();
    }
    if (room.clock >= nextTick) {
      nextTick += 100;
      host.tick();
    }
    hook?.(room, host, game, step);
  }
  return { room, host, game, phases };
}

const ROSTER_IDS = ['alice', 'bob', 'carol'];

test('the host runs a whole match: banner, climb, balloon, scoreboard, three times, the podium, then ends it', () => {
  const { room, phases } = play({ ids: ROSTER_IDS, hostId: 'alice', rounds: 3, people: { alice: SKILLS.ace, bob: SKILLS.sharp, carol: SKILLS.avg } });
  assert.equal(room.ended, 1, 'endMatch was called once');
  const g = readG(room);
  assert.equal(g.phase, 'final');
  assert.equal(g.round, 3);
  // the phases come in order, every round shows its scoreboard (the last one too), then the final
  for (let r = 1; r <= 3; r++) {
    const mine = phases.filter((p) => p.startsWith(`${r}:`)).map((p) => p.split(':')[1]);
    assert.deepEqual(mine.slice(0, 4), ['banner', 'play', 'fly', 'score'], `round ${r}: ${mine}`);
  }
  assert.equal(phases[phases.length - 1], '3:final');
  assert.equal(g.roster.length, 6);
  assert.equal(g.roster.filter((r) => !r.bot).length, 3);
  // everyone has a number; the points add up round by round
  for (const r of g.roster) assert.ok(Number.isInteger(g.scores[r.id]) && g.scores[r.id] >= 0);
  const total = Object.values(g.scores).reduce((a, b) => a + b, 0);
  assert.ok(total >= 10 * 3, `at least a first place a round: ${total}`);
  const ranked = finalRanking(g.roster.map((r) => r.id), g.scores, g.firsts);
  assert.equal(ranked.length, 6);
  // the perfect player won the most points among the humans
  assert.ok(g.scores.alice >= g.scores.carol, `${g.scores.alice} vs ${g.scores.carol}`);
});

test('arrivals are ordered by the room\'s clock, not by when the host heard about them', () => {
  const room = new FakeRoom({ ids: ['h1', 'h2'], hostId: 'h1' });
  const game = makeGame(room);
  const host = new Host(room, game);
  host.adopt();
  let g = readG(room);
  assert.equal(g.phase, 'banner');
  room.clock = 1600;
  host.tick();
  g = readG(room);
  assert.equal(g.phase, 'play');
  // h2 arrived first (at 5000) but its message reaches the host after the host's own page claimed (at 5100)
  room.clock = 5200;
  room.players.get('h2').presence = { x: 7, y: g.t0 / 1e9 + 87, r: 1, m: 87 };
  host.claimSafe('h1', 5100, room.matchNow());
  host.onMessage({ t: 'safe', rid: g.rid }, { id: 'h2' }, 5000, room.matchNow());
  host.claimSafe('bot1', 5150, room.matchNow());
  room.clock = 5200 + T.claimWaitMs + 50;
  host.tick();
  g = readG(room);
  assert.deepEqual(g.safe, ['h2', 'h1', 'bot1']);
  assert.ok(g.sg.h2 >= 0 && g.sg.h1 >= 0, 'the gap to the lava is recorded');
});

test('a claim is applied once; wrong rounds, strangers, bots\' names and impossible arrivals are refused', () => {
  const room = new FakeRoom({ ids: ['h1', 'h2'], hostId: 'h1' });
  const host = new Host(room, makeGame(room));
  host.adopt();
  room.clock = 1600;
  host.tick();
  const g = readG(room);
  room.players.get('h2').presence = { x: 3, y: 5, r: 1, m: 5 };
  // far from the balloon: refused
  host.onMessage({ t: 'safe', rid: g.rid }, { id: 'h2' }, room.clock, 3000);
  // the wrong round, a stranger, and a human speaking for a bot
  host.onMessage({ t: 'lava', rid: 'nope', h: 3 }, { id: 'h2' }, room.clock, 3000);
  host.onMessage({ t: 'lava', rid: g.rid, h: 3 }, { id: 'stranger' }, room.clock, 3000);
  host.onMessage({ t: 'lava', rid: g.rid, h: 3 }, { id: 'bot1' }, room.clock, 3000);
  // garbage
  host.onMessage(null, { id: 'h2' }, room.clock, 3000);
  host.onMessage('lava', { id: 'h2' }, room.clock, 3000);
  host.onMessage({ t: 'lava', rid: g.rid, h: 'tall' }, { id: 'h2' }, room.clock, 3000);
  room.clock += 400;
  host.tick();
  const after = readG(room);
  assert.deepEqual(after.safe, []);
  assert.deepEqual(Object.keys(after.out), ['h2'], 'only h2 burned, and only once, with a sane height');
  assert.equal(after.out.h2, 0);
  host.onMessage({ t: 'lava', rid: g.rid, h: 40 }, { id: 'h2' }, room.clock, 3000);
  room.clock += 400;
  host.tick();
  assert.equal(readG(room).out.h2, 0, 'the first word stands');
});

test('a player who goes quiet is caught by the lava; the round does not wait for them', () => {
  const { room, phases } = play({
    ids: ['alice', 'bob'],
    hostId: 'alice',
    rounds: 1,
    people: { alice: SKILLS.ace },
    silent: [],
  });
  const g = readG(room);
  assert.equal(g.phase, 'final');
  assert.ok(Object.prototype.hasOwnProperty.call(g.out, 'bob'), 'bob never said a word and the lava took him');
  assert.equal(g.scores.bob, 0);
  assert.ok(g.safe.includes('alice'));
  assert.ok(phases.includes('1:fly'));
});

test('once every person is safe or out, the balloon goes 3 s later and the bots left behind are ranked by height', () => {
  const room = new FakeRoom({ ids: ['alice'], hostId: 'alice', rounds: 1 });
  const game = makeGame(room);
  const host = new Host(room, game);
  host.adopt();
  room.clock = 1600;
  host.tick();
  const g0 = readG(room);
  room.players.get('alice').presence = { x: 7, y: 87, r: 1, m: 87 };
  room.clock = 3000;
  host.claimSafe('alice', room.clock, room.matchNow());
  room.clock += 400;
  host.tick();
  assert.equal(readG(room).phase, 'play');
  assert.deepEqual(readG(room).safe, ['alice']);
  room.clock += 2000;
  host.tick();
  assert.equal(readG(room).phase, 'play', 'not yet');
  room.clock += 1200;
  host.tick();
  const g = readG(room);
  assert.equal(g.phase, 'fly');
  assert.equal(Object.keys(g.out).length, 5, 'the five bots left behind are all accounted for');
  assert.ok(g.until > room.matchNow());
  void g0;
});

test('a new host carries on from the room\'s copy: the same round, the bots where they were, no reset', () => {
  let swapped = false;
  let before = null;
  const { room, phases } = play({
    ids: ['alice', 'bob'],
    hostId: 'alice',
    rounds: 2,
    people: { alice: SKILLS.ace, bob: SKILLS.sharp },
    hook(room, host, game) {
      const g = readG(room);
      if (!swapped && g && g.round === 1 && g.phase === 'play' && room.matchNow() - g.t0 > 20000) {
        swapped = true;
        before = { g, b: room.state.b, safe: g.safe.slice() };
        // alice's page drops: bob becomes the host with a fresh page (a new Host, no memory)
        room.host = 'bob';
        room.me = room.players.get('bob');
        const next = new Host(room, makeGame(room));
        next.adopt();
        const after = readG(room);
        assert.equal(after.by, 'bob');
        assert.equal(after.rid, g.rid, 'the same round');
        assert.deepEqual(after.safe, g.safe);
        assert.equal(after.t0, g.t0);
        // from now on the new host drives
        host.tick = next.tick.bind(next);
        host.stepBots = next.stepBots.bind(next);
        host.publishBots = next.publishBots.bind(next);
        Object.defineProperty(game, 'ctx', { value: null, writable: true });
      }
    },
  });
  assert.ok(swapped);
  assert.equal(room.ended, 1);
  assert.equal(readG(room).phase, 'final');
  assert.ok(phases.includes('2:score'), 'the second round was played too');
  assert.ok(before.b, 'there were bot snapshots to resume from');
});

test('a match that starts again after the last one gets a fresh record (and a stale one is never read)', () => {
  const room = new FakeRoom({ ids: ['a'], hostId: 'a', rounds: 1 });
  const host = new Host(room, makeGame(room));
  host.adopt();
  const first = readG(room);
  assert.equal(first.mid, 'm1');
  room.match = { phase: 'lobby', n: 1, min: 1 };
  assert.equal(readG(room), null, 'in the lobby the old record is not this match\'s');
  room.match = { phase: 'playing', n: 2, min: 1, id: 'm2', seed: 9, participants: ['a'], startedAt: room.clock };
  assert.equal(readG(room), null, 'a new match id: the old record is stale');
  host.adopt();
  const second = readG(room);
  assert.equal(second.mid, 'm2');
  assert.equal(second.round, 1);
  assert.deepEqual(second.scores, { a: 0, bot1: 0, bot2: 0, bot3: 0, bot4: 0, bot5: 0 });
});

test('a paused match stands still: nothing advances while the room waits', () => {
  const room = new FakeRoom({ ids: ['a', 'b'], hostId: 'a' });
  const host = new Host(room, makeGame(room));
  host.adopt();
  room.match.paused = { since: 0 };
  room.clock = 60000;
  host.tick();
  assert.equal(readG(room).phase, 'banner');
});

test('the record is validated: types, ranges and shape', () => {
  const room = new FakeRoom({ ids: ['a'], hostId: 'a' });
  const host = new Host(room, makeGame(room));
  host.adopt();
  const good = room.state.g;
  assert.ok(readG(room));
  const bad = (patch, why) => {
    room.state.g = { ...good, ...patch };
    assert.equal(readG(room), null, why);
  };
  bad({ phase: 'dancing' }, 'unknown phase');
  bad({ round: 9 }, 'round out of range');
  bad({ n: 2, round: 3 }, 'round beyond the rounds');
  bad({ roster: [] }, 'empty roster');
  bad({ roster: [{ id: 'a', bot: 0, c: 99 }] }, 'colour out of range');
  bad({ roster: [{ id: 'a', bot: 1, c: 1 }] }, 'a bot without a name');
  bad({ roster: [{ id: 'a', bot: 0, c: 1 }, { id: 'a', bot: 0, c: 2 }] }, 'duplicate ids');
  bad({ safe: 'a' }, 'safe is not a list');
  bad({ safe: [1, 2] }, 'safe holds non-strings');
  bad({ out: { a: 'tall' } }, 'a height that is not a number');
  bad({ scores: null }, 'no scores');
  bad({ t0: 'now' }, 'a clock that is not a number');
  bad({ until: Infinity }, 'an infinite deadline');
  bad({ seed: -1 }, 'a seed out of range');
  bad({ mid: 'other' }, 'another match');
  bad({ order: 'x' }, 'order not a list');
  room.state.g = 'garbage';
  assert.equal(readG(room), null);
  room.state.g = null;
  assert.equal(readG(room), null);
  room.state.g = good;
  assert.ok(readG(room));
});

test('the stand-alone stub room keeps a match: countdown, play, end', async () => {
  const room = createStubRoom();
  const seen = [];
  room.on('starting', () => seen.push('starting'));
  room.on('matchstart', () => seen.push('matchstart'));
  room.on('matchend', () => seen.push('matchend'));
  assert.equal(room.match.phase, 'lobby');
  room.startMatch();
  assert.equal(room.match.phase, 'starting');
  assert.ok(room.match.startsAt > Date.now());
  assert.deepEqual(room.participants.map((p) => p.id), ['me']);
  await new Promise((r) => setTimeout(r, 3100));
  assert.equal(room.match.phase, 'playing');
  assert.ok(room.running);
  assert.ok(room.matchNow() >= 0 && room.matchNow() < 500);
  room.endMatch();
  assert.equal(room.match.phase, 'lobby');
  assert.deepEqual(seen, ['starting', 'matchstart', 'matchend']);
  room.endMatch();
  assert.equal(arrivalPoints(0), 10);
});
