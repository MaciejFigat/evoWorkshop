import { ELEMENTS, sameCard, type Card } from '../cards.ts';
import type { Rules } from '../config.ts';
import { compareReserves, recipesOf, resolveRound, stonePower } from './scoring.ts';
import type {
  BetKind,
  HandAction,
  HandEvent,
  HandOutcome,
  HandPlayer,
  HandState,
  SeatCard,
  SeatScore,
  StepError,
  StepResult,
} from './types.ts';

export const ROUNDS = 3;
const INITIAL_HAND = 3;
const CARDS_PER_PLAYER = INITIAL_HAND + ROUNDS;

export type SeatStake = { id: string; stack: number };

// The deck comes in already shuffled, so the engine stays pure: the caller owns the seed.
export function startHand(rules: Rules, seats: SeatStake[], button: number, deck: Card[]): StepResult {
  if (seats.length < 2) {
    return { ok: false, reason: 'not_enough_players' };
  }
  if (deck.length < seats.length * CARDS_PER_PLAYER + ROUNDS) {
    return { ok: false, reason: 'deck_too_small' };
  }
  if (seats.some((seat) => seat.stack < rules.ante)) {
    return { ok: false, reason: 'insufficient_stack' };
  }
  const state: HandState = {
    rules,
    button: button % seats.length,
    players: seats.map((seat) => ({
      id: seat.id,
      stack: seat.stack - rules.ante,
      hand: [],
      casts: [],
      pendingCast: null,
      folded: false,
      committed: rules.ante,
      roundCommitted: 0,
      sigils: 0,
    })),
    deck: [...deck],
    round: 0,
    phase: 'cast',
    catalyst: null,
    pot: rules.ante * seats.length,
    betting: null,
    results: [],
    outcome: null,
  };
  const events: HandEvent[] = [];
  const error = dealInitial(state) ?? beginRound(state, 1, events);
  return error === null ? { ok: true, state, events } : { ok: false, reason: error };
}

export function step(state: HandState, action: HandAction): StepResult {
  const next = clone(state);
  const events: HandEvent[] = [];
  const error = apply(next, action, events);
  return error === null ? { ok: true, state: next, events } : { ok: false, reason: error };
}

export function legalBets(state: HandState, seat: number): BetKind[] {
  const betting = state.betting;
  const player = state.players[seat];
  if (state.phase !== 'bet' || betting === null || player === undefined || betting.toAct[0] !== seat) {
    return [];
  }
  const raise: BetKind[] = betting.bets < state.rules.maxBetsPerRound ? [betting.level === 0 ? 'bet' : 'raise'] : [];
  return betting.level === player.roundCommitted ? ['check', ...raise] : ['fold', 'call', ...raise];
}

export function betUnit(state: HandState): number {
  return state.round === ROUNDS ? state.rules.bigBet : state.rules.smallBet;
}

export function roundValue(rules: Rules, round: number): number {
  return round === ROUNDS ? rules.finalRoundValue : 1;
}

export function lowestCard(hand: Card[]): Card | null {
  let lowest: Card | null = null;
  for (const card of hand) {
    if (
      lowest === null ||
      card.power < lowest.power ||
      (card.power === lowest.power && ELEMENTS.indexOf(card.element) < ELEMENTS.indexOf(lowest.element))
    ) {
      lowest = card;
    }
  }
  return lowest;
}

export function activeOrder(state: HandState, start: number): number[] {
  const count = state.players.length;
  return Array.from({ length: count }, (_, i) => (start + i) % count).filter(
    (seat) => state.players[seat]?.folded === false,
  );
}

function apply(state: HandState, action: HandAction, events: HandEvent[]): StepError | null {
  switch (action.type) {
    case 'cast':
      return cast(state, action.seat, action.card, events);
    case 'bet':
      return bet(state, action.seat, action.kind, events);
    case 'timeout':
      return timeout(state, events);
    case 'advance':
      return advance(state, events);
  }
}

function clone(state: HandState): HandState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, hand: [...player.hand], casts: [...player.casts] })),
    deck: [...state.deck],
    betting: state.betting === null ? null : { ...state.betting, toAct: [...state.betting.toAct] },
    results: [...state.results],
  };
}

