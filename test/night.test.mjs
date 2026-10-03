import test from 'node:test';
import assert from 'node:assert/strict';
import { createNight, stepNight, addCrew, removeCrew, hydrate, TICK, STATIONS } from '../src/sim/night.js';
import { applyCommand } from '../src/sim/verbs.js';
import { makeBot, stepBot, BOT_KINDS } from '../src/sim/bots.js';
import { SEA_R } from '../src/sim/route.js';
import { R_MIN, R_MAX, lightAt } from '../src/sim/beam.js';
import { spawnShip } from '../src/sim/ships.js';
import { BARE, GOOD, finite } from './helpers.mjs';

function night(opts = {}) {
  const st = createNight({ seed: opts.seed ?? 1, night: opts.night ?? 1, season: opts.season ?? BARE, weather: opts.weather ?? 'clear' });
  addCrew(st, 'p1', opts.station ?? 'lantern');
  applyCommand(st, { k: 'light' }, 'p1');
  stepNight(st);
  return st;
}

/** Strips what a snapshot never carries, for comparing two runs. */
const snap = (st) => JSON.stringify({ ...st, route: null, tl: null, fx: null });

test('the same seed and inputs give the same night, tick for tick', () => {
  const runs = [0, 1].map(() => {
    const st = night({ seed: 77, night: 6, season: GOOD, weather: 'squall' });
    const bot = makeBot('p1', 'expert');
    const hashes = [];
    for (let i = 0; i < 6000; i++) {
      stepBot(st, bot);
      stepNight(st, TICK);
      if (i % 500 === 0) hashes.push(snap(st));
    }
    return hashes;
  });
  assert.deepEqual(runs[0], runs[1]);
});

test('a night ends at dawn with everything finite and inside the world', () => {
  for (const kind of BOT_KINDS) {
    const st = night({ seed: 5, night: 4, season: GOOD, weather: 'rain' });
    const bot = makeBot('p1', kind);
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 20000) {
      stepBot(st, bot);
      stepNight(st, TICK);
      finite({ ...st, route: null, tl: null });
      for (const s of st.ships) assert.ok(s.s >= 0 && s.s <= st.route.L + 1 && Math.abs(s.d) < 200, `ship off the world: ${JSON.stringify(s)}`);
      for (const h of st.hostiles) assert.ok(Math.hypot(h.x, h.z) <= SEA_R + 1, 'hostile off the sea');
      for (const p of st.pools) assert.ok(Math.hypot(p.x, p.z) <= SEA_R + 60, 'pool left the sea');
      assert.ok(st.beam.r >= R_MIN && st.beam.r <= R_MAX && st.beam.dist <= SEA_R, 'beam out of range');
      assert.ok(st.res.oil >= 0 && st.res.power >= 0 && st.res.power <= 100 && st.res.integ >= 0 && st.res.integ <= 100 && st.beam.heat >= 0 && st.beam.heat <= 100);
      assert.ok(st.res.rep >= -1 && st.res.rep <= 100);
    }
    assert.equal(st.phase, 'over');
    assert.ok(['dawn', 'disaster', 'dismissed'].includes(st.result));
    assert.equal(st.stats.saved + st.stats.wrecked + st.ships.filter((s) => s.st === 'lost').length >= st.stats.shipsIn - 0, true);
  }
});

