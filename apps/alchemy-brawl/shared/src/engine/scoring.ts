import type { Card, Element } from '../cards.ts';
import type { Recipe, SeatCard } from './types.ts';

export type RoundOutcome = { burned: number[]; winner: number | null };

// Collision comes before the Catalyst: a burned Catalyst-element card cannot win.
export function resolveRound(casts: SeatCard[], catalyst: Element): RoundOutcome {
  const counts = new Map<number, number>();
  for (const { card } of casts) {
    counts.set(card.power, (counts.get(card.power) ?? 0) + 1);
  }
  const burned = casts.filter(({ card }) => (counts.get(card.power) ?? 0) > 1).map(({ seat }) => seat);
  const survivors = casts.filter(({ card }) => counts.get(card.power) === 1);
  const dominant = survivors.filter(({ card }) => card.element === catalyst);
  const candidates = dominant.length > 0 ? dominant : survivors;
  let winner: SeatCard | null = null;
  for (const cast of candidates) {
    if (winner === null || cast.card.power > winner.card.power) {
      winner = cast;
    }
  }
  return { burned, winner: winner === null ? null : winner.seat };
}

export function recipesOf(casts: Card[]): Recipe[] {
  const [a, b, c] = casts;
  if (a === undefined || b === undefined || c === undefined || casts.length !== 3) {
    return [];
  }
  const recipes: Recipe[] = [];
  if (a.element === b.element && b.element === c.element) {
    recipes.push('essence');
  }
  const [low, mid, high] = [a.power, b.power, c.power].sort((x, y) => x - y);
  if (low !== undefined && mid !== undefined && high !== undefined && mid === low + 1 && high === mid + 1) {
    recipes.push('chain');
  }
  return recipes;
}

export function reserveKey(reserve: Card[]): number[] {
  return reserve.map((card) => card.power).sort((x, y) => y - x);
}

// Like poker kickers: highest card first, then the second, then the third.
export function compareReserves(a: Card[], b: Card[]): number {
  const ka = reserveKey(a);
  const kb = reserveKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i += 1) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function stonePower(received: Card[]): number | null {
  const counts = new Map<number, number>();
  for (const card of received) {
    counts.set(card.power, (counts.get(card.power) ?? 0) + 1);
  }
  for (const [power, count] of counts) {
    if (count === 4) {
      return power;
    }
  }
  return null;
}
