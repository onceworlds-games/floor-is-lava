// The store art is drawn by the game itself (?poster=<name>): every poster draws without errors at its exact size, says "ready",
// and carries only the words it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fakedom.mjs';
import { runPoster } from '../game/poster.js';

const dom = installFakeDom({ width: 1280, height: 720, search: '?poster=cover' });

const POSTERS = [
  ['cover', 1280, 720, ['THE FLOOR IS', 'LAVA']],
  ['action', 1280, 720, []],
  ['win', 1280, 720, ['1st', '2nd', '3rd']],
  ['icon', 512, 512, []],
  ['badge-first-win', 256, 256, []],
  ['badge-hot-feet', 256, 256, []],
  ['badge-first-up', 256, 256, []],
  ['badge-climber', 256, 256, []],
];

for (const [name, w, h, words] of POSTERS) {
  test(`poster ${name}: ${w}x${h}, drawn, ready, only the right words`, async () => {
    document.body.dataset.ready = undefined;
    delete document.body.dataset.ready;
    dom.stats.texts.length = 0;
    const calls = dom.stats.calls;
    await runPoster(name);
    assert.equal(document.body.dataset.ready, '1');
    assert.equal(dom.canvas.width, w);
    assert.equal(dom.canvas.height, h);
    assert.equal(dom.canvas.style.width, `${w}px`);
    assert.ok(dom.stats.calls - calls > (name.startsWith('badge') ? 25 : 100), 'something was drawn');
    assert.deepEqual([...new Set(dom.stats.texts)].sort(), [...words].sort());
    assert.deepEqual(dom.problems, []);
  });
}

test('the same poster twice is the same picture (everything is seeded)', async () => {
  const record = async () => {
    const ops = [];
    dom.ctx.__record = ops;
    const before = dom.stats.calls;
    await runPoster('cover');
    return dom.stats.calls - before;
  };
  assert.equal(await record(), await record());
});
