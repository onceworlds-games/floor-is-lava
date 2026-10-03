// Shared GLSL: the light model every surface uses (the beam pool, the sweep wedge, flare pools, the
// Tide-Wraith's fog, moonlight, lightning) plus noise and fog. Uniforms live in one object (LIGHT)
// that every material shares, so a frame updates them once.
import * as THREE from 'three';

export const LIGHT = {
  uPool: { value: new THREE.Vector4(0, 0, 90, 20) }, // x, y, z, radius
  uPoolI: { value: 0 },
  uLens: { value: new THREE.Color(1, 1, 1) },
  uSweep: { value: new THREE.Vector4(0, 1, Math.cos(0.21), 0) }, // sin az, cos az, cos half-angle, intensity
  uSweepReach: { value: 360 },
  uFlares: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uNFlares: { value: 0 },
  uWraiths: { value: [new THREE.Vector4(0, 0, 0, 0.3), new THREE.Vector4(0, 0, 0, 0.3)] },
  uNWraiths: { value: 0 },
  uHoles: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  uNHoles: { value: 0 },
  uFlash: { value: 0 },
  uMoon: { value: new THREE.Vector3(0.3, 0.6, 0.74).normalize() },
  uAmbient: { value: 0.07 },
  uLamp: { value: new THREE.Vector4(0, 34, 0, 0) }, // the lamp as a point light for the interior
  uFogColor: { value: new THREE.Color(0x0a1420) },
  uFogDensity: { value: 0.0022 },
  uTime: { value: 0 },
  uCamera: { value: new THREE.Vector3() },
  uStorm: { value: 0.2 },
  uDawn: { value: 0 },
};

export const LENS_COLORS = {
  white: new THREE.Color(0.93, 0.96, 1.0),
  amber: new THREE.Color(1.0, 0.72, 0.3),
  blue: new THREE.Color(0.45, 0.7, 1.0),
  red: new THREE.Color(1.0, 0.32, 0.22),
};

export const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; } return v; }
`;

export const LIGHT_GLSL = /* glsl */ `
uniform vec4 uPool; uniform float uPoolI; uniform vec3 uLens; uniform vec4 uSweep; uniform float uSweepReach;
uniform vec4 uFlares[4]; uniform int uNFlares; uniform vec4 uWraiths[2]; uniform int uNWraiths; uniform vec4 uHoles[2]; uniform int uNHoles;
uniform float uFlash; uniform vec3 uMoon; uniform float uAmbient; uniform vec4 uLamp; uniform vec3 uFogColor; uniform float uFogDensity;
uniform float uTime; uniform vec3 uCamera; uniform float uStorm; uniform float uDawn;

// How much of the beam reaches world point p (fog banks eat it, holes let it through).
float wraithPass(vec3 p) {
  float pass = 1.0;
  for (int i = 0; i < 2; i++) {
    if (i >= uNWraiths) break;
    vec4 w = uWraiths[i];
    float d = distance(p.xz, w.xy);
    if (d < w.z) {
      float inHole = 0.0;
      for (int j = 0; j < 2; j++) { if (j >= uNHoles) break; vec4 h = uHoles[j]; if (distance(p.xz, h.xy) < h.z) inHole = 1.0; }
      float edge = smoothstep(w.z, w.z * 0.7, d);
      pass *= mix(1.0, mix(w.w, 1.0, inHole), edge);
    }
  }
  return pass;
}

