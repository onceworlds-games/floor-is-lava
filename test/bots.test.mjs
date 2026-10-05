import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTower, analyze } from '../game/tower.js';
import { makeWorld } from '../game/sim.js';
import { BotRunner, SKILLS, skillFor, botSpecs, brainInput, makeBrain } from '../game/bots.js';
import { PHYS, GRACE_S, WORLD_W, lavaLevel, lavaBase, mulberry32, buildRoster, spawnX } from '../game/rules.js';

const DT = PHYS.dt;

/** One bot alone on a tower. Returns { kind, t, h } of its first event (or null). */
function climb(seed, skill, lava = 'normal', limit = 150) {
  const tower = generateTower(seed);
  const world = makeWorld(tower, { floorUntil: GRACE_S });
  const runner = new BotRunner(world, analyze(tower), [{ id: 'b', x: 7, seed: seed * 31, skill }]);
  const base = lavaBase(lava);
  for (let k = 0; k < limit * 60; k++) {
    const t = k * DT;
    const ev = runner.step(t, DT, lavaLevel(base, t));
    if (ev.length) return { ...ev[0], t };
  }
  return null;
}

test('a perfect bot climbs every tower to the balloon, whatever the lava speed (40 seeds x 3)', () => {
  for (const lava of ['slow', 'normal', 'fast']) {
    for (let seed = 1; seed <= 40; seed++) {
      const r = climb(seed * 13 + 5, SKILLS.ace, lava);
      assert.ok(r && r.kind === 'safe', `${lava} seed ${seed * 13 + 5}: ${JSON.stringify(r)}`);
      assert.ok(r.t < 60, `reached it in ${r.t.toFixed(1)} s`);
    }
  }
});

test('the three skill classes: sharp nearly always makes it, average about two in three at Normal, weak rarely', () => {
  const rate = (skill, n = 60) => {
    let safe = 0;
    for (let seed = 1; seed <= n; seed++) if (climb(seed * 17 + 3, skill)?.kind === 'safe') safe++;
    return safe / n;
  };
  const sharp = rate(SKILLS.sharp);
  const avg = rate(SKILLS.avg);
  const weak = rate(SKILLS.weak);
  assert.ok(sharp >= 0.9, `sharp ${sharp}`);
  assert.ok(avg >= 0.5 && avg <= 0.85, `average ${avg}`);
  assert.ok(weak <= 0.35, `weak ${weak}`);
  assert.ok(sharp > avg && avg > weak);
});

test('a mix of bots (skillFor) reaches the top 55-80% of the time at Normal, more when slow, less when fast', () => {
  const mix = (lava) => {
    let safe = 0;
    const n = 80;
    for (let seed = 1; seed <= n; seed++) if (climb(seed * 11 + 1, skillFor(mulberry32(seed * 7)), lava)?.kind === 'safe') safe++;
    return safe / n;
  };
  const normal = mix('normal');
  assert.ok(normal >= 0.55 && normal <= 0.82, `normal ${normal}`);
  assert.ok(mix('slow') > normal, 'slow lava is easier');
  assert.ok(mix('fast') < normal, 'fast lava is harder');
});

test('weak bots are not caught in the first seconds: everybody leaves the floor before it melts', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = climb(seed * 5, SKILLS.weak);
    if (r && r.kind === 'out') assert.ok(r.t > 12 && r.h > 2, `seed ${seed}: out at ${r.t.toFixed(1)} s, height ${r.h}`);
  }
});

test('bots make legal moves: inside the shaft, finite, never faster than the physics allow', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const tower = generateTower(seed);
    const world = makeWorld(tower, { floorUntil: GRACE_S });
    const roster = buildRoster([], seed, 6);
    const runner = new BotRunner(world, analyze(tower), botSpecs(roster, seed, (i) => spawnX(i, 6)));
    for (let k = 0; k < 60 * 100; k++) {
      const t = k * DT;
      runner.step(t, DT, lavaLevel(0.9, t));
      for (const bot of runner.bots) {
        const b = bot.body;
        assert.ok([b.x, b.y, b.vx, b.vy].every(Number.isFinite), `${bot.id} at ${t}`);
        assert.ok(b.x >= 0 && b.x <= WORLD_W, `${bot.id} x=${b.x}`);
        assert.ok(Math.abs(b.vx) <= PHYS.maxSpeed + 1e-6 || bot.st === 2, `${bot.id} vx=${b.vx}`);
        assert.ok(Math.abs(b.vy) <= PHYS.bounceV + 1e-6 || bot.st === 2);
      }
    }
  }
});

