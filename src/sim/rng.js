// Seeded random numbers kept as plain state (a single 32-bit integer), so a night
// is reproducible from its seed and the state can be copied, saved and adopted
// by a new host without losing the stream.

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 13;
    h = Math.imul(h, 2246822519) >>> 0;
  }
  return (h || 1) >>> 0;
}

/** Advances rng (an object with `s`) and returns a float in [0, 1). */
export function rnd(rng) {
  let t = (rng.s = (rng.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(rng, lo, hi) {
  return lo + (hi - lo) * rnd(rng);
}

export function int(rng, lo, hi) {
  return lo + Math.floor(rnd(rng) * (hi - lo + 1));
}

export function pick(rng, list) {
  return list[Math.floor(rnd(rng) * list.length)];
}

/** Weighted pick from [{ w, ... }] entries; returns the entry. */
export function weighted(rng, list, weightOf = (e) => e.w) {
  let total = 0;
  for (const e of list) total += Math.max(0, weightOf(e) || 0);
  if (total <= 0) return list[0];
  let x = rnd(rng) * total;
  for (const e of list) {
    x -= Math.max(0, weightOf(e) || 0);
    if (x < 0) return e;
  }
  return list[list.length - 1];
}

export function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic value noise in 1D (for drift and current wobble); t in seconds. */
export function noise1(seed, t) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hashSeed(seed, i) / 4294967296;
  const b = hashSeed(seed, i + 1) / 4294967296;
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}
