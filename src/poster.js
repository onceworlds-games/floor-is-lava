// Store art, drawn by the game itself: ?poster=thumb1 | thumb2 | thumb3 | thumb4 | icon | badge-<id>.
// Deterministic scenes with no SDK and no network; scripts/store.mjs captures them.
import { View } from './render/view.js';
import { createNight, stepNight, addCrew, TICK, shipPosOf } from './sim/night.js';
import { applyCommand } from './sim/verbs.js';
import { spawnShip } from './sim/ships.js';
import { spawnHostile } from './sim/hostiles.js';
import { drawBadge } from './ui/badgeart.js';

const SEASON = { keeper: 'ismay', site: 'skerry-rock', asc: 0, upgrades: { lens: 2, cat: 1 }, relics: [], charter: null, almanacRead: [], rep: 70 };

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
  st.beam.mode = 'spot';
  st.beam.lens = lens;
  st.beam.swapLeft = 0;
  st.beam.swapTo = null;
  st.beam.az = Math.atan2(x, z);
  st.beam.dist = Math.hypot(x, z);
  st.beam.r = r;
}

function stand(st, station) {
  const c = st.crew.me;
  for (const k of Object.keys(st.stations)) if (st.stations[k] === 'me') st.stations[k] = null;
  c.st = station;
  c.move = 0;
  c.to = null;
  st.stations[station] = 'me';
}

/** Puts a ship on the route so that it sits `dist` metres from the tower, near the aim azimuth. */
function shipAt(st, type, name, dist, d = 4) {
  const ship = spawnShip(st, { type, name, d });
  let best = 0;
  let bd = Infinity;
  for (let s = 0; s < st.route.L; s += 4) {
    ship.s = s;
    const p = shipPosOf(st, ship);
    const err = Math.abs(Math.hypot(p.x, p.z) - dist);
    if (err < bd) {
      bd = err;
      best = s;
    }
  }
  ship.s = best;
  ship.seen = 1;
  return ship;
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
  view.gfx.grain = false;
  view.setSite('skerry-rock');
  const input = { yaw: 0, pitch: -0.1 };
  let st;
  let exterior = null;
  let strikeAt = -1;
  if (kind === 'thumb1') {
    // From the gallery in a squall: a ferry lit in the amber pool, a siren on her rock beside it, the Drowned climbing.
    st = nightFor('squall');
    settle(st, 3);
    const ferry = shipAt(st, 'ferry', 'Hesper', 62, 5);
    ferry.guided = 6;
    const smack = shipAt(st, 'smack', 'Petrel', 150, -5);
    smack.seen = 1;
    const p = shipPosOf(st, ferry);
    const siren = spawnHostile(st, { type: 'siren', u: 0.5, side: 1, tell: 0 });
    siren.st = 'sing';
    siren.x = p.x + 22;
    siren.z = p.z + 6;
    const dr = spawnHostile(st, { type: 'drowned', n: 3, tell: 0 });
    dr.st = 'climb';
    dr.p = 0.25;
    dr.x = p.x - 30;
    dr.z = p.z - 14;
    spot(st, p.x, p.z, 22, 'amber');
    stand(st, 'lantern');
    input.pitch = -0.24;
  } else if (kind === 'thumb2') {
    // Lightning over the tower, from the sea: the lamp room glowing, the beam out over the water.
    st = nightFor('thunder', 8);
    settle(st, 2);
    const barge = shipAt(st, 'barge', 'Carrack Moll', 150, 2);
    const p = shipPosOf(st, barge);
    spot(st, p.x, p.z, 18, 'white');
    exterior = { x: 70, y: 10, z: 60 };
    strikeAt = 44;
  } else if (kind === 'thumb3') {
    // The Kraken on the tower, the hard white pool on it, a harpoon streaking down from the gallery.
    st = nightFor('gale', 9);
    settle(st, 2);
    const k = spawnHostile(st, { type: 'kraken', tell: 0 });
    k.st = 'grip';
    k.x = 14;
    k.z = 20;
    shipAt(st, 'cutter', 'Saltire', 170, 5);
    spot(st, 14, 20, 8, 'white');
    st.shots.push({ id: 'p1', x: 14, z: 20, life: 0.3 });
    stand(st, 'gallery');
    input.pitch = -0.55;
    input.yaw = 0.1;
  } else {
    // The watch room: the chart table in the lamplight, the cat on the chart, fog on the water outside.
    st = nightFor('fog', 7);
    settle(st, 2);
    const w = spawnHostile(st, { type: 'wraith', u: 0.45, tell: 0 });
    w.st = 'move';
    const m = spawnHostile(st, { type: 'mimic', u: 0.6, side: -1, tell: 0 });
    m.st = 'halted';
    m.revealed = 1;
    shipAt(st, 'ferry', 'Lisbet', 130, -6);
    spot(st, m.x, m.z, 12, 'blue');
    stand(st, 'watch');
    input.pitch = 0;
    input.yaw = -0.25;
  }
  let frames = 0;
  function frame() {
    const dt = 1 / 30;
    stepNight(st, TICK);
    for (const h of st.hostiles) {
      if (h.type === 'drowned') h.p = Math.min(h.p, 0.5);
      if (h.type === 'siren') h.silenced = 0;
      if (h.type === 'kraken') h.life = 40;
    }
    for (const sh of st.shots) sh.life = 0.3;
    if (exterior) {
      // Not a station: the camera stands off the rock, looking at the lamp room.
      view.update(st, null, input, dt, { reducedMotion: true });
      const a = Math.atan2(exterior.x, exterior.z);
      view.camera.position.set(exterior.x, exterior.y, exterior.z);
      view.camera.lookAt(Math.sin(a) * 8, st.mods.towerHeight * 0.6, Math.cos(a) * 8);
      if (frames === strikeAt) view.weather.strike(-30, -40, true);
      view.weather.update(dt, view.camera, st.weather, false, false);
      if (frames > strikeAt) view.weather.flash = Math.min(view.weather.flash, 0.22);
      view.gfx.render(frames / 30, view.weather.flash);
    } else view.update(st, st.crew.me, input, dt, { reducedMotion: true, cosmetics: { collar: 'red', housing: 'brass' } });
    frames++;
    if (frames === 52) window.__posterReady = true;
    if (frames < 52) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
