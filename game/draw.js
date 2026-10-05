// The renderer: the house wall, the furniture, the lava, the balloon, and the characters. Canvas 2D, flat colors, thick dark outlines,
// solid drop shadows. Everything is drawn in world units through a view (`v.px`, `v.py`, `v.S` pixels per unit); line widths are in
// pixels so outlines stay chunky at any zoom. Drawing never changes game state.

import { PLAYER_COLORS, LOBBY_CEIL, TAU, clamp, hash2 } from './rules.js';
import { platformX, crumbleState } from './sim.js';
import { easeOutBack } from './fx.js';

export const FONT = '"Bangers", "Impact", "Arial Black", sans-serif';
export const INK = '#2b1a2f';

// ------------------------------------------------------------------ views
export function makeView() {
  return {
    W: 800,
    H: 450,
    S: 30,
    camX: 7,
    camY: 0, // world y at the bottom of the screen
    shx: 0,
    shy: 0,
    ol: 3,
    px(x) {
      return (x - this.camX) * this.S + this.W * 0.5 + this.shx;
    },
    py(y) {
      return this.H - (y - this.camY) * this.S + this.shy;
    },
  };
}

/** Pixels per world unit: about 13 units of tower on screen, but the 14-wide shaft always fits. */
export function viewScale(W, H) {
  return Math.max(12, Math.min(H / 13, W / 15));
}

/** A view that puts world (0, 0) at screen (sx, sy) with `S` pixels per unit: for drawing characters on UI screens. */
export function screenView(sx, sy, S, ol = 3) {
  return {
    W: 99999,
    H: 99999,
    S,
    ol,
    shx: 0,
    shy: 0,
    px(x) {
      return sx + x * S;
    },
    py(y) {
      return sy - y * S;
    },
  };
}

