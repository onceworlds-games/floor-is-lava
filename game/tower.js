// The tower: furniture stacked into a climbable shaft, generated from a seed (the same on every page).
// Pure: no browser. A tower is { w, goalY, goal, lobby, platforms: [{ i, kind, f, x, y, w, c, row, amp?, period?, phase? }] }:
//   x is the piece's centre, y the height of its top surface (what you stand on), w its width.
//   kind: 'floor' | 'static' | 'bounce' (trampoline) | 'crumble' (pillows) | 'move' (rolling chair) | 'goal' (the balloon basket).
// Guarantee: from every piece there is a static piece above it within the jump arc (so nobody is ever stuck below a gap), and the
// static pieces alone form a path from the floor to the balloon. Bounce, crumble and move pieces are extras on top of that ladder.

import { PHYS, WORLD_W, TOWER_GOAL, LOBBY_CEIL, TAU, mulberry32, hash2, clamp, lerp } from './rules.js';

const apexOf = (v) => (v * v) / (2 * PHYS.gUp);

/** How far a character travels sideways (at top speed) in a jump that ends `r` units above where it began. 0 if it can't get that high. */
export function airDist(r, v = PHYS.jumpV) {
  const apex = apexOf(v);
  if (r > apex) return 0;
  const up = v / PHYS.gUp;
  const down = Math.sqrt(Math.max(0, (2 * (apex - r)) / PHYS.gDown));
  return PHYS.maxSpeed * (up + down);
}

/** The widest edge-to-edge gap the generator's checks accept for a rise of `r` (a safe 80% of what the physics allows). */
export const hardGap = (r, v) => 0.8 * airDist(r, v) + 0.3;

export const launchV = (p) => (p.kind === 'bounce' ? PHYS.bounceV : PHYS.jumpV);
export const maxRiseOf = (p) => apexOf(launchV(p)) * 0.92;

/** The x of `a` nearest to `b` (a rolling chair can be waited for at either end of its track). */
function nearestX(a, b) {
  return a.kind === 'move' ? clamp(b.x, a.x - a.amp, a.x + a.amp) : a.x;
}

export function edgeGap(a, b) {
  return Math.abs(b.x - nearestX(a, b)) - (a.w + b.w) / 2;
}

/** Can a character on `a` jump to the top of `b` (a static or special piece at its home position)? Conservative. */
export function canJump(a, b) {
  const r = b.y - a.y;
  if (r > maxRiseOf(a)) return false;
  return edgeGap(a, b) <= hardGap(r, launchV(a));
}

/** The same, for a target that moves: its nearest end counts. */
export function canJumpLoose(a, b) {
  const r = b.y - a.y;
  if (r > maxRiseOf(a)) return false;
  const bx = b.kind === 'move' ? clamp(a.x, b.x - b.amp, b.x + b.amp) : b.x;
  const gap = Math.abs(bx - nearestX(a, { x: bx })) - (a.w + b.w) / 2;
  return gap <= hardGap(r, launchV(a));
}

// ------------------------------------------------------------------ furniture
const STATIC_FUR = [
  // f, [minW, maxW], weights in the [low, middle, high] zones
  { f: 'couch', w: [2.8, 3.8], z: [3, 1, 0] },
  { f: 'armchair', w: [1.9, 2.5], z: [2, 2, 1] },
  { f: 'table', w: [2.0, 2.9], z: [2, 2, 1] },
  { f: 'shelf', w: [2.4, 3.4], z: [1, 3, 2] },
  { f: 'toybox', w: [1.5, 2.1], z: [1, 2, 2] },
  { f: 'fridge', w: [1.4, 1.7], z: [0, 1, 2] },
  { f: 'lamp', w: [1.0, 1.3], z: [0, 1, 3] },
];
const MIN_W = { couch: 2.2, armchair: 1.7, table: 1.7, shelf: 1.9, toybox: 1.3, fridge: 1.3, lamp: 1.0 };

export const FURNITURE_NAMES = ['floor', ...STATIC_FUR.map((s) => s.f), 'trampoline', 'pillows', 'chair', 'basket'];

const GOAL_RISE = 1.8;
const GOAL_W = 3.4;
const MAX_DESIGN_RISE = 2.08;

