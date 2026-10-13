/**
 * Keyboard / mouse input with pointer lock. Gameplay code polls this every frame:
 *  - down(code)       key currently held (KeyboardEvent.code, e.g. 'KeyW')
 *  - pressed(code)    key went down this frame
 *  - mouseDown(b)     0 = left, 2 = right
 *  - mousePressed(b)  button went down this frame
 *  - consumeLook()    accumulated mouse movement while the pointer is locked
 */
const GAME_KEYS = new Set(['Space', 'Tab', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'AltLeft']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.buttons = new Set();
    this.pressedButtons = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.captureKeys = false; // true while in gameplay so Space/Tab do not scroll or change focus
    this.listeners = { lockchange: [], lockerror: [], keydown: [] };

    window.addEventListener('keydown', (e) => {
      if (this.captureKeys && GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressedKeys.add(e.code);
      }
      for (const fn of this.listeners.keydown) fn(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Clamp single-event spikes (some browsers report huge deltas when the lock engages)
      const dx = Math.max(-200, Math.min(200, e.movementX || 0));
      const dy = Math.max(-200, Math.min(200, e.movementY || 0));
      this.lookX += dx;
      this.lookY += dy;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.buttons.clear();
      for (const fn of this.listeners.lockchange) fn(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      for (const fn of this.listeners.lockerror) fn();
    });
  }

  on(evt, fn) { this.listeners[evt].push(fn); }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[Input] Pointer lock was refused:', err && err.message);
          for (const fn of this.listeners.lockerror) fn();
        });
      }
    } catch (err) {
      console.warn('[Input] Pointer lock unavailable:', err && err.message);
      for (const fn of this.listeners.lockerror) fn();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedKeys.has(code); }
  mouseDown(b) { return this.buttons.has(b); }
  mousePressed(b) { return this.pressedButtons.has(b); }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Clear per-frame edge-triggered state. Call once at the end of every frame. */
  endFrame() {
    this.pressedKeys.clear();
    this.pressedButtons.clear();
  }

  /** Forget everything (used when switching between menus and gameplay). */
  reset() {
    this.keys.clear();
    this.buttons.clear();
    this.endFrame();
    this.consumeLook();
    this.consumeWheel();
  }
}
