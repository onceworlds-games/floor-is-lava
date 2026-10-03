// Keyboard, mouse and touch, turned into station commands. No pointer lock: the cursor (or a finger)
// aims on the water; the view turns with A/D, arrows, the stick, or by edge-follow on a mouse.
import { controls } from './platform.js';
import { LENSES, R_MIN, R_MAX } from './sim/beam.js';

const STATION_KEYS = { Digit1: 'lantern', Digit2: 'gallery', Digit3: 'watch', Digit4: 'cellar' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointer = { x: 0.5, y: 0.5, down: false, id: null, moved: 0 };
    this.yaw = 0;
    this.pitch = -0.06;
    this.focus = 20;
    this.wheel = 0;
    this.taps = [];
    this.presses = [];
    this.locked = false; // a screen is up: no play input
    this.lastPointerAt = 0;
    this.wasPressed = {};
    this.bind();
  }

  bind() {
    const c = this.canvas;
    const target = window;
    target.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
        return;
      }
      if (this.locked && e.code !== 'Escape') return;
      this.keys.add(e.code);
      this.presses.push(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const clear = () => this.keys.clear();
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    const onMove = (e) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.pointer.x = Math.max(0, Math.min(1, e.clientX / w));
      this.pointer.y = Math.max(0, Math.min(1, e.clientY / h));
      this.pointer.moved++;
      this.lastPointerAt = performance.now();
    };
    c.addEventListener('pointermove', (e) => {
      if (this.pointer.id !== null && e.pointerId !== this.pointer.id) return;
      onMove(e);
    });
    c.addEventListener('pointerdown', (e) => {
      if (this.pointer.id !== null && e.pointerId !== this.pointer.id) return; // a second finger does nothing
      this.pointer.id = e.pointerId;
      this.pointer.down = true;
      this.pointer.downAt = performance.now();
      onMove(e);
      this.taps.push({ x: this.pointer.x, y: this.pointer.y, button: e.button, touch: e.pointerType === 'touch' });
      try {
        c.setPointerCapture(e.pointerId);
      } catch {}
    });
    const up = (e) => {
      if (this.pointer.id !== null && e.pointerId !== undefined && e.pointerId !== this.pointer.id) return;
      this.pointer.down = false;
      this.pointer.id = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    window.addEventListener('pointerup', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  held(code) {
    return this.keys.has(code);
  }

  /** Reads the frame's input into { yaw, pitch, aim, hold verbs, one-offs }. */
  poll(dt, station, opts = {}) {
    const touch = controls.touch;
    const stick = controls.stick;
    const out = { yaw: 0, pitch: 0, commands: [], touch, lensNext: false };
    if (this.locked) {
      this.presses.length = 0;
      this.taps.length = 0;
      this.wheel = 0;
      return { ...out, yaw: this.yaw, pitch: this.pitch };
    }
    // Turning the view: keys, stick, and edge-follow with a mouse (never when a screen is up).
    let turn = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) turn -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) turn += 1;
    if (Math.abs(stick.x) > 0.15) turn += stick.x;
    if (!touch && this.pointer.moved && performance.now() - this.lastPointerAt < 2000) {
      if (this.pointer.x < 0.06) turn -= (0.06 - this.pointer.x) / 0.06;
      if (this.pointer.x > 0.94) turn += (this.pointer.x - 0.94) / 0.06;
    }
    this.yaw += turn * dt * 1.6;
    let tilt = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) tilt += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) tilt -= 1;
    if (Math.abs(stick.y) > 0.15) tilt -= stick.y;
    this.pitch = Math.max(-0.45, Math.min(0.3, this.pitch + tilt * dt * 0.9));
    // Focus: wheel, +/-, or the touch slider (set from the HUD).
    if (this.wheel) {
      this.focus = Math.max(R_MIN, Math.min(R_MAX, this.focus + this.wheel * 2));
      this.wheel = 0;
      out.focusChanged = true;
    }
    if (this.held('Equal') || this.held('NumpadAdd')) this.focus = Math.max(R_MIN, this.focus - dt * 14);
    if (this.held('Minus') || this.held('NumpadSubtract')) this.focus = Math.min(R_MAX, this.focus + dt * 14);
    // Held verbs.
    const hold = (verb, on) => out.commands.push({ k: verb, on });
    if (station === 'lantern') {
      if (this.held('ShiftLeft') || this.held('ShiftRight') || controls.pressed('strobe')) hold('strobe', true);
      if (this.held('ControlLeft') || this.held('ControlRight') || this.held('KeyX') || controls.pressed('over')) hold('over', true);
    } else if (station === 'gallery') {
      if (this.held('KeyZ') || controls.pressed('scan')) hold('scan', true);
      if (this.held('KeyE') || controls.pressed('repair')) hold('repair', true);
    } else if (station === 'watch') {
      if (this.held('KeyH') || controls.pressed('horn')) hold('horn', true);
      if (this.held('KeyQ') || controls.pressed('crank')) hold('crank', true);
    } else if (station === 'cellar') {
      if (this.held('KeyQ') || controls.pressed('crank')) hold('crank', true);
      if (this.held('KeyE') || controls.pressed('repair')) hold('repair', true);
    }
    // Touch buttons fire once on the press, whatever key the platform maps them to.
    for (const id of ['fire', 'flare', 'radio', 'chart', 'oil', 'flares', 'mode', 'lens']) {
      const now = controls.pressed(id);
      if (now && !this.wasPressed[id]) {
        if (id === 'fire') out.commands.push({ k: 'harpoon', aim: true });
        else if (id === 'flare') out.commands.push({ k: 'flare', aim: true });
        else if (id === 'radio') out.radio = true;
        else if (id === 'chart') out.chart = true;
        else if (id === 'oil') out.commands.push({ k: 'oil' });
        else if (id === 'flares') out.commands.push({ k: 'crate' });
        else if (id === 'mode') out.commands.push({ k: 'mode' });
        else if (id === 'lens') out.lensNext = true;
      }
      this.wasPressed[id] = now;
    }
    // One-off keys.
    for (const code of this.presses) {
      if (code === 'Tab') out.commands.push({ k: 'station', st: 'next' });
      else if (STATION_KEYS[code] && (station !== 'lantern' || this.held('ShiftLeft') || this.held('ShiftRight'))) out.commands.push({ k: 'station', st: STATION_KEYS[code] });
      else if (STATION_KEYS[code] && station === 'lantern') out.commands.push({ k: 'lens', lens: LENSES[Number(code.slice(5)) - 1] });
      else if (code === 'Space' && station === 'lantern') out.commands.push({ k: 'mode' });
      else if (code === 'KeyE' && station === 'lantern') out.commands.push({ k: 'wipe' });
      else if (code === 'KeyL' && station === 'lantern') out.lensNext = true;
      else if (code === 'KeyV' && station === 'lantern') out.commands.push({ k: 'spare' });
      else if (code === 'KeyF' && station === 'gallery') out.commands.push({ k: 'flare', aim: true });
      else if (code === 'KeyK' && station === 'gallery') out.commands.push({ k: 'harpoon', aim: true });
      else if (code === 'KeyR' && station === 'watch') out.radio = true;
      else if (code === 'KeyG' && station === 'watch') out.commands.push({ k: 'gen' });
      else if (code === 'KeyC') out.chart = true;
      else if (code === 'KeyO' && station === 'cellar') out.commands.push({ k: 'oil' });
      else if (code === 'KeyF' && station === 'cellar') out.commands.push({ k: 'crate' });
      else if (code === 'KeyP') out.pet = true;
      else if (code === 'Escape') out.escape = true;
      else if (code === 'Enter') out.enter = true;
    }
    this.presses.length = 0;
    // Taps and clicks on the world.
    for (const tap of this.taps) {
      if (station === 'gallery' && tap.button === 0 && !opts.tapIsAim) out.commands.push({ k: 'harpoon', aim: true, x: tap.x, y: tap.y });
      out.tapped = tap;
    }
    this.taps.length = 0;
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.pointer = this.pointer;
    out.focus = this.focus;
    return out;
  }

  setFocus(r) {
    this.focus = Math.max(R_MIN, Math.min(R_MAX, r));
  }
}

