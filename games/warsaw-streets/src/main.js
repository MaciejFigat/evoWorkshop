/* Bootstrap: canvas scaling, fixed-timestep loop. main.ts calls WS.boot once it has the host
   session, so the random source and the run reporter are in place before anything runs. */
(function () {
  'use strict';
  const WS = window.WS;

  WS.boot = function (random, onRun) {
    WS.random = random;
    WS.onRun = onRun;
    const canvas = document.getElementById('game');
    canvas.width = WS.W; canvas.height = WS.H;

    function fit() {
      // Whole-number scale keeps pixels square and crisp; only shrink fractionally when the
      // window is smaller than the native 480x270.
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      let k = Math.min(vw / WS.W, vh / WS.H);
      if (k >= 1) k = Math.floor(k);
      canvas.style.width = Math.floor(WS.W * k) + 'px';
      canvas.style.height = Math.floor(WS.H * k) + 'px';
    }
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(document.documentElement);
    fit();

    const game = window.game = new WS.Game(canvas);
    game.boot();

    let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
    function frame(now) {
      const dt = Math.min(now - last, 250);      // clamp after tab switches
      last = now;
      acc += dt;
      let steps = 0;
      while (acc >= WS.STEP_MS && steps < 6) {   // fixed 60 Hz simulation, independent of display rate
        try { game.tick(); } catch (e) { game.fail(e); }
        acc -= WS.STEP_MS; steps++;
      }
      if (steps === 6) acc = 0;                  // spiral-of-death guard
      try { game.render(); } catch (e) { game.fail(e); }
      fpsT += dt; fpsN++;
      if (fpsT >= 500) { game.fps = Math.round(fpsN * 1000 / fpsT); fpsT = 0; fpsN = 0; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
})();
