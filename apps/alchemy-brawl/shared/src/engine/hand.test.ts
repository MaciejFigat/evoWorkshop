import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../config.ts';
import { activeOrder, legalBets, lowestCard, startHand, step } from './hand.ts';
import { card, cards, stackedDeck } from './testDeck.ts';
import type { BetKind, HandAction, HandEvent, HandState, StepResult } from './types.ts';
import { viewFor } from './view.ts';

const STACK = 1000;
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, stack: STACK }));

function ok(result: StepResult): { state: HandState; events: HandEvent[] } {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result;
}

function chips(state: HandState): number {
  return state.players.reduce((sum, p) => sum + p.stack, 0) + state.round1Pot + state.finalPot;
}

function play(state: HandState, actions: HandAction[]): HandState {
  return actions.reduce((current, action) => {
    const next = ok(step(current, action)).state;
    expect(chips(next)).toBe(chips(current));
    return next;
  }, state);
}

const stay = (seat: number, cast: string, show: string): HandAction => ({
  type: 'decide',
  seat,
  decision: { kind: 'stay', cast: card(cast), show: card(show) },
});
const skip = (seat: number): HandAction => ({ type: 'decide', seat, decision: { kind: 'skip' } });
const castAll = (labels: Record<number, string>): HandAction[] =>
  Object.entries(labels).map(([seat, label]) => ({ type: 'cast', seat: Number(seat), card: card(label) }));
const bets = (list: [number, BetKind][]): HandAction[] => list.map(([seat, kind]) => ({ type: 'bet', seat, kind }));
const advance: HandAction = { type: 'advance' };
const timeout: HandAction = { type: 'timeout' };

// Appendix of the spec. Seats: Ana 0 (button), Boris 1, Vera 2, Gleb 3.
const ANA = 0;
const BORIS = 1;
const VERA = 2;
const GLEB = 3;

function appendix(): HandState {
  const deck = stackedDeck(
    [BORIS, VERA, GLEB, ANA],
    [cards('7F 12E 13A'), cards('3E 10F 12W'), cards('6W 13E 9A'), cards('2F 11A 5W')],
    cards('10A 11E'),
    [cards('1E'), cards('5F'), cards('7W'), cards('4F')],
    cards('3F 6F 9E'),
  );
  return ok(startHand(DEFAULT_RULES, seats(4), ANA, deck)).state;
}

const ROUND1 = [stay(BORIS, '3E', '12W'), stay(VERA, '9A', '6W'), skip(GLEB), skip(ANA)];
const FINAL_CASTS = castAll({ [BORIS]: '10F', [VERA]: '6W', [GLEB]: '4F', [ANA]: '7F' });

