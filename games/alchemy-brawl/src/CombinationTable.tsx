import { bestCombination, compareCombinations, sameCard, type Card, type Category, type Combination, type HandView } from '@evo/alchemy-brawl/engine';
import { CardRow } from './MiniCard';
import type { Selection } from './selection';

const card = (element: Card['element'], power: number): Card => ({ element, power });

// Best first, as the player reads it; the engine's CATEGORIES run the other way. The example
// shows the pattern: same element for a flush, consecutive powers for a straight.
const ROWS: { category: Category; name: string; example: Card[] }[] = [
  { category: 'straightFlush', name: 'Straight flush', example: [card('fire', 7), card('fire', 8), card('fire', 9)] },
  { category: 'three', name: 'Three of a kind', example: [card('fire', 5), card('water', 5), card('earth', 5)] },
  { category: 'straight', name: 'Straight', example: [card('earth', 4), card('air', 5), card('water', 6)] },
  { category: 'flush', name: 'Flush', example: [card('water', 2), card('water', 7), card('water', 11)] },
  { category: 'pair', name: 'Pair', example: [card('fire', 9), card('earth', 9), card('air', 4)] },
  { category: 'high', name: 'High card', example: [card('air', 2), card('earth', 7), card('fire', 12)] },
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
          const live = active !== null && active.category === row.category;
          return (
            <tr key={row.category} className={live ? 'active' : ''}>
              <th>{row.name}</th>
              <td>
                <CardRow cards={live ? active.cards : row.example} size="sm" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