function designOK(a, b, prog) {
  const v = launchV(a);
  const r = b.y - a.y;
  if (r > (v === PHYS.jumpV ? MAX_DESIGN_RISE : maxRiseOf(a))) return false;
  return edgeGap(a, b) <= hardGap(r, v) * lerp(0.3, 0.85, prog);
}

function extent(p) {
  return (p.w + (p.kind === 'move' ? p.amp * 2 : 0)) / 2;
}

function overlapsRow(row, piece, gap) {
  for (const q of row) if (Math.abs(q.x - piece.x) < extent(q) + extent(piece) + gap) return true;
  return false;
}

function buildRows(seed, W, lobby, goal = TOWER_GOAL) {
  const rng = mulberry32(seed);
  const rnd = (a, b) => a + (b - a) * rng();
  const pickWeighted = (items, wf) => {
    let total = 0;
    for (const it of items) total += wf(it);
    let x = rng() * total;
    for (const it of items) {
      x -= wf(it);
      if (x < 0) return it;
    }
    return items[items.length - 1];
  };

  const topY = lobby ? 11.2 : goal - GOAL_RISE;
  const N = rowCount(lobby, goal);
  const raw = [];
  for (let k = 0; k < N; k++) raw.push(lerp(1.5, 1.8, (k + 0.5) / N) * (1 + rnd(-0.06, 0.06)));
  const scale = topY / raw.reduce((s, v) => s + v, 0);
  const rowY = [];
  let acc = 0;
  for (let k = 0; k < N; k++) {
    acc += raw[k] * scale;
    rowY.push(acc);
  }
  rowY[N - 1] = topY;

  const floor = { kind: 'floor', f: 'floor', x: W / 2, y: 0, w: W + 4, c: 0, row: -1 };
  const platforms = [floor];
  let prevAll = [floor]; // every piece of the previous row (static first)
  let prevStatic = [floor];

  const WIDE = ['table', 'shelf', 'couch'].map((f) => STATIC_FUR.find((s) => s.f === f));
  const makeStatic = (fur, prog, y, last = false) => {
    if (last) fur = WIDE[Math.floor(rng() * WIDE.length)]; // the top row is a wide, easy landing under the balloon
    const base = rnd(fur.w[0], fur.w[1]);
    const w = clamp(base * lerp(1, 0.7, last ? 0.3 : prog), last ? 2.6 : MIN_W[fur.f], 4.4);
    return { kind: 'static', f: fur.f, x: 0, y, w: Math.round(w * 20) / 20, c: Math.floor(rng() * 4) };
  };

  for (let k = 0; k < N; k++) {
    const last = k === N - 1;
    const prog = rowY[k] / topY;
    const zone = prog < 0.3 ? 0 : prog < 0.65 ? 1 : 2;
    const ny = rowY[k];
    const row = [];
    const funnel = last ? 1 : clamp((prog - 0.86) / 0.14, 0, 1) * 0.65;

    const place = (piece, anchors, tries) => {
      for (let a = 0; a < tries; a++) {
        const anchor = anchors[Math.floor(rng() * anchors.length)];
        const mode = rng();
        let x;
        if (mode < 0.4) x = anchor.x + (rng() * 2 - 1) * (anchor.w / 2);
        else {
          const dir = rng() < 0.5 ? -1 : 1;
          const edge = rnd(0.2, Math.max(0.35, hardGap(1.7, PHYS.jumpV) * lerp(0.3, 0.85, prog)));
          x = anchor.x + dir * (anchor.w / 2 + edge + piece.w / 2);
        }
        if (funnel > 0) x = lerp(x, W / 2, funnel);
        const half = extent(piece);
        x = clamp(x, half + 0.2, W - half - 0.2);
        const cand = { ...piece, x: Math.round(x * 20) / 20, y: Math.round((ny + rnd(-0.06, 0.06)) * 100) / 100, row: k };
        if (!designOK(anchor, cand, prog)) continue;
        if (overlapsRow(row, cand, 0.6)) continue;
        row.push(cand);
        return true;
      }
      return false;
    };

    if (k === 0) {
      const xs = [W * 0.17, W * 0.5, W * 0.83];
      const names = ['couch', 'armchair', 'table'];
      for (let j = 0; j < 3; j++) {
        const wanted = names[Math.floor(rng() * 3)];
        const fur = STATIC_FUR.find((s) => s.f === wanted);
        const piece = makeStatic(fur, 0, Math.round((ny + rnd(-0.05, 0.05)) * 100) / 100);
        piece.w = clamp(piece.w * 0.9, 2.4, 3.3);
        piece.x = clamp(Math.round((xs[j] + rnd(-0.3, 0.3)) * 20) / 20, piece.w / 2 + 0.2, W - piece.w / 2 - 0.2);
        piece.row = 0;
        row.push(piece);
      }
    } else {
      const roll = rng();
      const count = last ? 1 : zone === 0 ? (roll < 0.7 ? 2 : 3) : zone === 1 ? (roll < 0.65 ? 2 : roll < 0.85 ? 3 : 1) : roll < 0.55 ? 2 : 1;
      for (let j = 0; j < count; j++) {
        const fur = pickWeighted(STATIC_FUR, (s) => s.z[zone] + 0.001);
        place(makeStatic(fur, prog, ny, last), prevStatic, 18);
      }
      // every piece below needs a static piece above it in reach: add one directly over any that has none
      for (const p of prevAll) {
        if (row.some((q) => designOK(p, q, prog))) continue;
        let done = false;
        for (let t = 0; t < 24 && !done; t++) {
          const fur = pickWeighted(STATIC_FUR, (s) => s.z[zone] + 0.001);
          const piece = makeStatic(fur, prog, ny, last);
          const half = extent(piece);
          let x = nearestX(p, { x: p.x }) + (t === 0 ? 0 : (rng() * 2 - 1) * (p.w / 2 + 0.8));
          if (funnel > 0) x = lerp(x, W / 2, funnel * 0.5);
          x = clamp(x, half + 0.2, W - half - 0.2);
          const cand = { ...piece, x: Math.round(x * 20) / 20, y: Math.round((ny + rnd(-0.06, 0.06)) * 100) / 100, row: k };
          if (!designOK(p, cand, prog) || overlapsRow(row, cand, 0.6)) continue;
          row.push(cand);
          done = true;
        }
        if (!done) return null;
      }
    }

    // extras on top of the ladder: trampolines, pillows, rolling chairs (more of them, and more special, higher up)
    if (!last && k >= 3 && rng() < 0.25 + 0.35 * prog) {
      const kind = pickWeighted(['bounce', 'crumble', 'move'], (s) => (s === 'bounce' ? 4 : s === 'crumble' ? 2 + 3 * prog : 2 + 4 * prog));
      const piece =
        kind === 'bounce'
          ? { kind, f: 'trampoline', w: Math.round(rnd(2.2, 3.0) * 20) / 20, c: Math.floor(rng() * 3) }
          : kind === 'crumble'
            ? { kind, f: 'pillows', w: Math.round(rnd(1.8, 2.4) * 20) / 20, c: Math.floor(rng() * 4) }
            : { kind, f: 'chair', w: Math.round(rnd(1.6, 2.0) * 20) / 20, c: Math.floor(rng() * 4), amp: Math.round(rnd(1.2, 2.0) * 20) / 20, period: Math.round(rnd(3.6, 5.2) * 10) / 10, phase: Math.round(rng() * TAU * 100) / 100 };
      place({ ...piece, y: ny }, prevStatic, 16);
    }

    platforms.push(...row);
    prevAll = row;
    prevStatic = row.filter((p) => p.kind === 'static');
    if (prevStatic.length === 0) return null;
  }

  if (!lobby) platforms.push({ kind: 'goal', f: 'basket', x: W / 2, y: goal, w: GOAL_W, c: 0, row: N });
  return platforms;
}

