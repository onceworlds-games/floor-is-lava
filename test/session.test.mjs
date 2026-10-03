import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, pack, unpack } from '../src/net/session.js';
import { FakeServer } from './fakeroom.mjs';
import { newSeason } from '../src/sim/season.js';
import { createNight, stepNight, addCrew, TICK } from '../src/sim/night.js';
import { applyCommand } from '../src/sim/verbs.js';
import { makeBot, stepBot } from '../src/sim/bots.js';
import { GOOD, finite } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function page(server, id, name = id) {
  const log = { fx: [], toasts: [], ledgers: [], nights: [] };
  const session = new Session({
    onFx: (fx) => log.fx.push(fx.k),
    onToast: (t) => log.toasts.push(t),
    onLedger: (l) => log.ledgers.push(l),
    onNight: (state, role) => log.nights.push(role),
    onSeason: () => {},
    onClosed: () => {},
    onPhase: () => {},
  });
  return { id, session, log, join: () => session.join(() => server.join(id, name)) };
}

/** Runs every page's frame for `ms` of wall time, at ~30 Hz. */
async function run(pages, ms) {
  const end = Date.now() + ms;
  let last = Date.now();
  while (Date.now() < end) {
    await sleep(33);
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    for (const p of pages) p.session.update(Math.min(0.1, dt));
  }
}

test('pack and unpack round-trip a night and refuse junk', () => {
  const st = createNight({ seed: 5, night: 4, season: GOOD, weather: 'rain' });
  addCrew(st, 'a', 'lantern');
  applyCommand(st, { k: 'light' }, 'a');
  const bot = makeBot('a', 'expert');
  for (let i = 0; i < 1500; i++) {
    stepBot(st, bot);
    stepNight(st, TICK);
  }
  const json = pack(st);
  assert.ok(json.length < 16000, `snapshot ${json.length} bytes`);
  const record = { mid: 'm1', seed: 5, night: 4, weather: 'rain', mods: st.mods, site: 'skerry-rock', base: 0 };
  const copy = unpack(json, record, null);
  assert.ok(copy && copy.ships.length === st.ships.length && copy.route.L === st.route.L);
  finite({ ...copy, route: null, tl: null });
  for (const bad of ['', 'nope', '{"v":2}', JSON.stringify({ v: 1, ships: 'x', hostiles: [], beam: {}, res: {}, crew: {} }), JSON.stringify({ ...JSON.parse(json), ships: new Array(41).fill({}) })]) assert.equal(unpack(bad, record, null), null);
  const nan = JSON.parse(json);
  nan.beam.r = 'NaN';
  nan.res.oil = -5;
  nan.ships[0].s = 1e9;
  const fixed = unpack(JSON.stringify(nan), record, null);
  assert.equal(fixed.beam.r, 20);
  assert.equal(fixed.res.oil, 0);
  assert.ok(fixed.ships[0].s <= 2000);
});