// The light falling on p from the lamp (spot pool or sweep wedge) and the flares: colour * intensity.
vec3 beamLight(vec3 p) {
  vec3 L = vec3(0.0);
  if (uPoolI > 0.0) {
    float d = distance(p.xz, uPool.xz);
    float r = uPool.w;
    float core = 1.0 - smoothstep(r * 0.85, r * 1.25, d);
    float halo = (1.0 - smoothstep(r, r * 3.0, d)) * 0.12;
    L += uLens * uPoolI * (core + halo);
  }
  if (uSweep.w > 0.0) {
    vec2 dir = normalize(p.xz + vec2(1e-4));
    float c = dot(dir, uSweep.xy);
    float dist = length(p.xz);
    float wedge = smoothstep(uSweep.z - 0.03, uSweep.z + 0.02, c);
    float reach = 1.0 - smoothstep(uSweepReach * 0.5, uSweepReach, dist);
    L += uLens * uSweep.w * wedge * reach * step(18.0, dist);
  }
  L *= wraithPass(p);
  for (int i = 0; i < 4; i++) {
    if (i >= uNFlares) break;
    vec4 f = uFlares[i];
    float d = distance(p.xz, f.xy);
    float k = 1.0 - smoothstep(f.z * 0.6, f.z * 1.3, d);
    L += vec3(1.0, 0.85, 0.6) * f.w * k;
  }
  return L;
}

// A surface shaded by the world: moon, beam, flares, the lamp room's glow, lightning; then fog.
vec3 shadeWorld(vec3 base, vec3 p, vec3 n, float emissive) {
  float moon = max(0.0, dot(n, uMoon));
  vec3 moonCol = vec3(0.55, 0.72, 0.9);
  vec3 col = base * (uAmbient + 0.16 * moon) * mix(1.0, 0.6, uStorm) * moonCol;
  vec3 bl = beamLight(p);
  vec3 toCam = normalize(uCamera - p);
  float facing = 0.35 + 0.65 * max(0.0, dot(n, toCam));
  col += base * bl * facing;
  if (uLamp.w > 0.0) {
    vec3 toLamp = uLamp.xyz - p;
    float dl = length(toLamp);
    float k = uLamp.w / (1.0 + dl * dl * 0.14) * max(0.2, dot(n, toLamp / max(dl, 0.01)));
    col += base * vec3(1.0, 0.72, 0.4) * k;
  }
  col += base * uFlash * vec3(0.8, 0.9, 1.0) * (0.4 + 0.6 * max(0.0, n.y));
  col = mix(col, base * vec3(1.0, 0.75, 0.5), uDawn * 0.6);
  col += base * emissive;
  float dist = distance(uCamera, p);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  vec3 fogCol = uFogColor + uFlash * 0.5 + bl * 0.08;
  return mix(col, fogCol, clamp(fog, 0.0, 1.0));
}
`;

export const VERT_WORLD = /* glsl */ `
varying vec3 vWorld; varying vec3 vColor; varying vec3 vNormal;
void main() {
  #ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
  #else
  mat4 m = modelMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vColor = color;
  vNormal = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const FRAG_WORLD = /* glsl */ `
precision highp float;
${NOISE}
${LIGHT_GLSL}
varying vec3 vWorld; varying vec3 vColor; varying vec3 vNormal;
uniform float uEmissive; uniform float uFlat;
void main() {
  vec3 n = normalize(vNormal);
  if (uFlat > 0.5) n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 col = shadeWorld(vColor, vWorld, n, uEmissive);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** One material for everything in the world that the beam can touch. Vertex colours carry the paint. */
export function worldMaterial({ emissive = 0, flat = true, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...LIGHT, uEmissive: { value: emissive }, uFlat: { value: flat ? 1 : 0 } },
    vertexShader: VERT_WORLD,
    fragmentShader: FRAG_WORLD,
    side,
    vertexColors: true,
  });
}

/** Sets a flat colour on every vertex of a geometry (cloning it so shared geometry stays clean). */
export function paint(geometry, hex, hexB = null) {
  const g = geometry;
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const a = new THREE.Color(hex);
  const b = hexB !== null ? new THREE.Color(hexB) : a;
  const pos = g.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < count; i++) {
    const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 0;
    colors[i * 3] = a.r + (b.r - a.r) * t;
    colors[i * 3 + 1] = a.g + (b.g - a.g) * t;
    colors[i * 3 + 2] = a.b + (b.b - a.b) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function setLens(lens) {
  LIGHT.uLens.value.copy(LENS_COLORS[lens] || LENS_COLORS.white);
}
