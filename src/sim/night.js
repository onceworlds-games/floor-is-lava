// One night, as plain data stepped at a fixed 50 ms. No DOM, no clocks, no randomness outside state.rng.
import { hashSeed } from './rng.js';
import { buildRoute } from './route.js';
import { WEATHER } from './data/weather.js';
import { computeMods } from './modifiers.js';
import { buildTimeline } from './timeline.js';
import { makeBeam, stepLamp, LENSES } from './beam.js';
import { spawnShip, stepShips, addRep, giveOrder } from './ships.js';
import { spawnHostile, stepHostiles, hornEffects, strike, flareEffects, harpoonLands } from './hostiles.js';
import { shipPos } from './route.js';

export const TICK = 0.05;
export const STATIONS = ['lantern', 'gallery', 'watch', 'cellar'];
export const DUSK = 45;

/**
 * cfg: { seed, night, season: { keeper, site, asc, upgrades, relics, charter, almanacRead }, weather: id }
 */
export function createNight(cfg) {
  const season = cfg.season || {};
  const mods = computeMods(season);
  const weather = WEATHER[cfg.weather] || WEATHER.clear;
  const night = Math.max(1, Math.floor(Number(cfg.night) || 1));
  const seed = hashSeed(cfg.seed ?? 1, night);
  const rng = { s: seed };
  const state = {
    v: 1, seed: cfg.seed ?? 1, night, phase: 'dusk', t: 0, tick: 0, duskLeft: DUSK, dawnLeft: 0, result: null,
    rng, mods, weather, site: season.site || 'skerry-rock', route: null, tl: null, nextEv: 0, pending: [], counter: 1, evMut: {}, barked: [],
    beam: makeBeam(mods),
    res: { oil: mods.oilMax, oilMax: mods.oilMax, power: mods.powerMax, integ: mods.startInteg, air: 30, harpoons: mods.harpoons, flares: mods.flares, spareLens: mods.spareLens, oilCans: mods.oilCans, reload: 0, rep: Number.isFinite(season.rep) ? season.rep : 60, coins: 0 },
    gen: { on: 0 }, horn: { on: 0 }, crank: { on: 0 },
    ships: [], hostiles: [], pools: [], crates: [], shots: [],
    stations: { lantern: null, gallery: null, watch: null, cellar: null }, crew: {},
    flags: {}, fx: [], log: [], peak: 0,
    stats: { shipsIn: 0, saved: 0, wrecked: 0, coins: 0, repDelta: 0, crates: 0, damage: 0, sirensSilenced: 0, sirensKilled: 0, mimicsRevealed: 0, strikes: 0, stunned: 0, drownedBurned: 0, drownedScattered: 0, krakensRepelled: 0, harpoonHits: 0, radioCalls: 0, flaresFired: 0, harpoonsFired: 0, oilOut: 0, powerOut: 0, hornTime: 0, crankTime: 0, repairTime: 0, spotTime: 0, sweepTime: 0, overTime: 0, cracks: 0, survived: {} },
    apprentice: { next: 3, hornUntil: 0 }, dog: { barked: 0 },
  };
  state.route = buildRoute(state.site);
  state.tl = buildTimeline({ s: hashSeed(seed, 'deck') }, { night, mods, weather });
  state.log.push(`Night ${night}. ${weather.name}. ${weather.tell}`);
  return state;
}

/** The route is derived from the site, never sent: rebuild it on a copy that lacks it. */
export function hydrate(state) {
  if (!state.route) state.route = buildRoute(state.site);
  if (!state.tl) {
    state.tl = buildTimeline({ s: hashSeed(hashSeed(state.seed ?? 1, state.night), 'deck') }, { night: state.night, mods: state.mods, weather: state.weather });
    const byId = new Map(state.tl.events.map((e) => [e.i, e]));
    for (const k of Object.keys(state.evMut || {})) {
      const e = byId.get(Number(k));
      if (e && Number.isFinite(state.evMut[k])) e.t = state.evMut[k];
    }
    state.tl.events.sort((a, b) => a.t - b.t);
    state.nextEv = state.tl.events.filter((e) => e.t <= state.t).length;
  }
  return state;
}

export function addCrew(state, id, st = 'lantern') {
  if (!id || state.crew[id]) return state.crew[id];
  const c = { st: STATIONS.includes(st) ? st : 'lantern', to: null, move: 0, stun: 0, holds: {}, scanAcc: 0, aim: null };
  state.crew[id] = c;
  claimStation(state, id, c.st);
  return c;
}

