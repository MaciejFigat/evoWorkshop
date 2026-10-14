import type { Card } from './cards.ts';
import type { Rules } from './config.ts';

export type BetKind = 'check' | 'bet' | 'call' | 'raise' | 'fold';

// Three-card poker categories, lowest first. A straight beats a flush (spec §5).
export const CATEGORIES = ['high', 'pair', 'flush', 'straight', 'three', 'straightFlush'] as const;
export type Category = (typeof CATEGORIES)[number];

// `cards` are the three cards used, the player's own card first in Round 1. `key` compares two combinations
// lexicographically: category rank first, then the tiebreak powers from spec §5.
export type Combination = { category: Category; cards: Card[]; key: number[] };

export type Phase = 'decide' | 'round1End' | 'bet' | 'reveal' | 'done';

// Round 1: to stay you turn one card face up. That card plays for the Round 1 pot with the two table
// cards and stays in your hand, face up, until the hand ends. Nothing is ever discarded.
export type Decision = { kind: 'stay'; show: Card } | { kind: 'skip' };

export type HandPlayer = {
  id: string;
  stack: number;
  hand: Card[];
  // Round 1 choice, hidden from the other seats until the window closes.
  decision: Decision | null;
  // The card a Round 1 stayer turned face up; it stays in the hand and is public until the hand ends.
  shown: Card | null;
  folded: boolean;
  committed: number;
  roundCommitted: number;
};

export type Betting = { level: number; bets: number; toAct: number[] };

export type SeatCard = { seat: number; card: Card };
export type SeatCards = { seat: number; cards: Card[] };
export type SeatCombination = { seat: number; combination: Combination };

export type Round1Result = {
  table: Card[];
  pot: number;
  stayers: number[];
  // The shown card of every stayer, public once the window closes.
  shown: SeatCard[];
  // Empty when at most one player stayed: a lone stayer takes the pot without a contest.
  combinations: SeatCombination[];
  // Empty when nobody stayed and the pot rolled into the Final.
  winners: number[];
  payouts: number[];
  rolledOver: boolean;
};

// The Final plays every card: each remaining hand is shown at the showdown and its combination is
// the best three cards among the hand and the table, as the board plays in poker.
export type FinalResult = {
  reason: 'fold' | 'showdown';
  table: Card[];
  pot: number;
  // Empty on a fold: nothing is revealed.
  hands: SeatCards[];
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
  // Shared face-up cards: 2 in Round 1, 3 in the Final, fresh each round. The Final has no cast:
  // after the draw the three table cards go up and betting starts at once.
  table: Card[];
  betting: Betting | null;
  round1: Round1Result | null;
  final: FinalResult | null;
};

export type HandAction =
  | { type: 'decide'; seat: number; decision: Decision }
  | { type: 'bet'; seat: number; kind: BetKind }
  | { type: 'timeout' }
  | { type: 'advance' };

export type HandEvent =
  | { type: 'round1Started'; table: Card[] }
  | { type: 'decisionLocked'; seat: number }
  | { type: 'round1Resolved'; result: Round1Result }
  | { type: 'finalStarted'; table: Card[] }
  | { type: 'betPlaced'; seat: number; kind: BetKind; amount: number }
  | { type: 'handEnded'; result: FinalResult };

export type StepError =
  | 'not_enough_players'
  | 'deck_too_small'
  | 'wrong_phase'
  | 'unknown_seat'
  | 'folded'
  | 'already_decided'
  | 'card_not_in_hand'
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
  folded: boolean;
  committed: number;
  roundCommitted: number;
};

export type BettingView = { level: number; bets: number; cap: number; unit: number; actor: number | null };

// Round 1: what each card in your hand would make, shown, with the two table cards. Your own
// cards plus public cards, nothing hidden. Empty outside Round 1.
export type CardOption = { card: Card; combination: Combination };

export type YouView = {
  seat: number;
  hand: Card[];
  decision: Decision | null;
  canDecide: boolean;
  legalBets: BetKind[];
  options: CardOption[];
  // Final: the best three cards among your hand and the table; null before the Final.
  best: Combination | null;
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
