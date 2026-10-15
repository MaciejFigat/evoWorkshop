import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { fullDeck, type Card } from './cards.ts';
import { DEFAULT_RULES } from './config.ts';
import { betOptions, startHand, step } from './hand.ts';
import { bestCombination, bestOfCards, compareCombinations, winnersOf } from './scoring.ts';
import {
  CATEGORIES,
  type BetAction,
  type Category,
  type Combination,
  type Decision,
  type HandAction,
  type HandState,
  type SeatCombination,
} from './types.ts';

const SAMPLES = 40_000;
const TOLERANCE = 1.0;
const SEED = 2026;

type Odds = Record<Category, number>;

// Spec §8, "player's best", in percent. Round 1: the best shown card with both table cards.
const ROUND1_SPEC: Odds = { straightFlush: 0.6, three: 0.7, straight: 7.9, flush: 11.5, pair: 30.8, high: 48.5 };

// Spec §8, "player's best", in percent. Final: the best three among the four-card hand and the three table
// cards. The third table card is drawn after the Round 1 pair, which leaves the distribution of three
// random table cards unchanged.
const FINAL_SPEC: Odds = { straightFlush: 6.5, three: 7.5, straight: 43.1, flush: 34.9, pair: 7.2, high: 0.8 };

// Spec §8, "wins the round", in percent, with all 6 players revealing their best, plus the share of
// rounds where the win is an exact tie.
const WINS_SEATS = 6;
type RoundOdds = { winner: Odds; ties: number };
const ROUND1_WINS: RoundOdds = {
  winner: { straightFlush: 3.3, three: 3.6, straight: 21.7, flush: 17.4, pair: 51.4, high: 2.7 },
  ties: 31.8,
};
const FINAL_WINS: RoundOdds = {
  winner: { straightFlush: 32.4, three: 25.8, straight: 41.0, flush: 0.9, pair: 0.0, high: 0.0 },
  ties: 13.0,
};

type Best = (hand: Card[], table: Card[]) => Combination;

const bestShown: Best = (hand, table) => {
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
  return best;
};

const bestOfAll: Best = (hand, table) => {
  const best = bestOfCards([...hand, ...table]);
  if (best === null) {
    throw new Error('fewer than three cards');
  }
  return best;
};

function emptyOdds(): Odds {
  return { high: 0, pair: 0, flush: 0, straight: 0, three: 0, straightFlush: 0 };
}

function toPercent(counts: Odds): Odds {
  const odds = emptyOdds();
  for (const category of CATEGORIES) {
    odds[category] = (counts[category] / SAMPLES) * 100;
  }
  return odds;
}

function measure(tableSize: number, handSize: number, best: Best): Odds {
  const deck = fullDeck();
  const rng = mulberry32(SEED);
  const counts = emptyOdds();
  for (let i = 0; i < SAMPLES; i += 1) {
    const shuffled = rng.shuffle(deck);
    const table = shuffled.slice(0, tableSize);
    const hand = shuffled.slice(tableSize, tableSize + handSize);
    counts[best(hand, table).category] += 1;
  }
  return toPercent(counts);
}

function measureWins(tableSize: number, handSize: number, best: Best): RoundOdds {
  const deck = fullDeck();
  const rng = mulberry32(SEED);
  const counts = emptyOdds();
  let ties = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const shuffled = rng.shuffle(deck);
    const table = shuffled.slice(0, tableSize);
    const entries: SeatCombination[] = Array.from({ length: WINS_SEATS }, (_, seat) => {
      const from = tableSize + seat * handSize;
      return { seat, combination: best(shuffled.slice(from, from + handSize), table) };
    });
    const winners = winnersOf(entries);
    const winner = entries.find((entry) => entry.seat === winners[0]);
    if (winner === undefined) {
      throw new Error('round without a winner');
    }
    counts[winner.combination.category] += 1;
    if (winners.length > 1) {
      ties += 1;
    }
  }
  return { winner: toPercent(counts), ties: (ties / SAMPLES) * 100 };
}

function expectOdds(measured: Odds, expected: Odds): void {
  for (const category of CATEGORIES) {
    const percent = measured[category];
    expect(Math.abs(percent - expected[category]), `${category}: ${percent.toFixed(2)}%`).toBeLessThan(TOLERANCE);
  }
}

function expectWins(measured: RoundOdds, expected: RoundOdds): void {
  expectOdds(measured.winner, expected.winner);
  expect(Math.abs(measured.ties - expected.ties), `ties: ${measured.ties.toFixed(2)}%`).toBeLessThan(TOLERANCE);
}

