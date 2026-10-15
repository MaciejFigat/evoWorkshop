import type { Card, Category, Combination, FinalResult, HandView, Round1Result, TableView } from '@evo/alchemy-brawl/engine';

export type NameOf = (seat: number) => string;

const CATEGORY_NAME: Record<Category, string> = {
  high: 'high card',
  pair: 'pair',
  twoPair: 'two pair',
  three: 'three of a kind',
  straight: 'straight',
  flush: 'flush',
  fullHouse: 'full house',
  four: 'four of a kind',
  straightFlush: 'straight flush',
};

export function elementName(card: Card): string {
  return card.element.charAt(0).toUpperCase() + card.element.slice(1);
}

export function cardName(card: Card): string {
  return `${card.power} ${elementName(card)}`;
}

function powersHighFirst(combination: Combination): string {
  return combination.cards
    .map((card) => card.power)
    .sort((a, b) => b - a)
    .join('-');
}

// 'pair of 10s', 'straight 13-12-11-10-9', 'fire flush 10-6-3', 'full house, 10s full of 12s': what the
// player reads on a card option or a result line. key[1] is the power of the main group, key[2] of the
// second one, in both the three-card and the five-card ranking (spec §5).
export function describeCombination(combination: Combination): string {
  const [first] = combination.cards;
  const element = first?.element ?? '';
  const groupPower = combination.key[1] ?? 0;
  const secondPower = combination.key[2] ?? 0;
  switch (combination.category) {
    case 'high':
      return `high card ${powersHighFirst(combination)}`;
    case 'pair':
      return `pair of ${groupPower}s`;
    case 'twoPair':
      return `two pair, ${groupPower}s and ${secondPower}s`;
    case 'three':
      return `three ${groupPower}s`;
    case 'straight':
      return `straight ${powersHighFirst(combination)}`;
    case 'flush':
      return `${element} flush ${powersHighFirst(combination)}`;
    case 'fullHouse':
      return `full house, ${groupPower}s full of ${secondPower}s`;
    case 'four':
      return `four ${groupPower}s`;
    case 'straightFlush':
      return `${element} straight flush ${powersHighFirst(combination)}`;
  }
}

export function categoryName(category: Category): string {
  return CATEGORY_NAME[category];
}

export function nameResolver(table: TableView, hand: HandView): NameOf {
  return (seat) => {
    const id = hand.players[seat]?.id;
    return table.seats.find((s) => s.id === id)?.name ?? `Seat ${seat + 1}`;
  };
}

function list(names: string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export function round1Text(result: Round1Result, nameOf: NameOf): string {
  if (result.rolledOver) {
    return `Nobody stayed: ${result.pot} rolls into the Final.`;
  }
  const shown = result.shown.map((entry) => `${nameOf(entry.seat)} shows ${cardName(entry.card)}`).join(', ');
  const winners = list(result.winners.map((seat) => `${nameOf(seat)} +${result.payouts[seat] ?? 0}`));
  if (result.combinations.length === 0) {
    return `${shown}. ${winners}, nobody else stayed.`;
  }
  const combos = result.combinations
    .map((entry) => `${nameOf(entry.seat)}: ${describeCombination(entry.combination)}`)
    .join(' · ');
  return `${shown}. ${combos}. ${result.winners.length > 1 ? 'Split: ' : ''}${winners}.`;
}

export function finalText(result: FinalResult, nameOf: NameOf): string {
  const winners = list(result.winners.map((seat) => `${nameOf(seat)} +${result.payouts[seat] ?? 0}`));
  if (result.reason === 'fold') {
    return `${winners}: everyone else folded.`;
  }
  const combos = result.combinations
    .map((entry) => `${nameOf(entry.seat)}: ${describeCombination(entry.combination)}`)
    .join(' · ');
  return `${combos}. ${result.winners.length > 1 ? 'Split: ' : ''}${winners}.`;
}