// ------------------------------------------------------------------ small helpers
export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** White text with a thick dark outline. */
export function label(ctx, str, x, y, px, o = {}) {
  ctx.font = `${Math.max(8, Math.round(px))}px ${FONT}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = o.lw ?? Math.max(3, px * 0.17);
  ctx.strokeStyle = o.stroke ?? INK;
  ctx.fillStyle = o.fill ?? '#ffffff';
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.strokeText(str, x, y);
  ctx.fillText(str, x, y);
  if (o.alpha !== undefined) ctx.globalAlpha = 1;
}

/** A world-space rounded box (x0 < x1, y0 < y1, y up), filled with a thick outline. */
function wbox(ctx, v, x0, y0, x1, y1, fill, r = 0.1) {
  const sx0 = v.px(x0);
  const sy0 = v.py(y1);
  rr(ctx, sx0, sy0, v.px(x1) - sx0, v.py(y0) - sy0, r * v.S);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = v.ol;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function wpoly(ctx, v, pts, fill, stroke = true) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = v.px(pts[i]);
    const y = v.py(pts[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = v.ol;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function wcircle(ctx, v, x, y, r, fill, stroke = true) {
  ctx.beginPath();
  ctx.arc(v.px(x), v.py(y), Math.max(1, r * v.S), 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = v.ol;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function wline(ctx, v, x0, y0, x1, y1, color = INK, w = 0.6) {
  ctx.beginPath();
  ctx.moveTo(v.px(x0), v.py(y0));
  ctx.lineTo(v.px(x1), v.py(y1));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, v.ol * w);
  ctx.lineCap = 'round';
  ctx.stroke();
}

function star(ctx, v, x, y, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    pts.push(x + Math.cos(a) * rad, y - Math.sin(a) * rad);
  }
  wpoly(ctx, v, pts, fill);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const DARK = PLAYER_COLORS.map((c) => shade(c, 0.68));

const CLOTH = [
  ['#ef5a52', '#ff8f86', '#b13a34'],
  ['#3f93e0', '#79b8f5', '#2a69a6'],
  ['#74c24a', '#a4dc7c', '#4f8f2c'],
  ['#a56ad8', '#c796f0', '#7a47a8'],
];
const WOOD = ['#c68642', '#e2a863', '#8c5a2b'];
const BOOKS = ['#ef5a52', '#ffd23f', '#3f93e0', '#74c24a', '#a56ad8', '#ff9f43'];
const MAT = ['#ff4fa3', '#2ed1ff', '#ffb02e'];
const SKIN = ['#ffd9b3', '#f6c28b', '#e0a370', '#ffe8cc', '#c98e5d', '#fbd0c0'];

// ------------------------------------------------------------------ the house
const STORIES = [
  { a: '#ffe9b0', b: '#ffd88c', rail: '#9b6b45' },
  { a: '#c8f2dc', b: '#a9e8c7', rail: '#4f8a70' },
  { a: '#e6dcff', b: '#cfc0ff', rail: '#6a58a0' },
];

function band(ctx, v, y0, y1, color) {
  const top = v.py(Math.min(y1, v.camY + v.H / v.S + 2));
  const bot = v.py(Math.max(y0, v.camY - 2));
  if (bot <= top) return;
  ctx.fillStyle = color;
  ctx.fillRect(0, top, v.W, bot - top);
}

function decoration(ctx, v, kind, x, y, hue) {
  if (kind === 0) {
    // a window
    wbox(ctx, v, x - 0.95, y - 1.3, x + 0.95, y + 1.3, '#8c5a2b', 0.12);
    wbox(ctx, v, x - 0.75, y - 1.1, x + 0.75, y + 1.1, hue > 1 ? '#ffbf8f' : '#a6e0ff', 0.06);
    wline(ctx, v, x, y - 1.1, x, y + 1.1, '#8c5a2b', 0.7);
    wline(ctx, v, x - 0.75, y, x + 0.75, y, '#8c5a2b', 0.7);
    wcircle(ctx, v, x - 0.3, y + 0.55, 0.22, '#ffffff', false);
    wcircle(ctx, v, x - 0.05, y + 0.55, 0.28, '#ffffff', false);
  } else if (kind === 1) {
    // a picture frame with hills and a sun
    wbox(ctx, v, x - 0.9, y - 0.65, x + 0.9, y + 0.65, '#d9a52b', 0.1);
    wbox(ctx, v, x - 0.7, y - 0.45, x + 0.7, y + 0.45, '#9fe0ff', 0.04);
    wpoly(ctx, v, [x - 0.7, y - 0.45, x - 0.15, y + 0.15, x + 0.3, y - 0.45], '#5fbf5a', false);
    wpoly(ctx, v, [x - 0.1, y - 0.45, x + 0.35, y + 0.05, x + 0.7, y - 0.45], '#4aa84a', false);
    wcircle(ctx, v, x + 0.38, y + 0.25, 0.14, '#ffd23f', false);
  } else {
    // two small frames
    wbox(ctx, v, x - 1.2, y - 0.4, x - 0.2, y + 0.5, '#d9a52b', 0.08);
    wbox(ctx, v, x - 1.05, y - 0.25, x - 0.35, y + 0.35, '#ff9ec7', 0.03);
    wbox(ctx, v, x + 0.2, y - 0.55, x + 1.2, y + 0.35, '#d9a52b', 0.08);
    wbox(ctx, v, x + 0.35, y - 0.4, x + 1.05, y + 0.2, '#a6d8ff', 0.03);
  }
}

export function drawWall(ctx, v, world, now) {
  const W = world.w;
  const lobby = world.tower.lobby;
  const goalY = world.goalY;
  const roofY = lobby ? LOBBY_CEIL : goalY - 0.9;
  const topView = v.camY + v.H / v.S;
  // the curtains left and right of the shaft
  ctx.fillStyle = '#7d2438';
  ctx.fillRect(0, 0, v.W, v.H);
  const left = v.px(0);
  const right = v.px(W);
  ctx.fillStyle = '#9a3049';
  for (let k = -14; k < W + 14; k++) {
    if (k >= 0 && k < W) continue;
    const x = v.px(k + 0.1);
    ctx.fillRect(x, 0, v.S * 0.38, v.H);
  }
  // the shaft's wall, a story at a time
  const stories = lobby ? [{ y0: -50, y1: roofY, s: 0 }] : [{ y0: -50, y1: goalY * 0.34, s: 0 }, { y0: goalY * 0.34, y1: goalY * 0.67, s: 1 }, { y0: goalY * 0.67, y1: roofY, s: 2 }];
  for (const st of stories) {
    const y0 = Math.max(st.y0, v.camY - 1);
    const y1 = Math.min(st.y1, topView + 1);
    if (y1 <= y0) continue;
    const top = v.py(y1);
    const hgt = v.py(y0) - top;
    const col = STORIES[st.s];
    for (let i = 0; i < W; i++) {
      ctx.fillStyle = i % 2 ? col.b : col.a;
      ctx.fillRect(v.px(i), top, v.S + 1, hgt);
    }
    // pictures and windows
    const step = 6.4;
    const k0 = Math.floor((y0 - 3) / step);
    const k1 = Math.ceil((y1 - 3) / step);
    for (let k = k0; k <= k1; k++) {
      const y = k * step + 3.4;
      if (y < st.y0 + 1.6 || y > st.y1 - 1.6) continue;
      const h = hash2(k, 31 + st.s);
      const kind = h % 3;
      if (kind === 0) {
        decoration(ctx, v, 0, 2.3, y, st.s);
        decoration(ctx, v, 0, W - 2.3, y, st.s);
      } else if (kind === 1) decoration(ctx, v, 1, W / 2 + ((h >> 3) % 5) - 2, y + 0.3, st.s);
      else decoration(ctx, v, 2, W / 2 + ((h >> 5) % 5) - 2, y, st.s);
    }
    // a baseboard at the foot of each story
    if (st.s > 0 || lobby) {
      band(ctx, v, st.y0, st.y0 + 0.9, col.rail);
    }
  }
  // beams between stories
  if (!lobby) {
    for (const by of [goalY * 0.34, goalY * 0.67]) {
      band(ctx, v, by - 0.5, by, '#6b4026');
      band(ctx, v, by - 0.5, by - 0.38, INK);
    }
  }
  // the edges of the shaft
  ctx.lineWidth = v.ol * 1.6;
  ctx.strokeStyle = '#ffcf4a';
  ctx.beginPath();
  ctx.moveTo(left, 0);
  ctx.lineTo(left, v.H);
  ctx.moveTo(right, 0);
  ctx.lineTo(right, v.H);
  ctx.stroke();
  // the roof, and the sky above it
  if (topView > roofY - 0.2) {
    const roofTop = v.py(roofY + 0.7);
    ctx.fillStyle = '#8fdcff';
    ctx.fillRect(0, 0, v.W, roofTop);
    if (lobby) {
      ctx.fillStyle = '#3a2a3f';
      ctx.fillRect(0, 0, v.W, v.py(roofY + 0.7));
      band(ctx, v, roofY, roofY + 0.7, '#8b4a3a');
      band(ctx, v, roofY, roofY + 0.14, INK);
      band(ctx, v, roofY + 0.7, roofY + 0.84, INK);
    } else {
      // clouds
      const c0 = Math.floor(roofY / 3.7);
      for (let k = c0; k < c0 + 12; k++) {
        const h = hash2(k, 9);
        const x = -6 + (h % 2600) / 100;
        const y = roofY + 2 + (k - c0) * 3.1;
        const sx = v.px(x);
        const sy = v.py(y);
        if (sy < -80 || sy > v.H + 20) continue;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, v.S * 0.9, 0, TAU);
        ctx.arc(sx + v.S * 1.1, sy + v.S * 0.15, v.S * 0.7, 0, TAU);
        ctx.arc(sx - v.S * 1.0, sy + v.S * 0.2, v.S * 0.6, 0, TAU);
        ctx.fill();
      }
      // the roof's edge
      band(ctx, v, roofY, roofY + 0.7, '#8b4a3a');
      band(ctx, v, roofY + 0.56, roofY + 0.7, INK);
      band(ctx, v, roofY, roofY + 0.14, INK);
      ctx.fillStyle = '#a8603f';
      const ry = v.py(roofY + 0.56);
      for (let k = -14; k < W + 14; k++) ctx.fillRect(v.px(k) + 2, ry + 3, v.S - 4, Math.max(2, v.S * 0.1));
    }
  }
}

// ------------------------------------------------------------------ furniture
function couch(ctx, v, x, y, w, c, back) {
  const [m, l, d] = CLOTH[c];
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L + 0.1, y, R - 0.1, y + back, d, 0.28);
  wbox(ctx, v, L + 0.42, y + 0.08, R - 0.42, y + back - 0.12, m, 0.2);
  wbox(ctx, v, L + 0.15, y - 1.15, L + 0.4, y - 0.8, WOOD[2], 0.06);
  wbox(ctx, v, R - 0.4, y - 1.15, R - 0.15, y - 0.8, WOOD[2], 0.06);
  wbox(ctx, v, L, y - 0.95, R, y - 0.35, m, 0.14);
  wbox(ctx, v, L + 0.42, y - 0.42, R - 0.42, y, l, 0.16);
  wbox(ctx, v, L - 0.02, y - 0.95, L + 0.46, y, d, 0.18);
  wbox(ctx, v, R - 0.46, y - 0.95, R + 0.02, y, d, 0.18);
  if (w > 3.4) wline(ctx, v, x, y - 0.4, x, y - 0.03, INK, 0.5);
}

function shelf(ctx, v, x, y, w, c) {
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L, y - 1.5, L + 0.26, y, WOOD[2], 0.05);
  wbox(ctx, v, R - 0.26, y - 1.5, R, y, WOOD[2], 0.05);
  let bx = L + 0.3;
  let k = c;
  while (bx < R - 0.46) {
    const bw = 0.2 + ((k * 7 + 3) % 4) * 0.04;
    if (bx + bw > R - 0.28) break;
    const bh = 0.75 + ((k * 5) % 3) * 0.08;
    wbox(ctx, v, bx, y - 0.3 - bh, bx + bw, y - 0.3, BOOKS[k % BOOKS.length], 0.04);
    bx += bw + 0.02;
    k++;
  }
  wbox(ctx, v, L - 0.1, y - 0.3, R + 0.1, y, WOOD[1], 0.07);
}

function table(ctx, v, x, y, w, c) {
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L + 0.2, y - 1.45, L + 0.46, y - 0.25, WOOD[2], 0.05);
  wbox(ctx, v, R - 0.46, y - 1.45, R - 0.2, y - 0.25, WOOD[2], 0.05);
  wbox(ctx, v, L + 0.46, y - 0.95, R - 0.46, y - 0.8, WOOD[2], 0.04);
  wbox(ctx, v, L, y - 0.32, R, y, CLOTH[c][1], 0.08);
  wbox(ctx, v, L + 0.1, y - 0.5, R - 0.1, y - 0.3, WOOD[1], 0.06);
}

function lamp(ctx, v, x, y, w, c) {
  wbox(ctx, v, x - 0.07, y - 2.15, x + 0.07, y - 0.7, '#4a4552', 0.03);
  wbox(ctx, v, x - 0.55, y - 2.35, x + 0.55, y - 2.12, WOOD[2], 0.1);
  wpoly(ctx, v, [x - w / 2, y, x + w / 2, y, x + w * 0.85, y - 0.75, x - w * 0.85, y - 0.75], CLOTH[c][1]);
  wline(ctx, v, x - w * 0.3, y - 0.1, x - w * 0.5, y - 0.68, '#ffffff', 0.5);
}

function pillows(ctx, v, x, y, w, c, state, since, now) {
  // state 0 steady, 1 wobbling, 2 fallen; `since` is seconds since it was stood on
  let dx = 0;
  let dy = 0;
  let alpha = 1;
  if (state === 1) dx = Math.sin(now * 55) * 0.07;
  else if (state === 2) {
    const f = since - 0.6;
    dy = -f * f * 7;
    alpha = clamp(1 - f * 1.4, 0, 1);
  } else if (since >= 4.6 && since < 4.95) alpha = (since - 4.6) / 0.35; // it pops back
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  const rows = [
    [y - 1.06, y - 0.64, 1.02],
    [y - 0.74, y - 0.32, 0.96],
    [y - 0.42, y, 1.0],
  ];
  rows.forEach(([b, t, k], j) => {
    const pw = (w * k) / 2;
    const off = dx * (j + 1);
    const col = CLOTH[(c + j) % 4];
    wbox(ctx, v, x - pw + off, b + dy, x + pw + off, t + dy, col[j === 2 ? 1 : 0], 0.2);
    wcircle(ctx, v, x + off, (b + t) / 2 + dy, 0.07, col[2], false);
  });
  ctx.globalAlpha = 1;
}

function toybox(ctx, v, x, y, w, c) {
  const [m, l, d] = CLOTH[c];
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L, y - 1.0, R, y - 0.2, m, 0.1);
  wbox(ctx, v, L, y - 0.72, R, y - 0.5, l, 0.04);
  wbox(ctx, v, L - 0.08, y - 0.26, R + 0.08, y, d, 0.08);
  star(ctx, v, x, y - 0.62, 0.2, '#ffd23f');
}

function fridge(ctx, v, x, y, w) {
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L, y - 2.15, R, y, '#eef4f8', 0.14);
  wline(ctx, v, L + 0.04, y - 0.8, R - 0.04, y - 0.8, INK, 0.6);
  wbox(ctx, v, R - 0.3, y - 0.7, R - 0.18, y - 0.2, '#8a99a8', 0.04);
  wbox(ctx, v, R - 0.3, y - 1.4, R - 0.18, y - 0.95, '#8a99a8', 0.04);
  wcircle(ctx, v, L + 0.3, y - 1.2, 0.09, '#ef5a52', false);
  wcircle(ctx, v, L + 0.5, y - 1.5, 0.09, '#3f93e0', false);
}

function trampoline(ctx, v, x, y, w, c, since, now) {
  const L = x - w / 2;
  const R = x + w / 2;
  wbox(ctx, v, L + 0.1, y - 1.05, L + 0.32, y - 0.2, '#555a66', 0.05);
  wbox(ctx, v, R - 0.32, y - 1.05, R - 0.1, y - 0.2, '#555a66', 0.05);
  wbox(ctx, v, L, y - 0.42, R, y - 0.26, '#7b8190', 0.05);
  const a = since >= 0 && since < 1 ? Math.exp(-since * 7) * Math.cos(since * 24) : 0;
  const sag = 0.32 * a;
  const sx0 = v.px(L);
  const sx1 = v.px(R);
  const sxm = v.px(x);
  const top = v.py(y);
  const mid = v.py(y - 2 * sag);
  const thick = 0.2 * v.S;
  ctx.beginPath();
  ctx.moveTo(sx0, top);
  ctx.quadraticCurveTo(sxm, mid, sx1, top);
  ctx.lineTo(sx1, top + thick);
  ctx.quadraticCurveTo(sxm, mid + thick, sx0, top + thick);
  ctx.closePath();
  ctx.fillStyle = MAT[c % 3];
  ctx.fill();
  ctx.lineWidth = v.ol;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // springs
  for (let k = 0; k < 4; k++) {
    const sx = L + 0.3 + (k * (w - 0.6)) / 3;
    wline(ctx, v, sx, y - 0.2, sx - 0.06, y - 0.28, INK, 0.5);
    wline(ctx, v, sx - 0.06, y - 0.28, sx + 0.06, y - 0.34, INK, 0.5);
    wline(ctx, v, sx + 0.06, y - 0.34, sx, y - 0.42, INK, 0.5);
  }
  // up-arrows: this one bounces you
  const bob = Math.sin(now * 5) * 0.08;
  for (let k = 0; k < 2; k++) {
    const ay = y + 0.42 + k * 0.32 + bob;
    wpoly(ctx, v, [x - 0.3, ay, x, ay + 0.26, x + 0.3, ay], k ? '#fff6a8' : '#ffd23f');
  }
}

function chair(ctx, v, x, y, w, c, p, t) {
  const L = x - w / 2;
  const R = x + w / 2;
  // the track it rolls along
  const y0 = y - 1.28;
  for (let k = 0; k < 14; k++) {
    const tx = p.x - p.amp - w / 2 + ((k + 0.5) * (p.amp * 2 + w)) / 14;
    wline(ctx, v, tx - 0.08, y0, tx + 0.08, y0, 'rgba(43,26,47,0.4)', 0.6);
  }
  wbox(ctx, v, L + 0.05, y, L + 0.4, y + 1.1, CLOTH[c][2], 0.14);
  wbox(ctx, v, x - 0.07, y - 0.9, x + 0.07, y - 0.28, '#4a4552', 0.03);
  wbox(ctx, v, x - 0.78, y - 1.02, x + 0.78, y - 0.86, '#555a66', 0.06);
  for (const wx of [-0.66, 0, 0.66]) wcircle(ctx, v, x + wx, y - 1.1, 0.12, '#2b1a2f', false);
  wbox(ctx, v, L, y - 0.3, R, y, CLOTH[c][0], 0.1);
  // arrows beside it: it moves
  const dir = Math.sign(Math.cos((TAU * t) / p.period + p.phase)) || 1;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  const ax = x + dir * (w / 2 + 0.55 + pulse * 0.12);
  wpoly(ctx, v, [ax, y - 0.15, ax - dir * 0.3, y - 0.4, ax - dir * 0.3, y + 0.1], '#ffd23f');
}

function floorSlab(ctx, v, world, t) {
  const top = v.py(0);
  if (top > v.H + 4) return;
  const warn = clamp((t - (world.floorUntil - 1.6)) / 1.6, 0, 1);
  paintFloor(ctx, v, top, warn > 0 && Math.sin(t * 22) > 0 ? '#e5533d' : '#c98b4a');
}

function paintFloor(ctx, v, top, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, top, v.W, v.H - top + 4);
  ctx.fillStyle = '#e0a863';
  ctx.fillRect(0, top, v.W, Math.max(6, v.S * 0.32));
  ctx.fillStyle = 'rgba(43,26,47,0.35)';
  for (let k = -16; k < 32; k++) ctx.fillRect(v.px(k * 1.6), top + v.S * 0.32, Math.max(2, v.ol * 0.7), v.H);
  ctx.lineWidth = v.ol * 1.2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(v.W, top);
  ctx.stroke();
  // the rug
  const rx0 = v.px(2.2);
  const rx1 = v.px(11.8);
  rr(ctx, rx0, top - v.S * 0.04, rx1 - rx0, Math.max(5, v.S * 0.22), 4);
  ctx.fillStyle = '#d6453d';
  ctx.fill();
  ctx.lineWidth = v.ol * 0.8;
  ctx.stroke();
}

/** One piece of furniture. `t` is round time (for the rolling chair and the pillows). */
export function drawPlatform(ctx, v, world, p, t, now) {
  const i = p.i;
  if (p.kind === 'goal') return;
  if (p.kind === 'floor') {
    if (t < world.floorUntil) floorSlab(ctx, v, world, t);
    return;
  }
  const x = platformX(p, t);
  const y = p.y;
  const sy = v.py(y);
  if (sy < -v.S * 1.6 || sy > v.H + v.S * 2.6) return;
  const sx = v.px(x);
  const half = (p.w / 2 + (p.kind === 'move' ? p.amp : 0) + 1) * v.S;
  if (sx < -half || sx > v.W + half) return;
  ctx.lineJoin = 'round';
  switch (p.f) {
    case 'couch':
      couch(ctx, v, x, y, p.w, p.c, 0.95);
      break;
    case 'armchair':
      couch(ctx, v, x, y, p.w, p.c, 1.25);
      break;
    case 'shelf':
      shelf(ctx, v, x, y, p.w, p.c);
      break;
    case 'table':
      table(ctx, v, x, y, p.w, p.c);
      break;
    case 'lamp':
      lamp(ctx, v, x, y, p.w, p.c);
      break;
    case 'toybox':
      toybox(ctx, v, x, y, p.w, p.c);
      break;
    case 'fridge':
      fridge(ctx, v, x, y, p.w);
      break;
    case 'pillows': {
      const state = crumbleState(world, i, t);
      const c0 = world.ct[i];
      pillows(ctx, v, x, y, p.w, p.c, state, c0 >= 0 ? t - c0 : 0, now);
      break;
    }
    case 'trampoline':
      trampoline(ctx, v, x, y, p.w, p.c, t - world.bt[i], now);
      break;
    case 'chair':
      chair(ctx, v, x, y, p.w, p.c, p, t);
      break;
    default:
  }
}

// ------------------------------------------------------------------ the balloon
const STRIPES = ['#ff4d4d', '#ffffff', '#ffd23f', '#ffffff', '#2ea6ff', '#ffffff', '#ff4d4d'];

/** Behind the characters in the basket: the glow, the balloon and its ropes. `dy`: how far it has risen. */
export function drawGoalBack(ctx, v, world, now, dy = 0) {
  if (world.goal < 0) return;
  const p = world.platforms[world.goal];
  const gx = p.x;
  const gy = p.y + dy;
  const cx = gx;
  const cy = gy + 4.5;
  const R = 2.6;
  if (v.py(gy - 1.2) < -10 || v.py(gy + 8.4) > v.H + 10) return; // off the top or the bottom of the screen
  // a glowing target
  ctx.globalAlpha = 0.22 + 0.1 * Math.sin(now * 3);
  wcircle(ctx, v, cx, cy, R + 1.1, '#ffe66b', false);
  ctx.globalAlpha = 1;
  // ropes
  for (const [a, b] of [[-1.5, -1.9], [1.5, 1.9], [-0.5, -0.8], [0.5, 0.8]]) wline(ctx, v, gx + a, gy, cx + b, cy - R * 0.8, INK, 0.7);
  // the envelope
  const sxc = v.px(cx);
  const syc = v.py(cy);
  const r = R * v.S;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sxc, syc, r, 0, TAU);
  ctx.clip();
  for (let k = 0; k < STRIPES.length; k++) {
    const x0 = sxc + r * Math.sin(-Math.PI / 2 + (k * Math.PI) / STRIPES.length);
    const x1 = sxc + r * Math.sin(-Math.PI / 2 + ((k + 1) * Math.PI) / STRIPES.length);
    ctx.fillStyle = STRIPES[k];
    ctx.fillRect(x0, syc - r - 2, x1 - x0 + 1, r * 2 + 4);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(sxc, syc, r, 0, TAU);
  ctx.lineWidth = v.ol * 1.3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  wcircle(ctx, v, cx - 0.9, cy + 1.0, 0.45, 'rgba(255,255,255,0.55)', false);
  // the neck
  wpoly(ctx, v, [cx - 0.95, cy - R * 0.92, cx + 0.95, cy - R * 0.92, gx + 0.9, gy + 1.0, gx - 0.9, gy + 1.0], '#e8453d');
  wbox(ctx, v, gx - 1.7, gy - 1.05, gx + 1.7, gy, '#9a6428', 0.12); // the back of the basket
}

/** In front of the characters: the basket's front and its word. */
export function drawGoalFront(ctx, v, world, now, dy = 0, word = true) {
  if (world.goal < 0) return;
  const p = world.platforms[world.goal];
  const gx = p.x;
  const gy = p.y + dy;
  if (v.py(gy - 2) < -40 || v.py(gy + 1) > v.H + 40) return;
  wbox(ctx, v, gx - 1.74, gy - 1.05, gx + 1.74, gy - 0.34, '#d9a05b', 0.14);
  for (const wy of [-0.55, -0.82]) wline(ctx, v, gx - 1.7, gy + wy, gx + 1.7, gy + wy, '#9a6428', 0.5);
  for (let k = 0; k < 9; k++) wline(ctx, v, gx - 1.5 + k * 0.375, gy - 0.4, gx - 1.5 + k * 0.375, gy - 1.0, '#9a6428', 0.4);
  wbox(ctx, v, gx - 1.82, gy - 0.34, gx + 1.82, gy - 0.1, '#b9803d', 0.08);
  if (word) label(ctx, 'SAFE', v.px(gx), v.py(gy - 0.68), Math.max(12, v.S * 0.55), { fill: '#fff6a8' });
}

// ------------------------------------------------------------------ the lava
export function drawLava(ctx, v, level, now) {
  const surface = v.py(level);
  if (surface > v.H + v.S) return;
  const step = Math.max(10, v.S * 0.5);
  const amp = v.S * 0.12;
  const wave = (x, ph) => Math.sin(x * 0.045 + now * 2.1 + ph) * amp + Math.sin(x * 0.021 - now * 1.4 + ph * 2) * amp * 0.8;
  const fillLayer = (offset, color, ph) => {
    ctx.beginPath();
    ctx.moveTo(-10, v.H + 10);
    for (let x = -10; x <= v.W + step; x += step) ctx.lineTo(x, surface + offset + wave(x, ph));
    ctx.lineTo(v.W + step, v.H + 10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  fillLayer(0, '#ff4f1f', 0);
  fillLayer(v.S * 0.42, '#ff7a1f', 1.3);
  fillLayer(v.S * 1.0, '#ff9a22', 2.6);
  // the outlined crest
  ctx.beginPath();
  for (let x = -10; x <= v.W + step; x += step) {
    const y = surface + wave(x, 0);
    if (x < 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = v.ol * 1.4;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  for (let x = -10; x <= v.W + step; x += step) {
    const y = surface + v.ol * 1.6 + wave(x, 0);
    if (x < 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = v.ol * 0.9;
  ctx.strokeStyle = '#ffd23f';
  ctx.stroke();
  // flat heat-shimmer lines above it
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const y = surface - v.S * (0.5 + k * 0.5) + Math.sin(now * 1.3 + k * 1.7) * v.S * 0.08;
    const x0 = (((k * 173 + now * 18 * (k % 2 ? 1 : -1)) % (v.W + 200)) + v.W + 200) % (v.W + 200) - 100;
    ctx.globalAlpha = 0.2 * (1 - k / 7);
    ctx.strokeStyle = '#fff2c4';
    ctx.lineWidth = Math.max(2, v.ol * 0.7);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(x0 + v.S * 0.7, y - v.S * 0.14, x0 + v.S * 1.4, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ characters
/**
 * c: { x, y (feet), ci (colour index), color, bot, seed, head (Image|null), name, alpha, sq (squash: + tall, - flat), face (1 | -1), run, o (on the ground),
 *      ghost, hot, you (show the arrow), ring (a light ring: you), ready, readyPop, scale }
 */
export function drawChar(ctx, v, c, now) {
  const S = v.S;
  const sx = v.px(c.x);
  const sy = v.py(c.y);
  if (sx < -70 || sx > v.W + 70 || sy < -90 || sy > v.H + 90) return;
  const u = S * (c.scale ?? 1);
  const alpha = c.alpha ?? 1;
  const color = c.color ?? PLAYER_COLORS[(c.ci ?? 0) % PLAYER_COLORS.length];
  const dark = DARK[(c.ci ?? 0) % DARK.length];
  ctx.save();
  ctx.globalAlpha = alpha;
  // the ground ring (you) or a solid drop shadow (everyone)
  if (!c.ghost) {
    ctx.beginPath();
    if (c.ring) {
      ctx.ellipse(sx, sy + u * 0.02, u * 0.58, u * 0.17, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.lineWidth = Math.max(2, v.ol * 0.8);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else {
      ctx.ellipse(sx + u * 0.05, sy + u * 0.03, u * 0.4, u * 0.12, 0, 0, TAU);
      ctx.fillStyle = 'rgba(43,26,47,0.26)';
      ctx.fill();
    }
  }
  const sq = c.sq ?? 0;
  const bob = c.ghost ? Math.sin(now * 3 + (c.seed ?? 0)) * 0.08 * u : 0;
  ctx.translate(sx, sy + bob - (c.ghost ? 0.25 * u : 0));
  ctx.scale(1 - sq * 0.6, 1 + sq);
  ctx.lineJoin = 'round';
  ctx.lineWidth = v.ol;
  ctx.strokeStyle = INK;
  const flick = c.hot && Math.floor(now * 12) % 2 === 0;
  const bodyColor = c.hot ? (flick ? '#ff4d2d' : '#ffd23f') : color;

  if (c.ghost) {
    // a little sheet ghost in the player's colour
    ctx.beginPath();
    ctx.arc(0, -0.62 * u, 0.36 * u, Math.PI, 0);
    ctx.lineTo(0.36 * u, -0.08 * u);
    for (let k = 0; k < 3; k++) {
      const x0 = (0.36 - 0.24 * k) * u;
      const x1 = x0 - 0.24 * u;
      ctx.quadraticCurveTo((x0 + x1) / 2, 0.08 * u, x1, -0.08 * u); // a scalloped hem
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    rr(ctx, -0.36 * u, -0.44 * u, 0.72 * u, 0.1 * u, 0.04 * u);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-0.13 * u, -0.66 * u, 0.06 * u, 0.1 * u, 0, 0, TAU);
    ctx.ellipse(0.13 * u, -0.66 * u, 0.06 * u, 0.1 * u, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -0.5 * u, 0.06 * u, 0.045 * u, 0, 0, TAU);
    ctx.fill();
  } else {
    // feet
    const run = c.run ?? 0;
    const air = c.o ? 0 : 1;
    const lift1 = air ? 0.1 * u : Math.max(0, Math.sin(run)) * 0.1 * u;
    const lift2 = air ? 0.1 * u : Math.max(0, Math.sin(run + Math.PI)) * 0.1 * u;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(-0.15 * u, -0.07 * u - lift1, 0.15 * u, 0.09 * u, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.15 * u, -0.07 * u - lift2, 0.15 * u, 0.09 * u, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // body
    rr(ctx, -0.27 * u, -0.52 * u, 0.54 * u, 0.44 * u, 0.18 * u);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, -0.19 * u, -0.47 * u, 0.1 * u, 0.28 * u, 0.05 * u);
    ctx.fill();
    // head
    const hy = -0.7 * u;
    const hr = 0.35 * u;
    if (c.bot) {
      // an antenna
      ctx.beginPath();
      ctx.moveTo(0, hy - hr);
      ctx.lineTo(0.05 * u * (c.face ?? 1), hy - hr - 0.22 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0.05 * u * (c.face ?? 1), hy - hr - 0.25 * u, 0.08 * u, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, hy, hr, 0, TAU);
    ctx.fillStyle = SKIN[(c.seed ?? 0) % SKIN.length];
    ctx.fill();
    const img = c.head;
    if (!c.bot && img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, hy, hr, 0, TAU);
      ctx.clip();
      ctx.drawImage(img, -hr * 1.18, hy - hr * 1.2, hr * 2.36, hr * 2.36);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, hy, hr, 0, TAU);
      ctx.stroke();
    } else {
      ctx.stroke();
      // a cute face
      const f = (c.face ?? 1) * 0.035 * u;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-0.13 * u, hy - 0.02 * u, 0.09 * u, c.hot ? 0.13 * u : 0.11 * u, 0, 0, TAU);
      ctx.ellipse(0.13 * u, hy - 0.02 * u, 0.09 * u, c.hot ? 0.13 * u : 0.11 * u, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, v.ol * 0.6);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(-0.13 * u + f, hy - 0.01 * u, 0.045 * u, 0, TAU);
      ctx.arc(0.13 * u + f, hy - 0.01 * u, 0.045 * u, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      if (c.hot) ctx.ellipse(0, hy + 0.17 * u, 0.07 * u, 0.09 * u, 0, 0, TAU);
      else if (air) ctx.ellipse(0, hy + 0.16 * u, 0.06 * u, 0.07 * u, 0, 0, TAU);
      else ctx.arc(0, hy + 0.1 * u, 0.1 * u, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = Math.max(1.5, v.ol * 0.6);
      ctx.stroke();
      ctx.lineWidth = v.ol;
    }
    if (c.hot) {
      // flames on the head
      ctx.fillStyle = flick ? '#ffd23f' : '#ff8a1f';
      for (let k = -1; k <= 1; k++) {
        const fx0 = k * 0.2 * u;
        ctx.beginPath();
        ctx.moveTo(fx0 - 0.1 * u, hy - hr * 0.8);
        ctx.quadraticCurveTo(fx0 - 0.1 * u, hy - hr - 0.22 * u, fx0, hy - hr - 0.38 * u - Math.abs(Math.sin(now * 14 + k)) * 0.12 * u);
        ctx.quadraticCurveTo(fx0 + 0.12 * u, hy - hr - 0.15 * u, fx0 + 0.1 * u, hy - hr * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // name, the YOU arrow, the ready check: drawn flat, not squashed
  if (alpha > 0.05) {
    const top = sy + bob - (c.ghost ? 0.25 * u : 0) - (c.bot ? 1.62 : 1.3) * u * (1 + sq);
    const size = clamp(S * 0.4, 11, 18);
    ctx.globalAlpha = alpha;
    if (c.name) label(ctx, c.name, sx, top, size);
    let ty = top - size * 0.8;
    if (c.you) {
      const by = Math.sin(now * 6) * size * 0.25;
      label(ctx, 'YOU', sx, ty - size * 0.55 + by, size * 1.15, { fill: '#ffd23f' });
      ctx.beginPath();
      ctx.moveTo(sx - size * 0.55, ty + by + size * 0.05);
      ctx.lineTo(sx + size * 0.55, ty + by + size * 0.05);
      ctx.lineTo(sx, ty + by + size * 0.75);
      ctx.closePath();
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.lineWidth = v.ol * 0.8;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ty -= size * 1.9;
    }
    if (c.ready) {
      const k = easeOutBack(c.readyPop ?? 1);
      const r = Math.max(14, S * 0.5) * k;
      const cy = ty - r * 0.6;
      ctx.beginPath();
      ctx.arc(sx, cy, r, 0, TAU);
      ctx.fillStyle = '#2fd16b';
      ctx.fill();
      ctx.lineWidth = v.ol;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.5, cy + r * 0.02);
      ctx.lineTo(sx - r * 0.12, cy + r * 0.4);
      ctx.lineTo(sx + r * 0.52, cy - r * 0.38);
      ctx.lineWidth = Math.max(3, r * 0.26);
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** Everything in the world, back to front: wall, furniture, the balloon, (characters are drawn by the caller), lava. */
export function drawWorldBack(ctx, v, world, t, now, balloonDy = 0) {
  drawWall(ctx, v, world, now);
  const P = world.platforms;
  const order = world.order;
  const bottom = v.camY - 3;
  const top = v.camY + v.H / v.S + 2;
  for (let k = 0; k < order.length; k++) {
    const p = P[order[k]];
    if (p.y < bottom || p.y - 2.6 > top) continue;
    drawPlatform(ctx, v, world, p, t, now);
  }
  drawGoalBack(ctx, v, world, now, balloonDy);
}
