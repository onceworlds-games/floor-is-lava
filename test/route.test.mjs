import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoute, routeAt, shipPos, reefAt, reefPoints, SEA_R } from '../src/sim/route.js';
import { SITE_ORDER, SITES } from '../src/sim/data/sites.js';

test('every site has a continuous route inside the sea with a reef on both sides', () => {
  for (const id of SITE_ORDER) {
    const route = buildRoute(id);
    assert.ok(route.L > 400 && route.L < 900, `${id} length ${route.L}`);
    assert.ok(route.narrows.length >= 1, `${id} has narrows`);
    let prev = null;
    for (let s = 0; s <= route.L; s += 2.5) {
      const p = routeAt(route, s);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.h));
      assert.ok(p.reefL >= SITES[id].reefMin - 0.01 && p.reefR >= SITES[id].reefMin - 0.01);
      assert.ok(Math.hypot(p.x, p.z) < SEA_R - 40, `${id} route leaves the sea at s=${s}`);
      if (prev) assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) < 4, 'route jumps');
      prev = p;
    }
    // The reef sits where it says it does.
    for (const side of [-1, 1]) for (const r of reefPoints(route, side, 25)) {
      assert.ok(Math.hypot(r.x, r.z) < SEA_R, 'reef inside the sea');
      const back = shipPos(route, r.s, side * r.w);
      assert.ok(Math.hypot(back.x - r.x, back.z - r.z) < 0.01);
    }
    assert.equal(reefAt(route, 100, 5), routeAt(route, 100).reefR);
    assert.equal(reefAt(route, 100, -5), routeAt(route, 100).reefL);
  }
});

test('routeAt clamps outside the line', () => {
  const route = buildRoute('skerry-rock');
  assert.deepEqual(routeAt(route, -50), route.pts[0]);
  assert.deepEqual(routeAt(route, route.L + 50), route.pts[route.pts.length - 1]);
  assert.ok(Number.isFinite(routeAt(route, NaN).x));
});
