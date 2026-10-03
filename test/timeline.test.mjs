import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, hostileTypes, shipCount, hostileCount } from '../src/sim/timeline.js';
import { computeMods } from '../src/sim/modifiers.js';
import { WEATHER } from '../src/sim/data/weather.js';
import { HOSTILES } from '../src/sim/data/hostiles.js';
import { BARE } from './helpers.mjs';

test('a thousand decks are valid on every night', () => {
  const mods = computeMods(BARE);
  for (let seed = 1; seed <= 1000; seed++) {
    const night = 1 + (seed % 12);
    const weather = WEATHER[Object.keys(WEATHER)[seed % 6]];
    const tl = buildTimeline({ s: seed }, { night, mods, weather });
    assert.equal(tl.len, 540);
    let last = 0;
    const ships = tl.events.filter((e) => e.kind === 'ship');
    const hostile = tl.events.filter((e) => e.kind === 'hostile');
    assert.equal(ships.length, shipCount(night, mods));
    assert.equal(hostile.length, hostileCount(night, mods));
    for (const e of tl.events) {
      assert.ok(e.t >= last - 1e-9 && e.t >= 1 && e.t <= tl.len, `event out of order or out of the night: ${JSON.stringify(e)}`);
      last = e.t;
      if (e.kind === 'hostile') {
        assert.ok(HOSTILES[e.type].minNight <= night, `${e.type} too early on night ${night}`);
        assert.ok(!(e.t > tl.calm[0] - 10 && e.t < tl.calm[1]) || hostile.length > 60, 'hostile event inside the calm window');
      }
      if (e.kind === 'ship') assert.ok(e.name.length <= 24 && e.hail >= 0);
    }
    // The night that unlocks a type always teaches it.
    const types = hostileTypes(night);
    const newest = types[types.length - 1];
    if (HOSTILES[newest].minNight === night && hostile.length) assert.ok(hostile.some((e) => e.type === newest), `night ${night} lacks ${newest}`);
    if (weather.thunder) assert.ok(tl.events.some((e) => e.kind === 'strike'));
    if (night === 12) assert.ok(tl.events.some((e) => e.kind === 'titan'));
    const dup = tl.events.filter((e) => e.kind === 'ship').map((e) => e.name);
    assert.ok(new Set(dup).size === dup.length || dup.length > 30, 'ship names repeat');
  }
});

test('the deck is deterministic and reacts to charters', () => {
  const mods = computeMods(BARE);
  const a = buildTimeline({ s: 9 }, { night: 6, mods, weather: WEATHER.rain });
  const b = buildTimeline({ s: 9 }, { night: 6, mods, weather: WEATHER.rain });
  assert.deepEqual(a, b);
  const quiet = computeMods({ ...BARE, charter: 'quiet-night' });
  const q = buildTimeline({ s: 9 }, { night: 6, mods: quiet, weather: WEATHER.rain });
  assert.equal(q.events.filter((e) => e.kind === 'hostile').length, 0);
  assert.equal(q.events.filter((e) => e.kind === 'ship').length, shipCount(6, mods) * 2);
  const short = computeMods({ ...BARE, charter: 'short-watch' });
  const s = buildTimeline({ s: 9 }, { night: 6, mods: short, weather: WEATHER.rain });
  assert.equal(s.len, 360);
  assert.ok(s.events.every((e) => e.t <= 360));
});
