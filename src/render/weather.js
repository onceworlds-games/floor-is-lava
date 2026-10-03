// Rain streaks around the camera (moved entirely in the shader; they fall outside the lamp room's glass too),
// lightning (a glowing forked bolt and the flash), and spray bursting up the rock in heavy seas.
import * as THREE from 'three';
import { LIGHT } from './shaders.js';

const RAIN_VERT = /* glsl */ `
attribute float seed; uniform vec3 uCentre; uniform float uTime; uniform float uWind; uniform float uSpeed; uniform float uHole;
varying float vEnd; varying float vLit;
// The beam's pool lights the drops that fall through it.
uniform vec4 uPool; uniform float uPoolI;
void main() {
  // position.xz: offset in the box; position.y: 0 (head) or 1 (tail). seed: this drop's phase.
  float fall = mod(seed * 40.0 + uTime * uSpeed, 40.0);
  float y = 40.0 - fall;
  float tail = position.y;
  vec3 p = uCentre + vec3(position.x + uWind * (40.0 - y) * 0.35 + tail * uWind * 1.2, y - 20.0 + tail * 1.6, position.z);
  vEnd = tail;
  vLit = uPoolI * (1.0 - smoothstep(uPool.w * 0.6, uPool.w * 1.8, distance(p.xz, uPool.xz)));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  // Never inside the tower: from the lamp room the rain falls beyond the glass.
  if (uHole > 0.0 && length(p.xz) < uHole) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const RAIN_FRAG = /* glsl */ `precision highp float; varying float vEnd; varying float vLit; uniform float uAlpha; uniform float uLit; uniform float uFlash;
