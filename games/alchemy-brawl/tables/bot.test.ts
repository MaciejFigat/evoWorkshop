import { bestCombination, bestOfCards, type Card, type HandView, type YouView } from '@evo/alchemy-brawl/engine';
import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { chooseBotMove } from './bot.ts';

const f = (power: number): Card => ({ element: 'fire', power });
const w = (power: number): Card => ({ element: 'water', power });
const e = (power: number): Card => ({ element: 'earth', power });
const a = (power: number): Card => ({ element: 'air', power });

type Setup = { phase: HandView['phase']; table: Card[]; hand: Card[] } & Partial<Pick<YouView, 'canDecide' | 'legalBets'>>;

// Builds the view the engine would publish: Round 1 show options in 'decide', the best three among
// hand and table once the Final is on.
function view(setup: Setup): HandView {
  const inFinal = setup.phase === 'bet' || setup.phase === 'reveal' || setup.phase === 'done';
  return {
    phase: setup.phase,
    button: 0,
    round1Pot: 9,
    finalPot: 21,
    table: setup.table,
    deckCount: 30,
    players: [],
    betting: null,
    round1: null,
    final: null,
    you: {
      seat: 0,
      hand: setup.hand,
      decision: null,
      canDecide: setup.canDecide ?? false,
      legalBets: setup.legalBets ?? [],
      options: setup.phase === 'decide' ? setup.hand.map((card) => ({ card, combination: bestCombination(card, setup.table) })) : [],
      best: inFinal ? bestOfCards([...setup.hand, ...setup.table]) : null,
    },
  };
}

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
    const outcomes = Array.from({ length: 200 }, (_, seed) => chooseBotMove(view(setup), mulberry32(seed + 1)));
    const skips = outcomes.filter((m) => m?.type === 'decide' && m.decision.kind === 'skip').length;
    const bluffs = outcomes.filter((m) => m?.type === 'decide' && m.decision.kind === 'stay');
    expect(skips).toBeGreaterThan(120);
    expect(bluffs.length).toBeGreaterThan(10);
    for (const bluff of bluffs) {
      expect(bluff).toEqual({ type: 'decide', decision: { kind: 'stay', show: f(11) } });
    }
  });

  it('raises with a straight made from the hand and the table', () => {
    const move = chooseBotMove(
      view({ phase: 'bet', table: [f(5), w(6), e(9)], hand: [e(7), w(9), f(13)], legalBets: ['fold', 'call', 'raise'] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'bet', kind: 'raise' });
  });

  it('bets a pair about half the time and otherwise checks', () => {
    const setup: Setup = { phase: 'bet', table: [f(5), w(6), e(9)], hand: [e(5), a(2), a(13), w(11)], legalBets: ['check', 'bet'] };
    const outcomes = Array.from({ length: 200 }, (_, seed) => chooseBotMove(view(setup), mulberry32(seed + 1)));
    const bets = outcomes.filter((m) => m?.type === 'bet' && m.kind === 'bet').length;
    const checks = outcomes.filter((m) => m?.type === 'bet' && m.kind === 'check').length;
    expect(bets + checks).toBe(200);
    expect(bets).toBeGreaterThan(60);
    expect(checks).toBeGreaterThan(60);
  });

  it('checks with a high card and never bets it', () => {
    const move = chooseBotMove(
      view({ phase: 'bet', table: [f(5), w(6), e(9)], hand: [w(2), f(13), e(3)], legalBets: ['check', 'bet'] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'bet', kind: 'check' });
  });

  it('mostly folds a high card to a bet', () => {
    const setup: Setup = { phase: 'bet', table: [f(5), w(6), e(9)], hand: [w(2), f(13), e(3)], legalBets: ['fold', 'call', 'raise'] };
    const outcomes = Array.from({ length: 200 }, (_, seed) => chooseBotMove(view(setup), mulberry32(seed + 1)));
    const folds = outcomes.filter((m) => m?.type === 'bet' && m.kind === 'fold').length;
    const calls = outcomes.filter((m) => m?.type === 'bet' && m.kind === 'call').length;
    expect(folds + calls).toBe(200);
    expect(folds).toBeGreaterThan(calls);
    expect(calls).toBeGreaterThan(20);
  });

  it('does nothing when it is not its turn', () => {
    expect(chooseBotMove(view({ phase: 'bet', table: [f(5), w(6), e(9)], hand: [w(2), f(13), e(3)] }), mulberry32(1))).toBeNull();
  });
});
