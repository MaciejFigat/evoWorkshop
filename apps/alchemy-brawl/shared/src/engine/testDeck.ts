import { fullDeck, sameCard, type Card, type Element } from '../cards.ts';

const ELEMENT_BY_LETTER: Record<string, Element> = { F: 'fire', W: 'water', E: 'earth', A: 'air' };

export function card(label: string): Card {
  const element = ELEMENT_BY_LETTER[label.slice(-1)];
  const power = Number(label.slice(0, -1));
  if (element === undefined || !Number.isInteger(power)) {
    throw new Error(`bad card label ${label}`);
  }
  return { element, power };
}

export function cards(labels: string): Card[] {
  return labels.split(' ').map(card);
}

// Lays cards in the engine's dealing order: three cards each round-robin, the two Round 1 table
// cards, one draw each in the same order, the three Final table cards, then the rest of the deck.
export function stackedDeck(
  order: number[],
  hands: Card[][],
  round1Table: Card[],
  draws: Card[][],
  finalTable: Card[],
): Card[] {
  const top: Card[] = [];
  const take = (from: Card[][], seat: number, k: number): void => {
    const next = from[seat]?.[k];
    if (next !== undefined) {
      top.push(next);
    }
  };
  for (let k = 0; k < 3; k += 1) {
    order.forEach((seat) => take(hands, seat, k));
  }
  top.push(...round1Table);
  order.forEach((seat) => take(draws, seat, 0));
  top.push(...finalTable);
  return [...top, ...fullDeck().filter((c) => !top.some((used) => sameCard(used, c)))];
}
