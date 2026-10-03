// The beam itself: an additive volumetric cone from the lens to the pool (noise haze, rain and dust
// catching the light), the sweep's turning wedge, the pool disc, and flare glows.
import * as THREE from 'three';
import { LIGHT, NOISE } from './shaders.js';

const VERT = /* glsl */ `
varying vec3 vWorld; varying float vAlong;
attribute float along;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vAlong = along; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const FRAG = /* glsl */ `
precision highp float;
${NOISE}
varying vec3 vWorld; varying float vAlong;
uniform vec3 uColor; uniform float uTime; uniform float uIntensity; uniform vec3 uCamera; uniform float uStrobe; uniform float uHaze; uniform float uInside;
void main() {
  float near = smoothstep(2.0, 14.0, distance(uCamera, vWorld));
  // Brighter near the lens, fading toward the pool; haze from scrolling noise; thinner when looked at edge-on.
  float fade = (1.0 - vAlong) * (1.0 - vAlong);
  float n = fbm(vWorld.xz * 0.05 + vec2(uTime * 0.15, -uTime * 0.1) + vWorld.y * 0.02);
  float haze = mix(0.6, 1.4, n) * uHaze;
  float strobe = uStrobe > 0.5 ? step(0.5, fract(uTime * 6.0)) : 1.0;
  float a = uIntensity * (0.03 + 0.16 * fade) * haze * strobe * near * (1.0 - 0.8 * uInside);
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

function coneGeometry(segments = 24) {
  // A unit cone: apex at the origin, base ring at z = 1 with radius 1 (scaled per frame).
  const positions = [];
  const along = [];
  const idx = [];
  positions.push(0, 0, 0);
  along.push(0);
  const rings = 6;
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

export class Beam {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uTime: LIGHT.uTime, uIntensity: { value: 0 }, uCamera: LIGHT.uCamera, uStrobe: { value: 0 }, uHaze: { value: 1 }, uInside: { value: 0 } },
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
    // A soft glow sprite at the lens for the gallery and poster views.
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    this.glow.scale.set(9, 9, 1);
    scene.add(this.glow);
    this.target = new THREE.Vector3();
    this.origin = new THREE.Vector3(0, 34, 0);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * origin: the lens; target: the pool centre; r: pool radius; I: intensity; lens colour; sweep: the wedge
   * turning on its own (then the cone points along the sweep azimuth and reaches far).
   */
  update(origin, target, r, I, color, { strobe = 0, sweep = false, haze = 1, quality = 'high' } = {}) {
    this.origin.copy(origin);
    this.glow.position.copy(origin);
    const camDist = LIGHT.uCamera.value.distanceTo(origin);
    this.glow.visible = camDist > 9;
    this.glow.material.opacity = Math.min(1, 0.3 + I * 0.5) * Math.min(1, (camDist - 9) / 20);
    this.glow.material.color.copy(color);
    const c = this.cone;
    c.visible = I > 0.01;
    if (!c.visible) return;
    this.material.uniforms.uColor.value.copy(color);
    this.material.uniforms.uIntensity.value = Math.min(2.5, I) * (quality === 'low' ? 0.8 : 1);
    this.material.uniforms.uStrobe.value = strobe;
    this.material.uniforms.uHaze.value = haze;
    const len = origin.distanceTo(target);
    // Is the camera inside the cone? Project it onto the axis and compare with the cone's radius there.
    const cam = LIGHT.uCamera.value;
    const ax = target.x - origin.x, ay = target.y - origin.y, az = target.z - origin.z;
    const t = ((cam.x - origin.x) * ax + (cam.y - origin.y) * ay + (cam.z - origin.z) * az) / Math.max(1, len * len);
    const radiusAt = Math.max(1.5, sweep ? Math.max(12, len * 0.06) : r) * Math.max(0, t);
    const px = origin.x + ax * t, py = origin.y + ay * t, pz = origin.z + az * t;
    const inside = t > 0 && t < 1 && Math.hypot(cam.x - px, cam.y - py, cam.z - pz) < radiusAt + 1.5 ? 1 : 0;
    this.material.uniforms.uInside.value = inside;
    c.position.copy(origin);
    c.lookAt(target);
    const cr = sweep ? Math.max(12, len * 0.06) : Math.max(1.5, r);
    c.scale.set(cr, cr, len);
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
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
