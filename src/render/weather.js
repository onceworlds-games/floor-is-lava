// Rain streaks around the camera (moved entirely in the shader), lightning bolts and the flash.
import * as THREE from 'three';
import { LIGHT } from './shaders.js';

const RAIN_VERT = /* glsl */ `
attribute float seed; uniform vec3 uCentre; uniform float uTime; uniform float uWind; uniform float uSpeed;
varying float vEnd;
void main() {
  // position.xz: offset in the box; position.y: 0 (head) or 1 (tail). seed: this drop's phase.
  float fall = mod(seed * 40.0 + uTime * uSpeed, 40.0);
  float y = 40.0 - fall;
  float tail = position.y;
  vec3 p = uCentre + vec3(position.x + uWind * (40.0 - y) * 0.35 + tail * uWind * 1.2, y - 20.0 + tail * 1.6, position.z);
  vEnd = tail;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const RAIN_FRAG = /* glsl */ `precision highp float; varying float vEnd; uniform float uAlpha; uniform float uLit; void main() { gl_FragColor = vec4(vec3(0.55, 0.7, 0.85) * uAlpha * (1.0 - vEnd * 0.7) * (0.6 + uLit), 1.0); }`;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.count = 2400;
    const pos = new Float32Array(this.count * 2 * 3);
    const seed = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      const x = (Math.random() - 0.5) * 60;
      const z = (Math.random() - 0.5) * 60;
      const s = Math.random();
      pos.set([x, 0, z, x, 1, z], i * 6);
      seed[i * 2] = s;
      seed[i * 2 + 1] = s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({ uniforms: { uCentre: { value: new THREE.Vector3() }, uTime: LIGHT.uTime, uWind: { value: 0 }, uSpeed: { value: 26 }, uAlpha: { value: 0.3 }, uLit: { value: 0 } }, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 7;
    scene.add(this.rain);
    // Lightning: one jagged bolt, rebuilt on each strike.
    const bpos = new Float32Array(16 * 2 * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    this.bolt = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xdfeeff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
    this.boltLife = 0;
    this.flash = 0;
    this.quality = 'high';
  }

  setQuality(q) {
    this.quality = q;
  }

  strike(x, z, near) {
    const p = this.bolt.geometry.attributes.position.array;
    let px = x + (Math.random() - 0.5) * 60;
    let pz = z + (Math.random() - 0.5) * 60;
    let py = 320;
    for (let i = 0; i < 16; i++) {
      const nx = i === 15 ? x : px + (Math.random() - 0.5) * 26;
      const nz = i === 15 ? z : pz + (Math.random() - 0.5) * 26;
      const ny = i === 15 ? 0 : py - 320 / 16;
      p.set([px, py, pz, nx, ny, nz], i * 6);
      px = nx;
      py = ny;
      pz = nz;
    }
    this.bolt.geometry.attributes.position.needsUpdate = true;
    this.boltLife = 0.28;
    this.flash = Math.max(this.flash, near ? 1 : 0.55);
  }

  update(dt, camera, weather, reducedMotion, inside) {
    const rain = weather.rain || 0;
    const n = this.quality === 'low' ? 500 : this.quality === 'medium' ? 1200 : 2400;
    const show = rain > 0.05 && !inside;
    this.rain.visible = show;
    if (show) {
      this.rain.geometry.setDrawRange(0, Math.floor(n * rain) * 2);
      this.rainMat.uniforms.uCentre.value.copy(camera.position);
      this.rainMat.uniforms.uWind.value = weather.storm * 0.9;
      this.rainMat.uniforms.uAlpha.value = 0.22 + 0.2 * rain;
      this.rainMat.uniforms.uSpeed.value = 22 + weather.storm * 12;
      this.rainMat.uniforms.uLit.value = Math.min(1, LIGHT.uPoolI.value * 0.5);
    }
    this.boltLife = Math.max(0, this.boltLife - dt);
    this.bolt.material.opacity = this.boltLife > 0 ? 0.6 + 0.4 * Math.sin(this.boltLife * 90) : 0;
    this.flash = Math.max(0, this.flash - dt * 4);
    LIGHT.uFlash.value = reducedMotion ? Math.min(0.2, this.flash) : this.flash;
  }
}
