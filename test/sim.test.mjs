import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeBody, stepBody, stepGhost, reachedGoal, standingOn, crumbleState, isSolid, platformX, EV_JUMP, EV_LAND, EV_BOUNCE, EV_DROP } from '../game/sim.js';
import { generateTower } from '../game/tower.js';
import { PHYS, mulberry32 } from '../game/rules.js';

const DT = PHYS.dt;
const FLOOR = { kind: 'floor', f: 'floor', x: 7, y: 0, w: 18 };

function worldOf(extra = [], opts = {}, tower = {}) {
  const ps = [FLOOR, ...extra].map((p, i) => ({ i, c: 0, row: 0, f: 'couch', w: 4, ...p }));
  return makeWorld({ w: 14, lobby: false, goal: -1, goalY: 60, platforms: ps, ...tower }, opts);
}
const idle = () => ({ x: 0, down: false, jump: false, tap: false });
function run(world, b, steps, inp, t0 = 0) {
  for (let k = 0; k < steps; k++) {
    const i = typeof inp === 'function' ? inp(k, b) : inp;
    stepBody(world, b, i, DT, t0 + k * DT, true);
  }
}

test('a body stands on the floor and stays there', () => {
  const w = worldOf();
  const b = makeBody(7, 0);
  run(w, b, 120, idle());
  assert.equal(b.y, 0);
  assert.equal(b.on, 1);
  assert.equal(b.gi, 0);
  assert.equal(b.vy, 0);
});

test('a full jump rises about 2.35 units; a quick tap about 1.2', () => {
  for (const [hold, lo, hi] of [[true, 2.2, 2.45], [false, 1.0, 1.6]]) {
    const w = worldOf();
    const b = makeBody(7, 0);
    run(w, b, 30, idle());
    let top = 0;
    for (let k = 0; k < 80; k++) {
      stepBody(w, b, { x: 0, down: false, jump: hold, tap: k === 0 }, DT, k * DT, true);
      top = Math.max(top, b.y);
    }
    assert.ok(top >= lo && top <= hi, `${hold ? 'held' : 'tapped'} jump apex ${top}`);
  }
});

test('running: 40 u/s^2 up to 6.5 u/s on the ground, 22 in the air, and it stops', () => {
  const w = worldOf();
  const b = makeBody(3, 0);
  run(w, b, 10, idle());
  stepBody(w, b, { x: 1, down: false, jump: false, tap: false }, DT, 0, true);
  assert.ok(Math.abs(b.vx - 40 * DT) < 1e-9, `accel ${b.vx}`);
  run(w, b, 20, { x: 1, down: false, jump: false, tap: false });
  assert.equal(b.vx, PHYS.maxSpeed);
  run(w, b, 120, idle());
  assert.equal(b.vx, 0, 'friction stops it');
  // in the air
  const a = makeBody(3, 5);
  stepBody(w, a, { x: 1, down: false, jump: false, tap: false }, DT, 0, true);
  assert.ok(Math.abs(a.vx - 22 * DT) < 1e-9, `air accel ${a.vx}`);
  assert.equal(b.face, 1);
});

test('coyote time: a jump just after walking off an edge still works, later does not', () => {
  const plat = { kind: 'static', x: 3, y: 2, w: 2 };
  for (const [wait, expectJump] of [[0.07, true], [0.25, false]]) {
    const w = worldOf([plat]);
    const b = makeBody(3, 2);
    run(w, b, 20, idle());
    assert.equal(b.on, 1);
    // run right off the edge
    let k = 0;
    while (b.on && k < 200) {
      stepBody(w, b, { x: 1, down: false, jump: false, tap: false }, DT, k++ * DT, true);
    }
    assert.equal(b.on, 0, 'off the edge');
    for (let i = 0; i < Math.round(wait / DT); i++) stepBody(w, b, { x: 1, down: false, jump: false, tap: false }, DT, k++ * DT, true);
    b.ev = 0;
    stepBody(w, b, { x: 1, down: false, jump: true, tap: true }, DT, k++ * DT, true);
    assert.equal(Boolean(b.ev & EV_JUMP), expectJump, `wait ${wait}`);
  }
});

