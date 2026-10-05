// Pure rules for The Floor Is Lava: numbers, the lava's clock, scoring, rosters, seeded random.
// Nothing here touches window, document or onceworlds, so the tests import it as it is.

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ world
export const WORLD_W = 14; // the shaft is 14 units wide
export const TOWER_GOAL = 88; // the balloon's height (a tower says its own `goalY`, within a unit or two of this)
export const LOBBY_CEIL = 14; // the lobby is the bottom of the tower with a ceiling

// ------------------------------------------------------------------ movement (units and seconds)
export const PHYS = Object.freeze({
  runAccel: 40,
  airAccel: 22,
  maxSpeed: 6.5,
  friction: 55, // ground slow-down with no input
  jumpV: 13,
  gUp: 36,
  gDown: 56,
  maxFall: 18,
  cutV: 9.3, // letting go of jump early cuts the rise to this speed: a hop of ~1.2 units, a full jump ~2.35
  coyote: 0.1,
  buffer: 0.12,
  halfW: 0.35, // the character box is 0.7 x 0.9
  height: 0.9,
  landHalf: 0.22, // how far a ledge forgives a foot hanging off it
  bounceV: 19, // trampolines and beds
  wobble: 0.6, // pillows fall this long after being stood on...
  crumbleGone: 4.0, // ...and are gone this long
  dt: 1 / 60,
});

// ------------------------------------------------------------------ the lava
export const GRACE_S = 4; // the floor is still safe this long, then it is lava
export const LAVA_SPEEDS = Object.freeze({ slow: 0.7, normal: 0.9, fast: 1.2 }); // units per second
export const LAVA_GROWTH = Math.log(1.02) / 5; // it speeds up 2% every 5 s
export const LAVA_START = -3; // under the floor
export const SHOUT1_S = 1.2; // "THE FLOOR IS..."
export const SHOUT2_S = 2.7; // "LAVA!"
export const ROUND_MAX_S = 150; // nobody stays in a round longer than this

/** The lava's surface height `t` seconds after play begins (`base`: units per second at the start of the rise). */
export function lavaLevel(base, t) {
  if (!(t > 0)) return LAVA_START;
  if (t < GRACE_S) {
    const u = t / GRACE_S;
    return LAVA_START + -LAVA_START * u * u * (3 - 2 * u); // bubbles up under the floor
  }
  const s = t - GRACE_S;
  return (base * (Math.exp(LAVA_GROWTH * s) - 1)) / LAVA_GROWTH;
}

export function lavaSpeed(base, t) {
  if (t < GRACE_S) return 0;
  return base * Math.exp(LAVA_GROWTH * (t - GRACE_S));
}

/** The round time at which the lava's surface reaches height `y` (Infinity if never). */
export function lavaReaches(base, y) {
  if (y <= 0) return GRACE_S;
  return GRACE_S + Math.log(1 + (y * LAVA_GROWTH) / base) / LAVA_GROWTH;
}

export function lavaBase(setting) {
  return typeof setting === 'string' && Object.prototype.hasOwnProperty.call(LAVA_SPEEDS, setting) ? LAVA_SPEEDS[setting] : LAVA_SPEEDS.normal;
}

// ------------------------------------------------------------------ settings
export const ROUND_OPTIONS = [1, 3, 5];
export const LAVA_OPTIONS = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];
export const SETTINGS = [
  { id: 'rounds', label: 'Rounds', options: ROUND_OPTIONS, default: 3 },
  { id: 'lava', label: 'Lava', options: LAVA_OPTIONS, default: 'normal' },
];

export function roundsOf(v) {
  const n = Number(v);
  return ROUND_OPTIONS.includes(n) ? n : 3;
}
export function lavaOf(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(LAVA_SPEEDS, v) ? v : 'normal';
}

// ------------------------------------------------------------------ timings (ms of match time unless named)
export const T = Object.freeze({
  bannerMs: 1500,
  flyMs: 3000,
  scoreMs: 4000,
  finalMs: 8000,
  claimWaitMs: 250, // arrivals are ordered by the room's clock once they have all had time to arrive
  hotS: 0.9, // the "hot hot hot" hop before the ghost floats up
  ghostSpeed: 4.5,
  resultsAfterMs: 4500, // the results card stays over the lobby this long after the match
});

// ------------------------------------------------------------------ random
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The seed of round `n` of a match (every page derives the same tower). */
export function roundSeed(matchSeed, n) {
  const s = Number.isFinite(Number(matchSeed)) ? Number(matchSeed) >>> 0 : 1;
  return hash2(s, n | 0);
}

// ------------------------------------------------------------------ people
export const PLAYER_COLORS = [
  '#ff4d4d',
  '#ffd23f',
  '#3ddc84',
  '#2ea6ff',
  '#a259ff',
  '#ff7ac8',
  '#18d1c4',
  '#ffa62b',
  '#b8f23d',
  '#5b6dff',
  '#f4f1ea',
  '#b9794a',
];
export const BOT_NAMES = ['Pip', 'Ziggy', 'Bubbles', 'Noodle', 'Pickles', 'Mochi', 'Sprout', 'Bean', 'Waffles', 'Taco', 'Biscuit', 'Peanut', 'Jelly', 'Nugget'];
export const TABLE_SIZE = 6;
export const MAX_PLAYERS = 12;