void main() { gl_FragColor = vec4(vec3(0.16, 0.22, 0.3) * uAlpha * (1.0 - vEnd * 0.7) * (0.12 + uLit + vLit * 3.5 + uFlash * 4.0), 1.0); }`;

const BOLT_FRAG = /* glsl */ `precision highp float; varying float vEdge; uniform float uI;
void main() { float k = 1.0 - abs(vEdge); gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * uI * (k * k * 6.0 + k * 2.0), 1.0); }`;
const BOLT_VERT = /* glsl */ `attribute float edge; varying float vEdge; void main() { vEdge = edge; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;

const SPRAY_VERT = /* glsl */ `
attribute float seed; uniform float uTime; uniform float uStorm; uniform float uScale; uniform vec4 uPool; uniform float uPoolI;
varying float vA; varying float vLit;
void main() {
  // Bursts at the foot of the rock: each particle belongs to a burst that comes round every few seconds.
  float period = 3.4 + seed * 2.2;
  float t = fract(uTime / period + seed * 3.17);
  float ang = floor(uTime / period + seed * 3.17) * 2.39 + seed * 0.9;
  float r = 7.5 + fract(seed * 17.0) * 2.0;
  vec3 base = vec3(sin(ang) * r, 0.4, cos(ang) * r);
  vec3 vel = vec3(sin(ang) * 2.0 + (fract(seed * 31.0) - 0.5) * 6.0, 9.0 + fract(seed * 7.0) * 8.0, cos(ang) * 2.0 + (fract(seed * 13.0) - 0.5) * 6.0) * (0.6 + uStorm);
  float tt = t * 2.0;
  vec3 p = base + vel * tt + vec3(0.0, -9.8, 0.0) * tt * tt * 0.5;
  vA = (1.0 - t) * smoothstep(0.0, 0.05, t) * smoothstep(0.35, 0.9, uStorm) * step(0.0, p.y);
  vLit = uPoolI * (1.0 - smoothstep(uPool.w, uPool.w * 2.5, distance(p.xz, uPool.xz)));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = min(9.0, uScale * (0.5 + fract(seed * 5.0)) / max(1.0, -mv.z));
  vA *= smoothstep(3.0, 12.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const SPRAY_FRAG = /* glsl */ `precision highp float; varying float vA; varying float vLit; uniform float uFlash;
void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = 1.0 - smoothstep(0.2, 1.0, d);
  gl_FragColor = vec4(vec3(0.5, 0.62, 0.7) * a * vA * (0.06 + vLit * 1.5 + uFlash * 1.2), 1.0); }`;

const BOLT_POINTS = 18;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.count = 2600;
    const pos = new Float32Array(this.count * 2 * 3);
    const seed = new Float32Array(this.count * 2);
    // A fixed scatter (not random): the same rain on every page and every run.
    for (let i = 0; i < this.count; i++) {
      const x = (((i * 0.754877666) % 1) - 0.5) * 60;
      const z = (((i * 0.569840291) % 1) - 0.5) * 60;
      const s = (i * 0.618034) % 1;
      pos.set([x, 0, z, x, 1, z], i * 6);
      seed[i * 2] = s;
      seed[i * 2 + 1] = s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uCentre: { value: new THREE.Vector3() }, uTime: LIGHT.uTime, uWind: { value: 0 }, uSpeed: { value: 26 }, uAlpha: { value: 0.3 }, uLit: { value: 0 }, uHole: { value: 0 }, uPool: LIGHT.uPool, uPoolI: LIGHT.uPoolI, uFlash: LIGHT.uFlash },
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 7;
    scene.add(this.rain);
    // Lightning: a forked ribbon, rebuilt on each strike to face the camera.
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 2 * 2 * 3), 3));
    const edge = new Float32Array(BOLT_POINTS * 2 * 2);
    for (let i = 0; i < BOLT_POINTS * 2; i++) {
      edge[i * 2] = -1;
      edge[i * 2 + 1] = 1;
    }
    bg.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
    const idx = [];
    for (const off of [0, BOLT_POINTS]) for (let i = 0; i < BOLT_POINTS - 1; i++) {
      const a = (off + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    bg.setIndex(idx);
    this.boltMat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 } }, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.bolt = new THREE.Mesh(bg, this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.renderOrder = 9;
    this.bolt.visible = false;
    scene.add(this.bolt);
    // Spray up the rock.
    const sn = 220;
    const sseed = new Float32Array(sn);
    for (let i = 0; i < sn; i++) sseed[i] = (i * 0.381966) % 1;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sn * 3), 3));
    sg.setAttribute('seed', new THREE.BufferAttribute(sseed, 1));
    this.sprayMat = new THREE.ShaderMaterial({ uniforms: { uTime: LIGHT.uTime, uStorm: LIGHT.uStorm, uScale: { value: 900 }, uPool: LIGHT.uPool, uPoolI: LIGHT.uPoolI, uFlash: LIGHT.uFlash }, vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.spray = new THREE.Points(sg, this.sprayMat);
    this.spray.frustumCulled = false;
    this.spray.renderOrder = 6;
    scene.add(this.spray);
    this.boltLife = 0;
    this.flash = 0;
    this.quality = 'high';
    this.seed = 1;
    this.v = new THREE.Vector3();
  }

  setQuality(q) {
    this.quality = q;
  }

  rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** A strike at (x, z): a bolt from the cloud base with one fork, and the flash. */
  strike(x, z, near, camera = null) {
    const p = this.bolt.geometry.attributes.position.array;
    const cam = camera ? camera.position : LIGHT.uCamera.value;
    const top = 260;
    const path = (sx, sy, sz, ex, ey, ez, jitter, out, width) => {
      const pts = [];
      for (let i = 0; i < BOLT_POINTS; i++) {
        const t = i / (BOLT_POINTS - 1);
        const j = i === 0 || i === BOLT_POINTS - 1 ? 0 : 1;
        pts.push([sx + (ex - sx) * t + (this.rnd() - 0.5) * jitter * j, sy + (ey - sy) * t, sz + (ez - sz) * t + (this.rnd() - 0.5) * jitter * j]);
      }
      for (let i = 0; i < BOLT_POINTS; i++) {
        const [px, py, pz] = pts[i];
        const nx = pts[Math.min(BOLT_POINTS - 1, i + 1)];
        const pv = pts[Math.max(0, i - 1)];
        // The ribbon's width lies across the bolt, facing the camera.
        const dx = nx[0] - pv[0], dy = nx[1] - pv[1], dz = nx[2] - pv[2];
        const vx = cam.x - px, vy = cam.y - py, vz = cam.z - pz;
        let sx2 = dy * vz - dz * vy, sy2 = dz * vx - dx * vz, sz2 = dx * vy - dy * vx;
        const l = Math.hypot(sx2, sy2, sz2) || 1;
        const w = width * (1 - (i / BOLT_POINTS) * 0.5);
        sx2 = (sx2 / l) * w; sy2 = (sy2 / l) * w; sz2 = (sz2 / l) * w;
        p.set([px - sx2, py - sy2, pz - sz2, px + sx2, py + sy2, pz + sz2], (out + i) * 6);
      }
      return pts;
    };
    const sx = x + (this.rnd() - 0.5) * 70;
    const sz = z + (this.rnd() - 0.5) * 70;
    const main = path(sx, top, sz, x, 0, z, 30, 0, near ? 1.6 : 1.1);
    const k = 5 + Math.floor(this.rnd() * 6);
    const b = main[k];
    path(b[0], b[1], b[2], b[0] + (this.rnd() - 0.5) * 90, b[1] * 0.35, b[2] + (this.rnd() - 0.5) * 90, 18, BOLT_POINTS, 0.6);
    this.bolt.geometry.attributes.position.needsUpdate = true;
    this.bolt.visible = true;
    this.boltLife = 0.32;
    this.flash = Math.max(this.flash, near ? 1 : 0.6);
    LIGHT.uFlashPos.value.set(x, 200, z);
  }

  update(dt, camera, weather, reducedMotion, inside) {
    const rain = weather.rain || 0;
    const n = this.quality === 'low' ? 600 : this.quality === 'medium' ? 1400 : 2600;
    const show = rain > 0.05;
    this.rain.visible = show;
    if (show) {
      this.rain.geometry.setDrawRange(0, Math.floor(n * rain) * 2);
      this.rainMat.uniforms.uCentre.value.copy(camera.position);
      this.rainMat.uniforms.uWind.value = weather.storm * 0.9;
      this.rainMat.uniforms.uAlpha.value = (0.5 + 0.5 * rain) * (inside ? 0.8 : 1);
      this.rainMat.uniforms.uSpeed.value = 22 + weather.storm * 12;
      this.rainMat.uniforms.uLit.value = Math.min(1, LIGHT.uPoolI.value * 0.25);
      this.rainMat.uniforms.uHole.value = inside ? 3.7 : 0;
    }
    this.spray.visible = this.quality !== 'low' && weather.storm > 0.35;
    this.boltLife = Math.max(0, this.boltLife - dt);
    this.bolt.visible = this.boltLife > 0;
    this.boltMat.uniforms.uI.value = this.boltLife > 0 ? (0.55 + 0.45 * Math.sin(this.boltLife * 90)) * (reducedMotion ? 0.4 : 1) : 0;
    this.flash = Math.max(0, this.flash - dt * 4);
    LIGHT.uFlash.value = reducedMotion ? Math.min(0.2, this.flash) : this.flash;
  }
}
