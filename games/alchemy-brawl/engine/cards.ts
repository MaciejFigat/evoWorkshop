export const ELEMENTS = ['fire', 'water', 'earth', 'air'] as const;
export type Element = (typeof ELEMENTS)[number];

export const MIN_POWER = 1;
export const MAX_POWER = 13;

export type Card = { element: Element; power: number };

const LETTER: Record<Element, string> = { fire: 'F', water: 'W', earth: 'E', air: 'A' };

export function cardLabel(card: Card): string {
  return `${card.power}${LETTER[card.element]}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.element === b.element && a.power === b.power;
}

export function fullDeck(): Card[] {
  return ELEMENTS.flatMap((element) =>
    Array.from({ length: MAX_POWER - MIN_POWER + 1 }, (_, i) => ({ element, power: MIN_POWER + i })),
  );
}
