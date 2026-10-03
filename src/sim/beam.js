// The great lamp: where its light falls and what it costs. Pure functions over the night state.
import { SEA_R } from './route.js';

export const LENSES = ['white', 'amber', 'blue', 'red'];
export const R_MIN = 6;
export const R_MAX = 40;
export const DIST_MIN = 18;
export const SWEEP_PERIOD = 12; // seconds per revolution
export const SWEEP_HALF = 0.21; // radians: half the sweep wedge
export const SWEEP_LAMP = 0.5;

export function makeBeam(mods) {
  return {
    az: 0.4, dist: 90, r: 20, mode: 'sweep', lens: mods.startLens || 'white', strobe: 0, over: 0,
    swapLeft: 0, swapTo: null, offline: 0, grit: 0, heat: 0, lensInt: 100, sweepAz: 0, wipeLeft: 0, cracks: 0,
  };
}

export function clampAim(dist, r) {
  const rr = Math.max(R_MIN, Math.min(R_MAX, Number.isFinite(r) ? r : 20));
  const dd = Math.max(DIST_MIN, Math.min(SEA_R - rr, Number.isFinite(dist) ? dist : 90));
  return { dist: dd, r: rr };
}

export function maxDist(mods) {
  return Math.min(SEA_R - R_MIN, 300 * mods.rangeMul);
}

/** Raw spot intensity before grit, power and lens wear: the number heat and oil follow. */
export function rawIntensity(beam, mods) {
  const focus = Math.max(0.25, Math.min(2.5, (20 / beam.r) ** 2));
  let I = focus * mods.lampMul * mods.spotMul;
  if (beam.over) I *= 1.8;
  return I;
}

/** The pool centre on the water. */
export function poolCentre(beam) {
  return { x: Math.sin(beam.az) * beam.dist, z: Math.cos(beam.az) * beam.dist };
}

export function lampIsOn(state) {
  const b = state.beam;
  return !(b.offline > 0 || b.swapLeft > 0);
}

/** Useful spot intensity at the pool: what ships and creatures feel. */
export function spotIntensity(state) {
  const b = state.beam;
  const m = state.mods;
  if (!lampIsOn(state)) return 0;
  let I = rawIntensity(b, m);
  if (b.strobe && !m.strobeKeep) I *= 0.5;
  I *= 1 - 0.4 * b.grit;
  I *= 0.5 + 0.5 * (b.lensInt / 100);
  if (state.res.power <= 0) I *= 0.5;
  if (state.res.oil <= 0) I *= 0.5; // the wick's dregs: a hand-held spot still works
  return I;
}

/**
 * Light at a world point: { I, lens, sweep, flare }. The main beam (spot pool or sweep wedge), flare pools
 * and the Tide-Wraith's fog are all counted. Sweep lights a wedge along its azimuth at low intensity.
 */
export function lightAt(state, x, z, out = { I: 0, lens: 'white', sweep: false, flare: false }) {
  out.I = 0;
  out.lens = state.beam.lens;
  out.sweep = false;
  out.flare = false;
  const b = state.beam;
  const m = state.mods;
  if (lampIsOn(state)) {
    if (b.mode === 'spot') {
      const c = poolCentre(b);
      const d = Math.hypot(x - c.x, z - c.z);
      const edge = b.r * 1.15;
      if (d < edge) {
        const fall = d <= b.r ? 1 : 1 - (d - b.r) / (edge - b.r);
        out.I = spotIntensity(state) * fall;
      }
    } else if (state.res.oil > 0) {
      const dist = Math.hypot(x, z);
      const reach = maxDist(m) + 60;
      if (dist > DIST_MIN && dist < reach) {
        let da = Math.atan2(x, z) - b.sweepAz;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < SWEEP_HALF) {
          out.I = SWEEP_LAMP * m.lampMul * (1 - 0.4 * b.grit) * (0.5 + 0.5 * (b.lensInt / 100)) * (1 - dist / reach * 0.5);
          out.sweep = true;
        }
      }
    }
  }
  for (const p of state.pools) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) {
      const I = p.I * (1 - 0.3 * (d / p.r));
      if (I > out.I) {
        out.I = I;
        out.sweep = false;
        out.flare = true;
        out.lens = 'white';
      }
    }
  }
  if (out.I > 0) {
    for (const h of state.hostiles) {
      if (h.type !== 'wraith' || h.st !== 'move') continue;
      if (Math.hypot(x - h.x, z - h.z) < h.r) {
        let inHole = false;
        for (const hole of h.holes) if (Math.hypot(x - hole.x, z - hole.z) < hole.r) inHole = true;
        if (!inHole) out.I *= m.wraithInside;
      }
    }
  }
  return out;
}

