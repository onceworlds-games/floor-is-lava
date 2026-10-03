// Hostile things: the Drowned, Sirens, Mimics, the Tide-Wraith, moths, the Kraken, lightning and the Titan.
import { routeAt, shipPos, reefPoints, SEA_R } from './route.js';
import { lightAt, spotIntensity, poolCentre } from './beam.js';
import { rnd, range, int, pick } from './rng.js';
import { stagger } from './night.js';

const light = { I: 0, lens: 'white', sweep: false, flare: false };

/**
 * The Tide Titan's three faces: seconds of hard light on its eyes, harpoon hits on its arms, horn blasts and lit lures at
 * its maw. Each face has `face` seconds before it slams the tower and starts over; each wears at the tower (`chip` per
 * second) and its swell shoves the ships (`swell` times the drift).
 */
// It is the season's last word: tuned so an expert keeper with a good build puts it under a little over a third of the time.
export const TITAN = { eyes: 35.5, hits: 8, blasts: 4, lures: 2, face: 60, swell: 1.8, chip: [0, 1.2, 2.0, 1.8] };

function reefSpot(state, u, side) {
  const route = state.route;
  const p = routeAt(route, route.L * u);
  const w = side > 0 ? p.reefR : p.reefL;
  return { x: p.x + Math.cos(p.h) * (w + 6) * side, z: p.z - Math.sin(p.h) * (w + 6) * side, s: p.s };
}

function nearTower(state, dist) {
  const a = range(state.rng, 0, Math.PI * 2);
  return { x: Math.sin(a) * dist, z: Math.cos(a) * dist };
}

export function spawnHostile(state, ev) {
  const id = `h${state.counter++}`;
  const base = { id, type: ev.type, st: 'tell', tellLeft: ev.tell || 5, x: 0, z: 0, litFor: 0, hit: 0, life: 0 };
  let h = base;
  const m = state.mods;
  switch (ev.type) {
    case 'drowned': {
      // A group on the reef nearest the tower, climbing toward the door.
      const pts = reefPoints(state.route, pick(state.rng, [-1, 1]), 20).filter((p) => Math.hypot(p.x, p.z) < 110);
      const p = pts.length ? pick(state.rng, pts) : nearTower(state, 70);
      const n = Math.max(1, Math.min(8, ev.n || 3));
      h = { ...base, x: p.x, z: p.z, n, b: new Array(n).fill(0), p: 0, climb: m.climbTime * m.climbMul };
      break;
    }
    case 'siren': {
      const p = reefSpot(state, ev.u ?? 0.5, ev.side || 1);
      h = { ...base, x: p.x, z: p.z, s: p.s, side: ev.side || 1, silenced: 0, scared: 0, life: 70 };
      break;
    }
    case 'mimic': {
      const p = reefSpot(state, ev.u ?? 0.5, ev.side || 1);
      const far = (ev.side || 1) * 22;
      const rp = routeAt(state.route, p.s);
      h = { ...base, x: p.x + Math.cos(rp.h) * far, z: p.z - Math.sin(rp.h) * far, s: p.s, side: ev.side || 1, labelled: 0, revealed: 0, life: 80 * m.mimicLifeMul };
      break;
    }
    case 'wraith': {
      const s = state.route.L * (ev.u ?? 0.5);
      const p = routeAt(state.route, s);
      h = { ...base, x: p.x, z: p.z, s, r: 70, holes: [], life: 120, pushCd: 0 };
      break;
    }
    case 'moths':
      h = { ...base, life: 60, strobeAcc: 0 };
      break;
    case 'kraken': {
      const p = nearTower(state, 26);
      h = { ...base, x: p.x, z: p.z, hp: 3, lightAcc: 0, life: 40, tellLeft: 8 };
      break;
    }
    case 'titan': {
      h = { ...base, x: 0, z: 150, phase: 1, phaseLeft: TITAN.face, lightAcc: 0, harpoons: 0, blasts: 0, blastAcc: 0, flares: 0, lures: [], tellLeft: 20 };
      break;
    }
    default:
      return null;
  }
  state.hostiles.push(h);
  state.fx.push({ k: 'tell', type: h.type, id, x: h.x, z: h.z });
  return h;
}

