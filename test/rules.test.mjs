import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lavaLevel,
  lavaSpeed,
  lavaReaches,
  lavaBase,
  GRACE_S,
  LAVA_SPEEDS,
  arrivalPoints,
  newRecord,
  applySafe,
  applyOut,
  roundDone,
  roundOrder,
  roundPoints,
  finalRanking,
  places,
  awards,
  ordinal,
  buildRoster,
  spawnX,
  roundSeed,
  roundsOf,
  lavaOf,
  mulberry32,
  BOT_NAMES,
  PLAYER_COLORS,
  TABLE_SIZE,
  WORLD_W,
} from '../game/rules.js';

test('the lava waits under the floor, then rises and speeds up', () => {
  assert.equal(lavaLevel(0.9, 0), -3);
  assert.ok(lavaLevel(0.9, 1) < 0, 'still under the floor during the grace');
  assert.ok(lavaLevel(0.9, GRACE_S - 0.01) <= 0.001);
  assert.ok(Math.abs(lavaLevel(0.9, GRACE_S)) < 1e-9, 'it reaches the floor exactly when the floor melts');
  let prev = lavaLevel(0.9, GRACE_S);
  for (let t = GRACE_S + 0.5; t < 120; t += 0.5) {
    const l = lavaLevel(0.9, t);
    assert.ok(l > prev, `rising at ${t}`);
    prev = l;
  }
  // 0.9 u/s at first
  assert.ok(Math.abs((lavaLevel(0.9, GRACE_S + 1) - lavaLevel(0.9, GRACE_S)) / 1 - 0.9) < 0.01);
  // 2% faster every 5 s
  assert.ok(Math.abs(lavaSpeed(0.9, GRACE_S + 5) / lavaSpeed(0.9, GRACE_S) - 1.02) < 1e-9);
  assert.equal(lavaSpeed(0.9, 1), 0);
});

test('lavaReaches inverts lavaLevel', () => {
  for (const base of Object.values(LAVA_SPEEDS)) {
    for (const y of [1, 10, 44, 88]) {
      const t = lavaReaches(base, y);
      assert.ok(Math.abs(lavaLevel(base, t) - y) < 1e-6, `${base} ${y}`);
    }
  }
  assert.equal(lavaReaches(0.9, 0), GRACE_S);
  // the lava reaches the balloon in about 85 s at Normal, later when slow, sooner when fast
  const normal = lavaReaches(0.9, 88);
  assert.ok(normal > 80 && normal < 95, String(normal));
  assert.ok(lavaReaches(0.7, 88) > normal && lavaReaches(1.2, 88) < normal);
});

test('lava settings: slow 0.7, normal 0.9, fast 1.2, anything else is normal', () => {
  assert.equal(lavaBase('slow'), 0.7);
  assert.equal(lavaBase('normal'), 0.9);
  assert.equal(lavaBase('fast'), 1.2);
  for (const bad of [undefined, null, 3, 'toString', '__proto__', '']) assert.equal(lavaBase(bad), 0.9);
  assert.equal(lavaOf('fast'), 'fast');
  assert.equal(lavaOf('constructor'), 'normal');
  assert.equal(roundsOf(5), 5);
  assert.equal(roundsOf('3'), 3);
  assert.equal(roundsOf(7), 3);
  assert.equal(roundsOf(undefined), 3);
});

test('arrival points: 10, 7, 5, 4, 3, 2, then 1 for everyone after', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 11].map(arrivalPoints), [10, 7, 5, 4, 3, 2, 1, 1, 1]);
  assert.equal(arrivalPoints(-1), 0);
});

test('a round: safe players in arrival order, the burned by height, once each', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const r = newRecord();
  assert.equal(roundDone(r, ids), false);
  assert.ok(applySafe(r, 'c'));
  assert.ok(!applySafe(r, 'c'), 'only once');
  assert.ok(applyOut(r, 'a', 12.5));
  assert.ok(!applyOut(r, 'c', 3), 'a safe player cannot burn');
  assert.ok(!applySafe(r, 'a'), 'a burned player cannot arrive');
  assert.ok(applyOut(r, 'd', 30));
  assert.ok(applySafe(r, 'e'));
  assert.equal(roundDone(r, ids), false, 'b is still climbing');
  assert.ok(applyOut(r, 'b', 12.5));
  assert.equal(roundDone(r, ids), true);
  // c, e arrived (in that order); then d (30), then a and b tie at 12.5: the earlier seat first
  assert.deepEqual(roundOrder(r, ids), ['c', 'e', 'd', 'a', 'b']);
  assert.deepEqual(roundPoints(r, ids), { a: 0, b: 0, c: 10, d: 0, e: 7 });
});

test('bad heights never break the order', () => {
  const r = newRecord();
  applyOut(r, 'a', NaN);
  applyOut(r, 'b', -5);
  applyOut(r, 'c', Infinity);
  assert.equal(r.out.a, 0);
  assert.equal(r.out.b, 0);
  assert.equal(r.out.c, 0);
  assert.deepEqual(roundOrder(r, ['a', 'b', 'c']), ['a', 'b', 'c']);
});

