// Screens drawn on the canvas: the title, the lobby's settings, the countdown, banners, the HUD, the scoreboard and the podium.
// Few words, big shapes, white outlined text. Every tappable thing is at least 56 px tall. Nothing here changes game state.

import { FONT, INK, label, rr, drawChar, screenView } from './draw.js';
import { PLAYER_COLORS, clamp, ordinal, SHOUT1_S, SHOUT2_S, GRACE_S, TAU } from './rules.js';
import { easeOutBack, easeOutCubic, easeInOut } from './fx.js';

/** Rectangles of the things a tap can hit, filled in as they are drawn. */
export const hits = {
  play: { x: 0, y: 0, w: 0, h: 0, on: false },
  rounds: { x: 0, y: 0, w: 0, h: 0, on: false },
  lava: { x: 0, y: 0, w: 0, h: 0, on: false },
  start: { x: 0, y: 0, w: 0, h: 0, on: false },
};

export function clearHits() {
  for (const k of Object.keys(hits)) hits[k].on = false;
}

function setHit(h, x, y, w, hh) {
  h.x = x;
  h.y = y;
  h.w = w;
  h.h = hh;
  h.on = true;
}

export function inHit(h, x, y) {
  return h.on && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
}

/** A scale for text and shapes: 1 at 800x450, never tiny, never huge. */
export function uiScale(W, H) {
  return clamp(Math.min(W / 800, H / 450), 0.62, 1.5);
}

const GOLD = '#ffd23f';
const PLACE_COLORS = ['#ffd23f', '#d5dde6', '#e29a5c'];

// ------------------------------------------------------------------ pieces
function plate(ctx, x, y, w, h, fill, r, shadow = 5) {
  rr(ctx, x, y + shadow, w, h, r);
  ctx.fillStyle = 'rgba(43,26,47,0.45)';
  ctx.fill();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function flame(ctx, x, y, s, lit) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.25, x + s * 0.55, y + s * 0.55);
  ctx.quadraticCurveTo(x, y + s * 0.95, x - s * 0.55, y + s * 0.55);
  ctx.quadraticCurveTo(x - s * 0.85, y - s * 0.1, x, y - s);
  ctx.closePath();
  ctx.fillStyle = lit ? '#ff7a1f' : '#6a5a72';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (lit) {
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 0.28, s * 0.35, 0, 0, TAU);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }
}

function starIcon(ctx, x, y, r, fill = GOLD) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function balloonIcon(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y - s * 0.25, s * 0.62, 0, TAU);
  ctx.fillStyle = '#ff4d4d';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.25, s * 0.24, s * 0.62, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  rr(ctx, x - s * 0.22, y + s * 0.6, s * 0.44, s * 0.3, s * 0.06);
  ctx.fillStyle = '#d9a05b';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.18, y + s * 0.38);
  ctx.lineTo(x - s * 0.15, y + s * 0.6);
  ctx.moveTo(x + s * 0.18, y + s * 0.38);
  ctx.lineTo(x + s * 0.15, y + s * 0.6);
  ctx.stroke();
}