function damageTower(state, amount, why) {
  if (amount <= 0) return;
  state.res.integ = Math.max(0, state.res.integ - amount);
  state.stats.damage += amount;
  if (why) state.fx.push({ k: 'damage', why, n: amount });
}

/** The horn is sounding this tick: everything that listens. */
export function hornEffects(state, dt) {
  const m = state.mods;
  const reach = 220 * m.hornRangeMul;
  for (const h of state.hostiles) {
    if (h.st === 'gone') continue;
    const dist = Math.hypot(h.x, h.z);
    if (h.type === 'siren' && h.st === 'sing' && dist < reach) {
      h.st = 'fled';
      h.life = 2;
      state.fx.push({ k: 'siren-flee', x: h.x, z: h.z });
      state.log.push('Horn. The siren left her rock.');
    }
    if (h.type === 'wraith' && h.st === 'move' && dist < reach + 100) {
      h.pushCd -= dt;
      if (h.pushCd <= 0) {
        h.pushCd = 4;
        h.s = Math.max(0, h.s - 40);
        const p = routeAt(state.route, h.s);
        h.x = p.x;
        h.z = p.z;
        state.fx.push({ k: 'wraith-push', x: h.x, z: h.z });
      }
    }
    if (h.type === 'titan' && h.phase === 3 && h.st === 'fight') {
      h.blastAcc += dt;
      if (h.blastAcc >= 2.5) {
        h.blastAcc = 0;
        h.blasts++;
        state.fx.push({ k: 'titan-blast', n: h.blasts });
      }
    }
  }
  // Ships hidden in fog drop anchor at the horn.
  for (const ship of state.ships) {
    if (ship.st === 'sail' && ship.hidden && ship.order !== 'anchor') {
      ship.order = 'anchor';
      ship.orderLeft = 40;
      ship.anchorLeft = 40;
      state.fx.push({ k: 'anchor', id: ship.id });
    }
  }
  // The Kraken hears it: a scheduled one comes now.
  const tl = state.tl;
  for (let i = state.nextEv; i < tl.events.length; i++) {
    const ev = tl.events[i];
    if (ev.kind === 'hostile' && ev.type === 'kraken' && ev.t - state.t < 150 && ev.t > state.t + 10) {
      ev.t = state.t + 1;
      state.evMut[ev.i] = ev.t;
      tl.events.sort((a, b) => a.t - b.t);
      state.log.push('Something answered the horn.');
      break;
    }
  }
}

/** A flare pool landed at (x, z): startle and burn. */
export function flareEffects(state, x, z) {
  for (const h of state.hostiles) {
    if (h.st === 'gone') continue;
    const d = Math.hypot(h.x - x, h.z - z);
    if (h.type === 'drowned' && h.st !== 'gone' && d < 24) {
      h.st = 'gone';
      state.stats.drownedScattered += h.n;
      state.fx.push({ k: 'scatter', x: h.x, z: h.z, n: h.n });
    } else if (h.type === 'siren' && h.st === 'sing' && d < 25) {
      h.scared = 10;
      state.fx.push({ k: 'siren-scared', x: h.x, z: h.z });
    } else if (h.type === 'wraith' && h.st === 'move' && d < h.r) {
      h.holes.push({ x, z, r: 30, life: 12 });
      state.fx.push({ k: 'fog-hole', x, z });
    } else if (h.type === 'titan' && h.st === 'fight' && h.phase === 3) {
      for (const lure of h.lures) if (!lure.hit && Math.hypot(lure.x - x, lure.z - z) < 30) {
        lure.hit = 1;
        h.flares++;
        state.fx.push({ k: 'lure-hit', x: lure.x, z: lure.z });
      }
    }
  }
  // The door: Drowned at the base scatter from a flare dropped there.
  if (Math.hypot(x, z) < 30) for (const h of state.hostiles) if (h.type === 'drowned' && h.st === 'door') {
    h.st = 'gone';
    state.stats.drownedScattered += h.n;
    state.fx.push({ k: 'scatter', x: 0, z: 0, n: h.n });
  }
}