/** The platform's touch controls for a station. */
export function touchControlsFor(station) {
  switch (station) {
    case 'lantern':
      return { stick: 'analog', buttons: [{ id: 'mode', label: 'Mode', key: ' ' }, { id: 'lens', label: 'Lens', key: 'l' }, { id: 'strobe', label: 'Strobe', key: 'Shift' }, { id: 'over', label: 'Charge', key: 'x' }] };
    case 'gallery':
      return { stick: 'analog', buttons: [{ id: 'fire', label: 'Harpoon', key: 'k' }, { id: 'flare', label: 'Flare', key: 'f' }, { id: 'scan', label: 'Scan', key: 'z' }, { id: 'repair', label: 'Repair', key: 'e' }] };
    case 'watch':
      return { stick: 'analog', buttons: [{ id: 'horn', label: 'Horn', key: 'h' }, { id: 'radio', label: 'Radio', key: 'r' }, { id: 'crank', label: 'Crank', key: 'q' }, { id: 'chart', label: 'Chart', key: 'c' }] };
    case 'cellar':
      return { stick: 'analog', buttons: [{ id: 'oil', label: 'Oil', key: 'o' }, { id: 'crank', label: 'Crank', key: 'q' }, { id: 'repair', label: 'Repair', key: 'e' }, { id: 'flares', label: 'Flares', key: 'f' }] };
    default:
      return null;
  }
}
