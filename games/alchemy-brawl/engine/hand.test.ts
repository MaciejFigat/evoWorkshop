import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './config.ts';
import { activeOrder, betOptions, startHand, step } from './hand.ts';
import { card, cards, stackedDeck } from './testDeck.ts';
import type { BetAction, HandAction, HandEvent, HandState, StepResult } from './types.ts';
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
const fold = (seat: number): HandAction => ({ type: 'bet', seat, action: { kind: 'fold' } });
const check = (seat: number): HandAction => ({ type: 'bet', seat, action: { kind: 'check' } });
const call = (seat: number): HandAction => ({ type: 'bet', seat, action: { kind: 'call' } });
const raise = (seat: number, to: number): HandAction => ({ type: 'bet', seat, action: { kind: 'raise', to } });
const bet = (seat: number, action: BetAction): HandAction => ({ type: 'bet', seat, action });
const advance: HandAction = { type: 'advance' };
const timeout: HandAction = { type: 'timeout' };

// Appendix of the spec. Seats: Ana 0 (button), Boris 1, Vera 2, Gleb 3.
const ANA = 0;
const BORIS = 1;
const VERA = 2;
const GLEB = 3;

function appendixDeck() {
  return stackedDeck(
    [BORIS, VERA, GLEB, ANA],
    [cards('7F 12E 13A'), cards('3E 10F 12W'), cards('6W 13E 9A'), cards('2F 11A 5W')],
    cards('10A 11E'),
    [cards('9F'), cards('12F'), cards('7W'), cards('8W')],
    cards('10W'),
  );
}

function appendix(stacks: number[] = []): HandState {
  const stakes = seats(4).map((seat, i) => ({ ...seat, stack: stacks[i] ?? STACK }));
  return ok(startHand(DEFAULT_RULES, stakes, ANA, appendixDeck())).state;
}

const ROUND1 = [stay(BORIS, '3E'), stay(VERA, '9A'), skip(GLEB), skip(ANA)];
const FINAL_BETS = [
  raise(BORIS, 30),
  call(VERA),
  call(GLEB),
  raise(ANA, 60),
  raise(BORIS, 90),
  fold(VERA),
  fold(GLEB),
  call(ANA),
];

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
    expect(state.players.every((p) => !p.allIn)).toBe(true);

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
    expect(finalEvents).toEqual([{ type: 'finalStarted', table: cards('10A 11E 10W') }]);
    expect(state.phase).toBe('bet');
    expect(state.table).toEqual(cards('10A 11E 10W'));
    expect(state.players.map((p) => p.hand)).toEqual([
      cards('7F 12E 13A 9F'),
      cards('3E 10F 12W 12F'),
      cards('6W 13E 9A 7W'),
      cards('2F 11A 5W 8W'),
    ]);
    expect(state.betting).toEqual({ level: 0, minRaise: 30, toAct: [BORIS, VERA, GLEB, ANA] });

    state = play(state, FINAL_BETS);
    expect(state.phase).toBe('reveal');
    expect(state.finalPot).toBe(268);
    expect(state.players.map((p) => p.roundCommitted)).toEqual([90, 90, 30, 30]);

    const { state: done, events } = ok(step(state, advance));
    expect(done.phase).toBe('done');
    expect(done.final).toMatchObject({
      reason: 'showdown',
      pot: 268,
      pots: [{ amount: 268, eligible: [ANA, BORIS], winners: [BORIS] }],
      winners: [BORIS],
      payouts: [0, 268, 0, 0],
    });
    expect(done.final?.hands).toEqual([
      { seat: ANA, cards: cards('7F 12E 13A 9F') },
      { seat: BORIS, cards: cards('3E 10F 12W 12F') },
    ]);
    expect(done.final?.combinations).toEqual([
      { seat: ANA, combination: { category: 'straight', cards: cards('13A 12E 11E 10A 9F'), key: [4, 13] } },
      { seat: BORIS, combination: { category: 'fullHouse', cards: cards('10F 10A 10W 12W 12F'), key: [6, 10, 12] } },
    ]);
    expect(done.players.map((p) => p.stack - STACK)).toEqual([-100, 168, -28, -40]);
    expect(done.finalPot).toBe(0);
    expect(events).toEqual([{ type: 'handEnded', result: done.final }]);
  });

  it('records every bet with the chips it cost', () => {
    let state = play(appendix(), [...ROUND1, advance]);
    const seen: HandEvent[] = [];
    for (const action of FINAL_BETS) {
      const result = ok(step(state, action));
      seen.push(...result.events);
      state = result.state;
    }
    expect(seen).toEqual([
      { type: 'betPlaced', seat: BORIS, kind: 'raise', amount: 30, allIn: false },
      { type: 'betPlaced', seat: VERA, kind: 'call', amount: 30, allIn: false },
      { type: 'betPlaced', seat: GLEB, kind: 'call', amount: 30, allIn: false },
      { type: 'betPlaced', seat: ANA, kind: 'raise', amount: 60, allIn: false },
      { type: 'betPlaced', seat: BORIS, kind: 'raise', amount: 60, allIn: false },
      { type: 'betPlaced', seat: VERA, kind: 'fold', amount: 0, allIn: false },
      { type: 'betPlaced', seat: GLEB, kind: 'fold', amount: 0, allIn: false },
      { type: 'betPlaced', seat: ANA, kind: 'call', amount: 30, allIn: false },
    ]);
  });
});