/** A harpoon lands at (x, z): the nearest creature within 7 m takes it. Returns what it hit. */
export function harpoonLands(state, x, z) {
  let best = null;
  let bd = 7;
  for (const h of state.hostiles) {
    if (h.st === 'gone' || h.st === 'tell' || h.type === 'moths' || h.type === 'wraith') continue;
    const d = Math.hypot(h.x - x, h.z - z);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  if (!best) return null;
  best.hit += state.mods.harpoonDmgMul;
  state.stats.harpoonHits++;
  state.fx.push({ k: 'harpoon-hit', type: best.type, x: best.x, z: best.z });
  return best;
}

export function stepHostiles(state, dt) {
  const m = state.mods;
  const res = state.res;
  const alm = (type) => m.almanac[type] || 1;
  for (const h of state.hostiles) {
    if (h.st === 'gone') continue;
    if (h.st === 'tell') {
      h.tellLeft -= dt;
      if (h.tellLeft > 0) continue;
      h.st = h.type === 'drowned' ? 'climb' : h.type === 'siren' ? 'sing' : h.type === 'mimic' ? 'lure' : h.type === 'wraith' ? 'move' : h.type === 'moths' ? 'on' : h.type === 'kraken' ? 'grip' : 'fight';
      state.fx.push({ k: 'arrive', type: h.type, id: h.id, x: h.x, z: h.z });
      if (h.type === 'kraken') {
        state.log.push('Kraken on the tower.');
        stagger(state);
      }
      if (h.type === 'titan') state.log.push('It is here.');
      if (h.type === 'titan') h.phaseLeft = TITAN.face;
      continue;
    }
    lightAt(state, h.x, h.z, light);
    const lit = light.I >= 0.5 && !light.sweep;
    h.litFor = lit ? h.litFor + dt : 0;
    switch (h.type) {
      case 'drowned': {
        if (h.st === 'climb') {
          h.p += dt / h.climb;
          if (lit) {
            const rate = (light.lens === 'red' ? 2.5 / 1.7 : 1) * (light.lens === 'red' ? m.redBurnMul : 1) * alm('drowned') * Math.min(1.5, light.I);
            // Burn the front creature first; each needs 2.5 s of light.
            for (let i = 0; i < h.b.length; i++) {
              if (h.b[i] >= 2.5) continue;
              h.b[i] += rate * dt;
              if (h.b[i] >= 2.5) {
                h.n--;
                state.stats.drownedBurned++;
                state.fx.push({ k: 'burn', x: h.x, z: h.z });
              }
              break;
            }
          }
          if (h.hit >= 1) {
            h.hit = 0;
            for (let i = 0; i < h.b.length; i++) if (h.b[i] < 2.5) {
              h.b[i] = 2.5;
              h.n--;
              state.fx.push({ k: 'burn', x: h.x, z: h.z });
              break;
            }
          }
          if (h.n <= 0) {
            h.st = 'gone';
            state.log.push('Drowned burned off the reef.');
          } else if (h.p >= 1) {
            h.st = 'door';
            h.x = 0;
            h.z = 0;
            state.fx.push({ k: 'door', n: h.n });
            stagger(state);
            state.log.push(`${h.n} at the door.`);
          }
        } else if (h.st === 'door') {
          damageTower(state, 2 * Math.sqrt(h.n) * m.doorDmgMul * m.doorMul * dt, null);
          state.flags.doorUnderAttack = state.t;
          h.life += dt;
          if (m.hammerScatters && state.flags.hammering && h.life > 4) {
            h.life = 0;
            h.n--;
            state.fx.push({ k: 'scatter', x: 0, z: 0, n: 1 });
            if (h.n <= 0) h.st = 'gone';
          }
          // They tire and slide back; on the first night sooner, so a new keeper learns the door without losing the tower.
          if (h.life > (state.night <= 1 ? 20 : 35)) {
            h.st = 'gone';
            state.fx.push({ k: 'scatter', x: 0, z: 0, n: h.n });
          }
        }
        break;
      }
      case 'siren': {
        h.life -= dt;
        if (h.silenced > 0) h.silenced -= dt;
        if (h.scared > 0) h.scared -= dt;
        if (lit && light.lens === 'amber' && h.silenced <= 0 && h.st === 'sing') {
          h.silenced = 6 * m.silenceMul * alm('siren');
          state.stats.sirensSilenced++;
          state.fx.push({ k: 'siren-silenced', x: h.x, z: h.z });
        }
        if (h.hit >= 1 && h.st === 'sing') {
          h.st = 'dead';
          h.life = 1.5;
          state.stats.sirensKilled++;
          state.fx.push({ k: 'siren-dead', x: h.x, z: h.z });
          state.log.push('Siren, harpooned.');
        }
        if (h.life <= 0) h.st = 'gone';
        break;
      }
      case 'mimic': {
        h.life -= dt;
        if (h.st === 'lure' && lit && (light.lens === 'blue' || m.mimicAnyLens) && !light.flare) {
          h.st = 'halted';
          h.revealed = 1;
          h.life = Math.min(h.life, 20);
          state.stats.mimicsRevealed++;
          state.fx.push({ k: 'mimic-revealed', x: h.x, z: h.z });
          state.log.push('False lights. Halted.');
        }
        if (h.hit >= 1 && h.st !== 'dead') {
          h.st = 'dead';
          h.life = 1;
          state.fx.push({ k: 'mimic-dead', x: h.x, z: h.z });
        }
        if (h.life <= 0) h.st = 'gone';
        break;
      }
      case 'wraith': {
        h.life -= dt;
        h.s += 1.0 * m.wraithSpeedMul * dt;
        const p = routeAt(state.route, h.s);
        h.x = p.x;
        h.z = p.z;
        for (let i = h.holes.length - 1; i >= 0; i--) {
          h.holes[i].life -= dt;
          if (h.holes[i].life <= 0) h.holes.splice(i, 1);
        }
        if (h.life <= 0 || h.s >= state.route.L) h.st = 'gone';
        break;
      }
      case 'moths': {
        h.life -= dt;
        const b = state.beam;
        if (h.st === 'on') {
          b.grit = Math.min(1, b.grit + dt / 8);
          if (b.strobe && b.mode === 'spot') {
            h.strobeAcc += dt;
            if (h.strobeAcc >= 2) {
              h.st = 'gone';
              state.fx.push({ k: 'moths-gone' });
              state.log.push('Moths strobed off.');
            }
          } else h.strobeAcc = Math.max(0, h.strobeAcc - dt);
          if (h.life <= 0) h.st = 'gone';
        }
        break;
      }
      case 'kraken': {
        h.life -= dt;
        damageTower(state, 3 * dt, null);
        state.flags.krakenGrip = state.t;
        // Hard white, close: six seconds at I >= 2 with the white lens.
        if (lit && light.lens === 'white' && light.I >= 2 && !light.flare) h.lightAcc += dt * alm('kraken');
        if (h.hit >= 3 * alm('kraken') || h.lightAcc >= 6) {
          h.st = 'gone';
          state.stats.krakensRepelled++;
          state.fx.push({ k: 'kraken-retreat', x: h.x, z: h.z });
          state.log.push('Kraken let go.');
        } else if (h.life <= 0) {
          h.st = 'gone';
          state.log.push('Kraken slid back.');
        }
        break;
      }
      case 'titan':
        stepTitan(state, h, dt, light, lit);
        break;
    }
  }
  // Prune.
  if (state.hostiles.length > 24) state.hostiles = state.hostiles.filter((h) => h.st !== 'gone').slice(-24);
}

function stepTitan(state, h, dt, light, lit) {
  h.phaseLeft -= dt;
  // Every face wears at the tower while it lasts, and its swell (see stepShips) shoves the ships toward the reef.
  const chip = TITAN.chip[h.phase] || 0;
  state.res.integ = Math.max(0, state.res.integ - chip * dt);
  state.stats.damage += chip * dt;
  if (h.phase === 1) {
    // Eyes: it only comes closer while unlit. Light it hard (I >= 1.5) for TITAN.eyes seconds in all.
    if (lit && light.I >= 1.5) h.lightAcc += dt;
    else h.z = Math.max(60, h.z - 1.5 * dt);
    if (h.lightAcc >= TITAN.eyes) titanPhase(state, h, 2);
  } else if (h.phase === 2) {
    // Arms: TITAN.hits harpoon hits.
    if (h.hit >= TITAN.hits) titanPhase(state, h, 3);
  } else if (h.phase === 3) {
    // Maw: TITAN.blasts blasts of the horn and a flare on each lure.
    if (!h.lures.length) h.lures = [{ x: -40, z: 110, hit: 0 }, { x: 45, z: 120, hit: 0 }];
    if (h.blasts >= TITAN.blasts && h.flares >= TITAN.lures) {
      h.st = 'gone';
      state.flags.titanDown = true;
      state.fx.push({ k: 'titan-down' });
      state.log.push('The Titan went under. Dawn can come.');
    }
  }
  if (h.phaseLeft <= 0 && h.st !== 'gone') {
    // It wears you down: each phase that outlasts you takes a bite of the tower and starts over.
    state.res.integ = Math.max(0, state.res.integ - 15);
    state.fx.push({ k: 'titan-slam' });
    stagger(state);
    h.phaseLeft = TITAN.face;
    // A face that outlasts the keeper also restocks what it asks for, so a missed shot is a cost, not a dead end.
    if (h.phase === 2 && state.res.harpoons < 1) state.res.harpoons = 1;
    if (h.phase === 3 && state.res.flares < 1 && h.flares < TITAN.lures) state.res.flares = 1;
  }
}

function titanPhase(state, h, phase) {
  h.phase = phase;
  h.phaseLeft = TITAN.face;
  h.hit = 0;
  h.z = Math.min(h.z, 90);
  // The keeper's reserve opens for the face that needs it: never a Titan that can't be finished for want of iron or fire.
  if (phase === 2 && state.res.harpoons < Math.ceil(TITAN.hits / state.mods.harpoonDmgMul)) state.res.harpoons = Math.ceil(TITAN.hits / state.mods.harpoonDmgMul);
  if (phase === 3 && state.res.flares < TITAN.lures) state.res.flares = TITAN.lures;
  state.fx.push({ k: 'titan-phase', phase });
  state.log.push(phase === 2 ? 'Its arms are on the rail. Iron, now.' : 'The maw. Horn, and fire on the lures.');
}

/** A lightning strike this tick. */
export function strike(state, near) {
  const m = state.mods;
  const a = range(state.rng, 0, Math.PI * 2);
  const d = near ? range(state.rng, 6, 20) : range(state.rng, 40, 140);
  const x = Math.sin(a) * d;
  const z = Math.cos(a) * d;
  state.fx.push({ k: 'lightning', x, z, near: near ? 1 : 0 });
  if (!near) return;
  state.stats.strikes++;
  if (m.lightningPower) state.res.power = Math.min(m.powerMax, state.res.power + m.lightningPower);
  if (m.rod) {
    state.fx.push({ k: 'rod' });
    return;
  }
  damageTower(state, 8, 'lightning');
  stagger(state);
  for (const id of Object.keys(state.crew)) {
    const c = state.crew[id];
    if (c.st === 'gallery' && !c.move && !m.noStun) {
      c.stun = 10;
      state.stats.stunned++;
      state.fx.push({ k: 'stun', id });
      state.log.push('Struck on the gallery.');
    }
  }
}

export const hostileLight = light;
export { SEA_R, int, rnd, spotIntensity, poolCentre, shipPos };
