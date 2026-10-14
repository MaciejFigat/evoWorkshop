import { bestCombination, compareCombinations, sameCard, type Card, type Category, type Combination, type HandView } from '@evo/alchemy-brawl/engine';
import type { Selection } from './selection';
import { cardName } from './text';

// Best first, as the player reads it; the engine's CATEGORIES run the other way.
const ROWS: { category: Category; name: string; rule: string }[] = [
  { category: 'straightFlush', name: 'Straight flush', rule: 'three consecutive powers of one element' },
  { category: 'three', name: 'Three of a kind', rule: 'three of one power' },
  { category: 'straight', name: 'Straight', rule: 'three consecutive powers' },
  { category: 'flush', name: 'Flush', rule: 'three of one element' },
  { category: 'pair', name: 'Pair', rule: 'two of one power' },
  { category: 'high', name: 'High card', rule: 'none of the above' },
];

function optionCombination(hand: HandView, card: Card | null): Combination | null {
  if (card === null) {
    return null;
  }
  return hand.you?.options.find((entry) => sameCard(entry.card, card))?.combination ?? null;
}

function bestOption(hand: HandView): Combination | null {
  let best: Combination | null = null;
  for (const { combination } of hand.you?.options ?? []) {
    if (best === null || compareCombinations(combination, best) > 0) {
      best = combination;
    }
  }
  return best;
}

// The row that is live right now: in Round 1 the card you show (locked, picked, else your best
// option); after Round 1 your shown card's combination if you stayed; in the Final your best three
// cards among the hand and the table.
export function activeCombination(hand: HandView, picked: Selection): Combination | null {
  const you = hand.you;
  if (you === null) {
    return null;
  }
  switch (hand.phase) {
    case 'decide': {
      const decision = you.decision;
      if (decision !== null) {
        return decision.kind === 'stay' ? bestCombination(decision.show, hand.table) : null;
      }
      return optionCombination(hand, picked.show) ?? bestOption(hand);
    }
    case 'round1End': {
      const shown = hand.players[you.seat]?.shown ?? null;
      if (shown === null) {
        return null;
      }
      return hand.round1?.combinations.find((entry) => entry.seat === you.seat)?.combination ?? bestCombination(shown, hand.table);
    }
    case 'bet':
    case 'reveal':
      return you.best;
    case 'done':
      return hand.final?.combinations.find((entry) => entry.seat === you.seat)?.combination ?? you.best;
  }
}

export function CombinationTable({ active }: { active: Combination | null }) {
  return (
    <table className="combos">
      <tbody>
        {ROWS.map((row) => {
          const cards = active !== null && active.category === row.category ? active.cards.map(cardName).join(' · ') : null;
          return (
            <tr key={row.category} className={cards === null ? '' : 'active'}>
              <th>{row.name}</th>
              <td>{cards ?? row.rule}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