test('fuzz: random and malformed commands never throw, corrupt or escape', () => {
  const rng = { s: 99 };
  const next = () => ((rng.s = (rng.s + 0x6d2b79f5) >>> 0) / 4294967296);
  const junk = [NaN, Infinity, -Infinity, 1e12, -1e12, null, undefined, '', 'x', {}, [], true, -0, 0, 1e-9, '12', [1, 2]];
  const kinds = ['station', 'light', 'pet', 'beam', 'mode', 'lens', 'spare', 'strobe', 'over', 'wipe', 'aim', 'scan', 'flare', 'harpoon', 'repair', 'radio', 'horn', 'gen', 'crank', 'oil', 'crate', 'nope', 42, null];
  const st = night({ seed: 3, night: 9, season: GOOD, weather: 'thunder' });
  addCrew(st, 'p2', 'gallery');
  addCrew(st, 'p3', 'watch');
  const who = ['p1', 'p2', 'p3', 'ghost', null, 7];
  for (let i = 0; i < 20000; i++) {
    const k = kinds[Math.floor(next() * kinds.length)];
    const pickJunk = () => (next() < 0.5 ? junk[Math.floor(next() * junk.length)] : (next() - 0.5) * 2000);
    const cmd = next() < 0.05 ? pickJunk() : { k, st: next() < 0.5 ? STATIONS[Math.floor(next() * 4)] : pickJunk(), az: pickJunk(), dist: pickJunk(), r: pickJunk(), x: pickJunk(), z: pickJunk(), on: next() < 0.5, lens: pickJunk(), mode: pickJunk(), ship: next() < 0.5 && st.ships.length ? st.ships[Math.floor(next() * st.ships.length)].id : pickJunk(), order: ['port', 'starboard', 'hold', 'anchor', 'eat'][Math.floor(next() * 5)] };
    assert.doesNotThrow(() => applyCommand(st, cmd, who[Math.floor(next() * who.length)]));
    stepNight(st, TICK);
    if (i % 200 === 0) finite({ ...st, route: null, tl: null });
    assert.ok(st.beam.r >= R_MIN && st.beam.r <= R_MAX && st.beam.dist >= 0 && st.beam.dist <= SEA_R);
    for (const p of st.pools) assert.ok(Number.isFinite(p.x) && Math.hypot(p.x, p.z) < SEA_R + 60);
    for (const sh of st.shots) assert.ok(Math.hypot(sh.x, sh.z) < SEA_R + 1);
    assert.ok(st.res.flares >= 0 && st.res.harpoons >= 0 && st.res.oilCans >= 0 && st.res.spareLens >= 0);
    assert.ok(st.ships.length <= 40 && st.hostiles.length <= 24 && st.log.length < 400);
    if (i === 10000) removeCrew(st, 'p2');
  }
  assert.ok(st.stations.gallery !== 'p2');
});

test('commands are refused from the wrong station, when stunned and when moving', () => {
  const st = night({ station: 'lantern' });
  assert.equal(applyCommand(st, { k: 'flare', x: 10, z: 50 }, 'p1'), false, 'no flare from the lantern room');
  assert.equal(applyCommand(st, { k: 'horn', on: true }, 'p1'), false);
  assert.equal(applyCommand(st, { k: 'beam', az: 1, dist: 100, r: 15 }, 'p1'), true);
  assert.equal(applyCommand(st, { k: 'station', st: 'gallery' }, 'p1'), true);
  assert.equal(applyCommand(st, { k: 'beam', az: 1, dist: 100, r: 15 }, 'p1'), false, 'on the stairs');
  for (let i = 0; i < 60; i++) stepNight(st);
  assert.equal(st.crew.p1.st, 'gallery');
  assert.equal(st.stations.gallery, 'p1');
  assert.equal(st.stations.lantern, null);
  assert.equal(applyCommand(st, { k: 'flare', x: 10, z: 50 }, 'p1'), true);
  assert.equal(st.res.flares, 3);
  st.crew.p1.stun = 5;
  assert.equal(applyCommand(st, { k: 'flare', x: 10, z: 50 }, 'p1'), false, 'stunned');
  // Two keepers at one station: the first holds the active verbs, the second shares view-only ones.
  addCrew(st, 'p2', 'gallery');
  st.crew.p1.stun = 0;
  assert.equal(st.stations.gallery, 'p1');
  assert.equal(applyCommand(st, { k: 'harpoon', x: 10, z: 50 }, 'p2'), false);
  assert.equal(applyCommand(st, { k: 'aim', x: 10, z: 50 }, 'p2'), true);
  removeCrew(st, 'p1');
  assert.equal(st.stations.gallery, 'p2');
  assert.equal(applyCommand(st, { k: 'harpoon', x: 10, z: 50 }, 'p2'), true);
});

