// Friendly ships: drift, guidance by light, radio orders, reefs, wrecks, crates and arrivals.
import { SHIPS } from './data/ships.js';
import { shipPos, reefAt, routeAt } from './route.js';
import { lightAt } from './beam.js';
import { noise1, range } from './rng.js';

const light = { I: 0, lens: 'white', sweep: false, flare: false };

export function spawnShip(state, ev) {
  const def = SHIPS[ev.type] || SHIPS.smack;
  const id = `s${state.counter++}`;
  const ship = {
    id, type: def.id, name: String(ev.name || def.name).slice(0, 24), s: 0, d: Number.isFinite(ev.d) ? ev.d : 0, v: def.speed,
    st: 'sail', credit: 0, guided: 0, lit: 0, sweepLit: 0, order: null, orderLeft: 0, anchorLeft: 0, hidden: 0, seen: 0,
    sinkLeft: 0, special: ev.special || null, ds: state.counter * 31 + 7, dStop: ev.distress ? range(state.rng, state.route.L * 0.3, state.route.L * 0.6) : 0,
    needs: 0, gunsCd: 10, held: 0, blocked: 0, stall: 0,
  };
  if (ship.special === 'chaser') ship.v = def.speed * 1.1;
  state.ships.push(ship);
  state.stats.shipsIn++;
  state.fx.push({ k: 'ship', id, type: ship.type, name: ship.name });
  return ship;
}

/** The lateral pull on a ship from sirens and mimics (in metres per second, signed along d). */
function lurePull(state, ship, pos) {
  let pull = 0;
  for (const h of state.hostiles) {
    if (h.type === 'siren' && h.st === 'sing' && h.silenced <= 0 && h.scared <= 0) {
      const dist = Math.hypot(h.x - pos.x, h.z - pos.z);
      if (dist < 90) pull += 1.5 * Math.sign(h.side) * (1 - dist / 180);
    } else if (h.type === 'mimic' && h.st === 'lure' && !ship.guided) {
      const dist = Math.hypot(h.x - pos.x, h.z - pos.z);
      if (dist < 80) pull += 1.0 * Math.sign(h.side);
    }
  }
  return pull;
}

function insideWraith(state, pos) {
  for (const h of state.hostiles) {
    if (h.type !== 'wraith' || h.st !== 'move') continue;
    if (Math.hypot(h.x - pos.x, h.z - pos.z) < h.r) {
      for (const hole of h.holes) if (Math.hypot(hole.x - pos.x, hole.z - pos.z) < hole.r) return false;
      return true;
    }
  }
  return false;
}

export function wreckShip(state, ship, why) {
  if (ship.st === 'wreck' || ship.st === 'saved' || ship.st === 'lost') return;
  const def = SHIPS[ship.type];
  ship.st = 'wreck';
  ship.v = 0;
  ship.sinkLeft = 10;
  state.stats.wrecked++;
  const rep = -6 + state.mods.repWreckAdd - (ship.special === 'grain' ? 6 : 0);
  addRep(state, rep);
  const pos = shipPos(state.route, ship.s, ship.d);
  if (def.crate || state.mods.allCrates) state.crates.push({ id: `c${state.counter++}`, x: pos.x, z: pos.z, lit: 0, life: state.mods.crateSink ? 60 : 9999, value: Math.round((def.crate || 25) * state.mods.crateMul), taken: 0 });
  state.fx.push({ k: 'wreck', id: ship.id, x: pos.x, z: pos.z, name: ship.name, why });
  state.log.push(`${ship.name} on the reef${why ? ` (${why})` : ''}.`);
}

export function addRep(state, delta) {
  state.res.rep = Math.max(-1, Math.min(100, state.res.rep + delta));
  state.stats.repDelta += delta;
  if (state.mods.repFloor >= 0 && state.res.rep < state.mods.repFloor) state.res.rep = state.mods.repFloor;
}

export function addCoins(state, n, why) {
  const c = Math.max(0, Math.round(n));
  state.res.coins += c;
  state.stats.coins += c;
  if (c > 0) state.fx.push({ k: 'coins', n: c, why });
}

function saveShip(state, ship) {
  const def = SHIPS[ship.type];
  ship.st = 'saved';
  state.stats.saved++;
  let value = def.value + (ship.type === 'ferry' ? state.mods.ferryValueAdd : 0);
  let mul = state.mods.coinMul;
  if (ship.type === 'smack') mul *= state.mods.smackCoinMul;
  if (ship.type === 'barge') mul *= state.mods.bargeCoinMul;
  let coins = value * 12 * mul;
  if (ship.special === 'grain') coins += 200;
  if (ship.special === 'skiff') coins += 120;
  if (ship.special === 'chaser') coins = 0;
  addCoins(state, coins, 'saved');
  addRep(state, def.rep);
  state.fx.push({ k: 'saved', id: ship.id, name: ship.name, coins: Math.round(coins), type: ship.type });
  state.log.push(`${ship.name} made harbour.`);
}

