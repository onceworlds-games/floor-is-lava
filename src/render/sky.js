// The sky dome, in linear light: a near-black zenith over a horizon haze that matches the sea's fog (so the sea's
// edge disappears), two layers of cloud with silver edges toward the moon and dark bellies, the beam catching the
// low cloud along its heading, lightning lighting the cloud from inside around the bolt, a dusk ember in the west
// and a dawn that warms the whole bowl.
import * as THREE from 'three';
import { LIGHT, NOISE } from './shaders.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
${NOISE}
varying vec3 vDir;
uniform float uTime; uniform float uFlash; uniform float uStorm; uniform float uDawn; uniform float uDusk; uniform vec3 uMoon; uniform float uClouds;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uDuskCol; uniform vec3 uFogColor; uniform vec4 uBeamDir; uniform vec3 uLens; uniform vec3 uFlashPos;
uniform vec3 uCamera;
float clouds(vec2 cp) {
  float c1 = fbm(cp * 1.4 + vec2(uTime * 0.010, uTime * 0.004));
  float c2 = fbm(cp * 3.1 + vec2(-uTime * 0.018, uTime * 0.008) + 7.0);
  return c1 * 0.68 + c2 * 0.32;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  // The bowl: haze at the horizon (the fog's own colour, so the sea melts into it), dark at the top.
  vec3 col = mix(uFogColor * 1.15, uZenith, smoothstep(0.0, 0.42, h));
  col = mix(uFogColor, col, smoothstep(-0.05, 0.03, h));
  // Dusk: an ember low in the west that fades as the night settles.
  float west = pow(max(0.0, -d.x * 0.8 - d.z * 0.2), 1.5) * (1.0 - smoothstep(0.0, 0.3, h));
  col += uDuskCol * uDusk * west * 0.9;
  // Stars, where the sky is open.
  vec2 sp = d.xz / (d.y + 0.25) * 90.0;
  float st = step(0.9972, hash12(floor(sp))) * smoothstep(0.05, 0.35, h);
  float twinkle = 0.5 + 0.5 * sin(uTime * 3.0 + hash12(floor(sp) + 1.0) * 30.0);
  // Clouds: thicker in a storm; lit at their edges toward the moon, dark in their bellies.
  vec2 cp = d.xz / (d.y + 0.18);
  float c = clouds(cp);
  float cover = smoothstep(0.46 - uStorm * 0.3 - uClouds * 0.12, 0.78 - uStorm * 0.12, c) * smoothstep(-0.03, 0.14, h);
  vec2 toMoon = normalize(uMoon.xz / (uMoon.y + 0.18) - cp + 1e-4);
  float edge = clamp((c - clouds(cp + toMoon * 0.06)) * 6.0, 0.0, 1.0);
  float moonNear = pow(max(0.0, dot(d, uMoon)), 6.0);
  vec3 belly = vec3(0.004, 0.006, 0.010) * (1.0 + uStorm);
  vec3 lit = vec3(0.03, 0.042, 0.06) * (1.0 - uStorm * 0.55);
  vec3 cloudCol = belly + lit * (0.25 + edge * 1.6) * (0.25 + moonNear * 2.2);
  col += st * twinkle * (1.0 - cover) * vec3(0.5, 0.6, 0.75) * 0.6;
  // The moon behind its halo, hidden by the cloud.
  float md = distance(d, uMoon);
  float disc = smoothstep(0.028, 0.02, md);
  float halo = (1.0 - smoothstep(0.02, 0.45, md));
  col += (disc * vec3(1.6, 1.7, 1.8) + halo * halo * vec3(0.10, 0.14, 0.2)) * (1.0 - cover * 0.92) * (1.0 - 0.7 * uStorm);
  col = mix(col, cloudCol, cover);
  // The beam in the low cloud and the haze along its heading: a pale wash where the light runs out to sea.
  if (uBeamDir.w > 0.0) {
    vec2 bd = uBeamDir.xy;
    float along = max(0.0, dot(normalize(d.xz + 1e-4), bd));
    float low = 1.0 - smoothstep(-0.02, 0.22, h - uBeamDir.z);
    col += uLens * uBeamDir.w * pow(along, 60.0) * low * (0.02 + cover * 0.1);
  }
  // Lightning: the cloud glows from inside around the bolt, and the whole bowl flashes for a heartbeat.
  float near = pow(max(0.0, dot(d, normalize(uFlashPos - uCamera))), 6.0);
  col += uFlash * vec3(0.55, 0.7, 1.0) * ((0.25 + 0.75 * cover) * 0.22 + near * (0.6 + 1.6 * cover) * 1.3);
  // Dawn: amber at the horizon in the east, pale above; the clouds' bellies catch the gold.
  float east = 0.6 + 0.4 * max(0.0, d.x);
  vec3 dawn = mix(vec3(1.0, 0.42, 0.14) * 0.85 * east, vec3(0.52, 0.34, 0.3), smoothstep(0.0, 0.12, h));
  dawn = mix(dawn, vec3(0.07, 0.11, 0.22), smoothstep(0.08, 0.55, h));
  dawn = mix(dawn, vec3(1.0, 0.5, 0.36) * (0.25 + edge * 0.9) * (0.4 + 0.6 * east), cover * 0.8);
  // The sun itself, just up, and the glow round it.
  vec3 sunDir = normalize(vec3(0.951, 0.118, -0.285));
  float sd = distance(d, sunDir);
  dawn += (smoothstep(0.05, 0.035, sd) * vec3(6.0, 4.2, 2.4) + exp(-sd * sd * 28.0) * vec3(1.6, 0.8, 0.36) + exp(-sd * sd * 4.0) * vec3(0.35, 0.16, 0.06)) * (1.0 - cover * 0.45);
  col = mix(col, dawn, uDawn);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: LIGHT.uTime, uFlash: LIGHT.uFlash, uStorm: LIGHT.uStorm, uDawn: LIGHT.uDawn, uMoon: LIGHT.uMoon, uFogColor: LIGHT.uFogColor,
        uBeamDir: LIGHT.uBeamDir, uLens: LIGHT.uLens, uFlashPos: LIGHT.uFlashPos, uCamera: LIGHT.uCamera,
        uDusk: { value: 0 }, uClouds: { value: 0 },
        uZenith: { value: new THREE.Color(0x02040a) },
        uHorizon: { value: new THREE.Color(0x14303a) },
        uDuskCol: { value: new THREE.Color(0xa0461a) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }

  update(camera, dusk, clouds) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.uDusk.value = dusk;
    this.material.uniforms.uClouds.value = clouds;
  }
}
