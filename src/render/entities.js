// Everything on the water: ships with running lights, the Drowned, Sirens, Mimics, the Tide-Wraith,
// the Kraken, the Titan, crates, flares, harpoons, the reefs and the harbour. Lit by the beam only.
import * as THREE from 'three';
import { worldMaterial, paint, LIGHT, NOISE } from './shaders.js';
import { glowTexture } from './beam.js';
import { reefPoints, routeAt, shipPos } from '../sim/route.js';
import { SHIPS } from '../sim/data/ships.js';

const MAX_GLOWS = 700;

const HULL_COLOURS = {
  smack: { top: 0x223127, deck: 0x6b5a44 },
  skiff: { top: 0x2b2420, deck: 0x6b5a44 },
  ferry: { top: 0x1b3450, deck: 0x8d8574 },
  barge: { top: 0x5a2e1c, deck: 0x4b4640 },
  cutter: { top: 0x3c454e, deck: 0x5a636c },
};

function hull(len, beam, height, type) {
  // A low-poly hull: pointed bow, a sheer that rises to it, a rounded stern. Painted by face: an antifouling red
  // below the waterline, the ship's own colour above, a lighter deck.
  const g = new THREE.BoxGeometry(len, height, beam, 6, 2, 1).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const t = x / len + 0.5; // 0 stern, 1 bow
    const taper = t > 0.62 ? 1 - ((t - 0.62) / 0.38) ** 1.4 * 0.92 : t < 0.18 ? 0.78 + t * 1.2 : 1;
    p.setZ(i, z * taper * (y < 0 ? 0.62 : 1));
    const sheer = y > 0 ? (t > 0.6 ? (t - 0.6) * height * 1.1 : 0) : 0;
    p.setY(i, (y < 0 ? y * 0.75 : y) + sheer);
  }
  g.computeVertexNormals();
  const c = HULL_COLOURS[type] || HULL_COLOURS.smack;
  const cols = new Float32Array(p.count * 3);
  const deck = new THREE.Color(c.deck);
  const top = new THREE.Color(c.top);
  const bottom = new THREE.Color(0x4a1f17);
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    // One colour per triangle (flat shading reads cleanly at a distance).
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const col = ny > 0.6 ? deck : y < -height * 0.12 ? bottom : top;
    for (let k = 0; k < 3; k++) cols.set([col.r, col.g, col.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function shipGeometry(type) {
  const parts = [];
  const add = (geo, x, y, z, ry = 0) => {
    geo.translate(x, y, z);
    if (ry) geo.rotateY(ry);
    parts.push(geo);
  };
  const def = SHIPS[type] || SHIPS.smack;
  const L = def.length;
  const W = L * 0.3;
  add(hull(L, W, L * 0.12, type), 0, 0, 0);
  const mast = (x, h, top = 0x3a2614) => add(paint(new THREE.CylinderGeometry(0.06, 0.09, h, 5), 0x2a2018, top), x, L * 0.08 + h / 2, 0);
  if (type === 'smack' || type === 'skiff') {
    mast(L * 0.08, L * 0.85);
    // A tanned sail, a little bellied: two triangles on the mast.
    const sail = new THREE.BufferGeometry();
    const h = L * 0.75;
    sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -L * 0.42, 0, 0.25, 0, h, 0, 0, 0, 0, 0, h, 0, -L * 0.42, 0, 0.25], 3));
    sail.computeVertexNormals();
    paint(sail, 0x7a4a2a, 0xa0683c);
    add(sail, L * 0.06, L * 0.12, 0);
    add(paint(new THREE.BoxGeometry(L * 0.24, L * 0.13, W * 0.62), 0x4a3a2a, 0x6b5640), -L * 0.26, L * 0.12, 0);
  } else if (type === 'ferry') {
    add(paint(new THREE.BoxGeometry(L * 0.62, L * 0.13, W * 0.92), 0x9a9384, 0xb8b0a0), -L * 0.06, L * 0.12, 0);
    add(paint(new THREE.BoxGeometry(L * 0.34, L * 0.1, W * 0.66), 0x9a9384, 0xb8b0a0), -L * 0.1, L * 0.24, 0);
    add(paint(new THREE.BoxGeometry(L * 0.12, L * 0.07, W * 0.5), 0x2a3440, 0x3c4a58), L * 0.06, L * 0.32, 0);
    add(paint(new THREE.CylinderGeometry(L * 0.045, L * 0.055, L * 0.2, 10), 0x1f7f78, 0x0a0c10), -L * 0.2, L * 0.38, 0);
    mast(L * 0.18, L * 0.45);
  } else if (type === 'barge') {
    for (let i = 0; i < 3; i++) add(paint(new THREE.BoxGeometry(L * 0.21, L * 0.07, W * 0.72), i === 1 ? 0x7a2a20 : 0x34424a, i === 1 ? 0x9a3a2c : 0x55656e), -L * 0.24 + i * L * 0.25, L * 0.1, 0);
    add(paint(new THREE.BoxGeometry(L * 0.13, L * 0.16, W * 0.62), 0x8a8274, 0xa8a090), -L * 0.42, L * 0.14, 0);
    mast(-L * 0.42, L * 0.3);
  } else if (type === 'cutter') {
    add(paint(new THREE.BoxGeometry(L * 0.4, L * 0.1, W * 0.8), 0x4a5560, 0x6f7c88), -L * 0.08, L * 0.1, 0);
    add(paint(new THREE.BoxGeometry(L * 0.18, L * 0.09, W * 0.52), 0x4a5560, 0x6f7c88), -L * 0.06, L * 0.2, 0);
    add(paint(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8), 0x2a2f36, 0x3a4048), L * 0.26, L * 0.12, 0);
    add(paint(new THREE.CylinderGeometry(0.08, 0.1, L * 0.22, 6), 0x2a2f36, 0x2a2f36).rotateZ(Math.PI / 2), L * 0.36, L * 0.13, 0);
    mast(-L * 0.04, L * 0.5);
  }
  return mergeGeometries(parts);
}

