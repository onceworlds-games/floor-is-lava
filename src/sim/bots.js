// Scripted keepers. They read the night state and issue the same commands a player would, through
// applyCommand, so the balance harness and the in-browser autopilot share one brain.
//   lazy:   stays in the lantern room, white light, slow to react
//   basic:  lantern and watch room, amber for sirens, strobes moths
//   expert: every station and every verb, pre-emptive, manages heat, oil and power
//   sweep:  never leaves Sweep mode (the safety net test)
//   spot:   Spot all night, never Sweep (the oil test)
import { applyCommand } from './verbs.js';
import { shipPosOf } from './night.js';
import { reefAt } from './route.js';

const SKILL = {
  lazy: { period: 4.5, danger: 0.8, stations: ['lantern'], lens: false, strobe: false, gallery: false, watch: false, preempt: false, heat: false, oil: false, sticky: true },
  basic: { period: 0.5, danger: 0.5, stations: ['lantern', 'watch'], lens: true, strobe: true, gallery: false, watch: true, preempt: true, heat: true, oil: false },
  expert: { period: 0.25, danger: 0.4, stations: ['lantern', 'gallery', 'watch', 'cellar'], lens: true, strobe: true, gallery: true, watch: true, preempt: true, heat: true, oil: true },
  sweep: { period: 0.5, danger: 0.5, stations: ['lantern', 'watch'], lens: true, strobe: true, gallery: false, watch: true, preempt: false, heat: true, oil: false, sweepOnly: true },
  spot: { period: 0.25, danger: 0.4, stations: ['lantern', 'gallery', 'watch', 'cellar'], lens: true, strobe: true, gallery: true, watch: true, preempt: true, heat: true, oil: false, spotOnly: true },
};

export function makeBot(id, kind = 'basic') {
  return { id, kind, skill: SKILL[kind] || SKILL.basic, next: 0, goal: null, goalUntil: 0, lastSt: 'lantern', cmds: 0 };
}

function send(state, bot, cmd) {
  bot.cmds++;
  return applyCommand(state, cmd, bot.id);
}

function aimAt(state, bot, x, z, r) {
  const dist = Math.hypot(x, z);
  const az = Math.atan2(x, z);
  send(state, bot, { k: 'beam', az, dist, r });
}

function dangerOf(state, ship) {
  const reef = reefAt(state.route, ship.s, ship.d);
  return Math.abs(ship.d) / reef;
}

/** The ship most in need of light right now, or null. */
function worstShip(state, threshold, bot) {
  let best = null;
  let bd = threshold;
  if (bot && bot.skill.sticky && bot.stuck) {
    const s = state.ships.find((x) => x.id === bot.stuck && (x.st === 'sail' || x.st === 'distress'));
    if (s && s.guided < 5) return s;
    bot.stuck = null;
  }
  for (const ship of state.ships) {
    if (ship.st !== 'sail' && ship.st !== 'distress') continue;
    if (ship.special === 'chaser') continue;
    let d = dangerOf(state, ship);
    if (ship.guided > 2) d -= 0.5;
    if (ship.st === 'distress' && ship.credit < 1.5) d = Math.max(d, 0.75);
    if (d > bd) {
      bd = d;
      best = ship;
    }
  }
  return best;
}

function goTo(state, bot, st) {
  const c = state.crew[bot.id];
  if (!c) return false;
  if ((c.st === st && !c.move) || (c.move && c.to === st)) return c.st === st && !c.move;
  send(state, bot, { k: 'station', st });
  return false;
}