/** Humans first (in the order the room gave), then bots up to the table size (more humans than seats: no bots). */
export function buildRoster(humanIds, seed, tableSize = TABLE_SIZE) {
  const ids = [...new Set(humanIds.map(String))].slice(0, MAX_PLAYERS);
  const bots = Math.max(0, Math.min(MAX_PLAYERS - ids.length, tableSize - ids.length));
  const rng = mulberry32(hash2(Number(seed) >>> 0, 77));
  const names = BOT_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const roster = ids.map((id, i) => ({ id, bot: 0, c: i % PLAYER_COLORS.length }));
  for (let k = 0; k < bots; k++) roster.push({ id: `bot${k + 1}`, bot: 1, name: names[k % names.length], c: (ids.length + k) % PLAYER_COLORS.length });
  return roster;
}

/** Where a character starts on the floor: spread across the shaft by roster seat. */
export function spawnX(index, count, width = WORLD_W) {
  const n = Math.max(1, count);
  return 1.0 + ((index + 0.5) * (width - 2.0)) / n;
}

// ------------------------------------------------------------------ a round's record: { safe: [ids in arrival order], out: { id: height reached } }
export const ARRIVAL_POINTS = [10, 7, 5, 4, 3, 2, 1];

export function arrivalPoints(i) {
  if (!(i >= 0)) return 0;
  return i < ARRIVAL_POINTS.length ? ARRIVAL_POINTS[i] : 1;
}

export function newRecord() {
  return { safe: [], out: {} };
}

/** The player reached the balloon. Once only: false if they were already safe or out. */
export function applySafe(r, id) {
  if (r.safe.includes(id) || Object.prototype.hasOwnProperty.call(r.out, id)) return false;
  r.safe.push(id);
  return true;
}

/** The lava got them (`h`: the highest they stood). Once only. */
export function applyOut(r, id, h) {
  if (r.safe.includes(id) || Object.prototype.hasOwnProperty.call(r.out, id)) return false;
  r.out[id] = Number.isFinite(h) ? Math.max(0, h) : 0;
  return true;
}

export function resolved(r, id) {
  return r.safe.includes(id) || Object.prototype.hasOwnProperty.call(r.out, id);
}

/** The round is over when every seat is safe or out. */
export function roundDone(r, ids) {
  return ids.every((id) => resolved(r, id));
}

/** Finishing order: the safe in arrival order, then the burned by the height they reached (higher first), then anyone left. */
export function roundOrder(r, ids) {
  const seat = new Map(ids.map((id, i) => [id, i]));
  const safe = r.safe.filter((id) => seat.has(id));
  const out = ids.filter((id) => Object.prototype.hasOwnProperty.call(r.out, id) && !safe.includes(id));
  out.sort((a, b) => r.out[b] - r.out[a] || seat.get(a) - seat.get(b));
  const rest = ids.filter((id) => !safe.includes(id) && !out.includes(id));
  return [...safe, ...out, ...rest];
}

export function roundPoints(r, ids) {
  const pts = Object.fromEntries(ids.map((id) => [id, 0]));
  r.safe.filter((id) => id in pts).forEach((id, i) => (pts[id] = arrivalPoints(i)));
  return pts;
}

/** Overall order: points, then first arrivals, then seat. */
export function finalRanking(ids, scores, firsts = {}) {
  const seat = new Map(ids.map((id, i) => [id, i]));
  return ids.slice().sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || (firsts[b] ?? 0) - (firsts[a] ?? 0) || seat.get(a) - seat.get(b));
}

/** Place numbers for a ranking (ties share a place: 1, 1, 3). */
export function places(ranked, scores, firsts = {}) {
  const out = [];
  ranked.forEach((id, i) => {
    const prev = ranked[i - 1];
    const tie = i > 0 && (scores[id] ?? 0) === (scores[prev] ?? 0) && (firsts[id] ?? 0) === (firsts[prev] ?? 0);
    out.push(tie ? out[i - 1] : i + 1);
  });
  return out;
}

/** "Hot Feet": the closest escape from the lava (smallest gap at arrival). "Sky High": most first arrivals. */
export function awards(ids, gaps = {}, firsts = {}) {
  let hotFeet = null;
  let skyHigh = null;
  for (const id of ids) {
    const gap = gaps[id];
    if (typeof gap === 'number' && Number.isFinite(gap) && (hotFeet === null || gap < gaps[hotFeet])) hotFeet = id;
    const n = firsts[id] ?? 0;
    if (n > 0 && (skyHigh === null || n > firsts[skyHigh])) skyHigh = id;
  }
  return { hotFeet, skyHigh };
}

export function ordinal(n) {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 < 4 ? n % 10 : 0]}`;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