/** Chunky extruded display text. */
export function bigText(ctx, str, x, y, size, fill, edge) {
  ctx.font = `${Math.round(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = INK;
  const depth = size * 0.08;
  for (let k = 6; k >= 1; k--) {
    ctx.fillStyle = edge;
    ctx.strokeText(str, x, y + (k * depth) / 6);
    ctx.fillText(str, x, y + (k * depth) / 6);
  }
  ctx.fillStyle = fill;
  ctx.strokeText(str, x, y);
  ctx.fillText(str, x, y);
}

function bigButton(ctx, x, y, w, h, fill, text, size, now, glyph) {
  const pulse = 1 + Math.sin(now * 4) * 0.025;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  plate(ctx, -w / 2, -h / 2, w, h, fill, h * 0.32, h * 0.09);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  rr(ctx, -w / 2 + h * 0.12, -h / 2 + h * 0.08, w - h * 0.24, h * 0.2, h * 0.1);
  ctx.fill();
  const tw = (glyph ? h * 0.5 : 0) + (text ? text.length * size * 0.5 : 0);
  if (glyph === 'play') {
    const gx = -tw / 2 + h * 0.2;
    ctx.beginPath();
    ctx.moveTo(gx - h * 0.14, -h * 0.22);
    ctx.lineTo(gx + h * 0.2, 0);
    ctx.lineTo(gx - h * 0.14, h * 0.22);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  label(ctx, text, glyph ? h * 0.22 : 0, 0, size);
  ctx.restore();
}

// ------------------------------------------------------------------ title and lobby
export function drawTitle(ctx, W, H, u, now) {
  ctx.fillStyle = 'rgba(43,26,47,0.3)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const wob = 1 + Math.sin(now * 2) * 0.018;
  const y1 = H * 0.17;
  const s1 = 54 * u;
  const s2 = 172 * u;
  const y2 = y1 + s1 * 0.5 + s2 * 0.46;
  ctx.save();
  ctx.translate(cx, y2);
  ctx.scale(wob, wob);
  ctx.translate(-cx, -y2);
  label(ctx, 'THE FLOOR IS', cx, y1, s1);
  bigText(ctx, 'LAVA', cx, y2, s2, '#ffb020', '#c8321a');
  // drips
  for (let k = 0; k < 4; k++) {
    const dx = cx + (k - 1.5) * s2 * 0.5;
    const len = s2 * (0.16 + 0.09 * Math.sin(now * 2 + k * 1.7));
    const top = y2 + s2 * 0.38;
    rr(ctx, dx - s2 * 0.035, top, s2 * 0.07, len, s2 * 0.035);
    ctx.fillStyle = '#ff7a1f';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, top + len, s2 * 0.05, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  const bw = Math.max(210, 270 * u);
  const bh = Math.max(66, 92 * u);
  const bx = cx - bw / 2;
  const by = clamp(H * 0.78 - bh / 2, y2 + s2 * 0.75, H - bh - 18);
  bigButton(ctx, bx, by, bw, bh, '#2fd16b', 'PLAY', Math.max(40, 58 * u), now, 'play');
  setHit(hits.play, bx, by, bw, bh);
}

/** The lobby's settings at the top, big. `editable`: the host can tap them. */
export function drawLobbyChips(ctx, W, H, u, o, now) {
  const cw = clamp(172 * u, 124, 230);
  const ch = Math.max(60, 64 * u);
  const gap = 14 * u;
  const total = cw * 2 + gap;
  const x0 = W / 2 - total / 2;
  const y0 = W >= 640 ? 10 : 64;
  const pulse = 0.5 + 0.5 * Math.sin(now * 4);
  const chip = (x, name, hit) => {
    plate(ctx, x, y0, cw, ch, '#3d2b52', ch * 0.28, 5);
    if (o.editable) {
      rr(ctx, x + 2, y0 + 2, cw - 4, ch - 4, ch * 0.26);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,210,63,${0.55 + pulse * 0.45})`;
      ctx.stroke();
    }
    label(ctx, name, x + cw / 2, y0 + ch * 0.24, Math.max(14, 20 * u), { fill: '#cbb8ea', lw: 3 });
    setHit(hit, x, y0, cw, ch);
    hit.on = Boolean(o.editable);
    if (o.editable) {
      // a cycle arrow: tap to change
      const ax = x + cw - ch * 0.3;
      const ay = y0 + ch * 0.62;
      ctx.beginPath();
      ctx.arc(ax, ay, ch * 0.13, -0.6, 4.4);
      ctx.lineWidth = 3;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax + ch * 0.13, ay - ch * 0.2);
      ctx.lineTo(ax + ch * 0.25, ay - ch * 0.04);
      ctx.lineTo(ax + ch * 0.04, ay - ch * 0.02);
      ctx.closePath();
      ctx.fillStyle = GOLD;
      ctx.fill();
    }
  };
  chip(x0, 'ROUNDS', hits.rounds);
  label(ctx, String(o.rounds), x0 + cw * 0.42, y0 + ch * 0.64, Math.max(30, 40 * u));
  const lx = x0 + cw + gap;
  chip(lx, 'LAVA', hits.lava);
  const n = o.lava === 'slow' ? 1 : o.lava === 'fast' ? 3 : 2;
  const fs = ch * 0.2;
  for (let k = 0; k < 3; k++) flame(ctx, lx + cw * 0.22 + k * fs * 1.9, y0 + ch * 0.64, fs, k < n);
  return y0 + ch;
}

