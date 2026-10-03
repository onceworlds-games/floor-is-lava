// The season: twelve nights, the day between them (ledger, shop, relic draft, charter, almanac) and the
// score. Plain data; the host keeps it in room state and mirrors it to the save.
import { hashSeed, rnd, weighted, shuffle } from './rng.js';
import { RELICS, RELIC_BY_ID } from './data/relics.js';
import { CHARTERS, CHARTER_BY_ID } from './data/charters.js';
import { SHOP, shopPrice } from './data/shop.js';
import { WEATHER, weatherWeights } from './data/weather.js';
import { KEEPERS } from './data/keepers.js';
import { SITES } from './data/sites.js';
import { HOSTILE_ORDER } from './data/hostiles.js';
import { DAILY_MUTATORS } from './data/daily.js';

export const SEASON_V = 1;
export const LAST_NIGHT = 12;


export function newSeason({ keeper = 'ismay', site = 'skerry-rock', asc = 0, seed = 1, daily = null } = {}) {
  const season = {
    v: SEASON_V, id: `${seed}`, seed: Number(seed) >>> 0 || 1, keeper: KEEPERS[keeper] ? keeper : 'ismay', site: SITES[site] ? site : 'skerry-rock',
    asc: Math.max(0, Math.min(6, Number(asc) || 0)), night: 1, coins: 0, rep: 60, upgrades: {}, relics: [], charter: null,
    relicOffer: [], charterOffer: [], almanacRead: [], ledger: null, totals: { saved: 0, wrecked: 0, coins: 0, nights: 0, crates: 0 },
    over: null, endless: false, daily: daily || null, forecastAt: 0, log: [],
  };
  if (daily) {
    season.night = daily.night || 6;
    season.coins = 0;
    season.upgrades = { ...(daily.upgrades || { lens: 1, tank: 1, fins: 1 }) };
    season.relics = (daily.relics || []).slice(0, 4);
    season.mutators = (daily.mutators || []).slice(0, 3);
  }
  season.charterOffer = offerCharters(season);
  return season;
}

/** The weather for the coming night: deterministic from the seed, overridden by the charter. */
export function forecast(season) {
  const charter = season.charter ? CHARTER_BY_ID[season.charter] : null;
  if (charter && charter.weather) return WEATHER[charter.weather];
  const rng = { s: hashSeed(season.seed, 'weather', season.night) };
  const id = weighted(rng, weatherWeights(season.night)).id;
  return WEATHER[id] || WEATHER.clear;
}

/** What createNight needs for the coming night. */
export function nightConfig(season) {
  return { seed: season.seed, night: season.night, season: seasonForNight(season), weather: forecast(season).id };
}

/** The slice of the season the night's modifiers read (daily mutators folded into relics' slot). */
export function seasonForNight(season) {
  const s = { keeper: season.keeper, site: season.site, asc: season.asc, upgrades: season.upgrades, relics: season.relics, charter: season.charter, almanacRead: season.almanacRead, rep: season.rep };
  if (season.mutators && season.mutators.length) s.mutators = season.mutators;
  return s;
}

function offerRelics(season) {
  const rng = { s: hashSeed(season.seed, 'relics', season.night) };
  const pool = RELICS.filter((r) => !season.relics.includes(r.id)).map((r) => r.id);
  return shuffle(rng, pool).slice(0, 3);
}

function offerCharters(season) {
  const rng = { s: hashSeed(season.seed, 'charters', season.night) };
  const pool = CHARTERS.filter((c) => c.minNight <= season.night && season.night <= LAST_NIGHT).map((c) => c.id);
  return shuffle(rng, pool).slice(0, 3);
}

/**
 * Closes the night: pays the ledger, writes totals, draws the next offers. Returns the ledger.
 * `nightState` is the finished night; `profile` (optional) gets its lifetime counters updated.
 */
export function endNight(season, nightState, profile) {
  const st = nightState.stats;
  const result = nightState.result;
  const bonuses = [];
  let bonus = 0;
  if (result === 'dawn' && st.wrecked === 0 && st.shipsIn > 0) {
    bonuses.push(['Clean night', 40]);
    bonus += 40;
  }
  if (result === 'dawn' && st.damage < 10) {
    bonuses.push(['Dry feet', 20]);
    bonus += 20;
  }
  if (st.saved >= 8) {
    bonuses.push(['Full harbour', 30]);
    bonus += 30;
  }
  if (st.cracks === 0 && st.spotTime > 120) {
    bonuses.push(['Cool glass', 15]);
    bonus += 15;
  }
  if (season.daily) bonus = 0;
  const earned = st.coins + Math.round(bonus * nightState.mods.coinMul);
  season.coins += earned;
  season.rep = Math.max(-1, Math.min(100, Math.round(nightState.res.rep)));
  season.totals.saved += st.saved;
  season.totals.wrecked += st.wrecked;
  season.totals.coins += earned;
  season.totals.crates += st.crates;
  if (result === 'dawn') season.totals.nights++;
  const ledger = {
    night: season.night, result, saved: st.saved, wrecked: st.wrecked, shipsIn: st.shipsIn, coins: st.coins, bonuses, earned, rep: season.rep,
    repDelta: Math.round(st.repDelta), oilLeft: Math.round((nightState.res.oil / nightState.res.oilMax) * 100), integ: Math.round(nightState.res.integ),
    cracks: st.cracks, titan: Boolean(nightState.flags.titanDown), entry: entryFor(season, nightState), survived: Object.keys(st.survived),
    lines: nightState.log.slice(-8),
  };
  season.ledger = ledger;
  season.log.push(ledger.entry);
  if (season.log.length > 40) season.log.shift();
  // The run's end.
  if (season.rep < 0 || result === 'dismissed') season.over = 'lost';
  else if (season.daily) season.over = 'done';
  else if (season.night >= LAST_NIGHT && result === 'dawn' && !season.endless) season.over = 'won';
  else if (season.night >= LAST_NIGHT && result === 'disaster' && !season.endless) season.over = 'lost';
  if (profile) {
    profile.shipsSaved += st.saved;
    profile.nightsTotal += result === 'dawn' ? 1 : 0;
    if (result === 'dawn') profile.nights = Math.max(profile.nights, season.night);
    for (const type of Object.keys(st.survived)) {
      profile.almanac[type] = profile.almanac[type] || { seen: 0, read: 0 };
      profile.almanac[type].seen++;
    }
    if (ledger.titan) profile.titans++;
  }
  // Next night's offers (also when the run is over: the screens still render).
  season.night++;
  season.charter = null;
  season.almanacRead = [];
  season.relicOffer = season.daily ? [] : offerRelics(season);
  season.charterOffer = season.daily ? [] : offerCharters(season);
  return ledger;
}

