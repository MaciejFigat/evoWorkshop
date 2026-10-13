import type { Card } from '../cards.ts';
import type { Rules } from '../config.ts';

export type BetKind = 'check' | 'bet' | 'call' | 'raise' | 'fold';

export type Recipe = 'essence' | 'chain';

export type Phase = 'cast' | 'bet' | 'reveal' | 'roundEnd' | 'done';

export type HandPlayer = {
  id: string;
  stack: number;
  hand: Card[];
  casts: Card[];
  pendingCast: Card | null;
  folded: boolean;
  committed: number;
  roundCommitted: number;
  sigils: number;
};

export type Betting = {
  level: number;
  bets: number;
  toAct: number[];
};

export type SeatCard = { seat: number; card: Card };

export type RoundResult = {
  round: number;
  catalyst: Card;
  casts: SeatCard[];
  burned: number[];
  winner: number | null;
  value: number;
};

export type SeatScore = { seat: number; sigils: number; recipes: Recipe[]; score: number };

export type HandOutcome = {
  reason: 'fold' | 'showdown';
  scores: SeatScore[];
  winners: number[];
  payouts: number[];
  shownReserves: { seat: number; reserve: Card[] }[];
  stones: { seat: number; power: number }[];
};

export type HandState = {
  rules: Rules;
  button: number;
  players: HandPlayer[];
  deck: Card[];
  round: number;
  phase: Phase;
  catalyst: Card | null;
  pot: number;
  betting: Betting | null;
  results: RoundResult[];
  outcome: HandOutcome | null;
};

export type HandAction =
  | { type: 'cast'; seat: number; card: Card }
  | { type: 'bet'; seat: number; kind: BetKind }
  | { type: 'timeout' }
  | { type: 'advance' };

export type HandEvent =
  | { type: 'roundStarted'; round: number }
  | { type: 'castLocked'; seat: number }
  | { type: 'catalyst'; card: Card }
  | { type: 'betPlaced'; seat: number; kind: BetKind; amount: number }
  | { type: 'revealed'; result: RoundResult }
  | { type: 'handEnded'; outcome: HandOutcome };

export type StepError =
  | 'not_enough_players'
  | 'deck_too_small'
  | 'wrong_phase'
  | 'unknown_seat'
  | 'folded'
  | 'already_cast'
  | 'card_not_in_hand'
  | 'not_your_turn'
  | 'illegal_bet'
  | 'insufficient_stack';

export type StepResult = { ok: true; state: HandState; events: HandEvent[] } | { ok: false; reason: StepError };
