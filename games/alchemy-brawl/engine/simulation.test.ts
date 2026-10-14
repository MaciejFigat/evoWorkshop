import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { fullDeck, type Card } from './cards.ts';
import { DEFAULT_RULES } from './config.ts';
import { legalBets, startHand, step } from './hand.ts';
import { bestCombination, compareCombinations } from './scoring.ts';
import {
  CATEGORIES,
  type Category,
  type Combination,
  type Decision,
  type HandAction,
  type HandState,
} from './types.ts';

const SAMPLES = 40_000;
const TOLERANCE = 1.0;

// Spec §8, "player's best", in percent.
const SPEC: Record<string, Record<Category, number>> = {
  'table 2, hand 3': { straightFlush: 0.6, three: 0.7, straight: 7.9, flush: 11.5, pair: 30.8, high: 48.5 },
  'table 3, hand 3': { straightFlush: 1.8, three: 2.1, straight: 20.2, flush: 24.7, pair: 31.2, high: 20.1 },
  'table 3, hand 4': { straightFlush: 2.4, three: 2.7, straight: 25.0, flush: 27.3, pair: 29.6, high: 13.0 },
};

function bestOfHand(hand: Card[], table: Card[]): Category {
  let best: Combination | null = null;
  for (const card of hand) {
    const candidate = bestCombination(card, table);
    if (best === null || compareCombinations(candidate, best) > 0) {
      best = candidate;
    }
  }
  if (best === null) {
    throw new Error('empty hand');
  }
  return best.category;
}

describe("player's best combination odds (spec §8)", () => {
  const deck = fullDeck();
  for (const [label, expected] of Object.entries(SPEC)) {
    const [tableSize, handSize] = label.match(/\d+/g)?.map(Number) ?? [];
    it(`matches the spec table for ${label}`, () => {
      if (tableSize === undefined || handSize === undefined) {
        throw new Error(`bad label ${label}`);
      }
      const rng = mulberry32(2026);
      const counts: Record<Category, number> = { high: 0, pair: 0, flush: 0, straight: 0, three: 0, straightFlush: 0 };
      for (let i = 0; i < SAMPLES; i += 1) {
        const shuffled = rng.shuffle(deck);
        const table = shuffled.slice(0, tableSize);
        const hand = shuffled.slice(tableSize, tableSize + handSize);
        counts[bestOfHand(hand, table)] += 1;
      }
      for (const category of CATEGORIES) {
        const percent = (counts[category] / SAMPLES) * 100;
        expect(Math.abs(percent - expected[category]), `${category}: ${percent.toFixed(2)}%`).toBeLessThan(TOLERANCE);
      }
    });
  }
});

const SEATS = 6;
const HANDS = 2_000;
const STACK = 1_000;
const TIMEOUT_CHANCE = 0.1;

function chips(state: HandState): number {
  return state.players.reduce((sum, p) => sum + p.stack, 0) + state.round1Pot + state.finalPot;
}

function pick<T>(rng: { int(min: number, max: number): number }, items: T[]): T {
  const item = items[rng.int(0, items.length - 1)];
  if (item === undefined) {
    throw new Error('pick from an empty list');
  }
  return item;
}

function randomDecision(rng: { next(): number; int(min: number, max: number): number }, hand: Card[]): Decision {
  if (rng.next() < 0.5 || hand.length < 2) {
    return { kind: 'skip' };
  }
  const cast = pick(rng, hand);
  const show = pick(rng, hand.filter((c) => c !== cast));
  return { kind: 'stay', cast, show };
}

function randomAction(rng: { next(): number; int(min: number, max: number): number }, state: HandState): HandAction {
  const timeout = rng.next() < TIMEOUT_CHANCE;
  switch (state.phase) {
    case 'decide': {
      if (timeout) {
        return { type: 'timeout' };
      }
      const seats = state.players.flatMap((p, seat) => (p.decision === null ? [seat] : []));
      const seat = pick(rng, seats);
      return { type: 'decide', seat, decision: randomDecision(rng, state.players[seat]?.hand ?? []) };
    }
    case 'cast': {
      if (timeout) {
        return { type: 'timeout' };
      }
      const seats = state.players.flatMap((p, seat) => (!p.folded && p.pendingCast === null ? [seat] : []));
      const seat = pick(rng, seats);
      return { type: 'cast', seat, card: pick(rng, state.players[seat]?.hand ?? []) };
    }
    case 'bet': {
      const seat = state.betting?.toAct[0];
      if (seat === undefined) {
        throw new Error('bet phase without an actor');
      }
      return timeout ? { type: 'timeout' } : { type: 'bet', seat, kind: pick(rng, legalBets(state, seat)) };
    }
    case 'round1End':
    case 'reveal':
      return { type: 'advance' };
    case 'done':
      throw new Error('hand already over');
  }
}

describe('random play', () => {
  // Every hand starts from full stacks, as the table tops them up to maxHandCost before dealing.
  it(`plays ${HANDS} hands at ${SEATS} seats without errors and conserves chips`, () => {
    const rng = mulberry32(7);
    const deck = fullDeck();
    const seats = Array.from({ length: SEATS }, (_, i) => ({ id: `p${i}`, stack: STACK }));
    const total = SEATS * STACK;
    for (let hand = 0; hand < HANDS; hand += 1) {
      const started = startHand(DEFAULT_RULES, seats, hand % SEATS, rng.shuffle(deck));
      if (!started.ok) {
        throw new Error(`hand ${hand}: ${started.reason}`);
      }
      let state = started.state;
      let steps = 0;
      while (state.phase !== 'done') {
        const action = randomAction(rng, state);
        const result = step(state, action);
        if (!result.ok) {
          throw new Error(`hand ${hand} step ${steps} ${action.type}: ${result.reason}`);
        }
        state = result.state;
        steps += 1;
        if (chips(state) !== total) {
          throw new Error(`hand ${hand} step ${steps}: chips ${chips(state)} != ${total}`);
        }
        if (steps > 100) {
          throw new Error(`hand ${hand}: no end after ${steps} steps`);
        }
      }
      expect(state.final).not.toBeNull();
      expect(state.round1Pot + state.finalPot).toBe(0);
      expect(chips(state)).toBe(total);
    }
  });
});
