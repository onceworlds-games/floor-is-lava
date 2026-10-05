// The platformer physics: one body, one fixed step. The same code moves the player's own character, the host's bots and the
// bots' look-ahead. Pure: no browser. Units are world units and seconds; y points up and a body's (x, y) is the middle of its feet.

import { PHYS, TAU, LOBBY_CEIL, approach, clamp } from './rules.js';

export const EV_JUMP = 1;
export const EV_LAND = 2;
export const EV_BOUNCE = 4;
export const EV_DROP = 8;

/** Where a rolling chair's middle is at round time `t`. */
export function platformX(p, t) {
  return p.kind === 'move' ? p.x + p.amp * Math.sin((TAU * t) / p.period + p.phase) : p.x;
}

/** A tower made playable: the pieces plus what changes over a round (pillows that fell, the floor that melts). */
export function makeWorld(tower, opts = {}) {
  const P = tower.platforms;
  const order = P.map((_, i) => i).sort((a, b) => P[a].y - P[b].y || a - b);
  return {
    tower,
    platforms: P,
    w: tower.w,
    goal: tower.goal,
    goalY: tower.goalY,
    ceiling: tower.lobby ? LOBBY_CEIL : tower.goalY + 8,
    floorUntil: opts.floorUntil ?? Infinity, // the floor is solid until this round time
    ct: new Float64Array(P.length).fill(-1), // when a pillow was stood on (-1: not)
    bt: new Float64Array(P.length).fill(-99), // when a trampoline last bounced someone (for its look)
    order,
    ys: order.map((i) => P[i].y),
  };
}

/** 0: a pillow is steady, 1: wobbling, 2: fallen. Everything else is 0. */
export function crumbleState(world, i, t) {
  if (world.platforms[i].kind !== 'crumble') return 0;
  const c = world.ct[i];
  if (c < 0) return 0;
  const d = t - c;
  if (d < 0) return 0;
  if (d < PHYS.wobble) return 1;
  return d < PHYS.wobble + PHYS.crumbleGone ? 2 : 0;
}

function touchCrumble(world, i, t) {
  const c = world.ct[i];
  if (c < 0 || t - c >= PHYS.wobble + PHYS.crumbleGone || t < c) world.ct[i] = t;
}

export function isSolid(world, i, t) {
  const p = world.platforms[i];
  if (p.kind === 'floor') return t < world.floorUntil;
  if (p.kind === 'crumble') return crumbleState(world, i, t) !== 2;
  return true;
}

export function makeBody(x, y) {
  return { x, y, vx: 0, vy: 0, on: 0, gi: -1, coyote: 0, buffer: 0, cut: 0, drop: -1, dropT: 0, face: 1, maxY: y, ev: 0, impact: 0, bi: -1 };
}

export function copyBody(to, from) {
  to.x = from.x;
  to.y = from.y;
  to.vx = from.vx;
  to.vy = from.vy;
  to.on = from.on;
  to.gi = from.gi;
  to.coyote = from.coyote;
  to.buffer = from.buffer;
  to.cut = from.cut;
  to.drop = from.drop;
  to.dropT = from.dropT;
  to.face = from.face;
  to.maxY = from.maxY;
  to.ev = 0;
  to.impact = 0;
  to.bi = -1;
  return to;
}

