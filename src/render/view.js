// Puts the picture together: the camera at a station (or on the stairs), the shared light uniforms
// from the night state, and every renderer piece updated in order.
import * as THREE from 'three';
import { Gfx } from './gfx.js';
import { Sky } from './sky.js';
import { Sea } from './sea.js';
import { Tower } from './tower.js';
import { Beam } from './beam.js';
import { Entities } from './entities.js';
import { Weather } from './weather.js';
import { LIGHT, setLens } from './shaders.js';
import { SITES } from '../sim/data/sites.js';
import { buildRoute, SEA_R } from '../sim/route.js';
import { poolCentre, spotIntensity, lampIsOn, SWEEP_HALF, SWEEP_LAMP, maxDist } from '../sim/beam.js';
import { drawChart } from '../ui/chart.js';

const FLIGHTS = { lantern: 3, gallery: 2, watch: 1, cellar: 0 };
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class View {
  constructor(canvas) {
    this.gfx = new Gfx(canvas);
    this.scene = this.gfx.scene;
    this.camera = this.gfx.camera;
    this.sky = new Sky(this.scene);
    this.sea = new Sea(this.scene);
    this.beam = new Beam(this.scene);
    this.weather = new Weather(this.scene);
    this.tower = null;
    this.entities = null;
    this.site = null;
    this.route = null;
    this.rig = { station: 'lantern', yaw: 0.4, pitch: -0.1, yawOffset: 0, pos: new THREE.Vector3(), moveFrom: null, moveTo: null, moveT: 0, moveLen: 1, height: 0 };
    this.shake = 0;
    this.time = 0;
    this.dusk = 1;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.gfx.onQuality((q) => {
      this.sea.setQuality(q);
      this.weather.setQuality(q);
    });
    this.sea.setQuality(this.gfx.quality);
    this.weather.setQuality(this.gfx.quality);
  }

  /** Builds the world for a site (once per site; the tower and reefs don't change within a season). */
  setSite(siteId) {
    if (this.site && this.site.id === siteId) return;
    this.site = SITES[siteId] || SITES['skerry-rock'];
    this.route = buildRoute(this.site.id);
    if (this.tower) this.scene.remove(this.tower.group);
    this.tower = new Tower(this.scene, this.site);
    if (this.entities) this.disposeEntities();
    this.entities = new Entities(this.scene, this.route, this.sea, this.site);
    this.sea.setWaveMul(this.site.waveMul);
    this.rig.pos.set(0, this.site.towerHeight + 1.65, -2);
  }

  disposeEntities() {
    const e = this.entities;
    for (const map of [e.ships, e.hostiles, e.crates, e.flares]) for (const [id] of map) e.removeVisual(map, id);
    for (const s of e.shots) this.scene.remove(s.line);
    this.scene.remove(e.rocks, e.glows);
  }

  /** Screen point (0..1) to a spot on the water, clamped to the sea disc and the lamp's reach. */
  aimAt(nx, ny, reach = 300) {
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, tmp);
    let x;
    let z;
    if (hit && Number.isFinite(hit.x)) {
      x = hit.x;
      z = hit.z;
    } else {
      // Above the horizon: aim along the ray's heading at full reach.
      const d = this.raycaster.ray.direction;
      const len = Math.hypot(d.x, d.z) || 1;
      x = (d.x / len) * reach;
      z = (d.z / len) * reach;
    }
    const dist = Math.hypot(x, z);
    const cap = Math.min(SEA_R - 6, reach);
    if (dist > cap) {
      x = (x / dist) * cap;
      z = (z / dist) * cap;
    }
    return { x, z, az: Math.atan2(x, z), dist: Math.min(dist, cap) };
  }

  /** World point to screen (px) or null when behind the camera. */
  project(x, y, z) {
    tmp2.set(x, y, z).project(this.camera);
    if (tmp2.z > 1) return null;
    return { x: (tmp2.x * 0.5 + 0.5) * this.gfx.width, y: (-tmp2.y * 0.5 + 0.5) * this.gfx.height, depth: tmp2.z };
  }

  kick(amount) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  /**
   * state: the night state to draw (host's own or the interpolated copy); crew: my crew record or null;
   * input: { yaw (manual offset), pitch }; opts: { reducedMotion, bright, cosmetics, fx }.
   */
  update(state, crew, input, dt, opts = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0.016;
    this.time += dt;
    const t = this.time;
    const site = this.site;
    const H = site.towerHeight;
    const beam = state.beam;
    const weather = state.weather;
    const reduced = Boolean(opts.reducedMotion);
    // Camera rig.
    const rig = this.rig;
    const anchors = this.tower.anchors();
    const station = crew ? crew.st : 'lantern';
    const moving = crew && crew.move > 0 && crew.to;
    if (moving) {
      if (rig.moveTo !== crew.to) {
        rig.moveFrom = rig.station;
        rig.moveTo = crew.to;
        rig.moveLen = Math.max(crew.move, 0.5);
        rig.moveT = 0;
      }
      rig.moveT = Math.min(1, rig.moveT + dt / rig.moveLen);
    } else if (rig.station !== station || rig.moveTo) {
      rig.station = station;
      rig.moveTo = null;
      rig.moveFrom = null;
      rig.moveT = 0;
    }
    const aimAz = beam.mode === 'spot' ? beam.az : rig.aimAz ?? beam.az;
    if (beam.mode === 'spot') rig.aimAz = beam.az;
    const targetYaw = (st) => {
      const a = anchors[st];
      return a.look === 'beam' ? (rig.aimAz ?? beam.az) + input.yaw : a.yaw + input.yaw;
    };
    const place = (st, yaw, out) => {
      const a = anchors[st];
      if (a.look === 'beam') out.set(Math.sin(yaw - input.yaw) * a.radius, a.y, Math.cos(yaw - input.yaw) * a.radius);
      else out.set(a.pos.x, a.y, a.pos.z);
      return out;
    };
    let yaw;
    if (moving && rig.moveFrom && rig.moveTo) {
      // The stairs: spiral between the two heights with a bob, a flight per level.
      const k = rig.moveT;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const ya = anchors[rig.moveFrom].y;
      const yb = anchors[rig.moveTo].y;
      const flights = Math.abs(FLIGHTS[rig.moveTo] - FLIGHTS[rig.moveFrom]);
      const spin = reduced ? 0 : e * Math.PI * 2 * flights * 0.5;
      yaw = targetYaw(rig.moveFrom) + spin;
      const r = 1.9;
      const y = ya + (yb - ya) * e + (reduced ? 0 : Math.sin(k * Math.PI * 2 * flights * 2) * 0.08);
      rig.pos.set(Math.sin(yaw) * r, y, Math.cos(yaw) * r);
      rig.yaw = yaw;
      rig.pitch = -0.25 * Math.sin(k * Math.PI) * Math.sign(yb - ya) * (reduced ? 0.3 : 1) + input.pitch;
    } else {
      yaw = targetYaw(rig.station);
      const k = 1 - Math.exp(-dt * 9);
      let dy = yaw - rig.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      rig.yaw += dy * k;
      place(rig.station, rig.yaw, tmp);
      rig.pos.lerp(tmp, k);
      const basePitch = rig.station === 'watch' ? -0.22 : rig.station === 'cellar' ? -0.05 : 0;
      rig.pitch += (input.pitch + basePitch - rig.pitch) * k;
    }
    // Shake on big hits; never under reduced motion.
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = reduced ? 0 : this.shake;
    this.camera.position.set(rig.pos.x + Math.sin(t * 61) * 0.04 * sh, rig.pos.y + Math.sin(t * 47) * 0.05 * sh, rig.pos.z + Math.cos(t * 53) * 0.04 * sh);
    const look = tmp2.set(this.camera.position.x + Math.sin(rig.yaw) * Math.cos(rig.pitch), this.camera.position.y + Math.sin(rig.pitch), this.camera.position.z + Math.cos(rig.yaw) * Math.cos(rig.pitch));
    this.camera.lookAt(look);
    this.camera.rotateZ(Math.sin(t * 43) * 0.01 * sh);
    // Light uniforms from the beam.
    LIGHT.uTime.value = t;
    LIGHT.uCamera.value.copy(this.camera.position);
    LIGHT.uStorm.value = weather.storm;
    setLens(beam.lens);
    const on = lampIsOn(state);
    const I = on && beam.mode === 'spot' ? spotIntensity(state) : 0;
    const c = poolCentre(beam);
    LIGHT.uPool.value.set(c.x, 0, c.z, beam.r);
    LIGHT.uPoolI.value = beam.strobe && !state.mods.strobeKeep ? I * (Math.sin(t * 38) > 0 ? 1.6 : 0.2) : I;
    const sweepI = on && beam.mode === 'sweep' && state.res.oil > 0 ? SWEEP_LAMP * state.mods.lampMul * (1 - 0.4 * beam.grit) : 0;
    LIGHT.uSweep.value.set(Math.sin(beam.sweepAz), Math.cos(beam.sweepAz), Math.cos(SWEEP_HALF), sweepI);
    LIGHT.uSweepReach.value = maxDist(state.mods) + 60;
    let nf = 0;
    for (const p of state.pools) {
      if (nf >= 4) break;
      LIGHT.uFlares.value[nf++].set(p.x, p.z, p.r, p.I * Math.min(1, p.life / 2));
    }
    LIGHT.uNFlares.value = nf;
    let nw = 0;
    let nh = 0;
    for (const h of state.hostiles) {
      if (h.type !== 'wraith' || h.st !== 'move' || nw >= 2) continue;
      LIGHT.uWraiths.value[nw++].set(h.x, h.z, h.r, state.mods.wraithInside);
      for (const hole of h.holes) if (nh < 2) LIGHT.uHoles.value[nh++].set(hole.x, hole.z, hole.r, 1);
    }
    LIGHT.uNWraiths.value = nw;
    LIGHT.uNHoles.value = nh;
    const fogBase = 0.0016 + (1 - weather.vis) * 0.004 + weather.fog * 0.004;
    LIGHT.uFogDensity.value = fogBase;
    LIGHT.uFogColor.value.setRGB(0.04 + weather.fog * 0.06, 0.08 + weather.fog * 0.07, 0.12 + weather.fog * 0.07);
    LIGHT.uAmbient.value = 0.05 + (opts.bright ? 0.02 : 0) + (state.phase === 'dusk' ? 0.08 * this.dusk : 0);
    // Dusk fades into night over the dusk phase; dawn warms the world at the end.
    const duskTarget = state.phase === 'dusk' ? Math.min(1, state.duskLeft / 45) : 0;
    this.dusk += (duskTarget - this.dusk) * Math.min(1, dt * 2);
    LIGHT.uDawn.value = state.phase === 'dawn' ? 1 - Math.max(0, state.dawnLeft / 6) : state.phase === 'over' && state.result === 'dawn' ? 1 : 0;
    // Pieces.
    this.sky.update(this.camera, this.dusk, weather.fog);
    const lensPos = tmp.set(0, H + 0.95, 0);
    const poolY = this.sea.heightAt(c.x, c.z, t, weather.storm, site.waveMul);
    const target = beam.mode === 'sweep' ? tmp2.set(Math.sin(beam.sweepAz) * 320, 0, Math.cos(beam.sweepAz) * 320) : tmp2.set(c.x, poolY, c.z);
    this.beam.update(lensPos, target, beam.mode === 'sweep' ? 40 : beam.r, beam.mode === 'sweep' ? sweepI * 0.9 : I, LIGHT.uLens.value, { strobe: beam.strobe && !reduced ? 1 : 0, sweep: beam.mode === 'sweep', haze: 0.7 + weather.fog * 0.8 + weather.rain * 0.3, quality: this.gfx.quality });
    this.tower.update(dt, beam, t, {
      lampOn: on && state.res.oil > 0,
      crankOn: Boolean(state.crank.on),
      hornOn: Boolean(state.horn.on),
      doorAttack: state.flags.doorUnderAttack > state.t - 0.2,
      cat: Boolean(state.mods.cat),
      collar: opts.cosmetics?.collar,
      housing: opts.cosmetics?.housing,
      needle: Math.min(1, (state.ships.filter((s) => s.needs).length + (state.horn.on ? 1 : 0)) * 0.4 + weather.static),
      cansLeft: state.res.oilCans,
      crateTaken: Boolean(state.flags.crateTaken),
    });
    this.entities.update(state, dt, t, Boolean(state.mods.brightShips));
    this.chartTimer = (this.chartTimer || 0) + dt;
    if (this.chartTimer > 0.5 && (rig.station === 'watch' || moving)) {
      this.chartTimer = 0;
      drawChart(this.tower.chartCanvas.getContext('2d'), 256, state, { radar: state.mods.radar, labels: false, paper: true });
      this.tower.chartTex.needsUpdate = true;
    }
    const inside = rig.station !== 'gallery' && !moving;
    this.weather.update(dt, this.camera, weather, reduced, inside);
    for (const fx of opts.fx || []) {
      if (fx.k === 'lightning') {
        this.weather.strike(fx.x, fx.z, fx.near);
        if (fx.near) this.kick(0.5);
      } else if (fx.k === 'harpoon') this.kick(0.35);
      else if (fx.k === 'door' || fx.k === 'titan-slam' || fx.k === 'crack') this.kick(0.6);
      else if (fx.k === 'arrive' && fx.type === 'kraken') this.kick(0.8);
      else if (fx.k === 'stagger') this.kick(0.4);
    }
    this.gfx.render(t, this.weather.flash);
  }

  /** A calm picture for the title: the tower from the sea at dusk. */
  updateTitle(dt, state) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0.016;
    this.time += dt;
    const t = this.time;
    const H = this.site.towerHeight;
    const a = t * 0.05;
    this.camera.position.set(Math.sin(a) * 88, 13 + Math.sin(t * 0.3) * 0.8, Math.cos(a) * 88);
    const side = Math.atan2(this.camera.position.x, this.camera.position.z) - Math.PI / 2;
    this.camera.lookAt(Math.sin(side) * 30, H * 0.55, Math.cos(side) * 30);
    LIGHT.uTime.value = t;
    LIGHT.uCamera.value.copy(this.camera.position);
    LIGHT.uStorm.value = 0.3;
    LIGHT.uPoolI.value = 0;
    LIGHT.uNFlares.value = 0;
    LIGHT.uNWraiths.value = 0;
    LIGHT.uNHoles.value = 0;
    LIGHT.uDawn.value = 0;
    LIGHT.uFogDensity.value = 0.0022;
    LIGHT.uFogColor.value.setRGB(0.04, 0.08, 0.12);
    LIGHT.uAmbient.value = 0.09;
    setLens('amber');
    const az = t * 0.5;
    LIGHT.uSweep.value.set(Math.sin(az), Math.cos(az), Math.cos(SWEEP_HALF), 0.6);
    LIGHT.uSweepReach.value = 360;
    this.dusk += (0.6 - this.dusk) * Math.min(1, dt);
    this.sky.update(this.camera, this.dusk, 0.1);
    this.beam.update(tmp.set(0, H + 0.95, 0), tmp2.set(Math.sin(az) * 320, 0, Math.cos(az) * 320), 40, 0.6, LIGHT.uLens.value, { sweep: true, haze: 0.9, quality: this.gfx.quality });
    this.tower.update(dt, { mode: 'sweep', sweepAz: az, az }, t, { lampOn: true, cat: false });
    if (state) this.entities.update(state, dt, t);
    else {
      this.entities.glowCount = 0;
      this.entities.glows.geometry.setDrawRange(0, 0);
    }
    this.weather.update(dt, this.camera, { storm: 0.3, rain: 0, fog: 0.1, vis: 1 }, false, false);
    this.gfx.render(t, 0);
  }
}