export function removeCrew(state, id) {
  const c = state.crew[id];
  if (!c) return;
  delete state.crew[id];
  for (const st of STATIONS) if (state.stations[st] === id) state.stations[st] = nextAt(state, st);
}

function nextAt(state, st) {
  for (const id of Object.keys(state.crew)) if (state.crew[id].st === st && !state.crew[id].move) return id;
  return null;
}

function claimStation(state, id, st) {
  if (!state.stations[st] || !state.crew[state.stations[st]]) state.stations[st] = id;
}

export function holds(state, id, verb) {
  const c = state.crew[id];
  return Boolean(c && c.holds[verb] > state.t);
}

function anyHolding(state, verb, stations) {
  for (const id of Object.keys(state.crew)) {
    const c = state.crew[id];
    if (c.move || c.stun > 0) continue;
    if (stations.includes(c.st) && c.holds[verb] > state.t) return id;
  }
  return null;
}

/** A hit on the tower staggers anyone on the stairs. */
export function stagger(state) {
  if (state.flags.staggerAt > state.t - 3) return;
  state.flags.staggerAt = state.t;
  for (const id of Object.keys(state.crew)) {
    const c = state.crew[id];
    if (c.move > 0) {
      c.move = Math.min(c.move + 1, 6);
      state.fx.push({ k: 'stagger', id });
    }
  }
}

function stepCrew(state, dt) {
  for (const id of Object.keys(state.crew)) {
    const c = state.crew[id];
    if (c.stun > 0) c.stun = Math.max(0, c.stun - dt);
    if (c.move > 0) {
      c.move = Math.max(0, c.move - dt);
      if (c.move === 0 && c.to) {
        c.st = c.to;
        c.to = null;
        claimStation(state, id, c.st);
        state.fx.push({ k: 'arrived', id, st: c.st });
      }
    }
  }
  for (const st of STATIONS) {
    const holder = state.stations[st];
    const c = holder ? state.crew[holder] : null;
    if (!c || c.st !== st || c.move) state.stations[st] = nextAt(state, st);
  }
}

function stepTimeline(state, dt) {
  const tl = state.tl;
  const t = state.t;
  // The dog hears the next hostile thing four seconds before its tell.
  if (state.mods.dog) {
    for (let i = state.nextEv; i < tl.events.length; i++) {
      const ev = tl.events[i];
      if (ev.t > t + 4) break;
      if ((ev.kind === 'hostile' || ev.kind === 'titan') && !state.barked.includes(ev.i)) {
        state.barked.push(ev.i);
        if (state.barked.length > 60) state.barked.shift();
        state.fx.push({ k: 'bark', type: ev.type });
      }
    }
  }
  while (state.nextEv < tl.events.length && tl.events[state.nextEv].t <= t) {
    const ev = tl.events[state.nextEv++];
    if (ev.kind === 'ship') {
      if (ev.hail > 0) {
        state.pending.push({ at: t + ev.hail, ev });
        state.fx.push({ k: 'hail', type: ev.type, name: ev.name, at: t + ev.hail });
        if (state.mods.hailReveals) for (const h of state.hostiles) if (h.type === 'mimic' && h.st === 'lure') h.labelled = 1;
      } else spawnShip(state, ev);
    } else if (ev.kind === 'hostile' || ev.kind === 'titan') spawnHostile(state, ev.kind === 'titan' ? { type: 'titan', tell: ev.tell } : ev);
    else if (ev.kind === 'strike') strike(state, ev.near);
    else if (ev.kind === 'peak') {
      state.peak = ev.on ? 1 : 0;
      state.fx.push({ k: 'peak', on: state.peak });
    }
  }
  for (let i = state.pending.length - 1; i >= 0; i--) {
    if (state.pending[i].at <= t) {
      spawnShip(state, state.pending[i].ev);
      state.pending.splice(i, 1);
    }
  }
}

