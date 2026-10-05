// Store art, drawn by the game itself: `?poster=cover|action|win|icon|badge-<id>` skips the room and the SDK, sizes the canvas to the
// poster's exact size (one CSS pixel per canvas pixel), draws ONE staged, frozen frame with the real renderer and sets
// `document.body.dataset.ready = '1'`. Everything is fixed (seeds, positions), so the same poster comes out every time.

import { TAU } from './rules.js';
import { generateTower } from './tower.js';
import { makeWorld } from './sim.js';
import { Fx, popupLook } from './fx.js';
import { makeView, drawWorldBack, drawGoalFront, drawLava, drawChar, drawPlatform, label, rr, INK } from './draw.js';
import { bigText, flame } from './ui.js';

const SIZES = { cover: [1280, 720], action: [1280, 720], win: [1280, 720], icon: [512, 512] };

export async function runPoster(name) {
  const [W, H] = name.startsWith('badge-') ? [256, 256] : (SIZES[name] ?? [1280, 720]);
  const canvas = document.getElementById('game') ?? document.body.appendChild(document.createElement('canvas'));
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  try {
    await document.fonts.load('48px Bangers');
    await document.fonts.ready;
  } catch {
    // the fallback font draws instead
  }
  const fx = new Fx();
  fx.quality = 2;
  fx.seed(2026);
  if (name === 'cover') cover(ctx, fx, W, H);
  else if (name === 'action') action(ctx, fx, W, H);
  else if (name === 'win') win(ctx, fx, W, H);
  else if (name === 'icon') icon(ctx, fx, W, H);
  else if (name.startsWith('badge-')) badge(ctx, name.slice(6), W, H);
  else cover(ctx, fx, W, H);
  document.body.dataset.ready = '1';
}

// ------------------------------------------------------------------ helpers
function viewFor(W, H, S, camX, camY) {
  const v = makeView();
  v.W = W;
  v.H = H;
  v.S = S;
  v.camX = camX;
  v.camY = camY;
  v.ol = Math.max(2.5, Math.min(4.5, S * 0.1));
  return v;
}

function ch(ci, x, y, o = {}) {
  return { x, y, ci, bot: true, seed: ci % 6, head: null, name: '', alpha: 1, sq: 0, face: 1, run: 0, o: 1, ghost: false, hot: false, you: false, ring: false, ready: false, readyPop: 1, scale: 1, ...o };
}

function popups(ctx, fx, v) {
  for (const p of fx.pops) {
    const lk = popupLook(p, v);
    if (!lk) continue;
    ctx.globalAlpha = lk.alpha;
    label(ctx, p.text, lk.x, lk.y, p.size * lk.scale, { fill: p.color });
  }
  ctx.globalAlpha = 1;
}

/** Let the particles live a moment so the frame is mid-action, then freeze it. */
function age(fx, seconds) {
  for (let t = 0; t < seconds; t += 0.04) fx.update(0.04, 0);
}

function bubbles(fx, level, x0, x1, n) {
  for (let i = 0; i < n; i++) fx.bubble(fx.r(x0, x1), level - fx.r(0.1, 1.6), level);
}

// ------------------------------------------------------------------ cover: the tower, six climbers, the title
function cover(ctx, fx, W, H) {
  const tower = generateTower(21, { width: 24, height: 14.5 });
  const world = makeWorld(tower, { floorUntil: 4 });
  const v = viewFor(W, H, 31, 3.6, -1.8);
  const t = 20;
  const L = 0.45;
  drawWorldBack(ctx, v, world, t, 1.3, 0);
  const rows = new Map();
  for (const p of tower.platforms) if (p.kind === 'static') rows.set(p.row, [...(rows.get(p.row) ?? []), p]);
  const pick = (row, k) => {
    const list = (rows.get(row) ?? []).sort((a, b) => a.x - b.x);
    return list[k % list.length];
  };
  const list = [];
  const spots = [
    [0, 2, 1, {}],
    [1, 0, 4, { o: 0, sq: 0.3, y: 1.15 }],
    [2, 1, 6, { run: 1.4, face: -1 }],
    [3, 2, 3, {}],
    [4, 0, 8, { o: 0, sq: 0.25, y: 1.0, face: -1 }],
    [5, 1, 0, { run: 0.6 }],
    [6, 0, 5, { face: -1 }],
  ];
  for (const [row, k, ci, o] of spots) {
    const p = pick(row, k);
    if (!p) continue;
    const { y: lift = 0, ...rest } = o;
    list.push(ch(ci, p.x + (k - 1) * Math.min(0.5, p.w * 0.12), p.y + lift, { scale: 1.9, ...rest }));
  }
  list.sort((a, b) => a.y - b.y);
  for (const c of list) drawChar(ctx, v, c, 1.3);
  // two already in the balloon, cheering
  const goal = world.platforms[world.goal];
  drawChar(ctx, v, ch(2, goal.x - 0.5, goal.y - 0.35, { scale: 1.5, o: 0, sq: 0.2 }), 1.3);
  drawChar(ctx, v, ch(9, goal.x + 0.55, goal.y - 0.15, { scale: 1.5, o: 1, face: -1 }), 1.3);
  drawGoalFront(ctx, v, world, 1.3, 0, false);
  // a ghost rising out of the lava
  drawChar(ctx, v, ch(7, 7.5, 2.9, { ghost: true, alpha: 0.6, scale: 1.8 }), 1.3);
  bubbles(fx, L, -2, 24, 34);
  fx.sparks(9, L + 0.3, 14, '#ffd23f', 3);
  fx.sparks(15, L + 0.3, 10, '#ffb43b', 3);
  age(fx, 0.28);
  drawLava(ctx, v, L, 1.3);
  fx.draw(ctx, v);
  // the name, big, over the dark curtain on the left
  label(ctx, 'THE FLOOR IS', 285, 92, 78);
  bigText(ctx, 'LAVA', 285, 240, 228, '#ffb020', '#c8321a');
}