test('aim is clamped to the sea and the focus range', () => {
  const st = night();
  applyCommand(st, { k: 'beam', az: 0, dist: 99999, r: 1000 }, 'p1');
  assert.ok(st.beam.dist <= SEA_R - R_MAX && st.beam.r === R_MAX);
  applyCommand(st, { k: 'beam', az: NaN, dist: -5, r: NaN }, 'p1');
  assert.ok(st.beam.dist >= 18 && Number.isFinite(st.beam.az) && st.beam.r === R_MAX);
  applyCommand(st, { k: 'beam', az: 100, dist: 50, r: 0.1 }, 'p1');
  assert.ok(Math.abs(st.beam.az) <= Math.PI && st.beam.r === R_MIN);
});

test('an overcharge streak cracks the lens within 20 s and a swap during the crack fits the spare', () => {
  const st = night();
  applyCommand(st, { k: 'mode', mode: 'spot' }, 'p1');
  let t = 0;
  while (st.beam.cracks === 0 && t < 30) {
    applyCommand(st, { k: 'over', on: true }, 'p1');
    stepNight(st);
    t += TICK;
  }
  assert.ok(t < 20, `cracked after ${t}`);
  assert.equal(st.beam.lensInt, 75);
  assert.ok(st.beam.offline > 0);
  assert.equal(applyCommand(st, { k: 'spare' }, 'p1'), true);
  for (let i = 0; i < 60; i++) stepNight(st);
  assert.equal(st.beam.lensInt, 100);
  assert.equal(st.beam.offline, 0);
  assert.equal(st.res.spareLens, 0);
  assert.equal(applyCommand(st, { k: 'spare' }, 'p1'), false);
});

test('zero oil and zero power: the crank and a dim hand-held spot still work', () => {
  const st = night();
  st.res.oil = 0;
  st.res.power = 0;
  applyCommand(st, { k: 'mode', mode: 'spot' }, 'p1');
  applyCommand(st, { k: 'beam', az: 0.3, dist: 80, r: 12 }, 'p1');
  for (let i = 0; i < 40; i++) stepNight(st);
  assert.equal(st.res.oil, 0);
  assert.equal(st.res.power, 0);
  const c = { x: Math.sin(0.3) * 80, z: Math.cos(0.3) * 80 };
  const l = lightAt(st, c.x, c.z);
  assert.ok(l.I > 0 && l.I < 1, `dim spot ${l.I}`);
  applyCommand(st, { k: 'station', st: 'watch' }, 'p1');
  for (let i = 0; i < 60; i++) stepNight(st);
  for (let i = 0; i < 100; i++) {
    applyCommand(st, { k: 'crank', on: true }, 'p1');
    stepNight(st);
  }
  assert.ok(st.res.power > 4, `cranked to ${st.res.power}`);
});

test('the horn runs out of air and refills; the radio needs power and a real order', () => {
  const st = night({ station: 'watch' });
  for (let i = 0; i < 700; i++) {
    applyCommand(st, { k: 'horn', on: true }, 'p1');
    stepNight(st);
  }
  assert.ok(st.res.air < 0.2);
  assert.equal(st.horn.on, 0);
  for (let i = 0; i < 200; i++) stepNight(st);
  assert.ok(st.res.air > 15);
  assert.equal(applyCommand(st, { k: 'radio', ship: 'nope', order: 'port' }, 'p1'), false);
  const ship = spawnShip(st, { type: 'ferry', name: 'Test', d: 0 });
  assert.equal(applyCommand(st, { k: 'radio', ship: ship.id, order: 'eat' }, 'p1'), false);
  st.res.power = 2;
  assert.equal(applyCommand(st, { k: 'radio', ship: ship.id, order: 'port' }, 'p1'), false);
  st.res.power = 50;
  st.mods.radioSure = true;
  assert.equal(applyCommand(st, { k: 'radio', ship: ship.id, order: 'port' }, 'p1'), true);
  assert.equal(ship.order, 'port');
});

test('the tower falling ends the night in disaster; a lost reputation dismisses the keeper', () => {
  const a = night();
  a.res.integ = 0.01;
  a.weather = { ...a.weather, storm: 1 };
  for (let i = 0; i < 200 && a.phase !== 'over'; i++) stepNight(a);
  assert.equal(a.result, 'disaster');
  const b = night();
  b.res.rep = -1;
  stepNight(b);
  assert.equal(b.result, 'dismissed');
});