describe("player's best combination odds (spec §8)", () => {
  it('matches the spec table for Round 1, table 2, hand 3', () => {
    expectOdds(measure(2, 3, bestShown), ROUND1_SPEC);
  });

  it('matches the spec table for the Final, table 3, hand 4', () => {
    expectOdds(measure(3, 4, bestOfAll), FINAL_SPEC);
  });
});

describe('winning combination odds at 6 players (spec §8)', () => {
  it('matches the spec table for Round 1, every player showing their best card', () => {
    expectWins(measureWins(2, 3, bestShown), ROUND1_WINS);
  });

  it('matches the spec table for the Final, every player holding 4 cards', () => {
    expectWins(measureWins(3, 4, bestOfAll), FINAL_WINS);
  });
});

const SEATS = 6;
const HANDS = 2_000;
const STACK = 1_000;
const TIMEOUT_CHANCE = 0.1;
const ALL_IN_CHANCE = 0.05;
// A full raise can reopen the action for five seats; stacks bound the number of full raises.
const MAX_STEPS = 500;

function chips(state: HandState): number {
  return state.players.reduce((sum, p) => sum + p.stack, 0) + state.round1Pot + state.finalPot;
}

type Dice = { next(): number; int(min: number, max: number): number };

function pick<T>(rng: Dice, items: T[]): T {
  const item = items[rng.int(0, items.length - 1)];
  if (item === undefined) {
    throw new Error('pick from an empty list');
  }
  return item;
}

function randomDecision(rng: Dice, hand: Card[]): Decision {
  if (rng.next() < 0.5 || hand.length === 0) {
    return { kind: 'skip' };
  }
  return { kind: 'stay', show: pick(rng, hand) };
}

// A random legal no-limit action: any of the offered kinds, a raise anywhere in the legal range,
// now and then the whole stack.
function randomBet(rng: Dice, state: HandState, seat: number): BetAction {
  const options = betOptions(state, seat);
  if (options === null) {
    throw new Error('bet phase without options for the actor');
  }
  const kinds: BetAction[] = options.canCheck ? [{ kind: 'check' }] : [{ kind: 'fold' }, { kind: 'call' }];
  if (options.raise !== null) {
    const to = rng.next() < ALL_IN_CHANCE ? options.raise.max : rng.int(options.raise.min, options.raise.max);
    kinds.push({ kind: 'raise', to });
  }
  return pick(rng, kinds);
}

function randomAction(rng: Dice, state: HandState): HandAction {
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
    case 'bet': {
      const seat = state.betting?.toAct[0];
      if (seat === undefined) {
        throw new Error('bet phase without an actor');
      }
      return timeout ? { type: 'timeout' } : { type: 'bet', seat, action: randomBet(rng, state, seat) };
    }
    case 'round1End':
    case 'reveal':
      return { type: 'advance' };
    case 'done':
      throw new Error('hand already over');
  }
}

describe('random play', () => {
  // Every hand starts from full stacks: the table tops a short stack up to the buy-in before dealing.
  it(`plays ${HANDS} hands at ${SEATS} seats with random no-limit actions, conserving chips`, () => {
    const rng = mulberry32(7);
    const deck = fullDeck();
    const seats = Array.from({ length: SEATS }, (_, i) => ({ id: `p${i}`, stack: STACK }));
    const total = SEATS * STACK;
    let sidePots = 0;
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
        if (steps > MAX_STEPS) {
          throw new Error(`hand ${hand}: no end after ${steps} steps`);
        }
      }
      const final = state.final;
      if (final === null) {
        throw new Error(`hand ${hand}: done without a result`);
      }
      if (final.reason === 'showdown') {
        expect(final.hands.length).toBeGreaterThanOrEqual(2);
        expect(final.combinations.length).toBe(final.hands.length);
        if (final.pots.length > 1) {
          sidePots += 1;
        }
      } else {
        expect(final.hands).toEqual([]);
        expect(final.pots).toHaveLength(1);
      }
      expect(final.pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(final.pot);
      expect(final.payouts.reduce((sum, payout) => sum + payout, 0)).toBe(final.pot);
      for (const pot of final.pots) {
        expect(pot.winners.length).toBeGreaterThan(0);
        expect(pot.winners.every((seat) => pot.eligible.includes(seat))).toBe(true);
      }
      expect(state.players.every((p) => p.hand.length === 4)).toBe(true);
      expect(state.round1Pot + state.finalPot).toBe(0);
      expect(chips(state)).toBe(total);
    }
    expect(sidePots).toBeGreaterThan(0);
  });
});
