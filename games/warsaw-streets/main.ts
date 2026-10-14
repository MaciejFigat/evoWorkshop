import { connect } from '@evo/game-sdk';

// The engine is plain JavaScript on window.WS (classic scripts, no build step by design);
// this module only hands it the host seed and reports each run as a round.
type RunSummary = { result: 'clear' | 'gameover'; score: number; stage: number; lives: number };

type Engine = { boot: (random: () => number, onRun: (run: RunSummary) => void) => void };

declare global {
  interface Window {
    WS: Engine;
  }
}

connect((session) => {
  let round = 0;
  window.WS.boot(
    () => session.rng.next(),
    (run) => {
      round += 1;
      session.emit('round', { round, seed: session.seed, stake: 0, payout: 0, balance: 0, ...run });
    },
  );
});
