// Badge icons and the store icon, drawn in the game's own brass-and-teal style on a 2D canvas.
const AMBER = '#f0a63a';
const TEAL = '#35b6a6';
const DEEP = '#0e2234';
const ABYSS = '#070c15';
const DANGER = '#d9432f';
const INK = '#e9e2d2';

function disc(ctx, s, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = s * 0.035;
  ctx.strokeStyle = '#7a4f16';
  ctx.stroke();
}

function lighthouse(ctx, s, x, y, h, lit = true) {
  const w = h * 0.22;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y);
  ctx.lineTo(x + w * 0.6, y);
  ctx.lineTo(x + w * 0.45, y - h * 0.78);
  ctx.lineTo(x - w * 0.45, y - h * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TEAL;
  ctx.fillRect(x - w * 0.52, y - h * 0.42, w * 1.04, h * 0.12);
  ctx.fillStyle = lit ? AMBER : '#5a4a2e';
  ctx.fillRect(x - w * 0.5, y - h * 0.95, w, h * 0.17);
  ctx.fillStyle = DEEP;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y - h * 0.95);
  ctx.lineTo(x + w * 0.6, y - h * 0.95);
  ctx.lineTo(x, y - h * 1.08);
  ctx.closePath();
  ctx.fill();
}

function beam(ctx, s, x, y, angle, len, spread, color = 'rgba(234,244,255,0.55)') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(234,244,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, -spread);
  ctx.lineTo(len, spread);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ship(ctx, s, x, y, w, color = INK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w * 0.35, y + w * 0.22);
  ctx.lineTo(x - w * 0.35, y + w * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - w * 0.15, y - w * 0.18, w * 0.3, w * 0.18);
  ctx.fillStyle = DANGER;
  ctx.fillRect(x - w * 0.5, y - w * 0.05, w * 0.08, w * 0.05);
  ctx.fillStyle = TEAL;
  ctx.fillRect(x + w * 0.42, y - w * 0.05, w * 0.08, w * 0.05);
}

function waves(ctx, s, y, color = TEAL) {
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.02;
  ctx.lineCap = 'round';
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    for (let x = s * 0.1; x <= s * 0.9; x += s * 0.02) {
      const yy = y + r * s * 0.07 + Math.sin(x / s * 20 + r) * s * 0.015;
      if (x === s * 0.1) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function text(ctx, s, str, y, color = AMBER, size = 0.16) {
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(s * size)}px Ledger, "Big Shoulders Stencil Display", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, s / 2, y);
}

