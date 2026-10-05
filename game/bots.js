// The bots: they climb the tower with the same movement code as the players. Pure: no browser.
// A bot plans by looking ahead: it simulates a jump with the real physics (stepBody) toward each piece above it and jumps when
// the simulation lands somewhere closer to the balloon. Skill is made of slow reactions, a slightly wrong steer, a few clumsy hops,
// a pause on shaky pieces and a late start, so the best bots nearly always make it and the weak ones get caught.

import { PHYS, T, mulberry32, hash2, hashStr, clamp } from './rules.js';
import { makeBody, copyBody, stepBody, stepGhost, reachedGoal, platformX, standingOn, EV_BOUNCE } from './sim.js';
import { maxRiseOf } from './tower.js';

const DT = PHYS.dt;

/**
 * Skill classes. react: steps between decisions. miss: chance per jump of a clumsy hop. execNoise: steering error. hes: steps of pause
 * on shaky pieces. idle: chance of a pause on a piece (up to idleMax steps). panic: how close the lava gets before the bot hurries.
 * startDelay: seconds before the first move.
 */
export const SKILLS = {
  ace: { react: 2, miss: 0, execNoise: 0, hes: 0, idle: 0, idleMax: 0, panic: 3, startDelay: 0 },
  sharp: { react: 8, miss: 0.04, execNoise: 0.12, hes: 10, idle: 0.3, idleMax: 50, panic: 3, startDelay: 0.4 },
  avg: { react: 14, miss: 0.08, execNoise: 0.3, hes: 18, idle: 0.9, idleMax: 125, panic: 1.0, startDelay: 1.0 },
  weak: { react: 24, miss: 0.12, execNoise: 0.45, hes: 28, idle: 0.9, idleMax: 165, panic: 0.8, startDelay: 1.6 },
};

/** A skill for one bot, from its seed: a mix of sharp, average and weak, each a little different. */
export function skillFor(rng) {
  const r = rng();
  const base = r < 0.25 ? SKILLS.sharp : r < 0.8 ? SKILLS.avg : SKILLS.weak;
  const j = () => 0.8 + rng() * 0.4;
  return {
    react: Math.max(2, Math.round(base.react * j())),
    miss: base.miss * j(),
    execNoise: base.execNoise * j(),
    hes: Math.round(base.hes * j()),
    idle: Math.min(0.9, base.idle * j()),
    idleMax: Math.round(base.idleMax * j()),
    panic: base.panic * j(),
    startDelay: base.startDelay * j(),
  };
}

export function makeBrain(seed, sk) {
  const rng = mulberry32(seed);
  return {
    rng,
    sk,
    tick: 0,
    startAt: Math.min(150, Math.round(sk.startDelay * 60 * (0.5 + rng()))), // everybody is off the floor before it melts
    lastGi: -2,
    rankA: 1e9,
    mode: 'run',
    retreats: 0,
    candIdx: 0,
    nextDecide: 0,
    cands: [],
    plan: null,
    bias: 0,
    hold: 999,
    hesUntil: 0,
    idleUntil: 0,
    bounces: 0, // trampoline bounces since it last stood on something: one is a shortcut, a second would be a loop
  };
}

// ------------------------------------------------------------------ look-ahead
const scratch = makeBody(0, 0);
const SIM = { x: 0, down: false, jump: true, tap: false };
const LOOK_STEPS = 105;

function steerTo(b, xl) {
  return clamp((xl - b.x) * 3 - b.vx * 0.25, -1, 1);
}

/** Where a jump from `b` (pressing jump now if `tap`) lands, steering toward `xl`: a piece index, or -1. Changes nothing. */
function evalPolicy(world, b, xl, t, tap) {
  copyBody(scratch, b);
  for (let k = 0; k < LOOK_STEPS; k++) {
    SIM.x = steerTo(scratch, xl);
    SIM.tap = tap && k === 0;
    SIM.jump = true;
    stepBody(world, scratch, SIM, DT, t + k * DT, false);
    if (scratch.on) return scratch.gi;
    if (scratch.y < b.y - 8) return -1;
  }
  return -1;
}

/** The point on top of `q` a jump from x aims for: the nearest to x, a step in from the edge. */
function landX(q, fromX, t) {
  const qx = platformX(q, t + 0.45);
  const half = Math.max(0.1, q.w / 2 - 0.3);
  return clamp(fromX, qx - half, qx + half);
}

