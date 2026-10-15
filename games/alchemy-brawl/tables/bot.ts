import {
  CATEGORY_RANK,
  compareCombinations,
  type BetAction,
  type BetOptions,
  type Card,
  type CardOption,
  type Decision,
  type HandView,
  type YouView,
} from '@evo/alchemy-brawl/engine';
import type { Rng } from '@evo/rng';

export type BotMove = { type: 'decide'; decision: Decision } | { type: 'bet'; action: BetAction };

const BLUFF_STAY_RATE = 0.2;
const MEDIUM_RAISE_RATE = 0.3;
const MEDIUM_FOLD_RATE = 0.3;
const MEDIUM_CALL_SHARE = 0.2;
const WEAK_CALL_RATE = 0.3;
const WEAK_CALL_SHARE = 0.1;

// Sees exactly what a human in the same seat sees: the bot plays from the view, never from hand state.
export function chooseBotMove(view: HandView, rng: Rng): BotMove | null {
  const you = view.you;
  if (you === null) {
    return null;
  }
  if (you.canDecide) {
    return { type: 'decide', decision: decide(you, rng) };
  }
  if (you.bet !== null) {
    const spot: Spot = { stack: view.players[you.seat]?.stack ?? 0, level: view.betting?.level ?? 0, pot: view.finalPot };
    return { type: 'bet', action: bet(you, you.bet, spot, rng) };
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

type Spot = { stack: number; level: number; pot: number };

// The Final: strength is the best three among the hand and the table, as the showdown scores it.
// A strong hand raises the pot, a medium one raises the minimum now and then and calls cheap
// bets, a weak one checks or folds. The options already cap every amount by the stack.
function bet(you: YouView, options: BetOptions, spot: Spot, rng: Rng): BetAction {
  const strength = you.best === null ? CATEGORY_RANK.high : CATEGORY_RANK[you.best.category];
  const stayIn: BetAction = options.canCheck ? { kind: 'check' } : { kind: 'call' };
  if (strength >= CATEGORY_RANK.straight) {
    if (options.raise !== null) {
      return { kind: 'raise', to: Math.min(options.raise.max, Math.max(options.raise.min, spot.level + spot.pot)) };
    }
    return stayIn;
  }
  if (strength >= CATEGORY_RANK.pair) {
    if (options.raise !== null && rng.next() < MEDIUM_RAISE_RATE) {
      return { kind: 'raise', to: options.raise.min };
    }
    if (options.canCheck || options.call <= spot.stack * MEDIUM_CALL_SHARE) {
      return stayIn;
    }
    return rng.next() < MEDIUM_FOLD_RATE ? { kind: 'fold' } : { kind: 'call' };
  }
  if (options.canCheck) {
    return { kind: 'check' };
  }
  return options.call <= spot.stack * WEAK_CALL_SHARE && rng.next() < WEAK_CALL_RATE ? { kind: 'call' } : { kind: 'fold' };
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
