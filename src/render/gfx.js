// The renderer: canvas sizing at the platform's pixel ratio, an adaptive quality governor, the grain
// and vignette pass, and WebGL context loss.
import * as THREE from 'three';
import { settings } from '../platform.js';
import { NOISE } from './shaders.js';

const LEVELS = ['low', 'medium', 'high'];
const SCALE = { low: 0.6, medium: 0.8, high: 1 };

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x070c15, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
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
    this.post = this.makePost();
    this.target = null;
    this.flash = 0;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.target?.dispose();
      this.target = null;
      this.resize();
    });
    this.readSettings();
    settings.onChange(() => this.readSettings());
    this.resize();
  }

  readSettings() {
    const choice = settings.choice;
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
    if (this.target) {
      this.target.dispose();
      this.target = null;
    }
  }

  makePost() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.06 }, uVignette: { value: 0.55 }, uFlash: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uFlash, uAspect;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float g = hash12(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.31) * 100.0) - 0.5;
          c += g * uGrain * (0.6 + 0.4 * (1.0 - c.g));
          vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
          float v = 1.0 - uVignette * smoothstep(0.35, 1.1, length(d));
          c *= v;
          c += uFlash * vec3(0.85, 0.92, 1.0);
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { mat, scene, cam };
  }

  render(time, flash = 0) {
    if (this.lost) return;
    const r = this.renderer;
    const usePost = true;
    if (usePost) {
      const size = r.getSize(new THREE.Vector2());
      if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
        this.target?.dispose();
        this.target = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true, stencilBuffer: false, samples: 0 });
      }
      r.setRenderTarget(this.target);
      r.render(this.scene, this.camera);
      r.setRenderTarget(null);
      const u = this.post.mat.uniforms;
      u.tDiffuse.value = this.target.texture;
      u.uTime.value = time;
      u.uFlash.value = this.reducedMotion ? Math.min(flash, 0.25) : flash;
      u.uAspect.value = this.camera.aspect;
      u.uGrain.value = this.quality === 'high' ? 0.04 : this.quality === 'medium' ? 0.03 : 0;
      r.render(this.post.scene, this.post.cam);
    } else r.render(this.scene, this.camera);
  }

  dispose() {
    this.target?.dispose();
    this.renderer.dispose();
  }
}
