import { bestFive, round1Combination, type BetOptions, type Card, type HandView } from '@evo/alchemy-brawl/engine';
import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { chooseBotMove, type BotMove } from './bot.ts';

const f = (power: number): Card => ({ element: 'fire', power });
const w = (power: number): Card => ({ element: 'water', power });
const e = (power: number): Card => ({ element: 'earth', power });
const a = (power: number): Card => ({ element: 'air', power });

type Setup = {
  phase: HandView['phase'];
  table: Card[];
  hand: Card[];
  canDecide?: boolean;
  bet?: BetOptions;
  stack?: number;
  level?: number;
  pot?: number;
};

const STACK = 990;

// Builds the view the engine would publish: Round 1 show options in 'decide', the best five among
// hand and table plus the betting options once the Final is on.
function view(setup: Setup): HandView {
  const inFinal = setup.phase === 'bet' || setup.phase === 'reveal' || setup.phase === 'done';
  const level = setup.level ?? 0;
  return {
    phase: setup.phase,
    button: 0,
    round1Pot: 9,
    finalPot: setup.pot ?? 21,
    table: setup.table,
    deckCount: 30,
    players: [
      {
        id: 'bot-1',
        stack: setup.stack ?? STACK,
        handCount: setup.hand.length,
        decided: true,
        stayed: inFinal ? false : null,
        shown: null,
        folded: false,
        allIn: false,
        committed: 10,
        roundCommitted: 0,
      },
    ],
    betting: setup.phase === 'bet' ? { level, minRaise: 30, actor: 0 } : null,
    round1: null,
    final: null,
    you: {
      seat: 0,
      hand: setup.hand,
      decision: null,
      canDecide: setup.canDecide ?? false,
      bet: setup.bet ?? null,
      options: setup.phase === 'decide' ? setup.hand.map((card) => ({ card, combination: round1Combination(card, setup.table) })) : [],
      best: inFinal ? bestFive([...setup.hand, ...setup.table]) : null,
    },
  };
}

// A bet of 30 is in front of the seat, which has not put anything in yet.
const facingBet = (stack = STACK): Setup => ({
  phase: 'bet',
  table: [f(5), w(6), e(9)],
  hand: [],
  stack,
  level: 30,
  pot: 81,
  bet: { canCheck: false, call: Math.min(30, stack), callAllIn: stack <= 30, raise: stack > 30 ? { min: Math.min(60, stack), max: stack } : null },
});

const unopened: Setup = {
  phase: 'bet',
  table: [f(5), w(6), e(9)],
  hand: [],
  pot: 21,
  bet: { canCheck: true, call: 0, callAllIn: false, raise: { min: 30, max: STACK } },
};

// Final hands against the table f(5), w(6), e(9): a 5-6-7-8-9 straight, three 5s with 13-9 kickers,
// two pair 6s and 5s with a 13, a pair of 5s with 13-11-9 kickers, and a 13 high with no pair,
// straight or flush among the seven cards.
const STRAIGHT = [e(7), a(8), w(13), a(2)];
const THREE = [e(5), a(5), w(13), a(2)];
const TWO_PAIR = [e(5), a(6), w(13), a(2)];
const PAIR = [e(5), a(2), a(13), w(11)];
const HIGH = [w(2), f(13), e(3), a(11)];

function sample(setup: Setup, n = 200): BotMove[] {
  return Array.from({ length: n }, (_, seed) => chooseBotMove(view(setup), mulberry32(seed + 1))).flatMap((m) => (m === null ? [] : [m]));
}

const kinds = (moves: BotMove[], kind: string): number =>
  moves.filter((m) => m.type === 'bet' && m.action.kind === kind).length;

