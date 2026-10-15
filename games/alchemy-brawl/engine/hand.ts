import { sameCard, type Card } from './cards.ts';
import { MIN_PLAYERS, round1Pot, type Rules } from './config.ts';
import { bestCombination, bestOfCards, winnersOf } from './scoring.ts';
import type {
  BetAction,
  BetOptions,
  Decision,
  FinalResult,
  HandAction,
  HandEvent,
  HandPlayer,
  HandState,
  Pot,
  Round1Result,
  SeatCard,
  SeatCards,
  SeatCombination,
  StepError,
  StepResult,
} from './types.ts';

export const CARDS_PER_PLAYER = 4;
// The Round 1 pair stays on the table; the Final adds one card to it.
export const TABLE_CARDS = 3;
export const ROUND1_TABLE = 2;
export const FINAL_TABLE = 3;
const INITIAL_HAND = 3;

export type SeatStake = { id: string; stack: number };

// The deck comes in already shuffled, so the engine stays pure: the caller owns the seed.
export function startHand(rules: Rules, seats: SeatStake[], button: number, deck: Card[]): StepResult {
  if (seats.length < MIN_PLAYERS) {
    return { ok: false, reason: 'not_enough_players' };
  }
  if (deck.length < seats.length * CARDS_PER_PLAYER + TABLE_CARDS) {
    return { ok: false, reason: 'deck_too_small' };
  }
  if (seats.some((seat) => seat.stack < rules.ante)) {
    return { ok: false, reason: 'insufficient_stack' };
  }
  const first = round1Pot(rules, seats.length);
  const state: HandState = {
    rules,
    button: button % seats.length,
    players: seats.map((seat) => ({
      id: seat.id,
      stack: seat.stack - rules.ante,
      hand: [],
      decision: null,
      shown: null,
      folded: false,
      // The ante may take the last chip: that seat plays the hand without acting in the Final.
      allIn: seat.stack === rules.ante,
      committed: rules.ante,
      roundCommitted: 0,
    })),
    deck: [...deck],
    phase: 'decide',
    round1Pot: first,
    finalPot: rules.ante * seats.length - first,
    table: [],
    betting: null,
    round1: null,
    final: null,
  };
  const events: HandEvent[] = [];
  const error = dealInitial(state) ?? turnTable(state, ROUND1_TABLE);
  if (error !== null) {
    return { ok: false, reason: error };
  }
  events.push({ type: 'round1Started', table: [...state.table] });
  return { ok: true, state, events };
}

export function step(state: HandState, action: HandAction): StepResult {
  const next = clone(state);
  const events: HandEvent[] = [];
  const error = apply(next, action, events);
  return error === null ? { ok: true, state: next, events } : { ok: false, reason: error };
}

// What the seat may do right now; null unless it is that seat's turn. `raise` holds 'to' values:
// the seat's total commitment in this betting round after the raise.
export function betOptions(state: HandState, seat: number): BetOptions | null {
  const betting = state.betting;
  const player = state.players[seat];
  if (state.phase !== 'bet' || betting === null || player === undefined || betting.toAct[0] !== seat) {
    return null;
  }
  const owed = betting.level - player.roundCommitted;
  const max = player.roundCommitted + player.stack;
  return {
    canCheck: owed === 0,
    call: Math.min(owed, player.stack),
    callAllIn: owed > 0 && owed >= player.stack,
    raise: max > betting.level ? { min: Math.min(betting.level + betting.minRaise, max), max } : null,
  };
}

export function activeOrder(state: HandState, start: number): number[] {
  return seatsFrom(state, start).filter((seat) => state.players[seat]?.folded === false);
}

function seatsFrom(state: HandState, start: number): number[] {
  const count = state.players.length;
  return Array.from({ length: count }, (_, i) => (start + i) % count);
}

function canAct(player: HandPlayer): boolean {
  return !player.folded && !player.allIn;
}

function actingOrder(state: HandState, start: number): number[] {
  return seatsFrom(state, start).filter((seat) => {
    const player = state.players[seat];
    return player !== undefined && canAct(player);
  });
}

function apply(state: HandState, action: HandAction, events: HandEvent[]): StepError | null {
  switch (action.type) {
    case 'decide':
      return decide(state, action.seat, action.decision, events);
    case 'bet':
      return bet(state, action.seat, action.action, events);
    case 'timeout':
      return timeout(state, events);
    case 'advance':
      return advance(state, events);
  }
}

function clone(state: HandState): HandState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, hand: [...player.hand] })),
    deck: [...state.deck],
    table: [...state.table],
    betting: state.betting === null ? null : { ...state.betting, toAct: [...state.betting.toAct] },
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

function turnTable(state: HandState, count: number): StepError | null {
  const turned = state.deck.splice(0, count);
  if (turned.length < count) {
    return 'deck_too_small';
  }
  state.table.push(...turned);
  return null;
}

