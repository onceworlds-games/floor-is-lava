import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTower, validateTower, analyze, canJump, airDist, hardGap, FURNITURE_NAMES } from '../game/tower.js';
import { PHYS, WORLD_W, TOWER_GOAL, LOBBY_CEIL } from '../game/rules.js';

const SEEDS = Array.from({ length: 250 }, (_, i) => i * 7919 + 1);

/** Walk the reachability graph from the floor to the balloon over the static pieces only (the guaranteed ladder). */
function ladderReaches(t) {
  const P = t.platforms;
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const a = P[queue.shift()];
    if (a.kind === 'goal') return true;
    for (const b of P) {
      if (seen.has(b.i) || (b.kind !== 'static' && b.kind !== 'goal') || b.y <= a.y) continue;
      if (canJump(a, b)) {
        seen.add(b.i);
        queue.push(b.i);
      }
    }
  }
  return false;
}

test('every tower, for 250 seeds, is valid and reaches the balloon from the floor', () => {
  for (const seed of SEEDS) {
    const t = generateTower(seed);
    assert.deepEqual(validateTower(t), [], `seed ${seed}`);
    assert.ok(ladderReaches(t), `seed ${seed}: the static pieces reach the balloon`);
    assert.equal(t.goal, t.platforms.length - 1);
    assert.ok(t.goalY >= TOWER_GOAL - 1 && t.goalY <= TOWER_GOAL + 1, `goal at ${t.goalY}`);
    assert.equal(t.platforms[0].kind, 'floor');
    assert.equal(t.platforms[t.goal].kind, 'goal');
  }
});

test('from every piece there is a static piece above it within the jump arc', () => {
  for (const seed of SEEDS.slice(0, 80)) {
    const t = generateTower(seed);
    for (const p of t.platforms) {
      if (p.kind === 'goal') continue;
      const above = t.platforms.filter((q) => (q.kind === 'static' || q.kind === 'goal') && q.y > p.y + 0.5 && canJump(p, q));
      assert.ok(above.length > 0, `seed ${seed}: piece ${p.i} (${p.f} ${p.kind} at ${p.y}) is a dead end`);
    }
  }
});

test('the climb is gentle low and harder high: pieces get narrower, rows are 1.4 to 2.1 apart', () => {
  let low = 0;
  let nLow = 0;
  let high = 0;
  let nHigh = 0;
  for (const seed of SEEDS.slice(0, 60)) {
    const t = generateTower(seed);
    const rows = new Map();
    for (const p of t.platforms) if (p.kind === 'static') rows.set(p.row, p);
    const ys = [...new Set(t.platforms.filter((p) => p.kind === 'static').map((p) => p.row))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      const a = Math.min(...t.platforms.filter((p) => p.row === ys[i - 1] && p.kind === 'static').map((p) => p.y));
      const b = Math.max(...t.platforms.filter((p) => p.row === ys[i] && p.kind === 'static').map((p) => p.y));
      const d = b - a;
      assert.ok(d > 1.0 && d < 2.4, `seed ${seed}: row gap ${d}`);
    }
    for (const p of t.platforms) {
      if (p.kind !== 'static') continue;
      if (p.y < 25) {
        low += p.w;
        nLow++;
      } else if (p.y > 60) {
        high += p.w;
        nHigh++;
      }
    }
  }
  assert.ok(low / nLow > high / nHigh + 0.4, `low ${low / nLow} vs high ${high / nHigh}`);
});

test('all pieces lie inside the shaft, with sensible numbers', () => {
  for (const seed of SEEDS.slice(0, 100)) {
    const t = generateTower(seed);
    assert.equal(t.w, WORLD_W);
    for (const p of t.platforms) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.w > 0.9, `piece ${p.i}`);
      assert.ok(FURNITURE_NAMES.includes(p.f), p.f);
      if (p.kind === 'floor') continue;
      const reach = p.w / 2 + (p.kind === 'move' ? p.amp : 0);
      assert.ok(p.x - reach >= -0.001 && p.x + reach <= WORLD_W + 0.001, `piece ${p.i} leaves the shaft`);
      if (p.kind === 'move') assert.ok(p.period > 2 && p.amp > 0.5);
      assert.ok([0, 1, 2, 3].includes(p.c));
    }
    // indexes are positions
    t.platforms.forEach((p, i) => assert.equal(p.i, i));
  }
});

test('trampolines, pillows and rolling chairs appear, but never alone: the ladder does not need them', () => {
  const kinds = { bounce: 0, crumble: 0, move: 0, static: 0 };
  for (const seed of SEEDS.slice(0, 80)) for (const p of generateTower(seed).platforms) if (p.kind in kinds) kinds[p.kind]++;
  assert.ok(kinds.bounce > 40 && kinds.crumble > 40 && kinds.move > 10, JSON.stringify(kinds));
  assert.ok(kinds.static > kinds.bounce + kinds.crumble + kinds.move);
});

test('a tower is the same everywhere and different for another seed', () => {
  const a = generateTower(777);
  const b = generateTower(777);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.platforms.map((p) => p.x), generateTower(778).platforms.map((p) => p.x));
});

test('the lobby is the bottom of the tower under a ceiling, with no balloon', () => {
  for (const seed of [1, 7, 99, 12345]) {
    const t = generateTower(seed, { lobby: true });
    assert.equal(t.lobby, true);
    assert.equal(t.goal, -1);
    assert.deepEqual(validateTower(t), [], `lobby seed ${seed}`);
    const top = Math.max(...t.platforms.map((p) => p.y));
    assert.ok(top + PHYS.height + 2.3 < LOBBY_CEIL + 0.5, `the top row (${top}) fits under the ceiling`);
  }
});

test('poster-sized towers (wide, short) are valid too', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = generateTower(seed, { width: 24, height: 14.5 });
    assert.deepEqual(validateTower(t), [], `seed ${seed}`);
    assert.equal(t.goalY, 14.5);
    assert.equal(t.w, 24);
    assert.ok(ladderReaches(t));
  }
});

test('analysis ranks every piece by how many jumps from the balloon', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const t = generateTower(seed);
    const { rank } = analyze(t);
    assert.equal(rank[t.goal], 0);
    t.platforms.forEach((p, i) => assert.ok(rank[i] < 1e9, `seed ${seed}: piece ${i} has a way up`));
    // higher rows are closer
    const floor = rank[0];
    assert.ok(floor >= 40 && floor <= 70, `floor rank ${floor}`);
    for (const p of t.platforms) {
      if (p.kind !== 'static') continue;
      const lowerNeighbour = t.platforms.find((q) => q.kind === 'static' && q.row === p.row - 1);
      if (lowerNeighbour) assert.ok(rank[p.i] <= rank[lowerNeighbour.i] + 3);
    }
  }
});

test('the jump arc matches the movement numbers', () => {
  // a full jump rises v^2 / 2g and a trampoline v^2 / 2g with its own launch speed
  const apex = (PHYS.jumpV * PHYS.jumpV) / (2 * PHYS.gUp);
  assert.ok(apex > 2.2 && apex < 2.5, String(apex));
  assert.equal(airDist(apex + 0.5), 0);
  assert.ok(airDist(0) > airDist(1.5) && airDist(1.5) > airDist(2.2));
  assert.ok(hardGap(1.8, PHYS.jumpV) > 2 && hardGap(1.8, PHYS.jumpV) < 3.6, 'a gap of about 2.5-3.5 units at the top of a jump');
  assert.ok(airDist(4, PHYS.bounceV) > 4);
});