describe('a full hand (spec appendix)', () => {
  it('replays the example hand to Boris taking 268', () => {
    let state = appendix();
    expect(state.round1Pot).toBe(12);
    expect(state.finalPot).toBe(28);
    expect(state.table).toEqual(cards('10A 11E'));
    expect(state.players.map((p) => p.hand)).toEqual([
      cards('7F 12E 13A'),
      cards('3E 10F 12W'),
      cards('6W 13E 9A'),
      cards('2F 11A 5W'),
    ]);

    state = play(state, ROUND1);
    expect(state.phase).toBe('round1End');
    expect(state.round1).toMatchObject({
      pot: 12,
      stayers: [BORIS, VERA],
      shown: [
        { seat: BORIS, card: card('12W') },
        { seat: VERA, card: card('6W') },
      ],
      winners: [VERA],
      payouts: [0, 0, 12, 0],
      rolledOver: false,
    });
    expect(state.round1?.combinations.map((c) => c.combination.category)).toEqual(['high', 'straight']);
    expect(state.round1?.combinations[1]?.combination.key).toEqual([3, 11]);
    expect(state.round1Pot).toBe(0);

    state = play(state, [advance]);
    expect(state.phase).toBe('cast');
    expect(state.table).toEqual(cards('3F 6F 9E'));
    expect(state.players.map((p) => p.hand)).toEqual([
      cards('7F 12E 13A 1E'),
      cards('10F 12W 5F'),
      cards('6W 13E 7W'),
      cards('2F 11A 5W 4F'),
    ]);

    state = play(state, FINAL_CASTS);
    expect(state.phase).toBe('bet');
    expect(state.betting?.toAct).toEqual([BORIS, VERA, GLEB, ANA]);
    state = play(
      state,
      bets([
        [BORIS, 'bet'],
        [VERA, 'call'],
        [GLEB, 'call'],
        [ANA, 'raise'],
        [BORIS, 'raise'],
        [VERA, 'fold'],
        [GLEB, 'fold'],
        [ANA, 'call'],
      ]),
    );
    expect(state.phase).toBe('reveal');
    expect(state.finalPot).toBe(268);

    const { state: done, events } = ok(step(state, advance));
    expect(done.phase).toBe('done');
    expect(done.final).toMatchObject({
      reason: 'showdown',
      pot: 268,
      winners: [BORIS],
      payouts: [0, 268, 0, 0],
    });
    expect(done.final?.combinations).toEqual([
      { seat: ANA, combination: { category: 'flush', cards: cards('7F 3F 6F'), key: [2, 7, 6, 3] } },
      { seat: BORIS, combination: { category: 'flush', cards: cards('10F 3F 6F'), key: [2, 10, 6, 3] } },
    ]);
    expect(done.players.map((p) => p.stack - STACK)).toEqual([-100, 168, -28, -40]);
    expect(done.finalPot).toBe(0);
    expect(events.at(-1)?.type).toBe('handEnded');
  });

  it('caps the betting at three bets', () => {
    const state = play(appendix(), [
      ...ROUND1,
      advance,
      ...FINAL_CASTS,
      ...bets([
        [BORIS, 'bet'],
        [VERA, 'raise'],
        [GLEB, 'raise'],
      ]),
    ]);
    expect(legalBets(state, ANA)).toEqual(['fold', 'call']);
    expect(step(state, { type: 'bet', seat: ANA, kind: 'raise' })).toEqual({ ok: false, reason: 'illegal_bet' });
    expect(step(state, { type: 'bet', seat: BORIS, kind: 'call' })).toEqual({ ok: false, reason: 'not_your_turn' });
  });
});

describe('startHand', () => {
  it('rejects too few players, a short deck and a short stack', () => {
    const deck = stackedDeck([1, 2, 0], [], [], [], []);
    expect(startHand(DEFAULT_RULES, seats(2), 0, deck)).toEqual({ ok: false, reason: 'not_enough_players' });
    expect(startHand(DEFAULT_RULES, seats(3), 0, deck.slice(0, 16))).toEqual({ ok: false, reason: 'deck_too_small' });
    expect(startHand(DEFAULT_RULES, [...seats(2), { id: 'poor', stack: 9 }], 0, deck)).toEqual({
      ok: false,
      reason: 'insufficient_stack',
    });
  });
});