function entryFor(season, nightState) {
  const st = nightState.stats;
  const r = nightState.result;
  const parts = [`Night ${season.night}.`];
  if (r === 'disaster') parts.push('Tower lost.');
  else if (r === 'dismissed') parts.push('Dismissed.');
  else {
    if (nightState.res.oil / nightState.res.oilMax < 0.12) parts.push('Oil short.');
    if (st.saved) parts.push(`${st.saved} home.`);
    if (st.wrecked) parts.push(`${st.wrecked} on the reef.`);
    if (st.mimicsRevealed) parts.push('Do not trust the lights that don’t move.');
    if (st.sirensSilenced) parts.push('She sang. Amber held.');
    if (st.krakensRepelled) parts.push('It let go.');
    if (st.strikes) parts.push('Struck twice, still lit.'.replace('twice', st.strikes === 1 ? 'once' : st.strikes === 2 ? 'twice' : `${st.strikes} times`));
    if (nightState.flags.titanDown) parts.push('The Titan went under.');
    if (parts.length === 1) parts.push('Quiet.');
  }
  return parts.join(' ');
}

export function buy(season, itemId) {
  const item = SHOP.find((i) => i.id === itemId);
  if (!item || season.over) return false;
  const owned = season.upgrades[itemId] || 0;
  if (!item.consumable && owned >= item.tiers) return false;
  if (item.consumable && owned >= 3) return false;
  const price = shopPrice(item, owned);
  if (season.coins < price) return false;
  season.coins -= price;
  season.upgrades[itemId] = owned + 1;
  return true;
}

export function pickRelic(season, relicId) {
  if (!season.relicOffer.includes(relicId) || !RELIC_BY_ID[relicId]) return false;
  if (season.relics.includes(relicId) || season.relics.length >= 12) return false;
  season.relics.push(relicId);
  season.relicOffer = [];
  return true;
}

export function skipRelic(season) {
  season.relicOffer = [];
  return true;
}

export function pickCharter(season, charterId) {
  if (charterId === null) {
    season.charter = null;
    return true;
  }
  if (!season.charterOffer.includes(charterId) || !CHARTER_BY_ID[charterId]) return false;
  season.charter = charterId;
  return true;
}

/** One page a day: reading it gives +10% against that type the coming night. */
export function readAlmanac(season, type, profile) {
  if (!HOSTILE_ORDER.includes(type)) return false;
  if (profile && !(profile.almanac[type] && profile.almanac[type].seen)) return false;
  season.almanacRead = [type];
  if (profile) profile.almanac[type].read++;
  return true;
}

export function scoreOf(season) {
  const t = season.totals;
  let score = t.saved * 100 + t.coins + Math.max(0, season.rep) * 10 + t.nights * 250;
  if (season.over === 'won' || season.ledger?.titan) score += 2000;
  score = Math.round(score * (1 + 0.15 * season.asc));
  return Math.max(0, Math.min(999999, score));
}

/** After a win: keep the lamp lit. Nights 13+ grow harsher; the run ends at the first lost night. */
export function goEndless(season) {
  if (season.over !== 'won') return false;
  season.over = null;
  season.endless = true;
  return true;
}

export function dailySeed(dateString) {
  return hashSeed('daily', dateString);
}

/** The daily watch: one seeded night with a fixed keeper, site, build and two mutators. */
export function dailyFor(dateString) {
  const seed = dailySeed(dateString);
  const rng = { s: seed };
  const keepers = Object.keys(KEEPERS);
  const sites = Object.keys(SITES);
  const keeper = keepers[Math.floor(rnd(rng) * keepers.length)];
  const site = sites[Math.floor(rnd(rng) * sites.length)];
  const mutators = shuffle(rng, DAILY_MUTATORS.map((m) => m.id)).slice(0, 2);
  const relics = shuffle(rng, RELICS.map((r) => r.id)).slice(0, 2);
  const night = 5 + Math.floor(rnd(rng) * 4);
  return { date: dateString, seed, keeper, site, mutators, relics, night, upgrades: { lens: 1, tank: 1, fins: 1, harpoons: 1 } };
}

export { CHARTERS, RELICS, SHOP };
