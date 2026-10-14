import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './config.ts';
import { activeOrder, legalBets, startHand, step } from './hand.ts';
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

const stay = (seat: number, show: string): HandAction => ({
  type: 'decide',
  seat,
  decision: { kind: 'stay', show: card(show) },
});
const skip = (seat: number): HandAction => ({ type: 'decide', seat, decision: { kind: 'skip' } });
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
    [cards('1W'), cards('5F'), cards('7W'), cards('8W')],
    cards('3F 6F 9E'),
  );
  return ok(startHand(DEFAULT_RULES, seats(4), ANA, deck)).state;
}

const ROUND1 = [stay(BORIS, '3E'), stay(VERA, '9A'), skip(GLEB), skip(ANA)];
const FINAL_BETS = bets([
  [BORIS, 'bet'],
  [VERA, 'call'],
  [GLEB, 'call'],
  [ANA, 'raise'],
  [BORIS, 'raise'],
  [VERA, 'fold'],
  [GLEB, 'fold'],
  [ANA, 'call'],
]);

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
        { seat: BORIS, card: card('3E') },
        { seat: VERA, card: card('9A') },
      ],
      winners: [VERA],
      payouts: [0, 0, 12, 0],
      rolledOver: false,
    });
    expect(state.round1?.combinations).toEqual([
      { seat: BORIS, combination: { category: 'high', cards: cards('3E 10A 11E'), key: [0, 11, 10, 3] } },
      { seat: VERA, combination: { category: 'straight', cards: cards('9A 10A 11E'), key: [3, 11] } },
    ]);
    expect(state.round1Pot).toBe(0);
    expect(state.players.every((p) => p.hand.length === 3)).toBe(true);
    expect(state.players.map((p) => p.shown)).toEqual([null, card('3E'), card('9A'), null]);

    const { state: final, events: finalEvents } = ok(step(state, advance));
    state = final;
    expect(finalEvents).toEqual([{ type: 'finalStarted', table: cards('3F 6F 9E') }]);
    expect(state.phase).toBe('bet');
    expect(state.table).toEqual(cards('3F 6F 9E'));
    expect(state.players.map((p) => p.hand)).toEqual([
      cards('7F 12E 13A 1W'),
      cards('3E 10F 12W 5F'),
      cards('6W 13E 9A 7W'),
      cards('2F 11A 5W 8W'),
    ]);
    expect(state.betting).toEqual({ level: 0, bets: 0, toAct: [BORIS, VERA, GLEB, ANA] });

    state = play(state, FINAL_BETS);
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
    expect(done.final?.hands).toEqual([
      { seat: ANA, cards: cards('7F 12E 13A 1W') },
      { seat: BORIS, cards: cards('3E 10F 12W 5F') },
    ]);
    expect(done.final?.combinations).toEqual([
      { seat: ANA, combination: { category: 'flush', cards: cards('7F 6F 3F'), key: [2, 7, 6, 3] } },
      { seat: BORIS, combination: { category: 'flush', cards: cards('10F 6F 5F'), key: [2, 10, 6, 5] } },
    ]);
    expect(done.players.map((p) => p.stack - STACK)).toEqual([-100, 168, -28, -40]);
    expect(done.finalPot).toBe(0);
    expect(events).toEqual([{ type: 'handEnded', result: done.final }]);
  });

  it('caps the betting at three bets', () => {
    const state = play(appendix(), [
      ...ROUND1,
      advance,
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
  it('rejects a second decision, a card not in the hand and a bet during the window', () => {
    const state = play(appendix(), [stay(BORIS, '12W')]);
    expect(step(state, skip(BORIS))).toEqual({ ok: false, reason: 'already_decided' });
    expect(step(state, stay(BORIS, '10F'))).toEqual({ ok: false, reason: 'already_decided' });
    expect(step(state, stay(VERA, '2F'))).toEqual({ ok: false, reason: 'card_not_in_hand' });
    expect(step(state, stay(VERA, '9W'))).toEqual({ ok: false, reason: 'card_not_in_hand' });
    expect(step(state, { type: 'bet', seat: VERA, kind: 'check' })).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, advance)).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, skip(7))).toEqual({ ok: false, reason: 'unknown_seat' });
  });

  it('gives a lone stayer the pot without a contest and keeps all three cards', () => {
    const state = play(appendix(), [stay(BORIS, '12W'), skip(VERA), skip(GLEB), skip(ANA)]);
    expect(state.round1).toEqual({
      table: cards('10A 11E'),
      pot: 12,
      stayers: [BORIS],
      shown: [{ seat: BORIS, card: card('12W') }],
      combinations: [],
      winners: [BORIS],
      payouts: [0, 12, 0, 0],
      rolledOver: false,
    });
    expect(state.players[BORIS]?.hand).toEqual(cards('3E 10F 12W'));
    expect(state.players[BORIS]?.shown).toEqual(card('12W'));
    expect(state.players[BORIS]?.stack).toBe(STACK - 10 + 12);
  });

  it('compares two stayers by their shown card with both table cards', () => {
    const state = play(appendix(), [stay(BORIS, '10F'), stay(VERA, '13E'), skip(GLEB), skip(ANA)]);
    expect(state.round1?.combinations).toEqual([
      { seat: BORIS, combination: { category: 'pair', cards: cards('10F 10A 11E'), key: [1, 10, 11] } },
      { seat: VERA, combination: { category: 'high', cards: cards('13E 10A 11E'), key: [0, 13, 11, 10] } },
    ]);
    expect(state.round1?.winners).toEqual([BORIS]);
    expect(state.round1?.payouts).toEqual([0, 12, 0, 0]);
    expect(state.players.map((p) => p.hand.length)).toEqual([3, 3, 3, 3]);
  });

  it('rolls the pot into the Final when nobody stays', () => {
    const state = play(appendix(), [skip(BORIS), skip(VERA), skip(GLEB), skip(ANA)]);
    expect(state.round1).toMatchObject({ rolledOver: true, winners: [], payouts: [0, 0, 0, 0], pot: 12 });
    expect(state.round1Pot).toBe(0);
    expect(state.finalPot).toBe(40);
    expect(state.players.every((p) => p.hand.length === 3)).toBe(true);
  });

  it('skips the undecided on timeout in the window', () => {
    const { state, events } = ok(step(play(appendix(), [stay(VERA, '9A')]), timeout));
    expect(state.phase).toBe('round1End');
    expect(state.players.map((p) => p.decision?.kind)).toEqual(['skip', 'skip', 'stay', 'skip']);
    expect(state.round1?.winners).toEqual([VERA]);
    expect(events.map((e) => e.type)).toEqual(['round1Resolved']);
  });

  it('opens the Final straight into betting: 3 table cards, 4 cards in every hand', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    expect(state.phase).toBe('bet');
    expect(state.table).toHaveLength(3);
    expect(state.players.map((p) => p.hand.length)).toEqual([4, 4, 4, 4]);
    expect(state.betting?.toAct).toEqual([BORIS, VERA, GLEB, ANA]);
    expect(step(state, skip(BORIS))).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, stay(BORIS, '10F'))).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, advance)).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(play(appendix(), ROUND1), timeout)).toEqual({ ok: false, reason: 'wrong_phase' });
  });

  it('checks on timeout when possible, otherwise folds', () => {
    let state = play(appendix(), [...ROUND1, advance, timeout]);
    expect(state.players[BORIS]?.folded).toBe(false);
    expect(state.betting?.toAct).toEqual([VERA, GLEB, ANA]);
    state = play(state, [...bets([[VERA, 'bet']]), timeout]);
    expect(state.players[GLEB]?.folded).toBe(true);
    expect(state.players[GLEB]?.hand).toEqual(cards('2F 11A 5W 8W'));
  });

  it('ends the hand at once when everyone else folds, revealing nothing', () => {
    const { state, events } = ok(
      step(
        play(appendix(), [
          ...ROUND1,
          advance,
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
    expect(state.final).toEqual({
      reason: 'fold',
      table: cards('3F 6F 9E'),
      pot: 58,
      hands: [],
      combinations: [],
      winners: [BORIS],
      payouts: [0, 58, 0, 0],
    });
    expect(state.players.map((p) => p.stack - STACK)).toEqual([-10, 18, 2, -10]);
    expect(events.map((e) => e.type)).toEqual(['betPlaced', 'handEnded']);
  });

  it('shows every remaining hand at the showdown and lets the board play', () => {
    const deck = stackedDeck(
      [1, 2, 0],
      [cards('1W 2A 9E'), cards('4W 8A 13E'), cards('1A 3W 10E')],
      cards('11A 12W'),
      [cards('2E'), cards('6E'), cards('7A')],
      cards('5F 6F 7F'),
    );
    const start = ok(startHand(DEFAULT_RULES, seats(3), 0, deck)).state;
    const state = play(start, [
      skip(0),
      skip(1),
      skip(2),
      advance,
      ...bets([
        [1, 'check'],
        [2, 'check'],
        [0, 'check'],
      ]),
      advance,
    ]);
    expect(state.final?.hands).toEqual([
      { seat: 0, cards: cards('1W 2A 9E 2E') },
      { seat: 1, cards: cards('4W 8A 13E 6E') },
      { seat: 2, cards: cards('1A 3W 10E 7A') },
    ]);
    for (const entry of state.final?.combinations ?? []) {
      expect(entry.combination).toEqual({ category: 'straightFlush', cards: cards('7F 6F 5F'), key: [5, 7] });
    }
    expect(state.final?.winners).toEqual([0, 1, 2]);
    expect(state.final?.payouts).toEqual([10, 10, 10]);
  });

  it('gives the odd unit to the first tied winner clockwise from the button', () => {
    const deck = stackedDeck(
      [1, 2, 0],
      [cards('5A 1F 2W'), cards('5W 1A 2F'), cards('5E 1W 2A')],
      cards('10A 11E'),
      [cards('3F'), cards('3W'), cards('4E')],
      cards('12F 13W 8E'),
    );
    const start = ok(startHand(DEFAULT_RULES, seats(3), 0, deck)).state;
    expect(start.round1Pot).toBe(9);
    const state = play(start, [stay(0, '1F'), stay(1, '1A'), stay(2, '1W')]);
    expect(state.round1?.combinations.map((c) => c.combination.key)).toEqual([
      [0, 11, 10, 1],
      [0, 11, 10, 1],
      [0, 11, 10, 1],
    ]);
    expect(state.round1?.winners).toEqual([0, 1, 2]);
    expect(state.round1?.payouts).toEqual([3, 3, 3]);

    const done = play(state, [
      advance,
      ...bets([
        [1, 'check'],
        [2, 'check'],
        [0, 'check'],
      ]),
      advance,
    ]);
    expect(done.final?.combinations.map((c) => c.combination.category)).toEqual(['straight', 'straight', 'flush']);
    expect(done.final?.winners).toEqual([0, 1]);
    expect(done.final?.pot).toBe(21);
    expect(done.final?.payouts).toEqual([10, 11, 0]);
  });

  it('conserves chips and pays out exactly the pot', () => {
    const start = appendix();
    const total = chips(start);
    expect(total).toBe(4 * STACK);
    const state = play(start, [...ROUND1, advance, ...bets([[BORIS, 'bet']]), timeout, timeout, timeout]);
    expect(state.phase).toBe('done');
    expect(chips(state)).toBe(total);
    expect(state.round1?.payouts.reduce((a, b) => a + b, 0)).toBe(state.round1?.pot);
    expect(state.final?.payouts.reduce((a, b) => a + b, 0)).toBe(state.final?.pot);
  });

  it('never mutates its input', () => {
    const state = play(appendix(), [stay(BORIS, '12W')]);
    const frozen = JSON.stringify(state);
    ok(step(state, stay(VERA, '9A')));
    ok(step(state, skip(GLEB)));
    ok(step(state, timeout));
    expect(JSON.stringify(state)).toBe(frozen);
    const later = play(state, [timeout, advance]);
    const laterFrozen = JSON.stringify(later);
    ok(step(later, { type: 'bet', seat: BORIS, kind: 'bet' }));
    ok(step(later, timeout));
    expect(JSON.stringify(later)).toBe(laterFrozen);
  });
});

describe('helpers', () => {
  it('orders active seats clockwise from the start seat', () => {
    const state = play(appendix(), [...ROUND1, advance, ...bets([[BORIS, 'bet'], [VERA, 'fold']])]);
    expect(activeOrder(state, GLEB)).toEqual([GLEB, ANA, BORIS]);
    expect(activeOrder(state, 0)).toEqual([ANA, BORIS, GLEB]);
  });
});

describe('viewFor', () => {
  it('hides other hands and the whole window while it is open', () => {
    const state = play(appendix(), [stay(BORIS, '12W')]);
    const view = viewFor(state, ANA);
    expect(view.you?.hand).toEqual(cards('7F 12E 13A'));
    expect(view.you?.canDecide).toBe(true);
    expect(view.you?.options.map((o) => o.combination.category)).toEqual(['high', 'straight', 'high']);
    expect(view.you?.best).toBeNull();
    expect(view.players[BORIS]).toMatchObject({ decided: true, stayed: null, shown: null, handCount: 3 });
    expect(view.players[VERA]).toMatchObject({ decided: false, stayed: null, shown: null, handCount: 3 });
    const json = JSON.stringify(view);
    for (const other of [BORIS, VERA, GLEB]) {
      for (const held of state.players[other]?.hand ?? []) {
        expect(json).not.toContain(JSON.stringify(held));
      }
    }
  });

  it('shows who stayed and the shown cards once the window closes', () => {
    const state = play(appendix(), ROUND1);
    const view = viewFor(state, GLEB);
    expect(view.players[BORIS]).toMatchObject({ stayed: true, shown: card('3E'), handCount: 3 });
    expect(view.players[VERA]).toMatchObject({ stayed: true, shown: card('9A'), handCount: 3 });
    expect(view.players[ANA]).toMatchObject({ stayed: false, shown: null, handCount: 3 });
    expect(view.round1?.shown.map((c) => c.card)).toEqual(cards('3E 9A'));
    expect(view.round1?.combinations.map((c) => c.combination.category)).toEqual(['high', 'straight']);
    expect(view.you?.options).toEqual([]);
    expect(view.you?.best).toBeNull();
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(card('10F')));
  });

  it('gives each seat its own best in the Final and lists legal bets for the actor', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    const ana = viewFor(state, ANA);
    expect(ana.you?.hand).toEqual(cards('7F 12E 13A 1W'));
    expect(ana.you?.options).toEqual([]);
    expect(ana.you?.best).toEqual({ category: 'flush', cards: cards('7F 6F 3F'), key: [2, 7, 6, 3] });
    expect(ana.you?.legalBets).toEqual([]);
    expect(ana.betting).toEqual({ level: 0, bets: 0, cap: 3, unit: 30, actor: BORIS });
    expect(viewFor(state, BORIS).you?.legalBets).toEqual(['check', 'bet']);
    expect(viewFor(state, BORIS).you?.best).toMatchObject({ category: 'flush', key: [2, 10, 6, 5] });
    expect(JSON.stringify(ana)).not.toContain(JSON.stringify(card('10F')));
  });

  it('keeps a folded player\'s best and reveals other hands only through final.hands', () => {
    const state = play(appendix(), [...ROUND1, advance, ...FINAL_BETS]);
    const vera = viewFor(state, VERA);
    expect(vera.players[VERA]?.folded).toBe(true);
    expect(vera.you?.best).toMatchObject({ category: 'pair', cards: cards('13E 9A 9E'), key: [1, 9, 13] });
    expect(JSON.stringify(vera)).not.toContain(JSON.stringify(card('10F')));

    const done = play(state, [advance]);
    const view = viewFor(done, VERA);
    expect(view.final?.hands.map((h) => h.seat)).toEqual([ANA, BORIS]);
    expect(view.final?.hands[1]?.cards).toEqual(cards('3E 10F 12W 5F'));
    expect(view.you?.hand).toEqual(cards('6W 13E 9A 7W'));
    expect(view.players.map((p) => p.handCount)).toEqual([4, 4, 4, 4]);
    expect(JSON.stringify({ ...view, final: null })).not.toContain(JSON.stringify(card('10F')));
  });

  it('gives a spectator no private part', () => {
    expect(viewFor(appendix(), null).you).toBeNull();
    expect(viewFor(appendix(), 9).you).toBeNull();
  });
});
