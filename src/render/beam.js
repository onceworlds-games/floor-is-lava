// The beam itself: an additive volumetric cone from the lens to the pool. Its walls fade where they are seen
// edge-on (so it reads as a shaft of lit air, not a cone of glass), it is hottest at the lens, the haze drifts
// through it and the rain flashes in it. Dust motes hang in the light near the lens. The lamp's glow and its
// flare when the light looks straight at you.
import * as THREE from 'three';
import { LIGHT, NOISE } from './shaders.js';

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// Light scattered toward the eye by the air in the shaft: the view ray's span inside the cone, found exactly, and
// the in-scatter integrated along it. A cone of light has its power spread over a disc of radius r, so each metre
// of lit air glows as 1/r^2: hot by the lens, faint far out, soft at the edges, bright when you look down it.
const FRAG = /* glsl */ `
precision highp float;
${NOISE}
varying vec3 vWorld;
uniform vec3 uColor; uniform float uTime; uniform float uIntensity; uniform vec3 uCamera; uniform float uStrobe; uniform float uHaze;
uniform float uRain; uniform float uFlash; uniform vec3 uApex; uniform vec3 uAxis; uniform float uLen; uniform float uTan; uniform float uNear;
uniform float uCamInside;
vec2 coneSpan(vec3 C, vec3 D, float tMax) {
  vec3 L = C - uApex;
  float dA = dot(D, uAxis);
  float LA = dot(L, uAxis);
  float c2 = 1.0 / (1.0 + uTan * uTan);
  float a = dA * dA - c2;
  float b = 2.0 * (dA * LA - c2 * dot(D, L));
  float c = LA * LA - c2 * dot(L, L);
  float lo = -1e9;
  float hi = 1e9;
  float disc = b * b - 4.0 * a * c;
  if (abs(a) < 1e-6) {
    if (abs(b) > 1e-9) { if (b > 0.0) lo = -c / b; else hi = -c / b; }
    else if (c < 0.0) return vec2(1.0, 0.0);
  } else if (disc < 0.0) {
    if (a < 0.0) return vec2(1.0, 0.0);
  } else {
    float sq = sqrt(disc);
    float r1 = (-b - sq) / (2.0 * a);
    float r2 = (-b + sq) / (2.0 * a);
    if (r1 > r2) { float t = r1; r1 = r2; r2 = t; }
    if (a < 0.0) { lo = r1; hi = r2; }
    else if (dA * (r2 + 1.0) + LA >= 0.0) lo = r2;
    else hi = r1;
  }
  if (abs(dA) > 1e-6) {
    float tA = -LA / dA;
    float tB = (uLen - LA) / dA;
    lo = max(lo, min(tA, tB));
    hi = min(hi, max(tA, tB));
  } else if (LA < 0.0 || LA > uLen) return vec2(1.0, 0.0);
  return vec2(max(lo, 0.0), hi);
}
void main() {
  // Each covered pixel once: the near wall from outside, the far wall from inside. (The mesh is wound with its
  // front faces inward, so from outside the near wall shows its back.)
  if (gl_FrontFacing != (uCamInside > 0.5)) discard;
  vec3 D = vWorld - uCamera;
  float tMax = length(D);
  D /= tMax;
  vec2 span = coneSpan(uCamera, D, tMax);
  float chord = span.y - span.x;
  if (chord <= 0.0) discard;
  float dA = dot(D, uAxis);
  float LA = dot(uCamera - uApex, uAxis);
  float x0 = max(dA * span.x + LA, uNear);
  float x1 = max(dA * span.y + LA, uNear);
  float t2 = uTan * uTan;
  // Integral of 1 / r(t)^2 along the chord, with r = x tan.
  float integ = abs(dA) > 0.02 ? abs(1.0 / x0 - 1.0 / x1) / (abs(dA) * t2) : chord / (x0 * x1 * t2);
  vec3 mid = uCamera + D * (span.x + span.y) * 0.5;
  // A soft profile across the beam (brightest on its axis), so its edges melt into the dark instead of ending.
  float xm = max(dot(mid - uApex, uAxis), uNear);
  float rho = length((mid - uApex) - uAxis * dot(mid - uApex, uAxis));
  float profile = exp(-2.2 * (rho * rho) / (xm * xm * t2 + 1.0));
  integ *= profile;
  float n = fbm(mid.xz * 0.045 + vec2(uTime * 0.12, -uTime * 0.08) + mid.y * 0.03);
  float haze = mix(0.55, 1.45, n) * uHaze;
  float streak = 0.0;
  if (uRain > 0.0) {
    vec2 rp = vec2(mid.x * 2.3 + mid.z * 1.7, mid.y * 0.18 + uTime * 3.2);
    streak = smoothstep(0.8, 1.0, vnoise(rp * vec2(6.0, 1.0))) * uRain * 1.2;
  }
  float strobe = uStrobe > 0.5 ? step(0.5, fract(uTime * 6.0)) : 1.0;
  // A soft knee: the air near the lens glows without turning into a solid shape.
  float a = uIntensity * 0.42 * (1.0 - exp(-integ * 0.7)) * (haze + streak) * strobe;
  gl_FragColor = vec4(uColor * a * (1.0 + uFlash * 0.5), 1.0);
}
`;

