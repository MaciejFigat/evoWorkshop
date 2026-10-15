import {
  CATEGORY_RANK,
  compareCombinations,
  type BetKind,
  type Card,
  type CardOption,
  type Decision,
  type HandView,
  type YouView,
} from '@evo/alchemy-brawl/engine';
import type { Rng } from '@evo/rng';

export type BotMove = { type: 'decide'; decision: Decision } | { type: 'bet'; kind: BetKind };

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
  if (you.legalBets.length > 0) {
    return bet(you, rng);
  }
  return null;
}

// Round 1: show the card that makes the best combination with the table when it is a pair or
// better; otherwise bluff-stay now and then with the highest card, else skip.
function decide(you: YouView, rng: Rng): Decision {
  const best = bestOption(you.options);
  if (best !== null && CATEGORY_RANK[best.combination.category] >= CATEGORY_RANK.pair) {
    return { kind: 'stay', show: best.card };
  }
  const highest = highestCard(you.hand);
  if (highest !== null && rng.next() < BLUFF_STAY_RATE) {
    return { kind: 'stay', show: highest };
  }
  return { kind: 'skip' };
}

// The Final: strength is the best three among the hand and the table, as the showdown scores it.
function bet(you: YouView, rng: Rng): BotMove | null {
  const legal = you.legalBets;
  const strength = you.best === null ? CATEGORY_RANK.high : CATEGORY_RANK[you.best.category];
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
