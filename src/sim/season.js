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
import { DAILY_MUTATORS, MUTATOR_BY_ID } from './data/daily.js';

export const SEASON_V = 1;
export const LAST_NIGHT = 12;


export function newSeason({ keeper = 'ismay', site = 'skerry-rock', asc = 0, seed = 1, daily = null, owner = null } = {}) {
  const season = {
    v: SEASON_V, id: `${seed}`, owner: typeof owner === 'string' ? owner.slice(0, 64) : null, seed: Number(seed) >>> 0 || 1, keeper: KEEPERS[keeper] ? keeper : 'ismay', site: SITES[site] ? site : 'skerry-rock',
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

const clampNum = (x, lo, hi, d) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
const texts = (a, max, len = 40) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len)) : []);

/** A night's ledger from anywhere (room state, a save): shape and numbers checked, so a bad one can't break a page or a profile. */
export function cleanLedger(v) {
  if (!v || typeof v !== 'object') return null;
  const n = (x, lo, hi) => Math.round(clampNum(x, lo, hi, 0));
  const text = (x, len) => (typeof x === 'string' ? x.slice(0, len) : '');
  return {
    mid: text(v.mid, 80), night: Math.max(1, n(v.night, 1, 999)), result: ['dawn', 'disaster', 'dismissed'].includes(v.result) ? v.result : 'dawn',
    saved: n(v.saved, 0, 60), wrecked: n(v.wrecked, 0, 60), shipsIn: n(v.shipsIn, 0, 60), coins: n(v.coins, 0, 1e5), earned: n(v.earned, 0, 1e5),
    rep: n(v.rep, -1, 100), repDelta: n(v.repDelta, -200, 200), oilLeft: n(v.oilLeft, 0, 100), integ: n(v.integ, 0, 100), cracks: n(v.cracks, 0, 99),
    titan: Boolean(v.titan), entry: text(v.entry, 300),
    bonuses: Array.isArray(v.bonuses) ? v.bonuses.slice(0, 8).filter((b) => Array.isArray(b) && typeof b[0] === 'string').map((b) => [b[0].slice(0, 30), n(b[1], 0, 1e4)]) : [],
    survived: texts(v.survived, 12).filter((t) => HOSTILE_ORDER.includes(t)),
    lines: texts(v.lines, 8, 120),
  };
}

/**
 * A season from room state or a save, repaired into the shape the screens and the night expect (null when it
 * is not a season at all). Old saves gain the new fields; unknown ids, junk numbers and oversized lists are dropped.
 */
export function cleanSeason(raw, depth = 0) {
  if (!raw || typeof raw !== 'object' || Number(raw.v) !== SEASON_V || !Number.isFinite(raw.night)) return null;
  const t = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
  const up = raw.upgrades && typeof raw.upgrades === 'object' ? raw.upgrades : {};
  const season = {
    v: SEASON_V, id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : String(raw.seed ?? 1), owner: typeof raw.owner === 'string' ? raw.owner.slice(0, 64) : null,
    seed: Number(raw.seed) >>> 0 || 1, keeper: KEEPERS[raw.keeper] ? raw.keeper : 'ismay', site: SITES[raw.site] ? raw.site : 'skerry-rock',
    asc: Math.round(clampNum(raw.asc, 0, 6, 0)), night: Math.round(clampNum(raw.night, 1, 999, 1)), coins: Math.round(clampNum(raw.coins, 0, 1e6, 0)),
    rep: clampNum(raw.rep, -1, 100, 60), upgrades: {}, relics: texts(raw.relics, 12).filter((id) => RELIC_BY_ID[id]),
    charter: CHARTER_BY_ID[raw.charter] ? raw.charter : null, relicOffer: texts(raw.relicOffer, 3).filter((id) => RELIC_BY_ID[id]),
    charterOffer: texts(raw.charterOffer, 3).filter((id) => CHARTER_BY_ID[id]), almanacRead: texts(raw.almanacRead, 2).filter((x) => HOSTILE_ORDER.includes(x)),
    ledger: cleanLedger(raw.ledger),
    totals: { saved: Math.round(clampNum(t.saved, 0, 1e5, 0)), wrecked: Math.round(clampNum(t.wrecked, 0, 1e5, 0)), coins: Math.round(clampNum(t.coins, 0, 1e7, 0)), nights: Math.round(clampNum(t.nights, 0, 999, 0)), crates: Math.round(clampNum(t.crates, 0, 1e5, 0)) },
    over: ['won', 'lost', 'done'].includes(raw.over) ? raw.over : null, endless: Boolean(raw.endless), daily: null,
    forecastAt: 0, log: texts(raw.log, 40, 300),
  };
  for (const item of SHOP) {
    const k = Math.floor(clampNum(Number(up[item.id]), 0, 3, 0));
    if (k > 0) season.upgrades[item.id] = k;
  }
  if (Array.isArray(raw.mutators)) season.mutators = texts(raw.mutators, 3).filter((id) => MUTATOR_BY_ID[id]);
  if (raw.daily && typeof raw.daily === 'object') {
    const d = raw.daily;
    season.daily = { date: typeof d.date === 'string' ? d.date.slice(0, 10) : '', seed: Number(d.seed) >>> 0 || 1, keeper: season.keeper, site: season.site, night: season.night, mutators: season.mutators || [], relics: season.relics.slice(0, 4), upgrades: { ...season.upgrades } };
    if (depth === 0 && raw.stash) season.stash = cleanSeason(raw.stash, 1);
  }
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
  if (profile) creditNight(profile, ledger);
  // Next night's offers (also when the run is over: the screens still render).
  season.night++;
  season.charter = null;
  season.almanacRead = [];
  season.relicOffer = season.daily ? [] : offerRelics(season);
  season.charterOffer = season.daily ? [] : offerCharters(season);
  return ledger;
}

/** Banks a finished night into a player's own record (every participant, not only the host). */
export function creditNight(profile, ledger) {
  if (!profile || !ledger) return;
  profile.shipsSaved += Math.max(0, ledger.saved | 0);
  if (ledger.result === 'dawn') {
    profile.nightsTotal++;
    profile.nights = Math.max(profile.nights, ledger.night | 0);
  }
  for (const type of ledger.survived || []) {
    profile.almanac[type] = profile.almanac[type] || { seen: 0, read: 0 };
    profile.almanac[type].seen++;
  }
  if (ledger.titan) profile.titans++;
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