// ------------------------------------------------------------------ action: a leap from a couch to a bookshelf, the lava just below
function action(ctx, fx, W, H) {
  const platforms = [
    { i: 0, kind: 'floor', f: 'floor', x: 7, y: 0, w: 18, c: 0, row: -1 },
    { i: 1, kind: 'static', f: 'couch', x: 3.7, y: 2.7, w: 4.2, c: 1, row: 0 },
    { i: 2, kind: 'static', f: 'shelf', x: 11.1, y: 3.8, w: 3.6, c: 0, row: 1 },
  ];
  const world = makeWorld({ w: 14, lobby: false, goal: -1, goalY: 40, platforms }, { floorUntil: 0 });
  const v = viewFor(W, H, 88, 7.3, -0.5);
  const t = 10;
  const L = 2.15;
  drawWorldBack(ctx, v, world, t, 2.2, 0);
  drawChar(ctx, v, ch(5, 2.2, 2.7, { face: 1, sq: -0.1, scale: 1.3 }), 2.2);
  drawChar(ctx, v, ch(3, 11.7, 3.8, { o: 0, sq: 0.2, face: -1, scale: 1.3 }), 2.2);
  // the hero, mid-leap, stretched, with speed lines behind
  const hx = 7.35;
  const hy = 4.35;
  for (const [dx, dy, len] of [[-0.9, 0.55, 1.1], [-1.1, 0.2, 1.5], [-0.7, -0.15, 1.0], [-1.0, 0.85, 0.8]]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v.px(hx + dx), v.py(hy + dy));
    ctx.lineTo(v.px(hx + dx - len), v.py(hy + dy - 0.05));
    ctx.stroke();
  }
  drawChar(ctx, v, ch(0, hx, hy, { o: 0, sq: 0.3, face: 1, scale: 1.45, run: 0.5 }), 2.2);
  fx.dust(5.9, 2.7, 6, 1.6, 1);
  bubbles(fx, L, 0.5, 13.5, 16);
  fx.sparks(8.5, L + 0.2, 14, '#ffd23f', 4);
  fx.sparks(4, L + 0.2, 8, '#ffb43b', 3);
  age(fx, 0.2);
  drawLava(ctx, v, L, 2.2);
  fx.draw(ctx, v);
}

// ------------------------------------------------------------------ win: the basket full of cheering characters, lifting off
function win(ctx, fx, W, H) {
  const tower = generateTower(33, { width: 14, height: 14.5 });
  const world = makeWorld(tower, { floorUntil: 4 });
  const dy = 5;
  const goal = world.platforms[world.goal];
  const v = viewFor(W, H, 52, goal.x, goal.y - 1.95);
  drawWorldBack(ctx, v, world, 30, 3.1, dy);
  const cast = [3, 0, 1, 5, 2, 4, 6, 8];
  const list = cast.map((ci, slot) => {
    const row = Math.floor(slot / 4);
    const col = slot % 4;
    const hop = [0.45, 0.1, 0.6, 0.2, 0.35, 0.7, 0.15, 0.5][slot];
    return ch(ci, goal.x - 1.05 + col * 0.7 + (row % 2) * 0.3, goal.y - 0.4 + row * 0.42 + dy + hop, { scale: 1.25, o: hop < 0.12 ? 1 : 0, sq: hop < 0.12 ? 0 : 0.2, face: col < 2 ? 1 : -1 });
  });
  list.sort((a, b) => b.y - a.y);
  for (const c of list) drawChar(ctx, v, c, 3.1);
  drawGoalFront(ctx, v, world, 3.1, dy, false);
  fx.confetti(goal.x, goal.y + dy + 2.5, 170, 8, 9);
  fx.confetti(goal.x - 3, goal.y + dy + 0.5, 50, 5, 7);
  fx.confetti(goal.x + 3, goal.y + dy + 0.5, 50, 5, 7);
  age(fx, 0.75);
  fx.draw(ctx, v);
  // the places, the only words
  fx.popup(goal.x - 0.35, goal.y + dy + 2.5, '1st', '#ffd23f', 64);
  fx.popup(goal.x - 2.3, goal.y + dy + 2.0, '2nd', '#ffffff', 48);
  fx.popup(goal.x + 1.9, goal.y + dy + 1.9, '3rd', '#ffd1a1', 48);
  for (const p of fx.pops) {
    p.life = p.max * 0.6;
    p.y -= 0.1;
  }
  popups(ctx, fx, v);
}

