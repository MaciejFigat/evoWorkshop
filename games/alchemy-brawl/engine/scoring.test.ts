import { describe, expect, it } from 'vitest';
import {
  FIVE_CARD_RANK,
  THREE_CARD_RANK,
  bestFive,
  compareCombinations,
  rankFive,
  rankThree,
  round1Combination,
  winnersOf,
} from './scoring.ts';
import { card, cards } from './testDeck.ts';
import { CATEGORIES, THREE_CARD_CATEGORIES } from './types.ts';

function rank(labels: string) {
  const [a, b, c] = cards(labels);
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error(`need three cards: ${labels}`);
  }
  return rankThree(a, b, c);
}

function rank5(labels: string) {
  const [a, b, c, d, e] = cards(labels);
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined) {
    throw new Error(`need five cards: ${labels}`);
  }
  return rankFive(a, b, c, d, e);
}

describe('rankThree', () => {
  it('ranks categories by their index in THREE_CARD_CATEGORIES', () => {
    THREE_CARD_CATEGORIES.forEach((category, i) => expect(THREE_CARD_RANK[category]).toBe(i));
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

describe('round1Combination', () => {
  it('uses the shown card with both table cards, shown card first', () => {
    expect(round1Combination(card('9A'), cards('10A 11E'))).toEqual({
      category: 'straight',
      cards: cards('9A 10A 11E'),
      key: [3, 11],
    });
    expect(round1Combination(card('12W'), cards('10A 11E'))).toMatchObject({ category: 'straight', key: [3, 12] });
    expect(round1Combination(card('3E'), cards('10A 11E'))).toMatchObject({ category: 'high', key: [0, 11, 10, 3] });
    expect(round1Combination(card('10F'), cards('10A 11E'))).toMatchObject({ category: 'pair', key: [1, 10, 11] });
  });

  it('falls back to a high card of the cards given with fewer than two table cards', () => {
    expect(round1Combination(card('9A'), [])).toEqual({ category: 'high', cards: cards('9A'), key: [0, 9] });
    expect(round1Combination(card('9A'), cards('11E'))).toEqual({ category: 'high', cards: cards('9A 11E'), key: [0, 11, 9] });
  });
});

describe('rankFive', () => {
  it('ranks categories by their index in CATEGORIES', () => {
    CATEGORIES.forEach((category, i) => expect(FIVE_CARD_RANK[category]).toBe(i));
  });

  it('names every category with its key and card order', () => {
    expect(rank5('5F 9F 6F 8F 7F')).toEqual({ category: 'straightFlush', cards: cards('9F 8F 7F 6F 5F'), key: [8, 9] });
    expect(rank5('3E 10F 10A 10W 10E')).toEqual({ category: 'four', cards: cards('10F 10A 10W 10E 3E'), key: [7, 10, 3] });
    expect(rank5('12W 10F 12F 10A 10W')).toEqual({
      category: 'fullHouse',
      cards: cards('10F 10A 10W 12W 12F'),
      key: [6, 10, 12],
    });
    expect(rank5('2A 9A 13A 5A 7A')).toEqual({ category: 'flush', cards: cards('13A 9A 7A 5A 2A'), key: [5, 13, 9, 7, 5, 2] });
    expect(rank5('9F 11E 13A 10A 12E')).toEqual({ category: 'straight', cards: cards('13A 12E 11E 10A 9F'), key: [4, 13] });
    expect(rank5('7E 10F 11E 10W 10A')).toEqual({ category: 'three', cards: cards('10F 10W 10A 11E 7E'), key: [3, 10, 11, 7] });
    expect(rank5('8W 10A 11A 11E 10W')).toEqual({
      category: 'twoPair',
      cards: cards('11A 11E 10A 10W 8W'),
      key: [2, 11, 10, 8],
    });
    expect(rank5('9A 10A 13E 11E 10W')).toEqual({
      category: 'pair',
      cards: cards('10A 10W 13E 11E 9A'),
      key: [1, 10, 13, 11, 9],
    });
    expect(rank5('3E 11E 10A 5F 13W')).toEqual({ category: 'high', cards: cards('13W 11E 10A 5F 3E'), key: [0, 13, 11, 10, 5, 3] });
  });

  it('breaks ties by kickers, card by card', () => {
    expect(compareCombinations(rank5('10A 10W 13E 11E 9A'), rank5('10F 10E 13A 11A 8W'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('10A 10W 13E 11E 9A'), rank5('11F 11W 2E 3A 4W'))).toBeLessThan(0);
    expect(compareCombinations(rank5('11A 11E 10A 10W 8W'), rank5('11F 11W 9A 9E 13W'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('11A 11E 10A 10W 8W'), rank5('11F 11W 10E 10F 9W'))).toBeLessThan(0);
    expect(compareCombinations(rank5('11A 11E 10A 10W 8W'), rank5('12F 12W 2E 2F 3W'))).toBeLessThan(0);
    expect(compareCombinations(rank5('10F 10A 10W 12W 12F'), rank5('12E 12A 11W 11F 11E'))).toBeLessThan(0);
    expect(compareCombinations(rank5('10F 10A 10W 12W 12F'), rank5('10F 10A 10W 9W 9F'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('10F 10A 10W 10E 3E'), rank5('10F 10A 10W 10E 2A'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('13A 9A 7A 5A 2A'), rank5('13F 9F 7F 4F 3F'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('13A 9A 7A 5A 2A'), rank5('13F 9F 7F 5F 3F'))).toBeLessThan(0);
    expect(compareCombinations(rank5('10F 10W 10A 11E 7E'), rank5('10F 10W 10A 11A 6E'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('13W 11E 10A 5F 3E'), rank5('13A 11W 10F 5E 2W'))).toBeGreaterThan(0);
  });

  it('keeps 1 low: 1-2-3-4-5 is a straight, 10-11-12-13-1 is not', () => {
    expect(rank5('3F 1W 5E 2A 4W')).toEqual({ category: 'straight', cards: cards('5E 4W 3F 2A 1W'), key: [4, 5] });
    expect(rank5('10F 11W 12E 13A 1W')).toEqual({
      category: 'high',
      cards: cards('13A 12E 11W 10F 1W'),
      key: [0, 13, 12, 11, 10, 1],
    });
    expect(rank5('10F 11F 12F 13F 1F')).toMatchObject({ category: 'flush', key: [5, 13, 12, 11, 10, 1] });
    expect(rank5('1F 2F 3F 4F 5F')).toMatchObject({ category: 'straightFlush', key: [8, 5] });
    expect(rank5('9F 10F 11F 12F 13F')).toMatchObject({ category: 'straightFlush', key: [8, 13] });
  });

  it('puts a flush above a straight and a full house above both', () => {
    expect(compareCombinations(rank5('2F 5F 7F 9F 13F'), rank5('9A 10W 11E 12E 13A'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('2F 2W 2E 3A 3F'), rank5('2F 5F 7F 9F 13F'))).toBeGreaterThan(0);
    expect(compareCombinations(rank5('9A 10W 11E 12E 13A'), rank5('13F 13W 13E 12A 11A'))).toBeGreaterThan(0);
  });

  it('ignores elements when powers are equal', () => {
    expect(compareCombinations(rank5('13A 9A 7A 5A 2A'), rank5('13F 9F 7F 5F 2F'))).toBe(0);
    expect(compareCombinations(rank5('9F 10W 11E 12E 13A'), rank5('9A 10A 11A 12F 13W'))).toBe(0);
    expect(compareCombinations(rank5('10A 10W 13E 11E 9A'), rank5('10F 10E 13A 11A 9W'))).toBe(0);
  });
});

describe('bestFive', () => {
  it('is null with fewer than five cards', () => {
    expect(bestFive([])).toBeNull();
    expect(bestFive(cards('5F 6F 7W 8E'))).toBeNull();
    expect(bestFive(cards('5F 6F 7W 8E 9A'))).toMatchObject({ category: 'straight', key: [4, 9] });
  });

  it('finds the best five of the four Appendix hands with the table 10A 11E 10W', () => {
    const table = cards('10A 11E 10W');
    expect(bestFive([...cards('3E 10F 12W 12F'), ...table])).toEqual({
      category: 'fullHouse',
      cards: cards('10F 10A 10W 12W 12F'),
      key: [6, 10, 12],
    });
    expect(bestFive([...cards('6W 13E 9A 7W'), ...table])).toEqual({
      category: 'pair',
      cards: cards('10A 10W 13E 11E 9A'),
      key: [1, 10, 13, 11, 9],
    });
    expect(bestFive([...cards('2F 11A 5W 8W'), ...table])).toEqual({
      category: 'twoPair',
      cards: cards('11A 11E 10A 10W 8W'),
      key: [2, 11, 10, 8],
    });
    expect(bestFive([...cards('7F 12E 13A 9F'), ...table])).toEqual({
      category: 'straight',
      cards: cards('13A 12E 11E 10A 9F'),
      key: [4, 13],
    });
  });

  it('prefers the flush to the straight and the higher kicker among seven cards', () => {
    expect(bestFive(cards('2F 5F 9A 10W 11F 12F 13F'))).toMatchObject({ category: 'flush', key: [5, 13, 12, 11, 5, 2] });
    expect(bestFive(cards('4W 4E 3F 6E 9A 10A 11E'))).toMatchObject({ category: 'pair', key: [1, 4, 11, 10, 9] });
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
