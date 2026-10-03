import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, rnd, range, int, weighted, shuffle, noise1 } from '../src/sim/rng.js';

test('the same seed gives the same stream', () => {
  const a = { s: hashSeed('x', 1) };
  const b = { s: hashSeed('x', 1) };
  for (let i = 0; i < 1000; i++) assert.equal(rnd(a), rnd(b));
});

test('values stay in range', () => {
  const r = { s: 7 };
  for (let i = 0; i < 5000; i++) {
    const v = rnd(r);
    assert.ok(v >= 0 && v < 1);
    const k = int(r, 2, 5);
    assert.ok(k >= 2 && k <= 5 && Number.isInteger(k));
    const f = range(r, -3, 3);
    assert.ok(f >= -3 && f <= 3);
    const n = noise1(3, i * 0.37);
    assert.ok(n >= -1 && n <= 1);
  }
});

test('weighted picks respect zero weights and shuffle keeps every item', () => {
  const r = { s: 11 };
  for (let i = 0; i < 500; i++) assert.equal(weighted(r, [{ id: 'a', w: 0 }, { id: 'b', w: 2 }]).id, 'b');
  const s = shuffle(r, [1, 2, 3, 4, 5]);
  assert.deepEqual(s.slice().sort(), [1, 2, 3, 4, 5]);
  assert.equal(weighted(r, [{ id: 'z', w: 0 }]).id, 'z');
});