function candidates(world, an, A, t, out) {
  const P = world.platforms;
  const pa = P[A];
  const ax = platformX(pa, t);
  const reach = maxRiseOf(pa) + 0.2;
  const list = [];
  for (let i = 0; i < P.length; i++) {
    if (an.rank[i] >= an.rank[A]) continue;
    const q = P[i];
    const dy = q.y - pa.y;
    if (dy < 0.3 || dy > reach) continue;
    const gap = Math.abs(platformX(q, t + 0.3) - ax) - (pa.w + q.w) / 2;
    if (gap > 6) continue;
    list.push({ i, key: an.rank[i] * 100 + Math.max(0, gap) });
  }
  list.sort((a, b) => a.key - b.key);
  out.length = 0;
  for (let k = 0; k < list.length && k < 6; k++) out.push(list[k].i);
}

// ------------------------------------------------------------------ the brain's input for one step
export function brainInput(world, an, b, br, t, L, out) {
  out.x = 0;
  out.down = false;
  out.jump = false;
  out.tap = false;
  br.tick++;
  if (br.tick < br.startAt) return out;
  const danger = L > b.y - br.sk.panic;
  const react = danger ? Math.min(br.sk.react, 4) : br.sk.react;
  return b.on ? onGround(world, an, b, br, t, danger, react, out) : inAir(world, an, b, br, t, danger, react, out);
}

function jumpNow(br, b, xl, q, danger, out) {
  br.plan = { xl, q };
  br.bias = (br.rng() * 2 - 1) * br.sk.execNoise * 2;
  br.hold = br.rng() < br.sk.miss * (danger ? 1.5 : 1) ? 5 : 999; // a clumsy hop lets go of jump early (panic makes it likelier)
  out.tap = true;
  out.jump = true;
  out.x = clamp(steerTo(b, xl) + br.bias, -1, 1);
  return out;
}

function onGround(world, an, b, br, t, danger, react, out) {
  const P = world.platforms;
  const A = b.gi;
  const pa = P[A];
  if (A !== br.lastGi) {
    br.lastGi = A;
    br.rankA = an.rank[A];
    br.plan = null;
    br.mode = 'run';
    br.retreats = 0;
    br.candIdx = 0;
    br.nextDecide = br.tick;
    const shaky = pa.kind === 'crumble' || pa.kind === 'move';
    const floor = pa.kind === 'floor';
    br.hesUntil = shaky && !danger ? br.tick + Math.round(br.sk.hes * br.rng()) : br.tick;
    // a pause to look around (never in the first rows, never with the lava at their heels)
    const want = 8 + Math.round(br.rng() * br.sk.idleMax);
    br.idleUntil = !danger && !floor && b.y > 6 && br.rng() < br.sk.idle ? br.tick + want : br.tick;
  }
  if (br.tick < br.hesUntil || br.tick < br.idleUntil) return out;

  const ax = platformX(pa, t);
  const decide = br.tick >= br.nextDecide;
  if (decide) {
    br.nextDecide = br.tick + react;
    candidates(world, an, A, t, br.cands);
  }
  const cands = br.cands;
  if (cands.length === 0) {
    // nothing above in reach from here (should not happen): drift to the middle and hop about
    out.x = clamp((world.w / 2 - b.x) * 0.5, -1, 1);
    if (decide && br.rng() < 0.3) out.tap = out.jump = true;
    return out;
  }

  // where this bot would take off for its current target
  const q0 = P[cands[br.candIdx % cands.length]];
  const qx0 = platformX(q0, t + 0.3);
  const overlap = Math.abs(qx0 - ax) < (pa.w + q0.w) / 2 - 0.2;
  const d = overlap ? 0 : Math.sign(qx0 - ax);
  const xs = ax + d * (pa.w / 2 + 0.08);
  const atEdge = d !== 0 && (d > 0 ? b.x >= xs - 0.04 : b.x <= xs + 0.04);

  if (br.mode === 'retreat') {
    // back off to the far end of the piece for a longer run-up
    const xr = ax - d * (pa.w / 2 - 0.2);
    if (Math.abs(b.x - xr) < 0.15) br.mode = 'run';
    else {
      out.x = Math.sign(xr - b.x);
      return out;
    }
  }

  if (decide || atEdge || d === 0) {
    for (let k = 0; k < cands.length; k++) {
      const qi = cands[(br.candIdx + k) % cands.length];
      const xl = landX(P[qi], b.x, t);
      const land = evalPolicy(world, b, xl, t, true);
      if (land >= 0 && an.rank[land] < br.rankA) return jumpNow(br, b, xl, qi, danger, out);
    }
    // a clumsy bot sometimes jumps too early
    if (decide && !atEdge && d !== 0 && br.rng() < br.sk.miss * 0.5) return jumpNow(br, b, landX(q0, b.x, t), q0.i, danger, out);
    if (atEdge || d === 0) {
      if (d !== 0 && br.retreats < 2 && pa.w > 1.5 && !danger) {
        br.retreats++;
        br.mode = 'retreat';
        return out;
      }
      if (br.cands.length > 1 && br.candIdx < br.cands.length - 1) {
        br.candIdx++;
        br.retreats = 0;
        return out;
      }
      // no way to make it that the look-ahead can see: try anyway
      return jumpNow(br, b, landX(q0, b.x, t), q0.i, danger, out);
    }
  }
  out.x = d === 0 ? 0 : Math.sign(xs - b.x);
  if (Math.abs(xs - b.x) < 0.04) out.x = 0;
  return out;
}

