#!/usr/bin/env node
// Headless balance harness: plays whole nights with scripted keepers across seeds and builds and
// prints the numbers the design targets name. `npm run balance` (add --seeds 40 --quick --relics).
import { createNight, stepNight, addCrew, TICK } from '../src/sim/night.js';
import { makeBot, stepBot } from '../src/sim/bots.js';
import { RELICS } from '../src/sim/data/relics.js';
import { weatherWeights } from '../src/sim/data/weather.js';
import { weighted } from '../src/sim/rng.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SEEDS = Number(flag('seeds', 24));
const QUICK = args.includes('--quick');
const RELIC_TABLE = args.includes('--relics');
const RELIC_SEEDS = Number(flag('relic-seeds', Math.max(SEEDS, 48)));

const BUILDS = {
  bare: { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: {}, relics: [], charter: null, almanacRead: [], rep: 60 },
  mid: { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: { lens: 1, tank: 1, fins: 1, door: 1 }, relics: ['kettle', 'salt-ledger'], charter: null, almanacRead: ['drowned', 'siren'], rep: 60 },
  good: { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: { lens: 3, tank: 2, fins: 1, door: 1, shutters: 1, rod: 1, harpoons: 2, flares: 1, apprentice: 1, dog: 1, radar: 1 }, relics: ['kettle', 'salt-ledger', 'deep-tank', 'quick-match', 'kraken-tooth'], charter: null, almanacRead: ['drowned', 'siren', 'mimic', 'wraith', 'kraken', 'moths'], rep: 70 },
};

function weatherFor(seed, night) {
  const rng = { s: (seed * 7919 + night * 104729) >>> 0 };
  return weighted(rng, weatherWeights(night)).id;
}

function playNight({ seed, night, build, bot: kind, weather }) {
  const state = createNight({ seed, night, season: build, weather: weather || weatherFor(seed, night) });
  addCrew(state, 'bot', 'lantern');
  const bot = makeBot('bot', kind);
  let guard = 0;
  while (state.phase !== 'over' && guard++ < 40000) {
    stepBot(state, bot);
    stepNight(state, TICK);
  }
  const s = state.stats;
  return {
    result: state.result, saved: s.saved, wrecked: s.wrecked, shipsIn: s.shipsIn, oilLeft: state.res.oil / state.res.oilMax, integ: state.res.integ,
    coins: s.coins, cracks: s.cracks, powerOut: s.powerOut, oilOut: s.oilOut, titan: Boolean(state.flags.titanDown), t: state.t, damage: s.damage, cmds: bot.cmds,
    counted: s.saved + s.wrecked,
  };
}

function summarise(rows) {
  const n = rows.length;
  const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / n;
  const savedRate = rows.reduce((a, r) => a + r.saved, 0) / Math.max(1, rows.reduce((a, r) => a + r.shipsIn, 0));
  return {
    n, savedRate, dawn: avg((r) => (r.result === 'dawn' ? 1 : 0)), oil: avg((r) => r.oilLeft), integ: avg((r) => r.integ), coins: avg((r) => r.coins),
    cracks: avg((r) => r.cracks), titan: avg((r) => (r.titan ? 1 : 0)), powerOut: avg((r) => r.powerOut), oilOut: avg((r) => r.oilOut),
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const line = (label, s) => console.log(`${label.padEnd(34)} saved ${pct(s.savedRate).padStart(4)}  dawn ${pct(s.dawn).padStart(4)}  oil ${pct(s.oil).padStart(4)}  integ ${String(Math.round(s.integ)).padStart(3)}  coins ${String(Math.round(s.coins)).padStart(4)}  cracks ${s.cracks.toFixed(2)}  oilOut ${pct(s.oilOut)}`);

function run(label, cfg, seeds = SEEDS) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) rows.push(playNight({ ...cfg, seed }));
  const s = summarise(rows);
  line(label, s);
  return s;
}