describe('startHand', () => {
  it('rejects too few players, a short deck and a short stack', () => {
    const deck = stackedDeck([1, 2, 0], [], [], [], []);
    expect(startHand(DEFAULT_RULES, seats(2), 0, deck)).toEqual({ ok: false, reason: 'not_enough_players' });
    expect(startHand(DEFAULT_RULES, seats(3), 0, deck.slice(0, 14))).toEqual({ ok: false, reason: 'deck_too_small' });
    expect(startHand(DEFAULT_RULES, seats(3), 0, deck.slice(0, 15)).ok).toBe(true);
    expect(startHand(DEFAULT_RULES, [...seats(2), { id: 'poor', stack: 9 }], 0, deck)).toEqual({
      ok: false,
      reason: 'insufficient_stack',
    });
  });

  it('marks a seat whose ante took its last chip as all-in', () => {
    const state = play(appendix([STACK, 10, STACK, STACK]), [...ROUND1, advance]);
    expect(state.players[BORIS]).toMatchObject({ stack: 0, allIn: true, committed: 10 });
    expect(state.betting?.toAct).toEqual([VERA, GLEB, ANA]);
  });
});

describe('step', () => {
  it('rejects a second decision, a card not in the hand and a bet during the window', () => {
    const state = play(appendix(), [stay(BORIS, '12W')]);
    expect(step(state, skip(BORIS))).toEqual({ ok: false, reason: 'already_decided' });
    expect(step(state, stay(BORIS, '10F'))).toEqual({ ok: false, reason: 'already_decided' });
    expect(step(state, stay(VERA, '2F'))).toEqual({ ok: false, reason: 'card_not_in_hand' });
    expect(step(state, stay(VERA, '9W'))).toEqual({ ok: false, reason: 'card_not_in_hand' });
    expect(step(state, check(VERA))).toEqual({ ok: false, reason: 'wrong_phase' });
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

  it('opens the Final straight into betting: the Round 1 pair plus one card, 4 cards in every hand', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    expect(state.phase).toBe('bet');
    expect(state.table).toEqual(cards('10A 11E 10W'));
    expect(state.players.map((p) => p.hand.length)).toEqual([4, 4, 4, 4]);
    expect(state.betting?.toAct).toEqual([BORIS, VERA, GLEB, ANA]);
    expect(step(state, skip(BORIS))).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, stay(BORIS, '10F'))).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(state, advance)).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(step(play(appendix(), ROUND1), timeout)).toEqual({ ok: false, reason: 'wrong_phase' });
  });

  it('rejects a bet out of turn, a check facing a bet and a call with nothing to call', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    expect(step(state, check(VERA))).toEqual({ ok: false, reason: 'not_your_turn' });
    expect(step(state, call(BORIS))).toEqual({ ok: false, reason: 'illegal_bet' });
    expect(step(state, bet(9, { kind: 'check' }))).toEqual({ ok: false, reason: 'unknown_seat' });
    const opened = play(state, [raise(BORIS, 30)]);
    expect(step(opened, check(VERA))).toEqual({ ok: false, reason: 'illegal_bet' });
  });

  it('rejects a raise below the minimum, at or below the level, or beyond the stack', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    expect(step(state, raise(BORIS, 0))).toEqual({ ok: false, reason: 'bad_raise_size' });
    expect(step(state, raise(BORIS, 20))).toEqual({ ok: false, reason: 'bad_raise_size' });
    expect(step(state, raise(BORIS, 991))).toEqual({ ok: false, reason: 'insufficient_stack' });
    expect(step(state, raise(BORIS, 30)).ok).toBe(true);
    expect(step(state, raise(BORIS, 990)).ok).toBe(true);

    const opened = play(state, [raise(BORIS, 30)]);
    expect(step(opened, raise(VERA, 30))).toEqual({ ok: false, reason: 'bad_raise_size' });
    expect(step(opened, raise(VERA, 50))).toEqual({ ok: false, reason: 'bad_raise_size' });
    expect(step(opened, raise(VERA, 60)).ok).toBe(true);

    // After a raise of 70 the next raise must add at least 70.
    const reraised = play(opened, [raise(VERA, 100)]);
    expect(reraised.betting).toEqual({ level: 100, minRaise: 70, toAct: [GLEB, ANA, BORIS] });
    expect(step(reraised, raise(GLEB, 160))).toEqual({ ok: false, reason: 'bad_raise_size' });
    expect(step(reraised, raise(GLEB, 170)).ok).toBe(true);
  });

  it('allows an all-in raise below the minimum, which raises the level without reopening the action', () => {
    // Vera sits down with 48: 38 after the ante, 50 after her Round 1 win.
    const state = play(appendix([STACK, STACK, 48, STACK]), [...ROUND1, advance, raise(BORIS, 30)]);
    expect(betOptions(state, VERA)).toEqual({ canCheck: false, call: 30, callAllIn: false, raise: { min: 50, max: 50 } });
    expect(step(state, raise(VERA, 40))).toEqual({ ok: false, reason: 'bad_raise_size' });
    const { state: shoved, events } = ok(step(state, raise(VERA, 50)));
    expect(events).toEqual([{ type: 'betPlaced', seat: VERA, kind: 'raise', amount: 50, allIn: true }]);
    expect(shoved.players[VERA]).toMatchObject({ stack: 0, allIn: true, roundCommitted: 50 });
    expect(shoved.betting).toEqual({ level: 50, minRaise: 30, toAct: [GLEB, ANA] });

    const done = play(shoved, [call(GLEB), call(ANA), advance]);
    expect(done.players[BORIS]?.roundCommitted).toBe(30);
    expect(done.final?.pots).toEqual([
      { amount: 148, eligible: [ANA, BORIS, VERA, GLEB], winners: [BORIS] },
      { amount: 60, eligible: [ANA, VERA, GLEB], winners: [ANA] },
    ]);
    expect(done.final?.winners).toEqual([ANA, BORIS]);
    expect(done.final?.payouts).toEqual([60, 148, 0, 0]);
  });

  it('lets a short stack call for less and go all-in', () => {
    // Vera sits down with 18: 8 after the ante, 20 after her Round 1 win.
    const state = play(appendix([STACK, STACK, 18, STACK]), [...ROUND1, advance, raise(BORIS, 30)]);
    expect(betOptions(state, VERA)).toEqual({ canCheck: false, call: 20, callAllIn: true, raise: null });
    expect(step(state, raise(VERA, 31))).toEqual({ ok: false, reason: 'insufficient_stack' });
    const { state: called, events } = ok(step(state, call(VERA)));
    expect(events).toEqual([{ type: 'betPlaced', seat: VERA, kind: 'call', amount: 20, allIn: true }]);
    expect(called.players[VERA]).toMatchObject({ stack: 0, allIn: true, roundCommitted: 20 });
    expect(called.betting).toEqual({ level: 30, minRaise: 30, toAct: [GLEB, ANA] });
  });

  it('checks on timeout when possible, otherwise folds', () => {
    let state = play(appendix(), [...ROUND1, advance, timeout]);
    expect(state.players[BORIS]?.folded).toBe(false);
    expect(state.betting?.toAct).toEqual([VERA, GLEB, ANA]);
    state = play(state, [raise(VERA, 30), timeout]);
    expect(state.players[GLEB]?.folded).toBe(true);
    expect(state.players[GLEB]?.hand).toEqual(cards('2F 11A 5W 8W'));
    expect(state.betting?.toAct).toEqual([ANA, BORIS]);
  });

  it('ends the hand at once when everyone else folds, revealing nothing', () => {
    const { state, events } = ok(
      step(play(appendix(), [...ROUND1, advance, raise(BORIS, 30), fold(VERA), fold(GLEB)]), fold(ANA)),
    );
    expect(state.phase).toBe('done');
    expect(state.final).toEqual({
      reason: 'fold',
      table: cards('10A 11E 10W'),
      pot: 58,
      pots: [{ amount: 58, eligible: [BORIS], winners: [BORIS] }],
      hands: [],
      combinations: [],
      winners: [BORIS],
      payouts: [0, 58, 0, 0],
    });
    expect(state.players.map((p) => p.stack - STACK)).toEqual([-10, 18, 2, -10]);
    expect(events.map((e) => e.type)).toEqual(['betPlaced', 'handEnded']);
  });

  it('shows every remaining hand at the showdown and splits a shared best five', () => {
    // Every seat holds an 8 and a 9 over a 5-6-7 table: three equal 9-high straights, each with its own cards.
    const deck = stackedDeck(
      [1, 2, 0],
      [cards('8A 9A 1W'), cards('8W 9E 13E'), cards('8E 9W 1A')],
      cards('5F 6W'),
      [cards('2E'), cards('3A'), cards('12W')],
      cards('7E'),
    );
    const start = ok(startHand(DEFAULT_RULES, seats(3), 0, deck)).state;
    const state = play(start, [skip(0), skip(1), skip(2), advance, check(1), check(2), check(0), advance]);
    expect(state.final?.hands).toEqual([
      { seat: 0, cards: cards('8A 9A 1W 2E') },
      { seat: 1, cards: cards('8W 9E 13E 3A') },
      { seat: 2, cards: cards('8E 9W 1A 12W') },
    ]);
    expect(state.final?.combinations).toEqual([
      { seat: 0, combination: { category: 'straight', cards: cards('9A 8A 7E 6W 5F'), key: [4, 9] } },
      { seat: 1, combination: { category: 'straight', cards: cards('9E 8W 7E 6W 5F'), key: [4, 9] } },
      { seat: 2, combination: { category: 'straight', cards: cards('9W 8E 7E 6W 5F'), key: [4, 9] } },
    ]);
    expect(state.final?.pots).toEqual([{ amount: 30, eligible: [0, 1, 2], winners: [0, 1, 2] }]);
    expect(state.final?.winners).toEqual([0, 1, 2]);
    expect(state.final?.payouts).toEqual([10, 10, 10]);
  });

  it('gives the odd unit to the first tied winner clockwise from the button', () => {
    const deck = stackedDeck(
      [1, 2, 0],
      [cards('5A 1F 2W'), cards('5W 1A 2F'), cards('5E 1W 2A')],
      cards('10A 11E'),
      [cards('3F'), cards('3W'), cards('4E')],
      cards('4F'),
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

    const done = play(state, [advance, check(1), check(2), check(0), advance]);
    // Seats 0 and 1 hold 1-2-3 over 4-5 on the table: the lowest straight; seat 2 holds a pair of 4s.
    expect(done.final?.combinations.map((c) => c.combination.key)).toEqual([[4, 5], [4, 5], [1, 4, 11, 10, 5]]);
    expect(done.final?.winners).toEqual([0, 1]);
    expect(done.final?.pot).toBe(21);
    expect(done.final?.payouts).toEqual([10, 11, 0]);
  });

  describe('side pots at stacks 50 / 200 / 1000', () => {
    // Button 0. Seat 1 (50) holds a full house, seat 2 (200) a 13-high straight, seat 0 (1000) a pair of 4s.
    function start(): HandState {
      const deck = stackedDeck(
        [1, 2, 0],
        [cards('3F 4W 4E'), cards('10F 10W 11A'), cards('12W 13E 2F')],
        cards('10A 11E'),
        [cards('6E'), cards('7E'), cards('8E')],
        cards('9A'),
      );
      const stakes = [
        { id: 'big', stack: 1000 },
        { id: 'short', stack: 50 },
        { id: 'middle', stack: 200 },
      ];
      return play(ok(startHand(DEFAULT_RULES, stakes, 0, deck)).state, [skip(0), skip(1), skip(2), advance]);
    }

    it('pays the shortest stack only the main pot and the middle stack the side pot', () => {
      let state = play(start(), [raise(1, 40)]);
      expect(state.players[1]).toMatchObject({ stack: 0, allIn: true });
      expect(state.betting).toEqual({ level: 40, minRaise: 40, toAct: [2, 0] });
      state = play(state, [raise(2, 190)]);
      expect(state.betting).toEqual({ level: 190, minRaise: 150, toAct: [0] });
      expect(betOptions(state, 0)).toEqual({ canCheck: false, call: 190, callAllIn: false, raise: { min: 340, max: 990 } });
      state = play(state, [call(0)]);
      expect(state.phase).toBe('reveal');
      expect(state.finalPot).toBe(450);

      const done = play(state, [advance]);
      expect(done.final?.combinations).toEqual([
        { seat: 0, combination: { category: 'pair', cards: cards('4W 4E 11E 10A 9A'), key: [1, 4, 11, 10, 9] } },
        { seat: 1, combination: { category: 'fullHouse', cards: cards('10F 10W 10A 11A 11E'), key: [6, 10, 11] } },
        { seat: 2, combination: { category: 'straight', cards: cards('13E 12W 11E 10A 9A'), key: [4, 13] } },
      ]);
      expect(done.final?.pots).toEqual([
        { amount: 150, eligible: [0, 1, 2], winners: [1] },
        { amount: 300, eligible: [0, 2], winners: [2] },
      ]);
      expect(done.final).toMatchObject({ pot: 450, winners: [1, 2], payouts: [0, 150, 300] });
      expect(done.players.map((p) => p.stack)).toEqual([800, 150, 300]);
      expect(chips(done)).toBe(1250);
    });

    it('ends the betting when everyone else is all-in and returns an uncontested side pot', () => {
      const state = play(start(), [raise(1, 40), raise(2, 190), fold(0)]);
      expect(state.phase).toBe('reveal');
      const done = play(state, [advance]);
      expect(done.final?.pots).toEqual([
        { amount: 110, eligible: [1, 2], winners: [1] },
        { amount: 150, eligible: [2], winners: [2] },
      ]);
      expect(done.final?.payouts).toEqual([0, 110, 150]);
      expect(done.players.map((p) => p.stack)).toEqual([990, 110, 150]);
      expect(chips(done)).toBe(1250);
    });

    it('stops at once when the last seat able to act calls an all-in', () => {
      const state = play(start(), [check(1), check(2), raise(0, 990), fold(1), call(2)]);
      expect(state.phase).toBe('reveal');
      expect(state.players[2]).toMatchObject({ stack: 0, allIn: true, roundCommitted: 190 });
      const done = play(state, [advance]);
      expect(done.final?.pots).toEqual([
        { amount: 410, eligible: [0, 2], winners: [2] },
        { amount: 800, eligible: [0], winners: [0] },
      ]);
      expect(done.players.map((p) => p.stack)).toEqual([800, 40, 410]);
    });
  });

  it('conserves chips and pays out exactly the pot', () => {
    const start = appendix();
    const total = chips(start);
    expect(total).toBe(4 * STACK);
    const state = play(start, [...ROUND1, advance, raise(BORIS, 30), timeout, timeout, timeout]);
    expect(state.phase).toBe('done');
    expect(chips(state)).toBe(total);
    expect(state.round1?.payouts.reduce((a, b) => a + b, 0)).toBe(state.round1?.pot);
    expect(state.final?.payouts.reduce((a, b) => a + b, 0)).toBe(state.final?.pot);
    expect(state.final?.pots.reduce((a, b) => a + b.amount, 0)).toBe(state.final?.pot);
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
    ok(step(later, raise(BORIS, 30)));
    ok(step(later, timeout));
    expect(JSON.stringify(later)).toBe(laterFrozen);
  });
});

