// The night's event deck: ships and hostile things placed on a timeline with a quiet minute and a
// moment of panic, drawn by weight against the night's budget. Deterministic from the night seed.
import { rnd, range, int, weighted, pick, shuffle } from './rng.js';
import { shipWeights } from './data/ships.js';
import { HOSTILES, HOSTILE_ORDER } from './data/hostiles.js';
import { SHIP_NAMES } from './data/ships.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function shipCount(night, mods) {
  const n = Math.min(night, 12);
  let c = Math.round(lerp(4, 14, (n - 1) / 11));
  if (night > 12) c = Math.min(20, 14 + (night - 12));
  return Math.max(1, Math.round(c * mods.trafficMul));
}

export function hostileCount(night, mods) {
  const n = Math.min(night, 12);
  let c = lerp(1, 7, (n - 1) / 11);
  if (night > 12) c = Math.min(11, 7 + (night - 12) * 0.5);
  return Math.max(0, Math.round(c * mods.ascHostile * mods.hostileMul));
}

/** Hostile types available on a night, in deck order; the newest type always appears once. */
export function hostileTypes(night) {
  return HOSTILE_ORDER.filter((id) => HOSTILES[id].w > 0 && HOSTILES[id].minNight <= night);
}

/**
 * Returns { events, calm, panic, len }. Each event: { t, kind: 'ship' | 'hostile' | 'strike' | 'titan', type, ... }.
 * Ships are placed with their hail at `t` and appear `hail` seconds later; hostile events carry `tell` seconds of warning.
 */
export function buildTimeline(rng, { night, mods, weather }) {
  const len = mods.nightLen;
  const comp = mods.compress;
  const events = [];
  const names = shuffle(rng, SHIP_NAMES);
  let nameIx = 0;
  const nextName = () => names[nameIx++ % names.length];

  // Ships: arrivals spread across the night, in pairs for a convoy, with the hail before each.
  const ships = shipCount(night, mods);
  const weights = shipWeights(night).map((w) => (w.id === 'ferry' ? { ...w, w: w.w * mods.ferryWeightMul } : w));
  // Night one starts with a hail at once, so a new keeper has a ship to light within half a minute.
  const first = night <= 1 ? 6 : 25;
  const last = Math.max(first + 30, len - 110);
  const slots = [];
  for (let i = 0; i < ships; i++) slots.push(first + ((last - first) * (i + range(rng, 0.15, 0.85))) / ships);
  for (let i = 0; i < slots.length; i++) {
    const type = weighted(rng, weights).id;
    const distress = night >= 2 && rnd(rng) < (night >= 4 ? 0.16 : 0.1);
    events.push({ t: slots[i], kind: 'ship', type, name: nextName(), hail: mods.ascHail, distress, d: range(rng, -6, 6) });
    if (mods.convoy && i % 2 === 0) events.push({ t: slots[i] + 7, kind: 'ship', type: weighted(rng, weights).id, name: nextName(), hail: mods.ascHail, distress: false, d: range(rng, -6, 6) });
  }
  if (mods.special === 'grain') events.push({ t: len * 0.45, kind: 'ship', type: 'barge', name: 'Marram', hail: mods.ascHail, distress: false, d: 0, special: 'grain' });
  if (mods.special === 'smuggler') {
    events.push({ t: len * 0.5, kind: 'ship', type: 'skiff', name: 'Nameless', hail: 0, distress: false, d: 2, special: 'skiff' });
    events.push({ t: len * 0.5 + 9, kind: 'ship', type: 'cutter', name: 'Revenue', hail: 0, distress: false, d: -2, special: 'chaser' });
  }

  // Hostile events: a calm window of 60 s somewhere in the middle, and a cluster of three in 25 s after 40% of the night.
  const count = hostileCount(night, mods);
  const types = hostileTypes(night).filter((id) => !(id === 'moths' && mods.noMoths));
  const calmStart = range(rng, len * 0.25, len * 0.65);
  const calm = [calmStart, calmStart + 60];
  const panic = range(rng, Math.max(len * 0.4, calm[1] + 10), len - 90);
  const hostile = [];
  let krakens = 0;
  const newest = types[types.length - 1];
  for (let i = 0; i < count; i++) {
    let type = i === 0 && HOSTILES[newest].minNight === night ? newest : weighted(rng, types.map((id) => ({ id, w: HOSTILES[id].w }))).id;
    if (type === 'kraken') {
      if (krakens >= (night >= 10 ? 2 : 1)) type = 'drowned';
      else krakens++;
    }
    hostile.push(type);
  }
  // Place them: up to three in the panic cluster, the rest spread outside the calm window, 12 s apart at least.
  const times = [];
  const inCluster = Math.min(3, hostile.length);
  for (let i = 0; i < inCluster; i++) times.push(panic + (i * 25) / Math.max(1, inCluster - 1) * range(rng, 0.6, 1));
  let guard = 0;
  while (times.length < hostile.length && guard++ < 400) {
    const t = range(rng, 50, len - 60);
    if (t > calm[0] - 10 && t < calm[1]) continue;
    if (times.some((u) => Math.abs(u - t) < 12)) continue;
    times.push(t);
  }
  while (times.length < hostile.length) times.push(range(rng, 50, len - 60)); // never leave an event unplaced
  times.sort((a, b) => a - b);
  for (let i = 0; i < hostile.length; i++) {
    const type = hostile[i];
    const ev = { t: times[i], kind: 'hostile', type, tell: HOSTILES[type].tell };
    if (type === 'drowned') ev.n = Math.max(2, Math.min(7, Math.round(int(rng, 2, 2 + Math.floor(night / 4)) * mods.drownedMul)));
    if (type === 'siren' || type === 'mimic' || type === 'wraith') ev.u = range(rng, 0.2, 0.85);
    if (type === 'siren' || type === 'mimic') ev.side = rnd(rng) < 0.5 ? -1 : 1;
    events.push(ev);
  }
  // Lightning: a thunderstorm's peak is a window in the middle of the night.
  if (weather.thunder) {
    const peak = [len * 0.42, len * 0.66];
    let t = peak[0];
    const every = 25 / (mods.lightningRateMul * mods.lightningSite);
    while (t < peak[1]) {
      events.push({ t, kind: 'strike', near: rnd(rng) < 0.55 });
      t += every * range(rng, 0.7, 1.3);
    }
    events.push({ t: peak[0] - 15, kind: 'peak', on: true });
    events.push({ t: peak[1], kind: 'peak', on: false });
  }
  if (night === 12 && !mods.noTitan) events.push({ t: len * 0.5, kind: 'titan', tell: HOSTILES.titan.tell });
  for (const e of events) e.t = Math.max(1, e.t / comp);
  events.sort((a, b) => a.t - b.t);
  events.forEach((e, i) => (e.i = i));
  return { events, calm: [calm[0] / comp, calm[1] / comp], panic: panic / comp, len };
}

export const pickOne = pick;