describe('step', () => {
  it('rejects a second decision, a cast equal to the shown card and a bet during the window', () => {
    const state = play(appendix(), [stay(BORIS, '3E', '12W')]);
    expect(step(state, skip(BORIS))).toEqual({ ok: false, reason: 'already_decided' });
    expect(step(state, stay(VERA, '9A', '9A'))).toEqual({ ok: false, reason: 'same_card' });
    expect(step(state, stay(VERA, '9A', '2F'))).toEqual({ ok: false, reason: 'card_not_in_hand' });
    expect(step(state, { type: 'bet', seat: VERA, kind: 'check' })).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, { type: 'cast', seat: VERA, card: card('9A') })).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, advance)).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, skip(7))).toEqual({ ok: false, reason: 'unknown_seat' });
  });

  it('gives a lone stayer the pot without revealing the cast', () => {
    const state = play(appendix(), [stay(BORIS, '3E', '12W'), skip(VERA), skip(GLEB), skip(ANA)]);
    expect(state.round1).toMatchObject({
      stayers: [BORIS],
      shown: [{ seat: BORIS, card: card('12W') }],
      casts: [],
      combinations: [],
      winners: [BORIS],
      payouts: [0, 12, 0, 0],
      rolledOver: false,
    });
    expect(state.players[BORIS]?.hand).toEqual(cards('10F 12W'));
    expect(state.players[BORIS]?.stack).toBe(STACK - 10 + 12);
  });

  it('rolls the pot into the Final when nobody stays', () => {
    const state = play(appendix(), [skip(BORIS), skip(VERA), skip(GLEB), skip(ANA)]);
    expect(state.round1).toMatchObject({ rolledOver: true, winners: [], payouts: [0, 0, 0, 0], pot: 12 });
    expect(state.round1Pot).toBe(0);
    expect(state.finalPot).toBe(40);
    expect(state.players.every((p) => p.hand.length === 3)).toBe(true);
  });

  it('skips the undecided on timeout in the window', () => {
    const { state, events } = ok(step(play(appendix(), [stay(VERA, '9A', '6W')]), timeout));
    expect(state.phase).toBe('round1End');
    expect(state.players.map((p) => p.decision?.kind)).toEqual(['skip', 'skip', 'stay', 'skip']);
    expect(state.round1?.winners).toEqual([VERA]);
    expect(events.map((e) => e.type)).toEqual(['round1Resolved']);
  });

  it('casts the lowest card for everyone still casting on timeout', () => {
    const state = play(appendix(), [...ROUND1, advance, ...castAll({ [ANA]: '13A' }), timeout]);
    expect(state.phase).toBe('bet');
    expect(state.players.map((p) => p.pendingCast)).toEqual([card('13A'), card('5F'), card('6W'), card('2F')]);
  });

  it('checks on timeout when possible, otherwise folds', () => {
    let state = play(appendix(), [...ROUND1, advance, ...FINAL_CASTS, timeout]);
    expect(state.players[BORIS]?.folded).toBe(false);
    expect(state.betting?.toAct).toEqual([VERA, GLEB, ANA]);
    state = play(state, [...bets([[VERA, 'bet']]), timeout]);
    expect(state.players[GLEB]?.folded).toBe(true);
    expect(state.players[GLEB]?.pendingCast).toBeNull();
  });

  it('ends the hand at once when everyone else folds', () => {
    const { state, events } = ok(
      step(
        play(appendix(), [
          ...ROUND1,
          advance,
          ...FINAL_CASTS,
          ...bets([
            [BORIS, 'bet'],
            [VERA, 'fold'],
            [GLEB, 'fold'],
          ]),
        ]),
        { type: 'bet', seat: ANA, kind: 'fold' },
      ),
    );
    expect(state.phase).toBe('done');
    expect(state.final).toMatchObject({ reason: 'fold', casts: [], combinations: [], winners: [BORIS], pot: 58 });
    expect(state.final?.payouts).toEqual([0, 58, 0, 0]);
    expect(state.players.map((p) => p.stack - STACK)).toEqual([-10, 18, 2, -10]);
    expect(events.map((e) => e.type)).toEqual(['betPlaced', 'handEnded']);
  });

  it('gives the odd unit to the first tied winner clockwise from the button', () => {
    const deck = stackedDeck(
      [1, 2, 0],
      [cards('5A 1F 2W'), cards('5W 1A 2F'), cards('5E 1W 2A')],
      cards('10A 11E'),
      [cards('3F'), cards('3W'), cards('3E')],
      cards('12F 13W 8E'),
    );
    const start = ok(startHand(DEFAULT_RULES, seats(3), 0, deck)).state;
    expect(start.round1Pot).toBe(9);
    const state = play(start, [stay(0, '5A', '1F'), stay(1, '5W', '1A'), stay(2, '5E', '1W')]);
    expect(state.round1?.winners).toEqual([0, 1, 2]);
    expect(state.round1?.payouts).toEqual([3, 3, 3]);

    const done = play(state, [
      advance,
      ...castAll({ 0: '3F', 1: '3W', 2: '2A' }),
      ...bets([
        [1, 'check'],
        [2, 'check'],
        [0, 'check'],
      ]),
      advance,
    ]);
    expect(done.final?.winners).toEqual([0, 1]);
    expect(done.final?.pot).toBe(21);
    expect(done.final?.payouts).toEqual([10, 11, 0]);
  });

  it('conserves chips and pays out exactly the pot', () => {
    const start = appendix();
    const total = chips(start);
    expect(total).toBe(4 * STACK);
    const state = play(start, [...ROUND1, advance, ...FINAL_CASTS, ...bets([[BORIS, 'bet']]), timeout, timeout, timeout]);
    expect(state.phase).toBe('done');
    expect(chips(state)).toBe(total);
    expect(state.round1?.payouts.reduce((a, b) => a + b, 0)).toBe(state.round1?.pot);
    expect(state.final?.payouts.reduce((a, b) => a + b, 0)).toBe(state.final?.pot);
  });

  it('never mutates its input', () => {
    const state = play(appendix(), [stay(BORIS, '3E', '12W')]);
    const frozen = JSON.stringify(state);
    ok(step(state, stay(VERA, '9A', '6W')));
    ok(step(state, skip(GLEB)));
    ok(step(state, timeout));
    expect(JSON.stringify(state)).toBe(frozen);
    const later = play(state, [timeout, advance, ...FINAL_CASTS]);
    const laterFrozen = JSON.stringify(later);
    ok(step(later, { type: 'bet', seat: BORIS, kind: 'bet' }));
    ok(step(later, timeout));
    expect(JSON.stringify(later)).toBe(laterFrozen);
  });
});