function inAir(world, an, b, br, t, danger, react, out) {
  const P = world.platforms;
  let plan = br.plan;
  if (br.tick >= br.nextDecide) {
    br.nextDecide = br.tick + Math.max(2, react >> 1);
    if (plan) {
      // the same aim as when it was chosen (a rolling chair's moves with it)
      const xl = P[plan.q].kind === 'move' ? landX(P[plan.q], b.x, t) : plan.xl;
      const land = evalPolicy(world, b, xl, t, false);
      if (land >= 0 && an.rank[land] < br.rankA && !(br.bounces > 0 && P[plan.q].kind === 'bounce')) plan = br.plan = { xl, q: plan.q };
      else plan = br.plan = null;
    }
    if (!plan) plan = br.plan = chooseAirTarget(world, an, b, br, t);
  }
  out.x = plan ? clamp(steerTo(b, plan.xl) + br.bias, -1, 1) : 0;
  out.jump = br.hold > 0 && b.vy > 0;
  br.hold--;
  return out;
}

function chooseAirTarget(world, an, b, br, t) {
  const P = world.platforms;
  const progress = [];
  const below = [];
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    const dx = Math.abs(platformX(q, t + 0.4) - b.x) - q.w / 2;
    if (dx > 6 || (q.kind === 'bounce' && br.bounces > 0)) continue;
    if (an.rank[i] < br.rankA && q.y > b.y - 1 && q.y < b.y + 5.2) progress.push({ i, key: an.rank[i] * 100 + Math.max(0, dx) });
    else if (q.kind !== 'bounce' && q.y < b.y - 0.2 && q.y > b.y - 9 && dx < 5) below.push({ i, key: -q.y * 10 + Math.max(0, dx) });
  }
  progress.sort((a, c) => a.key - c.key);
  for (let k = 0; k < progress.length && k < 6; k++) {
    const q = P[progress[k].i];
    const xl = landX(q, b.x, t);
    const land = evalPolicy(world, b, xl, t, false);
    if (land >= 0 && an.rank[land] < br.rankA) return { xl, q: progress[k].i };
  }
  // no better piece in reach: land on the highest one under us
  below.sort((a, c) => a.key - c.key);
  for (let k = 0; k < below.length && k < 6; k++) {
    const q = P[below[k].i];
    const xl = landX(q, b.x, t);
    const land = evalPolicy(world, b, xl, t, false);
    if (land >= 0) return { xl, q: below[k].i };
  }
  return null;
}

// ------------------------------------------------------------------ the host's bots
const BOT_INPUT = { x: 0, down: false, jump: false, tap: false };
const GHOST_INPUT = { x: 0, my: 0.15 };

