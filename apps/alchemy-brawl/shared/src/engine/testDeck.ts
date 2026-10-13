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

// Stacks the deck in dealing order: three initial cards round-robin, then per round one draw each
// and the Catalyst. A player with fewer than six cards has folded and skips the later draws.
export function stackedDeck(order: number[], received: Card[][], catalysts: Card[]): Card[] {
  const top: Card[] = [];
  const take = (seat: number, k: number): void => {
    const next = received[seat]?.[k];
    if (next !== undefined) {
      top.push(next);
    }
  };
  for (let k = 0; k < 3; k += 1) {
    order.forEach((seat) => take(seat, k));
  }
  catalysts.forEach((catalyst, round) => {
    order.forEach((seat) => take(seat, 3 + round));
    top.push(catalyst);
  });
  return [...top, ...fullDeck().filter((c) => !top.some((used) => sameCard(used, c)))];
}
