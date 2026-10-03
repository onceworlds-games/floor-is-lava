// The keeper's own record (per player, in the platform save): bests, unlocks, the Almanac, cosmetics.
// Loads defensively: missing, empty, corrupt, older or newer saves all give a usable profile.
import { KEEPERS, KEEPER_ORDER } from './data/keepers.js';
import { SITES, SITE_ORDER } from './data/sites.js';
import { HOSTILE_ORDER } from './data/hostiles.js';

export const PROFILE_V = 1;

export function defaultProfile() {
  return {
    v: PROFILE_V, best: { score: 0, nights: 0, saved: 0 }, nights: 0, nightsTotal: 0, shipsSaved: 0, seasons: 0, titans: 0, ascCleared: 0,
    endlessBest: 0, almanac: {}, relicsSeen: [], keeper: 'ismay', site: 'skerry-rock', asc: 0, cosmetics: { housing: 'brass', hat: 'none', collar: 'red' },
    pets: 0, hints: {}, daily: { date: '', score: 0, done: false, best: 0 }, tutorial: false, sirens: 0, mimics: 0, strikes: 0,
    credited: '',
  };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1e9, Math.floor(Number(v)))) : d);

/** Any value in: a sound profile out. */
export function loadProfile(raw) {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;
  const v = Number(raw.v) || 0;
  if (v > PROFILE_V) {
    // A newer save: keep what we understand.
  }
  if (raw.best && typeof raw.best === 'object') p.best = { score: num(raw.best.score), nights: num(raw.best.nights), saved: num(raw.best.saved) };
  for (const k of ['nights', 'nightsTotal', 'shipsSaved', 'seasons', 'titans', 'ascCleared', 'endlessBest', 'pets', 'sirens', 'mimics', 'strikes']) p[k] = num(raw[k]);
  p.ascCleared = Math.min(6, p.ascCleared);
  if (raw.almanac && typeof raw.almanac === 'object') {
    for (const type of HOSTILE_ORDER) {
      const a = raw.almanac[type];
      if (a && typeof a === 'object') p.almanac[type] = { seen: num(a.seen), read: num(a.read) };
    }
  }
  if (Array.isArray(raw.relicsSeen)) p.relicsSeen = raw.relicsSeen.filter((x) => typeof x === 'string').slice(0, 40);
  if (KEEPERS[raw.keeper]) p.keeper = raw.keeper;
  if (SITES[raw.site]) p.site = raw.site;
  p.asc = Math.min(6, num(raw.asc));
  if (raw.cosmetics && typeof raw.cosmetics === 'object') {
    for (const k of ['housing', 'hat', 'collar']) if (typeof raw.cosmetics[k] === 'string') p.cosmetics[k] = raw.cosmetics[k].slice(0, 16);
  }
  if (raw.hints && typeof raw.hints === 'object') for (const k of Object.keys(raw.hints).slice(0, 40)) p.hints[k] = num(raw.hints[k]);
  if (raw.daily && typeof raw.daily === 'object') p.daily = { date: typeof raw.daily.date === 'string' ? raw.daily.date.slice(0, 10) : '', score: num(raw.daily.score), done: Boolean(raw.daily.done), best: num(raw.daily.best) };
  p.tutorial = Boolean(raw.tutorial);
  if (typeof raw.credited === 'string') p.credited = raw.credited.slice(0, 80);
  if (!unlockedKeepers(p).includes(p.keeper)) p.keeper = 'ismay';
  if (!unlockedSites(p).includes(p.site)) p.site = 'skerry-rock';
  if (p.asc > p.ascCleared) p.asc = p.ascCleared;
  return p;
}

export function unlockedKeepers(p) {
  return KEEPER_ORDER.filter((id) => {
    const u = KEEPERS[id].unlock;
    if (!u) return true;
    if (u.shipsSaved) return p.shipsSaved >= u.shipsSaved;
    if (u.nights) return p.nights >= u.nights;
    if (u.season) return p.seasons >= 1;
    return false;
  });
}

export function unlockedSites(p) {
  return SITE_ORDER.filter((id) => {
    const u = SITES[id].unlock;
    if (!u) return true;
    if (u.nights) return p.nights >= u.nights;
    if (u.season) return p.seasons >= 1;
    return false;
  });
}

/** The reason something is still locked, as a short label. */
export function lockLabel(unlock) {
  if (!unlock) return '';
  if (unlock.shipsSaved) return `Save ${unlock.shipsSaved} ships`;
  if (unlock.nights) return `Reach night ${unlock.nights}`;
  if (unlock.season) return 'Finish a season';
  return 'Locked';
}

/** Banks a finished season into the profile. Returns the list of things newly unlocked. */
export function bankSeason(p, season, score) {
  const before = [...unlockedKeepers(p), ...unlockedSites(p)];
  if (score > p.best.score) p.best.score = score;
  const nights = season.totals.nights;
  if (nights > p.best.nights) p.best.nights = nights;
  if (season.totals.saved > p.best.saved) p.best.saved = season.totals.saved;
  if (season.over === 'won') {
    p.seasons++;
    if (season.asc >= p.ascCleared && season.asc < 6) p.ascCleared = season.asc + 1;
    else if (season.asc === 6) p.ascCleared = 6;
  }
  if (season.endless && nights > 12) p.endlessBest = Math.max(p.endlessBest, nights - 12);
  for (const r of season.relics) if (!p.relicsSeen.includes(r)) p.relicsSeen.push(r);
  const after = [...unlockedKeepers(p), ...unlockedSites(p)];
  return after.filter((id) => !before.includes(id));
}