/** A radio order from the keeper (already validated): returns true when the ship took it. */
export function giveOrder(state, ship, order) {
  const def = SHIPS[ship.type];
  if (ship.st !== 'sail' && ship.st !== 'distress') return false;
  const m = state.mods;
  const chance = m.radioSure ? 1 : def.radio * (1 - Math.min(0.9, state.weather.static + m.ascStatic));
  state.stats.radioCalls++;
  const roll = (state.rng.s = (state.rng.s + 0x6d2b79f5) >>> 0) / 4294967296;
  if (roll > chance) {
    state.fx.push({ k: 'radio-fail', id: ship.id });
    return false;
  }
  ship.order = order;
  ship.orderLeft = order === 'anchor' ? 40 : 12;
  if (order === 'anchor') ship.anchorLeft = 40;
  else ship.anchorLeft = 0;
  if (ship.st === 'distress' && (order === 'port' || order === 'starboard') && ship.credit >= 1.5) {
    ship.st = 'sail';
    state.fx.push({ k: 'engine', id: ship.id });
  }
  ship.needs = 0;
  state.fx.push({ k: 'radio-ok', id: ship.id, order });
  return true;
}

export function stepShips(state, dt) {
  const m = state.mods;
  const route = state.route;
  const storm = state.weather.storm;
  const t = state.t;
  for (const ship of state.ships) {
    if (ship.st === 'saved' || ship.st === 'lost') continue;
    if (ship.st === 'wreck') {
      ship.sinkLeft -= dt;
      continue;
    }
    const def = SHIPS[ship.type];
    const pos = shipPos(route, ship.s, ship.d);
    ship.hidden = insideWraith(state, pos) ? 1 : 0;
    // Light and guidance.
    lightAt(state, pos.x, pos.z, light);
    ship.lit = light.I >= 0.2 && !light.sweep ? 1 : 0;
    ship.sweepLit = light.sweep ? 1 : 0;
    if (light.I >= 0.2) {
      let rate = Math.min(1, light.I);
      if (light.lens === 'amber' && !light.flare) rate *= 1.5;
      if (light.sweep) rate *= m.sweepCredit;
      ship.credit += rate * dt;
      if (ship.credit >= 1.5) {
        ship.credit = 0;
        if (ship.guided <= 0) state.fx.push({ k: 'guided', id: ship.id });
        ship.guided = 6;
      }
      if (!ship.seen) {
        ship.seen = 1;
      }
    } else ship.credit = Math.max(0, ship.credit - 0.25 * dt);
    ship.guided = Math.max(0, ship.guided - dt);
    // Lateral motion: current and swell push it off the line; light and orders pull it back.
    const p = routeAt(route, ship.s);
    let drift = (0.35 + 1.3 * storm) * m.driftMul * def.driftMul;
    if (p.narrow) drift *= m.narrowsDriftMul;
    if (ship.sweepLit && m.ascSweepOrient) drift *= 0.7;
    const anchored = ship.order === 'anchor' && ship.anchorLeft > 0;
    if (anchored) drift *= 0.15 * m.anchorDriftMul;
    else if (ship.order === 'hold' && ship.orderLeft > 0) drift *= 0.6;
    const dir = p.cur * (0.55 + 0.45 * noise1(ship.ds, t / 8));
    let dd = drift * dir + lurePull(state, ship, pos) * (anchored ? 0.3 : 1);
    if (ship.guided > 0) {
      const strength = 2.0 * (def.guideMul || 1) * (light.lens === 'red' && ship.lit ? 0.5 : 1);
      dd -= Math.sign(ship.d) * Math.min(Math.abs(ship.d) / dt, strength);
    }
    if (ship.orderLeft > 0 && (ship.order === 'port' || ship.order === 'starboard')) dd += ship.order === 'port' ? -1.4 : 1.4;
    ship.d += dd * dt;
    // Forward motion.
    let v = def.speed * (1 - 0.2 * storm);
    if (ship.st === 'distress') v = 0;
    if (ship.orderLeft > 0 && (ship.order === 'hold' || ship.order === 'anchor')) v = 0;
    // A stopped ship ahead blocks the channel.
    ship.blocked = 0;
    for (const o of state.ships) {
      if (o === ship || o.st === 'saved' || o.st === 'lost') continue;
      if (o.s > ship.s && o.s - ship.s < 18 && Math.abs(o.d - ship.d) < 12 && (o.v === 0 || o.st === 'wreck')) {
        v = 0;
        ship.blocked = 1;
      }
    }
    if (ship.special === 'chaser') {
      const skiff = state.ships.find((o) => o.special === 'skiff' && o.st === 'sail');
      if (skiff && skiff.s - ship.s < 30) v = Math.max(0, v * 0.9);
    }
    ship.v = v;
    ship.s += v * dt;
    if (ship.orderLeft > 0) {
      ship.orderLeft -= dt;
      if (ship.orderLeft <= 0) {
        ship.order = null;
        ship.anchorLeft = 0;
      }
    }
    if (ship.anchorLeft > 0) ship.anchorLeft -= dt;
    // Distress: the engine fails once, at a set point.
    if (ship.st === 'sail' && ship.dStop > 0 && ship.s >= ship.dStop) {
      ship.st = 'distress';
      ship.dStop = 0;
      ship.needs = 1;
      state.fx.push({ k: 'distress', id: ship.id, name: ship.name });
      state.log.push(`${ship.name}: engine gone.`);
    }
    // Fog bell: hidden ships anchor by themselves after a while.
    if (m.fogAnchor && ship.hidden && ship.order !== 'anchor') {
      ship.stall += dt;
      if (ship.stall > 20) {
        ship.order = 'anchor';
        ship.orderLeft = 40;
        ship.anchorLeft = 40;
        ship.stall = 0;
      }
    } else ship.stall = 0;
    // Does it need the radio? Drifting into the narrows, hidden, lured, or broken down.
    const reef = reefAt(route, ship.s, ship.d);
    const danger = Math.abs(ship.d) / reef;
    ship.needs = ship.st === 'distress' || (danger > 0.6 && ship.guided <= 0) || (ship.hidden && ship.order !== 'anchor') ? 1 : 0;
    // The reef.
    if (Math.abs(ship.d) > reef) wreckShip(state, ship, ship.hidden ? 'in the fog' : lurePull(state, ship, pos) !== 0 ? 'lured' : 'drifted');
    else if (ship.s >= route.L) saveShip(state, ship);
    // Smuggler's run: the cutter fires if the skiff is lit within 40 m of it.
    if (ship.special === 'skiff' && ship.lit && !light.sweep) {
      const chaser = state.ships.find((o) => o.special === 'chaser' && o.st === 'sail');
      if (chaser) {
        const cp = shipPos(route, chaser.s, chaser.d);
        if (Math.hypot(cp.x - pos.x, cp.z - pos.z) < 40) {
          ship.st = 'lost';
          addRep(state, -8);
          state.fx.push({ k: 'gunfire', x: pos.x, z: pos.z });
          state.log.push('The cutter fired. The skiff is gone.');
        }
      }
    }
    // Naval guns: a creature lit for 4 s within 60 m takes a shot every 25 s.
    if (def.guns && ship.st === 'sail') {
      ship.gunsCd -= dt;
      if (ship.gunsCd <= 0) {
        for (const h of state.hostiles) {
          if (h.litFor >= 4 && Math.hypot(h.x - pos.x, h.z - pos.z) < 60 && (h.st === 'sing' || h.st === 'lure' || h.st === 'climb' || h.st === 'grip')) {
            h.hit = (h.hit || 0) + 1;
            ship.gunsCd = 25;
            state.fx.push({ k: 'guns', x: pos.x, z: pos.z, tx: h.x, tz: h.z });
            break;
          }
        }
      }
    }
  }
  // Remove sunk wrecks; crates sink or get lit.
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const ship = state.ships[i];
    if (ship.st === 'wreck' && ship.sinkLeft <= 0) {
      ship.st = 'lost';
      state.fx.push({ k: 'sunk', id: ship.id });
    }
  }
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const c = state.crates[i];
    c.life -= dt;
    lightAt(state, c.x, c.z, light);
    if (light.I >= 0.4 && !light.sweep) c.lit += dt;
    else c.lit = Math.max(0, c.lit - dt);
    if (c.lit >= 2) {
      addCoins(state, c.value, 'salvage');
      state.stats.crates++;
      state.fx.push({ k: 'salvage', x: c.x, z: c.z, n: c.value });
      state.log.push(`Salvage lit. ${c.value} coin.`);
      state.crates.splice(i, 1);
    } else if (c.life <= 0) state.crates.splice(i, 1);
  }
  if (state.ships.length > 40) state.ships = state.ships.filter((s) => s.st !== 'saved' && s.st !== 'lost').slice(-40);
}

export const shipLight = light;