// ------------------------------------------------------------------ icon: one character on a stack of pillows above the lava
function icon(ctx, fx, W, H) {
  ctx.fillStyle = '#ff9a2a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffb347';
  for (let k = 0; k < 14; k++) {
    const a = (k * Math.PI) / 7;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.42);
    ctx.lineTo(W / 2 + Math.cos(a) * W, H * 0.42 + Math.sin(a) * W);
    ctx.lineTo(W / 2 + Math.cos(a + 0.2) * W, H * 0.42 + Math.sin(a + 0.2) * W);
    ctx.closePath();
    ctx.fill();
  }
  const platforms = [
    { i: 0, kind: 'floor', f: 'floor', x: 0, y: 0, w: 18, c: 0, row: -1 },
    { i: 1, kind: 'crumble', f: 'pillows', x: 0, y: 2.0, w: 2.4, c: 1, row: 0 },
  ];
  const world = makeWorld({ w: 14, lobby: false, goal: -1, goalY: 40, platforms }, { floorUntil: 0 });
  const v = viewFor(W, H, 120, 0, -0.3);
  drawPlatform(ctx, v, world, platforms[1], 0, 0);
  drawChar(ctx, v, ch(3, 0, 2.0, { scale: 1.2, sq: -0.04 }), 0);
  bubbles(fx, 0.4, -2.1, 2.1, 12);
  fx.sparks(-1.2, 0.7, 5, '#ffd23f', 2);
  fx.sparks(1.3, 0.7, 5, '#ffd23f', 2);
  age(fx, 0.18);
  drawLava(ctx, v, 0.4, 1.2);
  fx.draw(ctx, v);
}

// ------------------------------------------------------------------ badges: one bold symbol on a coloured circle, no words
function badge(ctx, id, W, H) {
  ctx.clearRect(0, 0, W, H);
  document.body.style.background = 'transparent';
  const colors = { 'first-win': '#7a4dff', 'hot-feet': '#ff5a2a', 'first-up': '#2e8cff', climber: '#2fd16b' };
  const cx = W / 2;
  const cy = H / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.46, 0, TAU);
  ctx.fillStyle = colors[id] ?? '#ffb020';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.385, 0, TAU);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  const poly = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  if (id === 'first-win') {
    // a crown
    poly([[-58, 30], [-66, -34], [-30, -4], [0, -52], [30, -4], [66, -34], [58, 30]], '#ffd23f');
    rr(ctx, -60, 30, 120, 26, 8);
    ctx.fillStyle = '#ffb020';
    ctx.fill();
    ctx.stroke();
    for (const [x, y, c] of [[-66, -36, '#ff4d4d'], [0, -54, '#3ddc84'], [66, -36, '#2ea6ff']]) {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'hot-feet') {
    // a sneaker on fire
    ctx.scale(1.5, 1.5);
    flame(ctx, 0, -6, 46, true);
    ctx.lineWidth = 6;
    poly([[-44, 22], [-44, -2], [-36, -26], [-14, -30], [-6, -12], [14, -6], [44, 8], [44, 22]], '#ffffff');
    rr(ctx, -48, 20, 98, 14, 7);
    ctx.fillStyle = '#ff4d4d';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(8, 2);
    ctx.moveTo(-16, -14);
    ctx.lineTo(0, -8);
    ctx.stroke();
  } else if (id === 'first-up') {
    // a balloon with a 1
    ctx.beginPath();
    ctx.ellipse(0, -14, 54, 64, 0, 0, TAU);
    ctx.fillStyle = '#ff4d4d';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-24, -40, 10, 18, -0.5, 0, TAU);
    ctx.fill();
    poly([[-4, 50], [4, 50], [8, 60], [-8, 60]], '#ff4d4d');
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.quadraticCurveTo(14, 76, -4, 92);
    ctx.stroke();
    poly([[-4, -48], [12, -48], [12, 20], [-6, 20], [-6, -30], [-20, -26], [-20, -38]], '#ffffff');
  } else if (id === 'climber') {
    // a ladder
    ctx.rotate(0.12);
    for (const rung of [-54, -18, 18, 54]) {
      ctx.beginPath();
      ctx.moveTo(-32, rung);
      ctx.lineTo(32, rung);
      ctx.lineWidth = 22;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 11;
      ctx.strokeStyle = '#e2a863';
      ctx.stroke();
    }
    for (const x of [-34, 34]) {
      ctx.beginPath();
      ctx.moveTo(x, -84);
      ctx.lineTo(x, 84);
      ctx.lineWidth = 26;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#c68642';
      ctx.stroke();
    }
  } else {
    poly([[0, -60], [18, -18], [60, -14], [28, 14], [38, 58], [0, 36], [-38, 58], [-28, 14], [-60, -14], [-18, -18]], '#ffd23f');
  }
  ctx.restore();
}
