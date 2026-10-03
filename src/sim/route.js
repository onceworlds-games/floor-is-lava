// The channel: a safe line from the sea entrance to the harbour, with the reef a varying distance
// away on each side. Ships live on this line as (s, d): arc length and lateral offset.
// The sea disc is radius SEA_R around the tower at the origin (x east, z north).
import { hashSeed, noise1 } from './rng.js';
import { SITES } from './data/sites.js';

export const SEA_R = 420;
export const SAMPLE = 10; // metres between route samples

export function buildRoute(siteId) {
  const site = SITES[siteId] || SITES['skerry-rock'];
  const seed = hashSeed('route', site.id);
  const L = site.routeLength;
  const n = Math.floor(L / SAMPLE) + 1;
  const pts = [];
  // The line enters from the north, bows east of the tower and ends south-west at the harbour.
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const z = 330 - u * (330 + (L - 330) * 0.75);
    const bow = Math.sin(u * Math.PI) * site.routeOffset;
    const wobble = noise1(seed, u * 6) * 18;
    const x = 20 + bow + wobble - u * u * 160;
    pts.push({ x, z });
  }
  // Arc length, headings and reef half-widths.
  const route = { site: site.id, L: 0, pts: [], narrows: [] };
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    if (i > 0) s += Math.hypot(p.x - o.x, p.z - o.z);
    const heading = Math.atan2(q.x - o.x, q.z - o.z); // 0 = north, clockwise
    const u = i / (n - 1);
    // Two narrows: around 35% and 68% of the way; wide elsewhere.
    const pinch = Math.exp(-((u - 0.35) ** 2) / 0.004) + Math.exp(-((u - 0.68) ** 2) / 0.005);
    const w = site.reefMax - (site.reefMax - site.reefMin) * Math.min(1, pinch) + noise1(seed + 7, u * 9) * 3;
    const w2 = site.reefMax - (site.reefMax - site.reefMin) * Math.min(1, pinch) + noise1(seed + 11, u * 9) * 3;
    // Current side: which way the sea pushes here (+1 starboard, -1 port), changes along the route.
    const current = Math.sin(u * 7.3 + noise1(seed + 3, u * 2)) >= 0 ? 1 : -1;
    route.pts.push({ s, x: p.x, z: p.z, h: heading, reefL: Math.max(site.reefMin, w), reefR: Math.max(site.reefMin, w2), cur: current, narrow: pinch > 0.5 });
  }
  route.L = s;
  for (const p of route.pts) if (p.narrow && (!route.narrows.length || p.s - route.narrows[route.narrows.length - 1] > 60)) route.narrows.push(p.s);
  return route;
}

/** Interpolated route point at arc length s (clamped). */
export function routeAt(route, s) {
  const pts = route.pts;
  if (!(s > 0)) return pts[0];
  if (s >= route.L) return pts[pts.length - 1];
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  let dh = b.h - a.h;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return {
    s,
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    h: a.h + dh * t,
    reefL: a.reefL + (b.reefL - a.reefL) * t,
    reefR: a.reefR + (b.reefR - a.reefR) * t,
    cur: a.cur,
    narrow: a.narrow || b.narrow,
  };
}

/** World position of a ship at (s, d): d positive is starboard of the line (to the right, facing along it). */
export function shipPos(route, s, d) {
  const p = routeAt(route, s);
  // Heading h: 0 = north (+z), clockwise. Right-hand normal of the direction (sin h, cos h) is (cos h, -sin h).
  return { x: p.x + Math.cos(p.h) * d, z: p.z - Math.sin(p.h) * d, h: p.h };
}

/** Reef half-width on the side the offset points to. */
export function reefAt(route, s, d) {
  const p = routeAt(route, s);
  return d >= 0 ? p.reefR : p.reefL;
}

/** Nearest route parameter to a world point (coarse, for the chart and spawn placement). */
export function nearestS(route, x, z) {
  let best = 0;
  let bd = Infinity;
  for (const p of route.pts) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p.s;
    }
  }
  return best;
}

/** Points along the reef edge, for drawing rocks and for placing creatures. side +1/-1. */
export function reefPoints(route, side, step = 14) {
  const out = [];
  for (let s = 0; s <= route.L; s += step) {
    const p = routeAt(route, s);
    const w = side > 0 ? p.reefR : p.reefL;
    out.push({ s, x: p.x + Math.cos(p.h) * w * side, z: p.z - Math.sin(p.h) * w * side, w });
  }
  return out;
}