const MOTE_VERT = /* glsl */ `
attribute float seed; uniform vec3 uOrigin; uniform vec3 uAxis; uniform float uLen; uniform float uRadius; uniform float uTime; uniform float uScale;
varying float vA;
void main() {
  float t = fract(seed * 7.13 + uTime * 0.012 * (0.5 + seed));
  float along = 4.0 + t * uLen;
  vec3 side = normalize(cross(uAxis, vec3(0.0, 1.0, 0.0)) + 1e-4);
  vec3 up = normalize(cross(side, uAxis));
  float a = seed * 40.0 + uTime * 0.3 * (seed - 0.5);
  float r = uRadius * (along / max(uLen, 1.0)) * sqrt(fract(seed * 13.7)) * 0.9;
  vec3 p = uOrigin + uAxis * along + (side * cos(a) + up * sin(a)) * r;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
  gl_PointSize = min(5.0, uScale * (0.6 + seed) / max(1.0, -mv.z));
  vA *= smoothstep(2.0, 7.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const MOTE_FRAG = /* glsl */ `
precision highp float; varying float vA; uniform vec3 uColor; uniform float uIntensity;
void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)); gl_FragColor = vec4(uColor * a * a * vA * uIntensity * 0.9, 1.0); }
`;

function coneGeometry(segments = 32) {
  // A unit cone: apex at the origin, base ring at z = 1 with radius 1 (scaled per frame).
  const positions = [];
  const along = [];
  const idx = [];
  positions.push(0, 0, 0);
  along.push(0);
  const rings = 8;
  for (let r = 1; r <= rings; r++) {
    const t = (r / rings) ** 1.4;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * t, Math.sin(a) * t, t);
      along.push(t);
    }
  }
  for (let i = 0; i < segments; i++) idx.push(0, 1 + i, 1 + ((i + 1) % segments));
  for (let r = 0; r < rings - 1; r++) {
    const a0 = 1 + r * segments;
    const b0 = 1 + (r + 1) * segments;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j);
    }
  }
  // A cap over the open end, so the cone is closed: seen from anywhere outside, its outward faces cover it once.
  const centre = positions.length / 3;
  positions.push(0, 0, 1);
  along.push(1);
  const last = 1 + (rings - 1) * segments;
  for (let i = 0; i < segments; i++) idx.push(centre, last + ((i + 1) % segments), last + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

const MOTES = 180;

export class Beam {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) }, uTime: LIGHT.uTime, uIntensity: { value: 0 }, uCamera: LIGHT.uCamera, uStrobe: { value: 0 }, uHaze: { value: 1 },
        uRain: { value: 0 }, uFlash: LIGHT.uFlash, uApex: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 1 }, uTan: { value: 0.1 }, uNear: { value: 1 }, uCamInside: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cone = new THREE.Mesh(coneGeometry(), this.material);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 5;
    scene.add(this.cone);
    // Dust and droplets hanging in the light near the lens.
    const seeds = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) seeds[i] = (i * 0.618034) % 1;
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: { uOrigin: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 60 }, uRadius: { value: 6 }, uTime: LIGHT.uTime, uScale: { value: 60 }, uColor: { value: new THREE.Color(1, 1, 1) }, uIntensity: { value: 0 } },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    scene.add(this.motes);
    // A soft glow at the lens, and a flare (a horizontal streak) when the beam faces the eye.
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    this.glow.scale.set(9, 9, 1);
    this.glow.renderOrder = 7;
    scene.add(this.glow);
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTexture(), color: 0xfff0d8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.flare.renderOrder = 8;
    scene.add(this.flare);
    this.target = new THREE.Vector3();
    this.origin = new THREE.Vector3(0, 34, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.axis = new THREE.Vector3();
    this.toCam = new THREE.Vector3();
  }

  /**
   * origin: the lens; target: the pool centre; r: pool radius; I: intensity; lens colour; sweep: the wedge
   * turning on its own (then the cone points along the sweep azimuth and reaches far).
   */
  update(origin, target, r, I, color, { strobe = 0, sweep = false, haze = 1, quality = 'high', rain = 0 } = {}) {
    this.origin.copy(origin);
    this.glow.position.copy(origin);
    const cam = LIGHT.uCamera.value;
    const camDist = cam.distanceTo(origin);
    this.glow.visible = camDist > 9;
    this.glow.material.opacity = Math.min(1, 0.35 + I * 0.45) * Math.min(1, (camDist - 9) / 20);
    this.glow.material.color.copy(color);
    const c = this.cone;
    c.visible = I > 0.01;
    this.motes.visible = I > 0.01 && quality !== 'low';
    this.flare.visible = false;
    if (I <= 0.01) return;
    this.material.uniforms.uColor.value.copy(color);
    const u = this.material.uniforms;
    // From the lamp room itself the eye sits at the apex: only a gentle haze down the shaft, never a glare.
    const atLens = camDist < 4;
    u.uIntensity.value = Math.min(2.5, I) * (sweep ? 1.3 : 1) * (atLens ? 0.18 : 1);
    u.uNear.value = atLens ? 8 : 2.5;
    u.uStrobe.value = strobe;
    u.uHaze.value = haze;
    u.uRain.value = quality === 'low' ? 0 : rain;
    const len = origin.distanceTo(target);
    const ax = target.x - origin.x, ay = target.y - origin.y, az = target.z - origin.z;
    const inside = atLens ? 1 : 0;
    c.position.copy(origin);
    c.lookAt(target);
    const cr = sweep ? Math.max(12, len * 0.06) : Math.max(1.5, r);
    c.scale.set(cr, cr, len);
    u.uApex.value.copy(origin);
    u.uAxis.value.set(ax, ay, az).normalize();
    u.uLen.value = len;
    u.uTan.value = cr / Math.max(1, len);
    // Is the eye inside the shaft? (Then only the far wall is drawn.)
    const along = (cam.x - origin.x) * u.uAxis.value.x + (cam.y - origin.y) * u.uAxis.value.y + (cam.z - origin.z) * u.uAxis.value.z;
    const off = Math.sqrt(Math.max(0, (cam.x - origin.x) ** 2 + (cam.y - origin.y) ** 2 + (cam.z - origin.z) ** 2 - along * along));
    u.uCamInside.value = along > 0 && along < len && off < along * u.uTan.value ? 1 : 0;
    // Motes along the first stretch of the shaft.
    this.axis.set(ax, ay, az).normalize();
    const mu = this.moteMat.uniforms;
    mu.uOrigin.value.copy(origin);
    mu.uAxis.value.copy(this.axis);
    mu.uLen.value = Math.min(len, 70);
    mu.uRadius.value = cr * Math.min(len, 70) / Math.max(len, 1);
    mu.uColor.value.copy(color);
    mu.uIntensity.value = Math.min(1.5, I) * (1 - 0.7 * inside);
    // Looking down the barrel: a flare across the lens.
    this.toCam.copy(cam).sub(origin).normalize();
    const facing = this.axis.dot(this.toCam);
    if (facing > 0.9 && camDist > 9) {
      const k = (facing - 0.9) / 0.1;
      this.flare.visible = true;
      this.flare.position.copy(origin);
      this.flare.scale.set(70 * k + 10, 6 + 6 * k, 1);
      this.flare.material.opacity = Math.min(1, k * k * Math.min(2, I));
      this.flare.material.color.copy(color);
    }
  }
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let streakTex = null;
function streakTexture() {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.scale(1, 0.125);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.restore();
  streakTex = new THREE.CanvasTexture(c);
  return streakTex;
}
