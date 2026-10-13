import type { BetKind, Card, HandView } from '@evo/brawl-shared';
import type { Rng } from '@evo/rng';

export type BotMove = { type: 'cast'; card: Card } | { type: 'bet'; kind: BetKind };

const STRONG_POWER = 11;
const LOOSE_CALL_RATE = 0.6;

// Sees exactly what a human in the same seat sees: the bot plays from the view, never from hand state.
export function chooseBotMove(view: HandView, rng: Rng): BotMove | null {
  const you = view.you;
  if (you === null) {
    return null;
  }
  if (you.canCast) {
    const card = you.hand[rng.int(0, you.hand.length - 1)];
    return card === undefined ? null : { type: 'cast', card };
  }
  const legal = you.legalBets;
  if (legal.length === 0) {
    return null;
  }
  const cast = you.pendingCast;
  const strong =
    cast !== null && (cast.element === view.catalyst?.element || cast.power >= STRONG_POWER);
  const pick = (...preferred: BetKind[]): BotMove | null => {
    const kind = preferred.find((k) => legal.includes(k));
    return kind === undefined ? null : { type: 'bet', kind };
  };
  if (strong) {
    return pick('raise', 'bet', 'call', 'check');
  }
  return legal.includes('check') || rng.next() < LOOSE_CALL_RATE ? pick('check', 'call') : pick('fold');
}