function decide(state: HandState, seat: number, decision: Decision, events: HandEvent[]): StepError | null {
  if (state.phase !== 'decide') {
    return 'wrong_phase';
  }
  const player = state.players[seat];
  if (player === undefined) {
    return 'unknown_seat';
  }
  if (player.decision !== null) {
    return 'already_decided';
  }
  if (decision.kind === 'skip') {
    player.decision = decision;
  } else {
    const showCard = player.hand.find((held) => sameCard(held, decision.show));
    if (showCard === undefined) {
      return 'card_not_in_hand';
    }
    // The shown card stays in the hand: staying costs information, never a card.
    player.decision = { kind: 'stay', show: showCard };
    player.shown = showCard;
  }
  events.push({ type: 'decisionLocked', seat });
  if (state.players.every((p) => p.decision !== null)) {
    resolveRound1(state, events);
  }
  return null;
}

function resolveRound1(state: HandState, events: HandEvent[]): void {
  const pot = state.round1Pot;
  const stayers: number[] = [];
  const shown: SeatCard[] = [];
  state.players.forEach((player, seat) => {
    if (player.decision?.kind === 'stay') {
      stayers.push(seat);
      shown.push({ seat, card: player.decision.show });
    }
  });
  let result: Round1Result;
  const base = { table: [...state.table], pot, stayers, shown };
  if (stayers.length === 0) {
    state.finalPot += pot;
    result = { ...base, combinations: [], winners: [], payouts: state.players.map(() => 0), rolledOver: true };
  } else if (stayers.length === 1) {
    const winners = [...stayers];
    result = { ...base, combinations: [], winners, payouts: payOut(state, pot, winners), rolledOver: false };
  } else {
    const combinations = shown.map((entry) => ({
      seat: entry.seat,
      combination: bestCombination(entry.card, state.table),
    }));
    const winners = winnersOf(combinations);
    result = { ...base, combinations, winners, payouts: payOut(state, pot, winners), rolledOver: false };
  }
  state.round1Pot = 0;
  state.round1 = result;
  state.phase = 'round1End';
  events.push({ type: 'round1Resolved', result });
}

// Everyone draws to four cards, a third card joins the Round 1 pair and betting starts at once.
function startFinal(state: HandState, events: HandEvent[]): StepError | null {
  for (const seat of activeOrder(state, state.button + 1)) {
    const error = drawCard(state, seat);
    if (error !== null) {
      return error;
    }
  }
  const error = turnTable(state, FINAL_TABLE - ROUND1_TABLE);
  if (error !== null) {
    return error;
  }
  state.phase = 'bet';
  state.betting = { level: 0, minRaise: state.rules.minBet, toAct: actingOrder(state, state.button + 1) };
  events.push({ type: 'finalStarted', table: [...state.table] });
  return null;
}

function bet(state: HandState, seat: number, action: BetAction, events: HandEvent[]): StepError | null {
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
  const owed = betting.level - player.roundCommitted;
  let amount = 0;
  switch (action.kind) {
    case 'fold':
      player.folded = true;
      betting.toAct.shift();
      break;
    case 'check':
      if (owed !== 0) {
        return 'illegal_bet';
      }
      betting.toAct.shift();
      break;
    case 'call':
      if (owed === 0) {
        return 'illegal_bet';
      }
      amount = Math.min(owed, player.stack);
      betting.toAct.shift();
      break;
    case 'raise': {
      if (action.to <= betting.level) {
        return 'bad_raise_size';
      }
      amount = action.to - player.roundCommitted;
      if (amount > player.stack) {
        return 'insufficient_stack';
      }
      const increment = action.to - betting.level;
      const full = increment >= betting.minRaise;
      if (!full && amount !== player.stack) {
        return 'bad_raise_size';
      }
      betting.level = action.to;
      if (full) {
        // A full raise reopens the action for every other seat that can still act.
        betting.minRaise = increment;
        betting.toAct = actingOrder(state, seat + 1).filter((s) => s !== seat);
      } else {
        // A short all-in raises the level but gives nobody a second turn.
        betting.toAct.shift();
      }
      break;
    }
  }
  player.stack -= amount;
  player.committed += amount;
  player.roundCommitted += amount;
  player.allIn = player.allIn || (amount > 0 && player.stack === 0);
  state.finalPot += amount;
  events.push({ type: 'betPlaced', seat, kind: action.kind, amount, allIn: player.allIn });

  const [last, ...others] = activeOrder(state, 0);
  if (last !== undefined && others.length === 0) {
    const pot: Pot = { amount: state.finalPot, eligible: [last], winners: [last] };
    finish(state, { reason: 'fold', hands: [], combinations: [], pots: [pot] }, events);
    return null;
  }
  if (betting.toAct.length === 0) {
    state.betting = null;
    state.phase = 'reveal';
  }
  return null;
}

