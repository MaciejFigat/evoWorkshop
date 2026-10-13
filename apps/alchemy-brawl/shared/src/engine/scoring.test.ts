import { describe, expect, it } from 'vitest';
import { compareReserves, recipesOf, resolveRound, stonePower } from './scoring.ts';
import { card, cards } from './testDeck.ts';

const casts = (labels: string) => cards(labels).map((c, seat) => ({ seat, card: c }));

describe('resolveRound', () => {
  it('burns equal powers regardless of element', () => {
    expect(resolveRound(casts('9F 9W 5E'), 'air')).toEqual({ burned: [0, 1], winner: 2 });
  });

  it('lets any Catalyst-element card beat every other element', () => {
    expect(resolveRound(casts('13A 2F 8W'), 'fire')).toEqual({ burned: [], winner: 1 });
  });

  it('applies collision before the Catalyst', () => {
    expect(resolveRound(casts('8F 8W 3E'), 'fire')).toEqual({ burned: [0, 1], winner: 2 });
  });

  it('has no winner when everything burns', () => {
    expect(resolveRound(casts('4F 4W 4E 4A'), 'air')).toEqual({ burned: [0, 1, 2, 3], winner: null });
  });
});

describe('recipesOf', () => {
  it('finds Essence', () => {
    expect(recipesOf(cards('6F 8F 4F'))).toEqual(['essence']);
  });

  it('finds a Chain Reaction in any order and any elements', () => {
    expect(recipesOf(cards('11W 13A 12W'))).toEqual(['chain']);
  });

  it('does not wrap a chain around', () => {
    expect(recipesOf(cards('12F 13W 1E'))).toEqual([]);
  });

  it('counts a same-element chain twice', () => {
    expect(recipesOf(cards('4E 5E 6E'))).toEqual(['essence', 'chain']);
  });

  it('needs all three casts', () => {
    expect(recipesOf(cards('4E 5E'))).toEqual([]);
  });
});

describe('compareReserves', () => {
  it('compares the highest card first', () => {
    expect(compareReserves(cards('13F 7W 3E'), cards('12F 12W 5E'))).toBeGreaterThan(0);
  });

  it('falls through to the second card', () => {
    expect(compareReserves(cards('12A 7W 3E'), cards('12F 12W 5E'))).toBeLessThan(0);
  });

  it('ignores elements', () => {
    expect(compareReserves(cards('9F 5W 2E'), cards('9A 5E 2W'))).toBe(0);
  });
});

describe('stonePower', () => {
  it('detects four of one power among the six cards', () => {
    expect(stonePower([...cards('9F 9W 9E 9A 1F'), card('2W')])).toBe(9);
    expect(stonePower(cards('9F 9W 9E 8A 1F 2W'))).toBeNull();
  });
});
