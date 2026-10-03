// Store art, drawn by the game itself: ?poster=thumb1 | thumb2 | thumb3 | thumb4 | icon | badge-<id>.
// Deterministic scenes with no SDK and no network; scripts/store.mjs captures them.
import * as THREE from 'three';
import { View } from './render/view.js';
import { createNight, stepNight, addCrew, TICK } from './sim/night.js';
import { applyCommand } from './sim/verbs.js';
import { spawnShip } from './sim/ships.js';
import { spawnHostile } from './sim/hostiles.js';
import { LIGHT, setLens } from './render/shaders.js';
import { drawBadge } from './ui/badgeart.js';

const SEASON = { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: { lens: 2 }, relics: [], charter: null, almanacRead: [], rep: 70 };

function nightFor(weather, night = 6) {
  const st = createNight({ seed: 11, night, season: SEASON, weather });
  addCrew(st, 'me', 'lantern');
  applyCommand(st, { k: 'light' }, 'me');
  stepNight(st);
  return st;
}

function settle(st, seconds) {
  for (let i = 0; i < seconds * 20; i++) stepNight(st, TICK);
}

function spot(st, x, z, r, lens = 'white') {
  applyCommand(st, { k: 'mode', mode: 'spot' }, 'me');
  applyCommand(st, { k: 'lens', lens }, 'me');
  st.beam.lens = lens;
  st.beam.swapLeft = 0;
  st.beam.swapTo = null;
  applyCommand(st, { k: 'beam', az: Math.atan2(x, z), dist: Math.hypot(x, z), r }, 'me');
}

export async function runPoster(kind) {
  const canvas = document.getElementById('gl');
  document.getElementById('hud').style.display = 'none';
  if (kind.startsWith('badge-') || kind === 'icon') {
    canvas.style.display = 'none';
    const c = document.createElement('canvas');
    const size = kind === 'icon' ? 512 : 256;
    c.width = c.height = size;
    c.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;`;
    document.body.append(c);
    document.body.style.background = 'transparent';
    drawBadge(c.getContext('2d'), size, kind === 'icon' ? 'icon' : kind.slice(6));
    window.__posterReady = true;
    return;
  }
  const view = new View(canvas);
  view.gfx.setQuality('high');
  view.setSite('skerry-rock');
  const input = { yaw: 0, pitch: -0.04 };
  let st;
  let crew;
  let flashAt = -1;
  if (kind === 'thumb1') {
    // The beam cutting a squall: a ferry lit in the pool, a siren on her rock, the Drowned climbing.
    st = nightFor('squall');
    settle(st, 3);
    const ferry = spawnShip(st, { type: 'ferry', name: 'Hesper', d: 9 });
    ferry.s = 300;
    const smack = spawnShip(st, { type: 'smack', name: 'Petrel', d: -4 });
    smack.s = 390;
    spawnHostile(st, { type: 'siren', u: 0.55, side: 1, tell: 0 });
    spawnHostile(st, { type: 'drowned', n: 3, tell: 0 });
    settle(st, 1);
    for (const h of st.hostiles) h.st = h.type === 'siren' ? 'sing' : 'climb';
    ferry.guided = 6;
    ferry.seen = 1;
    const p = shipPosOf(st, ferry);
    spot(st, p.x, p.z, 14, 'amber');
    crew = st.crew.me;
    input.pitch = -0.08;
  } else if (kind === 'thumb2') {
    // Lightning over the tower, seen from the gallery.
    st = nightFor('thunder', 8);
    settle(st, 2);
    applyCommand(st, { k: 'station', st: 'gallery' }, 'me');
    settle(st, 3);
    const barge = spawnShip(st, { type: 'barge', name: 'Carrack Moll', d: 2 });
    barge.s = 240;
    barge.seen = 1;
    const p = shipPosOf(st, barge);
    st.crew.me.st = 'lantern';
    st.stations.lantern = 'me';
    spot(st, p.x, p.z, 18, 'white');
    st.crew.me.st = 'gallery';
    st.stations.gallery = 'me';
    st.pools.push({ id: 'f1', x: p.x - 40, z: p.z + 30, r: 28, I: 0.8, life: 12 });
    crew = st.crew.me;
    flashAt = 0.6;
    input.pitch = 0.08;
  } else if (kind === 'thumb3') {
    // The Kraken on the tower, harpoon line streaking, the hard white pool on it.
    st = nightFor('gale', 9);
    settle(st, 2);
    const k = spawnHostile(st, { type: 'kraken', tell: 0 });
    k.st = 'grip';
    k.x = 18;
    k.z = 22;
    const cutter = spawnShip(st, { type: 'cutter', name: 'Saltire', d: 5 });
    cutter.s = 330;
    cutter.seen = 1;
    spot(st, 18, 22, 8, 'white');
    st.shots.push({ id: 'p1', x: 18, z: 22, life: 0.35 });
    st.crew.me.st = 'gallery';
    st.stations.gallery = 'me';
    st.stations.lantern = null;
    crew = st.crew.me;
    input.pitch = -0.3;
    input.yaw = 0.15;
  } else {
    // The Tide-Wraith and false lights at the narrows; the blue lens on a mimic.
    st = nightFor('fog', 7);
    settle(st, 2);
    const w = spawnHostile(st, { type: 'wraith', u: 0.45, tell: 0 });
    w.st = 'move';
    const m = spawnHostile(st, { type: 'mimic', u: 0.6, side: -1, tell: 0 });
    m.st = 'halted';
    m.revealed = 1;
    const ferry = spawnShip(st, { type: 'ferry', name: 'Lisbet', d: -6 });
    ferry.s = 350;
    ferry.seen = 1;
    spot(st, m.x, m.z, 12, 'blue');
    crew = st.crew.me;
  }
  // Settle the renderer: a few frames so the camera eases into place, then say we're ready.
  let frames = 0;
  let t = 0;
  function frame() {
    const dt = 1 / 30;
    t += dt;
    stepNight(st, TICK);
    for (const h of st.hostiles) if (h.type === 'drowned') h.p = Math.min(h.p, 0.5);
    const fx = [];
    if (flashAt >= 0 && t > flashAt && t < flashAt + dt * 1.5) fx.push({ k: 'lightning', x: -60, z: 120, near: 1 });
    view.update(st, crew, input, dt, { fx, reducedMotion: true });
    if (flashAt >= 0 && t > flashAt) view.weather.flash = Math.max(view.weather.flash, 0.55);
    frames++;
    if (frames === 50) window.__posterReady = true;
    if (frames < 60) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

import { shipPosOf } from './sim/night.js';
export { THREE, LIGHT, setLens };
