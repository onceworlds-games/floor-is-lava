// Keyboard and the platform's touch controls (an analog stick and a Jump button), read once per fixed step.

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export function createInput(ow) {
  const keys = new Set();
  let tapLatch = false;
  let touchJump = false;
  let anyKey = false;

  addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code) && !e.metaKey && !e.ctrlKey) e.preventDefault();
    anyKey = true;
    if (!keys.has(e.code) && (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp')) tapLatch = true;
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keys.clear();
  });

  const stickOf = () => {
    try {
      return ow?.controls?.stick ?? null;
    } catch {
      return null;
    }
  };

  return {
    /** Fills `out`: x (-1..1 run), my (up-positive, for ghosts), down (drop through), jump (held), tap (pressed since the last sample). */
    sample(out) {
      const stick = stickOf();
      const sx = stick && Math.abs(stick.x) > 0.12 ? stick.x : 0;
      const sy = stick && Math.abs(stick.y) > 0.12 ? stick.y : 0; // down-positive
      let kx = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
      out.x = Math.max(-1, Math.min(1, kx + sx));
      const keyUp = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space');
      const keyDown = keys.has('KeyS') || keys.has('ArrowDown');
      let pressed = false;
      try {
        pressed = Boolean(ow?.controls?.pressed('jump'));
      } catch {
        pressed = false;
      }
      if (pressed && !touchJump) tapLatch = true;
      touchJump = pressed;
      out.jump = keyUp || pressed;
      out.down = keyDown || sy > 0.62;
      out.my = Math.max(-1, Math.min(1, (keyUp ? 1 : 0) - (keyDown ? 1 : 0) - sy));
      out.tap = tapLatch;
      tapLatch = false;
      return out;
    },
    /** True once any key was pressed (to know a keyboard player is here). */
    get anyKey() {
      return anyKey;
    },
  };
}
