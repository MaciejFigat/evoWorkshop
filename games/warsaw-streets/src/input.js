/* Keyboard input. `down` is the held state; `pressed` collects fresh key-downs until the
   simulation consumes them at the start of its next tick (so a quick tap is never lost
   between two ticks, and holding a key never re-triggers an attack). */
(function () {
  'use strict';
  const WS = window.WS;

  const down = new Set();
  let pressed = new Set();

  const BINDINGS = {
    left:   ['ArrowLeft', 'KeyA'],
    right:  ['ArrowRight', 'KeyD'],
    up:     ['ArrowUp', 'KeyW'],
    downK:  ['ArrowDown', 'KeyS'],
    attack: ['KeyJ', 'KeyZ'],
    kick:   ['KeyK', 'KeyX'],
    special:['KeyL', 'KeyC'],
    jump:   ['Space'],
    block:  ['ShiftLeft', 'ShiftRight'],
    pause:  ['KeyP', 'Escape'],
    restart:['KeyR'],
    start:  ['Enter'],
    debug:  ['Backquote', 'F1'],
  };
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backquote', 'F1']);

  window.addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
  });
  window.addEventListener('keyup', e => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); pressed.clear(); });

  const any = (set, action) => BINDINGS[action].some(c => set.has(c));

  WS.Input = {
    held(action) { return any(down, action); },
    /** Snapshot of fresh presses; clears the buffer. Call once per tick. */
    takePressed() {
      const p = pressed;
      pressed = new Set();
      return { has: action => any(p, action) };
    },
    /** Test hooks: drive the game from scripts. */
    _press(code) { down.add(code); pressed.add(code); },
    _release(code) { down.delete(code); },
    _reset() { down.clear(); pressed.clear(); },
  };
})();
