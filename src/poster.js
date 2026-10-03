// Store art, drawn by the game itself: ?poster=thumb1 | thumb2 | thumb3 | thumb4 | icon | badge-<id>.
// Deterministic scenes with no SDK and no network; scripts/store.mjs captures them. Each is a real night state
// stepped by the simulation and drawn by the game's renderer; some are seen from a placed camera (a photo of
// the tower) rather than through the keeper's eyes.
import * as THREE from 'three';
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
  // A clean stage: only what the picture places.
  st.tl.events.length = 0;
  st.nextEv = 0;
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

/** Puts a ship on the route so that it sits `dist` metres from the tower (on the first stretch that does). */
function shipAt(st, type, name, dist, d = 4, from = 0) {
  const ship = spawnShip(st, { type, name, d });
  let best = from;
  let bd = Infinity;
  for (let s = from; s < st.route.L; s += 2) {
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
    try {
      await document.fonts?.load?.('900 40px Ledger');
    } catch {}
    drawBadge(c.getContext('2d'), size, kind === 'icon' ? 'icon' : kind.slice(6));
    window.__posterReady = true;
    return;
  }
  const view = new View(canvas);
  view.gfx.setQuality('high');
  view.gfx.grain = false;
  view.setSite('skerry-rock');
  const H = view.site.towerHeight;
  const input = { yaw: 0, pitch: -0.1 };
  let st;
  let camera = null;
  let strikeAt = -1;
  let strike = null;
  let keep = () => {};
  if (kind === 'thumb1') {
    // The cover: out on the water by the reef, the beam comes down through the squall onto a ferry held in its
    // pool; a siren sings on her rock in front of the light; the tower stands behind under lightning.
    st = nightFor('squall');
    const ferry = shipAt(st, 'ferry', 'Hesper', 82, 3);
    ferry.guided = 6;
    const p = shipPosOf(st, ferry);
    const smack = shipAt(st, 'smack', 'Petrel', 215, -4);
    smack.seen = 1;
    const dist = Math.hypot(p.x, p.z);
    const u = { x: p.x / dist, z: p.z / dist };
    const side = { x: u.z, z: -u.x };
    const siren = spawnHostile(st, { type: 'siren', u: 0.5, side: 1, tell: 0 });
    siren.st = 'sing';
    siren.x = p.x + u.x * 17 - side.x * 13;
    siren.z = p.z + u.z * 17 - side.z * 13;
    spot(st, p.x, p.z, 18, 'amber');
    stand(st, 'lantern');
    camera = {
      pos: new THREE.Vector3(p.x + u.x * 46 - side.x * 30, 11, p.z + u.z * 46 - side.z * 30),
      target: new THREE.Vector3(p.x * 0.45 - side.x * 4, 15, p.z * 0.45 - side.z * 4),
      fov: 50,
    };
    strike = { x: -u.x * 150 + side.x * 120, z: -u.z * 150 + side.z * 120 };
    strikeAt = 47;
    keep = () => {
      ferry.guided = 6;
      siren.silenced = 0;
      siren.scared = 0;
      siren.st = 'sing';
    };
  } else if (kind === 'thumb2') {
    // Lightning over the tower, from the sea: the lamp room glowing, the beam out over the water on a barge.
    st = nightFor('thunder', 8);
    const barge = shipAt(st, 'barge', 'Carrack Moll', 120, 2);
    const p = shipPosOf(st, barge);
    spot(st, p.x, p.z, 16, 'white');
    stand(st, 'lantern');
    const a = Math.atan2(p.x, p.z) - 2.4;
    camera = { pos: new THREE.Vector3(Math.sin(a) * 92, 5, Math.cos(a) * 92), target: new THREE.Vector3(Math.sin(a + 0.6) * 18, H * 0.78, Math.cos(a + 0.6) * 18), fov: 56 };
    strike = { x: -Math.sin(a) * 130 + Math.cos(a) * 55, z: -Math.cos(a) * 130 - Math.sin(a) * 55 };
    strikeAt = 46;
    keep = () => {
      barge.guided = 6;
    };
  } else if (kind === 'thumb3') {
    // Night twelve: the Tide Titan out of the sea, its eyes burning, the beam hard on its face; a cutter running past.
    st = nightFor('thunder', 12);
    const t = spawnHostile(st, { type: 'titan', tell: 0 });
    t.st = 'fight';
    t.tellLeft = 0;
    t.phase = 1;
    t.x = 6;
    t.z = 130;
    const cutter = shipAt(st, 'cutter', 'Saltire', 95, 4);
    cutter.guided = 6;
    spot(st, 6, 118, 15, 'white');
    stand(st, 'gallery');
    camera = { pos: new THREE.Vector3(-26, H + 7, -30), target: new THREE.Vector3(4, 18, 120), fov: 52 };
    strikeAt = 45;
    strike = { x: 120, z: 260 };
    keep = () => {
      t.st = 'fight';
      t.phase = 1;
      t.phaseLeft = 60;
      cutter.guided = 6;
    };
  } else {
    // Dawn: the storm spent, the sun just up, ships coming home along its road of gold past the tower.
    st = nightFor('rain', 7);
    st.weather = { ...st.weather, rain: 0, storm: 0.22, fog: 0.1, vis: 0.9 };
    // The stretch of the channel that lies toward the sunrise.
    const sunAz = Math.atan2(0.951, -0.285);
    let bestS = 0;
    let bestD = Infinity;
    for (let s = 0; s < st.route.L; s += 4) {
      const ship = { s, d: 0 };
      const p = shipPosOf(st, ship);
      let da = Math.atan2(p.x, p.z) - sunAz;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (da < bestD) {
        bestD = da;
        bestS = s;
      }
    }
    const put = (type, name, ds, d) => {
      const ship = spawnShip(st, { type, name, d });
      ship.s = Math.max(0, Math.min(st.route.L - 1, bestS + ds));
      ship.seen = 1;
      return ship;
    };
    put('ferry', 'Lisbet', -95, -2);
    put('barge', 'Marram', 70, 3);
    put('smack', 'Tern', -160, 1);
    st.phase = 'dawn';
    st.dawnLeft = 0.01;
    st.beam.mode = 'sweep';
    st.beam.sweepAz = sunAz + 1.2;
    stand(st, 'gallery');
    view.dawn = 1;
    // From the sea to the west: the tower dark against the sunrise, the gold road running to it.
    const sx = 0.951;
    const sz = -0.285;
    camera = { pos: new THREE.Vector3(-sx * 105 - sz * 25, 7, -sz * 105 + sx * 25), target: new THREE.Vector3(sx * 30 + sz * 18, H * 0.55, sz * 30 - sx * 18), fov: 50 };
    keep = () => {
      st.phase = 'dawn';
      st.dawnLeft = 0.01;
    };
  }
  settle(st, 0.2);
  let frames = 0;
  function frame() {
    const dt = 1 / 30;
    stepNight(st, TICK);
    for (const h of st.hostiles) {
      if (h.type === 'drowned') h.p = Math.min(h.p, 0.5);
    }
    keep();
    if (frames === strikeAt && strike) view.weather.strike(strike.x, strike.z, false, view.camera);
    view.update(st, st.crew.me, input, dt, { reducedMotion: false, camera, cosmetics: { collar: 'red', housing: 'brass' } });
    frames++;
    if (frames === 52) window.__posterReady = true;
    if (frames < 52) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
