import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../config.ts';
import { startHand, step } from './hand.ts';
import { card, cards, stackedDeck } from './testDeck.ts';
import type { BetKind, HandAction, HandEvent, HandState, StepResult } from './types.ts';
import { viewFor } from './view.ts';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, stack: 100 }));

function ok(result: StepResult): { state: HandState; events: HandEvent[] } {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result;
}

function play(state: HandState, actions: HandAction[]): HandState {
  return actions.reduce((current, action) => ok(step(current, action)).state, state);
}

const castAll = (labels: Record<number, string>): HandAction[] =>
  Object.entries(labels).map(([seat, label]) => ({ type: 'cast', seat: Number(seat), card: card(label) }));

const bets = (list: [number, BetKind][]): HandAction[] => list.map(([seat, kind]) => ({ type: 'bet', seat, kind }));

const advance: HandAction = { type: 'advance' };

// Appendix B of the spec. Seats: Ada 0 (button), Ben 1, Cleo 2, Dan 3.
const ADA = 0;
const BEN = 1;
const CLEO = 2;
const DAN = 3;

function appendixB(): HandState {
  const received = [
    cards('11W 13A 12W 1E 2E 3E'),
    cards('11F 2F 1W 2W 3W'),
    cards('6F 8F 4F 5E 6E 7E'),
    cards('9E 10E 9W 1A 2A 4A'),
  ];
  const deck = stackedDeck([BEN, CLEO, DAN, ADA], received, cards('3A 5F 7W'));
  return ok(startHand(DEFAULT_RULES, seats(4), ADA, deck)).state;
}

describe('a full hand (spec appendix B)', () => {
  it('plays out to Ada winning the 52-unit pot', () => {
    let state = appendixB();
    expect(state.pot).toBe(4);

    state = play(state, castAll({ [ADA]: '11W', [BEN]: '11F', [CLEO]: '6F', [DAN]: '9E' }));
    expect(state.phase).toBe('reveal');
    expect(state.catalyst).toEqual(card('3A'));
    state = play(state, [advance]);
    expect(state.results[0]).toMatchObject({ burned: [ADA, BEN], winner: DAN, value: 1 });

    state = play(state, [advance, ...castAll({ [ADA]: '13A', [BEN]: '2F', [CLEO]: '8F', [DAN]: '10E' })]);
    expect(state.phase).toBe('bet');
    state = play(
      state,
      bets([
        [BEN, 'check'],
        [CLEO, 'bet'],
        [DAN, 'call'],
        [ADA, 'raise'],
        [BEN, 'fold'],
        [CLEO, 'call'],
        [DAN, 'call'],
      ]),
    );
    expect(state.pot).toBe(16);
    state = play(state, [advance]);
    expect(state.results[1]).toMatchObject({ winner: CLEO, burned: [] });
    expect(state.results[1]?.casts.map((c) => c.seat)).toEqual([ADA, CLEO, DAN]);

    state = play(state, [advance, ...castAll({ [ADA]: '12W', [CLEO]: '4F', [DAN]: '9W' })]);
    state = play(
      state,
      bets([
        [CLEO, 'bet'],
        [DAN, 'raise'],
        [ADA, 'raise'],
        [CLEO, 'call'],
        [DAN, 'call'],
      ]),
    );
    expect(state.pot).toBe(52);
    state = play(state, [advance]);
    expect(state.results[2]).toMatchObject({ winner: ADA, value: 2 });

    const { state: done, events } = ok(step(state, advance));
    expect(done.phase).toBe('done');
    expect(done.outcome?.scores).toEqual([
      { seat: CLEO, sigils: 1, recipes: ['essence'], score: 2 },
      { seat: DAN, sigils: 1, recipes: [], score: 1 },
      { seat: ADA, sigils: 2, recipes: ['chain'], score: 3 },
    ]);
    expect(done.outcome?.winners).toEqual([ADA]);
    expect(done.outcome?.payouts).toEqual([52, 0, 0, 0]);
    expect(done.players.map((p) => p.stack)).toEqual([135, 99, 83, 83]);
    expect(events.at(-1)?.type).toBe('handEnded');
  });

  it('caps a betting round at three bets', () => {
    let state = play(appendixB(), [
      ...castAll({ [ADA]: '11W', [BEN]: '11F', [CLEO]: '6F', [DAN]: '9E' }),
      advance,
      advance,
      ...castAll({ [ADA]: '13A', [BEN]: '2F', [CLEO]: '8F', [DAN]: '10E' }),
      ...bets([
        [BEN, 'bet'],
        [CLEO, 'raise'],
        [DAN, 'raise'],
      ]),
    ]);
    expect(viewFor(state, ADA).you?.legalBets).toEqual(['fold', 'call']);
    const raised = step(state, { type: 'bet', seat: ADA, kind: 'raise' });
    expect(raised).toEqual({ ok: false, reason: 'illegal_bet' });
    state = play(state, bets([[ADA, 'call']]));
    expect(state.betting?.toAct).toEqual([BEN, CLEO]);
  });
});

