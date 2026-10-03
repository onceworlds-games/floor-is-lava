// The sky dome: dusk to night gradient, two layers of scrolling cloud noise, stars where the sky is
// clear, a moon, lightning flashes and the dawn.
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
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uDuskCol;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.1, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  // Dusk: a warm band low in the west that fades as the night settles.
  float west = max(0.0, -d.x) * (1.0 - smoothstep(0.0, 0.35, h));
  col = mix(col, uDuskCol, uDusk * west * 0.9);
  // Stars.
  vec2 sp = d.xz / (d.y + 0.25) * 90.0;
  float st = step(0.9975, hash12(floor(sp))) * smoothstep(0.02, 0.3, h);
  float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + hash12(floor(sp) + 1.0) * 30.0);
  // Clouds: two scrolling layers, thicker in a storm, lit faintly by the moon.
  vec2 cp = d.xz / (d.y + 0.2);
  float c1 = fbm(cp * 1.6 + vec2(uTime * 0.012, uTime * 0.004));
  float c2 = fbm(cp * 3.2 + vec2(-uTime * 0.02, uTime * 0.01) + 7.0);
  float cover = smoothstep(0.42 - uStorm * 0.25 - uClouds * 0.1, 0.75 - uStorm * 0.1, c1 * 0.7 + c2 * 0.3) * smoothstep(-0.02, 0.12, h);
  float lit = max(0.0, dot(d, uMoon));
  vec3 cloud = mix(vec3(0.05, 0.07, 0.1), vec3(0.17, 0.2, 0.26), lit * 0.8) * (1.0 - uStorm * 0.4);
  col += st * twinkle * (1.0 - cover) * vec3(0.8, 0.9, 1.0);
  // The moon.
  float md = distance(d, uMoon);
  float moon = smoothstep(0.03, 0.022, md);
  float halo = (1.0 - smoothstep(0.02, 0.25, md)) * 0.18;
  col += (moon * vec3(0.9, 0.95, 1.0) + halo * vec3(0.5, 0.65, 0.85)) * (1.0 - cover * 0.9);
  col = mix(col, cloud, cover);
  // Lightning: the whole sky goes white-blue for a heartbeat; the dawn warms the horizon.
  col += uFlash * vec3(0.75, 0.85, 1.0) * (0.6 + 0.4 * cover);
  col = mix(col, mix(vec3(0.95, 0.6, 0.35), uZenith * 3.0, pow(h, 0.5)), uDawn);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: LIGHT.uTime, uFlash: LIGHT.uFlash, uStorm: LIGHT.uStorm, uDawn: LIGHT.uDawn, uMoon: LIGHT.uMoon,
        uDusk: { value: 0 }, uClouds: { value: 0 },
        uZenith: { value: new THREE.Color(0x05080f) },
        uHorizon: { value: new THREE.Color(0x14303a) },
        uDuskCol: { value: new THREE.Color(0x7a3a16) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 18), this.material);
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
