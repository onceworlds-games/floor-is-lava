import test from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, forecast, nightConfig, endNight, buy, pickRelic, pickCharter, readAlmanac, scoreOf, goEndless, dailyFor, LAST_NIGHT } from '../src/sim/season.js';
import { createNight, stepNight, addCrew } from '../src/sim/night.js';
import { applyCommand } from '../src/sim/verbs.js';
import { makeBot, stepBot } from '../src/sim/bots.js';
import { loadProfile, defaultProfile, bankSeason, unlockedKeepers, unlockedSites } from '../src/sim/profile.js';
import { computeMods } from '../src/sim/modifiers.js';
import { RELICS } from '../src/sim/data/relics.js';
import { SHOP } from '../src/sim/data/shop.js';
import { finite } from './helpers.mjs';

function playNight(season, kind = 'expert') {
  const st = createNight(nightConfig(season));
  addCrew(st, 'p', 'lantern');
  applyCommand(st, { k: 'light' }, 'p');
  const bot = makeBot('p', kind);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 30000) {
    stepBot(st, bot);
    stepNight(st);
  }
  return st;
}

test('a whole season plays through the day phase without a dead end', () => {
  const season = newSeason({ seed: 21 });
  const profile = defaultProfile();
  let nights = 0;
  while (!season.over && nights < 14) {
    assert.ok(season.charterOffer.length <= 3);
    const st = playNight(season);
    const ledger = endNight(season, st, profile);
    finite(season);
    assert.ok(ledger.earned >= 0 && typeof ledger.entry === 'string' && ledger.entry.length > 5);
    if (season.relicOffer.length) assert.ok(pickRelic(season, season.relicOffer[0]));
    for (const item of SHOP) buy(season, item.id);
    if (season.charterOffer.length) assert.ok(pickCharter(season, season.charterOffer[0]));
    const read = Object.keys(profile.almanac)[0];
    if (read) assert.ok(readAlmanac(season, read, profile));
    nights++;
  }
  assert.ok(season.over === 'won' || season.over === 'lost');
  assert.ok(season.night <= LAST_NIGHT + 1);
  const score = scoreOf(season);
  assert.ok(score >= 0 && score <= 999999);
  const unlocked = bankSeason(profile, season, score);
  assert.ok(Array.isArray(unlocked));
  assert.ok(profile.best.score === score);
  if (season.over === 'won') {
    assert.ok(goEndless(season));
    assert.equal(season.over, null);
    assert.equal(season.night, 13);
    assert.ok(nightConfig(season).night === 13);
  }
});

test('the shop refuses what cannot be bought', () => {
  const season = newSeason({ seed: 2 });
  assert.equal(buy(season, 'lens'), false, 'no coins');
  season.coins = 1000;
  assert.equal(buy(season, 'nothing'), false);
  assert.ok(buy(season, 'lens') && buy(season, 'lens') && buy(season, 'lens'));
  assert.equal(buy(season, 'lens'), false, 'three tiers only');
  assert.equal(season.coins, 1000 - 40 - 90 - 160);
  assert.ok(buy(season, 'rod'));
  assert.equal(buy(season, 'rod'), false);
  assert.ok(buy(season, 'spare') && buy(season, 'spare') && buy(season, 'spare'));
  assert.equal(buy(season, 'spare'), false, 'three consumables at most');
  const mods = computeMods(season);
  assert.equal(mods.rod, true);
  assert.equal(mods.spareLens, 4);
});

test('relic draft, charter choice and the almanac validate their input', () => {
  const season = newSeason({ seed: 5 });
  season.relicOffer = ['kettle', 'souwester', 'tin-whistle'];
  assert.equal(pickRelic(season, 'whale-oil'), false);
  assert.ok(pickRelic(season, 'kettle'));
  assert.equal(pickRelic(season, 'kettle'), false);
  assert.deepEqual(season.relicOffer, []);
  assert.equal(pickCharter(season, 'red-tide'), season.charterOffer.includes('red-tide'));
  assert.ok(pickCharter(season, null));
  assert.equal(season.charter, null);
  assert.equal(readAlmanac(season, 'dragon'), false);
  const p = defaultProfile();
  assert.equal(readAlmanac(season, 'siren', p), false, 'never seen');
  p.almanac.siren = { seen: 1, read: 0 };
  assert.ok(readAlmanac(season, 'siren', p));
  assert.deepEqual(season.almanacRead, ['siren']);
  assert.equal(computeMods(season).almanac.siren, 1.1);
});

test('every relic stacks into finite, bounded modifiers', () => {
  const season = newSeason({ seed: 1 });
  season.relics = RELICS.map((r) => r.id);
  season.upgrades = { lens: 3, tank: 3, fins: 1, shutter: 1, shutters: 1, door: 1, rod: 1, radar: 1, climb: 1, harpoons: 3, flares: 3, spare: 3, oilcan: 3, apprentice: 1, dog: 1, cat: 1 };
  season.asc = 6;
  const m = computeMods(season);
  finite(m);
  assert.ok(m.harpoons >= 1 && m.flares >= 1 && m.oilMax >= 40 && m.stairs >= 0.5 && m.lampMul <= 2 && m.powerMax >= 30);
});

test('profiles load from nothing, junk, old and newer versions', () => {
  for (const raw of [null, undefined, {}, 'x', 42, [], { v: 99, best: { score: 'a' } }, { v: 0, nights: -5, almanac: { siren: { seen: 'z' } } }, { v: 1, keeper: 'nobody', site: 'mars', asc: 9, hints: { a: 1e20 } }]) {
    const p = loadProfile(raw);
    finite(p);
    assert.equal(p.keeper, 'ismay');
    assert.equal(p.site, 'skerry-rock');
    assert.ok(p.asc <= p.ascCleared);
  }
  const p = loadProfile({ v: 1, nights: 8, shipsSaved: 40, seasons: 1, ascCleared: 2, asc: 2, keeper: 'wren', site: 'the-needle', best: { score: 1234, nights: 8, saved: 40 } });
  assert.deepEqual(unlockedKeepers(p), ['ismay', 'bram', 'wren', 'warden']);
  assert.deepEqual(unlockedSites(p), ['skerry-rock', 'gannet-head', 'the-needle']);
  assert.equal(p.keeper, 'wren');
  assert.equal(p.best.score, 1234);
});

test('the forecast and the daily watch are deterministic', () => {
  const a = newSeason({ seed: 3 });
  const b = newSeason({ seed: 3 });
  assert.equal(forecast(a).id, forecast(b).id);
  a.night = 1;
  assert.equal(forecast(a).id, 'clear', 'the first night is clear');
  const d1 = dailyFor('2026-10-02');
  const d2 = dailyFor('2026-10-02');
  assert.deepEqual(d1, d2);
  assert.notEqual(dailyFor('2026-10-03').seed, d1.seed);
  const season = newSeason({ seed: d1.seed, keeper: d1.keeper, site: d1.site, daily: d1 });
  assert.equal(season.night, d1.night);
  const mods = computeMods(nightConfig(season).season);
  finite(mods);
  const st = playNight(season, 'basic');
  const ledger = endNight(season, st);
  assert.equal(season.over, 'done');
  assert.ok(ledger.coins >= 0);
});