/** Decides what matters most this moment: { st, do: (state, bot) => void }. */
function plan(state, bot) {
  const s = bot.skill;
  const res = state.res;
  const b = state.beam;
  const t = state.t;
  const hostiles = state.hostiles;
  const door = hostiles.find((h) => h.type === 'drowned' && h.st === 'door');
  const climbing = hostiles.filter((h) => h.type === 'drowned' && h.st === 'climb');
  const kraken = hostiles.find((h) => h.type === 'kraken' && h.st === 'grip');
  const titan = hostiles.find((h) => h.type === 'titan' && h.st === 'fight');
  const siren = hostiles.find((h) => h.type === 'siren' && h.st === 'sing' && h.silenced <= 0 && h.scared <= 0);
  const mimic = hostiles.find((h) => h.type === 'mimic' && h.st === 'lure');
  const wraith = hostiles.find((h) => h.type === 'wraith' && h.st === 'move');
  const moths = hostiles.find((h) => h.type === 'moths' && h.st === 'on');
  const ship = worstShip(state, s.danger, bot);
  if (ship && s.sticky) bot.stuck = ship.id;
  const hidden = state.ships.find((x) => x.hidden && x.st === 'sail' && x.order !== 'anchor');

  // Tower first: nothing matters if it falls.
  if (door && s.gallery && res.flares > 0) return { st: 'gallery', why: 'door', run: () => send(state, bot, { k: 'flare', x: 4, z: 8 }) };
  if (door && s.gallery) return { st: 'gallery', why: 'repair', run: () => send(state, bot, { k: 'repair', on: true }) };
  if (kraken && s.gallery && res.harpoons >= 1 && res.reload <= 0) return { st: 'gallery', why: 'kraken', run: () => send(state, bot, { k: 'harpoon', x: kraken.x, z: kraken.z }) };
  if (kraken) return { st: 'lantern', why: 'kraken-light', run: () => { lens(state, bot, 'white'); spot(state, bot); aimAt(state, bot, kraken.x, kraken.z, 8); } };
  if (titan) return titanPlan(state, bot, titan);
  if (res.integ < 35 && s.gallery && !climbing.length && (!ship || dangerOf(state, ship) < 0.7)) return { st: 'gallery', why: 'repair', run: () => send(state, bot, { k: 'repair', on: true }) };
  // Threats that are about to cost ships.
  if (climbing.length && s.preempt && (!ship || dangerOf(state, ship) < 0.8)) {
    const h = climbing[0];
    return { st: 'lantern', why: 'burn', run: () => { lens(state, bot, 'red'); spot(state, bot); aimAt(state, bot, h.x, h.z, 10); } };
  }
  if (siren && s.lens && ship && Math.hypot(siren.x, siren.z) > 0) {
    const p = shipPosOf(state, ship);
    if (Math.hypot(p.x - siren.x, p.z - siren.z) < 110) {
      if (s.gallery && res.harpoons > 2 && res.reload <= 0 && bot.kind === 'expert') return { st: 'gallery', why: 'siren-harpoon', run: () => send(state, bot, { k: 'harpoon', x: siren.x, z: siren.z }) };
      return { st: 'lantern', why: 'siren', run: () => { lens(state, bot, 'amber'); spot(state, bot); aimAt(state, bot, siren.x, siren.z, 12); } };
    }
  }
  if (mimic && s.lens && !mimic.revealed && ship) {
    const p = shipPosOf(state, ship);
    if (Math.hypot(p.x - mimic.x, p.z - mimic.z) < 90) return { st: 'lantern', why: 'mimic', run: () => { lens(state, bot, 'blue'); spot(state, bot); aimAt(state, bot, mimic.x, mimic.z, 10); } };
  }
  if (hidden && s.watch && res.air > 6 && (res.power > 5 || state.mods.hornFree)) return { st: 'watch', why: 'horn', run: () => send(state, bot, { k: 'horn', on: true }) };
  if (hidden && wraith && s.gallery && res.flares > 1) {
    const p = shipPosOf(state, hidden);
    return { st: 'gallery', why: 'fog-flare', run: () => send(state, bot, { k: 'flare', x: p.x, z: p.z }) };
  }
  if (moths && s.strobe && b.grit > 0.3) return { st: 'lantern', why: 'moths', run: () => { spot(state, bot); send(state, bot, { k: 'strobe', on: true }); } };
  // Ships.
  if (ship) {
    const p = shipPosOf(state, ship);
    const danger = dangerOf(state, ship);
    if (s.watch && danger > 0.6 && ship.orderLeft <= 0 && res.power >= 6 * state.mods.radioCostMul && bot.kind !== 'lazy') {
      const c = state.crew[bot.id];
      if (c && c.st === 'watch' && !c.move) return { st: 'watch', why: 'radio', run: () => send(state, bot, { k: 'radio', ship: ship.id, order: ship.d > 0 ? 'port' : 'starboard' }) };
    }
    const r = s.sticky ? 20 : danger > 0.7 ? 10 : res.oil < 0.25 * res.oilMax ? 18 : 14;
    return { st: 'lantern', why: 'guide', run: () => { if (!siren) lens(state, bot, 'amber'); spot(state, bot); aimAt(state, bot, p.x, p.z, r); } };
  }
  // Nothing urgent: housekeeping.
  if (b.heat > 70 && s.heat) return { st: 'lantern', why: 'cool', run: () => sweep(state, bot) };
  if (res.power < 25 && s.watch && res.oil > 10 && !state.gen.on) return { st: 'watch', why: 'gen', run: () => send(state, bot, { k: 'gen', on: true }) };
  if (res.power > 90 && state.gen.on && s.watch) return { st: 'watch', why: 'gen-off', run: () => send(state, bot, { k: 'gen', on: false }) };
  if (res.power < 15 && res.oil <= 0 && s.watch) return { st: 'watch', why: 'crank', run: () => send(state, bot, { k: 'crank', on: true }) };
  if (res.oil <= 0 && res.oilCans > 0 && s.oil) return { st: 'cellar', why: 'oil', run: () => send(state, bot, { k: 'oil' }) };
  if (res.oil < 30 && res.oilCans > 0 && s.oil && bot.kind === 'expert') return { st: 'cellar', why: 'oil', run: () => send(state, bot, { k: 'oil' }) };
  if (b.lensInt < 100 && res.spareLens > 0 && s.heat) return { st: 'lantern', why: 'spare', run: () => send(state, bot, { k: 'spare' }) };
  if (b.grit > 0.5 && s.strobe) return { st: 'lantern', why: 'wipe', run: () => send(state, bot, { k: 'wipe' }) };
  if (res.integ < 80 && s.gallery && t > 30) return { st: 'gallery', why: 'repair', run: () => send(state, bot, { k: 'repair', on: true }) };
  // Idle: sweep to save oil, or hold the spot where ships come from.
  return { st: 'lantern', why: 'idle', run: () => (s.spotOnly ? (spot(state, bot), aimAt(state, bot, 30, 200, 20)) : sweep(state, bot)) };
}

