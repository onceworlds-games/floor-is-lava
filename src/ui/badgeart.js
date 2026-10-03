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
    // The tower at night, its lamp burning amber and two beams thrown out over a dark sea.
    const bg = ctx.createRadialGradient(s * 0.5, s * 0.36, 0, s * 0.5, s * 0.45, s * 0.8);
    bg.addColorStop(0, '#16324a');
    bg.addColorStop(0.55, '#0b1a2a');
    bg.addColorStop(1, ABYSS);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x = ((i * 0.6180339) % 1) * s;
      const y = ((i * 0.4142135) % 1) * s * 0.55;
      ctx.fillStyle = `rgba(220,235,255,${0.25 + ((i * 7) % 5) * 0.08})`;
      ctx.fillRect(x, y, s * 0.006, s * 0.006);
    }
    const lx = s * 0.5;
    const ly = s * 0.3;
    // Beams first, so the tower stands in front of them.
    const ray = (dir, len, spread, a0) => {
      const g = ctx.createLinearGradient(lx, ly, lx + dir * len, ly + len * 0.12);
      g.addColorStop(0, `rgba(255,236,196,${a0})`);
      g.addColorStop(0.35, `rgba(226,240,255,${a0 * 0.55})`);
      g.addColorStop(1, 'rgba(226,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + dir * len, ly + len * 0.12 - spread);
      ctx.lineTo(lx + dir * len, ly + len * 0.12 + spread);
      ctx.closePath();
      ctx.fill();
    };
    ray(1, s * 0.46, s * 0.16, 0.95);
    ray(-1, s * 0.42, s * 0.1, 0.55);
    glow(ctx, lx, ly, s * 0.2, 'rgba(255,190,90,0.75)');
    // The sea and the rock.
    const sea = ctx.createLinearGradient(0, s * 0.74, 0, s);
    sea.addColorStop(0, '#0f3a44');
    sea.addColorStop(1, '#06151e');
    ctx.fillStyle = sea;
    ctx.fillRect(0, s * 0.74, s, s * 0.26);
    // The lamp's reflection: broken bars of light on the swell, straight down from it.
    for (let i = 0; i < 7; i++) {
      const w = s * (0.13 - i * 0.012) * (i % 2 ? 0.7 : 1);
      ctx.fillStyle = `rgba(255,214,150,${0.5 - i * 0.05})`;
      ctx.fillRect(lx - w / 2 + Math.sin(i * 2.1) * s * 0.02, s * 0.8 + i * s * 0.026, w, s * 0.009);
    }
    ctx.fillStyle = '#05090d';
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.8);
    ctx.lineTo(s * 0.36, s * 0.72);
    ctx.lineTo(s * 0.64, s * 0.72);
    ctx.lineTo(s * 0.71, s * 0.8);
    ctx.closePath();
    ctx.fill();
    // The tower: tapered, cream, two teal bands; the gallery; the glowing lamp room; the cap.
    const tw0 = s * 0.075;
    const tw1 = s * 0.11;
    const top = s * 0.375;
    const foot = s * 0.73;
    const tg = ctx.createLinearGradient(lx - tw1, 0, lx + tw1, 0);
    tg.addColorStop(0, '#8d8574');
    tg.addColorStop(0.45, '#efe4cc');
    tg.addColorStop(1, '#a89f8a');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(lx - tw1, foot);
    ctx.lineTo(lx + tw1, foot);
    ctx.lineTo(lx + tw0, top);
    ctx.lineTo(lx - tw0, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = TEAL;
    for (const f of [0.38, 0.7]) {
      const y = top + (foot - top) * f;
      const w = tw0 + (tw1 - tw0) * f;
      ctx.fillRect(lx - w - 1, y, w * 2 + 2, s * 0.04);
    }
    ctx.fillStyle = '#1b222a';
    ctx.fillRect(lx - s * 0.12, top - s * 0.012, s * 0.24, s * 0.03);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(lx - s * 0.06, top - s * 0.095, s * 0.12, s * 0.085);
    glow(ctx, lx, top - s * 0.05, s * 0.09, 'rgba(255,245,215,0.95)');
    ctx.strokeStyle = '#7a4f16';
    ctx.lineWidth = s * 0.008;
    for (const dx of [-0.03, 0, 0.03]) {
      ctx.beginPath();
      ctx.moveTo(lx + dx * s, top - s * 0.095);
      ctx.lineTo(lx + dx * s, top - s * 0.01);
      ctx.stroke();
    }
    ctx.fillStyle = '#16202a';
    ctx.beginPath();
    ctx.moveTo(lx - s * 0.08, top - s * 0.093);
    ctx.lineTo(lx + s * 0.08, top - s * 0.093);
    ctx.lineTo(lx, top - s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(lx, top - s * 0.165, s * 0.012, 0, Math.PI * 2);
    ctx.fill();
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
