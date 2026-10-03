// Folds the keeper, the site, the shop, the relics, the charter, the Almanac and the ascension
// level into one plain object of numbers the night reads. Nothing else in the night looks at
// upgrades by name.
import { KEEPERS } from './data/keepers.js';
import { SITES } from './data/sites.js';
import { RELIC_BY_ID } from './data/relics.js';
import { CHARTER_BY_ID } from './data/charters.js';
import { MUTATOR_BY_ID } from './data/daily.js';

export const BASE_MODS = Object.freeze({
  lampMul: 1, rangeMul: 1, spotMul: 1, heatMul: 1, coolMul: 1, overHeatMul: 1, crackCost: 25, strobeKeep: false,
  oilMax: 100, oilAdd: 0, oilBurnMul: 1, powerMax: 100, waveMul: 1, doorDmgMul: 1, doorMul: 1, rod: false, radar: false,
  stairs: 2, stairsMul: 1, swap: 2.5, swapAdd: 0, harpoons: 6, harpoonsAdd: 0, flares: 4, flaresAdd: 0, spareLens: 1,
  oilCans: 1, apprentice: false, dog: false, cat: false, coinMul: 1, repWreckAdd: 0, radioSure: false, radioCostMul: 1,
  hornFree: false, hornRangeMul: 1, crankMul: 1, genMul: 1, genBurnMul: 1, driftMul: 1, crateMul: 1, crateSink: true,
  climbMul: 1, silenceMul: 1, mimicAnyLens: false, mimicLifeMul: 1, wraithInside: 0.3, wraithSpeedMul: 1, noMoths: false,
  gritBase: 0, harpoonDmgMul: 1, reloadAdd: 0, flareRMul: 1, flareTMul: 1, sweepCredit: 0.6, smackCoinMul: 1,
  bargeCoinMul: 1, ferryValueAdd: 0, ferryWeightMul: 1, narrowsDriftMul: 1, hammerScatters: false, repairMul: 1,
  lightningPower: 0, lightningRateMul: 1, fogAnchor: false, anchorDriftMul: 1, repFloor: -1, startInteg: 100,
  noStun: false, hailReveals: false, foreknowledge: false, redBurnMul: 1, drownedMul: 1, trafficMul: 1, hostileMul: 1,
  brightShips: false, nightLen: 540, compress: 1, convoy: false, allCrates: false, special: null, startLens: 'white',
  climbTime: 25, waveSite: 1, lightningSite: 1, towerHeight: 34, galleryRadius: 4.2, almanac: {},
  ascDrift: 1, ascCoins: 1, ascHostile: 1, ascStatic: 0, ascHail: 20, ascSweepOrient: true,
});

function mergeMod(out, mod) {
  for (const k of Object.keys(mod)) {
    const v = mod[k];
    if (k.endsWith('Mul')) out[k] = (out[k] ?? 1) * v;
    else if (k.endsWith('Add')) out[k] = (out[k] ?? 0) + v;
    else out[k] = v;
  }
}

/**
 * season: { keeper, site, asc, upgrades: { id: tiers }, relics: [ids], charter: id|null, almanacRead: [types] }
 */
export function computeMods(season) {
  const m = { ...BASE_MODS, almanac: {} };
  const keeper = KEEPERS[season.keeper] || KEEPERS.ismay;
  const site = SITES[season.site] || SITES['skerry-rock'];
  m.stairs = keeper.stairs;
  m.swap = keeper.swap;
  m.harpoons += keeper.harpoons;
  m.doorMul = keeper.doorMul;
  m.heatMul = keeper.heatMul;
  m.startLens = keeper.startLens;
  if (keeper.apprentice) m.apprentice = true;
  m.climbTime = site.climbTime;
  m.waveSite = site.waveMul;
  m.lightningSite = site.lightningMul;
  m.rangeMul *= site.beamRangeMul;
  m.towerHeight = site.towerHeight;
  m.galleryRadius = site.galleryRadius;

  const up = season.upgrades || {};
  const t = (id) => Math.max(0, Math.min(3, Number(up[id]) || 0));
  m.lampMul *= 1 + 0.12 * t('lens');
  m.rangeMul *= 1 + 0.1 * t('lens');
  if (t('fins')) m.heatMul *= 0.75;
  if (t('shutter')) m.strobeKeep = true;
  m.oilAdd += 40 * t('tank');
  if (t('shutters')) m.waveMul *= 0.7;
  if (t('door')) m.doorDmgMul *= 0.5;
  if (t('rod')) m.rod = true;
  if (t('radar')) m.radar = true;
  if (t('climb')) m.stairs = Math.max(0.6, m.stairs - 0.6);
  m.harpoonsAdd += 2 * t('harpoons');
  m.flaresAdd += 2 * t('flares');
  m.spareLens += t('spare');
  m.oilCans += t('oilcan');
  if (t('apprentice')) m.apprentice = true;
  if (t('dog')) m.dog = true;
  if (t('cat')) m.cat = true;

  for (const id of season.relics || []) {
    const r = RELIC_BY_ID[id];
    if (r) mergeMod(m, r.mod);
  }
  const charter = season.charter ? CHARTER_BY_ID[season.charter] : null;
  if (charter) {
    mergeMod(m, charter.mod);
    if (charter.special) m.special = charter.special;
  }
  for (const id of season.mutators || []) {
    const mu = MUTATOR_BY_ID[id];
    if (mu) mergeMod(m, mu.mod);
  }
  for (const type of season.almanacRead || []) m.almanac[type] = 1.1;

  const asc = Math.max(0, Math.min(6, Number(season.asc) || 0));
  m.ascDrift = 1 + 0.08 * asc;
  m.ascCoins = 1 - 0.1 * asc;
  m.ascHostile = 1 + 0.12 * asc;
  m.ascStatic = asc >= 3 ? 0.1 : 0;
  if (asc >= 4) m.oilMax = 90;
  m.ascHail = asc >= 5 ? 12 : 20;
  m.ascSweepOrient = asc < 6;

  // Derived totals, clamped so no stack of relics breaks the night.
  m.oilMax = Math.max(40, m.oilMax + m.oilAdd);
  m.harpoons = Math.max(1, m.harpoons + m.harpoonsAdd);
  m.flares = Math.max(1, m.flares + m.flaresAdd);
  m.stairs = Math.max(0.5, m.stairs * m.stairsMul);
  m.swap = Math.max(0.5, m.swap + m.swapAdd);
  m.lampMul = Math.max(0.3, Math.min(2, m.lampMul));
  m.driftMul = Math.max(0.3, Math.min(3, m.driftMul * m.ascDrift));
  m.coinMul = Math.max(0.2, Math.min(3, m.coinMul * m.ascCoins));
  m.powerMax = Math.max(30, Math.min(100, m.powerMax));
  return m;
}