function drawCard(state: HandState, seat: number): StepError | null {
  const card = state.deck.shift();
  const player = state.players[seat];
  if (card === undefined) {
    return 'deck_too_small';
  }
  if (player === undefined) {
    return 'unknown_seat';
  }
  player.hand.push(card);
  return null;
}

function dealInitial(state: HandState): StepError | null {
  for (let i = 0; i < INITIAL_HAND; i += 1) {
    for (const seat of activeOrder(state, state.button + 1)) {
      const error = drawCard(state, seat);
      if (error !== null) {
        return error;
      }
    }
  }
  return null;
}

function beginRound(state: HandState, round: number, events: HandEvent[]): StepError | null {
  state.round = round;
  state.phase = 'cast';
  state.catalyst = null;
  for (const player of state.players) {
    player.roundCommitted = 0;
  }
  for (const seat of activeOrder(state, state.button + 1)) {
    const error = drawCard(state, seat);
    if (error !== null) {
      return error;
    }
  }
  events.push({ type: 'roundStarted', round });
  return null;
}

function cast(state: HandState, seat: number, card: Card, events: HandEvent[]): StepError | null {
  if (state.phase !== 'cast') {
    return 'wrong_phase';
  }
  const player = state.players[seat];
  if (player === undefined) {
    return 'unknown_seat';
  }
  if (player.folded) {
    return 'folded';
  }
  if (player.pendingCast !== null) {
    return 'already_cast';
  }
  const index = player.hand.findIndex((held) => sameCard(held, card));
  const held = player.hand[index];
  if (held === undefined) {
    return 'card_not_in_hand';
  }
  player.hand.splice(index, 1);
  player.pendingCast = held;
  events.push({ type: 'castLocked', seat });
  const waiting = activeOrder(state, 0).some((s) => state.players[s]?.pendingCast === null);
  return waiting ? null : flipCatalyst(state, events);
}

function flipCatalyst(state: HandState, events: HandEvent[]): StepError | null {
  const catalyst = state.deck.shift();
  if (catalyst === undefined) {
    return 'deck_too_small';
  }
  state.catalyst = catalyst;
  events.push({ type: 'catalyst', card: catalyst });
  if (state.round === 1) {
    state.phase = 'reveal';
    return null;
  }
  state.phase = 'bet';
  state.betting = { level: 0, bets: 0, toAct: activeOrder(state, state.button + 1) };
  return null;
}

function bet(state: HandState, seat: number, kind: BetKind, events: HandEvent[]): StepError | null {
  const betting = state.betting;
  if (state.phase !== 'bet' || betting === null) {
    return 'wrong_phase';
  }
  const player = state.players[seat];
  if (player === undefined) {
    return 'unknown_seat';
  }
  if (betting.toAct[0] !== seat) {
    return 'not_your_turn';
  }
  if (!legalBets(state, seat).includes(kind)) {
    return 'illegal_bet';
  }
  let amount = 0;
  if (kind === 'fold') {
    player.folded = true;
    player.pendingCast = null;
    betting.toAct.shift();
  } else {
    const aggressive = kind === 'bet' || kind === 'raise';
    if (aggressive) {
      betting.level += betUnit(state);
      betting.bets += 1;
    }
    amount = betting.level - player.roundCommitted;
    if (amount > player.stack) {
      return 'insufficient_stack';
    }
    player.stack -= amount;
    player.committed += amount;
    player.roundCommitted += amount;
    state.pot += amount;
    betting.toAct = aggressive ? activeOrder(state, seat + 1).filter((s) => s !== seat) : betting.toAct.slice(1);
  }
  events.push({ type: 'betPlaced', seat, kind, amount });

  const [last, ...others] = activeOrder(state, 0);
  if (last !== undefined && others.length === 0) {
    finish(state, { reason: 'fold', scores: [], shownReserves: [], winners: [last] }, events);
    return null;
  }
  if (betting.toAct.length === 0) {
    state.betting = null;
    state.phase = 'reveal';
  }
  return null;
}

function timeout(state: HandState, events: HandEvent[]): StepError | null {
  if (state.phase === 'cast') {
    for (const seat of activeOrder(state, state.button + 1)) {
      const player = state.players[seat];
      const card = player === undefined || player.pendingCast !== null ? null : lowestCard(player.hand);
      if (card !== null) {
        const error = cast(state, seat, card, events);
        if (error !== null) {
          return error;
        }
      }
    }
    return null;
  }
  if (state.phase === 'bet' && state.betting !== null) {
    const seat = state.betting.toAct[0];
    if (seat === undefined) {
      return 'wrong_phase';
    }
    return bet(state, seat, legalBets(state, seat).includes('check') ? 'check' : 'fold', events);
  }
  return 'wrong_phase';
}