describe('step', () => {
  it('rejects a bet out of turn and a cast of a card not in hand', () => {
    const state = appendixB();
    expect(step(state, { type: 'cast', seat: ADA, card: card('9F') })).toEqual({
      ok: false,
      reason: 'card_not_in_hand',
    });
    expect(step(state, { type: 'bet', seat: ADA, kind: 'check' })).toEqual({ ok: false, reason: 'wrong_phase' });
  });

  it('casts the lowest card for everyone still casting on timeout', () => {
    const state = play(appendixB(), [...castAll({ [ADA]: '13A' }), { type: 'timeout' }]);
    expect(state.phase).toBe('reveal');
    expect(state.players.map((p) => p.pendingCast)).toEqual([card('13A'), card('1W'), card('4F'), card('1A')]);
  });

  it('checks on timeout when possible, otherwise folds', () => {
    let state = play(appendixB(), [
      ...castAll({ [ADA]: '11W', [BEN]: '11F', [CLEO]: '6F', [DAN]: '9E' }),
      advance,
      advance,
      ...castAll({ [ADA]: '13A', [BEN]: '2F', [CLEO]: '8F', [DAN]: '10E' }),
      { type: 'timeout' },
    ]);
    expect(state.players[BEN]?.folded).toBe(false);
    state = play(state, [...bets([[CLEO, 'bet']]), { type: 'timeout' }]);
    expect(state.players[DAN]?.folded).toBe(true);
  });

  it('ends the hand at once when everyone else folds', () => {
    const state = ok(startHand(DEFAULT_RULES, seats(2), 0, stackedDeck([1, 0], [], []))).state;
    const hand0 = state.players[0]?.hand[0];
    const hand1 = state.players[1]?.hand[0];
    if (hand0 === undefined || hand1 === undefined) {
      throw new Error('no cards dealt');
    }
    const done = play(state, [
      { type: 'cast', seat: 0, card: hand0 },
      { type: 'cast', seat: 1, card: hand1 },
      advance,
      advance,
      { type: 'cast', seat: 0, card: state.players[0]?.hand[1] ?? hand0 },
      { type: 'cast', seat: 1, card: state.players[1]?.hand[1] ?? hand1 },
      ...bets([
        [1, 'bet'],
        [0, 'fold'],
      ]),
    ]);
    expect(done.phase).toBe('done');
    expect(done.outcome).toMatchObject({ reason: 'fold', winners: [1], payouts: [0, 4] });
    expect(done.players.map((p) => p.stack)).toEqual([99, 101]);
  });

  it('splits a tie on equal reserves and gives the odd chip clockwise from the button', () => {
    const received = [
      cards('2F 5W 9E 10F 10W 10E'),
      cards('2W 5E 9F 13F 12F 11F'),
      cards('2E 5F 9W 13W 12W 11W'),
    ];
    let state = ok(startHand(DEFAULT_RULES, seats(3), 0, stackedDeck([1, 2, 0], received, cards('1A 2A 3A')))).state;
    for (const round of [0, 1, 2]) {
      state = play(
        state,
        received.flatMap((r, seat): HandAction[] => {
          const c = r[round];
          return c === undefined ? [] : [{ type: 'cast', seat, card: c }];
        }),
      );
      if (state.phase === 'bet') {
        state = play(state, bets([[1, 'check'], [2, 'check'], [0, 'check']]));
      }
      state = play(state, [advance, advance]);
    }
    expect(state.results.every((r) => r.winner === null)).toBe(true);
    expect(state.outcome?.winners).toEqual([1, 2]);
    expect(state.outcome?.payouts).toEqual([0, 2, 1]);
    expect(state.outcome?.shownReserves.map((r) => r.seat)).toEqual([1, 2, 0]);
  });
});

describe('viewFor', () => {
  it('never shows another player hand or face-down cast', () => {
    const state = play(appendixB(), castAll({ [BEN]: '11F' }));
    const view = viewFor(state, ADA);
    expect(view.you?.hand).toEqual(state.players[ADA]?.hand);
    expect(view.players[BEN]).toMatchObject({ castLocked: true });
    const json = JSON.stringify(view);
    expect(json).not.toContain(JSON.stringify(card('11F')));
    for (const other of [BEN, CLEO, DAN]) {
      for (const held of state.players[other]?.hand ?? []) {
        expect(json).not.toContain(JSON.stringify(held));
      }
    }
  });

  it('gives a spectator no private part', () => {
    expect(viewFor(appendixB(), null).you).toBeNull();
  });
});