test('jump buffer: pressing jump a moment before landing jumps on landing', () => {
  const w = worldOf();
  const b = makeBody(7, 1.0);
  let jumped = false;
  for (let k = 0; k < 60 && !jumped; k++) {
    // press when about 0.07 s from the floor
    const tap = b.y < 0.35 && b.vy < 0 && !b.on && k > 3;
    stepBody(w, b, { x: 0, down: false, jump: true, tap: tap && !jumped }, DT, k * DT, true);
    if (b.ev & EV_JUMP) jumped = true;
  }
  assert.ok(jumped, 'the early press was remembered');
});

test('furniture is one-way: jump up through it from below, land on top, drop back through', () => {
  const w = worldOf([{ kind: 'static', x: 7, y: 1.8, w: 3 }]);
  const b = makeBody(7, 0);
  run(w, b, 20, idle());
  let passed = false;
  for (let k = 0; k < 60; k++) {
    stepBody(w, b, { x: 0, down: false, jump: true, tap: k === 0 }, DT, k * DT, true);
    if (b.y > 1.85 && b.vy > 0) passed = true;
  }
  assert.ok(passed, 'went up through the underside');
  assert.equal(b.on, 1);
  assert.equal(b.gi, 1);
  assert.ok(Math.abs(b.y - 1.8) < 1e-9, `standing on top (${b.y})`);
  // press down: through it, onto the floor
  b.ev = 0;
  stepBody(w, b, { x: 0, down: true, jump: false, tap: false }, DT, 5, true);
  assert.ok(b.ev & EV_DROP);
  run(w, b, 60, (k) => ({ x: 0, down: k < 3, jump: false, tap: false }), 5.1);
  assert.equal(b.gi, 0, 'landed on the floor');
  assert.equal(b.y, 0);
});

test('the floor cannot be dropped through', () => {
  const w = worldOf();
  const b = makeBody(7, 0);
  run(w, b, 30, { x: 0, down: true, jump: false, tap: false });
  assert.equal(b.on, 1);
  assert.equal(b.y, 0);
});

test('a trampoline throws you about 5 units up and never lets you stand on it', () => {
  const w = worldOf([{ kind: 'bounce', f: 'trampoline', x: 7, y: 1.0, w: 3 }]);
  const b = makeBody(7, 4);
  let launched = false;
  let apex = 0;
  for (let k = 0; k < 120; k++) {
    stepBody(w, b, idle(), DT, k * DT, true);
    if (b.ev & EV_BOUNCE) {
      launched = true;
      assert.equal(b.vy, PHYS.bounceV);
      assert.equal(b.bi, 1);
    }
    if (launched) apex = Math.max(apex, b.y);
    assert.ok(!(b.on && b.gi === 1), 'never standing on the trampoline');
    b.ev = 0;
  }
  assert.ok(launched);
  assert.ok(apex - 1.0 > 4.7 && apex - 1.0 < 5.3, `bounce rise ${apex - 1.0}`);
});

