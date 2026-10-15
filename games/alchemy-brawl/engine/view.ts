import { betOptions } from './hand.ts';
import { bestFive, round1Combination } from './scoring.ts';
import type { CardOption, HandState, HandView, PlayerView, YouView } from './types.ts';

export function viewFor(state: HandState, seat: number | null): HandView {
  const windowOpen = state.phase === 'decide';
  const players: PlayerView[] = state.players.map((player) => ({
    id: player.id,
    stack: player.stack,
    handCount: player.hand.length,
    decided: player.decision !== null,
    stayed: windowOpen ? null : player.decision?.kind === 'stay',
    shown: windowOpen ? null : player.shown,
    folded: player.folded,
    allIn: player.allIn,
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
            minRaise: state.betting.minRaise,
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
  const inFinal = state.phase === 'bet' || state.phase === 'reveal' || state.phase === 'done';
  const options: CardOption[] =
    state.phase === 'decide' ? player.hand.map((card) => ({ card, combination: round1Combination(card, state.table) })) : [];
  return {
    seat,
    hand: [...player.hand],
    decision: player.decision,
    canDecide: state.phase === 'decide' && player.decision === null,
    bet: betOptions(state, seat),
    options,
    // A folded player still sees their own best: it is their own cards plus public ones.
    best: inFinal ? bestFive([...player.hand, ...state.table]) : null,
  };
}