test('a bot pushes the same inputs a person could: run -1..1, jump held, tap once, drop through', () => {
  const tower = generateTower(3);
  const world = makeWorld(tower, { floorUntil: GRACE_S });
  const an = analyze(tower);
  const runner = new BotRunner(world, an, [{ id: 'b', x: 7, seed: 9, skill: SKILLS.avg }]);
  const bot = runner.bots[0];
  const out = { x: 0, down: false, jump: false, tap: false };
  let taps = 0;
  for (let k = 0; k < 60 * 40; k++) {
    const t = k * DT;
    if (bot.st === 0) {
      brainInput(world, an, bot.body, bot.brain, t, lavaLevel(0.9, t), out);
      assert.ok(out.x >= -1 && out.x <= 1 && Number.isFinite(out.x));
      assert.equal(typeof out.jump, 'boolean');
      assert.equal(out.down, false, 'bots never drop on purpose');
      if (out.tap) taps++;
    }
    runner.step(t, DT, lavaLevel(0.9, t));
  }
  assert.ok(taps > 5, 'it jumps');
});

test('the same seed gives the same bots, and a new host carries on from a snapshot', () => {
  const tower = generateTower(8);
  const roster = buildRoster([], 8, 6);
  const mk = () => new BotRunner(makeWorld(tower, { floorUntil: GRACE_S }), analyze(tower), botSpecs(roster, 8, (i) => spawnX(i, 6)));
  const a = mk();
  const b = mk();
  for (let k = 0; k < 600; k++) {
    a.step(k * DT, DT, lavaLevel(0.9, k * DT));
    b.step(k * DT, DT, lavaLevel(0.9, k * DT));
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  // a third runner takes over from the snapshot and keeps climbing
  const snap = a.snapshot();
  const c = mk();
  c.restore(snap, 10, () => -1);
  const heightsBefore = c.bots.map((x) => x.body.y);
  heightsBefore.forEach((h, i) => assert.ok(Math.abs(h - snap[i][1]) < 1e-9));
  let t = 600 * DT;
  for (let k = 0; k < 60 * 15; k++, t += DT) c.step(t, DT, lavaLevel(0.9, t));
  const gained = c.bots.filter((x, i) => x.body.y > heightsBefore[i] + 1 || x.st !== 0).length;
  assert.ok(gained >= 4, `the bots carried on climbing (${gained} of 6)`);
  // garbage snapshots are ignored
  const d = mk();
  d.restore([[NaN, 1, 0, 0, 1, 0, 1], 'x', null], 0, () => -1);
  for (const bot of d.bots) assert.ok(Number.isFinite(bot.body.x));
  // a snapshot's statuses and the record's override
  const e = mk();
  e.restore(snap, 10, (id) => (id === 'bot1' ? 1 : id === 'bot2' ? 2 : -1));
  assert.equal(e.byId('bot1').st, 1);
  assert.equal(e.byId('bot2').st, 2);
});

test('skills are sensible numbers', () => {
  for (const [name, s] of Object.entries(SKILLS)) {
    assert.ok(s.react >= 1 && s.miss >= 0 && s.miss < 0.3 && s.execNoise >= 0 && s.panic > 0, name);
  }
  for (let i = 0; i < 50; i++) {
    const s = skillFor(mulberry32(i));
    assert.ok(Number.isFinite(s.react) && s.react >= 2 && s.miss < 0.3 && s.idle <= 0.9 && s.startDelay < 3.5);
  }
  const brain = makeBrain(1, SKILLS.weak);
  assert.ok(brain.startAt <= 150, 'a bot is off the floor before it melts');
});
