// The renderer: canvas sizing at the platform's pixel ratio, an adaptive quality governor, WebGL context loss,
// and the picture's last steps. The scene is lit in linear light (values above 1 are allowed: the beam is hot);
// one final pass tone-maps it with a filmic curve, grades it (teal shadows, amber highlights), adds the vignette,
// the grain and the lightning flash. Medium and high also get a two-level bloom so the beam, the lamp and the
// running lights glow. Low keeps only the final pass, at a lower resolution.
import * as THREE from 'three';
import { settings } from '../platform.js';
import { NOISE } from './shaders.js';

const LEVELS = ['low', 'medium', 'high'];
const SCALE = { low: 0.6, medium: 0.8, high: 1 };

const QUAD_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Keeps what is brighter than the threshold (soft knee), for the bloom.
const BRIGHT_FRAG = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform float uThreshold;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - uThreshold) / max(l, 1e-4), 0.0, 1.0);
  gl_FragColor = vec4(min(c * k * k, vec3(24.0)), 1.0);
}`;

// A 9-tap Gaussian along one axis (linear sampling makes it 5 fetches wide).
const BLUR_FRAG = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uStep;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL_FRAG = `precision highp float; ${NOISE} varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB; uniform float uBloom;
uniform float uTime, uGrain, uVignette, uFlash, uAspect, uExposure, uWarm;
// A filmic curve (ACES, fitted): dark values stay rich, the beam rolls off instead of clipping.
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uBloom > 0.0) c += (texture2D(tBloomA, vUv).rgb * 0.32 + texture2D(tBloomB, vUv).rgb * 0.22) * uBloom;
  c += uFlash * vec3(0.55, 0.68, 0.9);
  c = aces(c * uExposure);
  // Grade: the shadows lean teal-blue, the highlights lean amber (the lamp's colours), a little more at dusk and dawn.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.86, 1.02, 1.12), (1.0 - smoothstep(0.0, 0.45, l)) * 0.55);
  c = mix(c, c * vec3(1.08, 1.0, 0.86), smoothstep(0.45, 1.0, l) * (0.35 + 0.3 * uWarm));
  vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.38, 1.15, length(d));
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float g = hash12(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.31) * 100.0) - 0.5;
  c += g * uGrain * (1.0 - 0.6 * l);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x070c15, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1400);
    this.quality = 'high';
    this.ceiling = 'high';
    this.auto = true;
    this.frameEma = 16;
    this.slow = 0;
    this.fast = 0;
    this.lost = false;
    this.width = 1;
    this.height = 1;
    this.listeners = new Set();
    this.targets = null;
    this.flash = 0;
    this.grain = true;
    this.exposure = 1;
    this.warm = 0;
    this.halfFloat = this.renderer.capabilities.isWebGL2 || Boolean(this.renderer.extensions.get('EXT_color_buffer_half_float'));
    this.makePost();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.disposeTargets();
      this.resize();
    });
    this.readSettings();
    settings.onChange(() => this.readSettings());
    this.resize();
  }

  readSettings() {
    // ?quality=low|medium|high pins the tier (store art and checks on a real GPU); otherwise the player's Graphics choice.
    const pinned = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
    const choice = LEVELS.includes(pinned) ? pinned : settings.choice;
    this.auto = choice === 'auto' || !LEVELS.includes(choice);
    this.ceiling = this.auto ? 'high' : choice;
    if (!this.auto) this.setQuality(choice);
    else if (LEVELS.indexOf(this.quality) > LEVELS.indexOf(this.ceiling)) this.setQuality(this.ceiling);
    this.reducedMotion = settings.reducedMotion;
    this.resize();
  }

  onQuality(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setQuality(q) {
    if (!LEVELS.includes(q) || q === this.quality) return;
    this.quality = q;
    this.resize();
    for (const fn of this.listeners) {
      try {
        fn(q);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** Call once per frame with the frame time in ms. Steps down fast, up slowly, never above the player's choice. */
  govern(ms) {
    if (!this.auto) return;
    this.frameEma += (Math.min(ms, 200) - this.frameEma) * 0.08;
    if (this.frameEma > 26) {
      this.slow += ms;
      this.fast = 0;
      if (this.slow > 1800 && this.quality !== 'low') {
        this.setQuality(LEVELS[LEVELS.indexOf(this.quality) - 1]);
        this.slow = 0;
        this.frameEma = 16;
      }
    } else if (this.frameEma < 13) {
      this.fast += ms;
      this.slow = 0;
      if (this.fast > 12000 && this.quality !== this.ceiling) {
        this.setQuality(LEVELS[Math.min(LEVELS.indexOf(this.ceiling), LEVELS.indexOf(this.quality) + 1)]);
        this.fast = 0;
        this.frameEma = 16;
      }
    } else this.slow = Math.max(0, this.slow - ms * 0.5);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pr = Math.max(0.5, settings.pixelRatio(2) * SCALE[this.quality]);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)), false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 74 : 62;
    this.camera.updateProjectionMatrix();
    this.disposeTargets();
  }

  makePost() {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.post = {
      quad, scene, cam,
      bright: mat(BRIGHT_FRAG, { tSrc: { value: null }, uThreshold: { value: 1.1 } }),
      blur: mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } }),
      final: mat(FINAL_FRAG, {
        tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uBloom: { value: 0 }, uTime: { value: 0 }, uGrain: { value: 0.04 },
        uVignette: { value: 0.6 }, uFlash: { value: 0 }, uAspect: { value: 1 }, uExposure: { value: 1 }, uWarm: { value: 0 },
      }),
    };
  }

  disposeTargets() {
    if (!this.targets) return;
    for (const t of Object.values(this.targets)) t?.dispose();
    this.targets = null;
  }

  ensureTargets() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const bloom = this.quality !== 'low';
    const key = `${size.x}x${size.y}:${bloom}`;
    if (this.targets && this.targetKey === key) return this.targets;
    this.disposeTargets();
    const type = this.halfFloat && bloom ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const make = (w, h, depth = false) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { depthBuffer: depth, stencilBuffer: false, type, samples: 0 });
    const t = { scene: make(size.x, size.y, true) };
    if (bloom) {
      const qw = Math.max(1, Math.round(size.x / 4));
      const qh = Math.max(1, Math.round(size.y / 4));
      t.a1 = make(qw, qh);
      t.a2 = make(qw, qh);
      t.b1 = make(Math.max(1, qw >> 1), Math.max(1, qh >> 1));
      t.b2 = make(Math.max(1, qw >> 1), Math.max(1, qh >> 1));
    }
    this.targets = t;
    this.targetKey = key;
    return t;
  }

  pass(material, target) {
    const p = this.post;
    p.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(p.scene, p.cam);
  }

  render(time, flash = 0) {
    if (this.lost) return;
    const r = this.renderer;
    const t = this.ensureTargets();
    r.setRenderTarget(t.scene);
    r.render(this.scene, this.camera);
    const p = this.post;
    const bloom = Boolean(t.a1);
    if (bloom) {
      p.bright.uniforms.tSrc.value = t.scene.texture;
      this.pass(p.bright, t.a1);
      const blur = (src, dst, dx, dy) => {
        p.blur.uniforms.tSrc.value = src.texture;
        p.blur.uniforms.uStep.value.set(dx / src.width, dy / src.height);
        this.pass(p.blur, dst);
      };
      blur(t.a1, t.a2, 1, 0);
      blur(t.a2, t.a1, 0, 1);
      blur(t.a1, t.b1, 1.5, 0);
      blur(t.b1, t.b2, 0, 1.5);
      blur(t.b2, t.b1, 1.5, 0);
      blur(t.b1, t.b2, 0, 1.5);
    }
    const u = p.final.uniforms;
    u.tScene.value = t.scene.texture;
    u.tBloomA.value = bloom ? t.a1.texture : t.scene.texture;
    u.tBloomB.value = bloom ? t.b2.texture : t.scene.texture;
    u.uBloom.value = bloom ? (this.quality === 'high' ? 1 : 0.8) : 0;
    u.uTime.value = time;
    u.uFlash.value = this.reducedMotion ? Math.min(flash, 0.25) * 0.08 : flash * 0.08;
    u.uAspect.value = this.camera.aspect;
    u.uExposure.value = this.exposure;
    u.uWarm.value = this.warm;
    u.uGrain.value = !this.grain ? 0 : this.quality === 'high' ? 0.035 : this.quality === 'medium' ? 0.025 : 0;
    this.pass(p.final, null);
  }

  dispose() {
    this.disposeTargets();
    this.renderer.dispose();
  }
}