function advance(state: HandState, events: HandEvent[]): StepError | null {
  if (state.phase === 'reveal') {
    return reveal(state, events);
  }
  if (state.phase === 'roundEnd') {
    if (state.round < ROUNDS) {
      return beginRound(state, state.round + 1, events);
    }
    showdown(state, events);
    return null;
  }
  return 'wrong_phase';
}

function reveal(state: HandState, events: HandEvent[]): StepError | null {
  const catalyst = state.catalyst;
  if (catalyst === null) {
    return 'wrong_phase';
  }
  const casts: SeatCard[] = [];
  state.players.forEach((player, seat) => {
    if (!player.folded && player.pendingCast !== null) {
      casts.push({ seat, card: player.pendingCast });
      player.casts.push(player.pendingCast);
      player.pendingCast = null;
    }
  });
  const value = roundValue(state.rules, state.round);
  const { burned, winner } = resolveRound(casts, catalyst.element);
  const winning = winner === null ? undefined : state.players[winner];
  if (winning !== undefined) {
    winning.sigils += value;
  }
  const result = { round: state.round, catalyst, casts, burned, winner, value };
  state.results.push(result);
  state.phase = 'roundEnd';
  events.push({ type: 'revealed', result });
  return null;
}

function showdown(state: HandState, events: HandEvent[]): void {
  const scores: SeatScore[] = [];
  const reserves = new Map<number, Card[]>();
  for (const seat of activeOrder(state, state.button + 1)) {
    const player = state.players[seat];
    if (player !== undefined) {
      const counted = state.rules.burnedCountsForRecipes
        ? player.casts
        : player.casts.filter((_, i) => state.results[i]?.burned.includes(seat) !== true);
      const recipes = recipesOf(counted);
      scores.push({ seat, sigils: player.sigils, recipes, score: player.sigils + recipes.length });
      reserves.set(seat, player.hand);
    }
  }
  const top = Math.max(...scores.map((s) => s.score));
  const tied = scores.filter((s) => s.score === top).map((s) => s.seat);
  const reserveOf = (seat: number): Card[] => reserves.get(seat) ?? [];
  let winners: number[] = [];
  for (const seat of tied) {
    const best = winners[0];
    const diff = best === undefined ? 1 : compareReserves(reserveOf(seat), reserveOf(best));
    if (diff > 0) {
      winners = [seat];
    } else if (diff === 0) {
      winners.push(seat);
    }
  }
  const shownReserves = tied.length > 1 ? tied.map((seat) => ({ seat, reserve: reserveOf(seat) })) : [];
  finish(state, { reason: 'showdown', scores, shownReserves, winners }, events);
}

type Settlement = Pick<HandOutcome, 'reason' | 'scores' | 'shownReserves' | 'winners'>;

// The pot is split evenly; odd chips go one each to the winners nearest the button, clockwise.
function finish(state: HandState, settlement: Settlement, events: HandEvent[]): void {
  const winners = activeOrder(state, state.button + 1).filter((seat) => settlement.winners.includes(seat));
  const share = Math.floor(state.pot / winners.length);
  const oddChips = state.pot - share * winners.length;
  const payouts = state.players.map(() => 0);
  winners.forEach((seat, i) => {
    const payout = share + (i < oddChips ? 1 : 0);
    payouts[seat] = payout;
    const player = state.players[seat];
    if (player !== undefined) {
      player.stack += payout;
    }
  });
  const stones = activeOrder(state, 0).flatMap((seat) => {
    const player = state.players[seat];
    const power = player === undefined ? null : stonePower(received(player));
    return power === null ? [] : [{ seat, power }];
  });
  const outcome: HandOutcome = { ...settlement, winners, payouts, stones };
  state.pot = 0;
  state.betting = null;
  state.phase = 'done';
  state.outcome = outcome;
  events.push({ type: 'handEnded', outcome });
}

function received(player: HandPlayer): Card[] {
  return [...player.casts, ...(player.pendingCast === null ? [] : [player.pendingCast]), ...player.hand];
}
