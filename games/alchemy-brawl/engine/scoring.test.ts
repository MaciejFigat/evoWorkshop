import { describe, expect, it } from 'vitest';
import { CATEGORY_RANK, bestCombination, bestOfCards, compareCombinations, rankThree, winnersOf } from './scoring.ts';
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

  it('names every category with its key, own card first', () => {
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
  it('uses both cards of a two-card table, shown card first', () => {
    expect(bestCombination(card('9A'), cards('10A 11E'))).toEqual({
      category: 'straight',
      cards: cards('9A 10A 11E'),
      key: [3, 11],
    });
    expect(bestCombination(card('12W'), cards('10A 11E'))).toMatchObject({ category: 'straight', key: [3, 12] });
    expect(bestCombination(card('3E'), cards('10A 11E'))).toMatchObject({ category: 'high', key: [0, 11, 10, 3] });
  });

  it('picks the best pair of three table cards', () => {
    const best = bestCombination(card('10F'), cards('3F 6F 9E'));
    expect(best).toMatchObject({ category: 'flush', key: [2, 10, 6, 3] });
    expect(best.cards).toEqual(cards('10F 3F 6F'));
    expect(bestCombination(card('6W'), cards('3F 6F 9E'))).toMatchObject({ category: 'pair', key: [1, 6, 9] });
    expect(bestCombination(card('8W'), cards('7F 9F 8E'))).toMatchObject({ category: 'straight', key: [3, 9] });
  });
});

describe('bestOfCards', () => {
  it('takes the best three of any count, highest power first', () => {
    const boris = bestOfCards(cards('10F 12W 5F 3F 6F 9E'));
    expect(boris).toMatchObject({ category: 'flush', key: [2, 10, 6, 5] });
    expect(boris?.cards).toEqual(cards('10F 6F 5F'));
    expect(bestOfCards(cards('7F 12E 13A 1W 3F 6F 9E'))).toMatchObject({ category: 'flush', key: [2, 7, 6, 3] });
    expect(bestOfCards(cards('6W 13E 7W 3F 6F 9E'))).toMatchObject({ category: 'pair', key: [1, 6, 13] });
    expect(bestOfCards(cards('2F 11A 5W 8W 3F 6F 9E'))).toMatchObject({ category: 'flush', key: [2, 6, 3, 2] });
  });

  it('lets the board play and prefers a straight to a flush', () => {
    expect(bestOfCards(cards('1W 2A 9E 2E 5F 6F 7F'))).toEqual({
      category: 'straightFlush',
      cards: cards('7F 6F 5F'),
      key: [5, 7],
    });
    expect(bestOfCards(cards('1F 3F 12F 2W 13W 8E'))).toMatchObject({ category: 'straight', key: [3, 3] });
  });

  it('is null with fewer than three cards', () => {
    expect(bestOfCards([])).toBeNull();
    expect(bestOfCards(cards('5F 6F'))).toBeNull();
    expect(bestOfCards(cards('5F 6F 7W'))).toMatchObject({ category: 'straight', cards: cards('7W 6F 5F') });
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
