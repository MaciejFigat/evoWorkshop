import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { fullDeck } from '../cards.ts';
import { DEFAULT_RULES } from '../config.ts';
import { startHand, step } from './hand.ts';
import type { HandAction, HandState } from './types.ts';

const HANDS = 10_000;
const PLAYERS = 6;

// Random casting, nobody folds: the baseline of spec appendix A.3 for 6 players.
function simulate(seed: number): { rounds: number; collisions: number; noWinner: number; byReserve: number } {
  const rng = mulberry32(seed);
  const seats = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, stack: 100 }));
  const totals = { rounds: 0, collisions: 0, noWinner: 0, byReserve: 0 };
  for (let hand = 0; hand < HANDS; hand += 1) {
    const started = startHand(DEFAULT_RULES, seats, hand, rng.shuffle(fullDeck()));
    if (!started.ok) {
      throw new Error(started.reason);
    }
    let state: HandState = started.state;
    while (state.phase !== 'done') {
      const result = step(state, nextAction(state, rng.int));
      if (!result.ok) {
        throw new Error(result.reason);
      }
      state = result.state;
    }
    totals.rounds += state.results.length;
    totals.collisions += state.results.filter((r) => r.burned.length > 0).length;
    totals.noWinner += state.results.filter((r) => r.winner === null).length;
    totals.byReserve += state.outcome !== null && state.outcome.shownReserves.length > 0 ? 1 : 0;
  }
  return totals;
}

function nextAction(state: HandState, int: (min: number, max: number) => number): HandAction {
  if (state.phase === 'cast') {
    const seat = state.players.findIndex((p) => p.pendingCast === null);
    const hand = state.players[seat]?.hand ?? [];
    const card = hand[int(0, hand.length - 1)];
    return card === undefined ? { type: 'timeout' } : { type: 'cast', seat, card };
  }
  const actor = state.betting?.toAct[0];
  return actor === undefined ? { type: 'advance' } : { type: 'bet', seat: actor, kind: 'check' };
}

describe('simulation against spec appendix A.3', () => {
  it('reproduces the 6-player random-casting baseline', () => {
    const { rounds, collisions, noWinner, byReserve } = simulate(42);
    expect(rounds).toBe(HANDS * 3);
    expect(Math.abs(collisions / rounds - 0.655)).toBeLessThan(0.015);
    expect(noWinner / rounds).toBeLessThan(0.01);
    expect(Math.abs(byReserve / HANDS - 0.196)).toBeLessThan(0.015);
  });
});
