/* WARSAW STREETS - shared constants and helpers. Classic scripts (no modules) so the game
   also runs from file:// without a web server. Everything hangs off window.WS. */
(function () {
  'use strict';
  const WS = window.WS = window.WS || {};

  WS.W = 480;                 // internal canvas size, integer-scaled to the window
  WS.H = 270;
  WS.TICKS_PER_SEC = 60;      // fixed simulation rate; all durations in data are in ticks
  WS.STEP_MS = 1000 / WS.TICKS_PER_SEC;

  WS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // WS.random is injected by main.ts from the host seed before boot; the engine never draws its own.
  WS.random = null;
  WS.rand = (a, b) => a + WS.random() * (b - a);
  WS.randInt = (a, b) => Math.floor(WS.rand(a, b + 1));
  WS.pick = arr => arr[Math.floor(WS.random() * arr.length)];
  WS.sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

  WS.overlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  WS.pad = (n, len) => String(Math.max(0, Math.floor(n))).padStart(len, '0');
})();