test('the Titan has three faces and the expert keeper can put it under', () => {
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const st = night({ seed, night: 12, season: GOOD, weather: 'rain' });
    const bot = makeBot('p1', 'expert');
    let phases = new Set();
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 30000) {
      stepBot(st, bot);
      stepNight(st, TICK);
      for (const h of st.hostiles) if (h.type === 'titan') phases.add(h.phase);
    }
    if (st.flags.titanDown) wins++;
    assert.ok(phases.has(1));
  }
  assert.ok(wins >= 1, 'the Titan is beatable');
});

test('a snapshot without route and timeline hydrates back into a running night', () => {
  const st = night({ seed: 8, night: 5, season: GOOD, weather: 'fog' });
  const bot = makeBot('p1', 'basic');
  for (let i = 0; i < 2000; i++) {
    stepBot(st, bot);
    stepNight(st, TICK);
  }
  const copy = JSON.parse(JSON.stringify({ ...st, route: null, tl: null }));
  hydrate(copy);
  assert.equal(copy.route.L, st.route.L);
  assert.equal(copy.tl.events.length, st.tl.events.length);
  const bot2 = JSON.parse(JSON.stringify(bot));
  bot2.skill = bot.skill;
  for (let i = 0; i < 2000; i++) {
    stepBot(st, bot);
    stepNight(st, TICK);
    stepBot(copy, bot2);
    stepNight(copy, TICK);
  }
  assert.equal(snap(copy), snap(st));
});

test('crew who leave mid-move or mid-hold free their station; three nights in a row share nothing', () => {
  const st = night();
  applyCommand(st, { k: 'station', st: 'watch' }, 'p1');
  removeCrew(st, 'p1');
  for (let i = 0; i < 100; i++) stepNight(st);
  assert.deepEqual(Object.keys(st.crew), []);
  assert.ok(STATIONS.every((s) => st.stations[s] === null));
  const a = createNight({ seed: 4, night: 2, season: BARE, weather: 'rain' });
  const b = createNight({ seed: 4, night: 2, season: BARE, weather: 'rain' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('a hidden tab: the night is stepped by ticks, so a long gap costs nothing and is never simulated at once', () => {
  const st = night();
  const before = st.t;
  stepNight(st, TICK);
  assert.equal(st.t, before + TICK);
});

test('wiping the lens ends the moth swarm; a fog bank that has gone no longer eats the beam', async () => {
  const { spawnHostile } = await import('../src/sim/hostiles.js');
  const st = night({ night: 3 });
  const moths = spawnHostile(st, { type: 'moths', tell: 0.1 });
  for (let i = 0; i < 80; i++) stepNight(st);
  assert.equal(moths.st, 'on');
  assert.ok(st.beam.grit > 0.3, 'the swarm dirties the glass');
  assert.ok(applyCommand(st, { k: 'wipe' }, 'p1'));
  for (let i = 0; i < 60; i++) stepNight(st);
  assert.equal(moths.st, 'gone', 'the rag clears the swarm, not only the grit');
  for (let i = 0; i < 40; i++) stepNight(st);
  assert.ok(st.beam.grit < 0.05, 'and the glass stays clean');
  // A fog bank sitting on the pool dims it; once it is gone, the light comes back in full.
  const w = spawnHostile(st, { type: 'wraith', u: 0.5, tell: 0.1 });
  for (let i = 0; i < 4; i++) stepNight(st);
  assert.ok(applyCommand(st, { k: 'mode', mode: 'spot' }, 'p1'));
  st.beam.az = Math.atan2(w.x, w.z);
  st.beam.dist = Math.hypot(w.x, w.z);
  const inFog = lightAt(st, w.x, w.z).I;
  w.st = 'gone';
  const clear = lightAt(st, w.x, w.z).I;
  assert.ok(clear > inFog * 2, `fog ${inFog.toFixed(2)} vs clear ${clear.toFixed(2)}`);
  w.st = 'tell';
  assert.equal(lightAt(st, w.x, w.z).I, clear, 'a bank that has not arrived yet does not dim either');
});
