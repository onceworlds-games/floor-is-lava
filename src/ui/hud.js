// The in-night HUD on a 2D canvas: brass dials, ammo, the night clock, the aim marker, the mini
// chart, labels and the stun veil. Crisp at any pixel ratio; keeps out of the platform's corners.
import { drawChart } from './chart.js';
import { settings, controls } from '../platform.js';
import { shipPos } from '../sim/route.js';
import { poolCentre } from '../sim/beam.js';
import { SHIPS } from '../sim/data/ships.js';
import { TITAN } from '../sim/hostiles.js';

const AMBER = '#f0a63a';
const TEAL = '#35b6a6';
const INK = '#e9e2d2';
const DANGER = '#d9432f';
const DIM = 'rgba(233,226,210,0.55)';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 1;
    this.h = 1;
    this.pr = 1;
    this.toasts = [];
    this.label = null;
    this.flashStun = 0;
    this.pops = []; // rings that burst where a ship turns Guided
    this.resize();
  }

  /** A ship just turned Guided: a ring bursts around it on screen. */
  pop(id) {
    if (this.pops.length < 8) this.pops.push({ id, t: 0 });
  }

  resize() {
    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
    this.pr = settings.pixelRatio(2);
    this.canvas.width = Math.round(this.w * this.pr);
    this.canvas.height = Math.round(this.h * this.pr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  toast(text, kind = '') {
    this.toasts.push({ text: String(text).slice(0, 40), kind, life: 2.4 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dial(x, y, r, value, label, color, warnBelow = -1, warnAbove = 101) {
    const c = this.ctx;
    const v = Math.max(0, Math.min(1, value / 100));
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    c.lineWidth = r * 0.22;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(122,79,22,0.55)';
    c.beginPath();
    c.arc(x, y, r, a0, a1);
    c.stroke();
    const warn = value < warnBelow || value > warnAbove;
    c.strokeStyle = warn ? DANGER : color;
    if (v > 0) {
      c.beginPath();
      c.arc(x, y, r, a0, a0 + (a1 - a0) * v);
      c.stroke();
    }
    c.fillStyle = warn ? DANGER : INK;
    c.font = `700 ${Math.round(r * 0.85)}px Ledger, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(Math.round(value)), x, y + r * 0.05);
    c.fillStyle = DIM;
    c.font = `500 ${Math.round(r * 0.44)}px Plain, sans-serif`;
    c.fillText(label, x, y + r * 1.25);
  }

  /**
   * state: night state; me: my crew record; view: for projection; opts: { aim: {x,z} | null, station, reload, scanLabel, hints }
   */
  draw(state, me, view, dt, opts = {}) {
    const c = this.ctx;
    this.clear();
    c.setTransform(this.pr, 0, 0, this.pr, 0, 0);
    const w = this.w;
    const h = this.h;
    const touch = controls.touch;
    const small = w < 520;
    const r = small ? 15 : 20;
    const top = small ? 92 : 64;
    // Dials along the top right: oil, power, heat, tower.
    const res = state.res;
    const dials = [
      [res.oil / res.oilMax * 100, 'OIL', AMBER, 12],
      [res.power, 'POWER', TEAL, 12],
      [state.beam.heat, 'HEAT', AMBER, -1, 84],
      [res.integ, 'TOWER', TEAL, 30],
    ];
    const gap = r * 2.9;
    let x = w - 16 - r - (dials.length - 1) * gap;
    for (const [v, label, color, lo, hi] of dials) {
      this.dial(x, top, r, v, label, color, lo, hi);
      x += gap;
    }
    // Reputation and coins under the dials.
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.font = `700 ${small ? 14 : 16}px Ledger, sans-serif`;
    c.fillStyle = res.rep < 20 ? DANGER : INK;
    c.fillText(`REPUTE ${Math.round(res.rep)}`, w - 16, top + r * 2.3);
    c.fillStyle = AMBER;
    c.fillText(`${state.res.coins + (opts.coins || 0)} COIN`, w - 16, top + r * 2.3 + (small ? 17 : 20));
    // The night clock: a thin bar across the top (under the platform buttons' row).
    const len = state.tl ? state.tl.len : 540;
    const prog = state.phase === 'dusk' ? 0 : Math.min(1, state.t / len);
    const bx = 150;
    const bw = w - 150 - (dials.length * gap + 40);
    if (bw > 80) {
      const by = 4;
      c.fillStyle = 'rgba(122,79,22,0.5)';
      c.fillRect(bx, by, bw, 3);
      c.fillStyle = state.phase === 'dusk' ? TEAL : AMBER;
      c.fillRect(bx, by, bw * prog, 3);
      if (state.mods.foreknowledge && state.tl) for (const ev of state.tl.events) {
        if (ev.kind === 'ship' || ev.kind === 'peak') continue;
        c.fillStyle = ev.t < state.t ? 'rgba(217,67,47,0.35)' : DANGER;
        c.fillRect(bx + bw * (ev.t / len) - 1, by - 3, 2, 9);
      }
      c.fillStyle = DIM;
      c.font = `500 11px Plain, sans-serif`;
      c.textAlign = 'left';
      const left = Math.max(0, len - state.t);
      c.fillText(state.phase === 'dusk' ? `DUSK ${Math.ceil(state.duskLeft)}` : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} TO DAWN`, bx, by + 18);
    }
    // Station ammo and holds, lower centre, above the touch controls' corners.
    const st = me ? me.st : null;
    const baseY = touch ? (h > 560 ? h - 150 : 118) : h - 44;
    c.textAlign = 'center';
    c.font = `700 ${small ? 15 : 18}px Ledger, sans-serif`;
    const line = (t, y, col = INK) => {
      c.fillStyle = col;
      c.fillText(t, w / 2, y);
    };
    if (me && me.move > 0) line('STAIRS', baseY, DIM);
    else if (me && me.stun > 0) line(`STRUCK ${Math.ceil(me.stun)}`, baseY, DANGER);
    else if (st === 'lantern') {
      const b = state.beam;
      const lens = b.swapLeft > 0 ? `${(b.swapTo || b.lens).toUpperCase()}…` : b.lens.toUpperCase();
      line(`${b.mode.toUpperCase()} · ${lens} · R ${Math.round(b.r)}${b.offline > 0 ? ' · LAMP OUT' : ''}${b.grit > 0.3 ? ' · GRIT' : ''}${b.lensInt < 100 ? ` · GLASS ${Math.round(b.lensInt)}%` : ''}`, baseY, b.offline > 0 ? DANGER : INK);
      if (res.spareLens > 0 && b.lensInt < 100) line(`SPARE LENS ×${res.spareLens}${touch ? '' : '  V'}`, baseY + 22, AMBER);
    } else if (st === 'gallery') {
      const rl = res.reload > 0 ? ` (${res.reload.toFixed(1)})` : '';
      line(`HARPOON ×${res.harpoons}${rl} · FLARE ×${res.flares}`, baseY, res.harpoons === 0 && res.flares === 0 ? DANGER : INK);
    } else if (st === 'watch') {
      const calls = state.ships.filter((s) => s.needs && (s.st === 'sail' || s.st === 'distress')).length;
      line(`AIR ${Math.round(res.air)} · ${state.gen.on ? 'GEN ON' : 'GEN OFF'}${calls ? ` · ${calls} CALLING` : ''}`, baseY, calls ? AMBER : INK);
    } else if (st === 'cellar') {
      line(`OIL CAN ×${res.oilCans} · ${state.flags.crateTaken ? 'CRATE TAKEN' : 'FLARE CRATE'}`, baseY, INK);
    }
    if (!touch && st && !(me && (me.move > 0 || me.stun > 0))) {
      c.font = `500 12px Plain, sans-serif`;
      const legend = {
        lantern: 'SPACE mode · 1-4 lens · SHIFT strobe · CTRL charge · WHEEL focus · E wipe · TAB station',
        gallery: 'CLICK harpoon · F flare · Z scan · E repair · TAB station',
        watch: 'R radio · H horn · G generator · Q crank · C chart · TAB station',
        cellar: 'O oil can · Q crank · E repair · F flare crate · TAB station',
      }[st];
      line(legend, baseY + 22, DIM);
    }
    // Aim marker on the water, and the harpoon lead.
    if (opts.aim && view) {
      const p = view.project(opts.aim.x, 0.5, opts.aim.z);
      if (p) {
        c.strokeStyle = st === 'gallery' ? 'rgba(233,226,210,0.9)' : 'rgba(240,166,58,0.8)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(p.x, p.y, st === 'gallery' ? 10 : 7, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(p.x - 14, p.y);
        c.lineTo(p.x - 4, p.y);
        c.moveTo(p.x + 4, p.y);
        c.lineTo(p.x + 14, p.y);
        c.stroke();
      }
    }
    // Labels on things: scanned names, hails, the guided mark, and the ring that fills while a ship is in the light.
    if (view) {
      c.font = `700 ${small ? 11 : 13}px Ledger, sans-serif`;
      c.textAlign = 'center';
      for (const ship of state.ships) {
        if (ship.st === 'saved' || ship.st === 'lost' || !ship.seen) continue;
        const sp = shipPos(state.route, ship.s, ship.d);
        const p = view.project(sp.x, 6, sp.z);
        if (!p || p.depth > 0.9995) continue;
        const d = Math.hypot(sp.x, sp.z);
        if (d > 320) continue;
        const guided = ship.guided > 0 && ship.st !== 'wreck';
        c.fillStyle = ship.st === 'wreck' ? DANGER : ship.st === 'distress' ? AMBER : guided ? TEAL : ship.needs ? AMBER : DIM;
        const tag = ship.st === 'wreck' ? 'WRECK' : ship.st === 'distress' ? `ENGINE OUT ${Math.max(0, Math.ceil(ship.distressLeft || 0))}` : guided ? 'GUIDED' : ship.needs ? 'DRIFTING' : '';
        c.fillText(`${ship.name.toUpperCase()}${tag ? ' · ' + tag : ''}`, p.x, p.y);
        // The guidance ring: fills while the light holds the ship, closes and glows once it is Guided.
        const ring = view.project(sp.x, 1.5, sp.z);
        if (ring && ship.st !== 'wreck' && (ship.credit > 0.05 || guided)) {
          const rr = small ? 13 : 16;
          c.lineWidth = 3;
          c.strokeStyle = 'rgba(53,182,166,0.25)';
          c.beginPath();
          c.arc(ring.x, ring.y + rr * 0.8, rr, 0, Math.PI * 2);
          c.stroke();
          c.strokeStyle = TEAL;
          c.beginPath();
          const k = guided ? Math.min(1, ship.guided / 6) : Math.min(1, ship.credit / 1.5);
          c.arc(ring.x, ring.y + rr * 0.8, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          c.stroke();
        }
      }
      // Rings that burst where a ship just turned Guided.
      for (let i = this.pops.length - 1; i >= 0; i--) {
        const pp = this.pops[i];
        pp.t += dt;
        const ship = state.ships.find((x) => x.id === pp.id);
        if (pp.t > 0.6 || !ship) {
          this.pops.splice(i, 1);
          continue;
        }
        const sp = shipPos(state.route, ship.s, ship.d);
        const q = view.project(sp.x, 1.5, sp.z);
        if (!q) continue;
        const e = 1 - (1 - pp.t / 0.6) ** 3;
        c.strokeStyle = `rgba(53,182,166,${(1 - pp.t / 0.6).toFixed(3)})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(q.x, q.y + 13, 16 + e * 34, 0, Math.PI * 2);
        c.stroke();
      }
      for (const hst of state.hostiles) {
        if (hst.st === 'gone' || hst.st === 'tell' || hst.type === 'moths' || hst.type === 'wraith') continue;
        if (!(hst.scanned || hst.labelled || hst.revealed || hst.litFor > 0.5 || hst.type === 'kraken' || hst.type === 'titan')) continue;
        const p = view.project(hst.x, 6, hst.z);
        if (!p || p.depth > 0.9995) continue;
        c.fillStyle = DANGER;
        c.fillText(hst.type === 'mimic' ? 'FALSE LIGHTS' : hst.type === 'drowned' ? `DROWNED ×${hst.n}` : hst.type.toUpperCase(), p.x, p.y);
      }
    }
    // The Tide Titan: which face, what it wants, how far along, and the face's clock.
    const titan = state.hostiles.find((x) => x.type === 'titan' && x.st === 'fight');
    if (titan) this.titanBar(titan, w, small);
    // Scan readout at the gallery.
    if (opts.scanLabel) {
      c.font = `700 ${small ? 14 : 16}px Ledger, sans-serif`;
      c.fillStyle = TEAL;
      c.textAlign = 'center';
      c.fillText(opts.scanLabel, w / 2, h * 0.42);
    }
    // Mini chart at the right edge (above the touch buttons).
    const cs = small ? 96 : 130;
    const cx = w - cs - 12;
    const cy = top + r * 2.3 + (small ? 30 : 36);
    if (!opts.bigChart && h > cy + cs + (touch ? 150 : 40)) {
      c.save();
      c.translate(cx, cy);
      c.globalAlpha = 0.9;
      drawChart(c, cs, state, { radar: state.mods.radar, labels: false, zoom: 1 });
      c.restore();
      c.strokeStyle = 'rgba(122,79,22,0.9)';
      c.lineWidth = 2;
      c.strokeRect(cx, cy, cs, cs);
    }
    // Grit on the glass.
    if (state.beam.grit > 0.05 && st === 'lantern') {
      c.fillStyle = `rgba(20,16,10,${0.55 * state.beam.grit})`;
      for (let i = 0; i < 70; i++) {
        const gx = ((i * 7919) % 1000) / 1000 * w;
        const gy = ((i * 104729) % 1000) / 1000 * h;
        const gs = 2 + ((i * 31) % 9);
        c.beginPath();
        c.ellipse(gx, gy, gs, gs * 0.7, i, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Stun veil.
    if (me && me.stun > 0) {
      c.fillStyle = `rgba(0,0,0,${0.35 + 0.1 * Math.sin(state.t * 20)})`;
      c.fillRect(0, 0, w, h);
    }
    // Toasts.
    let ty = h * 0.3;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.toasts.splice(i, 1);
        continue;
      }
      c.globalAlpha = Math.min(1, t.life / 0.4);
      c.font = `900 ${small ? 24 : 32}px Ledger, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = t.kind === 'bad' ? DANGER : t.kind === 'good' ? TEAL : AMBER;
      c.shadowColor = 'rgba(0,0,0,0.8)';
      c.shadowBlur = 8;
      c.fillText(t.text.toUpperCase(), w / 2, ty);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
      ty -= small ? 30 : 40;
    }
  }
}

Hud.prototype.titanBar = function titanBar(t, w, small) {
  const c = this.ctx;
  const bw = Math.min(small ? 220 : 340, w - 40);
  const x = (w - bw) / 2;
  const y = small ? 62 : 66;
  const face = t.phase === 1 ? 'EYES' : t.phase === 2 ? 'ARMS' : 'MAW';
  const want = t.phase === 1 ? 'HARD WHITE LIGHT' : t.phase === 2 ? `HARPOONS ${Math.min(TITAN.hits, Math.floor(t.hit))}/${TITAN.hits}` : `HORN ${Math.min(TITAN.blasts, t.blasts)}/${TITAN.blasts} · FLARES ${Math.min(TITAN.lures, t.flares)}/${TITAN.lures}`;
  const k = t.phase === 1 ? t.lightAcc / TITAN.eyes : t.phase === 2 ? t.hit / TITAN.hits : (Math.min(TITAN.blasts, t.blasts) + Math.min(TITAN.lures, t.flares)) / (TITAN.blasts + TITAN.lures);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = `900 ${small ? 13 : 15}px Ledger, sans-serif`;
  c.fillStyle = DANGER;
  c.fillText(`THE TIDE TITAN · ${face}`, w / 2, y);
  c.fillStyle = 'rgba(7,12,21,0.75)';
  c.fillRect(x, y + 6, bw, 8);
  c.fillStyle = AMBER;
  c.fillRect(x, y + 6, bw * Math.max(0, Math.min(1, k)), 8);
  c.strokeStyle = 'rgba(122,79,22,0.9)';
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 6.5, bw - 1, 7);
  // The face's clock runs down under the bar: when it empties, the Titan slams the tower.
  c.fillStyle = 'rgba(217,67,47,0.85)';
  c.fillRect(x, y + 16, bw * Math.max(0, Math.min(1, t.phaseLeft / TITAN.face)), 2);
  c.font = `700 ${small ? 11 : 12}px Plain, sans-serif`;
  c.fillStyle = INK;
  c.fillText(want, w / 2, y + 32);
};

export { drawChart, SHIPS, poolCentre };
