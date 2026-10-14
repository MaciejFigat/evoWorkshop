import { describe, expect, it } from 'vitest';
import { CATEGORY_RANK, bestCombination, compareCombinations, rankThree, winnersOf } from './scoring.ts';
import { card, cards } from './testDeck.ts';
import { CATEGORIES } from './types.ts';

function rank(labels: string) {
  const [a, b, c] = cards(labels);
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error(`need three cards: ${labels}`);
  }
  return rankThree(a, b, c);
}

describe('rankThree', () => {
  it('ranks categories by their index in CATEGORIES', () => {
    CATEGORIES.forEach((category, i) => expect(CATEGORY_RANK[category]).toBe(i));
  });

  it('names every category with its key, cast first', () => {
    expect(rank('5F 6F 7F')).toMatchObject({ category: 'straightFlush', key: [5, 7] });
    expect(rank('9W 9F 9A')).toMatchObject({ category: 'three', key: [4, 9] });
    expect(rank('9A 10A 11E')).toMatchObject({ category: 'straight', key: [3, 11] });
    expect(rank('10F 3F 6F')).toMatchObject({ category: 'flush', key: [2, 10, 6, 3] });
    expect(rank('4W 4E 11A')).toMatchObject({ category: 'pair', key: [1, 4, 11] });
    expect(rank('11A 4W 4E')).toMatchObject({ category: 'pair', key: [1, 4, 11] });
    expect(rank('3E 10A 11E')).toMatchObject({ category: 'high', key: [0, 11, 10, 3] });
    expect(rank('3E 10A 11E').cards).toEqual(cards('3E 10A 11E'));
  });

  it('puts a straight above a flush', () => {
    expect(compareCombinations(rank('1W 2F 3E'), rank('13F 12F 2F'))).toBeGreaterThan(0);
  });

  it('does not wrap: 12-13-1 is a high card, 1-2-3 is a straight', () => {
    expect(rank('12F 13W 1E').category).toBe('high');
    expect(rank('1F 2W 3E').category).toBe('straight');
    expect(rank('11F 12F 13F').category).toBe('straightFlush');
  });

  it('compares equal combinations as 0 regardless of element', () => {
    expect(compareCombinations(rank('7F 6F 3F'), rank('7W 6W 3W'))).toBe(0);
    expect(compareCombinations(rank('9A 10A 11E'), rank('9F 10W 11E'))).toBe(0);
    expect(compareCombinations(rank('10F 6F 3F'), rank('7F 6F 3F'))).toBeGreaterThan(0);
    expect(compareCombinations(rank('4W 4E 11A'), rank('4W 4E 12A'))).toBeLessThan(0);
  });
});

describe('bestCombination', () => {
  it('uses both cards of a two-card table', () => {
    expect(bestCombination(card('9A'), cards('10A 11E'))).toMatchObject({ category: 'straight', key: [3, 11] });
  });

  it('picks the best pair of three table cards', () => {
    const best = bestCombination(card('10F'), cards('3F 6F 9E'));
    expect(best).toMatchObject({ category: 'flush', key: [2, 10, 6, 3] });
    expect(best.cards).toEqual(cards('10F 3F 6F'));
    expect(bestCombination(card('6W'), cards('3F 6F 9E'))).toMatchObject({ category: 'pair', key: [1, 6, 9] });
    expect(bestCombination(card('8W'), cards('7F 9F 8E'))).toMatchObject({ category: 'straight', key: [3, 9] });
  });
});

describe('winnersOf', () => {
  it('returns every tied seat in input order', () => {
    const winners = winnersOf([
      { seat: 2, combination: rank('7W 6F 3F') },
      { seat: 0, combination: rank('7F 6F 3F') },
      { seat: 1, combination: rank('7A 6A 3A') },
    ]);
    expect(winners).toEqual([0, 1]);
    expect(winnersOf([])).toEqual([]);
  });
});