function lowerBound(ys, v) {
  let lo = 0;
  let hi = ys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * One step of `dt` seconds at round time `t`. `inp`: { x: -1..1 (run), down: bool (drop through), jump: bool (held), tap: bool (pressed
 * since the last step) }. `live` false is a look-ahead (nothing in the world changes: no pillows triggered, no trampolines pushed).
 * Events (EV_*) are OR-ed into `b.ev` and `b.impact`; whoever reads them clears them.
 */
export function stepBody(world, b, inp, dt, t, live = true) {
  const P = PHYS;
  const plats = world.platforms;

  // a rolling chair carries whoever stands on it
  if (b.on && b.gi >= 0) {
    const p = plats[b.gi];
    if (p.kind === 'move') b.x += platformX(p, t) - platformX(p, t - dt);
  }

  // running
  const ix = clamp(inp.x, -1, 1);
  if (ix > 0.05) b.face = 1;
  else if (ix < -0.05) b.face = -1;
  const target = ix * P.maxSpeed;
  let acc;
  if (b.on) acc = Math.abs(ix) < 0.05 ? P.friction : ix * b.vx < 0 ? P.runAccel * 1.6 : P.runAccel;
  else acc = Math.abs(ix) < 0.05 ? P.airAccel * 0.35 : P.airAccel;
  b.vx = approach(b.vx, target, acc * dt);

  // coyote time and the jump buffer
  b.coyote = b.on ? P.coyote : Math.max(0, b.coyote - dt);
  b.buffer = inp.tap ? P.buffer : Math.max(0, b.buffer - dt);
  if (b.buffer > 0 && b.coyote > 0) {
    b.vy = P.jumpV;
    b.buffer = 0;
    b.coyote = 0;
    b.on = 0;
    b.gi = -1;
    b.cut = 1;
    b.ev |= EV_JUMP;
  }
  // a short press makes a short hop
  if (b.cut) {
    if (b.vy <= 0) b.cut = 0;
    else if (!inp.jump && b.vy > P.cutV) {
      b.vy = P.cutV;
      b.cut = 0;
    }
  }

  // press down: drop through the piece under you (not the floor)
  if (inp.down && b.on && b.gi >= 0 && plats[b.gi].kind !== 'floor') {
    b.drop = b.gi;
    b.dropT = 0;
    b.on = 0;
    b.gi = -1;
    b.vy = -2;
    b.coyote = 0;
    b.ev |= EV_DROP;
  }

  // gravity: lighter going up, heavier coming down (the trapezoid is exact for a constant pull)
  const vy0 = b.vy;
  let vy1 = vy0 - (vy0 > 0 ? P.gUp : P.gDown) * dt;
  if (vy1 < -P.maxFall) vy1 = -P.maxFall;
  const prevY = b.y;
  b.x += b.vx * dt;
  if (b.x < P.halfW) {
    b.x = P.halfW;
    if (b.vx < 0) b.vx = 0;
  } else if (b.x > world.w - P.halfW) {
    b.x = world.w - P.halfW;
    if (b.vx > 0) b.vx = 0;
  }
  b.y = prevY + (vy0 + vy1) * 0.5 * dt;
  b.vy = vy1;
  if (b.y + P.height > world.ceiling) {
    b.y = world.ceiling - P.height;
    if (b.vy > 0) b.vy = 0;
  }

  // landing: only on the way down, only on a top surface you were above
  b.on = 0;
  if (b.vy <= 0) {
    let best = -1;
    let bestY = -Infinity;
    const ys = world.ys;
    for (let k = lowerBound(ys, b.y - 1e-6); k < ys.length; k++) {
      const y = ys[k];
      if (y > prevY + 0.02) break;
      const i = world.order[k];
      if (i === b.drop || !isSolid(world, i, t)) continue;
      const p = plats[i];
      if (Math.abs(b.x - platformX(p, t)) > p.w * 0.5 + P.landHalf) continue;
      if (y >= bestY) {
        bestY = y;
        best = i;
      }
    }
    if (best >= 0) {
      const p = plats[best];
      const impact = -b.vy;
      b.y = bestY;
      if (p.kind === 'bounce') {
        b.vy = P.bounceV;
        b.gi = -1;
        b.coyote = 0;
        b.cut = 0;
        b.ev |= EV_BOUNCE;
        b.bi = best;
        if (live) world.bt[best] = t;
      } else {
        b.vy = 0;
        b.on = 1;
        b.gi = best;
        if (b.y > b.maxY) b.maxY = b.y;
        if (impact > 2.5) {
          b.ev |= EV_LAND;
          if (impact > b.impact) b.impact = impact;
        }
        if (live && p.kind === 'crumble') touchCrumble(world, best, t);
      }
    }
  }
  if (b.drop >= 0) {
    b.dropT += dt;
    if (b.y < plats[b.drop].y - 0.45 || b.dropT > 0.6) b.drop = -1;
  }
}

/** Standing in the balloon basket? (Landed on it, or reached its height inside it.) */
export function reachedGoal(world, b) {
  if (world.goal < 0) return false;
  const g = world.platforms[world.goal];
  return b.y >= g.y - 0.06 && b.y <= g.y + 3 && Math.abs(b.x - g.x) <= g.w / 2 + 0.2;
}

/** A ghost: no collisions, floats up, goes where the stick says. `inp`: { x, my } with my up-positive; `floorY` keeps it above the lava. */
export function stepGhost(world, g, inp, dt, floorY) {
  const tx = clamp(inp.x, -1, 1) * 4.5;
  const ty = clamp(inp.my, -1, 1) * 4.5 + 0.5;
  g.vx = approach(g.vx, tx, 14 * dt);
  g.vy = approach(g.vy, ty, 14 * dt);
  g.x = clamp(g.x + g.vx * dt, 0.4, world.w - 0.4);
  g.y = clamp(g.y + g.vy * dt, Math.max(floorY + 0.6, -2), world.goalY + 4);
  if (g.vx > 0.2) g.face = 1;
  else if (g.vx < -0.2) g.face = -1;
}

/** The highest piece top under (x, y) within `tol` of y that a character at x would stand on (-1 if none). */
export function standingOn(world, x, y, t, tol = 0.15) {
  let best = -1;
  let bestY = -Infinity;
  const ys = world.ys;
  for (let k = lowerBound(ys, y - tol); k < ys.length; k++) {
    const py = ys[k];
    if (py > y + tol) break;
    const i = world.order[k];
    if (!isSolid(world, i, t)) continue;
    const p = world.platforms[i];
    if (Math.abs(x - platformX(p, t)) > p.w * 0.5 + PHYS.landHalf) continue;
    if (py >= bestY) {
      bestY = py;
      best = i;
    }
  }
  return best;
}