function mergeGeometries(list) {
  let count = 0;
  for (const g of list) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = [];
  const nor = [];
  const col = [];
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    const idx = g.index ? Array.from(g.index.array) : [...Array(p.count).keys()];
    for (const i of idx) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.getX(i), c.getY(i), c.getZ(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const GLOW_VERT = /* glsl */ `
attribute float size; attribute vec3 color; varying vec3 vColor; varying float vFog; uniform float uFogDensity; uniform vec3 uCamera; uniform float uScale;
void main() { vColor = color; vec4 w = modelMatrix * vec4(position, 1.0); float d = distance(uCamera, w.xyz);
  vFog = exp(-uFogDensity * uFogDensity * d * d * 0.5); vec4 mv = viewMatrix * w; gl_PointSize = size * uScale / max(1.0, -mv.z) ; gl_Position = projectionMatrix * mv; }
`;
const GLOW_FRAG = /* glsl */ `
precision highp float; varying vec3 vColor; varying float vFog;
void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = (1.0 - smoothstep(0.15, 1.0, d)); a *= a; gl_FragColor = vec4(vColor * a * (0.4 + 0.6 * vFog), 1.0); }
`;

const FOG_VERT = /* glsl */ `varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FOG_FRAG = /* glsl */ `
precision highp float; ${NOISE} varying vec3 vWorld; uniform vec3 uCentre; uniform float uR; uniform float uTime; uniform vec4 uHoles[2]; uniform int uNHoles; uniform float uFlash;
void main() { float d = distance(vWorld.xz, uCentre.xz); float edge = 1.0 - smoothstep(uR * 0.55, uR, d);
  float n = fbm(vWorld.xz * 0.04 + vec2(uTime * 0.05, uTime * 0.03)); float a = edge * (0.55 + 0.45 * n) * 0.85;
  for (int i = 0; i < 2; i++) { if (i >= uNHoles) break; vec4 h = uHoles[i]; a *= smoothstep(h.z * 0.6, h.z * 1.2, distance(vWorld.xz, h.xy)); }
  vec3 col = vec3(0.16, 0.2, 0.24) + uFlash * 0.4; gl_FragColor = vec4(col, a); }
`;

export class Entities {
  constructor(scene, route, sea, site) {
    this.scene = scene;
    this.route = route;
    this.sea = sea;
    this.site = site;
    this.mat = worldMaterial({ flat: true });
    this.matSmooth = worldMaterial({ flat: false });
    this.ships = new Map();
    this.hostiles = new Map();
    this.crates = new Map();
    this.flares = new Map();
    this.shots = [];
    this.geos = {};
    this.pool = [];
    this.time = 0;
    this.buildReef();
    this.buildHarbour();
    this.buildGlows();
    this.rings = [];
  }

  geometry(type) {
    if (!this.geos[type]) this.geos[type] = shipGeometry(type);
    return this.geos[type];
  }

  buildReef() {
    const rock = paint(new THREE.IcosahedronGeometry(1, 0), 0x2b3a3c, 0x55656a);
    const pts = [...reefPoints(this.route, -1, 11), ...reefPoints(this.route, 1, 11)];
    const extra = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r = 300 + Math.sin(i * 7.1) * 60 + (i % 3) * 25;
      extra.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, w: 1 });
    }
    const all = pts.concat(extra.filter((p) => Math.abs(p.x - 60) > 80 || p.z < -150)).filter((p) => Math.hypot(p.x, p.z) > 34);
    this.rocks = new THREE.InstancedMesh(rock, this.mat, all.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    all.forEach((p, i) => {
      const k = ((i * 7919) % 97) / 97;
      const size = 1.8 + k * 4;
      q.setFromEuler(new THREE.Euler(k * 3, i * 0.7, k * 2));
      s.set(size * (0.8 + k), size * 0.75, size * (1.2 - k * 0.4));
      v.set(p.x + Math.sin(i * 3.3) * 4, -size * 0.35 + 0.6, p.z + Math.cos(i * 2.1) * 4);
      m.compose(v, q, s);
      this.rocks.setMatrixAt(i, m);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rocks);
  }

  buildHarbour() {
    const end = routeAt(this.route, this.route.L);
    const mole = new THREE.Mesh(paint(new THREE.BoxGeometry(40, 3, 8), 0x2c3034, 0x4a4f55), this.mat);
    mole.position.set(end.x - 10, 0.5, end.z - 12);
    mole.rotation.y = 0.3;
    this.scene.add(mole);
    this.harbourLights = [];
    for (let i = 0; i < 5; i++) this.harbourLights.push({ x: end.x - 28 + i * 9, y: 3.2, z: end.z - 10 + i * 2.4, c: [1, 0.72, 0.35], s: 6 + (i % 2) * 2 });
    const start = routeAt(this.route, 0);
    this.buoy = { x: start.x + 8, z: start.z + 6 };
  }

  buildGlows() {
    const g = new THREE.BufferGeometry();
    this.glowPos = new Float32Array(MAX_GLOWS * 3);
    this.glowCol = new Float32Array(MAX_GLOWS * 3);
    this.glowSize = new Float32Array(MAX_GLOWS);
    g.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.glowSize, 1));
    this.glowMat = new THREE.ShaderMaterial({ uniforms: { uFogDensity: LIGHT.uFogDensity, uCamera: LIGHT.uCamera, uScale: { value: 300 } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glows = new THREE.Points(g, this.glowMat);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 6;
    this.scene.add(this.glows);
    this.glowCount = 0;
  }

  glow(x, y, z, r, g, b, size) {
    if (this.glowCount >= MAX_GLOWS) return;
    const i = this.glowCount++;
    this.glowPos[i * 3] = x;
    this.glowPos[i * 3 + 1] = y;
    this.glowPos[i * 3 + 2] = z;
    this.glowCol[i * 3] = r;
    this.glowCol[i * 3 + 1] = g;
    this.glowCol[i * 3 + 2] = b;
    this.glowSize[i] = size;
  }

  waterY(x, z, storm) {
    return this.sea.heightAt(x, z, this.time, storm, this.site.waveMul);
  }

  shipVisual(ship) {
    let v = this.ships.get(ship.id);
    if (!v) {
      const mesh = new THREE.Mesh(this.geometry(ship.type), this.mat);
      const ring = new THREE.Mesh(new THREE.RingGeometry(SHIPS[ship.type].length * 0.7, SHIPS[ship.type].length * 0.85, 24), new THREE.MeshBasicMaterial({ color: 0x35b6a6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.4;
      const group = new THREE.Group();
      group.add(mesh, ring);
      this.scene.add(group);
      v = { group, mesh, ring, roll: 0, pitch: 0, sink: 0 };
      this.ships.set(ship.id, v);
    }
    return v;
  }

  /** Takes a thing off the water and frees what was made for it alone (shared hulls and materials stay). */
  removeVisual(map, id) {
    const v = map.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    const shared = new Set(Object.values(this.geos));
    v.group.traverse((o) => {
      if (o.geometry && !o.isSprite && !shared.has(o.geometry)) o.geometry.dispose(); // sprites share three's quad
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (m !== this.mat && m !== this.matSmooth) m.dispose();
    });
    map.delete(id);
  }

  /** Reads the (interpolated) night state and lays the world out. `storm` drives floating. */
  update(state, dt, time, bright = false) {
    this.time = time;
    this.glowCount = 0;
    const storm = state.weather.storm;
    const seen = new Set();
    for (const ship of state.ships) {
      if (ship.st === 'lost' || ship.st === 'saved') continue;
      seen.add(ship.id);
      const v = this.shipVisual(ship);
      const p = shipPos(this.route, ship.s, ship.d);
      const def = SHIPS[ship.type];
      const y0 = this.waterY(p.x, p.z, storm);
      const yb = this.waterY(p.x + Math.sin(p.h) * def.length * 0.5, p.z + Math.cos(p.h) * def.length * 0.5, storm);
      const ys = this.waterY(p.x - Math.sin(p.h) * def.length * 0.5, p.z - Math.cos(p.h) * def.length * 0.5, storm);
      const pitch = Math.atan2(yb - ys, def.length);
      const roll = Math.sin(time * 1.3 + ship.s * 0.1) * 0.06 * (0.5 + storm);
      if (ship.st === 'wreck') {
        v.sink = Math.min(1, v.sink + dt / 10);
      }
      v.group.position.set(p.x, y0 + def.length * 0.04 - v.sink * def.length * 0.4, p.z);
      v.group.rotation.set(0, p.h - Math.PI / 2, 0);
      v.mesh.rotation.set(roll + v.sink * 0.9, 0, -pitch);
      v.ring.material.opacity = ship.guided > 0 ? 0.25 + 0.15 * Math.sin(time * 6) : 0;
      // Running lights: red to port, green to starboard, white on the mast; brighter under a moonless charter.
      const L = def.length;
      const k = bright ? 1.6 : 1;
      const side = (s) => ({ x: p.x + Math.cos(p.h) * s * L * 0.15, z: p.z - Math.sin(p.h) * s * L * 0.15 });
      const port = side(-1);
      const star = side(1);
      if (ship.st !== 'wreck' || v.sink < 0.6) {
        this.glow(port.x, y0 + L * 0.12, port.z, 1.6 * k, 0.12, 0.08, 4.5 * k);
        this.glow(star.x, y0 + L * 0.12, star.z, 0.08, 1.4 * k, 0.6, 4.5 * k);
        this.glow(p.x, y0 + L * 0.5, p.z, 1.4 * k, 1.3 * k, 1.15 * k, 5.5 * k);
        if (ship.st === 'distress') this.glow(p.x, y0 + L * 0.3, p.z, 1.6, 0.5, 0.1, 12 + 7 * Math.sin(time * 8));
        // Cabin windows: a warm row along the deck house, so a ship reads as a ship from far off.
        const fx = Math.sin(p.h);
        const fz = Math.cos(p.h);
        const wins = def.id === 'ferry' ? 6 : def.id === 'barge' ? 2 : def.id === 'cutter' ? 3 : 1;
        const deckY = y0 + L * (def.id === 'ferry' ? 0.17 : 0.13);
        for (let i = 0; i < wins; i++) {
          const a = wins === 1 ? -0.25 : -0.32 + (i / (wins - 1)) * (def.id === 'ferry' ? 0.42 : 0.2);
          for (const sgn of [-1, 1]) {
            const ox = p.x + fx * a * L + Math.cos(p.h) * sgn * L * 0.12;
            const oz = p.z + fz * a * L - Math.sin(p.h) * sgn * L * 0.12;
            const flick = 0.85 + 0.15 * Math.sin(time * 3 + i * 1.7 + sgn);
            this.glow(ox, deckY, oz, 1.0 * flick, 0.62 * flick, 0.26 * flick, 2.2);
          }
        }
        // The wake: two lines of white water opening behind the stern, bright where the light falls.
        if (ship.st === 'sail' && ship.v > 0.2) {
          const pool = LIGHT.uPool.value;
          const inPool = Math.hypot(p.x - pool.x, p.z - pool.z) < pool.w * 1.3 ? Math.min(1.5, LIGHT.uPoolI.value) : 0;
          const lit = 0.08 + inPool * 0.9;
          for (let j = 1; j <= 8; j++) {
            const back = L * (0.42 + j * 0.2);
            const spread = L * 0.1 + j * 0.65;
            for (const sgn of [-1, 1]) {
              const wx = p.x - fx * back + Math.cos(p.h) * sgn * spread;
              const wz = p.z - fz * back - Math.sin(p.h) * sgn * spread;
              const f = (1 - j / 9) * lit;
              this.glow(wx, this.waterY(wx, wz, storm) + 0.2, wz, 0.55 * f, 0.68 * f, 0.7 * f, 2.2 + j * 0.45);
            }
          }
        }
      }
    }
    for (const id of [...this.ships.keys()]) if (!seen.has(id)) this.removeVisual(this.ships, id);
    this.updateHostiles(state, dt, time, storm);
    this.updateCrates(state, storm);
    this.updateFlares(state, dt);
    this.updateShots(state, dt);
    for (const l of this.harbourLights) this.glow(l.x, l.y, l.z, l.c[0], l.c[1], l.c[2], l.s);
    const blink = Math.sin(time * 2) > 0.3 ? 1 : 0.1;
    this.glow(this.buoy.x, 1.5 + this.waterY(this.buoy.x, this.buoy.z, storm), this.buoy.z, 0.9 * blink, 0.9 * blink, 0.9 * blink, 6);
    this.glows.geometry.setDrawRange(0, this.glowCount);
    this.glows.geometry.attributes.position.needsUpdate = true;
    this.glows.geometry.attributes.color.needsUpdate = true;
    this.glows.geometry.attributes.size.needsUpdate = true;
  }

  hostileVisual(h) {
    let v = this.hostiles.get(h.id);
    if (v) return v;
    const group = new THREE.Group();
    v = { group, parts: [], t: 0 };
    if (h.type === 'drowned') {
      for (let i = 0; i < h.b.length; i++) {
        const body = new THREE.Mesh(paint(new THREE.ConeGeometry(0.5, 1.6, 5), 0x3a4a48, 0x7c8d8a), this.mat);
        const head = new THREE.Mesh(paint(new THREE.SphereGeometry(0.32, 6, 5), 0x8d9c99), this.mat);
        head.position.y = 0.95;
        const one = new THREE.Group();
        one.add(body, head);
        one.position.set(Math.sin(i * 2.4) * 2.2, 0, Math.cos(i * 2.4) * 2.2);
        group.add(one);
        v.parts.push(one);
      }
    } else if (h.type === 'siren') {
      // She sits on her rock facing the channel: a long tail curled down the stone, a slim body leaning back on one
      // arm, the other raised, her hair streaming in the wind. A silhouette first, lit only by what finds her.
      const rock = new THREE.Mesh(paint(new THREE.IcosahedronGeometry(2.6, 0), 0x1d2a2c, 0x46575b), this.mat);
      rock.position.y = -0.7;
      rock.scale.set(1.3, 0.85, 1.1);
      const figure = new THREE.Group();
      const tail = new THREE.Mesh(paint(new THREE.TorusGeometry(0.9, 0.26, 6, 12, Math.PI * 1.1), 0x0f3b3c, 0x2f8f86), this.mat);
      tail.rotation.set(Math.PI / 2, 0.3, 0.4);
      tail.position.set(0.4, 1.0, 0.2);
      const fin = new THREE.Mesh(paint(new THREE.ConeGeometry(0.42, 0.7, 4), 0x2f8f86, 0x6fd0c4), this.mat);
      fin.position.set(1.15, 0.75, -0.5);
      fin.rotation.set(0.4, 0, -1.9);
      const body = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.22, 0.4, 1.7, 7), 0x245e60, 0xa6ddd5), this.mat);
      body.position.set(-0.15, 1.95, 0);
      body.rotation.z = 0.28;
      const head = new THREE.Mesh(paint(new THREE.SphereGeometry(0.3, 8, 7), 0xbfe4df), this.mat);
      head.position.set(-0.42, 3.0, 0);
      const hair = new THREE.Mesh(paint(new THREE.ConeGeometry(0.42, 2.1, 6), 0x061a20, 0x16605c), this.mat);
      hair.position.set(-0.05, 2.45, -0.25);
      hair.rotation.set(-0.5, 0, -2.3);
      const arm = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.07, 0.09, 1.25, 5), 0x7fc4ba), this.mat);
      arm.position.set(-0.75, 3.15, 0.15);
      arm.rotation.z = 0.85;
      const arm2 = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5), 0x7fc4ba), this.mat);
      arm2.position.set(0.35, 1.55, 0.3);
      arm2.rotation.z = -0.9;
      figure.add(tail, fin, body, head, hair, arm, arm2);
      figure.scale.setScalar(1.45);
      group.add(rock, figure);
      v.parts.push(figure, head, hair);
      v.figure = figure;
    } else if (h.type === 'mimic') {
      const raft = new THREE.Mesh(paint(new THREE.BoxGeometry(7, 0.6, 3), 0x121a1e, 0x2a3a40), this.mat);
      raft.visible = false;
      group.add(raft);
      v.raft = raft;
    } else if (h.type === 'wraith') {
      const fog = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 14, 32, 1, true), new THREE.ShaderMaterial({ uniforms: { uCentre: { value: new THREE.Vector3() }, uR: { value: h.r }, uTime: LIGHT.uTime, uHoles: LIGHT.uHoles, uNHoles: LIGHT.uNHoles, uFlash: LIGHT.uFlash }, vertexShader: FOG_VERT, fragmentShader: FOG_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      const cap = new THREE.Mesh(new THREE.CircleGeometry(h.r, 32), fog.material);
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = 7;
      group.add(fog, cap);
      v.fog = fog;
    } else if (h.type === 'kraken' || h.type === 'titan') {
      // Tentacles: tapering segments with a pale row of suckers on the inner side; the Kraken's wraps the tower.
      const kraken = h.type === 'kraken';
      const segs = kraken ? 16 : 7;
      const arms = kraken ? 1 : 2;
      const base = kraken ? 2.4 : 7;
      const segH = kraken ? 3.0 : 14;
      v.arms = [];
      const sucker = paint(new THREE.SphereGeometry(1, 6, 4), 0x8f7f7c, 0xc7b4ae);
      for (let a = 0; a < arms; a++) {
        const arm = [];
        for (let i = 0; i < segs; i++) {
          const k0 = 1 - i / segs;
          const k1 = 1 - (i + 1) / segs;
          const r0 = base * k0 ** 0.8 + 0.25;
          const r1 = base * k1 ** 0.8 + 0.25;
          const seg = new THREE.Mesh(paint(new THREE.CylinderGeometry(r1, r0, segH * 1.05, 12, 1, true), 0x0a1a1c, 0x1f4440), this.matSmooth);
          // A joint ball at the base hides the seam when the arm bends.
          const joint = new THREE.Mesh(paint(new THREE.SphereGeometry(r0, 12, 8), 0x0a1a1c, 0x183836), this.matSmooth);
          joint.position.y = -segH * 0.5;
          seg.add(joint);
          for (const yy of [-0.25, 0.22]) {
            const sk = new THREE.Mesh(sucker, this.matSmooth);
            const rr = (r0 + r1) / 2;
            sk.scale.set(rr * 0.32, rr * 0.18, rr * 0.32);
            sk.position.set(rr * 0.9, yy * segH, 0);
            seg.add(sk);
          }
          group.add(seg);
          arm.push(seg);
        }
        v.arms.push(arm);
      }
      if (h.type === 'titan') {
        // A hill of a back out of the sea: lumpy, ridged with spines, crusted pale at the crown.
        const geo = new THREE.SphereGeometry(42, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          const bump = 1 + 0.07 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17 - y * 0.2) + 0.04 * Math.sin(x * 0.6 + y * 0.5);
          pos.setXYZ(i, x * bump, y * bump * 0.85, z * bump);
        }
        geo.computeVertexNormals();
        const dome = new THREE.Mesh(paint(geo, 0x050d10, 0x23403e), this.matSmooth);
        dome.position.y = -6;
        group.add(dome);
        v.dome = dome;
        for (let i = 0; i < 9; i++) {
          const spine = new THREE.Mesh(paint(new THREE.ConeGeometry(2.2 - i * 0.12, 9 - Math.abs(i - 4) * 0.9, 5), 0x0a1a1c, 0x8a9a92), this.matSmooth);
          const a = -0.9 + (i / 8) * 1.8;
          spine.position.set(Math.sin(a) * 30 * 0.4, 28 + Math.cos(a) * 4 - Math.abs(i - 4) * 1.2, Math.cos(a) * 30 * 0.4 - 6);
          spine.rotation.set(-0.35, 0, Math.sin(a) * 0.4);
          group.add(spine);
        }
      }
    } else if (h.type === 'moths') {
      return null;
    }
    this.scene.add(group);
    this.hostiles.set(h.id, v);
    return v;
  }

  updateHostiles(state, dt, time, storm) {
    const seen = new Set();
    for (const h of state.hostiles) {
      if (h.st === 'gone' || h.type === 'moths') continue;
      const v = this.hostileVisual(h);
      if (!v) continue;
      seen.add(h.id);
      v.t += dt;
      const tell = h.st === 'tell';
      if (h.type === 'drowned') {
        if (h.st === 'door') {
          v.group.visible = false;
          continue;
        }
        v.group.visible = !tell;
        // From the reef to the tower base: the climb.
        const p = h.p || 0;
        const x = h.x * (1 - p) + 6 * p * Math.sign(h.x || 1);
        const z = h.z * (1 - p) + 6 * p * Math.sign(h.z || 1);
        v.group.position.set(x, this.waterY(x, z, storm) + 0.2 + p * 2.5, z);
        v.group.rotation.y = Math.atan2(-x, -z);
        for (let i = 0; i < v.parts.length; i++) {
          const alive = h.b[i] < 2.5;
          v.parts[i].visible = alive;
          if (!alive) continue;
          v.parts[i].position.y = Math.abs(Math.sin(time * 4 + i)) * 0.3;
          v.parts[i].rotation.x = -0.4 + Math.sin(time * 4 + i) * 0.1;
          const w = v.group.position;
          const e = v.parts[i].position;
          const ex = w.x + Math.cos(v.group.rotation.y) * e.x + Math.sin(v.group.rotation.y) * e.z;
          const ez = w.z - Math.sin(v.group.rotation.y) * e.x + Math.cos(v.group.rotation.y) * e.z;
          const burn = h.b[i] / 2.5;
          this.glow(ex, w.y + 1.1 + e.y, ez, 0.75 + burn, 0.85 - burn * 0.5, 0.8 - burn * 0.6, 2.5 + burn * 4);
        }
        if (tell) this.glow(h.x, this.waterY(h.x, h.z, storm) + 0.5, h.z, 0.4, 0.6, 0.6, 8 + 4 * Math.sin(time * 10));
      } else if (h.type === 'siren') {
        v.group.visible = !tell && h.st !== 'fled';
        v.group.position.set(h.x, this.waterY(h.x, h.z, storm) + 0.6, h.z);
        v.group.rotation.y = Math.atan2(-h.x, -h.z);
        const sing = h.st === 'sing' && h.silenced <= 0 && h.scared <= 0;
        v.figure.rotation.z = sing ? Math.sin(time * 1.4) * 0.06 : 0;
        v.figure.scale.y = 1 + (sing ? Math.sin(time * 3) * 0.03 : 0);
        if (!tell) {
          // Her eyes: two cold sparks, wide open while she sings.
          const ey = v.group.position.y + 4.42;
          const facing = v.group.rotation.y;
          const hx = h.x - 0.61 * Math.cos(facing) + Math.sin(facing) * 0.3;
          const hz = h.z + 0.61 * Math.sin(facing) + Math.cos(facing) * 0.3;
          const ex = Math.cos(facing) * 0.17;
          const ez = -Math.sin(facing) * 0.17;
          const eyeI = sing ? 2.4 : 0.9;
          this.glow(hx + ex, ey, hz + ez, 0.25 * eyeI, 1.2 * eyeI, 1.0 * eyeI, 2.6);
          this.glow(hx - ex, ey, hz - ez, 0.25 * eyeI, 1.2 * eyeI, 1.0 * eyeI, 2.6);
          this.glow(h.x, v.group.position.y + 4.0, h.z, 0.12, 0.6, 0.5, sing ? 10 + 3 * Math.sin(time * 5) : 4);
          if (sing) for (let i = 0; i < 5; i++) {
            const ph = (time * 0.5 + i * 0.2) % 1;
            const a = i * 1.3 + time;
            this.glow(h.x + Math.cos(a) * (3 + ph * 20), v.group.position.y + 3.5 + ph * 6, h.z + Math.sin(a) * (3 + ph * 20), 0.2, 0.9 * (1 - ph), 0.8 * (1 - ph), 3 * (1 - ph));
          }
        }
        if (h.st === 'dead') v.group.position.y -= dt * 4;
      } else if (h.type === 'mimic') {
        const y = this.waterY(h.x, h.z, storm);
        v.group.position.set(h.x, y + 0.5, h.z);
        v.raft.visible = h.revealed === 1 || h.st === 'dead';
        if (h.st === 'dead') v.group.position.y -= dt * 3;
        if (!tell && h.st !== 'dead') {
          const halted = h.st === 'halted';
          const flick = halted ? (Math.sin(time * 20) > 0 ? 1 : 0.2) : 1;
          const k = h.labelled ? 0.6 : 1;
          const c = halted ? [0.4, 0.7, 1] : [1, 1, 1];
          this.glow(h.x - 3, y + 1.6, h.z, 1 * k * flick, 0.15 * k, 0.1 * k, 4);
          this.glow(h.x + 3, y + 1.6, h.z, 0.1 * k, 0.9 * k * flick, 0.5 * k, 4);
          this.glow(h.x, y + 5, h.z, c[0] * k * flick, c[1] * k * flick, c[2] * k, 5);
        }
      } else if (h.type === 'wraith') {
        v.group.visible = !tell;
        v.group.position.set(h.x, 0, h.z);
        v.fog.material.uniforms.uCentre.value.set(h.x, 0, h.z);
      } else if (h.type === 'kraken') {
        v.group.visible = !tell;
        this.layArm(v.arms[0], h.x, h.z, 0, this.site.towerHeight - 9, 0, time, 3.0, storm, 1, 6.2);
        if (tell) this.glow(h.x, this.waterY(h.x, h.z, storm) + 0.3, h.z, 0.5, 0.75, 0.7, 14 + 6 * Math.sin(time * 12));
      } else if (h.type === 'titan') {
        v.group.visible = !tell;
        v.group.position.set(h.x, this.waterY(h.x, h.z, storm) - 2, h.z);
        const y = v.group.position.y;
        // It faces the tower. Eyes always (blazing while their face is up); arms in phase two; the maw and lures in three.
        const fd = Math.hypot(h.x, h.z) || 1;
        const fx = -h.x / fd;
        const fz = -h.z / fd;
        v.group.rotation.y = Math.atan2(fx, fz);
        const eye = h.phase === 1 ? 1.6 : 0.7;
        const pulse = 0.75 + 0.25 * Math.sin(time * 2);
        for (const sgn of [-1, 1]) {
          const ex = h.x + fx * 33 + fz * sgn * 11;
          const ez = h.z + fz * 33 - fx * sgn * 11;
          this.glow(ex, y + 24, ez, 1.8 * eye, 0.62 * eye * pulse, 0.12 * eye, 30);
          this.glow(ex, y + 24, ez, 1.4 * eye, 1.0 * eye, 0.6 * eye, 9);
        }
        for (let a = 0; a < 2; a++) {
          const arm = v.arms[a];
          const show = h.phase === 2;
          for (const s of arm) s.visible = show;
          if (show) this.layArm(arm, h.x + (a ? 20 : -20), h.z - 10, 0, 10, 0, time + a * 2, 14, storm, 0.6);
        }
        if (h.phase === 3) {
          this.glow(h.x, y + 20, h.z, 0.3, 0.95, 0.85, 60 + 15 * Math.sin(time * 3));
          for (const l of h.lures) this.glow(l.x, this.waterY(l.x, l.z, storm) + 1, l.z, l.hit ? 1 : 0.4, l.hit ? 0.4 : 0.9, l.hit ? 0.1 : 0.8, l.hit ? 6 : 16 + 6 * Math.sin(time * 5));
        }
      }
    }
    for (const id of [...this.hostiles.keys()]) if (!seen.has(id)) this.removeVisual(this.hostiles, id);
  }

  /**
   * Lays segments along a writhing curve from the water (x, z) up toward the tower. With `wrap` (a radius), once the
   * arm reaches the tower it coils round it at that radius instead of going through it.
   */
  layArm(segs, x, z, tx, ty, tz, time, segLen, storm, bend, wrap = 0) {
    const n = segs.length;
    const y0 = this.waterY(x, z, storm);
    let px = x;
    let py = y0 - 1;
    let pz = z;
    let coiling = false;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const toX = tx - px;
      const toY = ty + 6 - py;
      const toZ = tz - pz;
      const len = Math.hypot(toX, toY, toZ) || 1;
      const wob = Math.sin(time * 1.7 + i * 0.9) * 0.5 * bend;
      let dx = (toX / len) * (0.5 + t * 0.5) + wob * 0.3;
      let dy = 1 - t * 0.8 + Math.cos(time * 1.3 + i) * 0.2 * bend;
      let dz = (toZ / len) * (0.5 + t * 0.5) + Math.cos(time * 1.9 + i * 0.7) * 0.5 * bend;
      if (wrap > 0) {
        const rx = px - tx;
        const rz = pz - tz;
        const rd = Math.hypot(rx, rz) || 1;
        if (rd < wrap + 2.5) coiling = true;
        if (coiling) {
          // Round the tower: along its circumference, pulled back to the wrap radius, climbing a little.
          dx = -rz / rd + (rx / rd) * (wrap - rd) * 0.4 + wob * 0.1;
          dz = rx / rd + (rz / rd) * (wrap - rd) * 0.4;
          dy = 0.18 + Math.sin(time * 1.1 + i) * 0.05 * bend;
        }
      }
      const dl = Math.hypot(dx, dy, dz) || 1;
      const nx = px + (dx / dl) * segLen;
      const ny = py + (dy / dl) * segLen;
      const nz = pz + (dz / dl) * segLen;
      const seg = segs[i];
      seg.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      seg.lookAt(nx, ny, nz);
      seg.rotateX(Math.PI / 2);
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  updateCrates(state, storm) {
    const seen = new Set();
    for (const c of state.crates) {
      seen.add(c.id);
      let v = this.crates.get(c.id);
      if (!v) {
        const group = new THREE.Mesh(paint(new THREE.BoxGeometry(2.2, 1.6, 1.6), 0x5a4330, 0x8a7258), this.mat);
        this.scene.add(group);
        v = { group };
        this.crates.set(c.id, v);
      }
      v.group.position.set(c.x, this.waterY(c.x, c.z, storm) + 0.3, c.z);
      v.group.rotation.set(Math.sin(this.time + c.x) * 0.2, c.x * 0.1, Math.cos(this.time * 1.3 + c.z) * 0.15);
      const lit = Math.min(1, c.lit / 2);
      this.glow(c.x, v.group.position.y + 1.2, c.z, 0.95, 0.7 + lit * 0.3, 0.3, 4 + lit * 10);
    }
    for (const id of [...this.crates.keys()]) if (!seen.has(id)) this.removeVisual(this.crates, id);
  }

  updateFlares(state, dt) {
    const seen = new Set();
    for (const p of state.pools) {
      seen.add(p.id);
      let v = this.flares.get(p.id);
      if (!v) {
        const group = new THREE.Group();
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sprite.scale.set(12, 12, 1);
        group.add(sprite);
        this.scene.add(group);
        v = { group, sprite, smoke: 0 };
        this.flares.set(p.id, v);
      }
      const y = this.waterY(p.x, p.z, state.weather.storm);
      v.group.position.set(p.x, y + 2.5, p.z);
      v.sprite.material.opacity = Math.min(1, p.life / 3) * (0.8 + 0.2 * Math.sin(this.time * 30));
      // Smoke drifting up and away.
      for (let i = 0; i < 6; i++) {
        const ph = (this.time * 0.4 + i * 0.17) % 1;
        this.glow(p.x + Math.sin(i * 2) * 2 + ph * 6, y + 3 + ph * 12, p.z + Math.cos(i * 2) * 2 + ph * 4, 0.3 * (1 - ph), 0.25 * (1 - ph), 0.2 * (1 - ph), 10 + ph * 14);
      }
      this.glow(p.x, y + 2.5, p.z, 1, 0.75, 0.4, 20);
    }
    for (const id of [...this.flares.keys()]) if (!seen.has(id)) this.removeVisual(this.flares, id);
  }

  updateShots(state, dt) {
    // Harpoons in flight: a streak from the gallery to where they land.
    const seen = new Set();
    for (const s of state.shots) {
      seen.add(s.id);
      let v = this.shots.find((x) => x.id === s.id);
      if (!v) {
        const line = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.06, 0.06, 1, 4), 0xd0d8dc), this.matSmooth);
        this.scene.add(line);
        v = { id: s.id, line };
        this.shots.push(v);
      }
      const t = 1 - s.life / 0.6;
      const from = new THREE.Vector3(Math.sin(Math.atan2(s.x, s.z)) * this.site.galleryRadius, this.site.towerHeight - 0.5, Math.cos(Math.atan2(s.x, s.z)) * this.site.galleryRadius);
      const to = new THREE.Vector3(s.x, this.waterY(s.x, s.z, state.weather.storm) + 1, s.z);
      const arcY = Math.sin(t * Math.PI) * 10;
      const head = from.clone().lerp(to, t);
      head.y += arcY;
      const tail = from.clone().lerp(to, Math.max(0, t - 0.15));
      tail.y += Math.sin(Math.max(0, t - 0.15) * Math.PI) * 10;
      v.line.position.copy(head).lerp(tail, 0.5);
      v.line.scale.y = Math.max(1, head.distanceTo(tail));
      v.line.lookAt(to.x, to.y + arcY, to.z);
      v.line.rotateX(Math.PI / 2);
      this.glow(head.x, head.y, head.z, 0.9, 0.95, 1, 5);
    }
    for (let i = this.shots.length - 1; i >= 0; i--) if (!seen.has(this.shots[i].id)) {
      this.scene.remove(this.shots[i].line);
      this.shots[i].line.geometry.dispose();
      this.shots.splice(i, 1);
    }
  }
}