/** Heat, oil, power and the lamp's timers for one tick. */
export function stepLamp(state, dt) {
  const b = state.beam;
  const m = state.mods;
  const res = state.res;
  // Timers.
  if (b.swapLeft > 0) {
    b.swapLeft = Math.max(0, b.swapLeft - dt);
    if (b.swapLeft === 0 && b.swapTo) {
      if (b.swapTo === 'spare') {
        b.lensInt = 100;
        b.offline = 0;
      } else b.lens = b.swapTo;
      b.swapTo = null;
      state.fx.push({ k: 'lens', lens: b.lens });
    }
  }
  if (b.offline > 0) b.offline = Math.max(0, b.offline - dt);
  if (b.wipeLeft > 0) {
    b.wipeLeft = Math.max(0, b.wipeLeft - dt);
    if (b.wipeLeft === 0) {
      b.grit = 0;
      for (const h of state.hostiles) if (h.type === 'moths' && h.st !== 'gone') {
        h.st = 'gone';
        state.fx.push({ k: 'moths-gone' });
      }
      state.fx.push({ k: 'wiped' });
    }
  }
  b.grit = Math.min(1, b.grit + m.gritBase * dt);
  // Sweep rotation needs power; at zero the lens stands still.
  if (b.mode === 'sweep' && res.power > 0 && lampIsOn(state)) b.sweepAz = (b.sweepAz + ((2 * Math.PI) / SWEEP_PERIOD) * dt) % (2 * Math.PI);
  // Heat.
  const on = lampIsOn(state);
  let heatIn = 0;
  if (on) {
    heatIn = b.mode === 'spot' ? 0.9 * Math.min(2.5, rawIntensity(b, m) / (b.over ? 1.8 : 1)) : 0.2;
    if (b.over && b.mode === 'spot') heatIn += 7 * m.overHeatMul;
  }
  const heatOut = (on ? 0.8 : 3) * m.coolMul;
  b.heat = Math.max(0, Math.min(100, b.heat + (heatIn * m.heatMul - heatOut) * dt));
  if (b.heat >= 100 && on) {
    b.heat = 40;
    b.lensInt = Math.max(0, b.lensInt - m.crackCost);
    b.offline = 12;
    b.over = 0;
    b.cracks++;
    state.fx.push({ k: 'crack', lensInt: b.lensInt });
    state.log.push(`Lens cracked. ${b.lensInt}% glass left.`);
  }
  // Oil (litres per second). Sweep is cheap; spot follows the raw intensity.
  let burn = 0;
  if (on) {
    if (b.mode === 'sweep') burn = 6.5 / 60;
    else burn = (14 / 60) * Math.max(0.55, Math.min(1.6, (20 / b.r) ** 1.5)) * (b.over ? 1.8 : 1);
    burn *= m.oilBurnMul;
  }
  if (state.gen.on && res.oil > 0 && res.power < m.powerMax) {
    burn += (0.6 / 60) * 10 * m.genBurnMul; // the generator drinks 6 L a minute
    res.power = Math.min(m.powerMax, res.power + 4 * m.genMul * dt);
  }
  res.oil = Math.max(0, res.oil - burn * dt);
  if (res.oil <= 0 && on && !state.flags.oilOut) {
    state.flags.oilOut = true;
    state.fx.push({ k: 'oilout' });
    state.log.push('Oil out.');
  }
  // Power: the motor, the gauges and whatever is being held.
  let drain = 0.05;
  if (b.mode === 'sweep' && on) drain += 0.4;
  if (state.horn.on && !m.hornFree) drain += 2.5;
  if (state.crank.on) res.power = Math.min(m.powerMax, res.power + 1.2 * m.crankMul * dt);
  res.power = Math.max(0, Math.min(m.powerMax, res.power - drain * dt));
  if (res.oil <= 0) {
    // No oil: the lamp still burns what is in the wick for a moment, then only the hand-held spot works at half.
    state.flags.lampStarved = true;
  } else state.flags.lampStarved = false;
}
