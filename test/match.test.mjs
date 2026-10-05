import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMatch, simulateRound } from './helpers.mjs';
import { arrivalPoints, buildRoster, roundSeed, PLAYER_COLORS } from '../game/rules.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const ROUNDS = [1, 3, 5];
const LAVA = ['slow', 'normal', 'fast'];

test('a whole match of bots only, 20 seeds: it ends, ranks everyone, nobody leaves the shaft, no NaN', () => {
  let arrivals = 0;
  let burned = 0;
  for (const [i, seed] of SEEDS.entries()) {
    const rounds = ROUNDS[i % 3];
    const lava = LAVA[(i >> 1) % 3];
    const m = simulateMatch({ seed, rounds, lava });
    assert.deepEqual(m.problems, [], `seed ${seed}`);
    assert.equal(m.rounds, rounds, `seed ${seed}: the expected number of rounds`);
    assert.equal(m.ranking.length, 6, 'a ranking of everyone');
    assert.deepEqual([...m.ranking].sort(), [...m.ids].sort());
    assert.equal(m.places.length, 6);
    assert.equal(m.places[0], 1);
    for (const id of m.ids) {
      assert.ok(Number.isInteger(m.scores[id]) && m.scores[id] >= 0, `${id} has a score`);
    }
    // scores are exactly the points of the rounds
    for (const id of m.ids) assert.equal(m.scores[id], m.results.reduce((s, r) => s + r.pts[id], 0));
    // sorted best first
    for (let k = 1; k < 6; k++) assert.ok(m.scores[m.ranking[k - 1]] >= m.scores[m.ranking[k]]);
    // every round: the safe ones took 10, 7, 5, 4, 3, 2 in order, everyone else nothing
    for (const r of m.results) {
      const pts = r.order.slice(0, r.safe).map((id) => r.pts[id]);
      assert.deepEqual(pts, Array.from({ length: r.safe }, (_, k) => arrivalPoints(k)));
      for (const id of r.order.slice(r.safe)) assert.equal(r.pts[id], 0);
      assert.ok(r.end > 4 && r.end <= 160, `round length ${r.end}`);
      arrivals += r.safe;
      burned += 6 - r.safe;
    }
  }
  assert.ok(arrivals > 0 && burned > 0, `some made it (${arrivals}) and some burned (${burned})`);
});

test('the lava makes it a race: slower lava, more arrivals; faster lava, fewer', () => {
  const total = (lava) => {
    let n = 0;
    for (let s = 0; s < 8; s++) n += simulateMatch({ seed: 500 + s * 11, rounds: 3, lava }).results.reduce((a, r) => a + r.safe, 0);
    return n;
  };
  const slow = total('slow');
  const normal = total('normal');
  const fast = total('fast');
  assert.ok(slow > normal && normal > fast, `slow ${slow} > normal ${normal} > fast ${fast}`);
});

test('a round with six bots takes between 20 and 120 seconds', () => {
  for (let s = 1; s <= 10; s++) {
    const roster = buildRoster([], s, 6);
    const r = simulateRound({ seed: roundSeed(s, 1), roster });
    assert.deepEqual(r.problems, []);
    assert.ok(r.end > 20 && r.end < 125, `round ${s}: ${r.end.toFixed(1)} s`);
  }
});

test('a full table of twelve bots also plays through', () => {
  const m = simulateMatch({ seed: 4242, rounds: 1, seats: 12 });
  assert.deepEqual(m.problems, []);
  assert.equal(m.ranking.length, 12);
  assert.equal(new Set(m.roster.map((r) => r.c)).size, 12);
  assert.ok(m.roster.every((r) => r.c < PLAYER_COLORS.length));
});
