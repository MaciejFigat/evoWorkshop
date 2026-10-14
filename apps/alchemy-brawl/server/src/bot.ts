import {
  CATEGORY_RANK,
  compareCombinations,
  lowestCard,
  sameCard,
  type BetKind,
  type Card,
  type CardOption,
  type Decision,
  type HandView,
  type YouView,
} from '@evo/brawl-shared';
import type { Rng } from '@evo/rng';

export type BotMove = { type: 'decide'; decision: Decision } | { type: 'cast'; card: Card } | { type: 'bet'; kind: BetKind };

const BLUFF_STAY_RATE = 0.2;
const MEDIUM_BET_RATE = 0.5;
const MEDIUM_FOLD_RATE = 0.15;
const WEAK_CALL_RATE = 0.3;

// Sees exactly what a human in the same seat sees: the bot plays from the view, never from hand state.
export function chooseBotMove(view: HandView, rng: Rng): BotMove | null {
  const you = view.you;
  if (you === null) {
    return null;
  }
  if (you.canDecide) {
    return { type: 'decide', decision: decide(you, rng) };
  }
  if (you.canCast) {
    const best = bestOption(you.options);
    return best === null ? null : { type: 'cast', card: best.card };
  }
  if (you.legalBets.length > 0) {
    return bet(you, rng);
  }
  return null;
}

function decide(you: YouView, rng: Rng): Decision {
  const best = bestOption(you.options);
  if (best !== null && CATEGORY_RANK[best.combination.category] >= CATEGORY_RANK.pair) {
    return stay(you.hand, best.card);
  }
  const lowest = lowestCard(you.hand);
  if (lowest !== null && rng.next() < BLUFF_STAY_RATE) {
    return stay(you.hand, lowest);
  }
  return { kind: 'skip' };
}

function stay(hand: Card[], cast: Card): Decision {
  const show = highestCard(hand.filter((card) => !sameCard(card, cast)));
  return show === null ? { kind: 'skip' } : { kind: 'stay', cast, show };
}

function bet(you: YouView, rng: Rng): BotMove | null {
  const legal = you.legalBets;
  const pending = you.pendingCast;
  const option = pending === null ? undefined : you.options.find((o) => sameCard(o.card, pending));
  const strength = option === undefined ? CATEGORY_RANK.high : CATEGORY_RANK[option.combination.category];
  const pick = (...preferred: BetKind[]): BotMove | null => {
    const kind = preferred.find((k) => legal.includes(k));
    return kind === undefined ? null : { type: 'bet', kind };
  };
  if (strength >= CATEGORY_RANK.straight) {
    return pick('raise', 'bet', 'call', 'check');
  }
  if (strength >= CATEGORY_RANK.pair) {
    if (legal.includes('bet') && rng.next() < MEDIUM_BET_RATE) {
      return pick('bet');
    }
    if (legal.includes('call') && rng.next() < MEDIUM_FOLD_RATE) {
      return pick('fold');
    }
    return pick('call', 'check');
  }
  if (legal.includes('check')) {
    return pick('check');
  }
  return rng.next() < WEAK_CALL_RATE ? pick('call') : pick('fold');
}

function bestOption(options: CardOption[]): CardOption | null {
  let best: CardOption | null = null;
  for (const option of options) {
    if (best === null || compareCombinations(option.combination, best.combination) > 0) {
      best = option;
    }
  }
  return best;
}

function highestCard(hand: Card[]): Card | null {
  let highest: Card | null = null;
  for (const card of hand) {
    if (highest === null || card.power > highest.power) {
      highest = card;
    }
  }
  return highest;
}