test('three pages play a night: the host simulates, clients command, a reloaded guest and a new host carry on', async () => {
  const server = new FakeServer();
  const A = page(server, 'A');
  const B = page(server, 'B');
  const C = page(server, 'C');
  await A.join();
  await B.join();
  await C.join();
  assert.equal(server.host, 'A');
  const season = newSeason({ seed: 3 });
  A.session.setSeason(season);
  assert.ok(server.state.season && B.session.season && C.session.season, 'everyone has the season');
  for (const p of [B, C]) p.session.room.setReady(true);
  assert.ok(A.session.startNight());
  assert.equal(server.match.phase, 'playing');
  await run([A, B, C], 400);
  assert.ok(A.session.state && A.session.role === 'host');
  assert.ok(B.session.state && B.session.role === 'client', 'B got a snapshot');
  assert.deepEqual(Object.keys(A.session.state.crew).sort(), ['A', 'B', 'C']);
  // The host lights the lamp; a client walks down to the cellar and cranks; the watch room's holder sounds the horn.
  A.session.command({ k: 'light' });
  await run([A, B, C], 300);
  assert.equal(A.session.state.phase, 'night');
  assert.equal(A.session.state.stations.watch, 'C');
  B.session.command({ k: 'station', st: 'cellar' });
  await run([A, B, C], 3600);
  assert.equal(A.session.state.crew.B.st, 'cellar');
  assert.equal(B.session.state.crew.B.st, 'cellar', 'B sees itself in the cellar');
  for (let i = 0; i < 10; i++) {
    B.session.command({ k: 'crank', on: true });
    C.session.command({ k: 'horn', on: true });
    await run([A, B, C], 100);
  }
  assert.ok(A.session.state.stats.crankTime > 0.2, 'the crank ran on the host');
  assert.ok(A.session.state.stats.hornTime > 0.2, 'the horn ran on the host');
  // A lying client: a flare from the cellar does nothing.
  const flares = A.session.state.res.flares;
  B.session.command({ k: 'flare', x: 10, z: 50 });
  await run([A, B, C], 200);
  assert.equal(A.session.state.res.flares, flares);
  // C reloads mid-night: a fresh page comes back to the same night.
  server.drop('C');
  await run([A, B], 200);
  const C2 = page(server, 'C');
  await C2.join();
  await run([A, B, C2], 500);
  assert.ok(C2.session.state && C2.session.state.mid === server.match.id, 'the reloaded page adopted the night');
  assert.equal(C2.session.role, 'client');
  // The host drops: B becomes the host and keeps the night going from its copy, with the same seed and clock.
  const tBefore = A.session.state.t;
  server.drop('A');
  await run([B, C2], 600);
  assert.equal(server.host, 'B');
  assert.equal(B.session.role, 'host');
  assert.ok(B.session.state.t > tBefore, 'time went on under the new host');
  assert.equal(server.state.night.by, 'B');
  assert.ok(C2.session.state.t > tBefore, 'C keeps receiving snapshots from the new host');
  // A comes back as a guest (same page, not a reload): no second host.
  server.reconnect('A');
  await run([A, B, C2], 600);
  assert.equal(A.session.role, 'client');
  assert.equal(B.session.role, 'host');
  assert.ok(Math.abs(A.session.state.t - B.session.state.t) < 2, 'A follows the host clock');
  // The night ends: the host writes the ledger, everyone sees it, the morning returns the lobby.
  B.session.state.res.integ = 0;
  await run([A, B, C2], 400);
  assert.equal(B.session.state.phase, 'over');
  assert.ok(B.log.ledgers.length === 1 && A.log.ledgers.length === 1 && C2.log.ledgers.length === 1, 'the ledger reached everyone');
  assert.equal(server.state.season.night, 2);
  B.session.morning();
  assert.equal(server.match.phase, 'lobby');
  assert.equal(B.session.state, null);
  // Nothing threw: the message budget stayed modest.
  assert.ok(B.session.season.totals.wrecked >= 0);
});

test('a lone host that reloads mid-night restarts it from dusk; three nights in a row share nothing', async () => {
  const server = new FakeServer();
  let A = page(server, 'A');
  await A.join();
  A.session.setSeason(newSeason({ seed: 9 }));
  for (let n = 0; n < 3; n++) {
    assert.ok(A.session.startNight());
    await run([A], 150);
    A.session.command({ k: 'light' });
    await run([A], 300);
    assert.equal(A.session.state.phase, 'night');
    if (n === 1) {
      // Reload: the page is gone, the match pauses, the new page restarts the night.
      server.drop('A');
      A = page(server, 'A');
      await A.join();
      await run([A], 300);
      assert.ok(A.session.state && A.session.state.phase === 'dusk', 'back at dusk');
      assert.ok(A.log.toasts.includes('The night starts over'));
      A.session.command({ k: 'light' });
      await run([A], 200);
    }
    A.session.state.t = A.session.state.tl.len + 1;
    await run([A], 400);
    assert.ok(A.session.state.phase === 'dawn' || A.session.state.phase === 'over');
    A.session.state.phase = 'over';
    A.session.state.result = 'dawn';
    await run([A], 150);
    assert.equal(A.session.season.night, n + 2);
    A.session.morning();
    assert.equal(server.match.phase, 'lobby');
  }
  assert.equal(A.session.season.night, 4);
});
