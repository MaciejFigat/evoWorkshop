import { legalBets } from './hand.ts';
import { bestCombination } from './scoring.ts';
import type { CardOption, HandState, HandView, PlayerView, YouView } from './types.ts';

export function viewFor(state: HandState, seat: number | null): HandView {
  const windowOpen = state.phase === 'decide';
  const players: PlayerView[] = state.players.map((player) => ({
    id: player.id,
    stack: player.stack,
    // A stay spends the cast at once; while the window is open the count must not show it.
    handCount: windowOpen && player.decision?.kind === 'stay' ? player.hand.length + 1 : player.hand.length,
    decided: player.decision !== null,
    stayed: windowOpen ? null : player.decision?.kind === 'stay',
    shown: windowOpen ? null : player.shown,
    castLocked: player.pendingCast !== null,
    folded: player.folded,
    committed: player.committed,
    roundCommitted: player.roundCommitted,
  }));
  return {
    phase: state.phase,
    button: state.button,
    round1Pot: state.round1Pot,
    finalPot: state.finalPot,
    table: [...state.table],
    deckCount: state.deck.length,
    players,
    betting:
      state.betting === null
        ? null
        : {
            level: state.betting.level,
            bets: state.betting.bets,
            cap: state.rules.maxBetsPerRound,
            unit: state.rules.finalBet,
            actor: state.betting.toAct[0] ?? null,
          },
    round1: state.round1,
    final: state.final,
    you: seat === null ? null : youFor(state, seat),
  };
}

function youFor(state: HandState, seat: number): YouView | null {
  const player = state.players[seat];
  if (player === undefined) {
    return null;
  }
  const own = player.pendingCast === null ? player.hand : [...player.hand, player.pendingCast];
  const options: CardOption[] =
    state.table.length < 2 ? [] : own.map((card) => ({ card, combination: bestCombination(card, state.table) }));
  return {
    seat,
    hand: [...player.hand],
    decision: player.decision,
    pendingCast: player.pendingCast,
    canDecide: state.phase === 'decide' && player.decision === null,
    canCast: state.phase === 'cast' && !player.folded && player.pendingCast === null,
    legalBets: legalBets(state, seat),
    options,
  };
}
