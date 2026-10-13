import type { Card } from '../cards.ts';
import { betUnit, legalBets } from './hand.ts';
import type { BetKind, HandOutcome, HandState, Phase, RoundResult } from './types.ts';

export type PlayerView = {
  id: string;
  stack: number;
  sigils: number;
  casts: Card[];
  castLocked: boolean;
  folded: boolean;
  committed: number;
  roundCommitted: number;
};

export type BettingView = { level: number; bets: number; cap: number; unit: number; actor: number | null };

export type YouView = {
  seat: number;
  hand: Card[];
  pendingCast: Card | null;
  canCast: boolean;
  legalBets: BetKind[];
};

export type HandView = {
  round: number;
  phase: Phase;
  button: number;
  pot: number;
  deckCount: number;
  catalyst: Card | null;
  players: PlayerView[];
  betting: BettingView | null;
  results: RoundResult[];
  outcome: HandOutcome | null;
  you: YouView | null;
};

// The only way hand state leaves the server: other players' hands and face-down casts never appear here.
export function viewFor(state: HandState, seat: number | null): HandView {
  const me = seat === null ? undefined : state.players[seat];
  return {
    round: state.round,
    phase: state.phase,
    button: state.button,
    pot: state.pot,
    deckCount: state.deck.length,
    catalyst: state.catalyst,
    players: state.players.map((player) => ({
      id: player.id,
      stack: player.stack,
      sigils: player.sigils,
      casts: player.casts,
      castLocked: player.pendingCast !== null,
      folded: player.folded,
      committed: player.committed,
      roundCommitted: player.roundCommitted,
    })),
    betting:
      state.betting === null
        ? null
        : {
            level: state.betting.level,
            bets: state.betting.bets,
            cap: state.rules.maxBetsPerRound,
            unit: betUnit(state),
            actor: state.betting.toAct[0] ?? null,
          },
    results: state.results,
    outcome: state.outcome,
    you:
      seat === null || me === undefined
        ? null
        : {
            seat,
            hand: me.hand,
            pendingCast: me.pendingCast,
            canCast: state.phase === 'cast' && !me.folded && me.pendingCast === null,
            legalBets: legalBets(state, seat),
          },
  };
}
