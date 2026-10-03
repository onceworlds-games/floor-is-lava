// Commands from keepers (and bots) into the night. Every command is validated against the sender's
// station and the state before it does anything: the host never trusts a page.
import { STATIONS, holds } from './night.js';
import { clampAim, maxDist, LENSES, SWEEP_HALF } from './beam.js';
import { SEA_R } from './route.js';
import { giveOrder } from './ships.js';
import { flareEffects } from './hostiles.js';
import { ORDERS } from './data/ships.js';

const FLIGHTS = { lantern: 3, gallery: 2, watch: 1, cellar: 0 };
const HOLD = 0.5;
const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

function clampSea(x, z) {
  const d = Math.hypot(x, z);
  if (!Number.isFinite(d) || d === 0) return { x: 0, z: 30 };
  if (d > SEA_R - 5) return { x: (x / d) * (SEA_R - 5), z: (z / d) * (SEA_R - 5) };
  return { x, z };
}

/**
 * Applies cmd from player `by`. Returns true when the command did something. Unknown or
 * malformed commands are ignored. Verbs that are held (strobe, overcharge, horn, crank, repair,
 * scan) take { on: true } repeatedly; the hold lapses by itself half a second after the last one.
 */
export function applyCommand(state, cmd, by) {
  if (!cmd || typeof cmd !== 'object' || typeof cmd.k !== 'string') return false;
  if (state.phase === 'over') return false;
  const c = state.crew[by];
  if (!c) return false;
  const m = state.mods;
  const at = (st) => c.st === st && !c.move && c.stun <= 0 && state.stations[st] === by;
  const here = (st) => c.st === st && !c.move && c.stun <= 0;
  const hold = (verb) => {
    c.holds[verb] = cmd.on === false ? 0 : state.t + HOLD;
    return true;
  };
  switch (cmd.k) {
    case 'station': {
      if (!STATIONS.includes(cmd.st) || c.stun > 0) return false;
      if (cmd.st === c.st && !c.move) return false;
      const from = c.move ? c.to : c.st;
      if (cmd.st === from && c.move) return false;
      const flights = Math.max(1, Math.abs(FLIGHTS[cmd.st] - FLIGHTS[from]));
      c.to = cmd.st;
      c.move = m.stairs * Math.min(2, flights) * (flights > 1 ? 0.75 : 1);
      c.holds = {};
      for (const st of STATIONS) if (state.stations[st] === by) state.stations[st] = null;
      state.fx.push({ k: 'stairs', id: by, to: cmd.st, from });
      return true;
    }
    case 'light':
      if (state.phase !== 'dusk') return false;
      state.duskLeft = 0;
      return true;
    case 'pet':
      if (!m.cat) return false;
      state.fx.push({ k: 'purr', id: by });
      return true;
    // Lantern room.
    case 'beam': {
      if (!at('lantern')) return false;
      const b = state.beam;
      const a = clampAim(num(cmd.dist, 0, 1000, b.dist), num(cmd.r, 0, 100, b.r));
      b.dist = Math.min(a.dist, maxDist(m));
      b.r = a.r;
      if (Number.isFinite(cmd.az)) b.az = Math.atan2(Math.sin(cmd.az), Math.cos(cmd.az));
      return true;
    }
    case 'mode': {
      if (!at('lantern')) return false;
      const b = state.beam;
      b.mode = cmd.mode === 'sweep' || cmd.mode === 'spot' ? cmd.mode : b.mode === 'spot' ? 'sweep' : 'spot';
      if (b.mode === 'sweep') b.sweepAz = b.az;
      state.fx.push({ k: 'mode', mode: b.mode });
      return true;
    }
    case 'lens': {
      if (!at('lantern')) return false;
      const b = state.beam;
      const lens = LENSES.includes(cmd.lens) ? cmd.lens : LENSES[(LENSES.indexOf(b.lens) + 1) % LENSES.length];
      if (lens === b.lens && !b.swapTo) return false;
      if (b.swapLeft > 0) return false;
      b.swapTo = lens;
      b.swapLeft = m.swap;
      state.fx.push({ k: 'swap', lens });
      return true;
    }
    case 'spare': {
      if (!at('lantern')) return false;
      const b = state.beam;
      if (state.res.spareLens <= 0 || b.lensInt >= 100 || b.swapLeft > 0) return false;
      state.res.spareLens--;
      b.swapTo = 'spare';
      b.swapLeft = m.swap;
      state.fx.push({ k: 'swap', lens: 'spare' });
      state.log.push('Spare lens fitted.');
      return true;
    }
    case 'strobe':
    case 'over':
      if (!at('lantern')) return false;
      return hold(cmd.k);
    case 'wipe': {
      if (!at('lantern')) return false;
      const b = state.beam;
      if (b.wipeLeft > 0 || (b.grit <= 0 && !state.hostiles.some((h) => h.type === 'moths' && h.st === 'on'))) return false;
      b.wipeLeft = 2;
      state.fx.push({ k: 'wipe' });
      return true;
    }
    // Gallery.
    case 'aim': {
      // Where the binoculars or the guns point; view-only, so anyone at the gallery may send it.
      if (!here('gallery')) return false;
      c.aim = clampSea(num(cmd.x, -1000, 1000), num(cmd.z, -1000, 1000));
      return true;
    }
    case 'scan':
      if (!here('gallery')) return false;
      if (Number.isFinite(cmd.x) && Number.isFinite(cmd.z)) c.aim = clampSea(cmd.x, cmd.z);
      return hold('scan');
    case 'flare': {
      if (!at('gallery') || state.res.flares <= 0) return false;
      const p = clampSea(num(cmd.x, -1000, 1000, 0), num(cmd.z, -1000, 1000, 60));
      state.res.flares--;
      state.stats.flaresFired++;
      state.pools.push({ id: `f${state.counter++}`, x: p.x, z: p.z, r: 28 * m.flareRMul, I: 0.8, life: 18 * m.flareTMul });
      flareEffects(state, p.x, p.z);
      state.fx.push({ k: 'flare', x: p.x, z: p.z });
      return true;
    }
    case 'harpoon': {
      if (!at('gallery') || state.res.harpoons <= 0 || state.res.reload > 0) return false;
      const p = clampSea(num(cmd.x, -1000, 1000, 0), num(cmd.z, -1000, 1000, 60));
      state.res.harpoons--;
      state.stats.harpoonsFired++;
      state.res.reload = 4 + m.reloadAdd;
      state.shots.push({ id: `p${state.counter++}`, x: p.x, z: p.z, life: 0.6, from: by });
      state.fx.push({ k: 'harpoon', x: p.x, z: p.z });
      return true;
    }
    case 'repair':
      if (!here('gallery') && !here('cellar')) return false;
      return hold('repair');
    // Watch room.
    case 'radio': {
      if (!at('watch')) return false;
      if (!ORDERS.includes(cmd.order)) return false;
      const ship = state.ships.find((s) => s.id === cmd.ship);
      if (!ship || (ship.st !== 'sail' && ship.st !== 'distress')) return false;
      const cost = 6 * m.radioCostMul;
      if (state.res.power < cost) {
        state.fx.push({ k: 'radio-dead' });
        return false;
      }
      state.res.power -= cost;
      giveOrder(state, ship, cmd.order);
      return true;
    }
    case 'horn':
      if (!at('watch')) return false;
      return hold('horn');
    case 'gen':
      if (!at('watch')) return false;
      state.gen.on = cmd.on === undefined ? (state.gen.on ? 0 : 1) : cmd.on ? 1 : 0;
      state.fx.push({ k: 'gen', on: state.gen.on });
      return true;
    case 'crank':
      if (!here('watch') && !here('cellar')) return false;
      return hold('crank');
    // Cellar.
    case 'oil': {
      if (!here('cellar') || state.res.oilCans <= 0) return false;
      state.res.oilCans--;
      state.res.oil = Math.min(state.res.oilMax, state.res.oil + 20);
      state.flags.oilOut = false;
      state.fx.push({ k: 'oil' });
      state.log.push('Can poured.');
      return true;
    }
    case 'crate': {
      if (!here('cellar') || state.flags.crateTaken) return false;
      state.flags.crateTaken = 1;
      state.res.flares += 2;
      state.fx.push({ k: 'crate' });
      return true;
    }
    default:
      return false;
  }
}

export { SWEEP_HALF, holds };