function rowCount(lobby, goal) {
  if (lobby) return 7;
  return goal === TOWER_GOAL ? 52 : Math.max(4, Math.round((goal - GOAL_RISE) / 1.65));
}

function buildLadder(W, lobby, goal = TOWER_GOAL) {
  const N = rowCount(lobby, goal);
  const topY = lobby ? 11.2 : goal - GOAL_RISE;
  const platforms = [{ kind: 'floor', f: 'floor', x: W / 2, y: 0, w: W + 4, c: 0, row: -1 }];
  const fur = ['couch', 'table', 'shelf'];
  for (let k = 0; k < N; k++) {
    const y = Math.round(((k + 1) * topY * 100) / N) / 100;
    const last = k === N - 1;
    for (const x of last ? [W / 2] : [2.4, W / 2, W - 2.4]) platforms.push({ kind: 'static', f: fur[(k + (x > W / 2 ? 1 : 0)) % 3], x, y, w: 3.4, c: k % 4, row: k });
  }
  if (!lobby) platforms.push({ kind: 'goal', f: 'basket', x: W / 2, y: goal, w: GOAL_W, c: 0, row: N });
  return platforms;
}

/** Problems with a tower (an empty list: it's valid). */
export function validateTower(t) {
  const errs = [];
  const P = t.platforms;
  const top = Math.max(...P.map((p) => p.row));
  P.forEach((p, i) => {
    if (!(p.w > 0) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) errs.push(`piece ${i} has bad numbers`);
    if (p.kind !== 'floor' && (p.x - extent(p) < -0.001 || p.x + extent(p) > t.w + 0.001)) errs.push(`piece ${i} (${p.f}) leaves the shaft`);
    if (p.kind !== 'floor' && p.y <= 0) errs.push(`piece ${i} is at the floor`);
  });
  const isStatic = (p) => p.kind === 'static';
  P.forEach((p, i) => {
    if (p.kind === 'goal') return;
    if (t.lobby && p.row === top) return;
    const ok = P.some((q) => (isStatic(q) || q.kind === 'goal') && q.y > p.y + 0.5 && canJump(p, q));
    if (!ok) errs.push(`piece ${i} (${p.f} at ${p.y}) has nothing above it in reach`);
  });
  // the static pieces alone reach the goal (or, in the lobby, the top row)
  const target = (p) => (t.lobby ? p.row === top : p.kind === 'goal');
  const seen = new Set([0]);
  const queue = [0];
  let reached = false;
  while (queue.length) {
    const a = P[queue.shift()];
    if (target(a)) {
      reached = true;
      break;
    }
    P.forEach((b, j) => {
      if (seen.has(j) || !(isStatic(b) || b.kind === 'goal') || b.y <= a.y) return;
      if (canJump(a, b)) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  if (!reached) errs.push('the static pieces do not reach the top');
  return errs;
}

/**
 * The tower for a seed. `opts`: { lobby } (just the bottom, under a ceiling, no balloon), { width, height } (a wider or shorter shaft: posters).
 * The result is always valid (a plain ladder if a seed's tower can't be made to pass).
 */
export function generateTower(seed, opts = {}) {
  const lobby = Boolean(opts.lobby);
  const W = opts.width ?? WORLD_W;
  const goal = opts.height ?? TOWER_GOAL;
  let platforms = null;
  for (let attempt = 0; attempt < 40 && !platforms; attempt++) {
    const rows = buildRows(hash2(Number(seed) >>> 0, attempt + 1), W, lobby, goal);
    if (!rows) continue;
    const t = finish(rows, W, lobby);
    if (validateTower(t).length === 0) platforms = rows;
  }
  if (!platforms) platforms = buildLadder(W, lobby, goal);
  return finish(platforms, W, lobby);
}

function finish(platforms, W, lobby) {
  platforms.forEach((p, i) => (p.i = i));
  const goal = platforms.findIndex((p) => p.kind === 'goal');
  return { w: W, lobby, goal, goalY: goal >= 0 ? platforms[goal].y : LOBBY_CEIL - 2, platforms };
}

/**
 * What the bots need: `rank[i]` is the fewest jumps from piece i to the balloon (the top row in the lobby), going only up the
 * static ladder; a higher rank is further away.
 */
export function analyze(t) {
  const P = t.platforms;
  const n = P.length;
  const rank = new Array(n).fill(1e9);
  const byHeight = P.map((_, i) => i).sort((a, b) => P[b].y - P[a].y || b - a);
  const top = Math.max(...P.map((p) => p.row));
  for (const i of byHeight) {
    const p = P[i];
    if (p.kind === 'goal' || (t.goal < 0 && p.row === top)) {
      rank[i] = 0;
      continue;
    }
    let best = 1e9;
    for (let j = 0; j < n; j++) {
      const q = P[j];
      // ranks follow the static ladder (the guaranteed way up); a trampoline's rank is what it can throw you onto
      if ((q.kind === 'static' || q.kind === 'goal') && q.y > p.y + 0.3 && rank[j] < best && canJumpLoose(p, q)) best = rank[j];
    }
    if (best < 1e9) rank[i] = best + 1;
  }
  return { rank };
}
