// The chart: a top-down plan of the channel with the reefs, the safe line, known ships and creatures.
// Drawn on the chart table, in the HUD corner and in the big chart overlay with the same code.
import { routeAt, reefPoints, shipPos, SEA_R } from '../sim/route.js';
import { SHIPS } from '../sim/data/ships.js';

const SHORT = { smack: 'Smack', ferry: 'Ferry', barge: 'Barge', cutter: 'Cutter', skiff: 'Skiff' };

/**
 * ctx: 2D context; size: px (square); state: night state (hydrated); opts: { big, radar, labels, hostiles, beam, scale }
 */
export function drawChart(ctx, size, state, opts = {}) {
  const route = state.route;
  const scale = (size / 2 / SEA_R) * (opts.zoom || 1);
  const cx = size / 2;
  const cz = size / 2;
  const X = (x) => cx + x * scale;
  const Z = (z) => cz - z * scale;
  ctx.save();
  ctx.fillStyle = opts.paper ? '#d8c9a3' : '#0a1a26';
  ctx.fillRect(0, 0, size, size);
  // Depth rings and the compass.
  ctx.strokeStyle = opts.paper ? 'rgba(70,50,20,0.25)' : 'rgba(53,182,166,0.14)';
  ctx.lineWidth = 1;
  for (const r of [100, 200, 300, 400]) {
    ctx.beginPath();
    ctx.arc(cx, cz, r * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The reefs.
  const rockCol = opts.paper ? '#5a4a2e' : '#3b4f52';
  ctx.fillStyle = rockCol;
  for (const side of [-1, 1]) for (const p of reefPoints(route, side, 10)) {
    ctx.beginPath();
    ctx.arc(X(p.x), Z(p.z), Math.max(1.2, 3 * scale * 2.2), 0, Math.PI * 2);
    ctx.fill();
  }
  // The safe line.
  ctx.strokeStyle = opts.paper ? 'rgba(30,110,100,0.8)' : 'rgba(53,182,166,0.55)';
  ctx.lineWidth = Math.max(1, size / 220);
  ctx.setLineDash([size / 60, size / 90]);
  ctx.beginPath();
  for (let s = 0; s <= route.L; s += 8) {
    const p = routeAt(route, s);
    if (s === 0) ctx.moveTo(X(p.x), Z(p.z));
    else ctx.lineTo(X(p.x), Z(p.z));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Harbour and entrance.
  const end = routeAt(route, route.L);
  ctx.fillStyle = '#f0a63a';
  ctx.font = `${Math.max(8, size / 30)}px Ledger, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('HARBOUR', X(end.x), Z(end.z) + size / 26);
  const start = routeAt(route, 0);
  ctx.fillStyle = opts.paper ? '#5a4a2e' : '#a79f8c';
  ctx.fillText('N', X(start.x), Z(start.z) - size / 60);
  // Fog banks.
  for (const h of state.hostiles) {
    if (h.type !== 'wraith' || h.st === 'gone' || h.st === 'tell') continue;
    ctx.fillStyle = 'rgba(140,160,170,0.35)';
    ctx.beginPath();
    ctx.arc(X(h.x), Z(h.z), h.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  // The beam: the pool, or the sweep wedge.
  if (opts.beam !== false && state.phase === 'night') {
    const b = state.beam;
    if (b.mode === 'spot') {
      ctx.fillStyle = 'rgba(240,220,160,0.22)';
      ctx.beginPath();
      ctx.arc(X(Math.sin(b.az) * b.dist), Z(Math.cos(b.az) * b.dist), Math.max(2, b.r * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,220,160,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx, cz);
      ctx.lineTo(X(Math.sin(b.az) * b.dist), Z(Math.cos(b.az) * b.dist));
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(240,220,160,0.16)';
      ctx.beginPath();
      ctx.moveTo(cx, cz);
      ctx.arc(cx, cz, 300 * scale, -Math.PI / 2 + b.sweepAz - 0.21, -Math.PI / 2 + b.sweepAz + 0.21);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of state.pools) {
      ctx.fillStyle = 'rgba(255,180,100,0.3)';
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), p.r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Ships: known ones (lit, scanned or on radar) as arrows with their state.
  for (const ship of state.ships) {
    if (ship.st === 'saved' || ship.st === 'lost') continue;
    const known = ship.seen || opts.radar || state.mods.brightShips;
    if (!known) continue;
    if (ship.hidden && !opts.radar) continue;
    const p = shipPos(route, ship.s, ship.d);
    const x = X(p.x);
    const z = Z(p.z);
    const col = ship.st === 'wreck' ? '#d9432f' : ship.needs ? '#f0a63a' : ship.guided > 0 ? '#35b6a6' : '#e9e2d2';
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(p.h);
    const s = Math.max(3, size / 70);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.6, s * 0.7);
    ctx.lineTo(-s * 0.6, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (opts.labels) {
      ctx.fillStyle = col;
      ctx.font = `${Math.max(9, size / 34)}px Plain, sans-serif`;
      ctx.textAlign = 'left';
      const tag = ship.special === 'grain' ? 'MARRAM' : ship.special === 'skiff' ? 'SKIFF' : SHORT[ship.type] || ship.type;
      ctx.fillText(`${tag}${ship.st === 'distress' ? ' · ENGINE' : ship.order ? ` · ${ship.order.toUpperCase()}` : ''}`, x + s + 3, z + 4);
    }
  }
  // Hostile things, once seen (lit for a moment or scanned); mimics look like ships until named.
  for (const h of state.hostiles) {
    if (h.st === 'gone' || h.type === 'moths' || h.type === 'wraith') continue;
    const known = h.litFor > 0 || h.scanned || h.labelled || h.revealed || opts.radar || h.type === 'kraken' || h.type === 'titan' || h.st === 'tell';
    if (!known) continue;
    const x = X(h.x);
    const z = Z(h.z);
    const s = Math.max(3, size / 64);
    if (h.type === 'mimic' && !h.labelled && !h.revealed) {
      ctx.fillStyle = '#e9e2d2';
      ctx.beginPath();
      ctx.arc(x, z, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.strokeStyle = h.st === 'tell' ? 'rgba(217,67,47,0.6)' : '#d9432f';
    ctx.lineWidth = Math.max(1.5, size / 200);
    ctx.beginPath();
    if (h.type === 'drowned') {
      ctx.moveTo(x - s, z + s);
      ctx.lineTo(x, z - s);
      ctx.lineTo(x + s, z + s);
      ctx.closePath();
    } else if (h.type === 'siren') {
      ctx.arc(x, z, s, 0, Math.PI * 2);
      ctx.moveTo(x - s, z);
      ctx.lineTo(x + s, z);
    } else if (h.type === 'mimic') {
      ctx.moveTo(x - s, z - s);
      ctx.lineTo(x + s, z + s);
      ctx.moveTo(x + s, z - s);
      ctx.lineTo(x - s, z + s);
    } else {
      ctx.rect(x - s, z - s, s * 2, s * 2);
    }
    ctx.stroke();
    if (opts.labels) {
      ctx.fillStyle = '#d9432f';
      ctx.font = `${Math.max(9, size / 34)}px Plain, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(h.type === 'mimic' ? 'FALSE LIGHTS' : h.type.toUpperCase(), x + s + 3, z + 4);
    }
  }
  // Crates.
  ctx.fillStyle = '#f0a63a';
  for (const c of state.crates) ctx.fillRect(X(c.x) - 2, Z(c.z) - 2, 4, 4);
  // The tower.
  ctx.fillStyle = '#f0a63a';
  ctx.beginPath();
  ctx.arc(cx, cz, Math.max(3, size / 60), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