describe('chooseBotMove', () => {
  it('stays with a pair, showing the card that makes it', () => {
    const move = chooseBotMove(
      view({ phase: 'decide', canDecide: true, table: [f(5), w(9)], hand: [e(5), w(2), f(11)] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'decide', decision: { kind: 'stay', show: e(5) } });
  });

  it('shows the card of the strongest option when more than one card pairs the table', () => {
    const move = chooseBotMove(
      view({ phase: 'decide', canDecide: true, table: [f(5), w(9)], hand: [e(5), a(9), f(11)] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'decide', decision: { kind: 'stay', show: a(9) } });
  });

  it('skips with nothing unless the bluff roll hits', () => {
    const setup: Setup = { phase: 'decide', canDecide: true, table: [f(5), w(9)], hand: [e(2), w(7), f(11)] };
    const outcomes = sample(setup);
    const skips = outcomes.filter((m) => m.type === 'decide' && m.decision.kind === 'skip').length;
    const bluffs = outcomes.filter((m) => m.type === 'decide' && m.decision.kind === 'stay');
    expect(skips).toBeGreaterThan(120);
    expect(bluffs.length).toBeGreaterThan(10);
    for (const bluff of bluffs) {
      expect(bluff).toEqual({ type: 'decide', decision: { kind: 'stay', show: f(11) } });
    }
  });

  it('raises a straight by the size of the pot', () => {
    const move = chooseBotMove(view({ ...facingBet(), hand: STRAIGHT }), mulberry32(1));
    expect(move).toEqual({ type: 'bet', action: { kind: 'raise', to: 30 + 81 } });
  });

  it('raises three of a kind by the size of the pot, the weakest strong hand', () => {
    const move = chooseBotMove(view({ ...facingBet(), hand: THREE }), mulberry32(1));
    expect(move).toEqual({ type: 'bet', action: { kind: 'raise', to: 30 + 81 } });
  });

  it('plays two pair as a medium hand: the minimum raise now and then, otherwise a call', () => {
    const outcomes = sample({ ...facingBet(), hand: TWO_PAIR });
    const raises = outcomes.filter((m) => m.type === 'bet' && m.action.kind === 'raise');
    const calls = kinds(outcomes, 'call');
    expect(raises.length + calls).toBe(200);
    expect(raises.length).toBeGreaterThan(30);
    expect(calls).toBeGreaterThan(100);
    for (const raise of raises) {
      expect(raise).toEqual({ type: 'bet', action: { kind: 'raise', to: 60 } });
    }
  });

  it('opens a straight for the minimum when the pot is smaller than the minimum bet', () => {
    const move = chooseBotMove(view({ ...unopened, hand: STRAIGHT }), mulberry32(1));
    expect(move).toEqual({ type: 'bet', action: { kind: 'raise', to: 30 } });
  });

  it('caps a pot-sized raise at the stack and calls when it cannot raise', () => {
    const short = chooseBotMove(view({ ...facingBet(50), hand: STRAIGHT, pot: 500 }), mulberry32(1));
    expect(short).toEqual({ type: 'bet', action: { kind: 'raise', to: 50 } });
    const covered = chooseBotMove(view({ ...facingBet(20), hand: STRAIGHT }), mulberry32(1));
    expect(covered).toEqual({ type: 'bet', action: { kind: 'call' } });
  });

  it('raises a pair to the minimum now and then and otherwise calls a cheap bet', () => {
    const outcomes = sample({ ...facingBet(), hand: PAIR });
    const raises = outcomes.filter((m) => m.type === 'bet' && m.action.kind === 'raise');
    const calls = kinds(outcomes, 'call');
    expect(raises.length + calls).toBe(200);
    expect(raises.length).toBeGreaterThan(30);
    expect(calls).toBeGreaterThan(100);
    for (const raise of raises) {
      expect(raise).toEqual({ type: 'bet', action: { kind: 'raise', to: 60 } });
    }
  });

  it('folds a pair to an expensive bet some of the time and calls the rest', () => {
    const expensive: Setup = {
      ...facingBet(100),
      hand: PAIR,
      level: 500,
      bet: { canCheck: false, call: 100, callAllIn: true, raise: null },
    };
    const outcomes = sample(expensive);
    const folds = kinds(outcomes, 'fold');
    const calls = kinds(outcomes, 'call');
    expect(folds + calls).toBe(200);
    expect(folds).toBeGreaterThan(30);
    expect(calls).toBeGreaterThan(folds);
  });

  it('checks a pair when nothing is in front of it unless the raise roll hits', () => {
    const outcomes = sample({ ...unopened, hand: PAIR });
    expect(kinds(outcomes, 'check') + kinds(outcomes, 'raise')).toBe(200);
    expect(kinds(outcomes, 'check')).toBeGreaterThan(100);
  });

  it('checks with a high card and never raises it', () => {
    const outcomes = sample({ ...unopened, hand: HIGH });
    expect(kinds(outcomes, 'check')).toBe(200);
  });

  it('mostly folds a high card to a cheap bet and always folds to an expensive one', () => {
    const cheap = sample({ ...facingBet(), hand: HIGH });
    const folds = kinds(cheap, 'fold');
    const calls = kinds(cheap, 'call');
    expect(folds + calls).toBe(200);
    expect(folds).toBeGreaterThan(calls);
    expect(calls).toBeGreaterThan(20);
    const expensive = sample({ ...facingBet(), hand: HIGH, level: 200, bet: { canCheck: false, call: 200, callAllIn: false, raise: { min: 400, max: STACK } } });
    expect(kinds(expensive, 'fold')).toBe(200);
  });

  it('never raises above its stack', () => {
    const short = (hand: Card[]): Setup => ({
      ...facingBet(45),
      hand,
      pot: 500,
      bet: { canCheck: false, call: 30, callAllIn: false, raise: { min: 45, max: 45 } },
    });
    for (const hand of [STRAIGHT, THREE, TWO_PAIR, PAIR, HIGH]) {
      for (const move of sample(short(hand), 100)) {
        if (move.type === 'bet' && move.action.kind === 'raise') {
          expect(move.action.to).toBeLessThanOrEqual(45);
        }
      }
    }
  });

  it('does nothing when it is not its turn', () => {
    expect(chooseBotMove(view({ phase: 'bet', table: [f(5), w(6), e(9)], hand: HIGH }), mulberry32(1))).toBeNull();
  });
});