test('a pillow wobbles for 0.6 s once stood on, falls for 4 s, then is back', () => {
  const w = worldOf([{ kind: 'crumble', f: 'pillows', x: 7, y: 2, w: 2 }]);
  const b = makeBody(7, 2);
  assert.equal(crumbleState(w, 1, 0), 0);
  stepBody(w, b, idle(), DT, 10, true); // stands: touched at t = 10
  assert.equal(w.ct[1], 10);
  assert.equal(crumbleState(w, 1, 10.2), 1);
  assert.ok(isSolid(w, 1, 10.5));
  assert.equal(crumbleState(w, 1, 10.7), 2);
  assert.ok(!isSolid(w, 1, 10.7));
  assert.equal(crumbleState(w, 1, 14.5), 2);
  assert.equal(crumbleState(w, 1, 14.7), 0, 'back after about 4.6 s');
  assert.ok(isSolid(w, 1, 14.7));
  // standing on it when it falls: you fall
  const b2 = makeBody(7, 2);
  const w2 = worldOf([{ kind: 'crumble', f: 'pillows', x: 7, y: 2, w: 2 }]);
  run(w2, b2, 90, idle(), 0);
  assert.ok(b2.y < 1.9, `fell through the fallen pillow (${b2.y})`);
  // a look-ahead (live = false) changes nothing in the world
  const w3 = worldOf([{ kind: 'crumble', f: 'pillows', x: 7, y: 2, w: 2 }, { kind: 'bounce', f: 'trampoline', x: 3, y: 1, w: 2 }]);
  const probe = makeBody(7, 2.5);
  for (let k = 0; k < 60; k++) stepBody(w3, probe, idle(), DT, k * DT, false);
  assert.equal(w3.ct[1], -1);
  const p2 = makeBody(3, 3);
  for (let k = 0; k < 60; k++) stepBody(w3, p2, idle(), DT, k * DT, false);
  assert.equal(w3.bt[2], -99);
});

test('a rolling chair carries what stands on it', () => {
  const chair = { kind: 'move', f: 'chair', x: 7, y: 2, w: 2, amp: 2, period: 4, phase: 0 };
  const w = worldOf([chair]);
  const b = makeBody(7, 2);
  let t = 0;
  for (let k = 0; k < 40; k++) stepBody(w, b, idle(), DT, t += DT, true);
  const rel0 = b.x - platformX(chair, t);
  for (let k = 0; k < 120; k++) stepBody(w, b, idle(), DT, t += DT, true);
  assert.equal(b.on, 1);
  assert.equal(b.gi, 1);
  assert.ok(Math.abs(b.x - platformX(chair, t) - rel0) < 0.02, 'rides along');
  assert.ok(Math.abs(platformX(chair, 1) - 9) < 1e-9, 'a sine on the match clock');
});

test('the walls hold you in and the lobby ceiling stops your head', () => {
  const w = worldOf();
  const b = makeBody(7, 0);
  run(w, b, 200, { x: -1, down: false, jump: false, tap: false });
  assert.equal(b.x, PHYS.halfW);
  assert.equal(b.vx, 0);
  run(w, b, 200, { x: 1, down: false, jump: false, tap: false });
  assert.equal(b.x, 14 - PHYS.halfW);
  const lobby = makeWorld(generateTower(7, { lobby: true }));
  const c = makeBody(7, 0);
  let top = 0;
  for (let k = 0; k < 200; k++) {
    stepBody(lobby, c, { x: 0, down: false, jump: true, tap: k % 30 === 0 }, DT, k * DT, true);
    top = Math.max(top, c.y + PHYS.height);
  }
  assert.ok(top <= lobby.ceiling + 1e-9, `head at ${top}`);
});

test('falling is capped at 18 u/s', () => {
  const w = worldOf([], { floorUntil: 0 });
  const b = makeBody(7, 50);
  let worst = 0;
  for (let k = 0; k < 300; k++) {
    stepBody(w, b, idle(), DT, k * DT, true);
    worst = Math.max(worst, -b.vy);
  }
  assert.equal(worst, PHYS.maxFall);
  assert.ok(b.y < 0, 'the melted floor lets you through');
});

test('the balloon basket: standing in it is safe, below it is not', () => {
  const goal = { kind: 'goal', f: 'basket', x: 7, y: 20, w: 3.4 };
  const w = worldOf([goal], {}, { goal: 1, goalY: 20 });
  assert.ok(!reachedGoal(w, makeBody(7, 19.5)));
  assert.ok(!reachedGoal(w, makeBody(1, 20)), 'beside it');
  assert.ok(reachedGoal(w, makeBody(7, 20)));
  assert.ok(reachedGoal(w, makeBody(8.6, 20.4)));
  assert.ok(!reachedGoal(w, makeBody(7, 30)), 'way above it');
  const b = makeBody(7, 22);
  run(w, b, 60, idle());
  assert.ok(reachedGoal(w, b), 'a body dropped onto the basket lands in it');
});

