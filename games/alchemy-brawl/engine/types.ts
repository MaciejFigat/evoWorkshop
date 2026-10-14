import type { Card } from './cards.ts';
import type { Rules } from './config.ts';

export type BetKind = 'check' | 'bet' | 'call' | 'raise' | 'fold';

// Three-card poker categories, lowest first. A straight beats a flush (spec §5).
export const CATEGORIES = ['high', 'pair', 'flush', 'straight', 'three', 'straightFlush'] as const;
export type Category = (typeof CATEGORIES)[number];

// `cards` are the three cards used, the cast first. `key` compares two combinations
// lexicographically: category rank first, then the tiebreak powers from spec §5.
export type Combination = { category: Category; cards: Card[]; key: number[] };

export type Phase = 'decide' | 'round1End' | 'cast' | 'bet' | 'reveal' | 'done';

export type Decision = { kind: 'stay'; cast: Card; show: Card } | { kind: 'skip' };

export type HandPlayer = {
  id: string;
  stack: number;
  hand: Card[];
  // Round 1 choice, hidden from the other seats until the window closes.
  decision: Decision | null;
  // The card a Round 1 stayer turned face up; it stays in the hand and is public until the hand ends.
  shown: Card | null;
  // Final cast, hidden until the reveal.
  pendingCast: Card | null;
  folded: boolean;
  committed: number;
  roundCommitted: number;
};

export type Betting = { level: number; bets: number; toAct: number[] };

export type SeatCard = { seat: number; card: Card };
export type SeatCombination = { seat: number; combination: Combination };

export type Round1Result = {
  table: Card[];
  pot: number;
  stayers: number[];
  shown: SeatCard[];
  // Empty when at most one player stayed: a lone stayer's cast is discarded unrevealed.
  casts: SeatCard[];
  combinations: SeatCombination[];
  // Empty when nobody stayed and the pot rolled into the Final.
  winners: number[];
  payouts: number[];
  rolledOver: boolean;
};

export type FinalResult = {
  reason: 'fold' | 'showdown';
  table: Card[];
  pot: number;
  casts: SeatCard[];
  combinations: SeatCombination[];
  winners: number[];
  payouts: number[];
};

export type HandState = {
  rules: Rules;
  button: number;
  players: HandPlayer[];
  deck: Card[];
  phase: Phase;
  round1Pot: number;
  finalPot: number;
  // Shared face-up cards: 2 in Round 1, 3 in the Final, fresh each round.
  table: Card[];
  betting: Betting | null;
  round1: Round1Result | null;
  final: FinalResult | null;
};

export type HandAction =
  | { type: 'decide'; seat: number; decision: Decision }
  | { type: 'cast'; seat: number; card: Card }
  | { type: 'bet'; seat: number; kind: BetKind }
  | { type: 'timeout' }
  | { type: 'advance' };

export type HandEvent =
  | { type: 'round1Started'; table: Card[] }
  | { type: 'decisionLocked'; seat: number }
  | { type: 'round1Resolved'; result: Round1Result }
  | { type: 'finalStarted'; table: Card[] }
  | { type: 'castLocked'; seat: number }
  | { type: 'betPlaced'; seat: number; kind: BetKind; amount: number }
  | { type: 'handEnded'; result: FinalResult };

export type StepError =
  | 'not_enough_players'
  | 'deck_too_small'
  | 'wrong_phase'
  | 'unknown_seat'
  | 'folded'
  | 'already_decided'
  | 'already_cast'
  | 'card_not_in_hand'
  | 'same_card'
  | 'not_your_turn'
  | 'illegal_bet'
  | 'insufficient_stack';

export type StepResult = { ok: true; state: HandState; events: HandEvent[] } | { ok: false; reason: StepError };

// ---- per-seat view: the only shape of hand state that leaves the server ----

export type PlayerView = {
  id: string;
  stack: number;
  handCount: number;
  // Round 1 window: the seat has locked a choice (stay or skip is still hidden).
  decided: boolean;
  // Known once the Round 1 window closes; null before that.
  stayed: boolean | null;
  shown: Card | null;
  castLocked: boolean;
  folded: boolean;
  committed: number;
  roundCommitted: number;
};

export type BettingView = { level: number; bets: number; cap: number; unit: number; actor: number | null };

// What each card in your hand would make with the current table: your own cards plus public
// cards, nothing hidden. Empty when there is no table yet.
export type CardOption = { card: Card; combination: Combination };

export type YouView = {
  seat: number;
  hand: Card[];
  decision: Decision | null;
  pendingCast: Card | null;
  canDecide: boolean;
  canCast: boolean;
  legalBets: BetKind[];
  options: CardOption[];
};

export type HandView = {
  phase: Phase;
  button: number;
  round1Pot: number;
  finalPot: number;
  table: Card[];
  deckCount: number;
  players: PlayerView[];
  betting: BettingView | null;
  round1: Round1Result | null;
  final: FinalResult | null;
  you: YouView | null;
};