function stepApprentice(state, dt) {
  const m = state.mods;
  if (!m.apprentice || state.stations.watch) return;
  const a = state.apprentice;
  a.next -= dt;
  if (a.next > 0) return;
  a.next = 2.5;
  const good = (state.rng.s = (state.rng.s + 0x6d2b79f5) >>> 0) / 4294967296 < 0.7;
  const ship = state.ships.find((s) => s.needs && (s.st === 'sail' || s.st === 'distress') && !s.hidden);
  if (ship && state.res.power >= 6 * m.radioCostMul) {
    const right = ship.st === 'distress' || Math.abs(ship.d) > 1 ? (ship.d > 0 ? 'port' : 'starboard') : 'hold';
    const wrong = right === 'port' ? 'starboard' : 'port';
    state.res.power = Math.max(0, state.res.power - 6 * m.radioCostMul);
    if (giveOrder(state, ship, good ? right : wrong)) state.fx.push({ k: 'apprentice', what: 'radio' });
    return;
  }
  const wantHorn = state.ships.some((s) => s.hidden && s.st === 'sail' && s.order !== 'anchor') || state.hostiles.some((h) => h.type === 'siren' && h.st === 'sing' && h.silenced <= 0);
  if (wantHorn && good && state.res.air > 8) {
    a.hornUntil = state.t + 3;
    state.fx.push({ k: 'apprentice', what: 'horn' });
  }
}

/** Advances the night by dt seconds (always TICK). Returns the state. */
export function stepNight(state, dt = TICK) {
  hydrate(state);
  state.fx.length = 0;
  if (state.phase === 'over') return state;
  if (state.phase === 'dusk') {
    state.duskLeft = Math.max(0, state.duskLeft - dt);
    stepCrew(state, dt);
    if (state.duskLeft === 0) {
      state.phase = 'night';
      state.fx.push({ k: 'nightfall' });
    }
    return state;
  }
  if (state.phase === 'dawn') {
    state.dawnLeft -= dt;
    if (state.dawnLeft <= 0) finish(state, 'dawn');
    return state;
  }
  state.t += dt;
  state.tick++;
  const m = state.mods;
  stepCrew(state, dt);
  stepTimeline(state, dt);
  stepApprentice(state, dt);
  // What is being held at each station this tick.
  const b = state.beam;
  const lantern = state.stations.lantern;
  b.strobe = lantern && holds(state, lantern, 'strobe') && b.mode === 'spot' ? 1 : 0;
  b.over = lantern && holds(state, lantern, 'over') && b.mode === 'spot' ? 1 : 0;
  state.horn.on = (anyHolding(state, 'horn', ['watch']) || state.apprentice.hornUntil > state.t) && state.res.air > 0 && (state.res.power > 0 || m.hornFree) ? 1 : 0;
  state.crank.on = anyHolding(state, 'crank', ['watch', 'cellar']) ? 1 : 0;
  const repairing = anyHolding(state, 'repair', ['gallery', 'cellar']);
  state.flags.hammering = repairing ? 1 : 0;
  if (repairing) {
    state.res.integ = Math.min(100, state.res.integ + 2 * m.repairMul * dt);
    state.stats.repairTime += dt;
  }
  if (state.horn.on) {
    state.res.air = Math.max(0, state.res.air - dt);
    state.stats.hornTime += dt;
    hornEffects(state, dt);
  } else state.res.air = Math.min(30, state.res.air + 2 * dt);
  if (state.crank.on) state.stats.crankTime += dt;
  // Scanning: the gallery's binoculars name what they rest on.
  for (const id of Object.keys(state.crew)) {
    const c = state.crew[id];
    if (c.st !== 'gallery' || c.move || c.stun > 0 || !(c.holds.scan > state.t) || !c.aim) {
      c.scanAcc = 0;
      continue;
    }
    c.scanAcc += dt;
    if (c.scanAcc >= (m.hailReveals ? 0.1 : 0.6)) {
      c.scanAcc = 0;
      scanAt(state, c.aim.x, c.aim.z);
    }
  }
  stepLamp(state, dt);
  if (b.mode === 'spot') {
    state.stats.spotTime += dt;
    if (b.over) state.stats.overTime += dt;
  } else state.stats.sweepTime += dt;
  // Pools drift with the wind and die.
  const wind = 0.6 * state.weather.storm;
  for (let i = state.pools.length - 1; i >= 0; i--) {
    const p = state.pools[i];
    p.life -= dt;
    p.x += Math.sin(state.weather.windDir || 0.8) * wind * dt;
    p.z += Math.cos(state.weather.windDir || 0.8) * wind * dt;
    if (p.life <= 0) state.pools.splice(i, 1);
  }
  // Harpoons in flight.
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const sh = state.shots[i];
    sh.life -= dt;
    if (sh.life <= 0) {
      const hit = harpoonLands(state, sh.x, sh.z);
      state.fx.push({ k: 'splash', x: sh.x, z: sh.z, hit: hit ? hit.type : null });
      state.shots.splice(i, 1);
    }
  }
  if (state.res.reload > 0) state.res.reload = Math.max(0, state.res.reload - dt);
  // The sea against the tower.
  const wave = Math.max(0, state.weather.storm - 0.4) * 0.25 * m.waveMul * m.waveSite;
  if (wave > 0) {
    state.res.integ = Math.max(0, state.res.integ - wave * dt);
    state.stats.damage += wave * dt;
  }
  stepShips(state, dt);
  stepHostiles(state, dt);
  if (state.res.power <= 0 && !state.flags.powerOut) {
    state.flags.powerOut = true;
    state.stats.powerOut = 1;
    state.fx.push({ k: 'powerout' });
    state.log.push('Power gone. Crank it.');
  }
  if (state.res.power > 5) state.flags.powerOut = false;
  if (state.res.oil <= 0) state.stats.oilOut = 1;
  // Integrity warnings ring the bell at 50, 25 and 10.
  for (const level of [50, 25, 10]) {
    if (state.res.integ <= level && !state.flags[`bell${level}`]) {
      state.flags[`bell${level}`] = true;
      state.fx.push({ k: 'bell', level });
    }
    if (state.res.integ > level + 10) state.flags[`bell${level}`] = false;
  }
  // Ends.
  if (state.res.integ <= 0) return finish(state, 'disaster');
  if (state.res.rep < 0) return finish(state, 'dismissed');
  const titanUp = state.hostiles.some((h) => h.type === 'titan' && h.st !== 'gone');
  if (state.t >= state.tl.len && !titanUp && state.phase === 'night') {
    state.phase = 'dawn';
    state.dawnLeft = 6;
    state.fx.push({ k: 'dawn' });
    // Ships still afloat see the dawn: they make harbour.
    for (const ship of state.ships) if (ship.st === 'sail' || ship.st === 'distress') {
      ship.s = state.route.L;
    }
    stepShips(state, 0.001);
  }
  return state;
}