test('unresolved players are ranked last and score nothing', () => {
  const r = newRecord();
  applySafe(r, 'x');
  assert.deepEqual(roundOrder(r, ['p', 'x', 'q']), ['x', 'p', 'q']);
  assert.deepEqual(roundPoints(r, ['p', 'x', 'q']), { p: 0, x: 10, q: 0 });
  // ids not in the roster are ignored
  const r2 = newRecord();
  applySafe(r2, 'ghost');
  applySafe(r2, 'x');
  assert.deepEqual(roundPoints(r2, ['x']), { x: 10 }, 'a stranger takes no place from anyone');
});

test('the final ranking: points, then first arrivals, then seat; ties share a place', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const scores = { a: 17, b: 17, c: 20, d: 5 };
  const firsts = { a: 1, b: 2, c: 1 };
  const ranked = finalRanking(ids, scores, firsts);
  assert.deepEqual(ranked, ['c', 'b', 'a', 'd']);
  assert.deepEqual(places(ranked, scores, firsts), [1, 2, 3, 4]);
  // a true tie shares a place
  const s2 = { a: 10, b: 10, c: 3, d: 3 };
  const r2 = finalRanking(ids, s2, {});
  assert.deepEqual(r2, ['a', 'b', 'c', 'd']);
  assert.deepEqual(places(r2, s2, {}), [1, 1, 3, 3]);
  // a missing score counts as zero
  assert.deepEqual(finalRanking(['x', 'y'], { y: 1 }), ['y', 'x']);
});

test('awards: Hot Feet is the closest escape, Sky High the most first arrivals', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(awards(ids, {}, {}), { hotFeet: null, skyHigh: null });
  assert.deepEqual(awards(ids, { a: 3.2, c: 0.4, b: 1 }, { b: 2, c: 1 }), { hotFeet: 'c', skyHigh: 'b' });
  // ties go to the earlier seat
  assert.deepEqual(awards(ids, { b: 1, c: 1 }, { b: 1, c: 1 }), { hotFeet: 'b', skyHigh: 'b' });
  assert.deepEqual(awards(ids, { a: NaN }, {}), { hotFeet: null, skyHigh: null });
});

test('places read well', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
});

test('the roster: humans first, bots fill the table to six, never more than twelve', () => {
  for (const humans of [1, 2, 3, 5, 6]) {
    const ids = Array.from({ length: humans }, (_, i) => `p${i}`);
    const roster = buildRoster(ids, 1234);
    assert.equal(roster.length, TABLE_SIZE, `${humans} humans`);
    assert.deepEqual(roster.slice(0, humans).map((r) => r.id), ids);
    assert.ok(roster.slice(0, humans).every((r) => r.bot === 0));
    const bots = roster.slice(humans);
    assert.ok(bots.every((r, i) => r.bot === 1 && r.id === `bot${i + 1}` && BOT_NAMES.includes(r.name)));
    assert.equal(new Set(bots.map((b) => b.name)).size, bots.length, 'distinct bot names');
    assert.equal(new Set(roster.map((r) => r.id)).size, roster.length);
    assert.equal(new Set(roster.map((r) => r.c)).size, roster.length, 'distinct colours');
  }
  const crowd = buildRoster(Array.from({ length: 9 }, (_, i) => `h${i}`), 5);
  assert.equal(crowd.length, 9, 'more humans than seats: no bots');
  assert.ok(crowd.every((r) => !r.bot));
  const full = buildRoster(Array.from({ length: 20 }, (_, i) => `h${i}`), 5);
  assert.equal(full.length, 12);
  assert.ok(full.every((r) => r.c >= 0 && r.c < PLAYER_COLORS.length));
  // the same seed gives the same bots on every page
  assert.deepEqual(buildRoster(['a'], 99), buildRoster(['a'], 99));
  assert.notDeepEqual(buildRoster(['a'], 99).map((r) => r.name), buildRoster(['a'], 100).map((r) => r.name));
  // a duplicate id is one player
  assert.equal(buildRoster(['a', 'a', 'b'], 1).filter((r) => !r.bot).length, 2);
});

test('spawns spread across the floor and stay inside the walls', () => {
  for (const n of [1, 2, 6, 12]) {
    const xs = Array.from({ length: n }, (_, i) => spawnX(i, n));
    for (const x of xs) assert.ok(x > 0.5 && x < WORLD_W - 0.5);
    for (let i = 1; i < n; i++) assert.ok(xs[i] > xs[i - 1]);
  }
  assert.ok(Number.isFinite(spawnX(0, 0)));
});

test('round seeds differ by round and match for everyone', () => {
  assert.equal(roundSeed(42, 1), roundSeed(42, 1));
  assert.notEqual(roundSeed(42, 1), roundSeed(42, 2));
  assert.notEqual(roundSeed(42, 1), roundSeed(43, 1));
  assert.ok(Number.isInteger(roundSeed('garbage', 1)));
});

test('the random generator is seeded and in range', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});
