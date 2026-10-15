import type { Card } from './cards.ts';
import type { Category, Combination, SeatCombination, ThreeCardCategory } from './types.ts';

// Index of each category in THREE_CARD_CATEGORIES: the first entry of a Round 1 combination key.
export const THREE_CARD_RANK: Record<ThreeCardCategory, number> = {
  high: 0,
  pair: 1,
  flush: 2,
  straight: 3,
  three: 4,
  straightFlush: 5,
};

// Index of each category in CATEGORIES: the first entry of a Final combination key.
export const FIVE_CARD_RANK: Record<Category, number> = {
  high: 0,
  pair: 1,
  twoPair: 2,
  three: 3,
  straight: 4,
  flush: 5,
  fullHouse: 6,
  four: 7,
  straightFlush: 8,
};

function makeThree(category: ThreeCardCategory, cards: Card[], tiebreak: number[]): Combination {
  return { category, cards, key: [THREE_CARD_RANK[category], ...tiebreak] };
}

function makeFive(category: Category, cards: Card[], tiebreak: number[]): Combination {
  return { category, cards, key: [FIVE_CARD_RANK[category], ...tiebreak] };
}

// Three-card poker (spec §5.1). Powers 1..13 with no wrap; elements have no order.
export function rankThree(a: Card, b: Card, c: Card): Combination {
  const cards = [a, b, c];
  const [p0 = 0, p1 = 0, p2 = 0] = [a.power, b.power, c.power].sort((x, y) => y - x);
  const flush = a.element === b.element && b.element === c.element;
  const straight = p0 === p1 + 1 && p1 === p2 + 1;
  if (straight && flush) {
    return makeThree('straightFlush', cards, [p0]);
  }
  if (p0 === p1 && p1 === p2) {
    return makeThree('three', cards, [p0]);
  }
  if (straight) {
    return makeThree('straight', cards, [p0]);
  }
  if (flush) {
    return makeThree('flush', cards, [p0, p1, p2]);
  }
  if (p0 === p1) {
    return makeThree('pair', cards, [p0, p2]);
  }
  if (p1 === p2) {
    return makeThree('pair', cards, [p1, p0]);
  }
  return makeThree('high', cards, [p0, p1, p2]);
}

type Group = { power: number; count: number };

// Five-card poker (spec §5.2). Powers 1..13 with no wrap, 1 always low; elements have no order.
export function rankFive(a: Card, b: Card, c: Card, d: Card, e: Card): Combination {
  const input = [a, b, c, d, e];
  const byPower = [...input].sort((x, y) => y.power - x.power);
  const powers = byPower.map((card) => card.power);
  const flush = input.every((card) => card.element === a.element);

  const counts = new Map<number, number>();
  for (const card of input) {
    counts.set(card.power, (counts.get(card.power) ?? 0) + 1);
  }
  // Larger groups first, then higher power: the group powers in this order are exactly the tiebreak.
  const groups: Group[] = [...counts.entries()]
    .map(([power, count]) => ({ power, count }))
    .sort((x, y) => y.count - x.count || y.power - x.power);
  const groupPowers = groups.map((group) => group.power);
  const grouped = groups.flatMap((group) => byPower.filter((card) => card.power === group.power));
  const first = groups[0]?.count ?? 0;
  const second = groups[1]?.count ?? 0;

  const high = powers[0] ?? 0;
  const low = powers[4] ?? 0;
  const straight = groups.length === 5 && high - low === 4;

  if (straight && flush) {
    return makeFive('straightFlush', byPower, [high]);
  }
  if (first === 4) {
    return makeFive('four', grouped, groupPowers);
  }
  if (first === 3 && second === 2) {
    return makeFive('fullHouse', grouped, groupPowers);
  }
  if (flush) {
    return makeFive('flush', byPower, powers);
  }
  if (straight) {
    return makeFive('straight', byPower, [high]);
  }
  if (first === 3) {
    return makeFive('three', grouped, groupPowers);
  }
  if (first === 2 && second === 2) {
    return makeFive('twoPair', grouped, groupPowers);
  }
  if (first === 2) {
    return makeFive('pair', grouped, groupPowers);
  }
  return makeFive('high', byPower, powers);
}

// Round 1: the shown card with the two table cards, shown card first. With fewer than two table cards
// (never in play) it falls back to a high card of the cards given.
export function round1Combination(shown: Card, table: Card[]): Combination {
  const [first, second] = table;
  if (first === undefined || second === undefined) {
    const cards = [shown, ...table];
    return makeThree(
      'high',
      cards,
      cards.map((card) => card.power).sort((x, y) => y - x),
    );
  }
  return rankThree(shown, first, second);
}

// The Final: the best five cards among everything the player can use, hand and table together
// (C(7,5) = 21 subsets in play). Null with fewer than five cards.
export function bestFive(cards: Card[]): Combination | null {
  let best: Combination | null = null;
  const n = cards.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        for (let l = k + 1; l < n; l += 1) {
          for (let m = l + 1; m < n; m += 1) {
            const a = cards[i];
            const b = cards[j];
            const c = cards[k];
            const d = cards[l];
            const e = cards[m];
            if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined) {
              continue;
            }
            const candidate = rankFive(a, b, c, d, e);
            if (best === null || compareCombinations(candidate, best) > 0) {
              best = candidate;
            }
          }
        }
      }
    }
  }
  return best;
}

// Positive when a beats b, zero when they split.
export function compareCombinations(a: Combination, b: Combination): number {
  const length = Math.max(a.key.length, b.key.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a.key[i] ?? 0) - (b.key[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function winnersOf(entries: SeatCombination[]): number[] {
  let best: Combination | null = null;
  for (const entry of entries) {
    if (best === null || compareCombinations(entry.combination, best) > 0) {
      best = entry.combination;
    }
  }
  const top = best;
  return top === null
    ? []
    : entries.filter((entry) => compareCombinations(entry.combination, top) === 0).map((entry) => entry.seat);
}
