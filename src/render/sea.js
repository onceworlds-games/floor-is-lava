// The sea: one plane, Gerstner waves in the vertex shader (four components, amplitude from the storm),
// fresnel toward the sky, foam on crests, procedural detail normals and the beam's highlight.
import * as THREE from 'three';
import { LIGHT, NOISE, LIGHT_GLSL } from './shaders.js';

const VERT = /* glsl */ `
uniform float uTime; uniform float uStorm; uniform float uWaveMul;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest; varying float vDepth;
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
  vDepth = length(p);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
${NOISE}
${LIGHT_GLSL}
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest; varying float vDepth;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uFoam; uniform float uDetail;
void main() {
  vec3 n = normalize(vNormal);
  if (uDetail > 0.5) {
    float e = 0.6;
    vec2 q = vWorld.xz * 0.35 + vec2(uTime * 0.6, -uTime * 0.4);
    float h0 = fbm(q); float hx = fbm(q + vec2(e, 0.0)); float hz = fbm(q + vec2(0.0, e));
    vec3 dn = vec3((h0 - hx) * 0.9, 0.0, (h0 - hz) * 0.9);
    float near = 1.0 - smoothstep(60.0, 260.0, distance(uCamera, vWorld));
    n = normalize(n + dn * 0.6 * near);
  }
  vec3 toCam = normalize(uCamera - vWorld);
  float fres = pow(1.0 - max(0.0, dot(n, toCam)), 3.0);
  vec3 water = mix(uDeep, uShallow, vCrest * 0.6);
  vec3 col = mix(water, uSky, 0.25 + 0.6 * fres) * (uAmbient * 2.2 + 0.03);
  // Moon glitter and the lamp's own glint.
  vec3 h = normalize(toCam + uMoon);
  float spec = pow(max(0.0, dot(n, h)), 90.0);
  col += vec3(0.6, 0.75, 0.9) * spec * 0.35 * (1.0 - uStorm * 0.5);
  // The beam on the water: the pool itself, bright, with a soft halo of spray.
  vec3 bl = beamLight(vWorld);
  float tilt = 0.5 + 0.5 * max(0.0, n.y);
  col += bl * (0.55 + 0.5 * fres) * tilt;
  // Foam on crests, more in a storm, and foam where the beam breaks on the water.
  float foam = smoothstep(0.78 - uStorm * 0.25, 1.0, vCrest) * (0.5 + 0.5 * vnoise(vWorld.xz * 0.5 + uTime * 0.3));
  col = mix(col, uFoam * (uAmbient * 3.0 + 0.08 + bl * 0.8), foam * 0.55);
  col += uFlash * vec3(0.7, 0.8, 1.0) * (0.5 + 0.5 * fres);
  col = mix(col, uShallow * 2.0 + vec3(0.5, 0.3, 0.2), uDawn * 0.5);
  float dist = distance(uCamera, vWorld);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor + uFlash * 0.5 + bl * 0.1, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sea {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...LIGHT,
        uWaveMul: { value: 1 },
        uDeep: { value: new THREE.Color(0x071a2a) },
        uShallow: { value: new THREE.Color(0x0e3a44) },
        uSky: { value: new THREE.Color(0x1b3b4a) },
        uFoam: { value: new THREE.Color(0x9fe3d8) },
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
    const geo = new THREE.PlaneGeometry(1000, 1000, n, n);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setQuality(q) {
    this.setSegments(q === 'low' ? 90 : q === 'medium' ? 130 : 170);
    this.material.uniforms.uDetail.value = q === 'low' ? 0 : 1;
  }

  setWaveMul(m) {
    this.material.uniforms.uWaveMul.value = m;
  }

  /** The water height at a world point, same maths as the shader, for things that float. */
  heightAt(x, z, time, storm, waveMul = 1) {
    const s = (0.25 + 0.75 * storm) * waveMul * Math.min(1, Math.max(0, (Math.hypot(x, z) - 5) / 9));
    let y = 0;
    const comp = [
      [0.8, 0.6, 38, 5.5, 1.1],
      [-0.55, 0.83, 22, 4.2, 0.7],
      [0.98, -0.2, 11, 3.1, 0.35],
      [0.3, -0.95, 5.5, 2.2, 0.16],
    ];
    for (const [dx, dz, wl, speed, amp] of comp) {
      const k = (2 * Math.PI) / wl;
      const f = k * (dx * x + dz * z - speed * time);
      y += amp * s * Math.sin(f);
    }
    return y;
  }
}