export class BotRunner {
  /** `bots`: [{ id, x (spawn), skill (a SKILLS entry or skillFor result), seed }] */
  constructor(world, an, bots) {
    this.world = world;
    this.an = an;
    this.events = [];
    this.bots = bots.map((s) => ({
      id: s.id,
      body: makeBody(s.x, 0),
      brain: makeBrain(s.seed, s.skill),
      st: 0, // 0 climbing, 1 safe, 2 out
      hot: 0,
      phase: (hash2(s.seed, 5) % 628) / 100,
    }));
  }

  /** One fixed step at round time `t` (seconds); `L` is the lava's height. Returns this step's events: { id, kind: 'safe' | 'out', h }. */
  step(t, dt, L) {
    const world = this.world;
    this.events.length = 0;
    for (const bot of this.bots) {
      const b = bot.body;
      if (!Number.isFinite(b.x + b.y + b.vx + b.vy)) {
        bot.body = makeBody(world.w / 2, 0);
        continue;
      }
      if (bot.st === 0) {
        brainInput(world, this.an, b, bot.brain, t, L, BOT_INPUT);
        stepBody(world, b, BOT_INPUT, dt, t, true);
        if (b.ev & EV_BOUNCE) bot.brain.bounces++;
        else if (b.on) bot.brain.bounces = 0;
        b.ev = 0;
        b.impact = 0;
        if (reachedGoal(world, b)) {
          bot.st = 1;
          b.vx = b.vy = 0;
          this.events.push({ id: bot.id, kind: 'safe', h: b.maxY });
        } else if (b.y < L) {
          bot.st = 2;
          bot.hot = T.hotS;
          b.vx = b.vy = 0;
          this.events.push({ id: bot.id, kind: 'out', h: b.maxY });
        }
      } else if (bot.st === 2) {
        if (bot.hot > 0) bot.hot -= dt;
        else {
          GHOST_INPUT.x = Math.sin(t * 0.8 + bot.phase) * 0.7;
          stepGhost(world, b, GHOST_INPUT, dt, L);
        }
      }
    }
    return this.events;
  }

  byId(id) {
    return this.bots.find((b) => b.id === id) ?? null;
  }

  /** The bots' state for the room: [x, y, vx, vy, on, status, facing] each. */
  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const r1 = (v) => Math.round(v * 10) / 10;
    return this.bots.map(({ body: b, st }) => [r2(b.x), r2(b.y), r1(b.vx), r1(b.vy), b.on ? 1 : 0, st, b.face > 0 ? 1 : 0]);
  }

  /** A new host carries on from the last snapshot (and from what the round record says about who is safe or out). */
  restore(p, t, statusOf) {
    this.bots.forEach((bot, i) => {
      const s = Array.isArray(p) ? p[i] : null;
      const b = bot.body;
      if (s && s.length >= 7 && s.every((v) => Number.isFinite(v))) {
        b.x = clamp(s[0], PHYS.halfW, this.world.w - PHYS.halfW);
        b.y = s[1];
        b.vx = s[2];
        b.vy = s[3];
        b.face = s[6] ? 1 : -1;
        b.on = s[4] ? 1 : 0;
        b.gi = b.on ? standingOn(this.world, b.x, b.y, t, 0.1) : -1;
        if (b.gi < 0) b.on = 0;
        if (b.y > b.maxY) b.maxY = b.y;
        bot.st = s[5] === 1 || s[5] === 2 ? s[5] : 0;
      }
      const forced = statusOf ? statusOf(bot.id) : -1;
      if (forced === 1 || forced === 2) bot.st = forced;
      else if (forced === 0) bot.st = 0;
      if (bot.st === 1 && this.world.goal >= 0 && !(s && s[5] === 1)) {
        // safe, but we don't know where it stood: in the basket
        const gp = this.world.platforms[this.world.goal];
        b.x = gp.x;
        b.y = gp.y;
        b.vx = b.vy = 0;
      }
      bot.hot = 0;
    });
  }
}

/** The bots a roster needs: where they spawn and how skilled each is. `matchSeed` makes it the same for every host. */
export function botSpecs(roster, matchSeed, spawnOf, skillOverride) {
  const specs = [];
  roster.forEach((r, i) => {
    if (!r.bot) return;
    const seed = hash2(Number(matchSeed) >>> 0, hashStr(r.id));
    specs.push({ id: r.id, x: spawnOf(i), seed, skill: skillOverride ?? skillFor(mulberry32(seed ^ 0x5bd1e995)) });
  });
  return specs;
}