describe('helpers', () => {
  it('finds the lowest card with ties broken by element order', () => {
    expect(lowestCard(cards('7F 2A 2W 9E'))).toEqual(card('2W'));
    expect(lowestCard([])).toBeNull();
  });

  it('orders active seats clockwise from the start seat', () => {
    const state = play(appendix(), [...ROUND1, advance, ...FINAL_CASTS, ...bets([[BORIS, 'bet'], [VERA, 'fold']])]);
    expect(activeOrder(state, GLEB)).toEqual([GLEB, ANA, BORIS]);
    expect(activeOrder(state, 0)).toEqual([ANA, BORIS, GLEB]);
  });
});

describe('viewFor', () => {
  it('hides other hands and the whole window while it is open', () => {
    const state = play(appendix(), [stay(BORIS, '3E', '12W')]);
    const view = viewFor(state, ANA);
    expect(view.you?.hand).toEqual(cards('7F 12E 13A'));
    expect(view.you?.canDecide).toBe(true);
    expect(view.you?.options.map((o) => o.combination.category)).toEqual(['high', 'straight', 'high']);
    expect(view.players[BORIS]).toMatchObject({ decided: true, stayed: null, shown: null, handCount: 3 });
    expect(view.players[VERA]).toMatchObject({ decided: false, stayed: null, shown: null, handCount: 3 });
    const json = JSON.stringify(view);
    for (const other of [BORIS, VERA, GLEB]) {
      for (const held of [...(state.players[other]?.hand ?? []), card('3E'), card('12W')]) {
        expect(json).not.toContain(JSON.stringify(held));
      }
    }
  });

  it('shows who stayed and the shown cards once the window closes', () => {
    const state = play(appendix(), ROUND1);
    const view = viewFor(state, GLEB);
    expect(view.players[BORIS]).toMatchObject({ stayed: true, shown: card('12W') });
    expect(view.players[VERA]).toMatchObject({ stayed: true, shown: card('6W') });
    expect(view.players[ANA]).toMatchObject({ stayed: false, shown: null });
    expect(view.round1?.casts.map((c) => c.card)).toEqual(cards('3E 9A'));
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(card('10F')));
  });

  it('hides pending casts and lists legal bets for the actor', () => {
    const state = play(appendix(), [...ROUND1, advance, ...FINAL_CASTS]);
    const ana = viewFor(state, ANA);
    expect(ana.players[BORIS]?.castLocked).toBe(true);
    expect(ana.you?.pendingCast).toEqual(card('7F'));
    expect(ana.you?.options.map((o) => o.card)).toEqual(cards('12E 13A 1E 7F'));
    expect(ana.you?.legalBets).toEqual([]);
    expect(ana.betting).toEqual({ level: 0, bets: 0, cap: 3, unit: 30, actor: BORIS });
    expect(viewFor(state, BORIS).you?.legalBets).toEqual(['check', 'bet']);
    expect(JSON.stringify(ana)).not.toContain(JSON.stringify(card('10F')));
  });

  it('gives a spectator no private part', () => {
    expect(viewFor(appendix(), null).you).toBeNull();
    expect(viewFor(appendix(), 9).you).toBeNull();
  });
});