export function drawBadge(ctx, s, id) {
  ctx.clearRect(0, 0, s, s);
  if (id === 'icon') {
    // The lens glowing amber on deep blue: rings of glass around a bright heart.
    ctx.fillStyle = ABYSS;
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#13304a');
    g.addColorStop(1, ABYSS);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    glow(ctx, s / 2, s / 2, s * 0.42, 'rgba(240,166,58,0.55)');
    for (let i = 5; i >= 1; i--) {
      ctx.strokeStyle = `rgba(191,233,226,${0.18 + i * 0.07})`;
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.08 * i + s * 0.05, s * 0.3 * (1 - i * 0.04), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    glow(ctx, s / 2, s / 2, s * 0.2, 'rgba(255,236,190,1)');
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  disc(ctx, s, DEEP);
  switch (id) {
    case 'first-light':
      lighthouse(ctx, s, s / 2, s * 0.78, s * 0.5);
      beam(ctx, s, s / 2, s * 0.31, -0.35, s * 0.42, s * 0.07);
      break;
    case 'safe-harbour':
      waves(ctx, s, s * 0.62);
      for (let i = 0; i < 3; i++) ship(ctx, s, s * (0.3 + i * 0.2), s * (0.38 + (i % 2) * 0.1), s * 0.16);
      text(ctx, s, '10', s * 0.8, AMBER, 0.2);
      break;
    case 'no-wrecks':
      waves(ctx, s, s * 0.6);
      ship(ctx, s, s / 2, s * 0.42, s * 0.3);
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'out-of-oil':
      ctx.fillStyle = AMBER;
      ctx.fillRect(s * 0.36, s * 0.3, s * 0.28, s * 0.4);
      ctx.fillStyle = DEEP;
      ctx.fillRect(s * 0.4, s * 0.34, s * 0.2, s * 0.28);
      ctx.fillStyle = AMBER;
      ctx.fillRect(s * 0.4, s * 0.58, s * 0.2, s * 0.04);
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.3, 0, Math.PI * 1.5);
      ctx.stroke();
      break;
    case 'siren-song':
      glow(ctx, s / 2, s * 0.42, s * 0.3, 'rgba(240,166,58,0.5)');
      ctx.fillStyle = TEAL;
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.4, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.4, s * 0.5);
      ctx.lineTo(s * 0.6, s * 0.5);
      ctx.lineTo(s * 0.55, s * 0.72);
      ctx.lineTo(s * 0.45, s * 0.72);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(53,182,166,${0.8 - i * 0.25})`;
        ctx.lineWidth = s * 0.02;
        ctx.beginPath();
        ctx.arc(s / 2, s * 0.4, s * (0.17 + i * 0.07), -0.6, 0.6);
        ctx.stroke();
      }
      break;
    case 'false-lights':
      for (const [x, c] of [[0.36, DANGER], [0.5, INK], [0.64, TEAL]]) {
        glow(ctx, s * x, s * 0.45, s * 0.12, c);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(s * x, s * 0.45, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#6fb6ff';
      ctx.lineWidth = s * 0.045;
      ctx.beginPath();
      ctx.moveTo(s * 0.3, s * 0.7);
      ctx.lineTo(s * 0.7, s * 0.3);
      ctx.stroke();
      break;
    case 'lightning-rod':
      lighthouse(ctx, s, s / 2, s * 0.82, s * 0.46);
      ctx.strokeStyle = '#dfeeff';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(s * 0.62, s * 0.12);
      ctx.lineTo(s * 0.5, s * 0.3);
      ctx.lineTo(s * 0.58, s * 0.3);
      ctx.lineTo(s * 0.5, s * 0.36);
      ctx.stroke();
      break;
    case 'titan-down':
      waves(ctx, s, s * 0.62);
      glow(ctx, s * 0.4, s * 0.4, s * 0.1, AMBER);
      glow(ctx, s * 0.6, s * 0.4, s * 0.1, AMBER);
      ctx.fillStyle = '#08141a';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.55, s * 0.26, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(s * 0.4, s * 0.42, s * 0.035, 0, Math.PI * 2);
      ctx.arc(s * 0.6, s * 0.42, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'twelve-nights':
      text(ctx, s, '12', s * 0.5, AMBER, 0.42);
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'storm-six':
      text(ctx, s, 'VI', s * 0.48, DANGER, 0.4);
      waves(ctx, s, s * 0.74, DANGER);
      break;
    case 'good-cat':
      ctx.fillStyle = '#3a2a24';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.56, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.34, s * 0.44);
      ctx.lineTo(s * 0.36, s * 0.26);
      ctx.lineTo(s * 0.46, s * 0.38);
      ctx.moveTo(s * 0.66, s * 0.44);
      ctx.lineTo(s * 0.64, s * 0.26);
      ctx.lineTo(s * 0.54, s * 0.38);
      ctx.fill();
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.ellipse(s * 0.43, s * 0.54, s * 0.035, s * 0.05, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.57, s * 0.54, s * 0.035, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = s * 0.03;
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.66, s * 0.16, 0.3, Math.PI - 0.3);
      ctx.stroke();
      break;
    default:
      lighthouse(ctx, s, s / 2, s * 0.78, s * 0.5);
  }
}