export function drawHint(ctx, W, y, u, text) {
  label(ctx, text, W / 2, y, Math.max(20, 29 * u));
}

/** A tiny START button for the stand-alone page (outside the platform there is no Ready strip). */
export function drawStandaloneStart(ctx, W, H, u, now) {
  const bw = 200 * u;
  const bh = Math.max(60, 70 * u);
  const bx = W / 2 - bw / 2;
  const by = H - bh - 24;
  bigButton(ctx, bx, by, bw, bh, '#2fd16b', 'START', Math.max(34, 46 * u), now, 'play');
  setHit(hits.start, bx, by, bw, bh);
}

export function drawTapHint(ctx, W, H, u, now) {
  const a = 0.6 + 0.4 * Math.sin(now * 5);
  label(ctx, 'TAP TO PLAY', W / 2, H * 0.28, Math.max(30, 44 * u), { alpha: a });
}

// ------------------------------------------------------------------ countdown, banners, shouts
const COUNT_COLORS = { 3: '#ff5a5a', 2: '#ffa62b', 1: '#ffe14a', 'GO!': '#3ddc84' };

/** age: 0..1 through the number's second. */
export function drawCountdown(ctx, W, H, u, text, age, reduced) {
  const k = reduced ? 1 : easeOutBack(clamp(age * 3.2, 0, 1));
  const size = (text === 'GO!' ? 230 : 280) * u * (0.55 + 0.45 * k);
  const a = text === 'GO!' ? clamp(1.6 - age * 1.6, 0, 1) : 1;
  ctx.globalAlpha = a;
  bigText(ctx, String(text), W / 2, H * 0.42, size, COUNT_COLORS[text] ?? '#fff', '#7a2a1a');
  ctx.globalAlpha = 1;
}