console.log(`Watchlight balance, ${SEEDS} seeds per row\n`);
const t0 = Date.now();
const r = {};
r.n1basic = run('Night 1, basic, bare', { night: 1, build: BUILDS.bare, bot: 'basic' });
r.n1lazy = run('Night 1, lazy, bare', { night: 1, build: BUILDS.bare, bot: 'lazy' });
r.n3basic = run('Night 3, basic, bare', { night: 3, build: BUILDS.bare, bot: 'basic' });
r.n6expert = run('Night 6, expert, mid', { night: 6, build: BUILDS.mid, bot: 'expert' });
r.n6basic = run('Night 6, basic, mid', { night: 6, build: BUILDS.mid, bot: 'basic' });
r.n6lazy = run('Night 6, lazy, mid', { night: 6, build: BUILDS.mid, bot: 'lazy' });
r.n6sweep = run('Night 6, sweep-only, mid', { night: 6, build: BUILDS.mid, bot: 'sweep' });
r.n5sweep = run('Night 5, sweep-only, mid', { night: 5, build: BUILDS.mid, bot: 'sweep' });
r.n6spot = run('Night 6, spot-only, no tank', { night: 6, build: { ...BUILDS.mid, upgrades: { ...BUILDS.mid.upgrades, tank: 0 } }, bot: 'spot' });
r.n9expert = run('Night 9, expert, good', { night: 9, build: BUILDS.good, bot: 'expert' });
// The finale is won or lost whole, so its rows take at least 48 seeds: 24 coin flips swing by ten points.
const FINALE = Math.max(SEEDS, 48);
r.n12expert = run(`Night 12, expert, good (${FINALE})`, { night: 12, build: BUILDS.good, bot: 'expert' }, FINALE);
r.n12basic = run(`Night 12, basic, good (${FINALE})`, { night: 12, build: BUILDS.good, bot: 'basic' }, FINALE);
if (!QUICK) {
  r.n12asc3 = run(`Night 12, expert, good, Storm 3 (${FINALE})`, { night: 12, build: { ...BUILDS.good, asc: 3 }, bot: 'expert' }, FINALE);
  r.n6gale = run('Night 6, expert, mid, gale', { night: 6, build: BUILDS.mid, bot: 'expert', weather: 'gale' });
  r.n6fog = run('Night 6, expert, mid, fog', { night: 6, build: BUILDS.mid, bot: 'expert', weather: 'fog' });
}

// Overcharge: from a cold lamp, a held overcharge cracks the lens within 20 s.
{
  const state = createNight({ seed: 3, night: 1, season: BUILDS.bare, weather: 'clear' });
  addCrew(state, 'p', 'lantern');
  const { applyCommand } = await import('../src/sim/verbs.js');
  applyCommand(state, { k: 'light' }, 'p');
  stepNight(state);
  applyCommand(state, { k: 'mode', mode: 'spot' }, 'p');
  let t = 0;
  while (state.beam.cracks === 0 && t < 40) {
    applyCommand(state, { k: 'over', on: true }, 'p');
    stepNight(state);
    t += TICK;
  }
  r.crackAt = t;
  console.log(`\nOvercharge streak cracks the lens after ${t.toFixed(1)} s (target < 20 s)`);
}
// Spot-only oil: when does the tank run dry on night 6?
{
  const rows = [];
  for (let seed = 1; seed <= Math.min(SEEDS, 12); seed++) {
    const state = createNight({ seed, night: 6, season: { ...BUILDS.mid, upgrades: { ...BUILDS.mid.upgrades, tank: 0 } }, weather: weatherFor(seed, 6) });
    addCrew(state, 'bot', 'lantern');
    const bot = makeBot('bot', 'spot');
    let dry = null;
    let guard = 0;
    while (state.phase !== 'over' && guard++ < 40000) {
      stepBot(state, bot);
      stepNight(state, TICK);
      if (dry === null && state.res.oil <= 0) dry = state.t;
    }
    rows.push(dry ?? state.t);
  }
  r.spotDry = rows.reduce((a, b) => a + b, 0) / rows.length;
  console.log(`Spot-only play runs dry at minute ${(r.spotDry / 60).toFixed(1)} on night 6 (target <= 7)`);
}

if (RELIC_TABLE) {
  // The win that matters is the season's: dawn on night 12 against the Titan. Each relic alone in the good build.
  console.log(`\nRelics: expert on night 12 with the good build and that one relic, ${RELIC_SEEDS} seeds (win = dawn; delta in points)`);
  const base = run('  none', { night: 12, build: { ...BUILDS.good, relics: [] }, bot: 'expert' }, RELIC_SEEDS);
  const deltas = [];
  for (const relic of RELICS) {
    const s = run(`  ${relic.name}`, { night: 12, build: { ...BUILDS.good, relics: [relic.id] }, bot: 'expert' }, RELIC_SEEDS);
    deltas.push({ id: relic.id, d: Math.round((s.dawn - base.dawn) * 100), saved: Math.round((s.savedRate - base.savedRate) * 100) });
  }
  const order = deltas.slice().sort((a, b) => b.d - a.d);
  const out = deltas.filter((x) => x.d > 12 || x.d < -8);
  console.log(`  best ${order[0].id} ${order[0].d > 0 ? '+' : ''}${order[0].d}, worst ${order[order.length - 1].id} ${order[order.length - 1].d}; outside +12/-8: ${out.length ? out.map((x) => `${x.id} ${x.d}`).join(', ') : 'none'}`);
  r.relics = deltas;
}

console.log(`\nTargets: n1 basic saved >= 85% (${pct(r.n1basic.savedRate)}), n1 tower never lost (${pct(r.n1basic.dawn)} dawn), n6 expert >= 75% (${pct(r.n6expert.savedRate)}), n6 lazy 35-50% (${pct(r.n6lazy.savedRate)}),`);
console.log(`n12 expert wins 30-45% (${pct(r.n12expert.dawn)} dawn, Titan down ${pct(r.n12expert.titan)}), n12 average <= 8% (${pct(r.n12basic.dawn)}), oil left 10-25% (expert n6 ${pct(r.n6expert.oil)}), sweep-only loses n5+ (${pct(r.n5sweep.savedRate)} saved)`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