function finish(state, result) {
  if (state.phase === 'over') return state;
  state.phase = 'over';
  state.result = result;
  if (result === 'disaster') {
    addRep(state, -15);
    state.log.push('The tower fell. Night over.');
    for (const ship of state.ships) if (ship.st === 'sail' || ship.st === 'distress') ship.st = 'lost';
  } else if (result === 'dismissed') state.log.push('Dismissed from the service.');
  else state.log.push(`Dawn. ${state.stats.saved} home, ${state.stats.wrecked} lost.`);
  for (const h of state.hostiles) state.stats.survived[h.type] = 1;
  state.stats.cracks = state.beam.cracks;
  state.fx.push({ k: 'over', result });
  return state;
}

/** The binoculars: name the nearest thing within 30 m of the aimed point. */
export function scanAt(state, x, z) {
  let best = null;
  let bd = 30;
  for (const ship of state.ships) {
    if (ship.st === 'saved' || ship.st === 'lost') continue;
    const p = shipPosOf(state, ship);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = { kind: 'ship', ship };
    }
  }
  for (const h of state.hostiles) {
    if (h.st === 'gone' || h.type === 'moths') continue;
    const d = Math.hypot(h.x - x, h.z - z);
    if (d < bd + (h.type === 'wraith' ? h.r : 0)) {
      bd = d;
      best = { kind: 'hostile', h };
    }
  }
  if (!best) return null;
  if (best.kind === 'ship') {
    if (!best.ship.seen) state.fx.push({ k: 'scanned', what: 'ship', id: best.ship.id, name: best.ship.name });
    best.ship.seen = 1;
  } else {
    const h = best.h;
    if (h.type === 'mimic' && !h.labelled) {
      h.labelled = 1;
      state.fx.push({ k: 'scanned', what: 'mimic', id: h.id });
      state.log.push('Scanned: false lights.');
    } else if (!h.scanned) {
      h.scanned = 1;
      state.fx.push({ k: 'scanned', what: h.type, id: h.id });
    }
  }
  return best;
}

export function shipPosOf(state, ship) {
  return shipPos(state.route, ship.s, ship.d);
}

export { LENSES, flareEffects };