describe('helpers', () => {
  it('orders active seats clockwise from the start seat', () => {
    const state = play(appendix(), [...ROUND1, advance, raise(BORIS, 30), fold(VERA)]);
    expect(activeOrder(state, GLEB)).toEqual([GLEB, ANA, BORIS]);
    expect(activeOrder(state, 0)).toEqual([ANA, BORIS, GLEB]);
  });

  it('offers bet options only to the seat to act', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    expect(betOptions(state, BORIS)).toEqual({ canCheck: true, call: 0, callAllIn: false, raise: { min: 30, max: 990 } });
    expect(betOptions(state, VERA)).toBeNull();
    expect(betOptions(state, 9)).toBeNull();
    expect(betOptions(play(appendix(), ROUND1), BORIS)).toBeNull();
    const opened = play(state, [raise(BORIS, 30)]);
    // Vera's Round 1 win of 12 is in her stack: 990 + 12.
    expect(betOptions(opened, VERA)).toEqual({ canCheck: false, call: 30, callAllIn: false, raise: { min: 60, max: 1002 } });
    expect(betOptions(opened, BORIS)).toBeNull();
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
    expect(view.you?.bet).toBeNull();
    expect(view.players[BORIS]).toMatchObject({ decided: true, stayed: null, shown: null, handCount: 3, allIn: false });
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

  it('gives each seat its own best in the Final and bet options to the actor only', () => {
    const state = play(appendix(), [...ROUND1, advance]);
    const ana = viewFor(state, ANA);
    expect(ana.you?.hand).toEqual(cards('7F 12E 13A 9F'));
    expect(ana.you?.options).toEqual([]);
    expect(ana.you?.best).toEqual({ category: 'straight', cards: cards('13A 12E 11E 10A 9F'), key: [4, 13] });
    expect(ana.you?.bet).toBeNull();
    expect(ana.betting).toEqual({ level: 0, minRaise: 30, actor: BORIS });
    expect(viewFor(state, BORIS).you?.bet).toEqual({ canCheck: true, call: 0, callAllIn: false, raise: { min: 30, max: 990 } });
    expect(viewFor(state, BORIS).you?.best).toMatchObject({ category: 'fullHouse', key: [6, 10, 12] });
    expect(JSON.stringify(ana)).not.toContain(JSON.stringify(card('10F')));
  });

  it('caps the call by the stack and drops the raise when the stack cannot exceed the level', () => {
    // Vera holds exactly 30 once her Round 1 win is in; Gleb 40.
    const state = play(appendix([STACK, STACK, 28, 50]), [...ROUND1, advance, raise(BORIS, 30)]);
    expect(viewFor(state, VERA).you?.bet).toEqual({ canCheck: false, call: 30, callAllIn: true, raise: null });
    expect(viewFor(state, VERA).betting).toEqual({ level: 30, minRaise: 30, actor: VERA });
    const next = play(state, [call(VERA)]);
    expect(viewFor(next, VERA).players[VERA]).toMatchObject({ stack: 0, allIn: true, roundCommitted: 30 });
    expect(viewFor(next, GLEB).you?.bet).toEqual({ canCheck: false, call: 30, callAllIn: false, raise: { min: 40, max: 40 } });
    expect(viewFor(next, VERA).you?.bet).toBeNull();
  });

  it("keeps a folded player's best and reveals other hands only through final.hands", () => {
    const state = play(appendix(), [...ROUND1, advance, ...FINAL_BETS]);
    const vera = viewFor(state, VERA);
    expect(vera.players[VERA]?.folded).toBe(true);
    expect(vera.you?.best).toEqual({ category: 'pair', cards: cards('10A 10W 13E 11E 9A'), key: [1, 10, 13, 11, 9] });
    expect(vera.betting).toBeNull();
    expect(JSON.stringify(vera)).not.toContain(JSON.stringify(card('10F')));

    const done = play(state, [advance]);
    const view = viewFor(done, VERA);
    expect(view.final?.hands.map((h) => h.seat)).toEqual([ANA, BORIS]);
    expect(view.final?.hands[1]?.cards).toEqual(cards('3E 10F 12W 12F'));
    expect(view.you?.hand).toEqual(cards('6W 13E 9A 7W'));
    expect(view.players.map((p) => p.handCount)).toEqual([4, 4, 4, 4]);
    expect(JSON.stringify({ ...view, final: null })).not.toContain(JSON.stringify(card('10F')));
  });

  it('gives a spectator no private part', () => {
    expect(viewFor(appendix(), null).you).toBeNull();
    expect(viewFor(appendix(), 9).you).toBeNull();
  });
});
