import { bestCombination, type Card, type HandView, type YouView } from '@evo/alchemy-brawl/engine';
import { mulberry32 } from '@evo/rng';
import { describe, expect, it } from 'vitest';
import { chooseBotMove } from './bot.ts';

const f = (power: number): Card => ({ element: 'fire', power });
const w = (power: number): Card => ({ element: 'water', power });
const e = (power: number): Card => ({ element: 'earth', power });

type Setup = { phase: HandView['phase']; table: Card[]; hand: Card[] } & Partial<YouView>;

function view(setup: Setup): HandView {
  const own = setup.pendingCast === undefined || setup.pendingCast === null ? setup.hand : [...setup.hand, setup.pendingCast];
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
      pendingCast: setup.pendingCast ?? null,
      canDecide: setup.canDecide ?? false,
      canCast: setup.canCast ?? false,
      legalBets: setup.legalBets ?? [],
      options: own.map((card) => ({ card, combination: bestCombination(card, setup.table) })),
    },
  };
}

describe('chooseBotMove', () => {
  it('stays with a pair, casting it and showing the highest other card', () => {
    const move = chooseBotMove(
      view({ phase: 'decide', canDecide: true, table: [f(5), w(9)], hand: [e(5), w(2), f(11)] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'decide', decision: { kind: 'stay', cast: e(5), show: f(11) } });
  });

  it('skips with nothing unless the bluff roll hits', () => {
    const setup: Setup = { phase: 'decide', canDecide: true, table: [f(5), w(9)], hand: [e(2), w(7), f(11)] };
    const outcomes = Array.from({ length: 200 }, (_, seed) => chooseBotMove(view(setup), mulberry32(seed + 1)));
    const skips = outcomes.filter((m) => m?.type === 'decide' && m.decision.kind === 'skip').length;
    const bluffs = outcomes.filter((m) => m?.type === 'decide' && m.decision.kind === 'stay');
    expect(skips).toBeGreaterThan(120);
    expect(bluffs.length).toBeGreaterThan(10);
    for (const bluff of bluffs) {
      expect(bluff).toEqual({ type: 'decide', decision: { kind: 'stay', cast: e(2), show: f(11) } });
    }
  });

  it('casts the card that makes the best combination', () => {
    const move = chooseBotMove(
      view({ phase: 'cast', canCast: true, table: [f(5), w(6), e(9)], hand: [e(7), w(9), f(13)] }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'cast', card: e(7) });
  });

  it('raises with a straight', () => {
    const move = chooseBotMove(
      view({
        phase: 'bet',
        table: [f(5), w(6), e(9)],
        hand: [w(9), f(13)],
        pendingCast: e(7),
        legalBets: ['fold', 'call', 'raise'],
      }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'bet', kind: 'raise' });
  });

  it('checks with a high card and never bets it', () => {
    const move = chooseBotMove(
      view({
        phase: 'bet',
        table: [f(5), w(6), e(9)],
        hand: [w(2), f(13)],
        pendingCast: e(3),
        legalBets: ['check', 'bet'],
      }),
      mulberry32(1),
    );
    expect(move).toEqual({ type: 'bet', kind: 'check' });
  });

  it('does nothing when it is not its turn', () => {
    expect(chooseBotMove(view({ phase: 'bet', table: [f(5), w(6), e(9)], hand: [w(2)] }), mulberry32(1))).toBeNull();
  });
});
