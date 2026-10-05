// Juice: pooled particles, floating numbers, camera shake from decaying trauma, hit-stop, and the squash-and-stretch spring.
// Nothing here allocates per frame: the pools are made once.

import { mulberry32, clamp } from './rules.js';

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 0 -> 1 with an overshoot (a pop: 1.3 then back to 1). */
export const easeOutBack = (t) => {
  t = clamp(t, 0, 1);
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const DUST = 0;
const SPARK = 1;
const CONFETTI = 2;
const SMOKE = 3;
const BUBBLE = 4;
const RING = 5;
const FLAME = 6;

const CONFETTI_COLORS = ['#ff4d4d', '#ffd23f', '#3ddc84', '#2ea6ff', '#a259ff', '#ff7ac8', '#ffffff'];
const CAPS = [110, 220, 360];

export class Fx {
  constructor() {
    this.rnd = mulberry32(12345);
    this.pool = Array.from({ length: 380 }, () => ({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 1, color: '#fff', rot: 0, vr: 0 }));
    this.pops = Array.from({ length: 18 }, () => ({ on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 30, sx: 0, sy: 0, screen: false }));
    this.live = 0;
    this.quality = 2; // 0 low, 1 medium, 2 high
    this.reduced = false;
    this.trauma = 0;
    this.clock = 0;
    this.shakeX = 0; // px, set by update()
    this.shakeY = 0;
    this.freeze = 0; // seconds of hit-stop left
    this.flash = 0; // 0..1 white flash (never with reduced motion)
  }

  seed(n) {
    this.rnd = mulberry32(n);
  }

  clear() {
    for (const p of this.pool) p.on = false;
    for (const p of this.pops) p.on = false;
    this.live = 0;
    this.trauma = 0;
    this.freeze = 0;
    this.flash = 0;
  }

  /** How many of `n` particles to make at this quality and motion setting. */
  count(n) {
    const f = this.reduced ? 0.4 : [0.45, 0.75, 1][this.quality] ?? 1;
    return Math.max(1, Math.round(n * f));
  }

  spawn(kind, x, y, vx, vy, g, life, size, color, vr = 0) {
    if (this.live >= CAPS[this.quality]) return null;
    for (const p of this.pool) {
      if (p.on) continue;
      p.on = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.g = g;
      p.life = life;
      p.max = life;
      p.size = size;
      p.color = color;
      p.rot = this.rnd() * 6.28;
      p.vr = vr;
      this.live++;
      return p;
    }
    return null;
  }

  r(a, b) {
    return a + (b - a) * this.rnd();
  }

  /** A puff at the feet. `power` 1 is a footstep, 3 a hard landing. */
  dust(x, y, n = 3, power = 1, dir = 0) {
    n = this.count(n);
    for (let i = 0; i < n; i++) this.spawn(DUST, x + this.r(-0.2, 0.2), y + 0.05, this.r(-1.4, 1.4) * power - dir * 0.8, this.r(0.3, 1.2) * power, 0, this.r(0.28, 0.5), this.r(0.1, 0.18) * (0.8 + power * 0.3), '#fff6e0');
  }

  sparks(x, y, n, color = '#ffd23f', speed = 5) {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.283;
      const s = this.r(0.4, 1) * speed;
      this.spawn(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, -8, this.r(0.25, 0.5), this.r(0.08, 0.14), color);
    }
  }

  confetti(x, y, n = 40, spread = 6, up = 9) {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const c = CONFETTI_COLORS[Math.floor(this.rnd() * CONFETTI_COLORS.length)];
      this.spawn(CONFETTI, x + this.r(-0.3, 0.3), y, this.r(-spread, spread), this.r(up * 0.4, up), -7, this.r(1.2, 2.2), this.r(0.12, 0.2), c, this.r(-9, 9));
    }
  }

  smoke(x, y, n = 6) {
    n = this.count(n);
    for (let i = 0; i < n; i++) this.spawn(SMOKE, x + this.r(-0.3, 0.3), y + this.r(0, 0.5), this.r(-0.5, 0.5), this.r(1, 2.2), 0, this.r(0.6, 1.1), this.r(0.2, 0.34), '#5b5560');
  }

  flames(x, y, n = 6) {
    n = this.count(n);
    for (let i = 0; i < n; i++) this.spawn(FLAME, x + this.r(-0.3, 0.3), y + this.r(0, 0.6), this.r(-0.6, 0.6), this.r(1.5, 3), 0, this.r(0.3, 0.55), this.r(0.14, 0.24), this.rnd() < 0.5 ? '#ff8a1f' : '#ffd23f');
  }

  /** A lava bubble that rises from `y` and pops at `top`. */
  bubble(x, y, top) {
    const vy = this.r(0.9, 1.7);
    this.spawn(BUBBLE, x, y, 0, vy, 0, Math.max(0.2, (top - y) / vy), this.r(0.08, 0.2), '#ffb43b');
  }

  ring(x, y, size = 0.6, color = '#ffffff', life = 0.35) {
    this.spawn(RING, x, y, 0, 0, 0, life, size, color);
  }

  /** A floating number or word at a world position. */
  popup(x, y, text, color = '#fff', size = 34) {
    for (const p of this.pops) {
      if (p.on) continue;
      p.on = true;
      p.x = x;
      p.y = y;
      p.vy = 1.4;
      p.life = p.max = 1.1;
      p.text = text;
      p.color = color;
      p.size = size;
      p.screen = false;
      return p;
    }
    return null;
  }

  shake(amount) {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  hitstop(ms) {
    if (this.reduced) return;
    this.freeze = Math.max(this.freeze, ms / 1000);
  }

  doFlash(a = 0.6) {
    if (!this.reduced) this.flash = Math.max(this.flash, a);
  }

  update(dt, maxShakePx) {
    this.clock += dt;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        this.live--;
        if (p.kind === BUBBLE && this.quality > 0) this.ring(p.x, p.y, p.size * 1.1, '#ffd77a', 0.25); // it pops at the surface
        continue;
      }
      if (p.kind === BUBBLE) {
        p.y += p.vy * dt;
        p.x += Math.sin(this.clock * 4 + p.rot) * 0.15 * dt;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === DUST || p.kind === SMOKE) {
        p.vx *= 1 - 2.5 * dt;
        p.vy *= 1 - 1.5 * dt;
      } else if (p.kind === CONFETTI) {
        p.vx *= 1 - 0.8 * dt;
        if (p.vy < -3) p.vy = -3 + (p.vy + 3) * (1 - 4 * dt); // flutters down
        p.rot += p.vr * dt;
      }
    }
    for (const p of this.pops) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) p.on = false;
      else {
        p.y += p.vy * dt;
        p.vy *= 1 - 1.2 * dt;
      }
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    this.shakeX = s * maxShakePx * Math.sin(this.clock * 43 + 1.3);
    this.shakeY = s * maxShakePx * Math.sin(this.clock * 51 + 4.1);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.freeze > 0) this.freeze = Math.max(0, this.freeze - dt);
  }

  /** The world-space particles. `v` is the view (px, py, S, ol). */
  draw(ctx, v) {
    const S = v.S;
    for (const p of this.pool) {
      if (!p.on) continue;
      const x = v.px(p.x);
      const y = v.py(p.y);
      if (x < -40 || x > v.W + 40 || y < -40 || y > v.H + 40) continue;
      const a = clamp(p.life / p.max, 0, 1);
      switch (p.kind) {
        case DUST: {
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * S * (1.4 - a * 0.5), 0, 6.283);
          ctx.fill();
          break;
        }
        case SMOKE: {
          ctx.globalAlpha = a * 0.75;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * S * (2 - a), 0, 6.283);
          ctx.fill();
          break;
        }
        case FLAME: {
          ctx.globalAlpha = Math.min(1, a * 1.6);
          ctx.fillStyle = p.color;
          const r = p.size * S * (0.5 + a);
          ctx.beginPath();
          ctx.moveTo(x - r * 0.6, y);
          ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.4, x, y - r * 2.2);
          ctx.quadraticCurveTo(x + r * 0.3, y - r * 1.2, x + r * 0.6, y);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case SPARK: {
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(2, p.size * S * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * 0.04 * S * 0.4, y + p.vy * 0.04 * S * 0.4);
          ctx.stroke();
          break;
        }
        case CONFETTI: {
          ctx.globalAlpha = Math.min(1, a * 2.5);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          const w = p.size * S;
          ctx.fillRect(-w / 2, -w * 0.25 * Math.abs(Math.cos(p.rot * 1.7)) - 1, w, Math.max(2, w * 0.5 * Math.abs(Math.cos(p.rot * 1.7))));
          ctx.restore();
          break;
        }
        case BUBBLE: {
          ctx.globalAlpha = 0.95;
          ctx.strokeStyle = '#ffd77a';
          ctx.fillStyle = '#ff9a2a';
          ctx.lineWidth = Math.max(1.5, v.ol * 0.5);
          ctx.beginPath();
          ctx.arc(x, y, p.size * S, 0, 6.283);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case RING: {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(2, v.ol * (0.4 + a));
          ctx.beginPath();
          ctx.arc(x, y, p.size * S * (2 - a), 0, 6.283);
          ctx.stroke();
          break;
        }
        default:
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** The bits of a popup the UI draws (kept here with the pool). Returns the screen position and pop scale, or null. */
export function popupLook(p, v) {
  if (!p.on) return null;
  const age = 1 - p.life / p.max;
  const scale = age < 0.18 ? easeOutBack(age / 0.18) : 1;
  const alpha = clamp(p.life / 0.3, 0, 1);
  return { x: v.px(p.x), y: v.py(p.y), scale, alpha };
}

/**
 * One character's look from its state { x, y, vx, vy, o (on the ground) }: squash and stretch, dust, run cycle, and the sounds that go
 * with landing, jumping and bouncing. Works the same for you, bots and other players, so everyone's feet answer.
 * `vol` scales the sounds (others' are quieter); pass 0 for silence.
 */
export function makeVis() {
  return { sq: 0, sqv: 0, o: 1, vy: 0, run: 0, dustT: 0, hotT: -1, ghosted: false, pop: 0, seen: false, safeT: -1, ready: 0, readyT: -1 };
}

export function updateVis(vis, st, dt, fx, snd, vol) {
  const o = st.o ? 1 : 0;
  if (!vis.seen) {
    vis.seen = true;
    vis.o = o;
    vis.vy = st.vy;
    vis.pop = 0;
  }
  if (st.s === 0) {
    if (o && !vis.o && vis.vy < -3) {
      const power = clamp(-vis.vy / 10, 0.4, 1.8);
      vis.sq = -Math.min(0.4, 0.035 * -vis.vy);
      fx.dust(st.x, st.y, 4, power);
      if (vol > 0) snd.land(-vis.vy, vol);
    } else if (!o && vis.o && st.vy > 6) {
      vis.sq = 0.34;
      fx.dust(st.x, st.y, 2, 0.8);
      if (vol > 0) snd.jump(vol);
    } else if (!o && st.vy > 14 && vis.vy < 6 && vis.o === 0) {
      vis.sq = 0.5;
      fx.ring(st.x, st.y + 0.1, 0.5, '#ffffff', 0.3);
      fx.sparks(st.x, st.y + 0.1, 5, '#ffd23f', 4);
      if (vol > 0) snd.bounce(vol);
    }
    if (o && Math.abs(st.vx) > 3.5) {
      vis.dustT -= dt;
      if (vis.dustT <= 0) {
        vis.dustT = 0.16;
        fx.dust(st.x, st.y, 1, 0.6, Math.sign(st.vx));
      }
    }
    if (o) vis.run += Math.abs(st.vx) * dt * 1.7;
  }
  // a spring that settles back to normal
  vis.sqv += (-190 * vis.sq - 15 * vis.sqv) * dt;
  vis.sq += vis.sqv * dt;
  vis.sq = clamp(vis.sq, -0.5, 0.6);
  vis.o = o;
  vis.vy = st.vy;
  if (vis.pop < 1) vis.pop = Math.min(1, vis.pop + dt * 4);
}
