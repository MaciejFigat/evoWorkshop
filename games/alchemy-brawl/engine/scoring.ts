import type { Card } from './cards.ts';
import type { Category, Combination, SeatCombination } from './types.ts';

// Index of each category in CATEGORIES: the first entry of a combination key.
export const CATEGORY_RANK: Record<Category, number> = {
  high: 0,
  pair: 1,
  flush: 2,
  straight: 3,
  three: 4,
  straightFlush: 5,
};

function make(category: Category, cards: Card[], tiebreak: number[]): Combination {
  return { category, cards, key: [CATEGORY_RANK[category], ...tiebreak] };
}

// Three-card poker (spec §5). Powers 1..13 with no wrap; elements have no order.
export function rankThree(a: Card, b: Card, c: Card): Combination {
  const cards = [a, b, c];
  const [p0 = 0, p1 = 0, p2 = 0] = [a.power, b.power, c.power].sort((x, y) => y - x);
  const flush = a.element === b.element && b.element === c.element;
  const straight = p0 === p1 + 1 && p1 === p2 + 1;
  if (straight && flush) {
    return make('straightFlush', cards, [p0]);
  }
  if (p0 === p1 && p1 === p2) {
    return make('three', cards, [p0]);
  }
  if (straight) {
    return make('straight', cards, [p0]);
  }
  if (flush) {
    return make('flush', cards, [p0, p1, p2]);
  }
  if (p0 === p1) {
    return make('pair', cards, [p0, p2]);
  }
  if (p1 === p2) {
    return make('pair', cards, [p1, p0]);
  }
  return make('high', cards, [p0, p1, p2]);
}

// The cast with the best two of the table cards.
export function bestCombination(cast: Card, table: Card[]): Combination {
  let best: Combination | null = null;
  for (let i = 0; i < table.length; i += 1) {
    for (let j = i + 1; j < table.length; j += 1) {
      const first = table[i];
      const second = table[j];
      if (first === undefined || second === undefined) {
        continue;
      }
      const candidate = rankThree(cast, first, second);
      if (best === null || compareCombinations(candidate, best) > 0) {
        best = candidate;
      }
    }
  }
  return best ?? make('high', [cast], [cast.power]);
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