/** The round's goal in a few words, sliding in. */
export function drawBanner(ctx, W, H, u, text, round, total, age, reduced) {
  const k = reduced ? 1 : easeOutBack(clamp(age / 0.28, 0, 1));
  const out = clamp((age - 1.2) / 0.3, 0, 1);
  const y = H * 0.24 - (1 - k) * H * 0.3 - easeInOut(out) * H * 0.2;
  const size = Math.max(34, 62 * u);
  ctx.font = `${size}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const bw = Math.min(W - 24, tw + size * 2.4);
  const bh = size * 1.55;
  plate(ctx, W / 2 - bw / 2, y - bh / 2, bw, bh, '#ff5a2a', bh * 0.3, 6);
  balloonIcon(ctx, W / 2 - bw / 2 + size * 0.85, y, size * 0.7);
  label(ctx, text, W / 2 + size * 0.5, y, size);
  if (total > 1) label(ctx, `ROUND ${round}/${total}`, W / 2, y - bh * 0.78, Math.max(20, 30 * u), { fill: GOLD });
}

/** "THE FLOOR IS... LAVA!" from round time t (seconds). */
export function drawShout(ctx, W, H, u, t, reduced) {
  if (t < SHOUT1_S || t > GRACE_S + 1.1) return;
  const fade = clamp((GRACE_S + 1.1 - t) / 0.4, 0, 1);
  ctx.globalAlpha = fade;
  const a1 = clamp((t - SHOUT1_S) / 0.3, 0, 1);
  const s1 = Math.max(36, 70 * u) * (reduced ? 1 : 0.6 + 0.4 * easeOutBack(a1));
  label(ctx, 'THE FLOOR IS...', W / 2, H * 0.3, s1, { alpha: fade });
  if (t >= SHOUT2_S) {
    const a2 = clamp((t - SHOUT2_S) / 0.35, 0, 1);
    const k = reduced ? 1 : 0.5 + 0.7 * easeOutBack(a2);
    bigText(ctx, 'LAVA!', W / 2, H * 0.48, Math.max(70, 160 * u) * k, '#ffb020', '#c8321a');
  }
  ctx.globalAlpha = 1;
}

/** The lava speeds up once everyone is done: a word for two seconds. age: seconds since it began. */
export function drawSurge(ctx, W, H, u, age, reduced) {
  if (age < 0 || age > 2.4) return;
  const k = reduced ? 1 : easeOutBack(clamp(age / 0.25, 0, 1));
  const a = clamp((2.4 - age) / 0.4, 0, 1);
  label(ctx, 'FASTER!', W / 2, H * 0.34, Math.max(40, 80 * u) * (0.6 + 0.4 * k), { fill: '#ff7a3a', alpha: a });
}

// ------------------------------------------------------------------ playing
/** The top bar: the round, who is still climbing, and your points. */
export function drawHud(ctx, W, H, u, o) {
  const cw = clamp(190 * u, 130, 250);
  const ch = Math.max(54, 62 * u);
  const x = W / 2 - cw / 2;
  plate(ctx, x, 8, cw, ch, '#3d2b52', ch * 0.28, 4);
  label(ctx, o.total > 1 ? `ROUND ${o.round}/${o.total}` : 'ROUND', W / 2, 8 + ch * 0.34, Math.max(18, 28 * u));
  label(ctx, o.left === 1 ? '1 left' : `${o.left} left`, W / 2, 8 + ch * 0.74, Math.max(15, 22 * u), { fill: '#cbb8ea', lw: 3 });
  // your points
  const sw = Math.max(92, 118 * u);
  const sh = Math.max(46, 52 * u);
  const sx = W - sw - 12;
  plate(ctx, sx, 10, sw, sh, '#3d2b52', sh * 0.3, 4);
  starIcon(ctx, sx + sh * 0.5, 10 + sh / 2, sh * 0.3);
  label(ctx, String(o.score), sx + sw * 0.62, 10 + sh / 2, Math.max(26, 36 * u));
  return 10 + sh;
}

/** The height bar on the right: the lava's level, everyone's height and the balloon at the top. */
export function drawHeightBar(ctx, W, H, u, o) {
  const bw = Math.max(14, 17 * u);
  const x = W - bw - 14;
  const top = Math.max(86, 92 * u);
  const bottom = Math.max(top + 90, H - Math.max(130, 170 * u));
  const hgt = bottom - top;
  const goal = Math.max(1, o.goalY);
  rr(ctx, x, top, bw, hgt, bw / 2);
  ctx.fillStyle = '#3d2b52';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // the lava, rising
  const lv = clamp(o.lava / goal, 0, 1);
  if (lv > 0.002) {
    ctx.save();
    rr(ctx, x, top, bw, hgt, bw / 2);
    ctx.clip();
    ctx.fillStyle = '#ff6a1f';
    ctx.fillRect(x, bottom - hgt * lv, bw, hgt * lv + 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x, bottom - hgt * lv, bw, 3);
    ctx.restore();
  }
  balloonIcon(ctx, x + bw / 2, top - 15, 17);
  const yOf = (h) => bottom - hgt * clamp(h / goal, 0, 1);
  // out players first, you last
  for (const pass of [2, 0, 1]) {
    for (const e of o.entries) {
      if (e.st !== pass || e.me) continue;
      ctx.beginPath();
      ctx.arc(x + bw / 2, yOf(e.st === 1 ? goal : e.y), 6.5 * u + 1, 0, TAU);
      ctx.fillStyle = e.st === 2 ? '#8d8296' : PLAYER_COLORS[e.ci % PLAYER_COLORS.length];
      ctx.globalAlpha = e.st === 2 ? 0.7 : 1;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  for (const e of o.entries) {
    if (!e.me) continue;
    const y = yOf(e.st === 1 ? goal : e.y);
    ctx.beginPath();
    ctx.arc(x + bw / 2, y, 9.5 * u + 1.5, 0, TAU);
    ctx.fillStyle = PLAYER_COLORS[e.ci % PLAYER_COLORS.length];
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 8);
    ctx.lineTo(x - 6, y + 8);
    ctx.lineTo(x - 18, y);
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/** A red edge at the bottom when the lava is close. `gap`: units between your feet and the lava. */
export function drawWarnEdge(ctx, W, H, gap, now, reduced) {
  if (!(gap < 3.2)) return;
  const k = clamp(1 - gap / 3.2, 0, 1);
  const pulse = reduced ? 0.75 : 0.65 + 0.35 * Math.sin(now * (6 + k * 8));
  const a = k * pulse;
  ctx.fillStyle = `rgba(255,40,20,${0.34 * a})`;
  ctx.fillRect(0, H - 56 - k * 26, W, 56 + k * 26);
  ctx.fillStyle = `rgba(255,40,20,${0.3 * a})`;
  ctx.fillRect(0, H - 26 - k * 14, W, 26 + k * 14);
  ctx.fillStyle = `rgba(255,40,20,${0.38 * a})`;
  ctx.fillRect(0, H - 10, W, 10);
}

export function drawFlash(ctx, W, H, a, color = '255,255,255') {
  if (a <= 0.01) return;
  ctx.fillStyle = `rgba(${color},${Math.min(0.8, a)})`;
  ctx.fillRect(0, 0, W, H);
}

export function drawWatching(ctx, W, H, u, y) {
  const w = Math.max(150, 190 * u);
  const h = Math.max(40, 46 * u);
  plate(ctx, W / 2 - w / 2, y, w, h, '#3d2b52', h * 0.3, 4);
  label(ctx, 'WATCHING', W / 2, y + h / 2, Math.max(18, 26 * u));
}

export function drawGhostChip(ctx, W, H, u, y) {
  const w = Math.max(130, 160 * u);
  const h = Math.max(38, 44 * u);
  plate(ctx, W / 2 - w / 2, y, w, h, '#5b4a78', h * 0.3, 4);
  label(ctx, 'GHOST', W / 2, y + h / 2, Math.max(18, 26 * u));
}

/** "1st!" and friends over your head: a big pop on screen. */
export function drawPlacePop(ctx, W, H, u, text, age) {
  if (age < 0 || age > 1.8) return;
  const k = easeOutBack(clamp(age / 0.3, 0, 1));
  const out = clamp((age - 1.3) / 0.5, 0, 1);
  ctx.globalAlpha = 1 - out;
  bigText(ctx, text, W / 2, H * 0.36 - out * 40, Math.max(70, 150 * u) * (0.5 + 0.6 * k), GOLD, '#b8670a');
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ between rounds
/**
 * rows: [{ id, name, ci, bot, head, score (the new total), add (points this round) }] best first. you: your id.
 * age: seconds since the scoreboard began.
 */
export function drawScoreboard(ctx, W, H, u, o, now) {
  ctx.fillStyle = 'rgba(30,16,40,0.62)';
  ctx.fillRect(0, 0, W, H);
  const titleSize = Math.max(28, 44 * u);
  label(ctx, o.final ? 'FINAL' : `ROUND ${o.round}`, W / 2, Math.max(36, 44 * u), titleSize, { fill: GOLD });
  const top = Math.max(72, 84 * u);
  const rowH = clamp(54 * u, 36, 64);
  const maxRows = Math.max(3, Math.floor((H - top - 36) / (rowH + 6)));
  let rows = o.rows;
  let youIdx = rows.findIndex((r) => r.id === o.you);
  let show = rows.slice(0, maxRows);
  if (youIdx >= maxRows) show = [...rows.slice(0, maxRows - 1), rows[youIdx]];
  const pw = clamp(560 * u, 300, W - 20);
  const px = W / 2 - pw / 2;
  show.forEach((r, i) => {
    const idx = rows.indexOf(r);
    const slide = easeOutCubic(clamp((o.age - i * 0.07) / 0.35, 0, 1));
    const y = top + i * (rowH + 6);
    const x = px - (1 - slide) * (W * 0.6);
    const me = r.id === o.you;
    plate(ctx, x, y, pw, rowH, me ? '#5a3f86' : '#3d2b52', rowH * 0.3, 4);
    if (me) {
      rr(ctx, x + 2, y + 2, pw - 4, rowH - 4, rowH * 0.28);
      ctx.lineWidth = 3;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
    }
    const place = idx + 1;
    label(ctx, String(place), x + rowH * 0.55, y + rowH * 0.52, rowH * 0.62, { fill: PLACE_COLORS[idx] ?? '#ffffff' });
    const v = screenView(x + rowH * 1.35, y + rowH * 0.9, rowH * 0.62, 3);
    drawChar(ctx, v, { x: 0, y: 0, ci: r.ci, bot: r.bot, seed: r.ci + (r.bot ? 3 : 0), head: r.head, o: 1, face: 1, run: 0, sq: 0 }, now);
    label(ctx, r.name, x + rowH * 1.95, y + rowH * 0.5, Math.max(16, rowH * 0.46), { align: 'left' });
    // the points fly from the name to the total
    const fly = clamp((o.age - 0.75 - i * 0.05) / 0.7, 0, 1);
    const shown = r.score - r.add + (fly >= 1 ? r.add : 0);
    const sxTotal = x + pw - rowH * 0.5;
    label(ctx, String(shown), sxTotal, y + rowH * 0.52, rowH * 0.62, { align: 'right' });
    if (r.add > 0 && fly < 1) {
      const e = easeInOut(fly);
      const fx0 = x + pw * 0.55;
      const fx1 = sxTotal - rowH * 0.4;
      label(ctx, `+${r.add}`, fx0 + (fx1 - fx0) * e, y + rowH * 0.5 - Math.sin(e * Math.PI) * rowH * 0.5, rowH * 0.5, { fill: '#6dff9a' });
    } else if (r.add > 0 && o.age - 1.45 < 0.5) {
      label(ctx, `+${r.add}`, sxTotal - rowH * 1.2, y + rowH * 0.5, rowH * 0.46, { fill: '#6dff9a', alpha: clamp(1 - (o.age - 1.45) / 0.5, 0, 1) });
    }
  });
}

// ------------------------------------------------------------------ results
/**
 * The podium. `v` is a world view for the results scene (x = 0 is the middle, y = 0 the podium's floor).
 * o: { ranked: [{ id, name, ci, bot, head, score, place }] best first, you, age, awards: { hotFeet: name|null, skyHigh: name|null }, vis(id) -> char extras }
 */
export function drawPodium(ctx, v, W, H, u, o, now) {
  const heights = [2.1, 1.5, 1.05];
  const slots = [0, -2.4, 2.4];
  const order = [1, 2, 0]; // draw 2nd, 3rd, then 1st
  const bw = 2.2;
  const top3 = o.ranked.slice(0, 3);
  for (const idx of order) {
    const r = top3[idx];
    if (!r) continue;
    const x = slots[idx];
    const grow = easeOutCubic(clamp((o.age - (2 - idx) * 0.35) / 0.5, 0, 1));
    const hgt = heights[idx] * grow;
    const x0 = v.px(x - bw / 2);
    const y0 = v.py(hgt);
    const w = bw * v.S;
    const fill = idx === 0 ? '#ffd23f' : idx === 1 ? '#cfd8e3' : '#e29a5c';
    rr(ctx, x0, y0, w, Math.max(2, hgt * v.S), v.S * 0.12);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (grow > 0.7) {
      label(ctx, String(r.place), v.px(x), v.py(hgt * 0.62), v.S * 0.78, { fill: '#ffffff' });
      starIcon(ctx, v.px(x) - v.S * 0.38, v.py(hgt * 0.2), v.S * 0.17);
      label(ctx, String(r.score), v.px(x) + v.S * 0.06, v.py(hgt * 0.2), v.S * 0.36, { align: 'left' });
    }
    // the character stands on it and bounces
    if (grow > 0.98) {
      const t = o.age - (2 - idx) * 0.35 - 0.5;
      const hop = idx === 0 ? Math.abs(Math.sin(now * 5)) * 0.35 : Math.abs(Math.sin(now * 3.2 + idx)) * 0.12;
      const c = { x, y: heights[idx] + hop, ci: r.ci, bot: r.bot, seed: r.ci + (r.bot ? 3 : 0), head: r.head, name: r.name, o: hop < 0.02 ? 1 : 0, face: 1, run: 0, sq: hop < 0.03 ? -0.08 : 0.06, you: false, scale: 1.25 };
      drawChar(ctx, v, c, now);
      if (idx === 0) crown(ctx, v, x, heights[idx] + hop + 1.85, v.S);
      void t;
    }
  }
  // "You: 4th"
  const me = o.ranked.findIndex((r) => r.id === o.you);
  const y = Math.max(...heights) + 2.8;
  if (me > 2) {
    const text = `YOU: ${ordinal(o.ranked[me].place)}`;
    label(ctx, text, W / 2, v.py(-0.55), Math.max(28, v.S * 0.55), { fill: '#6dff9a' });
  }
  void y;
  // fun awards
  const chips = [];
  if (o.awards.hotFeet) chips.push({ kind: 'flame', title: 'HOT FEET', name: o.awards.hotFeet });
  if (o.awards.skyHigh) chips.push({ kind: 'balloon', title: 'SKY HIGH', name: o.awards.skyHigh });
  if (chips.length && o.age > 1.4) {
    const cw = clamp(200 * u, 150, 240);
    const ch = Math.max(52, 58 * u);
    const total = chips.length * cw + (chips.length - 1) * 12;
    chips.forEach((c, i) => {
      const x = W / 2 - total / 2 + i * (cw + 12);
      const pop = easeOutBack(clamp((o.age - 1.4 - i * 0.25) / 0.35, 0, 1));
      const yy = Math.max(70, 78 * u) - (1 - pop) * 40;
      ctx.save();
      ctx.translate(x + cw / 2, yy + ch / 2);
      ctx.scale(pop, pop);
      plate(ctx, -cw / 2, -ch / 2, cw, ch, '#3d2b52', ch * 0.3, 4);
      if (c.kind === 'flame') flame(ctx, -cw / 2 + ch * 0.5, 2, ch * 0.28, true);
      else balloonIcon(ctx, -cw / 2 + ch * 0.5, 2, ch * 0.34);
      label(ctx, c.title, ch * 0.2, -ch * 0.16, Math.max(14, ch * 0.3), { fill: GOLD, lw: 3 });
      label(ctx, c.name, ch * 0.2, ch * 0.2, Math.max(14, ch * 0.33), { lw: 3 });
      ctx.restore();
    });
  }
}

function crown(ctx, v, x, y, S) {
  const cx = v.px(x);
  const cy = v.py(y);
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.3, cy);
  ctx.lineTo(cx - S * 0.34, cy - S * 0.34);
  ctx.lineTo(cx - S * 0.15, cy - S * 0.16);
  ctx.lineTo(cx, cy - S * 0.42);
  ctx.lineTo(cx + S * 0.15, cy - S * 0.16);
  ctx.lineTo(cx + S * 0.34, cy - S * 0.34);
  ctx.lineTo(cx + S * 0.3, cy);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** A small floating panel behind the compact results card shown over the lobby. */
export function drawResultsPanel(ctx, W, H, u) {
  const pw = Math.min(W - 20, 560 * u);
  const ph = Math.min(H - 150, 340 * u);
  const x = W / 2 - pw / 2;
  const y = Math.max(8, (H - 90 - ph) / 2);
  plate(ctx, x, y, pw, ph, 'rgba(61,43,82,0.94)', 28, 6);
  return { x, y, w: pw, h: ph };
}
