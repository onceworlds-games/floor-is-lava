import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fakedom.mjs';
import { Sound } from '../game/audio.js';

const dom = installFakeDom();

test('every sound and the music play without a bad number, and nothing plays before the first tap', () => {
  const s = new Sound();
  s.jump();
  s.land(8);
  s.fanfare();
  s.setMusic('play');
  assert.equal(s.ready, false);
  assert.equal(dom.stats.audioNodes, 0, 'silent until unlocked');
  s.unlock();
  assert.equal(s.ready, true);
  const before = dom.stats.audioNodes;
  for (const name of ['jump', 'land', 'bounce', 'pop', 'tap', 'tick', 'go', 'shout', 'lavaShout', 'melt', 'warn', 'crumble', 'lavaPop', 'out', 'ghost', 'safe', 'place', 'points', 'fanfare', 'whoosh']) s[name](name === 'land' ? 14 : 1);
  s.place(0);
  s.place(3, 0.4);
  s.land(0);
  s.land(100, 0);
  assert.ok(dom.stats.audioNodes > before + 30, 'they made sound');
  // the music: a bar of every layer in the menu, then in play, with the clock running
  for (const mode of ['menu', 'play', 'off', 'menu', 'play']) {
    s.setMusic(mode);
    for (let k = 0; k < 400; k++) dom.idle(50);
  }
  s.stopMusic();
  assert.deepEqual(dom.problems, []);
  // a tab that slept does not play the notes it missed all at once
  s.setMusic('play');
  const n0 = dom.stats.audioNodes;
  dom.idle(60000);
  assert.ok(dom.stats.audioNodes - n0 < 400, 'no burst after a long sleep');
});

test('audio that cannot start never throws into the game', () => {
  const s = new Sound();
  const saved = globalThis.AudioContext;
  globalThis.AudioContext = class {
    constructor() {
      throw new Error('blocked');
    }
  };
  s.unlock();
  assert.equal(s.ready, false);
  s.jump();
  s.setMusic('play');
  s.fanfare();
  globalThis.AudioContext = saved;
});
