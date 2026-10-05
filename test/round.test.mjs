import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundCtx } from '../game/round.js';
import { buildRoster } from '../game/rules.js';
import { makeVis, updateVis, Fx } from '../game/fx.js';

function ctx() {
  const roster = buildRoster(['me'], 1);
  return new RoundCtx({ rid: 'm1.1', round: 1, seed: 5, lava: 'normal', t0: 1500, roster });
}
const snap = (t, x, y, s = 0) => ({ rid: 'm1.1', t, p: Array.from({ length: 5 }, (_, i) => [x + i, y, 1, 2, 1, s, 1]) });

test('a round knows its tower, its people and which bots there are', () => {
  const c = ctx();
  assert.equal(c.botIds.length, 5);
  assert.equal(c.index.get('me'), 0);
  assert.equal(c.index.get('bot3'), 3);
  assert.ok(c.world.platforms.length > 100);
  assert.equal(c.base, 0.9);
  assert.equal(c.visOf('x'), c.visOf('x'));
});

test('bot snapshots are validated: wrong round, wrong size, junk numbers, going backwards', () => {
  const c = ctx();
  c.pushSnap(null);
  c.pushSnap({ rid: 'other', t: 1, p: snap(1, 1, 1).p });
  c.pushSnap({ rid: 'm1.1', t: 1, p: snap(1, 1, 1).p.slice(1) });
  c.pushSnap({ rid: 'm1.1', t: NaN, p: snap(1, 1, 1).p });
  c.pushSnap({ rid: 'm1.1', t: 1, p: [[1, 2, 3], [], [], [], []] });
  c.pushSnap({ rid: 'm1.1', t: 1, p: snap(1, 1, 1).p.map((s) => s.map((n, k) => (k === 1 ? 'x' : n))) });
  assert.equal(c.snaps.length, 0);
  c.pushSnap(snap(1000, 3, 4));
  c.pushSnap(snap(900, 9, 9));
  assert.equal(c.snaps.length, 1, 'older than the newest: ignored');
  for (let k = 0; k < 10; k++) c.pushSnap(snap(1100 + k * 80, 3, 4));
  assert.ok(c.snaps.length <= 6, 'only the last few are kept');
});

test('a bot is drawn between the two snapshots around a moment a little in the past', () => {
  const c = ctx();
  const out = { x: 0, y: 0, vx: 0, vy: 0, o: 0, s: 0, f: 0 };
  assert.equal(c.sampleBot(0, 1000, out), false, 'nothing known yet');
  c.pushSnap(snap(1000, 2, 10));
  c.pushSnap(snap(1080, 3, 12));
  c.pushSnap(snap(1160, 4, 14));
  assert.ok(c.sampleBot(0, 1040, out));
  assert.ok(Math.abs(out.x - 2.5) < 1e-9 && Math.abs(out.y - 11) < 1e-9, `${out.x}, ${out.y}`);
  assert.ok(c.sampleBot(2, 1120, out));
  assert.ok(Math.abs(out.x - 5.5) < 1e-9, 'each bot has its own place in the list');
  assert.equal(out.o, 1);
  assert.equal(out.f, 1);
  c.sampleBot(0, 5000, out);
  assert.equal(out.x, 4, 'nothing is guessed past the newest');
  c.sampleBot(0, 10, out);
  assert.equal(out.x, 2, 'nor before the oldest');
  // a teleport (a new host, a new round) is not slid across
  c.pushSnap(snap(1240, 12, 50));
  c.sampleBot(0, 1200, out);
  assert.equal(out.x, 12);
  assert.equal(out.y, 50);
});

test('a character lands, jumps and bounces with a squash, dust and sounds that follow its feet', () => {
  const fx = new Fx();
  const heard = [];
  const snd = { land: (v) => heard.push(['land', Math.round(v)]), jump: () => heard.push(['jump']), bounce: () => heard.push(['bounce']) };
  const vis = makeVis();
  const st = { x: 5, y: 0, vx: 0, vy: 0, o: 1, s: 0 };
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  assert.deepEqual(heard, []);
  Object.assign(st, { o: 0, vy: 12, y: 0.2 });
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  assert.deepEqual(heard, [['jump']]);
  assert.ok(vis.sq > 0.2, 'stretched');
  Object.assign(st, { o: 0, vy: -10, y: 1 });
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  Object.assign(st, { o: 1, vy: 0, y: 0 });
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  assert.deepEqual(heard.at(-1), ['land', 10]);
  assert.ok(vis.sq < -0.1 || vis.sqv < 0, 'squashed');
  for (let k = 0; k < 120; k++) updateVis(vis, st, 1 / 60, fx, snd, 1);
  assert.ok(Math.abs(vis.sq) < 0.01, 'the spring settles');
  Object.assign(st, { o: 0, vy: -9, y: 3 });
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  Object.assign(st, { o: 0, vy: 19, y: 3.1 });
  updateVis(vis, st, 1 / 60, fx, snd, 1);
  assert.deepEqual(heard.at(-1), ['bounce']);
  heard.length = 0;
  Object.assign(st, { o: 1, vy: 0, y: 0 });
  updateVis(vis, st, 1 / 60, fx, snd, 0);
  assert.deepEqual(heard, [], 'volume 0 is silence');
});

test('the particle pool never grows past its cap and everything fades out', () => {
  const fx = new Fx();
  for (let k = 0; k < 40; k++) fx.confetti(0, 0, 80);
  assert.ok(fx.live <= 360);
  fx.quality = 0;
  fx.clear();
  for (let k = 0; k < 40; k++) fx.confetti(0, 0, 80);
  assert.ok(fx.live <= 110, `low quality: ${fx.live}`);
  for (let k = 0; k < 400; k++) fx.update(1 / 30, 8);
  assert.equal(fx.live, 0);
  fx.reduced = true;
  fx.shake(1);
  fx.hitstop(100);
  assert.equal(fx.trauma, 0, 'no shake with reduced motion');
  assert.equal(fx.freeze, 0);
  fx.reduced = false;
  fx.shake(0.5);
  fx.update(1 / 60, 20);
  assert.ok(Math.abs(fx.shakeX) <= 20 && Math.abs(fx.shakeY) <= 20);
  for (let k = 0; k < 200; k++) fx.update(1 / 60, 20);
  assert.equal(fx.shakeX, 0);
});