function titanPlan(state, bot, titan) {
  const res = state.res;
  if (titan.phase === 1) return { st: 'lantern', why: 'titan-eyes', run: () => { lens(state, bot, 'white'); spot(state, bot); aimAt(state, bot, titan.x, titan.z, 10); } };
  if (titan.phase === 2) {
    if (res.harpoons > 0 && res.reload <= 0) return { st: 'gallery', why: 'titan-arms', run: () => send(state, bot, { k: 'harpoon', x: titan.x, z: titan.z }) };
    if (res.harpoons > 0) return { st: 'gallery', why: 'titan-reload', run: () => send(state, bot, { k: 'repair', on: true }) };
    return { st: 'gallery', why: 'titan-repair', run: () => send(state, bot, { k: 'repair', on: true }) };
  }
  if (titan.flares < 2 && res.flares > 0) {
    const lure = titan.lures.find((l) => !l.hit) || titan.lures[0];
    if (lure) return { st: 'gallery', why: 'titan-lure', run: () => send(state, bot, { k: 'flare', x: lure.x, z: lure.z }) };
  }
  if (titan.blasts < 4 && res.air > 3) return { st: 'watch', why: 'titan-horn', run: () => send(state, bot, { k: 'horn', on: true }) };
  if (res.air <= 3) return { st: 'watch', why: 'titan-breath', run: () => send(state, bot, { k: 'crank', on: true }) };
  return { st: 'gallery', why: 'titan-repair', run: () => send(state, bot, { k: 'repair', on: true }) };
}

function lens(state, bot, which) {
  const b = state.beam;
  if (!bot.skill.lens) return;
  if (b.lens === which || b.swapLeft > 0) return;
  send(state, bot, { k: 'lens', lens: which });
}

function spot(state, bot) {
  if (bot.skill.sweepOnly) return;
  if (state.beam.mode !== 'spot') send(state, bot, { k: 'mode', mode: 'spot' });
}

function sweep(state, bot) {
  if (bot.skill.spotOnly) return;
  if (state.beam.mode !== 'sweep') send(state, bot, { k: 'mode', mode: 'sweep' });
}

/** Runs the bot for this tick. Call every tick; it acts on its own period. */
export function stepBot(state, bot) {
  if (state.phase === 'dusk') {
    if (state.duskLeft > 0.1) send(state, bot, { k: 'light' });
    return;
  }
  if (state.phase !== 'night') return;
  bot.next -= 0.05;
  const c = state.crew[bot.id];
  if (!c) return;
  // Held verbs need refreshing more often than the bot thinks.
  if (bot.goal && c.st === bot.goal.st && !c.move && bot.goal.hold) send(state, bot, { k: bot.goal.hold, on: true });
  if (bot.next > 0) return;
  bot.next = bot.skill.period;
  const p = plan(state, bot);
  // Commit to a station for at least 3 s so the keeper doesn't dither on the stairs.
  if (bot.goal && bot.goal.st !== p.st && state.t < bot.goalUntil && !['door', 'kraken', 'kraken-light', 'burn'].includes(p.why)) return;
  if (!bot.goal || bot.goal.st !== p.st) bot.goalUntil = state.t + 3;
  bot.goal = { st: p.st, why: p.why, hold: ['repair', 'horn', 'crank', 'moths', 'titan-horn', 'titan-reload', 'titan-repair', 'titan-breath'].includes(p.why) ? (p.why === 'moths' ? 'strobe' : p.why.includes('horn') ? 'horn' : p.why.includes('crank') || p.why === 'titan-breath' ? 'crank' : 'repair') : null };
  if (!bot.skill.stations.includes(p.st)) return;
  if (goTo(state, bot, p.st)) p.run();
}

export const BOT_KINDS = Object.keys(SKILL);