function timeout(state: HandState, events: HandEvent[]): StepError | null {
  if (state.phase === 'decide') {
    for (const player of state.players) {
      if (player.decision === null) {
        player.decision = { kind: 'skip' };
      }
    }
    resolveRound1(state, events);
    return null;
  }
  if (state.phase === 'bet' && state.betting !== null) {
    const seat = state.betting.toAct[0];
    if (seat === undefined) {
      return 'wrong_phase';
    }
    return bet(state, seat, { kind: betOptions(state, seat)?.canCheck === true ? 'check' : 'fold' }, events);
  }
  return 'wrong_phase';
}

function advance(state: HandState, events: HandEvent[]): StepError | null {
  if (state.phase === 'round1End') {
    return startFinal(state, events);
  }
  if (state.phase === 'reveal') {
    showdown(state, events);
    return null;
  }
  return 'wrong_phase';
}

// Every remaining hand is shown whole; the combination is the best three among hand and table.
// Each pot goes to the best combination among the seats eligible for it.
function showdown(state: HandState, events: HandEvent[]): void {
  const hands: SeatCards[] = [];
  state.players.forEach((player, seat) => {
    if (!player.folded) {
      hands.push({ seat, cards: [...player.hand] });
    }
  });
  const combinations: SeatCombination[] = hands.flatMap((entry) => {
    const combination = bestOfCards([...entry.cards, ...state.table]);
    return combination === null ? [] : [{ seat: entry.seat, combination }];
  });
  const pots = buildPots(state).map((pot) => ({
    ...pot,
    winners: winnersOf(combinations.filter((entry) => pot.eligible.includes(entry.seat))),
  }));
  finish(state, { reason: 'showdown', hands, combinations, pots }, events);
}

// Pots by contribution level over the Final bets (table stakes). The antes are equal for every
// seat and the Round 1 share has already been paid out, so the rest of the ante money and any
// rollover sit in the main pot, which every unfolded seat is eligible for. Folded seats fund the
// pots but are never eligible; whatever lies above the highest unfolded level stays in the last pot.
function buildPots(state: HandState): Pot[] {
  const unfolded = state.players.flatMap((player, seat) => (player.folded ? [] : [seat]));
  const levels = [...new Set(unfolded.map((seat) => state.players[seat]?.roundCommitted ?? 0))].sort((a, b) => a - b);
  const betTotal = state.players.reduce((sum, player) => sum + player.roundCommitted, 0);
  const pots: Pot[] = [];
  let previous = 0;
  levels.forEach((level, i) => {
    const top = i === levels.length - 1;
    const amount = state.players.reduce(
      (sum, player) => sum + Math.max(0, (top ? player.roundCommitted : Math.min(player.roundCommitted, level)) - previous),
      0,
    );
    const base = i === 0 ? state.finalPot - betTotal : 0;
    const eligible = unfolded.filter((seat) => (state.players[seat]?.roundCommitted ?? 0) >= level);
    if (amount + base > 0) {
      pots.push({ amount: amount + base, eligible, winners: [] });
    }
    previous = level;
  });
  return pots;
}

type Settlement = Pick<FinalResult, 'reason' | 'hands' | 'combinations' | 'pots'>;

function finish(state: HandState, settlement: Settlement, events: HandEvent[]): void {
  const pot = state.finalPot;
  const payouts = state.players.map(() => 0);
  for (const each of settlement.pots) {
    payOut(state, each.amount, each.winners).forEach((payout, seat) => {
      payouts[seat] = (payouts[seat] ?? 0) + payout;
    });
  }
  const winners = state.players.flatMap((_, seat) => (settlement.pots.some((p) => p.winners.includes(seat)) ? [seat] : []));
  const result: FinalResult = { ...settlement, table: [...state.table], pot, winners, payouts };
  state.finalPot = 0;
  state.betting = null;
  state.phase = 'done';
  state.final = result;
  events.push({ type: 'handEnded', result });
}

// The pot is split evenly, rounded down once; odd units go one each to the winners nearest
// the button, clockwise from button+1 (spec §4.6). Stacks are credited here.
function payOut(state: HandState, pot: number, winners: number[]): number[] {
  const ordered = seatsFrom(state, state.button + 1).filter((seat) => winners.includes(seat));
  const payouts = state.players.map(() => 0);
  if (ordered.length === 0) {
    return payouts;
  }
  const share = Math.floor(pot / ordered.length);
  const odd = pot - share * ordered.length;
  ordered.forEach((seat, i) => {
    const payout = share + (i < odd ? 1 : 0);
    payouts[seat] = payout;
    const player = state.players[seat];
    if (player !== undefined) {
      player.stack += payout;
    }
  });
  return payouts;
}
