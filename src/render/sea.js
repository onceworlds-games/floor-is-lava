// The sea: one plane, Gerstner waves in the vertex shader (four components, amplitude from the storm), and a
// fragment shader in linear light: a near-black body with teal light in the crests, the dark sky and the moon's
// path in the fresnel, the lamp's own glint, the beam's pool burning on the water with sparks of spray, foam on
// the crests and the fog that swallows the horizon into the sky.
import * as THREE from 'three';
import { LIGHT, NOISE, LIGHT_GLSL } from './shaders.js';

const VERT = /* glsl */ `
uniform float uTime; uniform float uStorm; uniform float uWaveMul;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
const vec2 D0 = vec2(0.8, 0.6); const vec2 D1 = vec2(-0.55, 0.83); const vec2 D2 = vec2(0.98, -0.2); const vec2 D3 = vec2(0.3, -0.95);
void gerstner(vec2 d, float wl, float steep, float speed, float amp, vec2 p, inout vec3 pos, inout vec3 tangent, inout vec3 binormal) {
  float k = 6.28318 / wl;
  float f = k * (dot(d, p) - speed * uTime);
  float a = amp;
  float q = steep / (k * a + 1e-4) * amp;
  pos.x += d.x * q * cos(f);
  pos.z += d.y * q * cos(f);
  pos.y += a * sin(f);
  tangent += vec3(-d.x * d.x * q * k * sin(f), d.x * a * k * cos(f), -d.x * d.y * q * k * sin(f));
  binormal += vec3(-d.x * d.y * q * k * sin(f), d.y * a * k * cos(f), -d.y * d.y * q * k * sin(f));
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz;
  vec3 pos = vec3(p.x, 0.0, p.y);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float s = (0.25 + 0.75 * uStorm) * uWaveMul * smoothstep(5.0, 14.0, length(p));
  gerstner(D0, 38.0, 0.35, 5.5, 1.1 * s, p, pos, tangent, binormal);
  gerstner(D1, 22.0, 0.3, 4.2, 0.7 * s, p, pos, tangent, binormal);
  gerstner(D2, 11.0, 0.25, 3.1, 0.35 * s, p, pos, tangent, binormal);
  gerstner(D3, 5.5, 0.2, 2.2, 0.16 * s, p, pos, tangent, binormal);
  vNormal = normalize(cross(binormal, tangent));
  vWorld = pos;
  vCrest = clamp((pos.y / (2.3 * s + 0.2)) * 0.5 + 0.5, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
${NOISE}
${LIGHT_GLSL}
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyLow; uniform vec3 uSkyHigh; uniform vec3 uFoam; uniform float uDetail;
uniform vec4 uLampPos;
void main() {
  vec3 n = normalize(vNormal);
  float dist = distance(uCamera, vWorld);
  float near = 1.0 - smoothstep(60.0, 320.0, dist);
  if (uDetail > 0.5) {
    // Ripples on the swell: two scales of noise slopes, faded with distance so the far sea stays calm.
    float e = 0.6;
    vec2 q = vWorld.xz * 0.35 + vec2(uTime * 0.6, -uTime * 0.4);
    float h0 = fbm(q); float hx = fbm(q + vec2(e, 0.0)); float hz = fbm(q + vec2(0.0, e));
    vec2 q2 = vWorld.xz * 1.3 + vec2(-uTime * 0.9, uTime * 0.7);
    float g0 = vnoise(q2); float gx = vnoise(q2 + vec2(0.4, 0.0)); float gz = vnoise(q2 + vec2(0.0, 0.4));
    vec3 dn = vec3((h0 - hx) * 0.9 + (g0 - gx) * 0.35, 0.0, (h0 - hz) * 0.9 + (g0 - gz) * 0.35) * (0.7 + 0.6 * uStorm);
    n = normalize(n + dn * 0.65 * near);
  }
  vec3 toCam = normalize(uCamera - vWorld);
  float ndv = max(0.0, dot(n, toCam));
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // The body: near black, with teal light scattered up through the crests.
  vec3 water = uDeep * (uAmbient * 14.0) + uShallow * pow(vCrest, 3.0) * (0.25 + uAmbient * 4.0);
  // What the surface reflects: the dark sky (lighter toward the horizon), the moon's path, the flash.
  vec3 r = reflect(-toCam, n);
  vec3 skyRef = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.5, r.y)) * (1.0 - 0.4 * uStorm);
  // The moon's path: hard sparks on the ripples inside a narrow lane, gone in a storm.
  float md = max(0.0, dot(r, uMoon));
  float moonSpec = pow(md, 900.0) * 14.0 + pow(md, 90.0) * 0.06;
  skyRef += MOON_COL * moonSpec * (1.0 - 0.85 * uStorm) * (0.4 + 0.6 * near);
  skyRef += uFlash * vec3(0.5, 0.62, 0.85) * 0.7;
  vec3 col = mix(water, skyRef, fres);
  // The great lamp's glint: a streak of light across the swell between the tower and whoever looks at it.
  if (uLampPos.w > 0.0) {
    vec3 toLamp = normalize(uLampPos.xyz - vWorld);
    float g = pow(max(0.0, dot(r, toLamp)), 60.0);
    col += vec3(1.0, 0.8, 0.55) * g * uLampPos.w * 2.5 * near;
  }
  // The beam on the water: the pool lit hard, glinting on every ripple, with spray sparkling inside it.
  vec3 bl = beamLight(vWorld);
  float tilt = 0.45 + 0.55 * max(0.0, n.y);
  col += bl * (0.16 + 0.55 * fres) * tilt;
  float glint = pow(max(0.0, dot(r, normalize(vec3(0.0, 1.0, 0.0) + toCam))), 18.0);
  col += bl * glint * 0.35;
  // Foam on the crests (more in a storm), white where the light finds it, barely there in the dark.
  float foamMask = smoothstep(0.74 - uStorm * 0.25, 1.0, vCrest) * (0.45 + 0.55 * vnoise(vWorld.xz * 0.45 + uTime * 0.3));
  float streaks = smoothstep(0.55, 0.9, vnoise(vec2(vWorld.x * 0.08 + vWorld.z * 0.05, vWorld.z * 0.4 - uTime * 0.2))) * uStorm * 0.5;
  float foam = clamp(foamMask + streaks * vCrest, 0.0, 1.0);
  col = mix(col, uFoam * (uAmbient * 0.22 + 0.0015 + bl * 0.55 + uFlash * 0.25), foam * 0.7);
  // Dawn: the sea takes the warm sky.
  col = mix(col, mix(uShallow * 0.6, DAWN_COL * 0.55, fres) + bl * 0.1, uDawn * 0.75);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  vec3 fogCol = uFogColor + uFlash * vec3(0.08, 0.1, 0.14) + bl * 0.03 + uDawn * vec3(0.16, 0.12, 0.1);
  col = mix(col, fogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sea {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...LIGHT,
        uWaveMul: { value: 1 },
        uDeep: { value: new THREE.Color(0x0b2738) },
        uShallow: { value: new THREE.Color(0x1d6f6a) },
        uSkyLow: { value: new THREE.Color(0x16232e) },
        uSkyHigh: { value: new THREE.Color(0x05080e) },
        uFoam: { value: new THREE.Color(0xcfe9e4) },
        uDetail: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.mesh = null;
    this.scene = scene;
    this.segments = 0;
    this.setSegments(160);
  }

  setSegments(n) {
    if (n === this.segments) return;
    this.segments = n;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    // Wide enough that its edge always lies deep in the fog, where it meets the sky's haze.
    const geo = new THREE.PlaneGeometry(1600, 1600, n, n);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setQuality(q) {
    this.setSegments(q === 'low' ? 110 : q === 'medium' ? 170 : 220);
    this.material.uniforms.uDetail.value = q === 'low' ? 0 : 1;
  }

  setWaveMul(m) {
    this.material.uniforms.uWaveMul.value = m;
  }

  /** The water height at a world point, same maths as the shader, for things that float. */
  heightAt(x, z, time, storm, waveMul = 1) {
    const s = (0.25 + 0.75 * storm) * waveMul * Math.min(1, Math.max(0, (Math.hypot(x, z) - 5) / 9));
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const c = COMPONENTS[i];
      const k = (2 * Math.PI) / c[2];
      const f = k * (c[0] * x + c[1] * z - c[3] * time);
      y += c[4] * s * Math.sin(f);
    }
    return y;
  }
}

const COMPONENTS = [
  [0.8, 0.6, 38, 5.5, 1.1],
  [-0.55, 0.83, 22, 4.2, 0.7],
  [0.98, -0.2, 11, 3.1, 0.35],
  [0.3, -0.95, 5.5, 2.2, 0.16],
];