test('a ghost floats through everything, stays in the shaft and above the lava', () => {
  const w = worldOf([{ kind: 'static', x: 7, y: 2, w: 12 }], {}, { goalY: 30 });
  const g = makeBody(7, 1);
  for (let k = 0; k < 600; k++) stepGhost(w, g, { x: k < 300 ? -1 : 1, my: 0 }, DT, 0.3);
  assert.ok(g.y > 5, 'floats up through the furniture');
  for (let k = 0; k < 600; k++) stepGhost(w, g, { x: -1, my: 1 }, DT, 0.3);
  assert.ok(g.x >= 0.4 && g.x <= 13.6);
  assert.ok(g.y <= 34, 'stops above the balloon');
  for (let k = 0; k < 600; k++) stepGhost(w, g, { x: 0, my: -1 }, DT, 12);
  assert.ok(g.y >= 12.6, 'pushed up by the lava');
  for (const v of [g.x, g.y, g.vx, g.vy]) assert.ok(Number.isFinite(v));
});

test('standingOn finds the piece under a position', () => {
  const w = worldOf([{ kind: 'static', x: 3, y: 2, w: 2 }, { kind: 'static', x: 10, y: 2.1, w: 2 }]);
  assert.equal(standingOn(w, 3, 2, 0), 1);
  assert.equal(standingOn(w, 10.1, 2.1, 0), 2);
  assert.equal(standingOn(w, 6.5, 2, 0), -1);
  assert.equal(standingOn(w, 3.0, 2.7, 0), -1, 'in the air');
  assert.equal(standingOn(w, 7, 0, 0), 0, 'the floor');
  const w2 = worldOf([], { floorUntil: 4 });
  assert.equal(standingOn(w2, 7, 0, 5), -1, 'the floor melted');
});

test('the same inputs always give the same body', () => {
  const t = generateTower(5);
  const run1 = () => {
    const w = makeWorld(t, { floorUntil: 4 });
    const b = makeBody(7, 0);
    const rnd = mulberry32(3);
    for (let k = 0; k < 2000; k++) stepBody(w, b, { x: rnd() < 0.5 ? 1 : -1, down: rnd() < 0.05, jump: rnd() < 0.6, tap: rnd() < 0.1 }, DT, k * DT, true);
    return [b.x, b.y, b.vx, b.vy, b.on];
  };
  assert.deepEqual(run1(), run1());
});

test('wild input never makes a number up (5000 steps on a real tower, many seeds)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const t = generateTower(seed);
    const w = makeWorld(t, { floorUntil: 4 });
    const b = makeBody(7, 0);
    const rnd = mulberry32(seed);
    let ev = 0;
    for (let k = 0; k < 5000; k++) {
      const tt = k * DT;
      stepBody(w, b, { x: rnd() * 2 - 1, down: rnd() < 0.1, jump: rnd() < 0.5, tap: rnd() < 0.08 }, DT, tt, true);
      ev |= b.ev;
      b.ev = 0;
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy), `seed ${seed} step ${k}`);
      assert.ok(b.x >= PHYS.halfW - 1e-9 && b.x <= 14 - PHYS.halfW + 1e-9);
      assert.ok(Math.abs(b.vy) <= Math.max(PHYS.maxFall, PHYS.bounceV) + 1e-9);
      if (b.y < -30) {
        b.y = 0;
        b.vy = 0;
      }
    }
    assert.ok(ev & EV_JUMP && ev & EV_LAND, 'it jumped and landed');
  }
});
