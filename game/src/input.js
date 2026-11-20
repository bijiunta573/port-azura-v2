// Keyboard and mouse input for Port Azura.
// Held keys are polled each frame; one-shot presses (pause, interact, horn, shoot)
// are latched so a press between frames is never lost.

const HELD = new Set();
const PRESSED = new Set();
let mouseDX = 0;
let mouseDown = false;
let dragging = false;

export function createInput(canvas) {
  window.addEventListener('keydown', (event) => {
    if (!event.repeat) PRESSED.add(event.code);
    HELD.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => HELD.delete(event.code));
  window.addEventListener('blur', () => { HELD.clear(); mouseDown = false; dragging = false; });

  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  window.addEventListener('pointerup', () => { mouseDown = false; dragging = false; });
  window.addEventListener('pointermove', (event) => {
    if (dragging) mouseDX += event.movementX || 0;
  });

  return {
    held: (code) => HELD.has(code),
    /** True once per physical press; consumes the latch. */
    pressed(code) {
      if (!PRESSED.has(code)) return false;
      PRESSED.delete(code);
      return true;
    },
    get mouseDown() { return mouseDown; },
    /** Horizontal mouse drag since the last call, in pixels. */
    takeMouseDX() {
      const dx = mouseDX;
      mouseDX = 0;
      return dx;
    },
    /** Forward/strafe axes from WASD and the arrow keys, each -1..1. */
    axes() {
      const f = (HELD.has('KeyW') || HELD.has('ArrowUp') ? 1 : 0) - (HELD.has('KeyS') || HELD.has('ArrowDown') ? 1 : 0);
      const s = (HELD.has('KeyD') || HELD.has('ArrowRight') ? 1 : 0) - (HELD.has('KeyA') || HELD.has('ArrowLeft') ? 1 : 0);
      return { f, s };
    },
  };
}
